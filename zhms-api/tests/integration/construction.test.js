// Construction operations over HTTP: job costing, site progress, quality gates, tenders and subcontract
// claims, and plant maintenance. Each test builds on the project created in the first one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import jwt from 'jsonwebtoken';
import { createTestDatabase } from '../helpers/db.js';
import { createDb } from '../../src/db.js';
import { createApp } from '../../src/app.js';
import { JobCostService } from '../../src/jobCostService.js';
import { SiteProgressService, progressSummary } from '../../src/siteProgressService.js';
import { TenderService, evaluateBids } from '../../src/tenderService.js';
import { QualityService } from '../../src/qualityService.js';
import { EquipmentService } from '../../src/equipmentService.js';
import { todayHarare, addDays } from '../../src/dates.js';

const config = {
  jwtSecret: 'test_super_secret_jwt_key_at_least_32_chars_long_2026',
  jwtIssuer: 'zimbuild', jwtAudience: 'zhms', corsOrigins: [], nationalIdChecksum: false, webhookSecrets: {},
};
const token = (sub, roles = []) => jwt.sign({ sub, roles }, config.jwtSecret, { issuer: 'zimbuild', audience: 'zhms', expiresIn: '1h' });
const pm = token('pm_1', ['PROJECT_MANAGER']);
const qs = token('qs_1', ['QUANTITY_SURVEYOR']);
const qs2 = token('qs_2', ['QUANTITY_SURVEYOR']);
const site = token('site_1', ['SITE_SUPERVISOR']);
const qa = token('qa_1', ['QA_INSPECTOR']);
const plant = token('plant_1', ['PLANT_MANAGER']);
const finance = token('fin_1', ['FINANCE_MANAGER']);
const auditor = token('aud_1', ['AUDITOR']);
const applicant = token('buyer_1');
const subA = token('firm_a_user', ['SUBCONTRACTOR']);
const subB = token('firm_b_user', ['SUBCONTRACTOR']);

const today = todayHarare();
const daysAgo = (n) => addDays(today, -n);
const S = {}; // ids shared between tests
const immutable = (e) => e.code === 'IMMUTABLE_RECORD';

let testDb; let db; let server; let base;

async function api(method, path, { body, auth } = {}) {
  const res = await fetch(`${base}/api/v1/construction${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(auth && { Authorization: `Bearer ${auth}` }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}
const ok = async (p, status = 200) => {
  const r = await p;
  assert.equal(r.status, status, JSON.stringify(r.body));
  return r.body;
};
const fails = async (p, status, code) => {
  const r = await p;
  assert.equal(r.status, status, JSON.stringify(r.body));
  if (code) assert.equal(r.body.error, code, JSON.stringify(r.body));
  return r.body;
};

test.before(async () => {
  testDb = await createTestDatabase();
  db = createDb(testDb.url, { max: 5 });
  const services = {
    jobCost: new JobCostService(db), progress: new SiteProgressService(db), tenders: new TenderService(db),
    quality: new QualityService(db), equipment: new EquipmentService(db),
  };
  server = createApp(db, services, config).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  await new Promise((r) => server.close(r));
  await db.close();
  await testDb.drop();
});

test('projects: only project managers create them; construction staff can read, buyers cannot', async () => {
  const body = {
    code: 'bud-ph2-civils', name: 'Budiriro Phase 2 Civils', siteLocation: 'Budiriro, Harare', clientName: 'ZimBuild',
    contractValueUsd: '250000', startDate: daysAgo(40), plannedEndDate: addDays(today, 120),
  };
  await fails(api('POST', '/projects', { auth: qs, body }), 403, 'FORBIDDEN_ROLE');
  await fails(api('POST', '/projects', { auth: pm, body: { ...body, plannedEndDate: daysAgo(60) } }), 400);
  const { project } = await ok(api('POST', '/projects', { auth: pm, body }), 201);
  assert.equal(project.code, 'BUD-PH2-CIVILS');
  assert.equal(project.start_date, daysAgo(40));
  S.project = project.project_id;
  await fails(api('POST', '/projects', { auth: pm, body }), 409, 'PROJECT_CODE_EXISTS');

  await fails(api('GET', '/projects', { auth: applicant }), 403);
  await fails(api('GET', '/projects'), 401);
  const list = await ok(api('GET', '/projects', { auth: auditor }));
  assert.equal(list.projects.length, 1);
});

test('budget: locked baseline per cost code, approved adjustments, never negative', async () => {
  const line = (costCode, category, budgetUsd, extra = {}) =>
    ok(api('POST', `/projects/${S.project}/budget-lines`, { auth: qs, body: { costCode, description: `${category} works`, category, budgetUsd, ...extra } }), 201);
  S.cement = (await line('03-CEM', 'MATERIAL', '10000', { budgetQuantity: '1000', unit: 'BAG' })).line.line_id;
  S.labour = (await line('01-LAB', 'LABOUR', '5000')).line.line_id;
  S.plantLine = (await line('02-PLT', 'EQUIPMENT', '4000')).line.line_id;
  S.subLine = (await line('05-SUB', 'SUBCONTRACT', '60000')).line.line_id;
  S.prelims = (await line('00-PRE', 'OVERHEAD', '2000')).line.line_id;
  await fails(api('POST', `/projects/${S.project}/budget-lines`, { auth: qs, body: { costCode: '03-CEM', description: 'dup', category: 'MATERIAL', budgetUsd: '1' } }), 409, 'COST_CODE_EXISTS');
  await fails(api('POST', `/projects/${S.project}/budget-lines`, { auth: site, body: { costCode: 'X', description: 'x', category: 'MATERIAL', budgetUsd: '1' } }), 403);

  await fails(api('POST', `/projects/${S.project}/budget-lines/${S.prelims}/adjustments`, { auth: qs, body: { amountUsd: '500', reason: 'Site security' } }), 403);
  await ok(api('POST', `/projects/${S.project}/budget-lines/${S.prelims}/adjustments`, { auth: pm, body: { amountUsd: '500', reason: 'Additional site security' } }), 201);
  await fails(api('POST', `/projects/${S.project}/budget-lines/${S.prelims}/adjustments`, { auth: pm, body: { amountUsd: '-2600', reason: 'Too large a cut' } }), 409, 'BUDGET_NEGATIVE');
  const { lines } = await ok(api('GET', `/projects/${S.project}/budget-lines`, { auth: site }));
  assert.equal(lines.find((l) => l.line_id === S.prelims).revised_budget_usd, '2500.00');

  await assert.rejects(db.query(`UPDATE project_budget_lines SET original_budget_usd = 1 WHERE line_id = $1`, [S.cement]), immutable);
});

test('cost ledger: material, labour, plant and overheads post to the right lines at quantity x rate', async () => {
  await ok(api('POST', '/materials', { auth: qs, body: { materialCode: 'cem-325', name: 'Cement 32.5N 50kg', unit: 'BAG', standardRateUsd: '9.50' } }), 201);
  await fails(api('POST', '/materials', { auth: qs, body: { materialCode: 'CEM-325', name: 'x', unit: 'BAG', standardRateUsd: '1' } }), 409, 'MATERIAL_EXISTS');

  const mat = await ok(api('POST', `/projects/${S.project}/cost-entries/material`, {
    auth: site, body: { lineId: S.cement, materialCode: 'CEM-325', quantity: '400', entryDate: daysAgo(10) } }), 201);
  assert.equal(mat.entry.amount_usd, '3800.00');
  // Issuing material against a labour line is refused by the database.
  await fails(api('POST', `/projects/${S.project}/cost-entries/material`, {
    auth: site, body: { lineId: S.labour, materialCode: 'CEM-325', quantity: '1' } }), 409, 'COST_CATEGORY_MISMATCH');
  await fails(api('POST', `/projects/${S.project}/cost-entries/material`, {
    auth: site, body: { lineId: S.cement, materialCode: 'CEM-325', quantity: '1', entryDate: addDays(today, 1) } }), 400);
  await fails(api('POST', `/projects/${S.project}/cost-entries/material`, {
    auth: site, body: { lineId: S.cement, materialCode: 'CEM-325', quantity: '1', entryDate: daysAgo(400) } }), 400);

  const lab = await ok(api('POST', `/projects/${S.project}/cost-entries/labour`, {
    auth: site, body: { lineId: S.labour, workerRef: 'Gang A (6 builders)', trade: 'Brickwork', unit: 'DAY', quantity: '30', unitRateUsd: '45.333', entryDate: daysAgo(5) } }), 201);
  assert.equal(lab.entry.amount_usd, '1359.99', '30 x 45.333 = 1359.99');

  const { equipment: tlb } = await ok(api('POST', '/equipment', {
    auth: plant, body: { assetTag: 'TLB-01', name: 'CAT 428 backhoe loader', equipmentType: 'TLB', hourlyRateUsd: '55', hourMeter: '1200', serviceIntervalHours: '250', lastServiceHours: '1000' } }), 201);
  S.tlb = tlb.equipment_id;
  assert.equal(tlb.hours_since_service, 200);
  assert.equal(tlb.service_due_soon, false);
  await fails(api('POST', `/projects/${S.project}/cost-entries/equipment`, {
    auth: site, body: { lineId: S.plantLine, equipmentId: S.tlb, hours: '30.5', entryDate: daysAgo(3) } }), 400, 'INVALID_QUANTITY');
  await ok(api('POST', `/projects/${S.project}/cost-entries/equipment`, {
    auth: site, body: { lineId: S.plantLine, equipmentId: S.tlb, hours: '8', entryDate: daysAgo(3) } }), 201);
  await ok(api('POST', `/projects/${S.project}/cost-entries/equipment`, {
    auth: site, body: { lineId: S.plantLine, equipmentId: S.tlb, hours: '22', entryDate: daysAgo(2) } }), 201);
  const { equipment: fleet } = await ok(api('GET', '/equipment', { auth: site }));
  assert.equal(Number(fleet[0].hour_meter), 1230, 'hours are added to the hour meter');
  assert.equal(fleet[0].service_due_soon, true, '230 of 250 hours run');

  await fails(api('POST', `/projects/${S.project}/cost-entries/overhead`, { auth: site, body: { lineId: S.prelims, amountUsd: '1', description: 'x' } }), 403);
  const oh = await ok(api('POST', `/projects/${S.project}/cost-entries/overhead`, {
    auth: qs, body: { lineId: S.prelims, amountUsd: '2400', description: 'Site office and security' } }), 201);

  // Corrections are reversals, never edits; an entry can be reversed exactly once.
  const rev = await ok(api('POST', `/cost-entries/${oh.entry.entry_id}/reverse`, { auth: qs, body: { reason: 'Posted to the wrong month' } }), 201);
  assert.equal(rev.entry.amount_usd, '-2400.00');
  await fails(api('POST', `/cost-entries/${oh.entry.entry_id}/reverse`, { auth: qs, body: { reason: 'Posted twice' } }), 409, 'ENTRY_ALREADY_REVERSED');
  await fails(api('POST', `/cost-entries/${rev.entry.entry_id}/reverse`, { auth: qs, body: { reason: 'Undo the undo' } }), 409, 'CANNOT_REVERSE_REVERSAL');
  await ok(api('POST', `/projects/${S.project}/cost-entries/overhead`, {
    auth: qs, body: { lineId: S.prelims, amountUsd: '2400', description: 'Site office and security', entryDate: daysAgo(1) } }), 201);
  await assert.rejects(db.query('DELETE FROM cost_entries'), immutable);

  const { entries } = await ok(api('GET', `/projects/${S.project}/cost-entries?category=OVERHEAD`, { auth: auditor }));
  assert.equal(entries.length, 3);
  assert.equal(entries.find((e) => e.entry_id === oh.entry.entry_id).reversed, true);
});

test('site progress: weighted milestones, one diary per day, progress only moves forward', async () => {
  const ms = (name, weight, from, to) => ok(api('POST', `/projects/${S.project}/milestones`, {
    auth: pm, body: { name, weightPercent: weight, plannedStart: from, plannedFinish: to } }), 201);
  S.m1 = (await ms('Setting out & earthworks', '20', daysAgo(40), daysAgo(21))).milestone.milestone_id;
  S.m2 = (await ms('Water reticulation', '50', daysAgo(20), addDays(today, 19))).milestone.milestone_id;
  S.m3 = (await ms('Roads & storm drains', '30', addDays(today, 20), addDays(today, 100))).milestone.milestone_id;
  await fails(api('POST', `/projects/${S.project}/milestones`, {
    auth: pm, body: { name: 'Extra', weightPercent: '1', plannedStart: today, plannedFinish: today } }), 409, 'MILESTONE_WEIGHTS_EXCEED_100');

  const report = (date, body = {}) => api('POST', `/projects/${S.project}/daily-reports`, {
    auth: site, body: { reportDate: date, weather: 'SUNNY', workersOnSite: 24, workPerformed: 'Trenching for water mains', ...body } });
  await ok(report(daysAgo(22), { progress: [{ milestoneId: S.m1, percentComplete: '100' }] }), 201);
  await ok(report(daysAgo(1), {
    weather: 'HEAVY_RAIN', lostHours: '4', delays: 'Trenches flooded', progress: [{ milestoneId: S.m2, percentComplete: '30', note: 'Chainage 0-600 laid' }] }), 201);
  await fails(report(daysAgo(1)), 409, 'DAILY_REPORT_EXISTS');
  await fails(report(addDays(today, 1)), 400);
  await fails(report(today, { lostHours: '2' }), 400, 'DELAY_REASON_REQUIRED');
  await fails(report(today, { safetyIncidents: 1 }), 400, 'SAFETY_NOTES_REQUIRED');
  await fails(report(today, { progress: [{ milestoneId: S.m2, percentComplete: '20' }] }), 409, 'PROGRESS_CANNOT_DECREASE');
  const { rows: [n] } = await db.query('SELECT count(*)::int AS n FROM daily_site_reports WHERE report_date = $1', [today]);
  assert.equal(n.n, 0, 'a refused report leaves nothing behind');
  await fails(api('POST', `/projects/${S.project}/daily-reports`, { auth: qa, body: {} }), 403);

  const p = await ok(api('GET', `/projects/${S.project}/progress`, { auth: pm }));
  // actual: 20% x 100 + 50% x 30 = 35%. planned today: m1 done (20) + m2 21/40 days (26.25) = 46.25%.
  assert.equal(p.summary.percentComplete, 35);
  assert.equal(p.summary.plannedPercent, 46.3);
  assert.equal(p.summary.status, 'BEHIND');
  assert.equal(p.milestones.find((m) => m.milestone_id === S.m1).actual_finish, daysAgo(22));
  assert.equal(p.milestones.find((m) => m.milestone_id === S.m1).state, 'COMPLETED');
  assert.deepEqual(p.curve.map((c) => c.actual), [20, 35]);
  assert.equal(p.diary.lostHours, 4);
  assert.equal(p.diary.wetDays, 1);
  assert.equal(p.diary.daysSinceLastReport, 1);

  const { reports } = await ok(api('GET', `/projects/${S.project}/daily-reports`, { auth: qa }));
  assert.equal(reports[0].progress[0].note, 'Chainage 0-600 laid');
});

test('quality: failed checklist items open NCRs that block milestone completion until independently verified', async () => {
  const insp = await ok(api('POST', `/projects/${S.project}/inspections`, {
    auth: qa, body: {
      milestoneId: S.m2, inspectionType: 'WATER_RETICULATION', location: 'Chainage 0-600', inspectedOn: daysAgo(1),
      checklist: [
        { item: 'Pipe bedding 150 mm sand', passed: true },
        { item: 'Pressure test 10 bar for 2 h', passed: false, note: 'Lost 0.8 bar', severity: 'CRITICAL' },
        { item: 'Thrust blocks at bends', passed: false, note: 'Missing at CH 420' },
      ],
    } }), 201);
  assert.equal(insp.inspection.result, 'FAIL');
  assert.deepEqual(insp.ncrs.map((n) => [n.ncr_no, n.severity, n.due_date]),
    [['NCR-BUD-PH2-CIVILS-0001', 'CRITICAL', addDays(daysAgo(1), 2)], ['NCR-BUD-PH2-CIVILS-0002', 'MAJOR', addDays(daysAgo(1), 7)]]);
  const [critical, major] = insp.ncrs;
  await fails(api('POST', `/projects/${S.project}/inspections`, { auth: site, body: {} }), 403);
  await fails(api('POST', `/projects/${S.project}/inspections`, {
    auth: qa, body: { inspectionType: 'FINAL', location: 'x', checklist: [{ item: 'x', passed: 'yes' }] } }), 400, 'INVALID_CHECKLIST');

  const complete = () => api('POST', `/projects/${S.project}/daily-reports`, {
    auth: site, body: { reportDate: today, weather: 'SUNNY', workersOnSite: 20, workPerformed: 'Retest', progress: [{ milestoneId: S.m2, percentComplete: '100' }] } });
  await fails(complete(), 409, 'OPEN_NCR_BLOCKS_COMPLETION');

  await fails(api('POST', `/ncrs/${critical.ncr_id}/close`, { auth: qa, body: { verificationNote: 'Looks fine' } }), 409, 'INVALID_NCR_STATE');
  await ok(api('POST', `/ncrs/${critical.ncr_id}/resolve`, { auth: site, body: { correctiveAction: 'Re-made 3 joints, retested at 10 bar' } }));
  await ok(api('POST', `/ncrs/${critical.ncr_id}/reopen`, { auth: qa, body: { reason: 'Retest certificate missing' } }));
  await ok(api('POST', `/ncrs/${critical.ncr_id}/resolve`, { auth: site, body: { correctiveAction: 'Retested, certificate PT-114 attached' } }));
  await ok(api('POST', `/ncrs/${critical.ncr_id}/close`, { auth: qa, body: { verificationNote: 'Witnessed retest, no pressure loss' } }));
  // The person who fixed a defect cannot sign it off.
  const both = token('site_qa', ['SITE_SUPERVISOR', 'QA_INSPECTOR']);
  await ok(api('POST', `/ncrs/${major.ncr_id}/resolve`, { auth: both, body: { correctiveAction: 'Thrust block cast at CH 420' } }));
  await fails(api('POST', `/ncrs/${major.ncr_id}/close`, { auth: both, body: { verificationNote: 'Fine by me' } }), 403, 'SEGREGATION_OF_DUTIES');
  await ok(api('POST', `/ncrs/${major.ncr_id}/close`, { auth: qa, body: { verificationNote: 'Block cured, dimensions checked' } }));

  const summary = await ok(api('GET', `/projects/${S.project}/quality-summary`, { auth: pm }));
  assert.equal(summary.inspections, 1);
  assert.equal(summary.closed, 2);
  assert.equal(summary.first_time_pass_rate, 0);
  await ok(complete(), 201);
  await assert.rejects(db.query(`UPDATE non_conformances SET description = 'edited'`), immutable);
});

test('tenders: sealed bids, weighted evaluation, compliance and justified award', async () => {
  const firm = (name, reg, userSub, expiry) => ok(api('POST', '/subcontractors', {
    auth: qs, body: { name, registrationNo: reg, trade: 'Civils', contactPhone: '+263771000001', taxClearanceExpiry: expiry, userSub } }), 201);
  S.firmA = (await firm('Alpha Civils', 'REG-001', 'firm_a_user', addDays(today, 200))).subcontractor.subcontractor_id;
  S.firmB = (await firm('Beta Pipes', 'REG-002', 'firm_b_user', addDays(today, 200))).subcontractor.subcontractor_id;
  S.firmC = (await firm('Cheap Co', 'REG-003', null, daysAgo(3))).subcontractor.subcontractor_id;

  await fails(api('POST', `/projects/${S.project}/tenders`, {
    auth: pm, body: { reference: 'T-1', lineId: S.cement, title: 'x', scope: 'x', estimateUsd: '1', closingAt: new Date(Date.now() + 60_000).toISOString() } }), 400, 'LINE_NOT_SUBCONTRACT');
  const closesAt = Date.now() + 2500;
  const { tender } = await ok(api('POST', `/projects/${S.project}/tenders`, {
    auth: pm, body: { reference: 'TND/BUD/2026/07', lineId: S.subLine, title: 'Sewer reticulation', scope: '2.4 km of 160 mm uPVC sewer with manholes',
      estimateUsd: '55000', priceWeight: 70, technicalWeight: 30, minTechnicalScore: '60', closingAt: new Date(closesAt).toISOString() } }), 201);
  S.tender = tender.tender_id;

  await ok(api('POST', `/tenders/${S.tender}/bids`, { auth: subA, body: { amountUsd: '50000', durationDays: 90, methodology: 'Two crews' } }), 201);
  await ok(api('POST', `/tenders/${S.tender}/bids`, { auth: subB, body: { amountUsd: '45000', durationDays: 120 } }), 201);
  await ok(api('POST', `/tenders/${S.tender}/bids`, { auth: qs, body: { subcontractorId: S.firmC, amountUsd: '30000', durationDays: 60 } }), 201);
  await fails(api('POST', `/tenders/${S.tender}/bids`, { auth: subA, body: { amountUsd: '49000', durationDays: 90 } }), 409, 'BID_ALREADY_SUBMITTED');

  const sealed = await ok(api('GET', `/tenders/${S.tender}`, { auth: pm }));
  assert.equal(sealed.sealed, true);
  assert.ok(sealed.bids.every((b) => b.amount_usd === null), 'prices hidden until closing');
  const mine = await ok(api('GET', `/tenders/${S.tender}`, { auth: subB }));
  assert.equal(mine.bids.length, 1);
  assert.equal(mine.bids[0].amount_usd, '45000.00');
  assert.equal(mine.tender.estimate_usd, undefined, 'bidders never see the estimate');
  const forSub = await ok(api('GET', '/tenders', { auth: subA }));
  assert.equal(forSub.tenders[0].my_bid, true);
  assert.equal(forSub.tenders[0].bid_count, undefined);

  await fails(api('POST', `/tenders/${S.tender}/close`, { auth: pm }), 409, 'TENDER_STILL_OPEN');
  await new Promise((r) => setTimeout(r, Math.max(0, closesAt - Date.now()) + 100));
  await fails(api('POST', `/tenders/${S.tender}/bids`, { auth: qs, body: { subcontractorId: S.firmC, amountUsd: '1', durationDays: 1 } }), 409);
  await ok(api('POST', `/tenders/${S.tender}/close`, { auth: pm }));
  await fails(api('POST', `/tenders/${S.tender}/bids`, { auth: subA, body: { amountUsd: '1', durationDays: 1 } }), 409, 'TENDER_NOT_OPEN');

  const bids = (await ok(api('GET', `/tenders/${S.tender}`, { auth: qs }))).bids;
  const bidOf = (id) => bids.find((b) => b.subcontractor_id === id).bid_id;
  S.bidA = bidOf(S.firmA); S.bidB = bidOf(S.firmB); S.bidC = bidOf(S.firmC);
  await fails(api('POST', `/tenders/${S.tender}/award`, { auth: pm, body: { bidId: S.bidB, startDate: today } }), 409, 'EVALUATION_INCOMPLETE');
  await fails(api('PUT', `/tenders/${S.tender}/bids/${S.bidA}/score`, { auth: pm, body: { technicalScore: 90 } }), 403);
  await ok(api('PUT', `/tenders/${S.tender}/bids/${S.bidA}/score`, { auth: qs, body: { technicalScore: 90 } }));
  await ok(api('PUT', `/tenders/${S.tender}/bids/${S.bidB}/score`, { auth: qs, body: { technicalScore: 70 } }));
  await ok(api('PUT', `/tenders/${S.tender}/bids/${S.bidC}/score`, { auth: qs, body: { technicalScore: 95 } }));
  await assert.rejects(db.query('UPDATE tender_bids SET amount_usd = 1 WHERE bid_id = $1', [S.bidA]), immutable);

  const { evaluation } = await ok(api('GET', `/tenders/${S.tender}`, { auth: pm }));
  // Cheap Co's tax clearance had expired at closing: non-compliant despite the lowest price.
  // Beta: price 100 x .7 + 70 x .3 = 91.  Alpha: 45000/50000 = 90 x .7 + 90 x .3 = 90.
  assert.deepEqual(evaluation.bids.map((b) => [b.subcontractor_name, b.rank, b.combined_score]),
    [['Beta Pipes', 1, 91], ['Alpha Civils', 2, 90], ['Cheap Co', null, null]]);
  assert.match(evaluation.bids[2].non_compliance[0], /tax clearance/);
  assert.equal(evaluation.recommendedBidId, S.bidB);

  await fails(api('POST', `/tenders/${S.tender}/award`, { auth: pm, body: { bidId: S.bidC, startDate: today } }), 409, 'BID_NOT_COMPLIANT');
  await fails(api('POST', `/tenders/${S.tender}/award`, { auth: pm, body: { bidId: S.bidA, startDate: today } }), 400, 'JUSTIFICATION_REQUIRED');
  await fails(api('POST', `/tenders/${S.tender}/award`, { auth: qs, body: { bidId: S.bidA, startDate: today } }), 403);
  const award = await ok(api('POST', `/tenders/${S.tender}/award`, {
    auth: pm, body: { bidId: S.bidA, startDate: daysAgo(30), retentionPercent: '10', paymentTermsDays: 30,
      justification: 'Beta Pipes needs 120 days; the programme needs completion in 90 days.' } }), 201);
  assert.equal(award.subcontract.contract_no, 'SC-BUD-PH2-CIVILS-001');
  assert.equal(award.subcontract.original_value_usd, '50000.00');
  assert.equal(award.subcontract.end_date, addDays(daysAgo(30), 90));
  assert.equal(award.budgetWarning, null);
  S.sc = award.subcontract.subcontract_id;
  await fails(api('POST', `/tenders/${S.tender}/award`, { auth: pm, body: { bidId: S.bidB, startDate: today } }), 409, 'TENDER_NOT_IN_EVALUATION');
});

test('subcontract claims: cumulative valuation, retention, certification, payment and contract ceiling', async () => {
  await fails(api('POST', `/subcontracts/${S.sc}/claims`, { auth: subB, body: { periodEnd: today, claimedCumulativeUsd: '1000' } }), 403);
  await fails(api('POST', `/subcontracts/${S.sc}/claims`, { auth: subA, body: { periodEnd: today, claimedCumulativeUsd: '50000.01' } }), 409, 'CLAIM_EXCEEDS_CONTRACT');
  const c1 = (await ok(api('POST', `/subcontracts/${S.sc}/claims`, { auth: subA, body: { periodEnd: daysAgo(1), claimedCumulativeUsd: '20000' } }), 201)).claim;
  await fails(api('POST', `/subcontracts/${S.sc}/claims`, { auth: subA, body: { periodEnd: today, claimedCumulativeUsd: '21000' } }), 409, 'CLAIM_ALREADY_OPEN');
  await fails(api('POST', `/claims/${c1.claim_id}/certify`, { auth: qs, body: { certifiedCumulativeUsd: '20000.01' } }), 400, 'CERTIFIED_ABOVE_CLAIM');
  const cert1 = (await ok(api('POST', `/claims/${c1.claim_id}/certify`, { auth: qs, body: { certifiedCumulativeUsd: '18000' } }))).claim;
  assert.deepEqual([cert1.gross_this_period_usd, cert1.retention_this_period_usd, cert1.net_payable_usd], ['18000.00', '1800.00', '16200.00']);
  assert.equal(cert1.payment_due_date, addDays(today, 30));

  // A claim entered by a QS cannot be certified by the same QS.
  const c2 = (await ok(api('POST', `/subcontracts/${S.sc}/claims`, { auth: qs, body: { periodEnd: today, claimedCumulativeUsd: '30000' } }), 201)).claim;
  assert.equal(c2.claim_no, 2);
  await fails(api('POST', `/claims/${c2.claim_id}/certify`, { auth: qs, body: { certifiedCumulativeUsd: '30000' } }), 403, 'SEGREGATION_OF_DUTIES');
  await fails(api('POST', `/claims/${c2.claim_id}/certify`, { auth: qs2, body: { certifiedCumulativeUsd: '17000' } }), 400, 'CERTIFIED_BELOW_PREVIOUS');
  await ok(api('POST', `/claims/${c2.claim_id}/certify`, { auth: qs2, body: { certifiedCumulativeUsd: '30000' } }));

  await fails(api('POST', `/claims/${c1.claim_id}/pay`, { auth: qs, body: { paymentReference: 'x' } }), 403);
  await ok(api('POST', `/claims/${c1.claim_id}/pay`, { auth: finance, body: { paymentReference: 'CBZ-RTGS-88231' } }));
  await fails(api('POST', `/claims/${c1.claim_id}/pay`, { auth: finance, body: { paymentReference: 'again' } }), 409, 'CLAIM_NOT_CERTIFIED');

  await fails(api('POST', `/subcontracts/${S.sc}/variations`, { auth: pm, body: { amountUsd: '-25000', reason: 'Scope reduction' } }), 409, 'CLAIM_EXCEEDS_CONTRACT');
  await ok(api('POST', `/subcontracts/${S.sc}/variations`, { auth: pm, body: { amountUsd: '6500', reason: 'Additional manholes MH14-MH17' } }), 201);

  const view = await ok(api('GET', `/subcontracts/${S.sc}`, { auth: subA }));
  assert.deepEqual(view.totals, {
    original_value_usd: 50000, variations_usd: 6500, revised_value_usd: 56500, certified_to_date_usd: 30000, remaining_value_usd: 26500,
    retention_held_usd: 3000, paid_to_date_usd: 16200, certified_unpaid_usd: 10800, percent_certified: 53.1,
  });
  await fails(api('GET', `/subcontracts/${S.sc}`, { auth: subB }), 403);
  assert.equal((await ok(api('GET', '/subcontracts', { auth: subB }))).subcontracts.length, 0);
});

test('job cost report: budget vs actual vs commitments, category roll-up and earned value', async () => {
  const r = await ok(api('GET', `/projects/${S.project}/job-cost-report`, { auth: auditor }));
  const line = (code) => r.lines.find((l) => l.cost_code === code);
  assert.deepEqual(
    [line('03-CEM').actual_usd, line('03-CEM').actual_quantity, line('03-CEM').quantity_variance, line('03-CEM').status],
    [3800, 400, 600, 'WITHIN_BUDGET']);
  assert.equal(line('01-LAB').actual_usd, 1359.99);
  assert.equal(line('02-PLT').actual_usd, 1650, '30 h x $55');
  assert.deepEqual([line('00-PRE').revised_budget_usd, line('00-PRE').actual_usd, line('00-PRE').status], [2500, 2400, 'AT_RISK']);
  // Subcontract: $30,000 certified is actual cost; $26,500 of the $56,500 contract is still committed.
  assert.deepEqual(
    [line('05-SUB').actual_usd, line('05-SUB').committed_usd, line('05-SUB').open_commitment_usd, line('05-SUB').forecast_final_usd, line('05-SUB').variance_usd],
    [30000, 56500, 26500, 56500, 3500]);
  assert.equal(r.totals.revised_budget_usd, 81500);
  assert.equal(r.totals.actual_usd, 39209.99);
  assert.equal(r.totals.forecast_final_usd, 65709.99);
  assert.deepEqual(r.alerts.map((a) => a.cost_code), ['00-PRE']);
  assert.equal(r.byCategory.find((c) => c.category === 'SUBCONTRACT').forecast_final_usd, 56500);
  // Progress 20 + 50 = 70% complete -> EV = 81,500 x 0.70 = 57,050; CPI = 57,050 / 39,209.99.
  assert.equal(r.earnedValue.percentComplete, 70);
  assert.equal(r.earnedValue.ev_usd, 57050);
  assert.equal(r.earnedValue.cpi, 1.455);
  assert.deepEqual(r.materialConsumption.map((m) => [m.material_code, m.quantity]), [['CEM-325', 400]]);
  assert.deepEqual(r.equipmentUsage.map((m) => [m.asset_tag, m.hours]), [['TLB-01', 30]]);
});

test('plant: a breakdown stops the machine booking hours; preventive service resets the service clock', async () => {
  const usage = () => api('POST', `/projects/${S.project}/cost-entries/equipment`, { auth: site, body: { lineId: S.plantLine, equipmentId: S.tlb, hours: '25' } });
  await fails(usage(), 400);
  const { log } = await ok(api('POST', `/equipment/${S.tlb}/maintenance`, {
    auth: site, body: { maintenanceType: 'BREAKDOWN', description: 'Hydraulic hose burst on boom', projectId: S.project } }), 201);
  await fails(api('POST', `/equipment/${S.tlb}/maintenance`, { auth: site, body: { maintenanceType: 'CORRECTIVE', description: 'x' } }), 409, 'MAINTENANCE_ALREADY_OPEN');
  await fails(api('POST', `/projects/${S.project}/cost-entries/equipment`, {
    auth: site, body: { lineId: S.plantLine, equipmentId: S.tlb, hours: '2' } }), 409, 'EQUIPMENT_UNAVAILABLE');
  await fails(api('PUT', `/equipment/${S.tlb}/status`, { auth: plant, body: { status: 'AVAILABLE' } }), 409, 'MAINTENANCE_ALREADY_OPEN');
  await fails(api('POST', `/maintenance/${log.log_id}/complete`, { auth: site, body: { workDone: 'Replaced hose' } }), 403);
  await fails(api('POST', `/maintenance/${log.log_id}/complete`, { auth: plant, body: { workDone: 'Replaced hose', hourMeterReading: '1100' } }), 400, 'METER_GOES_BACKWARDS');
  const done = await ok(api('POST', `/maintenance/${log.log_id}/complete`, {
    auth: plant, body: { workDone: 'Replaced boom hose and topped up hydraulic oil', partsCostUsd: '180', labourCostUsd: '60' } }));
  assert.equal(done.equipment.status, 'AVAILABLE');
  assert.ok(Number(done.log.downtime_hours) >= 0);
  await ok(api('POST', `/projects/${S.project}/cost-entries/equipment`, { auth: site, body: { lineId: S.plantLine, equipmentId: S.tlb, hours: '22' } }), 201);

  const { equipment: [due] } = await ok(api('GET', '/equipment', { auth: pm }));
  assert.equal(due.service_due, true, '252 hours since the last service');
  const svc = await ok(api('POST', `/equipment/${S.tlb}/maintenance`, { auth: plant, body: { maintenanceType: 'PREVENTIVE', description: '250 h service' } }), 201);
  const after = await ok(api('POST', `/maintenance/${svc.log.log_id}/complete`, {
    auth: plant, body: { workDone: 'Oil, filters and greasing', partsCostUsd: '320', hourMeterReading: '1255' } }));
  assert.deepEqual([after.equipment.hours_since_service, after.equipment.service_due], [0, false]);

  const fleet = await ok(api('GET', '/equipment/fleet-summary', { auth: auditor }));
  assert.deepEqual([fleet.equipment[0].breakdowns, fleet.equipment[0].maintenance_cost_usd, fleet.equipment[0].hours_worked], [1, 560, 52]);
  const { logs } = await ok(api('GET', `/equipment/${S.tlb}/maintenance`, { auth: pm }));
  assert.equal(logs.length, 2);
  await assert.rejects(db.query(`UPDATE maintenance_logs SET work_done = 'x' WHERE log_id = $1`, [log.log_id]), immutable);
});

test('project closure needs every NCR closed and every claim paid; closed projects take no cost', async () => {
  await ok(api('PUT', `/projects/${S.project}/status`, { auth: pm, body: { status: 'COMPLETED' } }));
  await fails(api('PUT', `/projects/${S.project}/status`, { auth: pm, body: { status: 'CLOSED' } }), 409, 'PROJECT_HAS_OPEN_ITEMS');
  const { claims } = await ok(api('GET', `/subcontracts/${S.sc}`, { auth: finance }));
  await ok(api('POST', `/claims/${claims.find((c) => c.status === 'CERTIFIED').claim_id}/pay`, { auth: finance, body: { paymentReference: 'CBZ-RTGS-90001' } }));
  await ok(api('PUT', `/projects/${S.project}/status`, { auth: pm, body: { status: 'CLOSED' } }));
  await fails(api('POST', `/projects/${S.project}/cost-entries/overhead`, {
    auth: qs, body: { lineId: S.prelims, amountUsd: '10', description: 'Late invoice' } }), 409, 'PROJECT_CLOSED');
  await fails(api('PUT', `/projects/${S.project}/status`, { auth: pm, body: { status: 'ACTIVE' } }), 409, 'INVALID_STATUS_CHANGE');

  const { rows: [chain] } = await db.query('SELECT verify_audit_chain() AS bad, (SELECT count(*)::int FROM audit_log) AS n');
  assert.equal(chain.bad, null, 'audit chain intact');
  assert.ok(chain.n > 40);
});

test('pure helpers: schedule maths and bid evaluation', () => {
  const m = (w, pct, s, e) => ({ weight_percent: w, percent_complete: pct, planned_start: s, planned_finish: e });
  assert.equal(progressSummary([], '2026-01-01').status, 'NO_SCHEDULE');
  const s = progressSummary([m(50, 100, '2026-01-01', '2026-01-10'), m(50, 0, '2026-01-11', '2026-01-20')], '2026-01-15');
  assert.deepEqual([s.percentComplete, s.plannedPercent, s.status], [50, 75, 'BEHIND']);

  const tender = { closing_at: '2026-03-01T08:00:00Z', min_technical_score: '60', price_weight: 80, technical_weight: 20 };
  const bid = (id, amount, tech, extra = {}) => ({ bid_id: id, amount_usd: amount, technical_score: tech, subcontractor_status: 'ACTIVE',
    tax_clearance_expiry: '2026-12-31', submitted_at: '2026-02-01T00:00:00Z', ...extra });
  const e = evaluateBids(tender, [bid('a', '100', '80'), bid('b', '100', '80', { submitted_at: '2026-01-01T00:00:00Z' }), bid('c', '50', '59'), bid('d', '10', null)]);
  assert.equal(e.complete, false);
  assert.deepEqual(e.bids.map((b) => [b.bid_id, b.rank]), [['b', 1], ['a', 2], ['c', null], ['d', null]], 'ties go to the earlier bid');
});

test('demo seed runs through the real services and is safe to re-run', () => {
  const run = () => spawnSync(process.execPath, ['scripts/seed-construction.js'], { env: { ...process.env, DATABASE_URL: testDb.url }, encoding: 'utf8' });
  const first = run();
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /seed complete/);
  const second = run();
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /already exists/);
});
