// End-to-end over HTTP: youth registration -> quota-reserved stand -> signed EcoCash/bank webhooks ->
// instalment plan -> ZiG payment -> buyer proof of payment -> overdue/reminder/statement jobs ->
// SMS/WhatsApp dispatch -> servicing certification -> title deed. Uses the production db wrapper.
import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { createTestDatabase, insertParty, insertApplication, rawAllocationInsert } from '../helpers/db.js';
import { createDb } from '../../src/db.js';
import { ApplicationService } from '../../src/applicationService.js';
import { AllocationService } from '../../src/allocationService.js';
import { PaymentService } from '../../src/paymentService.js';
import { PaymentInboxService } from '../../src/paymentInboxService.js';
import { IssuanceService } from '../../src/issuanceService.js';
import { MessageDispatcher } from '../../src/messaging.js';
import { JobService } from '../../src/jobService.js';
import { createApp } from '../../src/app.js';
import { signWebhook } from '../../src/signature.js';
import { todayHarare, addDays } from '../../src/dates.js';

const SECRET = 'ecocash_webhook_secret_for_tests_0123456789';
const config = {
  jwtSecret: 'test_super_secret_jwt_key_at_least_32_chars_long_2026',
  jwtIssuer: 'zimbuild',
  jwtAudience: 'zhms',
  corsOrigins: [],
  nationalIdChecksum: false,
  webhookSecrets: { ECOCASH: SECRET, BANK_TRANSFER: SECRET },
  messaging: { whatsappProvider: 'console', smsProvider: 'console', maxAttempts: 3 },
};
const token = (sub, roles = []) => jwt.sign({ sub, roles }, config.jwtSecret, { issuer: 'zimbuild', audience: 'zhms', expiresIn: '1h' });

const T = {
  buyer: token('usr_youth_1'),
  other: token('usr_someone_else'),
  officer: token('officer_1', ['LAND_OFFICER']),
  finance: token('finance_1', ['FINANCE_MANAGER']),
  ceo: token('ceo_1', ['CEO']),
  engineer: token('eng_1', ['ENGINEER']),
  admin: token('admin_1', ['ADMIN']),
};

let testDb;
let db;
let services;
let server;
let base;
const sent = [];

async function api(method, path, { body, auth, headers = {} } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(auth && { Authorization: `Bearer ${auth}` }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

function webhook(channel, payload, { secret = SECRET, ts = Math.floor(Date.now() / 1000) } = {}) {
  const raw = JSON.stringify(payload);
  return fetch(`${base}/api/v1/webhooks/payments/${channel}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-ZHMS-Timestamp': String(ts),
      'X-ZHMS-Signature': signWebhook(String(ts), Buffer.from(raw), secret),
    },
    body: raw,
  }).then(async (r) => ({ status: r.status, body: await r.json() }));
}

const one = async (sql, params) => (await db.query(sql, params)).rows[0];

test.before(async () => {
  testDb = await createTestDatabase();
  db = createDb(testDb.url, { max: 10 });
  const payment = new PaymentService(db);
  const allocation = new AllocationService(db);
  const dispatcher = new MessageDispatcher(db, config, { transport: async (m) => { sent.push(m); return `fake-${sent.length}`; } });
  services = {
    application: new ApplicationService(db, config),
    allocation,
    payment,
    inbox: new PaymentInboxService(db, payment),
    issuance: new IssuanceService(db),
    dispatcher,
    jobs: new JobService(db, { allocation, dispatcher }),
  };
  server = createApp(db, services, config).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((r) => server.close(r));
  await db.close();
  await testDb.drop();
});

// Shared state across the ordered steps below
const S = {};

test('quote shows the true annual cost of instalment offers', async () => {
  const r = await api('POST', '/api/v1/payment-plans/quote', {
    body: { priceUsd: '1400', depositUsd: '0', termMonths: 24, monthlyRateBps: 125, compareFlatMarkupPercent: 30 },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.effectiveAnnualRatePercent, 16.08);
  assert.equal(r.body.instalments.length, 24);
  assert.ok(r.body.flatMarkupComparison.effectiveAnnualRatePercent > 29);

  const bad = await api('POST', '/api/v1/payment-plans/quote', { body: { priceUsd: '1400', termMonths: 0 } });
  assert.equal(bad.status, 400);
});

test('youth quota: over-35s are refused, a 24-year-old registers from a phone', async () => {
  const tooOld = await api('POST', '/api/v1/applications', {
    auth: token('usr_old'),
    body: { nationalId: '63-111111-A-11', firstName: 'Old', lastName: 'Timer', dateOfBirth: '1980-01-01',
      phoneNumber: '+263771111111', physicalAddress: 'Harare', quotaCategory: 'YOUTH' },
  });
  assert.equal(tooOld.status, 400);
  assert.equal(tooOld.body.error, 'INELIGIBLE_FOR_YOUTH_QUOTA');

  const dob = `${Number(todayHarare().slice(0, 4)) - 24}-03-12`;
  const ok = await api('POST', '/api/v1/applications', {
    auth: T.buyer,
    body: { nationalId: '63-189442-Y-55', firstName: 'Rudo', lastName: 'Sibanda', dateOfBirth: dob,
      phoneNumber: '+263 77 412 8901', physicalAddress: 'Budiriro, Harare', quotaCategory: 'YOUTH',
      registrationChannel: 'MOBILE', preferredChannel: 'WHATSAPP' },
  });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.application.quota_category, 'YOUTH');
  assert.equal(ok.body.application.registration_channel, 'MOBILE');
  S.applicationId = ok.body.application.application_id;

  const msg = await one(`SELECT * FROM outbound_messages WHERE template = 'APPLICATION_RECEIVED'`);
  assert.equal(msg.to_phone, '263774128901');
  assert.equal(msg.channel, 'WHATSAPP');

  for (const [role, sub] of [['LAND_OFFICER', 'officer_1'], ['FINANCE_MANAGER', 'finance_1'], ['CEO', 'ceo_1']]) {
    await services.application.reviewApplication(S.applicationId, role, sub, 'APPROVED');
  }
});

test('youth-reserved stand: refuses a general applicant, reserves for the youth applicant', async () => {
  const youthStand = await one(
    `INSERT INTO la_spatial_unit (stand_number, scheme_name, site_location, area_sqm, price_usd, quota_category)
     VALUES ('BDR-401', 'Budiriro Phase 2', 'Harare South-West', 300, 1400, 'YOUTH') RETURNING *`);
  const otherYouthStand = await one(
    `INSERT INTO la_spatial_unit (stand_number, scheme_name, site_location, area_sqm, price_usd, quota_category)
     VALUES ('BDR-402', 'Budiriro Phase 2', 'Harare South-West', 300, 1400, 'YOUTH') RETURNING *`);
  S.parcelId = youthStand.parcel_id;

  const reserve = await api('POST', '/api/v1/allocations/reserve', {
    auth: T.officer, headers: { 'X-Idempotency-Key': 'res-youth-1' },
    body: { applicationId: S.applicationId, parcelId: youthStand.parcel_id },
  });
  assert.equal(reserve.status, 201);
  assert.equal(reserve.body.allocation.deposit_required_usd, '700.00');
  assert.match(reserve.body.allocation.account_ref, /^ZB-[0-9A-F]{8}$/);
  S.allocationId = reserve.body.allocation.allocation_id;
  S.accountRef = reserve.body.allocation.account_ref;

  const general = await insertParty(db.pool, { userSub: 'usr_general_1' });
  const generalApp = await insertApplication(db.pool, general.subject_id, 'APPROVED');
  const mismatch = await api('POST', '/api/v1/allocations/reserve', {
    auth: T.officer, headers: { 'X-Idempotency-Key': 'res-general-1' },
    body: { applicationId: generalApp.application_id, parcelId: otherYouthStand.parcel_id },
  });
  assert.equal(mismatch.status, 409);
  assert.equal(mismatch.body.error, 'QUOTA_MISMATCH');

  const msg = await one(`SELECT body FROM outbound_messages WHERE template = 'RESERVATION_CONFIRMED'`);
  assert.match(msg.body, new RegExp(`US\\$700\\.00.*${S.accountRef}`));
});

test('webhooks: forged, stale and unconfigured requests are refused', async () => {
  const payload = { reference: 'EC-FORGED-1', accountRef: S.accountRef, amount: '700.00', currency: 'USD', status: 'SUCCESS' };
  assert.equal((await webhook('ECOCASH', payload, { secret: 'wrong_secret_wrong_secret_wrong_secret' })).status, 401);
  assert.equal((await webhook('ECOCASH', payload, { ts: Math.floor(Date.now() / 1000) - 3600 })).status, 401);
  assert.equal((await webhook('OMARI', payload)).status, 404);
  assert.equal((await one('SELECT count(*)::int AS n FROM payments')).n, 0);
});

test('signed EcoCash deposit is applied once, retries are idempotent, unknown references are held', async () => {
  const payload = { reference: 'EC-992014812', accountRef: S.accountRef.toLowerCase(), amount: '700.00', currency: 'USD',
    status: 'SUCCESS', payerPhone: '+263774128901' };
  const first = await webhook('ECOCASH', payload);
  assert.equal(first.status, 200);
  assert.equal(first.body.outcome, 'APPLIED');
  assert.equal(first.body.newStatus, 'AWAITING_SIGNATURE');

  const retry = await webhook('ECOCASH', payload);
  assert.equal(retry.body.outcome, 'DUPLICATE');
  assert.equal((await one('SELECT count(*)::int AS n FROM payments')).n, 1);

  const unknown = await webhook('ECOCASH', { ...payload, reference: 'EC-UNKNOWN-1', accountRef: 'ZB-NOTREAL' });
  assert.equal(unknown.body.outcome, 'PENDING_REVIEW');
  assert.equal(unknown.body.reason, 'UNKNOWN_ACCOUNT_REF');

  const failed = await webhook('ECOCASH', { ...payload, reference: 'EC-FAILED-1', status: 'FAILED' });
  assert.equal(failed.body.outcome, 'IGNORED');

  const receipt = await one(`SELECT body FROM outbound_messages WHERE template = 'PAYMENT_RECEIPT'`);
  assert.match(receipt.body, /REC-\d{8}: US\$700\.00 received for stand BDR-401 via ECOCASH/);
});

test('signing the agreement creates the instalment plan with the true rate written into the contract', async () => {
  const r = await api('POST', `/api/v1/allocations/${S.allocationId}/sign-agreement`, {
    auth: T.ceo, body: { planTerms: { termMonths: 6, monthlyRateBps: 125 } },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'ACTIVE');
  assert.equal(r.body.paymentPlan.instalments.length, 6);
  assert.equal(r.body.paymentPlan.financedUsd, '700.00');
  assert.equal(r.body.paymentPlan.effectiveAnnualRatePercent, 16.08);
  assert.equal(r.body.paymentPlan.accountReference, S.accountRef);

  const doc = await one(`SELECT content FROM issued_documents WHERE doc_type = 'AGREEMENT_OF_SALE'`);
  assert.equal(doc.content.paymentPlan.instalments.length, 6, 'the signed content includes the schedule');
  await assert.rejects(db.query(`UPDATE payment_plans SET term_months = 3`), (e) => e.code === 'IMMUTABLE_RECORD');
});

test('ZiG payment waits for an exchange rate, then finance approves it at the recorded rate', async () => {
  const zig = await webhook('ECOCASH', { reference: 'EC-ZIG-1', accountRef: S.accountRef, amount: '3180.00', currency: 'ZWG', status: 'SUCCESS' });
  assert.equal(zig.body.outcome, 'PENDING_REVIEW');
  assert.equal(zig.body.reason, 'NO_FX_RATE');

  assert.equal((await api('POST', '/api/v1/fx-rates', { auth: T.officer, body: { unitsPerUsd: '26.5', source: 'RBZ' } })).status, 403);
  const rate = await api('POST', '/api/v1/fx-rates', { auth: T.finance, body: { unitsPerUsd: '26.5', source: 'RBZ interbank mid-rate' } });
  assert.equal(rate.status, 201);

  const inbox = await api('GET', '/api/v1/payments/inbox', { auth: T.finance });
  const item = inbox.body.items.find((i) => i.external_reference === 'EC-ZIG-1');
  assert.equal(item.stand_number, 'BDR-401');

  const approved = await api('POST', `/api/v1/payments/inbox/${item.inbox_id}/approve`, { auth: T.finance, body: {} });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.outcome, 'APPLIED');
  const p = await one(`SELECT * FROM payments WHERE external_reference = 'EC-ZIG-1'`);
  assert.equal(p.amount_usd, '120.00');
  assert.equal(p.amount_original, '3180.00');
  assert.equal(p.fx_rate, '26.500000');

  const again = await api('POST', `/api/v1/payments/inbox/${item.inbox_id}/approve`, { auth: T.finance, body: {} });
  assert.equal(again.status, 409);
});

test('buyer sees their own statement (previously always refused) and nobody else can', async () => {
  const mine = await api('GET', `/api/v1/allocations/${S.allocationId}/statement`, { auth: T.buyer });
  assert.equal(mine.status, 200);
  const plan = mine.body.paymentPlan;
  assert.equal(plan.installments.length, 6);
  assert.equal(plan.installments[0].status, 'PARTIAL');
  assert.equal(plan.installments[0].paid_usd, '120.00');
  S.firstInstalmentDue = Number(plan.installments[0].principal_usd) + Number(plan.installments[0].interest_usd);

  const theirs = await api('GET', `/api/v1/allocations/${S.allocationId}/statement`, { auth: T.other });
  assert.equal(theirs.status, 403);
});

test('buyer proof of payment goes to finance; duplicates and other people\'s stands are refused', async () => {
  const rest = (S.firstInstalmentDue - 120).toFixed(2);
  const pop = await api('POST', '/api/v1/owner/proof-of-payment', {
    auth: T.buyer, body: { allocationId: S.allocationId, channel: 'BANK_TRANSFER', reference: 'BT-55501', amount: rest, note: 'CBZ transfer' },
  });
  assert.equal(pop.status, 201);
  assert.equal(pop.body.status, 'PENDING_REVIEW');

  const dup = await api('POST', '/api/v1/owner/proof-of-payment', {
    auth: T.buyer, body: { allocationId: S.allocationId, channel: 'BANK_TRANSFER', reference: 'BT-55501', amount: rest },
  });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error, 'PAYMENT_REFERENCE_REUSED');

  const notMine = await api('POST', '/api/v1/owner/proof-of-payment', {
    auth: T.other, body: { allocationId: S.allocationId, channel: 'BANK_TRANSFER', reference: 'BT-99999', amount: '10' },
  });
  assert.equal(notMine.status, 403);

  const shortReason = await api('POST', `/api/v1/payments/inbox/${pop.body.inbox_id}/reject`, { auth: T.finance, body: { reason: 'no' } });
  assert.equal(shortReason.status, 400);

  const ok = await api('POST', `/api/v1/payments/inbox/${pop.body.inbox_id}/approve`, { auth: T.finance, body: {} });
  assert.equal(ok.status, 200);
  const first = await one(`SELECT i.status FROM plan_installments i JOIN payment_plans p USING (plan_id) WHERE p.allocation_id = $1 AND seq = 1`, [S.allocationId]);
  assert.equal(first.status, 'PAID');
});

test('jobs: overdue notice and reminder are queued exactly once each', async () => {
  const today = todayHarare();
  await db.query(
    `UPDATE plan_installments SET due_date = $2::date - 30
      WHERE seq = 2 AND plan_id = (SELECT plan_id FROM payment_plans WHERE allocation_id = $1)`, [S.allocationId, today]);
  await db.query(
    `UPDATE plan_installments SET due_date = $2::date
      WHERE seq = 3 AND plan_id = (SELECT plan_id FROM payment_plans WHERE allocation_id = $1)`, [S.allocationId, addDays(today, 2)]);

  assert.equal(await services.jobs.markOverdue(today), 1);
  assert.equal(await services.jobs.markOverdue(today), 0);
  assert.equal(await services.jobs.queueReminders(today), 1);
  assert.equal(await services.jobs.queueReminders(today), 0);
  assert.equal(await services.jobs.queueStatements(today, { force: true }), 1);
  assert.equal(await services.jobs.queueStatements(today, { force: true }), 0);

  const overdue = await one(`SELECT body FROM outbound_messages WHERE template = 'PAYMENT_OVERDUE'`);
  assert.match(overdue.body, /overdue/);
  const sendNow = await api('POST', `/api/v1/allocations/${S.allocationId}/statement/send`, { auth: T.finance });
  assert.equal(sendNow.status, 202);
});

test('dispatcher delivers queued messages and retries failures with back-off', async () => {
  const queued = (await one(`SELECT count(*)::int AS n FROM outbound_messages WHERE status = 'QUEUED'`)).n;
  const r = await services.dispatcher.dispatch({ limit: 100 });
  assert.equal(r.sent, queued);
  assert.equal(sent.length, queued);
  assert.equal((await one(`SELECT count(*)::int AS n FROM outbound_messages WHERE status <> 'SENT'`)).n, 0);

  const flaky = new MessageDispatcher(db, config, { transport: async () => { throw new Error('gateway timeout'); } });
  await db.query(
    `INSERT INTO outbound_messages (to_phone, channel, template, params, body)
     VALUES ('263774128901', 'SMS', 'DEED_ISSUED', '{}', 'test')`);
  assert.deepEqual(await flaky.dispatch(), { sent: 0, retrying: 1, failed: 0 });
  const m = await one(`SELECT * FROM outbound_messages WHERE body = 'test'`);
  assert.equal(m.status, 'QUEUED');
  assert.equal(m.last_error, 'gateway timeout');
  assert.ok(m.next_attempt_at > new Date(), 'retry is scheduled in the future');
});

test('final bank payment settles the plan; deed waits for 100% certified servicing', async () => {
  const st = await api('GET', `/api/v1/allocations/${S.allocationId}/statement`, { auth: T.buyer });
  const pay = await webhook('BANK_TRANSFER', {
    reference: 'ZIPIT-88102391', accountRef: S.accountRef, amount: st.body.paymentPlan.outstandingUsd, currency: 'USD', status: 'SUCCESS',
  });
  assert.equal(pay.body.outcome, 'APPLIED');
  assert.equal(pay.body.newStatus, 'PAID_IN_FULL');

  const early = await api('POST', `/api/v1/allocations/${S.allocationId}/sign-deed`, { auth: T.ceo });
  assert.equal(early.status, 409);
  assert.equal(early.body.error, 'SERVICING_NOT_CERTIFIED');

  const allCertified = { water: 'CERTIFIED', sewer: 'CERTIFIED', roads: 'CERTIFIED' };
  assert.equal((await api('PUT', `/api/v1/stands/${S.parcelId}/servicing`, { auth: T.officer, body: allCertified })).status, 403);
  const noCert = await api('PUT', `/api/v1/stands/${S.parcelId}/servicing`, { auth: T.engineer, body: allCertified });
  assert.equal(noCert.status, 400);
  assert.equal(noCert.body.error, 'CERTIFICATE_REQUIRED');
  const certified = await api('PUT', `/api/v1/stands/${S.parcelId}/servicing`, {
    auth: T.engineer, body: { ...allCertified, certificateRef: 'HCC/ENG/2026/0401' },
  });
  assert.equal(certified.status, 200);
  assert.equal(certified.body.stand.servicing_certified_by, 'eng_1');

  const deed = await api('POST', `/api/v1/allocations/${S.allocationId}/sign-deed`, { auth: T.ceo });
  assert.equal(deed.status, 200);
  assert.equal(deed.body.status, 'COMPLETED');
});

test('the database itself blocks a deed for an unpaid allocation', async () => {
  const party = await insertParty(db.pool);
  const app = await insertApplication(db.pool, party.subject_id, 'APPROVED');
  const stand = await one(
    `INSERT INTO la_spatial_unit (stand_number, scheme_name, site_location, area_sqm, price_usd)
     VALUES ('BDR-499', 'Budiriro Phase 2', 'Harare', 300, 1400) RETURNING parcel_id`);
  const { rows: [a] } = await rawAllocationInsert(db.pool, { applicationId: app.application_id, subjectId: party.subject_id, parcelId: stand.parcel_id });
  await assert.rejects(
    db.query(
      `INSERT INTO issued_documents (allocation_id, doc_type, document_number, signed_by, content, content_hash, verification_token)
       VALUES ($1, 'DEED', 'FAKE-1', 'raw-sql', '{}', 'x', 'tok-fake')`, [a.allocation_id]),
    (e) => e.code === 'NOT_PAID_IN_FULL');
});

test('public register and quota summary are transparent without exposing personal data', async () => {
  const reg = await api('GET', '/api/v1/public/allocation-register?scheme=Budiriro%20Phase%202');
  assert.equal(reg.status, 200);
  const s401 = reg.body.stands.find((s) => s.stand_number === 'BDR-401');
  assert.equal(s401.allocation_status, 'COMPLETED');
  assert.equal(s401.water_status, 'CERTIFIED');
  const json = JSON.stringify(reg.body);
  assert.ok(!json.includes('Sibanda') && !json.includes('63-189442') && !json.includes('263774'), 'no names, IDs or phones');

  const quota = await api('GET', '/api/v1/public/quota-summary?scheme=Budiriro%20Phase%202');
  assert.ok(quota.body.quotas.some((q) => q.quota_category === 'YOUTH' && q.taken === 1));
});

test('audit chain is intact after the whole flow', async () => {
  assert.equal((await api('GET', '/api/v1/audit/verify', { auth: T.finance })).status, 403);
  const r = await api('GET', '/api/v1/audit/verify', { auth: T.admin });
  assert.equal(r.status, 200);
  assert.equal(r.body.intact, true);
  assert.ok(r.body.blocks > 10);
});
