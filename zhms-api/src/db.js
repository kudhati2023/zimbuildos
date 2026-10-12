import pg from 'pg';
import { mapDbError } from './errors.js';

// numeric(12,2) stays a string in JS (never parsed to float); timestamps stay Date objects.
pg.types.setTypeParser(1700, (v) => v);

export function createDb(connectionString, { max = 20 } = {}) {
  const pool = new pg.Pool({ connectionString, max, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 });
  pool.on('error', (err) => console.error(JSON.stringify({ level: 'error', msg: 'pg pool error', err: err.message })));

  /** Runs fn inside one transaction; any failure rolls everything back and is mapped to an API error. */
  async function tx(fn) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch { /* connection already broken */ }
      throw mapDbError(err);
    } finally {
      client.release();
    }
  }

  const query = async (text, params) => {
    try { return await pool.query(text, params); } catch (err) { throw mapDbError(err); }
  };

  return { pool, tx, query, close: () => pool.end() };
}

/** Appends to the hash-chained audit log. Must be the LAST statement of a transaction (lock ordering). */
export const audit = (client, actor, action, entity, entityId, data = {}) =>
  client.query('SELECT append_audit($1,$2,$3,$4,$5::jsonb)', [actor, action, entity, String(entityId), JSON.stringify(data)]);

export async function loadBusinessConfig(client) {
  const { rows } = await client.query('SELECT key, value FROM app_config');
  const c = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    depositPercent: Number(c.deposit_percent),
    reservationDays: Number(c.reservation_days),
    minAge: Number(c.min_age),
    maxAge: Number(c.max_age),
    priorityMode: c.priority_mode,
  };
}
