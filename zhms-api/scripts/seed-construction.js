// Demo construction project: budget, materials, plant, programme, site diaries, an inspection with NCRs,
// subcontractors and an open tender. Written through the real services, so every business rule applies.
// Safe to re-run: does nothing if the demo project already exists.
// Usage: npm run seed:construction   (after `npm run migrate`)
import path from 'node:path';
import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env'));
} catch {
  try { process.loadEnvFile(); } catch { /* environment already set */ }
}

import { createDb } from '../src/db.js';
import { JobCostService } from '../src/jobCostService.js';
import { SiteProgressService } from '../src/siteProgressService.js';
import { TenderService } from '../src/tenderService.js';
import { QualityService } from '../src/qualityService.js';
import { EquipmentService } from '../src/equipmentService.js';
import { todayHarare, addDays } from '../src/dates.js';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}
const db = createDb(process.env.DATABASE_URL, { max: 2 });
const jobCost = new JobCostService(db);
const progress = new SiteProgressService(db);
const tenders = new TenderService(db);
const quality = new QualityService(db);
const plant = new EquipmentService(db);
const today = todayHarare();
const ago = (n) => addDays(today, -n);
const CODE = 'BUD2-CIVILS';
const actor = 'seed';

async function seedMaterials(db, jobCost, actor) {
  for (const m of [
    { materialCode: 'CEM-325', name: 'Cement 32.5N 50 kg', unit: 'BAG', standardRateUsd: '9.50' },
    { materialCode: 'UPVC-160', name: 'uPVC sewer pipe 160 mm x 6 m', unit: 'LENGTH', standardRateUsd: '38.00' },
    { materialCode: 'HDPE-110', name: 'HDPE water pipe 110 mm', unit: 'M', standardRateUsd: '6.40' },
    { materialCode: 'G5-GRAVEL', name: 'G5 gravel base course', unit: 'M3', standardRateUsd: '22.00' },
  ]) {
    const exists = await db.query('SELECT 1 FROM materials WHERE material_code = $1', [m.materialCode]);
    if (!exists.rowCount) await jobCost.createMaterial(m, actor);
  }
}

async function seedBudgetLines(pid, jobCost, actor) {
  const line = async (costCode, description, category, budgetUsd, extra = {}) =>
    (await jobCost.addBudgetLine(pid, { costCode, description, category, budgetUsd, ...extra }, actor)).line_id;
  const prelims = await line('00-PRE', 'Preliminaries & site establishment', 'OVERHEAD', '18000');
  const labour = await line('01-LAB', 'Direct labour', 'LABOUR', '42000');
  const plantLine = await line('02-PLT', 'Plant hire & own plant', 'EQUIPMENT', '36000');
  const cement = await line('03-CEM', 'Cement for manholes & thrust blocks', 'MATERIAL', '9500', { budgetQuantity: '1000', unit: 'BAG' });
  const pipe = await line('04-SEW', 'Sewer pipe supply', 'MATERIAL', '45600', { budgetQuantity: '1200', unit: 'LENGTH' });
  await line('05-RDS', 'Road base materials', 'MATERIAL', '66000', { budgetQuantity: '3000', unit: 'M3' });
  const sub = await line('06-SUB', 'Water reticulation subcontract', 'SUBCONTRACT', '120000');
  return { prelims, labour, plantLine, cement, pipe, sub };
}

async function seedEquipment(db, plant, actor) {
  // Plant is shared across projects: reuse a machine that is already registered.
  const machine = async (m) => {
    const { rows: [found] } = await db.query('SELECT * FROM equipment WHERE asset_tag = $1', [m.assetTag]);
    return found ?? plant.createEquipment(m, actor);
  };
  const tlb = await machine({ assetTag: 'TLB-01', name: 'CAT 428 backhoe loader', equipmentType: 'TLB', hourlyRateUsd: '55', hourMeter: '1180', lastServiceHours: '1000' });
  const grader = await machine({ assetTag: 'GRD-02', name: 'CAT 140K motor grader', equipmentType: 'Grader', hourlyRateUsd: '95', hourMeter: '4210', serviceIntervalHours: '500', lastServiceHours: '4000' });
  await machine({ assetTag: 'RLR-03', name: 'Bomag BW213 roller', equipmentType: 'Roller', hourlyRateUsd: '48', hourMeter: '2300', lastServiceHours: '2280' });
  return { tlb, grader };
}

async function seedMilestones(pid, progress, actor, ago, today, addDays) {
  const ms = async (name, weightPercent, plannedStart, plannedFinish) =>
    (await progress.createMilestone(pid, { name, weightPercent, plannedStart, plannedFinish }, actor)).milestone_id;
  const m1 = await ms('Site establishment & setting out', '10', ago(45), ago(35));
  const m2 = await ms('Sewer reticulation', '35', ago(34), addDays(today, 30));
  const m3 = await ms('Water reticulation', '25', ago(20), addDays(today, 60));
  await ms('Roads & storm drainage', '30', addDays(today, 20), addDays(today, 150));
  return { m1, m2, m3 };
}

async function seedSiteDiaries(pid, progress, actor, ago, m1, m2, m3) {
  const diary = (reportDate, body) => progress.submitDailyReport(pid, { reportDate, workersOnSite: 28, weather: 'SUNNY', ...body }, actor);
  await diary(ago(36), { workPerformed: 'Site camp complete, all stand pegs set out and checked', progress: [{ milestoneId: m1, percentComplete: '100' }] });
  await diary(ago(20), { workPerformed: 'Sewer trenching chainage 0-450, pipe laying started', progress: [{ milestoneId: m2, percentComplete: '25' }] });
  await diary(ago(9), { weather: 'HEAVY_RAIN', workersOnSite: 12, lostHours: '5', delays: 'Trenches flooded after storm', workPerformed: 'Dewatering, bedding repairs' });
  await diary(ago(2), { workPerformed: 'Manholes MH1-MH6 built; water main trenching started',
    progress: [{ milestoneId: m2, percentComplete: '42' }, { milestoneId: m3, percentComplete: '10' }] });
}

async function seedCostPostings(pid, jobCost, actor, ago, prelims, labour, plantLine, cement, pipe, tlb, grader) {
  const post = (kind, body) => ({
    material: jobCost.postMaterialIssue.bind(jobCost), labour: jobCost.postLabour.bind(jobCost),
    equipment: jobCost.postEquipmentUsage.bind(jobCost), overhead: jobCost.postOverhead.bind(jobCost),
  })[kind](pid, body, actor);
  await post('overhead', { lineId: prelims, amountUsd: '9800', description: 'Site camp, fencing and security (month 1)', entryDate: ago(40) });
  await post('overhead', { lineId: prelims, amountUsd: '7100', description: 'Site office, security and water (month 2)', entryDate: ago(5) });
  await post('labour', { lineId: labour, workerRef: 'Pipe gang A (8)', trade: 'Pipe laying', unit: 'DAY', quantity: '30', unitRateUsd: '160', entryDate: ago(15) });
  await post('labour', { lineId: labour, workerRef: 'Builders (4)', trade: 'Manholes', unit: 'DAY', quantity: '18', unitRateUsd: '90', entryDate: ago(3) });
  await post('material', { lineId: cement, materialCode: 'CEM-325', quantity: '520', entryDate: ago(12) });
  await post('material', { lineId: pipe, materialCode: 'UPVC-160', quantity: '480', entryDate: ago(18) });
  await post('equipment', { lineId: plantLine, equipmentId: tlb.equipment_id, hours: '9', entryDate: ago(20) });
  await post('equipment', { lineId: plantLine, equipmentId: tlb.equipment_id, hours: '10', entryDate: ago(4) });
  await post('equipment', { lineId: plantLine, equipmentId: grader.equipment_id, hours: '6', entryDate: ago(3) });
}

async function seedQualityInspections(pid, quality, actor, ago, m2) {
  await quality.createInspection(pid, {
    milestoneId: m2, inspectionType: 'SEWER_RETICULATION', location: 'MH3 to MH5', inspectedOn: ago(1),
    checklist: [
      { item: 'Pipe gradients to design', passed: true },
      { item: 'Manholes benched', passed: false, note: 'MH4 benching incomplete', severity: 'MINOR' },
      { item: 'Air / water test passed', passed: false, note: 'Joint leak between MH4 and MH5', severity: 'MAJOR' },
    ],
  }, actor);
}

async function seedSubcontractorsAndTenders(pid, db, tenders, actor, ago, today, addDays, sub) {
  const firm = async (name, registrationNo, trade, taxClearanceExpiry, userSub) => {
    const { rowCount: known } = await db.query('SELECT 1 FROM subcontractors WHERE registration_no = $1', [registrationNo]);
    if (!known) await tenders.createSubcontractor({ name, registrationNo, trade, contactPhone: '+263772000000', taxClearanceExpiry, userSub }, actor);
  };
  await firm('Aqua Civils (Pvt) Ltd', 'REG-2019-0412', 'Water reticulation', addDays(today, 220), 'sub_aqua');
  await firm('Mutare Pipe Works', 'REG-2016-0090', 'Water reticulation', addDays(today, 90));
  await firm('QuickBuild Contractors', 'REG-2022-1177', 'General civils', ago(10));
  await tenders.createTender(pid, {
    reference: 'TND/BUD2/2026/03', lineId: sub, title: 'Water reticulation — Phase 2',
    scope: 'Supply and lay 3.1 km of 110 mm HDPE water mains with valves, hydrants and 180 house connections.',
    estimateUsd: '115000', priceWeight: 70, technicalWeight: 30, closingAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
  }, actor);
}

async function runSeed() {
  try {
    const { rowCount } = await db.query('SELECT 1 FROM construction_projects WHERE code = $1', [CODE]);
    if (rowCount) {
      console.log(`Construction seed: ${CODE} already exists, nothing to do.`);
      return;
    }
    const p = await jobCost.createProject({
      code: CODE, name: 'Budiriro Phase 2 — roads, water & sewer', siteLocation: 'Budiriro, Harare', clientName: 'ZimBuild',
      contractValueUsd: '420000', startDate: ago(45), plannedEndDate: addDays(today, 150),
    }, actor);
    const pid = p.project_id;

    await seedMaterials(db, jobCost, actor);
    const { prelims, labour, plantLine, cement, pipe, sub } = await seedBudgetLines(pid, jobCost, actor);
    const { tlb, grader } = await seedEquipment(db, plant, actor);
    const { m1, m2, m3 } = await seedMilestones(pid, progress, actor, ago, today, addDays);
    await seedSiteDiaries(pid, progress, actor, ago, m1, m2, m3);
    await seedCostPostings(pid, jobCost, actor, ago, prelims, labour, plantLine, cement, pipe, tlb, grader);
    await seedQualityInspections(pid, quality, actor, ago, m2);
    await seedSubcontractorsAndTenders(pid, db, tenders, actor, ago, today, addDays, sub);

    console.log(`Construction seed complete: project ${CODE} with budget, costs, programme, site diary, QC and an open tender.`);
  } catch (err) {
    console.error('Construction seed failed:', err.message);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
}

runSeed();
