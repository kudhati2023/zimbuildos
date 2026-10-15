import express from 'express';
import { authenticate, requireRole, ROLES, CONSTRUCTION_READ_ROLES } from './auth.js';
import { todayHarare } from './dates.js';
import * as f from './fields.js';

const { PROJECT_MANAGER: PM, QUANTITY_SURVEYOR: QS, SITE_SUPERVISOR: SS, QA_INSPECTOR: QA, PLANT_MANAGER: PLANT,
  SUBCONTRACTOR, FINANCE_MANAGER, ENGINEER } = ROLES;

/** Wraps an async handler: `fn(req)` returns the body; errors go to the central error handler. */
const handle = (fn, status = 200) => async (req, res, next) => {
  try {
    res.status(status).json(await fn(req));
  } catch (e) { next(e); }
};
const asOf = (req) => f.date(req.query.asOf ?? todayHarare(), 'asOf');

/**
 * Construction operations API, mounted at /api/v1/construction. Every route needs a signed-in user;
 * each write is limited to the role that owns that step. Reads are open to construction staff,
 * the CEO, finance and audit. Subcontractors see only open tenders and their own bids and contracts.
 */
function registerProjectRoutes(r, jobCost, read) {
  // ---------------------------------------------------------------- projects
  r.get('/projects', read, handle(async () => ({ projects: await jobCost.listProjects() })));
  r.post('/projects', requireRole(PM), handle(async (req) => ({ project: await jobCost.createProject(req.body, req.user.sub) }), 201));
  r.get('/projects/:id', read, handle(async (req) => ({ project: await jobCost.getProject(req.params.id) })));
  r.put('/projects/:id/status', requireRole(PM), handle(async (req) =>
    ({ project: await jobCost.setProjectStatus(req.params.id, req.body?.status, req.user.sub) })));
}
function registerJobCostRoutes(r, jobCost, read) {
  // ---------------------------------------------------------------- job costing
  r.get('/materials', read, handle(async () => ({ materials: await jobCost.listMaterials() })));
  r.post('/materials', requireRole(QS, PM), handle(async (req) => ({ material: await jobCost.createMaterial(req.body, req.user.sub) }), 201));

  r.get('/projects/:id/budget-lines', read, handle(async (req) => ({ lines: await jobCost.listBudgetLines(req.params.id) })));
  r.post('/projects/:id/budget-lines', requireRole(PM, QS), handle(async (req) =>
    ({ line: await jobCost.addBudgetLine(req.params.id, req.body, req.user.sub) }), 201));
  r.post('/projects/:id/budget-lines/:lineId/adjustments', requireRole(PM), handle(async (req) =>
    ({ adjustment: await jobCost.adjustBudget(req.params.id, req.params.lineId, req.body, req.user.sub) }), 201));

  r.get('/projects/:id/cost-entries', read, handle(async (req) => ({
    entries: await jobCost.listCostEntries(req.params.id, { lineId: req.query.lineId, category: req.query.category, source: req.query.source }),
  })));
  r.post('/projects/:id/cost-entries/material', requireRole(QS, SS), handle(async (req) =>
    ({ entry: await jobCost.postMaterialIssue(req.params.id, req.body, req.user.sub) }), 201));
  r.post('/projects/:id/cost-entries/labour', requireRole(QS, SS), handle(async (req) =>
    ({ entry: await jobCost.postLabour(req.params.id, req.body, req.user.sub) }), 201));
  r.post('/projects/:id/cost-entries/equipment', requireRole(QS, SS), handle(async (req) =>
    ({ entry: await jobCost.postEquipmentUsage(req.params.id, req.body, req.user.sub) }), 201));
  r.post('/projects/:id/cost-entries/overhead', requireRole(QS), handle(async (req) =>
    ({ entry: await jobCost.postOverhead(req.params.id, req.body, req.user.sub) }), 201));
  r.post('/cost-entries/:entryId/reverse', requireRole(QS, PM), handle(async (req) =>
    ({ entry: await jobCost.reverseEntry(req.params.entryId, req.body, req.user.sub) }), 201));
  r.get('/projects/:id/job-cost-report', read, handle((req) => jobCost.jobCostReport(req.params.id, asOf(req))));
}
function registerProgressRoutes(r, progress, read) {
  // ---------------------------------------------------------------- site progress
  r.get('/projects/:id/milestones', read, handle(async (req) => ({ milestones: await progress.listMilestones(req.params.id, asOf(req)) })));
  r.post('/projects/:id/milestones', requireRole(PM), handle(async (req) =>
    ({ milestone: await progress.createMilestone(req.params.id, req.body, req.user.sub) }), 201));
  r.get('/projects/:id/daily-reports', read, handle(async (req) =>
    ({ reports: await progress.listDailyReports(req.params.id, { from: req.query.from, to: req.query.to }) })));
  r.post('/projects/:id/daily-reports', requireRole(SS, PM), handle(async (req) =>
    ({ report: await progress.submitDailyReport(req.params.id, req.body, req.user.sub) }), 201));
  r.get('/projects/:id/progress', read, handle((req) => progress.getProgress(req.params.id, asOf(req))));
}
function registerTenderRoutes(r, tenders, read, readOrSub) {
  // ---------------------------------------------------------------- tenders & subcontractors
  r.get('/subcontractors', requireRole(PM, QS, FINANCE_MANAGER, ROLES.CEO, ROLES.AUDITOR), handle(async () =>
    ({ subcontractors: await tenders.listSubcontractors() })));
  r.post('/subcontractors', requireRole(PM, QS), handle(async (req) =>
    ({ subcontractor: await tenders.createSubcontractor(req.body, req.user.sub) }), 201));
  r.put('/subcontractors/:id', requireRole(PM), handle(async (req) =>
    ({ subcontractor: await tenders.updateSubcontractor(req.params.id, req.body, req.user.sub) })));

  r.get('/tenders', readOrSub, handle(async (req) =>
    ({ tenders: await tenders.listTenders({ projectId: req.query.projectId, status: req.query.status }, req.user) })));
  r.post('/projects/:id/tenders', requireRole(PM, QS), handle(async (req) =>
    ({ tender: await tenders.createTender(req.params.id, req.body, req.user.sub) }), 201));
  r.get('/tenders/:id', readOrSub, handle((req) => tenders.getTender(req.params.id, req.user)));
  r.post('/tenders/:id/bids', requireRole(PM, QS, SUBCONTRACTOR), handle(async (req) =>
    ({ bid: await tenders.submitBid(req.params.id, req.body, req.user) }), 201));
  r.post('/tenders/:id/close', requireRole(PM, QS), handle((req) => tenders.closeTender(req.params.id, req.user.sub)));
  r.put('/tenders/:id/bids/:bidId/score', requireRole(QS), handle(async (req) =>
    ({ bid: await tenders.scoreBid(req.params.id, req.params.bidId, req.body, req.user.sub) })));
  r.post('/tenders/:id/award', requireRole(PM), handle((req) => tenders.awardTender(req.params.id, req.body, req.user.sub), 201));
  r.post('/tenders/:id/cancel', requireRole(PM), handle((req) => tenders.cancelTender(req.params.id, req.body, req.user.sub)));

  r.get('/subcontracts', readOrSub, handle(async (req) =>
    ({ subcontracts: await tenders.listSubcontracts({ projectId: req.query.projectId }, req.user) })));
  r.get('/subcontracts/:id', readOrSub, handle((req) => tenders.getSubcontract(req.params.id, req.user)));
  r.post('/subcontracts/:id/variations', requireRole(PM), handle(async (req) =>
    ({ variation: await tenders.addVariation(req.params.id, req.body, req.user.sub) }), 201));
  r.put('/subcontracts/:id/status', requireRole(PM), handle(async (req) =>
    ({ subcontract: await tenders.setSubcontractStatus(req.params.id, req.body?.status, req.user.sub) })));
  r.post('/subcontracts/:id/claims', requireRole(QS, SUBCONTRACTOR), handle(async (req) =>
    ({ claim: await tenders.submitClaim(req.params.id, req.body, req.user) }), 201));
  r.post('/claims/:id/certify', requireRole(QS), handle(async (req) => ({ claim: await tenders.certifyClaim(req.params.id, req.body, req.user.sub) })));
  r.post('/claims/:id/reject', requireRole(QS), handle(async (req) => ({ claim: await tenders.rejectClaim(req.params.id, req.body, req.user.sub) })));
  r.post('/claims/:id/pay', requireRole(FINANCE_MANAGER), handle(async (req) => ({ claim: await tenders.payClaim(req.params.id, req.body, req.user.sub) })));
}
function registerQualityRoutes(r, quality, read) {
  // ---------------------------------------------------------------- quality
  r.get('/projects/:id/inspections', read, handle(async (req) => ({ inspections: await quality.listInspections(req.params.id) })));
  r.post('/projects/:id/inspections', requireRole(QA, ENGINEER), handle((req) => quality.createInspection(req.params.id, req.body, req.user.sub), 201));
  r.get('/projects/:id/ncrs', read, handle(async (req) => ({ ncrs: await quality.listNcrs(req.params.id, { status: req.query.status }) })));
  r.post('/projects/:id/ncrs', requireRole(QA, ENGINEER, PM), handle(async (req) => ({ ncr: await quality.raiseNcr(req.params.id, req.body, req.user.sub) }), 201));
  r.get('/projects/:id/quality-summary', read, handle((req) => quality.qualitySummary(req.params.id)));
  r.post('/ncrs/:id/resolve', requireRole(SS, PM), handle(async (req) => ({ ncr: await quality.resolveNcr(req.params.id, req.body, req.user.sub) })));
  r.post('/ncrs/:id/close', requireRole(QA, ENGINEER), handle(async (req) => ({ ncr: await quality.closeNcr(req.params.id, req.body, req.user.sub) })));
  r.post('/ncrs/:id/reopen', requireRole(QA, ENGINEER), handle(async (req) => ({ ncr: await quality.reopenNcr(req.params.id, req.body, req.user.sub) })));
}
function registerEquipmentRoutes(r, equipment, read) {
  // ---------------------------------------------------------------- plant & maintenance
  r.get('/equipment', read, handle(async () => ({ equipment: await equipment.listEquipment() })));
  r.post('/equipment', requireRole(PLANT), handle(async (req) => ({ equipment: await equipment.createEquipment(req.body, req.user.sub) }), 201));
  r.put('/equipment/:id/status', requireRole(PLANT), handle(async (req) =>
    ({ equipment: await equipment.setStatus(req.params.id, req.body?.status, req.user.sub) })));
  r.get('/equipment/fleet-summary', read, handle(() => equipment.fleetSummary()));
  r.get('/equipment/:id/maintenance', read, handle(async (req) => ({ logs: await equipment.maintenanceHistory(req.params.id) })));
  r.post('/equipment/:id/maintenance', requireRole(PLANT, SS), handle(async (req) =>
    ({ log: await equipment.reportMaintenance(req.params.id, req.body, req.user.sub) }), 201));
  r.post('/maintenance/:logId/complete', requireRole(PLANT), handle((req) => equipment.completeMaintenance(req.params.logId, req.body, req.user.sub)));
}

export function constructionRouter(services, config) {
  const r = express.Router();
  const { jobCost, progress, tenders, quality, equipment } = services;
  const read = requireRole(...CONSTRUCTION_READ_ROLES);
  const readOrSub = requireRole(...CONSTRUCTION_READ_ROLES, ROLES.SUBCONTRACTOR);

  r.use(authenticate(config));

  registerProjectRoutes(r, jobCost, read);
  registerJobCostRoutes(r, jobCost, read);
  registerProgressRoutes(r, progress, read);
  registerTenderRoutes(r, tenders, read, readOrSub);
  registerQualityRoutes(r, quality, read);
  registerEquipmentRoutes(r, equipment, read);

  return r;
}
