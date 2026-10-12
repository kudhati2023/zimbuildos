import { badRequest, notFound, conflict, forbidden } from './errors.js';
import { audit } from './db.js';
import { todayHarare, addDays } from './dates.js';
import * as f from './fields.js';

export const INSPECTION_TYPES = ['SETTING_OUT', 'EXCAVATION', 'FOUNDATION', 'REINFORCEMENT', 'CONCRETE_POUR', 'BRICKWORK',
  'ROOFING', 'PLUMBING', 'ELECTRICAL', 'FINISHES', 'ROADS', 'WATER_RETICULATION', 'SEWER_RETICULATION', 'FINAL'];
export const SEVERITIES = ['MINOR', 'MAJOR', 'CRITICAL'];
/** Days allowed to correct a defect, by severity. */
const DUE_DAYS = { CRITICAL: 2, MAJOR: 7, MINOR: 14 };
const MAX_CHECKLIST = 100;

const NCR_COLS = `n.ncr_id, n.ncr_no, n.project_id, n.milestone_id, n.inspection_id, n.description, n.severity, n.status,
  n.due_date::text AS due_date, n.raised_by, n.raised_at, n.corrective_action, n.resolved_by, n.resolved_at,
  n.verification_note, n.closed_by, n.closed_at`;
const INSPECTION_COLS = `i.inspection_id, i.project_id, i.milestone_id, i.inspection_type, i.location, i.inspected_on::text AS inspected_on,
  i.checklist, i.result, i.notes, i.inspector, i.created_at`;

export class QualityService {
  constructor(db) {
    this.db = db;
  }

  /** Locks the project row so NCR numbers are allocated one at a time per project. */
  async #lockProject(client, projectId) {
    f.uuid(projectId, 'projectId');
    const { rows: [p] } = await client.query('SELECT project_id, code, status FROM construction_projects WHERE project_id = $1 FOR UPDATE', [projectId]);
    if (!p) throw notFound('Project');
    if (p.status === 'CLOSED') throw conflict('PROJECT_CLOSED', 'This project is closed');
    return p;
  }

  async #milestone(client, projectId, milestoneId) {
    if (!milestoneId) return null;
    f.uuid(milestoneId, 'milestoneId');
    const { rowCount } = await client.query('SELECT 1 FROM project_milestones WHERE milestone_id = $1 AND project_id = $2', [milestoneId, projectId]);
    if (!rowCount) throw badRequest('UNKNOWN_MILESTONE', 'That milestone is not part of this project');
    return milestoneId;
  }

  async #raise(client, project, { milestoneId, inspectionId, description, severity, raisedOn, actor }) {
    const { rows: [n] } = await client.query('SELECT count(*)::int + 1 AS n FROM non_conformances WHERE project_id = $1', [project.project_id]);
    const { rows: [ncr] } = await client.query(
      `INSERT INTO non_conformances AS n (ncr_no, project_id, milestone_id, inspection_id, description, severity, due_date, raised_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${NCR_COLS}`,
      [`NCR-${project.code}-${String(n.n).padStart(4, '0')}`, project.project_id, milestoneId, inspectionId, description,
        severity, addDays(raisedOn, DUE_DAYS[severity]), actor]);
    return ncr;
  }

  /**
   * Records a checklist inspection. The result is derived from the checklist (any failed item = FAIL)
   * and every failed item opens its own NCR, so no defect is left untracked.
   */
  async createInspection(projectId, body, actor) {
    const b = body ?? {};
    const type = f.oneOf(b.inspectionType, 'inspectionType', INSPECTION_TYPES);
    const location = f.text(b.location, 'location', { max: 300 });
    const inspectedOn = f.date(b.inspectedOn ?? todayHarare(), 'inspectedOn');
    if (inspectedOn > todayHarare()) throw badRequest('INVALID_FIELD', 'inspectedOn cannot be in the future');
    if (!Array.isArray(b.checklist) || b.checklist.length === 0 || b.checklist.length > MAX_CHECKLIST) {
      throw badRequest('INVALID_CHECKLIST', `checklist must list 1-${MAX_CHECKLIST} items`);
    }
    const checklist = b.checklist.map((c, i) => {
      if (typeof c?.passed !== 'boolean') throw badRequest('INVALID_CHECKLIST', `checklist[${i}].passed must be true or false`);
      return {
        item: f.text(c.item, `checklist[${i}].item`, { max: 300 }),
        passed: c.passed,
        note: f.text(c.note, `checklist[${i}].note`, { optional: true, max: 1000 }),
        severity: c.passed ? null : f.oneOf(c.severity, `checklist[${i}].severity`, SEVERITIES, { fallback: 'MAJOR' }),
      };
    });
    const result = checklist.every((c) => c.passed) ? 'PASS' : 'FAIL';
    const notes = f.text(b.notes, 'notes', { optional: true, max: 5000 });

    return this.db.tx(async (client) => {
      const project = await this.#lockProject(client, projectId);
      const milestoneId = await this.#milestone(client, projectId, b.milestoneId);
      const { rows: [inspection] } = await client.query(
        `INSERT INTO quality_inspections AS i (project_id, milestone_id, inspection_type, location, inspected_on, checklist, result, notes, inspector)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9) RETURNING ${INSPECTION_COLS}`,
        [projectId, milestoneId, type, location, inspectedOn, JSON.stringify(checklist), result, notes, actor]);
      const ncrs = [];
      for (const c of checklist.filter((x) => !x.passed)) {
        ncrs.push(await this.#raise(client, project, {
          milestoneId, inspectionId: inspection.inspection_id, severity: c.severity, raisedOn: inspectedOn, actor,
          description: `${type.replace(/_/g, ' ')} at ${location}: ${c.item}${c.note ? ` — ${c.note}` : ''}`,
        }));
      }
      await audit(client, actor, 'INSPECTION_RECORDED', 'quality_inspections', inspection.inspection_id, {
        projectId, type, result, ncrs: ncrs.map((n) => n.ncr_no),
      });
      return { inspection, ncrs };
    });
  }

  async raiseNcr(projectId, body, actor) {
    const b = body ?? {};
    const description = f.text(b.description, 'description', { max: 2000 });
    const severity = f.oneOf(b.severity, 'severity', SEVERITIES);
    return this.db.tx(async (client) => {
      const project = await this.#lockProject(client, projectId);
      const milestoneId = await this.#milestone(client, projectId, b.milestoneId);
      const ncr = await this.#raise(client, project, { milestoneId, inspectionId: null, description, severity, raisedOn: todayHarare(), actor });
      await audit(client, actor, 'NCR_RAISED', 'non_conformances', ncr.ncr_id, { ncrNo: ncr.ncr_no, severity });
      return ncr;
    });
  }

  async #transition(ncrId, from, fn) {
    f.uuid(ncrId, 'ncrId');
    return this.db.tx(async (client) => {
      const { rows: [n] } = await client.query(`SELECT ${NCR_COLS} FROM non_conformances n WHERE n.ncr_id = $1 FOR UPDATE`, [ncrId]);
      if (!n) throw notFound('NCR');
      if (n.status !== from) throw conflict('INVALID_NCR_STATE', `NCR ${n.ncr_no} is ${n.status}, expected ${from}`);
      return fn(client, n);
    });
  }

  /** Site team records the corrective action taken. */
  async resolveNcr(ncrId, body, actor) {
    const action = f.text(body?.correctiveAction, 'correctiveAction', { min: 5, max: 2000 });
    return this.#transition(ncrId, 'OPEN', async (client, n) => {
      const { rows: [u] } = await client.query(
        `UPDATE non_conformances n SET status = 'RESOLVED', corrective_action = $2, resolved_by = $3, resolved_at = now()
          WHERE ncr_id = $1 RETURNING ${NCR_COLS}`, [ncrId, action, actor]);
      await audit(client, actor, 'NCR_RESOLVED', 'non_conformances', ncrId, { ncrNo: n.ncr_no });
      return u;
    });
  }

  /** An inspector other than the person who fixed it verifies the correction and closes the NCR. */
  async closeNcr(ncrId, body, actor) {
    const note = f.text(body?.verificationNote, 'verificationNote', { min: 5, max: 2000 });
    return this.#transition(ncrId, 'RESOLVED', async (client, n) => {
      if (n.resolved_by === actor) throw forbidden('SEGREGATION_OF_DUTIES', 'The person who resolved an NCR cannot also verify it');
      const { rows: [u] } = await client.query(
        `UPDATE non_conformances n SET status = 'CLOSED', verification_note = $2, closed_by = $3, closed_at = now()
          WHERE ncr_id = $1 RETURNING ${NCR_COLS}`, [ncrId, note, actor]);
      await audit(client, actor, 'NCR_CLOSED', 'non_conformances', ncrId, { ncrNo: n.ncr_no });
      return u;
    });
  }

  /** Verification failed: send the NCR back to the site team. */
  async reopenNcr(ncrId, body, actor) {
    const reason = f.text(body?.reason, 'reason', { min: 5, max: 2000 });
    return this.#transition(ncrId, 'RESOLVED', async (client, n) => {
      const { rows: [u] } = await client.query(
        `UPDATE non_conformances n SET status = 'OPEN', verification_note = $2, corrective_action = NULL, resolved_by = NULL, resolved_at = NULL
          WHERE ncr_id = $1 RETURNING ${NCR_COLS}`, [ncrId, `Re-opened: ${reason}`]);
      await audit(client, actor, 'NCR_REOPENED', 'non_conformances', ncrId, { ncrNo: n.ncr_no, reason, rejectedAction: n.corrective_action });
      return u;
    });
  }

  async listInspections(projectId) {
    f.uuid(projectId, 'projectId');
    const { rows } = await this.db.query(
      `SELECT ${INSPECTION_COLS}, m.name AS milestone_name,
              (SELECT count(*)::int FROM non_conformances n WHERE n.inspection_id = i.inspection_id) AS ncr_count
         FROM quality_inspections i LEFT JOIN project_milestones m ON m.milestone_id = i.milestone_id
        WHERE i.project_id = $1 ORDER BY i.inspected_on DESC, i.created_at DESC LIMIT 500`, [projectId]);
    return rows;
  }

  async listNcrs(projectId, { status } = {}) {
    f.uuid(projectId, 'projectId');
    const today = todayHarare();
    const { rows } = await this.db.query(
      `SELECT ${NCR_COLS}, m.name AS milestone_name FROM non_conformances n
         LEFT JOIN project_milestones m ON m.milestone_id = n.milestone_id
        WHERE n.project_id = $1 AND ($2::text IS NULL OR n.status = $2)
        ORDER BY CASE n.status WHEN 'OPEN' THEN 0 WHEN 'RESOLVED' THEN 1 ELSE 2 END,
                 CASE n.severity WHEN 'CRITICAL' THEN 0 WHEN 'MAJOR' THEN 1 ELSE 2 END, n.due_date`,
      [projectId, f.oneOf(status, 'status', ['OPEN', 'RESOLVED', 'CLOSED'], { optional: true })]);
    return rows.map((n) => ({ ...n, overdue: n.status !== 'CLOSED' && n.due_date < today }));
  }

  async qualitySummary(projectId) {
    f.uuid(projectId, 'projectId');
    const { rows: [s] } = await this.db.query(
      `SELECT (SELECT count(*)::int FROM quality_inspections WHERE project_id = $1) AS inspections,
              (SELECT count(*)::int FROM quality_inspections WHERE project_id = $1 AND result = 'PASS') AS passed,
              (SELECT count(*)::int FROM non_conformances WHERE project_id = $1 AND status = 'OPEN') AS open,
              (SELECT count(*)::int FROM non_conformances WHERE project_id = $1 AND status = 'RESOLVED') AS awaiting_verification,
              (SELECT count(*)::int FROM non_conformances WHERE project_id = $1 AND status = 'CLOSED') AS closed,
              (SELECT count(*)::int FROM non_conformances WHERE project_id = $1 AND status <> 'CLOSED' AND severity = 'CRITICAL') AS open_critical,
              (SELECT count(*)::int FROM non_conformances WHERE project_id = $1 AND status <> 'CLOSED' AND due_date < $2::date) AS overdue,
              (SELECT round(avg(extract(epoch FROM closed_at - raised_at) / 86400)::numeric, 1)
                 FROM non_conformances WHERE project_id = $1 AND status = 'CLOSED') AS avg_days_to_close`, [projectId, todayHarare()]);
    return {
      ...s,
      first_time_pass_rate: s.inspections ? Math.round((s.passed / s.inspections) * 1000) / 10 : null,
      avg_days_to_close: f.num(s.avg_days_to_close),
    };
  }
}
