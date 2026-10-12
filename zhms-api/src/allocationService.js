import { badRequest, notFound, conflict } from './errors.js';
import { audit } from './db.js';
import { enqueueMessage, usd } from './messaging.js';
import { numericToCents } from './money.js';
import { todayHarare } from './dates.js';

export class AllocationService {
  constructor(db) {
    this.db = db;
  }

  async reserveStand({ applicationId, parcelId, idempotencyKey, reservedBy, queueOverrideReason = null }) {
    if (!idempotencyKey) throw badRequest('IDEMPOTENCY_KEY_REQUIRED', 'Reservation requires an idempotency key');

    return this.db.tx(async (client) => {
      // 1. Check idempotency
      const existing = await client.query('SELECT * FROM allocations WHERE idempotency_key = $1', [idempotencyKey]);
      if (existing.rows.length > 0) return existing.rows[0];

      // 2. Fetch and lock application
      const appRes = await client.query(
        'SELECT * FROM applications WHERE application_id = $1 FOR UPDATE',
        [applicationId]
      );
      if (appRes.rows.length === 0) throw notFound('Application');
      const app = appRes.rows[0];

      if (app.status !== 'APPROVED') {
        throw conflict('APPLICATION_NOT_APPROVED', `Application must be APPROVED before reserving a stand (status: ${app.status})`);
      }

      // 3. Lock stand and ensure AVAILABLE
      const standRes = await client.query(
        'SELECT * FROM la_spatial_unit WHERE parcel_id = $1 FOR UPDATE',
        [parcelId]
      );
      if (standRes.rows.length === 0) throw notFound('Stand');
      const stand = standRes.rows[0];

      if (stand.status !== 'AVAILABLE') {
        throw conflict('STAND_NOT_AVAILABLE', `Stand ${stand.stand_number} is ${stand.status}, not AVAILABLE`);
      }

      // Quota-reserved stands (e.g. the youth share of a scheme) go only to applicants in that category.
      if (stand.quota_category !== 'GENERAL' && stand.quota_category !== app.quota_category) {
        throw conflict('QUOTA_MISMATCH',
          `Stand ${stand.stand_number} is reserved for the ${stand.quota_category} quota; this application is ${app.quota_category}`);
      }

      // 4. Verify queue order (First Come First Served)
      if (!queueOverrideReason) {
        const earlierRes = await client.query(
          `SELECT application_id FROM applications
           WHERE status = 'APPROVED' AND first_submitted_at < $1
           LIMIT 1`,
          [app.first_submitted_at]
        );
        if (earlierRes.rows.length > 0) {
          throw conflict('QUEUE_ORDER_VIOLATION', 'There are earlier approved applicants in the queue awaiting allocation');
        }
      }

      // 5. Compute 50% deposit and 7-day reservation window
      const { rows: cfgRows } = await client.query('SELECT key, value FROM app_config');
      const cfg = Object.fromEntries(cfgRows.map(r => [r.key, r.value]));
      const depositPct = Number(cfg.deposit_percent || 50);
      const resDays = Number(cfg.reservation_days || 7);

      const totalPrice = parseFloat(stand.price_usd);
      const depositRequired = (totalPrice * depositPct) / 100.0;

      // 6. Insert allocation (triggers assert_stand_available & sync_stand_status)
      const allocRes = await client.query(
        `INSERT INTO allocations (
          application_id, subject_id, parcel_id, status,
          total_price_usd, deposit_required_usd,
          reserved_at, reservation_expires_at,
          idempotency_key, reserved_by, queue_override_reason
        ) VALUES (
          $1, $2, $3, 'RESERVED',
          $4, $5,
          now(), now() + ($6 || ' days')::interval,
          $7, $8, $9
        ) RETURNING *`,
        [
          applicationId, app.subject_id, parcelId,
          totalPrice, depositRequired,
          resDays,
          idempotencyKey, reservedBy, queueOverrideReason
        ]
      );
      const alloc = allocRes.rows[0];

      // 7. Update application status to RESERVED
      await client.query('UPDATE applications SET status = \'RESERVED\', updated_at = now() WHERE application_id = $1', [applicationId]);

      // 8. Tell the buyer what to pay, by when, and the reference that makes the payment match automatically
      const { rows: [party] } = await client.query('SELECT first_name FROM la_party WHERE subject_id = $1', [app.subject_id]);
      await enqueueMessage(client, {
        subjectId: app.subject_id,
        template: 'RESERVATION_CONFIRMED',
        dedupeKey: `reservation:${alloc.allocation_id}`,
        params: {
          name: party.first_name,
          stand: stand.stand_number,
          deposit: usd(numericToCents(alloc.deposit_required_usd)),
          expires: todayHarare(alloc.reservation_expires_at),
          ref: alloc.account_ref,
        },
      });

      await audit(client, reservedBy, 'STAND_RESERVED', 'allocations', alloc.allocation_id, {
        parcelId,
        standNumber: stand.stand_number,
        totalPrice,
        depositRequired
      });

      return alloc;
    });
  }

  async releaseExpiredReservations() {
    return this.db.tx(async (client) => {
      const { rows: expired } = await client.query(
        `SELECT allocation_id, parcel_id, application_id 
         FROM allocations 
         WHERE status = 'RESERVED' AND reservation_expires_at < now()
         FOR UPDATE`
      );

      const releasedIds = [];
      for (const item of expired) {
        await client.query(
          `UPDATE allocations 
           SET status = 'EXPIRED', release_reason = '7-day deposit window elapsed without full 50% payment'
           WHERE allocation_id = $1`,
          [item.allocation_id]
        );
        await client.query('UPDATE applications SET status = \'EXPIRED\', updated_at = now() WHERE application_id = $1', [item.application_id]);
        await audit(client, 'SYSTEM_EXPIRY_WORKER', 'RESERVATION_EXPIRED', 'allocations', item.allocation_id, { parcelId: item.parcel_id });
        releasedIds.push(item.allocation_id);
      }

      return releasedIds;
    });
  }
}
