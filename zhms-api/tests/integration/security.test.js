// Security regression tests (ISO 27001 A.8.29). Each test pins one control so a later change cannot silently
// reopen it: identity binding, account takeover by national ID, the unsigned payment simulator, PII in the
// public document check, production configuration, and security-event logging without secrets.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { createTestDatabase, insertParty, insertStand, insertApplication, rawAllocationInsert } from '../helpers/db.js';
import { createDb } from '../../src/db.js';
import { ApplicationService } from '../../src/applicationService.js';
import { AllocationService } from '../../src/allocationService.js';
import { PaymentService } from '../../src/paymentService.js';
import { PaymentInboxService } from '../../src/paymentInboxService.js';
import { IssuanceService } from '../../src/issuanceService.js';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { maskPhone } from '../../src/securityLog.js';

const base = {
  jwtSecret: 'test_super_secret_jwt_key_at_least_32_chars_long_2026',
  jwtIssuer: 'zimbuild',
  jwtAudience: 'zhms',
  corsOrigins: [],
  nationalIdChecksum: false,
  webhookSecrets: {},
};
const token = (sub, roles = []) => jwt.sign({ sub, roles }, base.jwtSecret, { issuer: 'zimbuild', audience: 'zhms', expiresIn: '1h' });

let testDb;
let db;
const servers = {};

function listen(name, config) {
  const payment = new PaymentService(db);
  const services = {
    application: new ApplicationService(db, config),
    allocation: new AllocationService(db),
    payment,
    inbox: new PaymentInboxService(db, payment),
    issuance: new IssuanceService(db),
  };
  const server = createApp(db, services, config).listen(0);
  servers[name] = { server, url: `http://127.0.0.1:${server.address().port}` };
}

async function api(name, method, path, { body, auth } = {}) {
  const res = await fetch(servers[name].url + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(auth && { Authorization: `Bearer ${auth}` }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, text };
}

let idSeq = 0;
const applicant = (over = {}) => {
  idSeq += 1;
  return {
    nationalId: `63-${String(700000 + idSeq)}-S-${String(10 + idSeq).slice(-2)}`,
    firstName: 'Tariro', lastName: `Moyo${idSeq}`, dateOfBirth: '1998-04-02',
    phoneNumber: '+263771234567', physicalAddress: '5 Test Close, Harare', ...over,
  };
};

/** A person registered by staff at the counter: no sign-in linked yet. */
async function unlinkedParty() {
  const p = await insertParty(db.pool);
  await db.pool.query('UPDATE la_party SET user_sub = NULL WHERE subject_id = $1', [p.subject_id]);
  return p;
}

test.before(async () => {
  testDb = await createTestDatabase();
  db = createDb(testDb.url, { max: 10 });
  listen('prod', { ...base, paymentSimulator: false });
  listen('dev', { ...base, paymentSimulator: true });
});

test.after(async () => {
  for (const { server } of Object.values(servers)) await new Promise((r) => server.close(r));
  await db.close();
  await testDb.drop();
});

// ------------------------------------------------------------------ A.8.5 / A.5.16 identity binding

test('youth registration ignores a caller-supplied userSub and issues a fresh server-side identity', async () => {
  const victimSub = 'staff_ceo_account';
  const r = await api('prod', 'POST', '/api/v1/public/youth-registration', { body: { ...applicant(), userSub: victimSub } });
  assert.equal(r.status, 201);
  assert.notEqual(r.body.userSub, victimSub);
  assert.match(r.body.userSub, /^youth_[0-9a-f-]{36}$/);
  const claims = jwt.verify(r.body.token, base.jwtSecret, { audience: 'zhms', issuer: 'zimbuild' });
  assert.equal(claims.sub, r.body.userSub);
  assert.deepEqual(claims.roles, ['APPLICANT']);
});

test('knowing a national ID does not attach a staff-registered person to your sign-in', async () => {
  const victim = await unlinkedParty();
  const attacker = token('usr_attacker');
  const r = await api('prod', 'POST', '/api/v1/applications', {
    auth: attacker, body: applicant({ nationalId: victim.national_id }),
  });
  assert.equal(r.status, 409);
  assert.equal(r.body.error, 'IDENTITY_VERIFICATION_REQUIRED');
  const { rows: [after] } = await db.query('SELECT user_sub FROM la_party WHERE subject_id = $1', [victim.subject_id]);
  assert.equal(after.user_sub, null, 'victim record must stay unlinked');

  const mine = await api('prod', 'GET', '/api/v1/owner/my-allocations', { auth: attacker });
  assert.equal(mine.status, 200);
  assert.equal(mine.body.allocations.length, 0);
});

test("nobody can file an application on another signed-in person's record", async () => {
  const owned = await insertParty(db.pool, { userSub: 'usr_real_owner' });
  const r = await api('prod', 'POST', '/api/v1/applications', {
    auth: token('usr_intruder'), body: applicant({ nationalId: owned.national_id }),
  });
  assert.equal(r.status, 409);
  assert.equal(r.body.error, 'IDENTITY_VERIFICATION_REQUIRED');
});

test('staff registering an applicant do not become the owner of that record', async () => {
  const r = await api('prod', 'POST', '/api/v1/applications', {
    auth: token('officer_7', ['LAND_OFFICER']), body: applicant({ registrationChannel: 'STAFF' }),
  });
  assert.equal(r.status, 201);
  const { rows: [p] } = await db.query(
    'SELECT p.user_sub FROM la_party p JOIN applications a ON a.subject_id = p.subject_id WHERE a.application_id = $1',
    [r.body.application.application_id]);
  assert.equal(p.user_sub, null);
});

test('a returned application of an unlinked applicant can only be resubmitted by staff', async () => {
  const p = await unlinkedParty();
  const app = await insertApplication(db.pool, p.subject_id, 'RETURNED');
  const outsider = await api('prod', 'POST', `/api/v1/applications/${app.application_id}/resubmit`, { auth: token('usr_random'), body: {} });
  assert.equal(outsider.status, 403);
  const officer = await api('prod', 'POST', `/api/v1/applications/${app.application_id}/resubmit`, {
    auth: token('officer_1', ['LAND_OFFICER']), body: {},
  });
  assert.equal(officer.status, 200);
});

// ------------------------------------------------------------------ A.8.26 payment integrity

async function allocationFor(userSub) {
  const party = await insertParty(db.pool, { userSub });
  const stand = await insertStand(db.pool);
  const app = await insertApplication(db.pool, party.subject_id);
  const { rows: [a] } = await rawAllocationInsert(db.pool, { applicationId: app.application_id, subjectId: party.subject_id, parcelId: stand.parcel_id });
  const { rows: [full] } = await db.query('SELECT allocation_id, account_ref FROM allocations WHERE allocation_id = $1', [a.allocation_id]);
  return full;
}

test('the unsigned EcoCash push simulator is unavailable unless explicitly enabled', async () => {
  const alloc = await allocationFor('usr_buyer_prod');
  const r = await api('prod', 'POST', '/api/v1/payments/ecocash-push', {
    auth: token('usr_buyer_prod'), body: { accountRef: alloc.account_ref, amount: '100.00' },
  });
  assert.equal(r.status, 404);
  assert.equal(r.body.error, 'PAYMENT_SIMULATOR_DISABLED');
  const { rows } = await db.query('SELECT count(*)::int AS n FROM payment_inbox WHERE account_ref = $1', [alloc.account_ref]);
  assert.equal(rows[0].n, 0);
});

test("even when enabled, the simulator cannot credit someone else's stand", async () => {
  const victim = await allocationFor('usr_victim_buyer');
  const r = await api('dev', 'POST', '/api/v1/payments/ecocash-push', {
    auth: token('usr_freshly_registered'), body: { accountRef: victim.account_ref, amount: '5000.00' },
  });
  assert.equal(r.status, 403);
  assert.equal(r.body.error, 'NOT_ALLOCATION_OWNER');

  const own = await api('dev', 'POST', '/api/v1/payments/ecocash-push', {
    auth: token('usr_victim_buyer'), body: { accountRef: victim.account_ref, amount: '100.00' },
  });
  assert.equal(own.status, 200);
  assert.match(own.body.reference, /^SIM-/);
});

// ------------------------------------------------------------------ A.8.11 / A.8.12 data minimisation

test('public document verification proves authenticity without exposing the holder’s PII', async () => {
  const alloc = await allocationFor('usr_deed_holder');
  const verificationToken = crypto.randomBytes(24).toString('hex');
  const content = {
    documentType: 'DEED_OF_TRANSFER',
    owner: { name: 'Farai Chikomo', nationalId: '63-555555-K-55', phone: '+263772222222' },
    property: { standNumber: 'BUD-0042', schemeName: 'Budiriro Phase 4' },
    signatory: { role: 'CEO', sub: 'ceo_internal_sub' },
  };
  await db.query(
    `INSERT INTO issued_documents (allocation_id, doc_type, document_number, signed_by, content, content_hash, verification_token)
     VALUES ($1, 'AGREEMENT_OF_SALE', $2, 'ceo_internal_sub', $3, 'abc123', $4)`,
    [alloc.allocation_id, `ZIM-AOS-T${idSeq}`, content, verificationToken]);

  const r = await api('prod', 'GET', `/api/v1/verify/${verificationToken}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.verified, true);
  assert.equal(r.body.document.stand_number, 'BUD-0042');
  assert.equal(r.body.document.holder_initials, 'F. C.');
  for (const secret of ['63-555555-K-55', '+263772222222', 'Farai', 'Chikomo', 'ceo_internal_sub']) {
    assert.ok(!r.text.includes(secret), `verification response leaked ${secret}`);
  }

  const malformed = await api('prod', 'GET', '/api/v1/verify/not-a-token');
  assert.equal(malformed.status, 404);
});

// ------------------------------------------------------------------ A.8.9 secure configuration / A.8.12 leakage

test('unknown routes return a JSON 404 without framework fingerprints', async () => {
  const res = await fetch(`${servers.prod.url}/api/v1/does-not-exist`);
  assert.equal(res.status, 404);
  assert.equal(res.headers.get('x-powered-by'), null);
  assert.equal((await res.json()).error, 'NOT_FOUND');
});

test('production configuration refuses wildcard CORS and the payment simulator', () => {
  const env = { DATABASE_URL: 'postgres://x', JWT_SECRET: 'x'.repeat(48) };
  assert.throws(() => loadConfig({ ...env, NODE_ENV: 'production' }), /CORS_ORIGINS is required/);
  assert.throws(() => loadConfig({ ...env, NODE_ENV: 'production', CORS_ORIGINS: '*' }), /not \*/);
  assert.throws(() => loadConfig({ ...env, NODE_ENV: 'production', CORS_ORIGINS: 'https://a.example', ENABLE_PAYMENT_SIMULATOR: 'true' }),
    /ENABLE_PAYMENT_SIMULATOR/);
  assert.throws(() => loadConfig({ ...env, JWT_SECRET: 'short', NODE_ENV: 'development' }), /at least 32/);
  const dev = loadConfig({ ...env, NODE_ENV: 'development', ENABLE_PAYMENT_SIMULATOR: 'true', LOG_MESSAGE_BODIES: 'true' });
  assert.equal(dev.paymentSimulator, true);
  assert.equal(dev.messaging.logBodies, true);
  const prod = loadConfig({ ...env, NODE_ENV: 'production', CORS_ORIGINS: 'https://a.example', LOG_MESSAGE_BODIES: 'true' });
  assert.equal(prod.messaging.logBodies, false, 'message bodies are never logged in production');
});

// ------------------------------------------------------------------ A.8.15 / A.8.16 security event logging

test('failed authentication is logged as a security event without the token', async (t) => {
  const lines = [];
  t.mock.method(console, 'log', (line) => lines.push(String(line)));
  const forged = jwt.sign({ sub: 'x', roles: ['ADMIN'] }, 'attacker_chosen_secret_attacker_chosen', { issuer: 'zimbuild', audience: 'zhms' });
  const r = await api('prod', 'GET', '/api/v1/owner/my-allocations', { auth: forged });
  assert.equal(r.status, 401);
  const events = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((e) => e?.type === 'security');
  const ev = events.find((e) => e.event === 'AUTH_INVALID_TOKEN');
  assert.ok(ev, 'AUTH_INVALID_TOKEN was not logged');
  assert.equal(ev.path, '/api/v1/owner/my-allocations');
  assert.ok(!lines.join('\n').includes(forged), 'the token must never be written to logs');
});

test('role denials are logged with the pseudonymised actor, not the raw subject', async (t) => {
  const lines = [];
  t.mock.method(console, 'log', (line) => lines.push(String(line)));
  const r = await api('prod', 'GET', '/api/v1/applications', { auth: token('usr_curious_buyer') });
  assert.equal(r.status, 403);
  const ev = lines.map((l) => JSON.parse(l)).find((e) => e.event === 'AUTHZ_ROLE_DENIED');
  assert.ok(ev);
  assert.match(ev.actor, /^[0-9a-f]{16}$/);
  assert.ok(!lines.join('\n').includes('usr_curious_buyer'));
});

test('phone numbers are masked for logs', () => {
  assert.equal(maskPhone('+263774128901'), '+2637******01');
  assert.equal(maskPhone(null), '***');
});
