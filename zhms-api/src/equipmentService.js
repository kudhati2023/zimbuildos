import { badRequest, notFound, conflict } from './errors.js';
import { audit } from './db.js';
import * as f from './fields.js';

export const MAINTENANCE_TYPES = ['PREVENTIVE', 'CORRECTIVE', 'BREAKDOWN', 'INSPECTION'];
const DUE_SOON_SHARE = 0.9; // flag a service once 90% of the interval has been run
const ROLLING_DAYS = 90;

const LOG_COLS = `g.log_id, g.equipment_id, g.project_id, g.maintenance_type, g.status, g.description, g.takes_out_of_use, g.reported_by,
  g.reported_at, g.work_done, g.hour_meter_reading, g.parts_cost_usd, g.labour_cost_usd, g.downtime_hours, g.completed_by, g.completed_at`;

/** Service position from the hour meter: hours since last service and whether the next one is due. */
export function serviceStatus(eq) {
  const since = Number(eq.hour_meter) - Number(eq.last_service_hours);
  const interval = Number(eq.service_interval_hours);
  return {
    hours_since_service: Math.round(since * 10) / 10,
    hours_to_next_service: Math.round((interval - since) * 10) / 10,
    service_due: since >= interval,
    service_due_soon: since < interval && since >= interval * DUE_SOON_SHARE,
  };
}

export class EquipmentService {
  constructor(db) {
    this.db = db;
  }

  async listEquipment() {
    const { rows } = await this.db.query(
      `SELECT e.*, (SELECT row_to_json(x) FROM (SELECT ${LOG_COLS} FROM maintenance_logs g
                      WHERE g.equipment_id = e.equipment_id AND g.status = 'OPEN') x) AS open_job
         FROM equipment e ORDER BY e.asset_tag`);
    return rows.map((e) => ({ ...e, ...serviceStatus(e) }));
  }

  async createEquipment(body, actor) {
    const b = body ?? {};
    const meter = f.decimal(b.hourMeter, 'hourMeter', { min: 0, max: 1_000_000, decimals: 1, fallback: '0' });
    const lastService = f.decimal(b.lastServiceHours, 'lastServiceHours', { min: 0, max: 1_000_000, decimals: 1, fallback: meter });
    if (Number(lastService) > Number(meter)) throw badRequest('INVALID_FIELD', 'lastServiceHours cannot exceed hourMeter');
    const hourlyRate = f.decimal(b.hourlyRateUsd, 'hourlyRateUsd', { min: 0.01, max: 100_000 });
    return this.db.tx(async (client) => {
      const { rows: [e] } = await client.query(
        `INSERT INTO equipment (asset_tag, name, equipment_type, hourly_rate_usd, hour_meter, service_interval_hours, last_service_hours)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [f.code(b.assetTag, 'assetTag', /^[A-Z0-9][A-Z0-9\-/]{1,29}$/), f.text(b.name, 'name', { max: 200 }),
          f.text(b.equipmentType, 'equipmentType', { max: 100 }), hourlyRate, meter,
          f.decimal(b.serviceIntervalHours, 'serviceIntervalHours', { min: 1, max: 100_000, decimals: 1, fallback: '250' }), lastService]);
      await audit(client, actor, 'EQUIPMENT_REGISTERED', 'equipment', e.equipment_id, { assetTag: e.asset_tag, name: e.name });
      return { ...e, ...serviceStatus(e) };
    });
  }

  /**
   * Opens a maintenance job. Anything other than a routine inspection takes the machine out of use,
   * which the cost ledger enforces: it cannot book hours until the job is completed.
   */
  async reportMaintenance(equipmentId, body, actor) {
    f.uuid(equipmentId, 'equipmentId');
    const b = body ?? {};
    const type = f.oneOf(b.maintenanceType, 'maintenanceType', MAINTENANCE_TYPES);
    const description = f.text(b.description, 'description', { max: 2000 });
    const projectId = f.uuid(b.projectId, 'projectId', { optional: true });
    const takesOut = type !== 'INSPECTION';
    return this.db.tx(async (client) => {
      const { rows: [e] } = await client.query('SELECT * FROM equipment WHERE equipment_id = $1 FOR UPDATE', [equipmentId]);
      if (!e) throw notFound('Equipment');
      if (projectId) {
        const { rowCount } = await client.query('SELECT 1 FROM construction_projects WHERE project_id = $1', [projectId]);
        if (!rowCount) throw badRequest('UNKNOWN_PROJECT', 'projectId does not exist');
      }
      const { rows: [log] } = await client.query(
        `INSERT INTO maintenance_logs AS g (equipment_id, project_id, maintenance_type, description, takes_out_of_use, reported_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING ${LOG_COLS}`, [equipmentId, projectId, type, description, takesOut, actor]);
      if (takesOut && e.status === 'AVAILABLE') {
        await client.query(`UPDATE equipment SET status = 'UNDER_MAINTENANCE' WHERE equipment_id = $1`, [equipmentId]);
      }
      await audit(client, actor, 'MAINTENANCE_OPENED', 'equipment', equipmentId, { logId: log.log_id, type });
      return log;
    });
  }

  /**
   * Completes the job: records the work, cost and meter reading, computes downtime, resets the service
   * clock after preventive maintenance and returns the machine to use (or marks it out of service).
   */
  async completeMaintenance(logId, body, actor) {
    f.uuid(logId, 'logId');
    const b = body ?? {};
    const workDone = f.text(b.workDone, 'workDone', { min: 5, max: 5000 });
    const parts = f.decimal(b.partsCostUsd, 'partsCostUsd', { min: 0, max: 10_000_000, fallback: '0' });
    const labour = f.decimal(b.labourCostUsd, 'labourCostUsd', { min: 0, max: 10_000_000, fallback: '0' });
    const reading = f.decimal(b.hourMeterReading, 'hourMeterReading', { min: 0, max: 1_000_000, decimals: 1, optional: true });
    const outOfService = b.outOfService === true;
    return this.db.tx(async (client) => {
      const { rows: [log] } = await client.query('SELECT * FROM maintenance_logs WHERE log_id = $1 FOR UPDATE', [logId]);
      if (!log) throw notFound('Maintenance job');
      if (log.status !== 'OPEN') throw conflict('MAINTENANCE_NOT_OPEN', 'This maintenance job is already completed');
      const { rows: [e] } = await client.query('SELECT * FROM equipment WHERE equipment_id = $1 FOR UPDATE', [log.equipment_id]);
      if (reading !== null && Number(reading) < Number(e.hour_meter)) {
        throw badRequest('METER_GOES_BACKWARDS', `hourMeterReading cannot be below the current meter (${e.hour_meter})`);
      }
      const meter = reading ?? e.hour_meter;
      const { rows: [done] } = await client.query(
        `UPDATE maintenance_logs g SET status = 'COMPLETED', work_done = $2, parts_cost_usd = $3, labour_cost_usd = $4,
                hour_meter_reading = $5, completed_by = $6, completed_at = now(),
                downtime_hours = CASE WHEN takes_out_of_use THEN round((extract(epoch FROM now() - reported_at) / 3600)::numeric, 2) ELSE 0 END
          WHERE log_id = $1 RETURNING ${LOG_COLS}`, [logId, workDone, parts, labour, meter, actor]);
      const nextStatus = outOfService ? 'OUT_OF_SERVICE' : log.takes_out_of_use ? 'AVAILABLE' : e.status;
      const { rows: [updated] } = await client.query(
        `UPDATE equipment SET hour_meter = $2::numeric, status = $3,
                last_service_hours = CASE WHEN $4 THEN $2::numeric ELSE last_service_hours END
          WHERE equipment_id = $1 RETURNING *`, [e.equipment_id, meter, nextStatus, log.maintenance_type === 'PREVENTIVE']);
      await audit(client, actor, 'MAINTENANCE_COMPLETED', 'equipment', e.equipment_id, {
        logId, downtimeHours: done.downtime_hours, cost: (Number(parts) + Number(labour)).toFixed(2), status: nextStatus,
      });
      return { log: done, equipment: { ...updated, ...serviceStatus(updated) } };
    });
  }

  /** Returns out-of-service plant to use, or retires it, outside a maintenance job. */
  async setStatus(equipmentId, status, actor) {
    f.uuid(equipmentId, 'equipmentId');
    const next = f.oneOf(status, 'status', ['AVAILABLE', 'OUT_OF_SERVICE']);
    return this.db.tx(async (client) => {
      const { rows: [e] } = await client.query('SELECT status FROM equipment WHERE equipment_id = $1 FOR UPDATE', [equipmentId]);
      if (!e) throw notFound('Equipment');
      const { rowCount } = await client.query(
        `SELECT 1 FROM maintenance_logs WHERE equipment_id = $1 AND status = 'OPEN' AND takes_out_of_use`, [equipmentId]);
      if (rowCount && next === 'AVAILABLE') throw conflict('MAINTENANCE_ALREADY_OPEN', 'Complete the open maintenance job to return this machine to use');
      const { rows: [u] } = await client.query('UPDATE equipment SET status = $2 WHERE equipment_id = $1 RETURNING *', [equipmentId, next]);
      await audit(client, actor, 'EQUIPMENT_STATUS_CHANGED', 'equipment', equipmentId, { from: e.status, to: next });
      return { ...u, ...serviceStatus(u) };
    });
  }

  async maintenanceHistory(equipmentId) {
    f.uuid(equipmentId, 'equipmentId');
    const { rows } = await this.db.query(
      `SELECT ${LOG_COLS}, p.code AS project_code FROM maintenance_logs g
         LEFT JOIN construction_projects p ON p.project_id = g.project_id
        WHERE g.equipment_id = $1 ORDER BY g.reported_at DESC LIMIT 500`, [equipmentId]);
    return rows;
  }

  /** Fleet reliability over the last 90 days: breakdowns, downtime, availability and maintenance spend. */
  async fleetSummary() {
    const { rows } = await this.db.query(
      `SELECT e.equipment_id, e.asset_tag, e.name, e.equipment_type, e.status, e.hour_meter, e.last_service_hours, e.service_interval_hours,
              count(g.log_id) FILTER (WHERE g.maintenance_type = 'BREAKDOWN')::int AS breakdowns,
              COALESCE(sum(g.downtime_hours), 0) AS downtime_hours,
              COALESCE(sum(g.parts_cost_usd + g.labour_cost_usd), 0) AS maintenance_cost_usd,
              COALESCE((SELECT sum(c.quantity) FROM cost_entries c WHERE c.equipment_id = e.equipment_id
                          AND c.entry_date >= current_date - $1::int), 0) AS hours_worked
         FROM equipment e
         LEFT JOIN maintenance_logs g ON g.equipment_id = e.equipment_id AND g.reported_at >= now() - make_interval(days => $1::int)
        GROUP BY e.equipment_id ORDER BY e.asset_tag`, [ROLLING_DAYS]);
    const windowHours = ROLLING_DAYS * 24;
    return {
      windowDays: ROLLING_DAYS,
      equipment: rows.map((r) => {
        const worked = Number(r.hours_worked);
        return {
          ...r,
          ...serviceStatus(r),
          downtime_hours: Number(r.downtime_hours),
          maintenance_cost_usd: Number(r.maintenance_cost_usd),
          hours_worked: worked,
          availability_percent: Math.round((1 - Math.min(Number(r.downtime_hours), windowHours) / windowHours) * 1000) / 10,
          mean_hours_between_breakdowns: r.breakdowns ? Math.round((worked / r.breakdowns) * 10) / 10 : null,
        };
      }),
    };
  }
}
