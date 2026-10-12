import { AppError, badRequest, notFound, conflict, forbidden, mapDbError } from './errors.js';
import { audit } from './db.js';
import { toCents, centsToNumeric } from './money.js';
import { PAYMENT_CHANNELS } from './paymentService.js';

const REF_RE = /^[A-Za-z0-9._\-/]{1,100}$/;

function parsePaidAt(value) {
  if (value === undefined || value === null || value === '') return new Date();
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw badRequest('INVALID_PAID_AT', 'paidAt must be an ISO-8601 timestamp');
  if (d.getTime() > Date.now() + 5 * 60_000) throw badRequest('INVALID_PAID_AT', 'paidAt cannot be in the future');
  return d;
}

function normaliseNotification({ channel, reference, currency = 'USD', amount }) {
  if (!PAYMENT_CHANNELS.includes(channel)) throw badRequest('INVALID_CHANNEL', `channel must be one of ${PAYMENT_CHANNELS.join(', ')}`);
  if (typeof reference !== 'string' || !REF_RE.test(reference.trim())) {
    throw badRequest('INVALID_REFERENCE', 'reference must be 1-100 letters, digits or . _ - /');
  }
  if (!['USD', 'ZWG'].includes(currency)) throw badRequest('INVALID_CURRENCY', 'currency must be USD or ZWG');
  return { channel, reference: reference.trim(), currency, amountCents: toCents(amount) };
}

/**
 * Inbound payment notifications. Gateway webhooks (already signature-checked by the route) and buyer
 * proof-of-payment uploads are stored in payment_inbox first. Matching webhooks become payments at once;
 * anything that cannot be applied safely stays PENDING_REVIEW for a finance officer.
 */
export class PaymentInboxService {
  constructor(db, paymentService) {
    this.db = db;
    this.payments = paymentService;
  }

  /** Gateway webhook. Idempotent on (channel, reference): retries return DUPLICATE. */
  async receiveWebhook(channel, body) {
    if (body?.status !== 'SUCCESS') return { outcome: 'IGNORED', reason: `status ${body?.status ?? 'missing'}` };
    const n = normaliseNotification({ channel, reference: body.reference, currency: body.currency, amount: body.amount });
    const paidAt = parsePaidAt(body.paidAt);
    const accountRef = typeof body.accountRef === 'string' ? body.accountRef.trim().toUpperCase() : null;

    return this.db.tx(async (client) => {
      const ins = await client.query(
        `INSERT INTO payment_inbox (source, channel, external_reference, account_ref, currency, amount, payer_phone,
                                    paid_at, submitted_by, status, raw)
         VALUES ('WEBHOOK', $1, $2, $3, $4, $5, $6, $7, $8, 'PENDING_REVIEW', $9)
         ON CONFLICT (channel, external_reference) DO NOTHING
         RETURNING inbox_id`,
        [n.channel, n.reference, accountRef, n.currency, centsToNumeric(n.amountCents),
          typeof body.payerPhone === 'string' ? body.payerPhone.slice(0, 30) : null, paidAt, `webhook:${channel}`,
          JSON.stringify(body)]);
      if (!ins.rows.length) return { outcome: 'DUPLICATE' };
      const inboxId = ins.rows[0].inbox_id;

      const { rows: [alloc] } = accountRef
        ? await client.query('SELECT allocation_id FROM allocations WHERE account_ref = $1', [accountRef])
        : { rows: [] };
      if (!alloc) return this.#holdForReview(client, inboxId, 'UNKNOWN_ACCOUNT_REF');
      await client.query('UPDATE payment_inbox SET allocation_id = $2 WHERE inbox_id = $1', [inboxId, alloc.allocation_id]);

      return this.#apply(client, inboxId, {
        allocationId: alloc.allocation_id,
        channel: n.channel,
        currency: n.currency,
        amountCents: n.amountCents,
        externalReference: n.reference,
        receivedAt: paidAt,
        recordedBy: `webhook:${channel}`,
      });
    });
  }

  /** A buyer uploads details of a payment they made; finance confirms it against the bank / EcoCash statement. */
  async submitProofOfPayment(userSub, body) {
    const n = normaliseNotification({ channel: body.channel, reference: body.reference, currency: body.currency, amount: body.amount });
    const paidAt = parsePaidAt(body.paidAt);
    return this.db.tx(async (client) => {
      const { rows: [own] } = await client.query(
        `SELECT a.allocation_id, a.account_ref FROM allocations a JOIN la_party p ON p.subject_id = a.subject_id
          WHERE a.allocation_id = $1 AND p.user_sub = $2`, [body.allocationId, userSub]);
      if (!own) throw forbidden('NOT_ALLOCATION_OWNER', 'You can only submit payments for your own stand');
      const { rows: [row] } = await client.query(
        `INSERT INTO payment_inbox (source, channel, external_reference, account_ref, allocation_id, currency, amount,
                                    paid_at, submitted_by, status, review_reason, raw)
         VALUES ('BUYER_POP', $1, $2, $3, $4, $5, $6, $7, $8, 'PENDING_REVIEW', 'AWAITING_FINANCE_CHECK', $9)
         RETURNING inbox_id, status, received_at`,
        [n.channel, n.reference, own.account_ref, own.allocation_id, n.currency, centsToNumeric(n.amountCents), paidAt,
          userSub, JSON.stringify({ note: typeof body.note === 'string' ? body.note.slice(0, 500) : null })]);
      await audit(client, userSub, 'PROOF_OF_PAYMENT_SUBMITTED', 'payment_inbox', row.inbox_id, {
        allocationId: own.allocation_id, channel: n.channel, reference: n.reference, currency: n.currency,
      });
      return row;
    });
  }

  /** Finance confirms a held item, optionally matching it to an allocation first. */
  async approve(inboxId, { allocationId = null } = {}, actor) {
    return this.db.tx(async (client) => {
      const item = await this.#lockPending(client, inboxId);
      const target = allocationId ?? item.allocation_id;
      if (!target) throw badRequest('ALLOCATION_REQUIRED', 'Choose the allocation this payment belongs to');
      const res = await this.payments.recordPaymentWith(client, {
        allocationId: target,
        channel: item.channel,
        currency: item.currency,
        amount: item.amount,
        externalReference: item.external_reference,
        receivedAt: item.paid_at ?? item.received_at,
        recordedBy: actor,
        notes: `Approved from payment inbox (${item.source})`,
      });
      await client.query(
        `UPDATE payment_inbox SET status = 'APPLIED', payment_id = $2, allocation_id = $3, resolved_by = $4, resolved_at = now()
          WHERE inbox_id = $1`, [inboxId, res.payment.payment_id, target, actor]);
      return { outcome: 'APPLIED', inboxId, ...res };
    });
  }

  async reject(inboxId, reason, actor) {
    if (typeof reason !== 'string' || reason.trim().length < 10) {
      throw badRequest('REASON_REQUIRED', 'Rejection requires a reason of at least 10 characters');
    }
    return this.db.tx(async (client) => {
      await this.#lockPending(client, inboxId);
      const { rows: [row] } = await client.query(
        `UPDATE payment_inbox SET status = 'REJECTED', review_reason = $2, resolved_by = $3, resolved_at = now()
          WHERE inbox_id = $1 RETURNING *`, [inboxId, reason.trim(), actor]);
      await audit(client, actor, 'INBOX_PAYMENT_REJECTED', 'payment_inbox', inboxId, { reason: reason.trim() });
      return row;
    });
  }

  async list(status = 'PENDING_REVIEW') {
    const { rows } = await this.db.query(
      `SELECT i.inbox_id, i.source, i.channel, i.external_reference, i.account_ref, i.allocation_id, i.currency, i.amount,
              i.payer_phone, i.paid_at, i.submitted_by, i.status, i.review_reason, i.payment_id, i.received_at,
              s.stand_number
         FROM payment_inbox i
         LEFT JOIN allocations a ON a.allocation_id = i.allocation_id
         LEFT JOIN la_spatial_unit s ON s.parcel_id = a.parcel_id
        WHERE i.status = $1
        ORDER BY i.received_at`, [status]);
    return rows;
  }

  // ------------------------------------------------------------------ ZiG exchange rates

  async recordFxRate({ unitsPerUsd, source }, actor) {
    const s = String(unitsPerUsd ?? '').trim();
    if (!/^\d{1,8}(\.\d{1,6})?$/.test(s) || Number(s) <= 0) {
      throw badRequest('INVALID_RATE', 'unitsPerUsd must be a positive number with up to 6 decimals');
    }
    if (typeof source !== 'string' || !source.trim()) throw badRequest('SOURCE_REQUIRED', 'State where the rate comes from (e.g. RBZ interbank)');
    return this.db.tx(async (client) => {
      const { rows: [rate] } = await client.query(
        `INSERT INTO fx_rates (currency, units_per_usd, source, recorded_by) VALUES ('ZWG', $1, $2, $3) RETURNING *`,
        [s, source.trim().slice(0, 200), actor]);
      await audit(client, actor, 'FX_RATE_RECORDED', 'fx_rates', rate.rate_id, { unitsPerUsd: s, source: rate.source });
      return rate;
    });
  }

  async latestFxRate() {
    const { rows } = await this.db.query(
      `SELECT * FROM fx_rates WHERE currency = 'ZWG' AND effective_at <= now()
        ORDER BY effective_at DESC, rate_id DESC LIMIT 1`);
    if (!rows.length) throw notFound('ZiG exchange rate');
    return rows[0];
  }

  // ------------------------------------------------------------------ internals

  async #lockPending(client, inboxId) {
    const { rows: [item] } = await client.query('SELECT * FROM payment_inbox WHERE inbox_id = $1 FOR UPDATE', [inboxId]);
    if (!item) throw notFound('Payment inbox item');
    if (item.status !== 'PENDING_REVIEW') throw conflict('INBOX_ALREADY_RESOLVED', `This item is already ${item.status}`);
    return item;
  }

  async #holdForReview(client, inboxId, reason) {
    await client.query('UPDATE payment_inbox SET review_reason = $2 WHERE inbox_id = $1', [inboxId, reason]);
    await audit(client, 'system', 'INBOX_PAYMENT_HELD', 'payment_inbox', inboxId, { reason });
    return { outcome: 'PENDING_REVIEW', reason, inboxId };
  }

  /** Applies inside a savepoint so a business rejection keeps the inbox row for finance to review. */
  async #apply(client, inboxId, { amountCents, currency, ...rest }) {
    await client.query('SAVEPOINT apply_payment');
    try {
      const res = await this.payments.recordPaymentWith(client, {
        ...rest,
        currency,
        amount: centsToNumeric(amountCents),
      });
      await client.query('RELEASE SAVEPOINT apply_payment');
      await client.query(
        `UPDATE payment_inbox SET status = 'APPLIED', payment_id = $2, review_reason = NULL, resolved_by = 'system', resolved_at = now()
          WHERE inbox_id = $1`, [inboxId, res.payment.payment_id]);
      return { outcome: 'APPLIED', inboxId, receiptNumber: res.receiptNumber, newStatus: res.newStatus };
    } catch (err) {
      await client.query('ROLLBACK TO SAVEPOINT apply_payment');
      const mapped = mapDbError(err);
      if (!(mapped instanceof AppError) || mapped.status >= 500) throw err;
      return this.#holdForReview(client, inboxId, mapped.code);
    }
  }
}
