import crypto from 'node:crypto';
import pg from 'pg';
import { migrate } from '../../src/migrate.js';

export const SPATIAL = process.env.ZHMS_SPATIAL !== '0';

/** Creates a brand-new database for one test file (isolated from every other file). */
export async function createTestDatabase() {
  const adminUrl = process.env.TEST_ADMIN_URL;
  if (!adminUrl) throw new Error('TEST_ADMIN_URL not set - run tests with `npm test`');
  const name = `zhms_t_${crypto.randomBytes(5).toString('hex')}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();

  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const pool = new pg.Pool({ connectionString: url.toString(), max: 60 });
  await migrate(pool, { skip: SPATIAL ? [] : ['spatial'] });

  const dbWrapper = {
    pool,
    url: url.toString(),
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const res = await fn(client);
        await client.query('COMMIT');
        return res;
      } catch (err) {
        try { await client.query('ROLLBACK'); } catch {}
        throw err;
      } finally {
        client.release();
      }
    },
    query(text, params) {
      return pool.query(text, params);
    },
    async drop() {
      await pool.end();
      const a = new pg.Client({ connectionString: adminUrl });
      await a.connect();
      await a.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await a.end();
    },
  };

  return dbWrapper;
}

let seq = 0;
/** Fixture helpers that write directly with SQL (used to set up scenarios, never to test business rules). */
export async function insertParty(pool, over = {}) {
  seq += 1;
  const n = String(1000000 + seq);
  const { rows } = await pool.query(
    `INSERT INTO la_party(national_id, first_name, last_name, date_of_birth, phone_number, physical_address, user_sub)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [over.nationalId ?? `63-${n}-R-42`, over.firstName ?? 'Test', over.lastName ?? `Person${seq}`,
      over.dob ?? '1995-06-15', over.phone ?? '+263771000000', over.address ?? '1 Test Road, Harare',
      over.userSub ?? `sub-${crypto.randomUUID()}`]);
  return rows[0];
}

export async function insertStand(pool, over = {}) {
  seq += 1;
  const { rows } = await pool.query(
    `INSERT INTO la_spatial_unit(stand_number, scheme_name, site_location, area_sqm, price_usd)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [over.standNumber ?? `T-${seq}-${crypto.randomBytes(2).toString('hex')}`, over.scheme ?? 'Test Scheme',
      over.location ?? 'Test Location', over.area ?? 300, over.price ?? '10000.00']);
  return rows[0];
}

export async function insertApplication(pool, subjectId, status = 'APPROVED', firstSubmittedAt = null) {
  const { rows } = await pool.query(
    `INSERT INTO applications(subject_id, status, first_submitted_at) VALUES ($1,$2,COALESCE($3, now())) RETURNING *`,
    [subjectId, status, firstSubmittedAt]);
  return rows[0];
}

export const rawAllocationInsert = (pool, { applicationId, subjectId, parcelId, key }) =>
  pool.query(
    `INSERT INTO allocations(application_id, subject_id, parcel_id, status, total_price_usd, deposit_required_usd,
                             reservation_expires_at, idempotency_key, reserved_by)
     VALUES ($1,$2,$3,'RESERVED',10000,5000, now() + interval '7 days', $4, 'raw-sql')
     RETURNING allocation_id`,
    [applicationId, subjectId, parcelId, key ?? crypto.randomUUID()]);
