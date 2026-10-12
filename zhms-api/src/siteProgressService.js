import { badRequest, notFound, conflict } from './errors.js';
import { audit } from './db.js';
import { todayHarare } from './dates.js';
import * as f from './fields.js';

export const WEATHER = ['SUNNY', 'CLOUDY', 'RAIN', 'HEAVY_RAIN', 'WINDY', 'STORM'];
const REPORTING_STATUSES = ['ACTIVE', 'ON_HOLD'];

const MILESTONE_COLS = `milestone_id, project_id, seq, name, weight_percent, planned_start::text AS planned_start,
  planned_finish::text AS planned_finish, percent_complete, actual_start::text AS actual_start,
  actual_finish::text AS actual_finish, created_at`;

const dayNumber = (ymd) => Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10)) / 86_400_000;
const round1 = (n) => Math.round(n * 10) / 10;

/** Share of a milestone that should be done by `asOf`, assuming even work across its planned days (inclusive). */
export function plannedFraction(m, asOf) {
  const a = dayNumber(asOf);
  const s = dayNumber(m.planned_start);
  const e = dayNumber(m.planned_finish);
  if (a < s) return 0;
  if (a >= e) return 1;
  return (a - s + 1) / (e - s + 1);
}

/**
 * Weighted physical progress vs the baseline plan. Weights are normalised by the weight assigned so far,
 * so a project still being planned (weights < 100) reports sensibly; `weightAssigned` lets the UI warn.
 */
export function progressSummary(milestones, asOf) {
  const totalWeight = milestones.reduce((s, m) => s + Number(m.weight_percent), 0);
  if (!totalWeight) {
    return { percentComplete: 0, plannedPercent: 0, scheduleVariance: 0, status: 'NO_SCHEDULE', weightAssigned: 0 };
  }
  const actual = milestones.reduce((s, m) => s + Number(m.weight_percent) * Number(m.percent_complete), 0) / totalWeight;
  const planned = milestones.reduce((s, m) => s + Number(m.weight_percent) * plannedFraction(m, asOf) * 100, 0) / totalWeight;
  const variance = actual - planned;
  let status = 'ON_TRACK';
  if (milestones.every((m) => Number(m.percent_complete) === 100)) status = 'COMPLETE';
  else if (variance < -5) status = 'BEHIND';
  else if (variance > 2) status = 'AHEAD';
  return {
    percentComplete: round1(actual),
    plannedPercent: round1(planned),
    scheduleVariance: round1(variance),
    status,
    weightAssigned: round1(totalWeight),
  };
}

function milestoneState(m, asOf) {
  const pct = Number(m.percent_complete);
  let state = pct === 100 ? 'COMPLETED' : pct > 0 ? 'IN_PROGRESS' : 'NOT_STARTED';
  if (pct < 100 && asOf > m.planned_finish) state = 'LATE';
  else if (pct === 0 && asOf > m.planned_start) state = 'LATE_START';
  return { ...m, state, planned_percent: round1(plannedFraction(m, asOf) * 100) };
}

export class SiteProgressService {
  constructor(db) {
    this.db = db;
  }

  async #project(client, projectId, { lock = false } = {}) {
    f.uuid(projectId, 'projectId');
    const { rows: [p] } = await client.query(
      `SELECT project_id, code, status, start_date::text AS start_date, planned_end_date::text AS planned_end_date
         FROM construction_projects WHERE project_id = $1 ${lock ? 'FOR UPDATE' : ''}`, [projectId]);
    if (!p) throw notFound('Project');
    return p;
  }

  async listMilestones(projectId, asOf = todayHarare()) {
    await this.#project(this.db, projectId);
    const { rows } = await this.db.query(`SELECT ${MILESTONE_COLS} FROM project_milestones WHERE project_id = $1 ORDER BY seq`, [projectId]);
    return rows.map((m) => milestoneState(m, asOf));
  }

  async createMilestone(projectId, body, actor) {
    const b = body ?? {};
    const name = f.text(b.name, 'name', { max: 200 });
    const weight = f.decimal(b.weightPercent, 'weightPercent', { min: 0.01, max: 100 });
    const plannedStart = f.date(b.plannedStart, 'plannedStart');
    const plannedFinish = f.date(b.plannedFinish, 'plannedFinish');
    if (plannedFinish < plannedStart) throw badRequest('INVALID_FIELD', 'plannedFinish must be on or after plannedStart');
    return this.db.tx(async (client) => {
      const project = await this.#project(client, projectId, { lock: true });
      if (plannedStart < project.start_date) throw badRequest('INVALID_FIELD', `plannedStart cannot be before the project start (${project.start_date})`);
      const seq = b.seq !== undefined
        ? f.int(b.seq, 'seq', { min: 1, max: 999 })
        : (await client.query('SELECT COALESCE(max(seq), 0) + 1 AS n FROM project_milestones WHERE project_id = $1', [projectId])).rows[0].n;
      const { rows: [m] } = await client.query(
        `INSERT INTO project_milestones (project_id, seq, name, weight_percent, planned_start, planned_finish)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING ${MILESTONE_COLS}`,
        [projectId, seq, name, weight, plannedStart, plannedFinish]);
      await audit(client, actor, 'MILESTONE_CREATED', 'project_milestones', m.milestone_id, { projectId, name, weight });
      return m;
    });
  }

  /**
   * One immutable report per project per day. Progress updates in the report move the milestones
   * forward in the same transaction; the database refuses backwards progress and completion over open NCRs.
   */
  async submitDailyReport(projectId, body, actor) {
    const b = body ?? {};
    const reportDate = f.date(b.reportDate, 'reportDate');
    if (reportDate > todayHarare()) throw badRequest('INVALID_FIELD', 'reportDate cannot be in the future');
    const weather = f.oneOf(b.weather, 'weather', WEATHER);
    const workers = f.int(b.workersOnSite, 'workersOnSite', { min: 0, max: 5000 });
    const workPerformed = f.text(b.workPerformed, 'workPerformed', { max: 5000 });
    const delays = f.text(b.delays, 'delays', { optional: true, max: 2000 });
    const lostHours = f.decimal(b.lostHours, 'lostHours', { min: 0, max: 24 * 31, fallback: '0' });
    const incidents = f.int(b.safetyIncidents, 'safetyIncidents', { min: 0, max: 1000, fallback: 0 });
    const safetyNotes = f.text(b.safetyNotes, 'safetyNotes', { optional: true, max: 2000 });
    if (incidents > 0 && !safetyNotes) throw badRequest('SAFETY_NOTES_REQUIRED', 'Describe every safety incident in safetyNotes');
    if (Number(lostHours) > 0 && !delays) throw badRequest('DELAY_REASON_REQUIRED', 'Give the reason for lost hours in delays');
    const progress = Array.isArray(b.progress) ? b.progress : [];
    if (progress.length > 100) throw badRequest('INVALID_FIELD', 'At most 100 progress updates per report');
    const updates = progress.map((p, i) => ({
      milestoneId: f.uuid(p?.milestoneId, `progress[${i}].milestoneId`),
      percent: f.decimal(p?.percentComplete, `progress[${i}].percentComplete`, { min: 0, max: 100 }),
      note: f.text(p?.note, `progress[${i}].note`, { optional: true, max: 1000 }),
    }));
    if (new Set(updates.map((u) => u.milestoneId)).size !== updates.length) {
      throw badRequest('INVALID_FIELD', 'Each milestone may appear only once in a report');
    }

    return this.db.tx(async (client) => {
      const project = await this.#project(client, projectId);
      if (!REPORTING_STATUSES.includes(project.status)) {
        throw conflict('PROJECT_NOT_REPORTING', `Site reports are accepted for ACTIVE or ON_HOLD projects (this one is ${project.status})`);
      }
      if (reportDate < project.start_date) throw badRequest('INVALID_FIELD', `reportDate cannot be before the project start (${project.start_date})`);
      const { rows: [report] } = await client.query(
        `INSERT INTO daily_site_reports (project_id, report_date, weather, workers_on_site, work_performed, delays,
                                         lost_hours, safety_incidents, safety_notes, submitted_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING report_id, report_date::text AS report_date, created_at`,
        [projectId, reportDate, weather, workers, workPerformed, delays, lostHours, incidents, safetyNotes, actor]);

      const applied = [];
      for (const u of updates) {
        const { rows: [m] } = await client.query(
          'SELECT milestone_id, name, percent_complete FROM project_milestones WHERE milestone_id = $1 AND project_id = $2 FOR UPDATE',
          [u.milestoneId, projectId]);
        if (!m) throw badRequest('UNKNOWN_MILESTONE', `Milestone ${u.milestoneId} is not part of this project`);
        await client.query(
          `UPDATE project_milestones
              SET percent_complete = $2::numeric,
                  actual_start = CASE WHEN $2::numeric > 0 THEN COALESCE(actual_start, $3::date) ELSE actual_start END,
                  actual_finish = CASE WHEN $2::numeric = 100 THEN COALESCE(actual_finish, $3::date) END
            WHERE milestone_id = $1`, [u.milestoneId, u.percent, reportDate]);
        await client.query(
          `INSERT INTO daily_progress_updates (report_id, project_id, milestone_id, percent_before, percent_after, note)
           VALUES ($1,$2,$3,$4,$5,$6)`, [report.report_id, projectId, u.milestoneId, m.percent_complete, u.percent, u.note]);
        applied.push({ milestoneId: u.milestoneId, name: m.name, before: Number(m.percent_complete), after: Number(u.percent) });
      }
      await audit(client, actor, 'DAILY_REPORT_SUBMITTED', 'daily_site_reports', report.report_id, {
        projectId, reportDate, workers, incidents, progress: applied,
      });
      return { ...report, progress: applied };
    });
  }

  async listDailyReports(projectId, { from, to } = {}) {
    await this.#project(this.db, projectId);
    const { rows } = await this.db.query(
      `SELECT r.report_id, r.report_date::text AS report_date, r.weather, r.workers_on_site, r.work_performed, r.delays,
              r.lost_hours, r.safety_incidents, r.safety_notes, r.submitted_by, r.created_at,
              COALESCE(json_agg(json_build_object('milestone_id', u.milestone_id, 'name', m.name,
                         'percent_before', u.percent_before, 'percent_after', u.percent_after, 'note', u.note)
                       ORDER BY m.seq) FILTER (WHERE u.milestone_id IS NOT NULL), '[]') AS progress
         FROM daily_site_reports r
         LEFT JOIN daily_progress_updates u ON u.report_id = r.report_id
         LEFT JOIN project_milestones m ON m.milestone_id = u.milestone_id
        WHERE r.project_id = $1
          AND ($2::date IS NULL OR r.report_date >= $2::date)
          AND ($3::date IS NULL OR r.report_date <= $3::date)
        GROUP BY r.report_id ORDER BY r.report_date DESC LIMIT 366`,
      [projectId, f.date(from, 'from', { optional: true }), f.date(to, 'to', { optional: true })]);
    return rows;
  }

  /** Schedule position, milestone states, the planned-vs-actual S-curve and site-diary statistics. */
  async getProgress(projectId, asOf = todayHarare()) {
    const project = await this.#project(this.db, projectId);
    const { rows: milestones } = await this.db.query(`SELECT ${MILESTONE_COLS} FROM project_milestones WHERE project_id = $1 ORDER BY seq`, [projectId]);
    const { rows: history } = await this.db.query(
      `SELECT r.report_date::text AS report_date, r.workers_on_site, r.lost_hours, r.safety_incidents, r.weather,
              COALESCE(json_agg(json_build_object('milestone_id', u.milestone_id, 'percent_after', u.percent_after))
                       FILTER (WHERE u.milestone_id IS NOT NULL), '[]') AS updates
         FROM daily_site_reports r LEFT JOIN daily_progress_updates u ON u.report_id = r.report_id
        WHERE r.project_id = $1 GROUP BY r.report_id ORDER BY r.report_date`, [projectId]);

    // Rebuild actual progress as it stood on each reported day, against the plan for that day.
    const pct = new Map(milestones.map((m) => [m.milestone_id, 0]));
    const curve = history.map((r) => {
      for (const u of r.updates) pct.set(u.milestone_id, Number(u.percent_after));
      const snapshot = milestones.map((m) => ({ ...m, percent_complete: pct.get(m.milestone_id) }));
      const s = progressSummary(snapshot, r.report_date);
      return { date: r.report_date, planned: s.plannedPercent, actual: s.percentComplete, workers: r.workers_on_site };
    });

    const diary = history.reduce((acc, r) => {
      acc.daysReported += 1;
      acc.lostHours += Number(r.lost_hours);
      acc.safetyIncidents += r.safety_incidents;
      acc.workerDays += r.workers_on_site;
      if (['RAIN', 'HEAVY_RAIN', 'STORM'].includes(r.weather)) acc.wetDays += 1;
      return acc;
    }, { daysReported: 0, lostHours: 0, safetyIncidents: 0, workerDays: 0, wetDays: 0 });
    const last = history[history.length - 1];

    return {
      project: { project_id: project.project_id, code: project.code, status: project.status, start_date: project.start_date, planned_end_date: project.planned_end_date },
      asOf,
      summary: progressSummary(milestones, asOf),
      milestones: milestones.map((m) => milestoneState(m, asOf)),
      curve,
      diary: {
        ...diary,
        lostHours: round1(diary.lostHours),
        averageWorkers: diary.daysReported ? round1(diary.workerDays / diary.daysReported) : 0,
        lastReportDate: last?.report_date ?? null,
        daysSinceLastReport: last ? dayNumber(asOf) - dayNumber(last.report_date) : null,
      },
    };
  }
}
