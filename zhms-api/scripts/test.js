// Test orchestrator. Uses a real PostgreSQL server:
//   * TEST_ADMIN_URL set  -> that server (use the PostGIS docker-compose.test.yml for full coverage)
//   * otherwise           -> an embedded real PostgreSQL (no PostGIS; spatial tests are reported as skipped)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); });
    s.on('error', reject);
  });
}

let embedded = null;
let dataDir = null;
const env = { ...process.env };

if (!env.TEST_ADMIN_URL) {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const port = await freePort();
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zhms-pg-'));
  embedded = new EmbeddedPostgres({
    databaseDir: dataDir, user: 'postgres', password: 'postgres', port, persistent: false,
    onLog: () => {}, onError: () => {},
  });
  await embedded.initialise();
  await embedded.start();
  env.TEST_ADMIN_URL = `postgres://postgres:postgres@localhost:${port}/postgres`;
  env.ZHMS_SPATIAL = '0';
  console.log(`[test] embedded PostgreSQL on port ${port} (PostGIS NOT available - spatial tests will skip)`);
} else {
  console.log('[test] using TEST_ADMIN_URL server');
}

const args = process.argv.slice(2);
const targets = args.length ? args : [
  'tests/unit/payments-math.test.js',
  'tests/db/double-allocation.test.js',
  'tests/integration/lifecycle.test.js',
  'tests/integration/instalments.test.js',
  'tests/integration/gis.test.js',
  'tests/integration/construction.test.js',
  'tests/integration/security.test.js'
];
const child = spawn(process.execPath, ['--test', '--test-concurrency=1', ...targets], { stdio: 'inherit', env });
const code = await new Promise((resolve) => child.on('exit', (c) => resolve(c ?? 1)));

if (embedded) {
  await embedded.stop().catch(() => {});
  fs.rmSync(dataDir, { recursive: true, force: true });
}
process.exit(code);
