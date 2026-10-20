import { useState, useMemo } from 'react';
import * as api from '../../api';
import type { Equipment, FleetSummary, MaintenanceLog, MaintenanceType } from '../../types';
import {
  Badge, Button, Card, Ctx, Empty, Field, ProgressBar, Stat, humanize, inputCls, num, statusTone,
  tdCls, thCls, useAction, useForm, useLoader, usd,
} from './ui';

const TYPES: MaintenanceType[] = ['BREAKDOWN', 'CORRECTIVE', 'PREVENTIVE', 'INSPECTION'];

/** Equipment register, service intervals, breakdowns and maintenance jobs (fleet-wide). */
export function PlantPanel({ projectId, ctx }: { projectId?: string; ctx: Ctx }) {
  const [fleet, reload] = useLoader<Equipment[]>(() => api.fetchEquipment(), [], ctx, []);
  const [summary, reloadSummary] = useLoader<FleetSummary | null>(() => api.fetchFleetSummary(), [], ctx, null);
  const [selected, setSelected] = useState<string | null>(null);
  const refresh = async () => { await Promise.all([reload(), reloadSummary()]); };

  // ⚡ Bolt Performance Optimization:
  // Replaced multiple O(N) inline `.filter()` and `.find()` operations with a single pass loop wrapped in `useMemo`.
  // This avoids redundant recalculations on every render.
  const { down, due, dueSoon, machine } = useMemo(() => {
    let down = 0, due = 0, dueSoon = 0, machine = null;
    for (const e of fleet) {
      if (e.status !== 'AVAILABLE') down++;
      if (e.service_due) due++;
      if (e.service_due_soon) dueSoon++;
      if (e.equipment_id === selected) machine = e;
    }
    return { down, due, dueSoon, machine };
  }, [fleet, selected]);

  // ⚡ Bolt Performance Optimization:
  // Replaced multiple O(N) inline `.reduce()` operations with a single pass loop wrapped in `useMemo`.
  const { totalDowntime, totalMaintenanceCost } = useMemo(() => {
    let totalDowntime = 0, totalMaintenanceCost = 0;
    if (summary?.equipment) {
      for (const e of summary.equipment) {
        totalDowntime += e.downtime_hours;
        totalMaintenanceCost += e.maintenance_cost_usd;
      }
    }
    return { totalDowntime, totalMaintenanceCost };
  }, [summary]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Machines" value={fleet.length} hint={`${fleet.length - down} available`} />
        <Stat label="Out of use" value={down} tone={down ? 'amber' : 'green'} hint="In workshop or out of service" />
        <Stat label="Service overdue" value={due} tone={due ? 'red' : 'green'} hint={`${dueSoon} due soon`} />
        <Stat label={`Downtime (${summary?.windowDays ?? 90} days)`} value={`${num(totalDowntime ?? 0)} h`}
          hint={usd(totalMaintenanceCost ?? 0) + ' maintenance spend'} />
      </div>

      <Card title="Plant register" subtitle="Hours booked to projects run the hour meter; the service bar fills towards the next service interval"
        actions={<RegisterEquipment ctx={ctx} onAdded={refresh} />}>
        {fleet.length === 0 ? <Empty>No equipment registered.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-slate-300">
              <thead className="bg-slate-950 text-[10px] uppercase text-slate-400">
                <tr>{['Asset', 'Type', 'Rate', 'Hour meter', 'Service', 'Status', 'Open job', ''].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {fleet.map((e) => {
                  const pct = (e.hours_since_service / Number(e.service_interval_hours)) * 100;
                  return (
                    <tr key={e.equipment_id} className={`cursor-pointer ${selected === e.equipment_id ? 'bg-indigo-950/30' : 'hover:bg-slate-800/30'}`} onClick={() => setSelected(e.equipment_id)}>
                      <td className={tdCls}><span className="font-bold text-white">{e.asset_tag}</span><div className="text-slate-400">{e.name}</div></td>
                      <td className={tdCls}>{e.equipment_type}</td>
                      <td className={tdCls}>{usd(e.hourly_rate_usd)}/h</td>
                      <td className={tdCls}>{num(e.hour_meter)} h</td>
                      <td className={`${tdCls} w-44`}>
                        <ProgressBar value={pct} tone={e.service_due ? 'red' : e.service_due_soon ? 'amber' : 'green'} />
                        <div className={`text-[10px] mt-1 ${e.service_due ? 'text-rose-300' : 'text-slate-500'}`}>
                          {e.service_due ? `Overdue by ${num(-e.hours_to_next_service)} h` : `${num(e.hours_to_next_service)} h to service`}
                        </div>
                      </td>
                      <td className={tdCls}><Badge tone={statusTone(e.status)}>{humanize(e.status)}</Badge></td>
                      <td className={tdCls}>{e.open_job ? <span className="text-amber-300">{humanize(e.open_job.maintenance_type)}: {e.open_job.description}</span> : '—'}</td>
                      <td className={tdCls}><span className="text-indigo-400">Manage ›</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {machine && <MachineView key={machine.equipment_id} machine={machine} projectId={projectId} ctx={ctx} onChanged={refresh} />}

      {summary && summary.equipment.length > 0 && (
        <Card title={`Fleet reliability — last ${summary.windowDays} days`} subtitle="Availability = 1 − downtime ÷ calendar hours; mean hours between breakdowns from booked hours">
          <div className="overflow-x-auto">
            <table className="w-full text-slate-300">
              <thead className="bg-slate-950 text-[10px] uppercase text-slate-400">
                <tr>{['Asset', 'Hours worked', 'Breakdowns', 'Downtime', 'Availability', 'MTBF (h)', 'Maintenance cost'].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {summary.equipment.map((e) => (
                  <tr key={e.equipment_id}>
                    <td className={`${tdCls} text-white font-bold`}>{e.asset_tag} <span className="text-slate-400 font-normal">{e.name}</span></td>
                    <td className={tdCls}>{num(e.hours_worked)}</td>
                    <td className={tdCls}>{e.breakdowns}</td>
                    <td className={tdCls}>{num(e.downtime_hours)} h</td>
                    <td className={`${tdCls} ${e.availability_percent < 95 ? 'text-amber-300' : 'text-emerald-300'}`}>{e.availability_percent}%</td>
                    <td className={tdCls}>{num(e.mean_hours_between_breakdowns)}</td>
                    <td className={tdCls}>{usd(e.maintenance_cost_usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function MachineView({ machine, projectId, ctx, onChanged }: { machine: Equipment; projectId?: string; ctx: Ctx; onChanged: () => unknown }) {
  const [logs, reloadLogs] = useLoader<MaintenanceLog[]>(() => api.fetchMaintenance(machine.equipment_id), [machine.equipment_id], ctx, []);
  const { busy, run } = useAction(ctx);
  const report = useForm({ maintenanceType: 'BREAKDOWN', description: '' });
  const complete = useForm({ workDone: '', partsCostUsd: '', labourCostUsd: '', hourMeterReading: '', outOfService: '' });
  const done = async () => { await Promise.all([reloadLogs(), onChanged()]); };
  const job = machine.open_job;
  const plant = ctx.hasRole('PLANT_MANAGER');

  return (
    <Card title={`${machine.asset_tag} — ${machine.name}`} subtitle={`${machine.equipment_type} · service every ${num(machine.service_interval_hours)} h · last service at ${num(machine.last_service_hours)} h`}
      actions={<>
        <Badge tone={statusTone(machine.status)}>{humanize(machine.status)}</Badge>
        {plant && !job && machine.status === 'OUT_OF_SERVICE' && <Button variant="success" disabled={busy}
          onClick={() => run(() => api.setEquipmentStatus(machine.equipment_id, 'AVAILABLE'), `${machine.asset_tag} returned to service`, done)}>Return to service</Button>}
        {plant && !job && machine.status === 'AVAILABLE' && <Button variant="danger" disabled={busy}
          onClick={() => window.confirm(`Take ${machine.asset_tag} out of service?`) && run(() => api.setEquipmentStatus(machine.equipment_id, 'OUT_OF_SERVICE'), `${machine.asset_tag} out of service`, done)}>Retire / stand down</Button>}
      </>}>
      <div className="grid lg:grid-cols-2 gap-4">
        {job ? (
          <div className="bg-amber-950/20 border border-amber-500/30 rounded-xl p-3 space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-amber-300">Open {humanize(job.maintenance_type)} job</div>
            <p className="text-slate-200">{job.description}</p>
            <p className="text-slate-500">Reported by {job.reported_by} · {new Date(job.reported_at).toLocaleString()}{job.takes_out_of_use ? ' · machine cannot book hours' : ''}</p>
            {plant ? (
              <form className="grid sm:grid-cols-2 gap-2" onSubmit={async (e) => {
                e.preventDefault();
                const v = complete.values;
                const ok = await run(() => api.completeMaintenance(job.log_id, {
                  workDone: v.workDone, partsCostUsd: v.partsCostUsd || undefined, labourCostUsd: v.labourCostUsd || undefined,
                  hourMeterReading: v.hourMeterReading || undefined, outOfService: v.outOfService === 'yes',
                }), (r) => `Job completed — ${num(r.log.downtime_hours, 2)} h downtime; ${r.equipment.asset_tag} is ${humanize(r.equipment.status)}`, done);
                if (ok) complete.reset();
              }}>
                <Field label="Work done" wide><textarea {...complete.bind('workDone')} required rows={2} className={inputCls} /></Field>
                <Field label="Parts (USD)"><input {...complete.bind('partsCostUsd')} inputMode="decimal" className={inputCls} /></Field>
                <Field label="Labour (USD)"><input {...complete.bind('labourCostUsd')} inputMode="decimal" className={inputCls} /></Field>
                <Field label={`Hour meter (now ${num(machine.hour_meter)})`}><input {...complete.bind('hourMeterReading')} inputMode="decimal" className={inputCls} /></Field>
                <Field label="Afterwards">
                  <select {...complete.bind('outOfService')} className={inputCls}><option value="">Return to use</option><option value="yes">Keep out of service</option></select>
                </Field>
                <div className="sm:col-span-2 flex justify-end"><Button type="submit" variant="success" disabled={busy}>Complete job</Button></div>
              </form>
            ) : <p className="text-slate-500 text-[11px]">The plant manager completes maintenance jobs.</p>}
          </div>
        ) : ctx.hasRole('PLANT_MANAGER', 'SITE_SUPERVISOR') ? (
          <form className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 space-y-2" onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run(() => api.reportMaintenance(machine.equipment_id, { ...report.values, projectId }),
              `${humanize(report.values.maintenanceType)} logged for ${machine.asset_tag}`, done);
            if (ok) report.reset();
          }}>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Report breakdown / book maintenance</div>
            <select {...report.bind('maintenanceType')} className={inputCls} aria-label="Maintenance type">
              {TYPES.map((t) => <option key={t} value={t}>{humanize(t)}{t === 'INSPECTION' ? ' (machine stays in use)' : ''}</option>)}
            </select>
            <textarea {...report.bind('description')} required rows={2} placeholder="Fault or work required" className={inputCls} aria-label="Description" />
            <div className="flex justify-end"><Button type="submit" variant={report.values.maintenanceType === 'BREAKDOWN' ? 'danger' : 'primary'} disabled={busy}>Log job</Button></div>
          </form>
        ) : <p className="text-slate-500">No open maintenance job.</p>}

        <div className="space-y-1 max-h-72 overflow-y-auto">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Maintenance history</div>
          {logs.length === 0 && <p className="text-slate-500">No maintenance recorded.</p>}
          {logs.map((l) => (
            <div key={l.log_id} className="border-b border-slate-800 py-1.5">
              <div className="flex gap-2 items-center">
                <Badge tone={l.maintenance_type === 'BREAKDOWN' ? 'red' : l.maintenance_type === 'PREVENTIVE' ? 'green' : 'slate'}>{humanize(l.maintenance_type)}</Badge>
                <span className="text-slate-400">{new Date(l.reported_at).toLocaleDateString()}</span>
                {l.project_code && <span className="text-slate-500">{l.project_code}</span>}
                <Badge tone={statusTone(l.status === 'OPEN' ? 'UNDER_MAINTENANCE' : 'COMPLETED')}>{humanize(l.status)}</Badge>
              </div>
              <div className="text-slate-300">{l.description}</div>
              {l.work_done && <div className="text-slate-400">{l.work_done} · {num(l.downtime_hours, 2)} h down · {usd(Number(l.parts_cost_usd ?? 0) + Number(l.labour_cost_usd ?? 0))}</div>}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function RegisterEquipment({ ctx, onAdded }: { ctx: Ctx; onAdded: () => unknown }) {
  const [open, setOpen] = useState(false);
  const f = useForm({ assetTag: '', name: '', equipmentType: '', hourlyRateUsd: '', hourMeter: '', serviceIntervalHours: '250', lastServiceHours: '' });
  const { busy, run } = useAction(ctx);
  if (!ctx.hasRole('PLANT_MANAGER')) return null;
  if (!open) return <Button onClick={() => setOpen(true)}>+ Register machine</Button>;
  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(Object.entries(f.values).filter(([, v]) => v !== ''));
      if (await run(() => api.createEquipment(body), `${f.values.assetTag.toUpperCase()} registered`, onAdded)) { f.reset(); setOpen(false); }
    }}>
      <input {...f.bind('assetTag')} required placeholder="Asset tag" className={`${inputCls} w-28`} aria-label="Asset tag" />
      <input {...f.bind('name')} required placeholder="Make / model" className={`${inputCls} w-44`} aria-label="Name" />
      <input {...f.bind('equipmentType')} required placeholder="Type (TLB, roller…)" className={`${inputCls} w-36`} aria-label="Type" />
      <input {...f.bind('hourlyRateUsd')} required placeholder="Rate $/h" className={`${inputCls} w-24`} inputMode="decimal" aria-label="Hourly rate" />
      <input {...f.bind('hourMeter')} placeholder="Hour meter" className={`${inputCls} w-24`} inputMode="decimal" aria-label="Hour meter" />
      <input {...f.bind('serviceIntervalHours')} placeholder="Service every (h)" className={`${inputCls} w-28`} inputMode="decimal" aria-label="Service interval" />
      <input {...f.bind('lastServiceHours')} placeholder="Last service at (h)" className={`${inputCls} w-32`} inputMode="decimal" aria-label="Last service hours" />
      <Button type="submit" disabled={busy}>Register</Button>
      <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
    </form>
  );
}
