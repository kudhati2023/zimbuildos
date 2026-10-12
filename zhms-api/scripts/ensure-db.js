import pg from 'pg';

const rootUrl = 'postgres://postgres:postgres@localhost:5432/postgres';
const client = new pg.Client({ connectionString: rootUrl });

try {
  await client.connect();
  const res = await client.query("SELECT 1 FROM pg_database WHERE datname='zhms'");
  if (res.rowCount === 0) {
    await client.query('CREATE DATABASE zhms');
    console.log('[DB SETUP] Database "zhms" created successfully.');
  } else {
    console.log('[DB SETUP] Database "zhms" already exists.');
  }
} catch (err) {
  console.error('[DB SETUP] Notice connecting to root postgres:', err.message);
} finally {
  await client.end();
}
