import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

try {
  const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env');
  process.loadEnvFile(envPath);
} catch (e) {
  try { process.loadEnvFile(); } catch (e2) {}
}

import pg from 'pg';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/**
 * Applies pending SQL migrations in filename order, each in its own transaction.
 * A session-level advisory lock stops two instances migrating at once.
 * `skip` is for test environments without PostGIS only; production never skips.
 */
export async function migrate(pool, { skip = [], log = () => {} } = {}) {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(727000)');
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    const done = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
    const applied = [];
    for (const file of files) {
      if (done.has(file) || skip.some((s) => file.includes(s))) continue;
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        applied.push(file);
        log(`applied ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${err.message}`);
      }
    }
    return applied;
  } finally {
    try { await client.query('SELECT pg_advisory_unlock(727000)'); } catch { /* connection may be gone */ }
    client.release();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const skip = process.env.ZHMS_SPATIAL === '0' ? ['spatial'] : [];
  migrate(pool, { skip, log: console.log })
    .then((a) => { console.log(a.length ? `Done: ${a.length} migration(s)` : 'Database is up to date'); return pool.end(); })
    .catch((e) => { console.error(e.message); process.exit(1); });
}
