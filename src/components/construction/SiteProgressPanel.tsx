import React, { useState } from 'react';
import * as api from '../../api';
import type { DailyReport, ProjectProgress, Weather } from '../../types';
import {
  Badge, Button, Card, Ctx, Empty, Field, ProgressBar, RoleNote, Stat, humanize, inputCls, num, statusTone,
  tdCls, thCls, todayHarare, useAction, useForm, useLoader,
} from './ui';

const WEATHER: Weather[] = ['SUNNY', 'CLOUDY', 'RAIN', 'HEAVY_RAIN', 'WINDY', 'STORM'];

export function SiteProgressPanel({ projectId, ctx }: { projectId: string; ctx: Ctx }) {
  const [progress, reload] = useLoader<ProjectProgress | null>(() => api.fetchProgress(projectId), [projectId], ctx, null);
  const [reports, reloadReports] = useLoader<DailyReport[]>(() => api.fetchDailyReports(projectId), [projectId], ctx, []);
  const refresh = async () => { await Promise.all([reload(), reloadReports()]); };
  if (!progress) return <Empty>Loading site progress…</Empty>;
  const s = progress.summary;
  const d = progress.diary;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Stat label="Physical progress" value={`${num(s.percentComplete)}%`} hint={`Planned ${num(s.plannedPercent)}% today`}
          tone={s.status === 'BEHIND' ? 'red' : s.status === 'AHEAD' || s.status === 'COMPLETE' ? 'green' : undefined} />
        <Stat label="Schedule variance" value={`${s.scheduleVariance > 0 ? '+' : ''}${num(s.scheduleVariance)} pts`} hint={humanize(s.status)}
          tone={s.scheduleVariance < -5 ? 'red' : s.scheduleVariance < 0 ? 'amber' : 'green'} />
        <Stat label="Days reported" value={d.daysReported} hint={d.lastReportDate ? `Last ${d.lastReportDate}` : 'No site diary yet'}
          tone={d.daysSinceLastReport !== null && d.daysSinceLastReport > 2 ? 'amber' : undefined} />
        <Stat label="Average workforce" value={num(d.averageWorkers)} hint={`${d.workerDays} worker-days`} />
        <Stat label="Hours lost to delays" value={num(d.lostHours)} hint={`${d.wetDays} wet day(s)`} tone={d.lostHours > 0 ? 'amber' : undefined} />
        <Stat label="Safety incidents" value={d.safetyIncidents} tone={d.safetyIncidents > 0 ? 'red' : 'green'} hint="Reported in site diaries" />
      </div>
      {s.weightAssigned > 0 && s.weightAssigned !== 100 && (
        <p className="text-amber-300 text-[11px]">Milestone weights total {s.weightAssigned}% — add milestones until they total 100% for an accurate progress figure.</p>
      )}

      <div className="grid xl:grid-cols-5 gap-4">
        <Card title="Progress S-curve" subtitle="Weighted actual progress on each reported day vs the baseline plan" className="xl:col-span-3">
          <SCurve points={progress.curve} />
        </Card>
        <DailyReportForm projectId={projectId} progress={progress} ctx={ctx} onSubmitted={refresh} />
      </div>

      <Card title="Milestones" subtitle="Weighted contribution to overall progress. The white tick marks where the plan says each should be today."
        actions={<AddMilestone projectId={projectId} ctx={ctx} onAdded={refresh} />}>
        {progress.milestones.length === 0 ? <Empty>No milestones yet. The project manager sets the programme here.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-slate-300">
              <thead className="bg-slate-950 text-[10px] uppercase text-slate-400">
                <tr>{['#', 'Milestone', 'Weight', 'Planned', 'Actual', 'Progress', 'State'].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {progress.milestones.map((m) => (
                  <tr key={m.milestone_id}>
                    <td className={tdCls}>{m.seq}</td>
                    <td className={`${tdCls} font-bold text-white`}>{m.name}</td>
                    <td className={tdCls}>{num(m.weight_percent)}%</td>
                    <td className={`${tdCls} whitespace-nowrap`}>{m.planned_start} → {m.planned_finish}</td>
                    <td className={`${tdCls} whitespace-nowrap`}>{m.actual_start ?? '—'} → {m.actual_finish ?? '…'}</td>
                    <td className={`${tdCls} w-56`}>
                      <div className="flex items-center gap-2">
                        <div className="flex-1"><ProgressBar value={Number(m.percent_complete)} planned={m.planned_percent}
                          tone={m.state === 'COMPLETED' ? 'green' : m.state.startsWith('LATE') ? 'red' : 'indigo'} /></div>
                        <span className="w-12 text-right">{num(m.percent_complete)}%</span>
                      </div>
                    </td>
                    <td className={tdCls}><Badge tone={statusTone(m.state)}>{humanize(m.state)}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Site diary" subtitle="One immutable report per day: weather, workforce, work done, delays and safety">
        {reports.length === 0 ? <Empty>No daily site reports yet.</Empty> : (
          <div className="space-y-2 max-h-[28rem] overflow-y-auto">
            {reports.map((r) => (
              <div key={r.report_id} className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-white">{r.report_date}</span>
                  <Badge tone={['RAIN', 'HEAVY_RAIN', 'STORM'].includes(r.weather) ? 'blue' : 'slate'}>{humanize(r.weather)}</Badge>
                  <span className="text-slate-400">{r.workers_on_site} on site</span>
                  {Number(r.lost_hours) > 0 && <Badge tone="amber">{num(r.lost_hours)} h lost</Badge>}
                  {r.safety_incidents > 0 && <Badge tone="red">{r.safety_incidents} safety incident(s)</Badge>}
                  <span className="ml-auto text-slate-500">by {r.submitted_by}</span>
                </div>
                <p className="text-slate-300 whitespace-pre-wrap">{r.work_performed}</p>
                {r.delays && <p className="text-amber-300">Delay: {r.delays}</p>}
                {r.safety_notes && <p className="text-rose-300">Safety: {r.safety_notes}</p>}
                {r.progress.map((p) => (
                  <p key={p.milestone_id} className="text-indigo-300">▲ {p.name}: {num(p.percent_before)}% → {num(p.percent_after)}%{p.note ? ` — ${p.note}` : ''}</p>
                ))}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/** Planned vs actual cumulative progress, drawn as a small inline SVG chart. */
function SCurve({ points }: { points: ProjectProgress['curve'] }) {
  if (points.length < 1) return <Empty>The curve appears once site diaries are submitted.</Empty>;
  const W = 640; const H = 220; const pad = { l: 36, r: 12, t: 12, b: 28 };
  const x = (i: number) => pad.l + (points.length === 1 ? (W - pad.l - pad.r) / 2 : (i / (points.length - 1)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - v / 100) * (H - pad.t - pad.b);
  const path = (key: 'planned' | 'actual') => points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-56" role="img" aria-label={`Progress curve: actual ${last.actual}% vs planned ${last.planned}% on ${last.date}`}>
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="#1e293b" strokeWidth="1" />
            <text x={pad.l - 6} y={y(v) + 3} textAnchor="end" fontSize="10" fill="#64748b">{v}%</text>
          </g>
        ))}
        <path d={path('planned')} fill="none" stroke="#94a3b8" strokeWidth="2" strokeDasharray="5 4" />
        <path d={path('actual')} fill="none" stroke="#818cf8" strokeWidth="2.5" />
        {points.map((p, i) => <circle key={p.date} cx={x(i)} cy={y(p.actual)} r="3" fill="#818cf8"><title>{`${p.date}: actual ${p.actual}% · planned ${p.planned}% · ${p.workers} workers`}</title></circle>)}
        <text x={pad.l} y={H - 8} fontSize="10" fill="#64748b">{points[0].date}</text>
        <text x={W - pad.r} y={H - 8} fontSize="10" fill="#64748b" textAnchor="end">{last.date}</text>
      </svg>
      <div className="flex gap-4 text-[11px] text-slate-400">
        <span><span className="inline-block w-4 h-0.5 bg-indigo-400 align-middle mr-1" />Actual ({last.actual}%)</span>
        <span><span className="inline-block w-4 border-t-2 border-dashed border-slate-400 align-middle mr-1" />Planned ({last.planned}%)</span>
      </div>
    </div>
  );
}

function DailyReportForm({ projectId, progress, ctx, onSubmitted }: { projectId: string; progress: ProjectProgress; ctx: Ctx; onSubmitted: () => unknown }) {
  const initial = { reportDate: todayHarare(), weather: 'SUNNY', workersOnSite: '', workPerformed: '', delays: '', lostHours: '', safetyIncidents: '0', safetyNotes: '' };
  const f = useForm(initial);
  const [updates, setUpdates] = useState<Record<string, string>>({});
  const { busy, run } = useAction(ctx);
  const open = progress.milestones.filter((m) => Number(m.percent_complete) < 100);
  const allowed = ctx.hasRole('SITE_SUPERVISOR', 'PROJECT_MANAGER');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = f.values;
    const progressUpdates = Object.entries(updates).filter(([, pct]) => pct !== '').map(([milestoneId, percentComplete]) => ({ milestoneId, percentComplete }));
    const ok = await run(() => api.submitDailyReport(projectId, {
      ...v, workersOnSite: Number(v.workersOnSite), safetyIncidents: Number(v.safetyIncidents || 0), lostHours: v.lostHours || undefined,
      delays: v.delays || undefined, safetyNotes: v.safetyNotes || undefined, progress: progressUpdates,
    }), `Site report for ${v.reportDate} filed`, onSubmitted);
    if (ok) { f.reset(); setUpdates({}); }
  };

  return (
    <Card title="Daily site report" subtitle="Filed once per day; progress can only move forward" className="xl:col-span-2">
      {!allowed ? <RoleNote roles={['SITE_SUPERVISOR', 'PROJECT_MANAGER']} /> : (
        <form onSubmit={submit} className="grid sm:grid-cols-2 gap-2">
          <Field label="Date"><input type="date" {...f.bind('reportDate')} max={todayHarare()} required className={inputCls} /></Field>
          <Field label="Weather"><select {...f.bind('weather')} className={inputCls}>{WEATHER.map((w) => <option key={w} value={w}>{humanize(w)}</option>)}</select></Field>
          <Field label="Workers on site"><input {...f.bind('workersOnSite')} required inputMode="numeric" className={inputCls} /></Field>
          <Field label="Hours lost"><input {...f.bind('lostHours')} inputMode="decimal" className={inputCls} placeholder="0" /></Field>
          <Field label="Work performed" wide><textarea {...f.bind('workPerformed')} required rows={2} className={inputCls} /></Field>
          <Field label="Delays (required if hours lost)" wide><input {...f.bind('delays')} className={inputCls} /></Field>
          <Field label="Safety incidents"><input {...f.bind('safetyIncidents')} inputMode="numeric" className={inputCls} /></Field>
          <Field label="Safety notes"><input {...f.bind('safetyNotes')} className={inputCls} /></Field>
          {open.length > 0 && (
            <div className="sm:col-span-2 space-y-1">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Milestone progress (% complete after today)</span>
              {open.map((m) => (
                <div key={m.milestone_id} className="flex items-center gap-2">
                  <span className="flex-1 truncate text-slate-300">{m.name} <span className="text-slate-500">(now {num(m.percent_complete)}%)</span></span>
                  <input value={updates[m.milestone_id] ?? ''} onChange={(e) => setUpdates((u) => ({ ...u, [m.milestone_id]: e.target.value }))}
                    inputMode="decimal" placeholder="—" className={`${inputCls} w-20`} aria-label={`Progress for ${m.name}`} />
                </div>
              ))}
            </div>
          )}
          <div className="sm:col-span-2 flex justify-end"><Button type="submit" disabled={busy}>File report</Button></div>
        </form>
      )}
    </Card>
  );
}

function AddMilestone({ projectId, ctx, onAdded }: { projectId: string; ctx: Ctx; onAdded: () => unknown }) {
  const [open, setOpen] = useState(false);
  const f = useForm({ name: '', weightPercent: '', plannedStart: todayHarare(), plannedFinish: '' });
  const { busy, run } = useAction(ctx);
  if (!ctx.hasRole('PROJECT_MANAGER')) return null;
  if (!open) return <Button onClick={() => setOpen(true)}>+ Milestone</Button>;
  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={async (e) => {
      e.preventDefault();
      if (await run(() => api.createMilestone(projectId, f.values), `Milestone "${f.values.name}" added`, onAdded)) { f.reset(); setOpen(false); }
    }}>
      <input {...f.bind('name')} required placeholder="Milestone name" className={`${inputCls} w-52`} aria-label="Milestone name" />
      <input {...f.bind('weightPercent')} required placeholder="Weight %" className={`${inputCls} w-24`} inputMode="decimal" aria-label="Weight" />
      <input type="date" {...f.bind('plannedStart')} required className={`${inputCls} w-36`} aria-label="Planned start" />
      <input type="date" {...f.bind('plannedFinish')} required className={`${inputCls} w-36`} aria-label="Planned finish" />
      <Button type="submit" disabled={busy}>Add</Button>
      <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
    </form>
  );
}
