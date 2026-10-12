import { badRequest, notFound, conflict } from './errors.js';
import { audit } from './db.js';
import { numericToCents, centsToNumeric } from './money.js';
import { todayHarare } from './dates.js';
import { progressSummary } from './siteProgressService.js';
import * as f from './fields.js';

export const COST_CATEGORIES = ['MATERIAL', 'LABOUR', 'EQUIPMENT', 'SUBCONTRACT', 'OVERHEAD'];
export const PROJECT_STATUSES = ['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CLOSED'];
const STATUS_FLOW = {
  PLANNING: ['ACTIVE', 'ON_HOLD'],
  ACTIVE: ['ON_HOLD', 'COMPLETED'],
  ON_HOLD: ['ACTIVE'],
  COMPLETED: ['ACTIVE', 'CLOSED'],
  CLOSED: [],
};
const AT_RISK_SHARE = 0.9; // a line is flagged once 90% of its budget is spent

export const PROJECT_COLS = `p.project_id, p.code, p.name, p.development_id, p.site_location, p.client_name, p.contract_value_usd,
  p.start_date::text AS start_date, p.planned_end_date::text AS planned_end_date, p.status, p.created_by, p.created_at`;
const ENTRY_COLS = `e.entry_id, e.project_id, e.line_id, e.source, e.entry_date::text AS entry_date, e.description, e.quantity, e.unit,
  e.unit_rate_usd, e.amount_usd, e.material_code, e.worker_ref, e.equipment_id, e.claim_id, e.reversal_of, e.recorded_by, e.created_at`;

const usd = (cents) => Number(centsToNumeric(cents));
const ratio = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 1000 : null);

/**
 * Posts one line to the cost ledger. The amount is computed by PostgreSQL from quantity x rate so it can
 * never disagree with the CHECK constraint; category, closed-project and plant-availability rules are triggers.
 */
export async function insertCostEntry(client, e) {
  const { rows: [row] } = await client.query(
    `INSERT INTO cost_entries (project_id, line_id, source, entry_date, description, quantity, unit, unit_rate_usd, amount_usd,
                               material_code, worker_ref, equipment_id, claim_id, reversal_of, recorded_by)
     VALUES ($1,$2,$3,$4,$5,$6::numeric,$7,$8::numeric, round($6::numeric * $8::numeric, 2), $9,$10,$11,$12,$13,$14)
     RETURNING entry_id, amount_usd, entry_date::text AS entry_date`,
    [e.projectId, e.lineId, e.source, e.entryDate, e.description, e.quantity, e.unit, e.unitRate,
      e.materialCode ?? null, e.workerRef ?? null, e.equipmentId ?? null, e.claimId ?? null, e.reversalOf ?? null, e.recordedBy]);
  return row;
}

export class JobCostService {
  constructor(db) {
    this.db = db;
  }

  // ------------------------------------------------------------------------------------------ projects

  async createProject(body, actor) {
    const b = body ?? {};
    const start = f.date(b.startDate, 'startDate');
    const end = f.date(b.plannedEndDate, 'plannedEndDate');
    if (end < start) throw badRequest('INVALID_FIELD', 'plannedEndDate must be on or after startDate');
    const values = [
      f.code(b.code, 'code', /^[A-Z0-9][A-Z0-9-]{1,29}$/),
      f.text(b.name, 'name', { max: 200 }),
      f.text(b.developmentId, 'developmentId', { optional: true, max: 60 }),
      f.text(b.siteLocation, 'siteLocation', { max: 300 }),
      f.text(b.clientName, 'clientName', { max: 200 }),
      b.contractValueUsd === undefined || Number(b.contractValueUsd) === 0 ? '0.00' : f.usdAmount(b.contractValueUsd),
      start, end,
      f.oneOf(b.status, 'status', ['PLANNING', 'ACTIVE'], { fallback: 'ACTIVE' }),
    ];
    return this.db.tx(async (client) => {
      if (values[2]) {
        const { rowCount } = await client.query('SELECT 1 FROM developments WHERE development_id = $1', [values[2]]);
        if (!rowCount) throw badRequest('UNKNOWN_DEVELOPMENT', `Development ${values[2]} does not exist`);
      }
      const { rows: [p] } = await client.query(
        `INSERT INTO construction_projects AS p (code, name, development_id, site_location, client_name, contract_value_usd,
                                                start_date, planned_end_date, status, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING ${PROJECT_COLS}`, [...values, actor]);
      await audit(client, actor, 'PROJECT_CREATED', 'construction_projects', p.project_id, { code: p.code, name: p.name });
      return p;
    });
  }

  /** Portfolio view: every project with its budget, cost to date, progress and open quality / claim items. */
  async listProjects() {
    const { rows } = await this.db.query(
      `SELECT ${PROJECT_COLS},
              COALESCE((SELECT sum(original_budget_usd) FROM project_budget_lines WHERE project_id = p.project_id), 0)
                + COALESCE((SELECT sum(amount_usd) FROM budget_adjustments WHERE project_id = p.project_id), 0) AS budget_usd,
              COALESCE((SELECT sum(amount_usd) FROM cost_entries WHERE project_id = p.project_id), 0) AS actual_usd,
              (SELECT round(sum(weight_percent * percent_complete) / NULLIF(sum(weight_percent), 0), 1)
                 FROM project_milestones WHERE project_id = p.project_id) AS percent_complete,
              (SELECT count(*)::int FROM non_conformances WHERE project_id = p.project_id AND status <> 'CLOSED') AS open_ncrs,
              (SELECT count(*)::int FROM subcontract_claims c JOIN subcontracts s ON s.subcontract_id = c.subcontract_id
                WHERE s.project_id = p.project_id AND c.status = 'SUBMITTED') AS claims_awaiting_certification,
              (SELECT max(report_date)::text FROM daily_site_reports WHERE project_id = p.project_id) AS last_site_report
         FROM construction_projects p ORDER BY p.created_at DESC`);
    return rows.map((p) => ({ ...p, percent_complete: p.percent_complete === null ? 0 : Number(p.percent_complete) }));
  }

  async getProject(projectId) {
    f.uuid(projectId, 'projectId');
    const { rows: [p] } = await this.db.query(`SELECT ${PROJECT_COLS} FROM construction_projects p WHERE p.project_id = $1`, [projectId]);
    if (!p) throw notFound('Project');
    return p;
  }

  async setProjectStatus(projectId, status, actor) {
    f.uuid(projectId, 'projectId');
    const next = f.oneOf(status, 'status', PROJECT_STATUSES);
    return this.db.tx(async (client) => {
      const { rows: [p] } = await client.query('SELECT status FROM construction_projects WHERE project_id = $1 FOR UPDATE', [projectId]);
      if (!p) throw notFound('Project');
      if (!STATUS_FLOW[p.status].includes(next)) {
        throw conflict('INVALID_STATUS_CHANGE', `A ${p.status} project can move to: ${STATUS_FLOW[p.status].join(', ') || 'nothing (closed)'}`);
      }
      if (next === 'CLOSED') {
        const { rows: [o] } = await client.query(
          `SELECT (SELECT count(*) FROM non_conformances WHERE project_id = $1 AND status <> 'CLOSED')::int AS ncrs,
                  (SELECT count(*) FROM subcontract_claims c JOIN subcontracts s ON s.subcontract_id = c.subcontract_id
                    WHERE s.project_id = $1 AND c.status IN ('SUBMITTED','CERTIFIED'))::int AS claims`, [projectId]);
        if (o.ncrs || o.claims) {
          throw conflict('PROJECT_HAS_OPEN_ITEMS', `Close all NCRs (${o.ncrs} open) and settle all claims (${o.claims} unpaid) before closing the project`);
        }
      }
      const { rows: [u] } = await client.query(
        `UPDATE construction_projects p SET status = $2 WHERE project_id = $1 RETURNING ${PROJECT_COLS}`, [projectId, next]);
      await audit(client, actor, 'PROJECT_STATUS_CHANGED', 'construction_projects', projectId, { from: p.status, to: next });
      return u;
    });
  }

  // ------------------------------------------------------------------------------------------ materials catalogue

  async listMaterials() {
    const { rows } = await this.db.query('SELECT * FROM materials ORDER BY material_code');
    return rows;
  }

  async createMaterial(body, actor) {
    const b = body ?? {};
    const rateValue = f.rate(b.standardRateUsd, 'standardRateUsd');
    if (Number(rateValue) <= 0) throw badRequest('INVALID_RATE', 'standardRateUsd must be greater than zero');
    return this.db.tx(async (client) => {
      const { rows: [m] } = await client.query(
        'INSERT INTO materials (material_code, name, unit, standard_rate_usd) VALUES ($1,$2,$3,$4) RETURNING *',
        [f.code(b.materialCode, 'materialCode'), f.text(b.name, 'name', { max: 200 }), f.text(b.unit, 'unit', { max: 20 }), rateValue]);
      await audit(client, actor, 'MATERIAL_CREATED', 'materials', m.material_code, { name: m.name, unit: m.unit });
      return m;
    });
  }

  // ------------------------------------------------------------------------------------------ budget

  async listBudgetLines(projectId) {
    await this.getProject(projectId);
    const { rows } = await this.db.query(
      `SELECT l.*, COALESCE((SELECT sum(amount_usd) FROM budget_adjustments a WHERE a.line_id = l.line_id), 0) AS adjustments_usd,
              l.original_budget_usd + COALESCE((SELECT sum(amount_usd) FROM budget_adjustments a WHERE a.line_id = l.line_id), 0) AS revised_budget_usd,
              COALESCE((SELECT json_agg(json_build_object('amount_usd', a.amount_usd, 'reason', a.reason, 'approved_by', a.approved_by,
                                                          'created_at', a.created_at) ORDER BY a.created_at)
                          FROM budget_adjustments a WHERE a.line_id = l.line_id), '[]') AS adjustments
         FROM project_budget_lines l WHERE l.project_id = $1 ORDER BY l.cost_code`, [projectId]);
    return rows;
  }

  async addBudgetLine(projectId, body, actor) {
    const b = body ?? {};
    const qty = b.budgetQuantity === undefined || b.budgetQuantity === null || b.budgetQuantity === '' ? null : f.quantity(b.budgetQuantity, 'budgetQuantity');
    const unit = f.text(b.unit, 'unit', { optional: true, max: 20 });
    if ((qty === null) !== (unit === null)) throw badRequest('INVALID_FIELD', 'budgetQuantity and unit go together');
    const values = [
      f.code(b.costCode, 'costCode', /^[A-Z0-9][A-Z0-9.\-]{0,19}$/),
      f.text(b.description, 'description', { max: 300 }),
      f.oneOf(b.category, 'category', COST_CATEGORIES),
      Number(b.budgetUsd) === 0 ? '0.00' : f.usdAmount(b.budgetUsd),
      qty, unit,
    ];
    return this.db.tx(async (client) => {
      const { rows: [p] } = await client.query('SELECT status FROM construction_projects WHERE project_id = $1', [f.uuid(projectId, 'projectId')]);
      if (!p) throw notFound('Project');
      if (p.status === 'CLOSED') throw conflict('PROJECT_CLOSED', 'This project is closed');
      const { rows: [l] } = await client.query(
        `INSERT INTO project_budget_lines (project_id, cost_code, description, category, original_budget_usd, budget_quantity, unit, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [projectId, ...values, actor]);
      await audit(client, actor, 'BUDGET_LINE_CREATED', 'project_budget_lines', l.line_id, { projectId, costCode: l.cost_code, budget: l.original_budget_usd });
      return l;
    });
  }

  /** Approved change to a locked budget line (positive to increase, negative to reduce). */
  async adjustBudget(projectId, lineId, body, actor) {
    const amount = f.signedUsd(body?.amountUsd);
    const reason = f.text(body?.reason, 'reason', { min: 5, max: 1000 });
    return this.db.tx(async (client) => {
      await this.#line(client, projectId, lineId);
      const { rows: [a] } = await client.query(
        `INSERT INTO budget_adjustments (project_id, line_id, amount_usd, reason, approved_by)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`, [projectId, lineId, amount, reason, actor]);
      await audit(client, actor, 'BUDGET_ADJUSTED', 'project_budget_lines', lineId, { amount, reason });
      return a;
    });
  }

  async #line(client, projectId, lineId) {
    f.uuid(projectId, 'projectId');
    f.uuid(lineId, 'lineId');
    const { rows: [l] } = await client.query(
      `SELECT l.*, p.start_date::text AS project_start FROM project_budget_lines l
         JOIN construction_projects p ON p.project_id = l.project_id
        WHERE l.line_id = $1 AND l.project_id = $2`, [lineId, projectId]);
    if (!l) throw notFound('Budget line on this project');
    return l;
  }

  #entryDate(value, line) {
    const d = f.date(value ?? todayHarare(), 'entryDate');
    if (d > todayHarare()) throw badRequest('INVALID_FIELD', 'entryDate cannot be in the future');
    if (d < line.project_start) throw badRequest('INVALID_FIELD', `entryDate cannot be before the project start (${line.project_start})`);
    return d;
  }

  // ------------------------------------------------------------------------------------------ cost ledger

  async postMaterialIssue(projectId, body, actor) {
    const b = body ?? {};
    const qty = f.quantity(b.quantity);
    return this.db.tx(async (client) => {
      const line = await this.#line(client, projectId, b.lineId);
      const { rows: [m] } = await client.query('SELECT * FROM materials WHERE material_code = $1', [f.code(b.materialCode, 'materialCode')]);
      if (!m) throw badRequest('UNKNOWN_MATERIAL', `Material ${b.materialCode} is not in the catalogue`);
      const entry = await insertCostEntry(client, {
        projectId, lineId: line.line_id, source: 'MATERIAL_ISSUE', entryDate: this.#entryDate(b.entryDate, line),
        description: f.text(b.description, 'description', { optional: true, max: 500 }) ?? `Issued ${qty} ${m.unit} ${m.name}`,
        quantity: qty, unit: m.unit,
        unitRate: b.unitRateUsd === undefined || b.unitRateUsd === '' ? m.standard_rate_usd : f.rate(b.unitRateUsd),
        materialCode: m.material_code, recordedBy: actor,
      });
      await audit(client, actor, 'COST_POSTED', 'cost_entries', entry.entry_id, { source: 'MATERIAL_ISSUE', amount: entry.amount_usd });
      return entry;
    });
  }

  async postLabour(projectId, body, actor) {
    const b = body ?? {};
    const qty = f.quantity(b.quantity);
    const unit = f.oneOf(b.unit, 'unit', ['HOUR', 'DAY'], { fallback: 'HOUR' });
    const workerRef = f.text(b.workerRef, 'workerRef', { max: 100 });
    const trade = f.text(b.trade, 'trade', { optional: true, max: 60 });
    return this.db.tx(async (client) => {
      const line = await this.#line(client, projectId, b.lineId);
      const entry = await insertCostEntry(client, {
        projectId, lineId: line.line_id, source: 'LABOUR_TIMESHEET', entryDate: this.#entryDate(b.entryDate, line),
        description: f.text(b.description, 'description', { optional: true, max: 500 }) ?? `${workerRef}${trade ? ` (${trade})` : ''}: ${qty} ${unit.toLowerCase()}(s)`,
        quantity: qty, unit, unitRate: f.rate(b.unitRateUsd), workerRef, recordedBy: actor,
      });
      await audit(client, actor, 'COST_POSTED', 'cost_entries', entry.entry_id, { source: 'LABOUR_TIMESHEET', amount: entry.amount_usd });
      return entry;
    });
  }

  /** Plant hours: costed at the machine's hourly rate (unless overridden) and added to its hour meter. */
  async postEquipmentUsage(projectId, body, actor) {
    const b = body ?? {};
    const hours = f.quantity(b.hours, 'hours');
    if (Number(hours) > 24) throw badRequest('INVALID_QUANTITY', 'hours must be at most 24 per entry');
    return this.db.tx(async (client) => {
      const line = await this.#line(client, projectId, b.lineId);
      const { rows: [eq] } = await client.query('SELECT * FROM equipment WHERE equipment_id = $1 FOR UPDATE', [f.uuid(b.equipmentId, 'equipmentId')]);
      if (!eq) throw notFound('Equipment');
      const entry = await insertCostEntry(client, {
        projectId, lineId: line.line_id, source: 'EQUIPMENT_USAGE', entryDate: this.#entryDate(b.entryDate, line),
        description: f.text(b.description, 'description', { optional: true, max: 500 }) ?? `${eq.asset_tag} ${eq.name}: ${hours} h`,
        quantity: hours, unit: 'HOUR',
        unitRate: b.unitRateUsd === undefined || b.unitRateUsd === '' ? eq.hourly_rate_usd : f.rate(b.unitRateUsd),
        equipmentId: eq.equipment_id, recordedBy: actor,
      });
      await client.query('UPDATE equipment SET hour_meter = hour_meter + $2::numeric WHERE equipment_id = $1', [eq.equipment_id, hours]);
      await audit(client, actor, 'COST_POSTED', 'cost_entries', entry.entry_id, { source: 'EQUIPMENT_USAGE', amount: entry.amount_usd, hours });
      return entry;
    });
  }

  async postOverhead(projectId, body, actor) {
    const b = body ?? {};
    const amount = f.usdAmount(b.amountUsd);
    return this.db.tx(async (client) => {
      const line = await this.#line(client, projectId, b.lineId);
      const entry = await insertCostEntry(client, {
        projectId, lineId: line.line_id, source: 'OVERHEAD', entryDate: this.#entryDate(b.entryDate, line),
        description: f.text(b.description, 'description', { max: 500 }), quantity: '1', unit: 'LS', unitRate: amount, recordedBy: actor,
      });
      await audit(client, actor, 'COST_POSTED', 'cost_entries', entry.entry_id, { source: 'OVERHEAD', amount: entry.amount_usd });
      return entry;
    });
  }

  /**
   * Ledger corrections are reversals, never edits. Subcontract certificates are not reversible here:
   * they are owned by the claim that produced them. Hour meters are physical readings and are not rolled back.
   */
  async reverseEntry(entryId, body, actor) {
    f.uuid(entryId, 'entryId');
    const reason = f.text(body?.reason, 'reason', { min: 5, max: 500 });
    return this.db.tx(async (client) => {
      const { rows: [e] } = await client.query('SELECT * FROM cost_entries WHERE entry_id = $1', [entryId]);
      if (!e) throw notFound('Cost entry');
      if (e.source === 'REVERSAL') throw conflict('CANNOT_REVERSE_REVERSAL', 'A reversal cannot itself be reversed; post a new entry instead');
      if (e.source === 'SUBCONTRACT_CERTIFICATE') throw conflict('CERTIFICATE_ENTRY', 'Subcontract certificate costs follow their claim and cannot be reversed');
      const entry = await insertCostEntry(client, {
        projectId: e.project_id, lineId: e.line_id, source: 'REVERSAL', entryDate: todayHarare(),
        description: `Reversal: ${reason}`, quantity: `-${e.quantity}`, unit: e.unit, unitRate: e.unit_rate_usd,
        materialCode: e.material_code, workerRef: e.worker_ref, equipmentId: e.equipment_id, reversalOf: e.entry_id, recordedBy: actor,
      });
      await audit(client, actor, 'COST_REVERSED', 'cost_entries', e.entry_id, { reversal: entry.entry_id, reason });
      return entry;
    });
  }

  async listCostEntries(projectId, { lineId, category, source } = {}) {
    await this.getProject(projectId);
    const { rows } = await this.db.query(
      `SELECT ${ENTRY_COLS}, l.cost_code, l.category, m.name AS material_name, q.asset_tag, q.name AS equipment_name,
              EXISTS (SELECT 1 FROM cost_entries r WHERE r.reversal_of = e.entry_id) AS reversed
         FROM cost_entries e
         JOIN project_budget_lines l ON l.line_id = e.line_id
         LEFT JOIN materials m ON m.material_code = e.material_code
         LEFT JOIN equipment q ON q.equipment_id = e.equipment_id
        WHERE e.project_id = $1
          AND ($2::uuid IS NULL OR e.line_id = $2::uuid)
          AND ($3::text IS NULL OR l.category = $3)
          AND ($4::text IS NULL OR e.source = $4)
        ORDER BY e.entry_date DESC, e.created_at DESC LIMIT 1000`,
      [projectId, f.uuid(lineId, 'lineId', { optional: true }), f.oneOf(category, 'category', COST_CATEGORIES, { optional: true }),
        source || null]);
    return rows;
  }

  // ------------------------------------------------------------------------------------------ job cost report

  /**
   * Budget vs actual vs commitments per cost line, rolled up by category, with earned value from the
   * weighted milestone progress. All arithmetic is in integer cents.
   */
  async jobCostReport(projectId, asOf = todayHarare()) {
    const project = await this.getProject(projectId);
    const { rows: lines } = await this.db.query(
      `SELECT l.line_id, l.cost_code, l.description, l.category, l.original_budget_usd, l.budget_quantity, l.unit,
              COALESCE((SELECT sum(amount_usd) FROM budget_adjustments a WHERE a.line_id = l.line_id), 0) AS adjustments_usd,
              COALESCE((SELECT sum(amount_usd) FROM cost_entries e WHERE e.line_id = l.line_id), 0) AS actual_usd,
              (SELECT sum(quantity) FROM cost_entries e WHERE e.line_id = l.line_id AND e.unit = l.unit) AS actual_quantity,
              COALESCE((SELECT sum(s.original_value_usd + COALESCE((SELECT sum(v.amount_usd) FROM subcontract_variations v
                                                                    WHERE v.subcontract_id = s.subcontract_id), 0))
                          FROM subcontracts s WHERE s.line_id = l.line_id AND s.status = 'ACTIVE'), 0) AS committed_usd,
              COALESCE((SELECT sum(c.certified) FROM (
                          SELECT max(cl.certified_cumulative_usd) AS certified FROM subcontract_claims cl
                            JOIN subcontracts s ON s.subcontract_id = cl.subcontract_id
                           WHERE s.line_id = l.line_id AND s.status = 'ACTIVE' AND cl.status IN ('CERTIFIED','PAID')
                           GROUP BY cl.subcontract_id) c), 0) AS committed_certified_usd
         FROM project_budget_lines l WHERE l.project_id = $1 ORDER BY l.cost_code`, [projectId]);

    const out = lines.map((l) => {
      const revised = numericToCents(l.original_budget_usd) + numericToCents(l.adjustments_usd);
      const actual = numericToCents(l.actual_usd);
      const committed = numericToCents(l.committed_usd);
      const openCommitment = Math.max(committed - numericToCents(l.committed_certified_usd), 0);
      const forecast = actual + openCommitment;
      let status = 'WITHIN_BUDGET';
      if (forecast > revised) status = 'OVER_BUDGET';
      else if (actual >= revised * AT_RISK_SHARE && actual > 0) status = 'AT_RISK';
      return {
        line_id: l.line_id, cost_code: l.cost_code, description: l.description, category: l.category,
        original_budget_usd: usd(numericToCents(l.original_budget_usd)), adjustments_usd: usd(numericToCents(l.adjustments_usd)),
        revised_budget_usd: usd(revised), actual_usd: usd(actual), committed_usd: usd(committed),
        open_commitment_usd: usd(openCommitment), forecast_final_usd: usd(forecast), variance_usd: usd(revised - forecast),
        consumed_percent: revised > 0 ? Math.round((actual / revised) * 1000) / 10 : null,
        unit: l.unit, budget_quantity: f.num(l.budget_quantity), actual_quantity: l.unit ? f.num(l.actual_quantity ?? 0) : null,
        quantity_variance: l.unit ? Math.round((Number(l.budget_quantity) - Number(l.actual_quantity ?? 0)) * 1000) / 1000 : null,
        status,
        _c: { revised, actual, committed, openCommitment, forecast },
      };
    });

    const sum = (rows, k) => rows.reduce((s, r) => s + r._c[k], 0);
    const byCategory = COST_CATEGORIES.map((category) => {
      const rows = out.filter((r) => r.category === category);
      const revised = sum(rows, 'revised');
      const actual = sum(rows, 'actual');
      const forecast = sum(rows, 'forecast');
      return {
        category, lines: rows.length, revised_budget_usd: usd(revised), actual_usd: usd(actual),
        open_commitment_usd: usd(sum(rows, 'openCommitment')), forecast_final_usd: usd(forecast), variance_usd: usd(revised - forecast),
        consumed_percent: revised > 0 ? Math.round((actual / revised) * 1000) / 10 : null,
      };
    }).filter((c) => c.lines > 0);

    const bac = sum(out, 'revised');
    const ac = sum(out, 'actual');
    const forecast = sum(out, 'forecast');
    const { rows: milestones } = await this.db.query(
      `SELECT weight_percent, percent_complete, planned_start::text AS planned_start, planned_finish::text AS planned_finish
         FROM project_milestones WHERE project_id = $1`, [projectId]);
    const progress = progressSummary(milestones, asOf);
    const ev = Math.round((bac * progress.percentComplete) / 100);
    const pv = Math.round((bac * progress.plannedPercent) / 100);
    const cpi = ratio(ev, ac);
    const spi = ratio(ev, pv);
    // Estimate at completion: performance-based when there is progress to judge by, otherwise the cost forecast.
    const eac = cpi ? Math.round(bac / cpi) : forecast;

    const [monthly, materialUse, plantUse, labourUse] = await Promise.all([
      this.db.query(
        `SELECT to_char(e.entry_date, 'YYYY-MM') AS month, l.category, sum(e.amount_usd) AS amount_usd
           FROM cost_entries e JOIN project_budget_lines l ON l.line_id = e.line_id
          WHERE e.project_id = $1 GROUP BY 1, 2 ORDER BY 1, 2`, [projectId]),
      this.db.query(
        `SELECT e.material_code, m.name, m.unit, sum(e.quantity) AS quantity, sum(e.amount_usd) AS amount_usd
           FROM cost_entries e JOIN materials m ON m.material_code = e.material_code
          WHERE e.project_id = $1 GROUP BY e.material_code, m.name, m.unit ORDER BY sum(e.amount_usd) DESC`, [projectId]),
      this.db.query(
        `SELECT q.equipment_id, q.asset_tag, q.name, sum(e.quantity) AS hours, sum(e.amount_usd) AS amount_usd
           FROM cost_entries e JOIN equipment q ON q.equipment_id = e.equipment_id
          WHERE e.project_id = $1 GROUP BY q.equipment_id ORDER BY sum(e.amount_usd) DESC`, [projectId]),
      this.db.query(
        `SELECT e.unit, count(DISTINCT e.worker_ref)::int AS workers, sum(e.quantity) AS quantity, sum(e.amount_usd) AS amount_usd
           FROM cost_entries e JOIN project_budget_lines l ON l.line_id = e.line_id
          WHERE e.project_id = $1 AND l.category = 'LABOUR' GROUP BY e.unit`, [projectId]),
    ]);
    const contract = numericToCents(project.contract_value_usd);

    return {
      project,
      asOf,
      totals: {
        revised_budget_usd: usd(bac), actual_usd: usd(ac), open_commitment_usd: usd(sum(out, 'openCommitment')),
        forecast_final_usd: usd(forecast), variance_usd: usd(bac - forecast),
        contract_value_usd: usd(contract), projected_margin_usd: contract > 0 ? usd(contract - Math.max(forecast, eac)) : null,
      },
      earnedValue: {
        percentComplete: progress.percentComplete, plannedPercent: progress.plannedPercent, scheduleStatus: progress.status,
        bac_usd: usd(bac), pv_usd: usd(pv), ev_usd: usd(ev), ac_usd: usd(ac),
        cpi, spi, eac_usd: usd(eac), vac_usd: usd(bac - eac),
      },
      alerts: out.filter((l) => l.status !== 'WITHIN_BUDGET')
        .map((l) => ({ cost_code: l.cost_code, description: l.description, status: l.status, consumed_percent: l.consumed_percent, variance_usd: l.variance_usd })),
      byCategory,
      lines: out.map(({ _c, ...l }) => l),
      monthly: monthly.rows.map((r) => ({ ...r, amount_usd: Number(r.amount_usd) })),
      materialConsumption: materialUse.rows.map((r) => ({ ...r, quantity: Number(r.quantity), amount_usd: Number(r.amount_usd) })),
      equipmentUsage: plantUse.rows.map((r) => ({ ...r, hours: Number(r.hours), amount_usd: Number(r.amount_usd) })),
      labour: labourUse.rows.map((r) => ({ ...r, quantity: Number(r.quantity), amount_usd: Number(r.amount_usd) })),
    };
  }
}
