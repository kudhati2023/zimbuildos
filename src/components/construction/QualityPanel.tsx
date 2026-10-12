import { useState } from 'react';
import * as api from '../../api';
import type { ChecklistItem, Inspection, Milestone, NonConformance, QualitySummary, Severity } from '../../types';
import {
  Badge, Button, Card, Ctx, Empty, Field, PromptButton, RoleNote, Stat, humanize, inputCls, statusTone,
  tdCls, thCls, todayHarare, useAction, useForm, useLoader,
} from './ui';

const SEVERITIES: Severity[] = ['MINOR', 'MAJOR', 'CRITICAL'];

/** Starting checklists for common inspections; inspectors can edit or add items before recording. */
const TEMPLATES: Record<string, string[]> = {
  SETTING_OUT: ['Pegs match approved layout', 'Building lines and boundaries checked against SG diagram', 'Levels referenced to benchmark'],
  EXCAVATION: ['Trench depth and width to drawing', 'Founding material inspected', 'Sides supported / battered', 'Excavation free of water'],
  FOUNDATION: ['Footing dimensions to drawing', 'DPC / DPM laid and lapped', 'Concrete strength cubes taken'],
  REINFORCEMENT: ['Bar sizes and spacing to schedule', 'Cover blocks in place', 'Laps and anchorage lengths', 'Steel clean and tied'],
  CONCRETE_POUR: ['Slump test within spec', 'Cubes taken', 'Vibration / compaction', 'Curing arrangement in place'],
  BRICKWORK: ['Bricks to specification', 'Mortar mix ratio', 'Wall plumb and level', 'Brickforce every 4th course', 'Openings and lintels to drawing'],
  ROOFING: ['Trusses to design and braced', 'Purlin spacing', 'Sheeting overlaps and fixings', 'Flashings and ridge'],
  PLUMBING: ['Pipe sizes and falls', 'Pressure test passed', 'Fixtures secured and sealed'],
  ELECTRICAL: ['Cable sizes to design', 'Earth continuity', 'Insulation resistance', 'Distribution board labelled'],
  FINISHES: ['Plaster flat and true', 'Paint coverage', 'Doors and windows operate', 'Floor finish level'],
  ROADS: ['Subgrade compaction (DCP)', 'Base course thickness', 'Camber and crossfall', 'Kerbs and channels aligned', 'Surfacing thickness'],
  WATER_RETICULATION: ['Pipe bedding and cover', 'Pressure test 10 bar for 2 h', 'Thrust blocks at bends', 'Valve chambers built', 'Disinfection done'],
  SEWER_RETICULATION: ['Pipe gradients to design', 'Manholes benched', 'Air / water test passed', 'CCTV survey clear'],
  FINAL: ['Snag list closed', 'As-built drawings received', 'Services certificates on file', 'Site cleared'],
};

export function QualityPanel({ projectId, ctx }: { projectId: string; ctx: Ctx }) {
  const [summary, reloadSummary] = useLoader<QualitySummary | null>(() => api.fetchQualitySummary(projectId), [projectId], ctx, null);
  const [ncrs, reloadNcrs] = useLoader<NonConformance[]>(() => api.fetchNcrs(projectId), [projectId], ctx, []);
  const [inspections, reloadInspections] = useLoader<Inspection[]>(() => api.fetchInspections(projectId), [projectId], ctx, []);
  const [milestones] = useLoader<Milestone[]>(() => api.fetchMilestones(projectId), [projectId], ctx, []);
  const { busy, run } = useAction(ctx);
  const refresh = async () => { await Promise.all([reloadSummary(), reloadNcrs(), reloadInspections()]); };
  const verifier = ctx.hasRole('QA_INSPECTOR', 'ENGINEER');

  return (
    <div className="space-y-4">
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <Stat label="Inspections" value={summary.inspections} hint={`${summary.passed} passed first time`} />
          <Stat label="First-time pass rate" value={summary.first_time_pass_rate === null ? '—' : `${summary.first_time_pass_rate}%`}
            tone={summary.first_time_pass_rate !== null && summary.first_time_pass_rate < 80 ? 'amber' : 'green'} />
          <Stat label="Open NCRs" value={summary.open} tone={summary.open ? 'red' : 'green'} hint={`${summary.open_critical} critical`} />
          <Stat label="Awaiting verification" value={summary.awaiting_verification} tone={summary.awaiting_verification ? 'amber' : undefined} />
          <Stat label="Overdue NCRs" value={summary.overdue} tone={summary.overdue ? 'red' : 'green'} />
          <Stat label="Avg days to close" value={summary.avg_days_to_close ?? '—'} hint={`${summary.closed} closed`} />
        </div>
      )}

      <div className="grid xl:grid-cols-5 gap-4">
        <InspectionForm projectId={projectId} milestones={milestones} ctx={ctx} onRecorded={refresh} />
        <Card title="Non-conformance register" className="xl:col-span-3"
          subtitle="A milestone cannot reach 100% while it has an NCR that is not closed. The person who fixes a defect cannot verify it."
          actions={ctx.hasRole('QA_INSPECTOR', 'ENGINEER', 'PROJECT_MANAGER') && <RaiseNcr projectId={projectId} milestones={milestones} ctx={ctx} onRaised={refresh} />}>
          {ncrs.length === 0 ? <Empty>No non-conformances recorded.</Empty> : (
            <div className="space-y-2 max-h-[32rem] overflow-y-auto">
              {ncrs.map((n) => (
                <div key={n.ncr_id} className={`p-3 rounded-xl border ${n.status === 'CLOSED' ? 'border-slate-800 bg-slate-950/40' : n.overdue ? 'border-rose-500/40 bg-rose-950/20' : 'border-slate-700 bg-slate-950/70'}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-white">{n.ncr_no}</span>
                    <Badge tone={statusTone(n.severity)}>{n.severity}</Badge>
                    <Badge tone={statusTone(n.status)}>{humanize(n.status)}</Badge>
                    {n.overdue && <Badge tone="red">Overdue</Badge>}
                    {n.milestone_name && <span className="text-slate-400">{n.milestone_name}</span>}
                    <span className="ml-auto text-slate-500">due {n.due_date}</span>
                  </div>
                  <p className="text-slate-200 mt-1">{n.description}</p>
                  {n.corrective_action && <p className="text-emerald-300">Corrective action ({n.resolved_by}): {n.corrective_action}</p>}
                  {n.verification_note && <p className={n.status === 'CLOSED' ? 'text-sky-300' : 'text-amber-300'}>{n.status === 'CLOSED' ? `Verified (${n.closed_by}): ` : ''}{n.verification_note}</p>}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {n.status === 'OPEN' && ctx.hasRole('SITE_SUPERVISOR', 'PROJECT_MANAGER') && (
                      <PromptButton label="Record corrective action" variant="success" placeholder="What was done to fix it"
                        onSubmit={(v) => run(() => api.resolveNcr(n.ncr_id, v), `${n.ncr_no} resolved — awaiting verification`, refresh)} />
                    )}
                    {n.status === 'RESOLVED' && verifier && n.resolved_by !== ctx.sub && <>
                      <PromptButton label="Verify & close" variant="success" placeholder="Verification note"
                        onSubmit={(v) => run(() => api.closeNcr(n.ncr_id, v), `${n.ncr_no} closed`, refresh)} />
                      <PromptButton label="Reject fix" variant="danger" placeholder="Why the fix is not acceptable"
                        onSubmit={(v) => run(() => api.reopenNcr(n.ncr_id, v), `${n.ncr_no} re-opened`, refresh)} />
                    </>}
                    {busy && <span className="text-slate-500">…</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card title="Inspection history" subtitle="Inspection records cannot be edited after they are saved">
        {inspections.length === 0 ? <Empty>No inspections yet.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-slate-300">
              <thead className="bg-slate-950 text-[10px] uppercase text-slate-400">
                <tr>{['Date', 'Type', 'Location', 'Milestone', 'Checklist', 'Result', 'NCRs', 'Inspector'].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {inspections.map((i) => <InspectionRow key={i.inspection_id} inspection={i} />)}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function InspectionRow({ inspection: i }: { inspection: Inspection }) {
  const [open, setOpen] = useState(false);
  const failed = i.checklist.filter((c) => !c.passed).length;
  return (
    <>
      <tr className="hover:bg-slate-800/30 cursor-pointer" onClick={() => setOpen(!open)}>
        <td className={`${tdCls} whitespace-nowrap`}>{i.inspected_on}</td>
        <td className={tdCls}>{humanize(i.inspection_type)}</td>
        <td className={tdCls}>{i.location}</td>
        <td className={tdCls}>{i.milestone_name ?? '—'}</td>
        <td className={tdCls}>{i.checklist.length - failed}/{i.checklist.length} passed {open ? '▾' : '▸'}</td>
        <td className={tdCls}><Badge tone={statusTone(i.result)}>{i.result}</Badge></td>
        <td className={tdCls}>{i.ncr_count}</td>
        <td className={tdCls}>{i.inspector}</td>
      </tr>
      {open && (
        <tr><td colSpan={8} className="p-2 bg-slate-950/60">
          {i.checklist.map((c, k) => (
            <div key={k} className={c.passed ? 'text-emerald-300' : 'text-rose-300'}>{c.passed ? '✓' : '✗'} {c.item}{c.note ? ` — ${c.note}` : ''}{c.severity ? ` [${c.severity}]` : ''}</div>
          ))}
          {i.notes && <div className="text-slate-400 mt-1">Notes: {i.notes}</div>}
        </td></tr>
      )}
    </>
  );
}

const fromTemplate = (type: string): ChecklistItem[] => (TEMPLATES[type] ?? []).map((item) => ({ item, passed: true, note: '', severity: 'MAJOR' }));

function InspectionForm({ projectId, milestones, ctx, onRecorded }: { projectId: string; milestones: Milestone[]; ctx: Ctx; onRecorded: () => unknown }) {
  const f = useForm({ inspectionType: 'CONCRETE_POUR', location: '', milestoneId: '', inspectedOn: todayHarare(), notes: '' });
  const [items, setItems] = useState<ChecklistItem[]>(fromTemplate('CONCRETE_POUR'));
  const { busy, run } = useAction(ctx);
  const update = (k: number, patch: Partial<ChecklistItem>) => setItems((xs) => xs.map((x, i) => (i === k ? { ...x, ...patch } : x)));
  const failed = items.filter((c) => !c.passed).length;
  if (!ctx.hasRole('QA_INSPECTOR', 'ENGINEER')) {
    return <Card title="Record inspection" className="xl:col-span-2"><RoleNote roles={['QA_INSPECTOR', 'ENGINEER']} /></Card>;
  }
  return (
    <Card title="Record inspection" subtitle="Each failed item opens its own NCR, with a due date set by its severity" className="xl:col-span-2">
      <form className="grid sm:grid-cols-2 gap-2" onSubmit={async (e) => {
        e.preventDefault();
        const ok = await run(() => api.createInspection(projectId, {
          ...f.values, milestoneId: f.values.milestoneId || undefined, notes: f.values.notes || undefined,
          checklist: items.filter((c) => c.item.trim()).map((c) => ({ item: c.item, passed: c.passed, note: c.note || undefined, severity: c.passed ? undefined : c.severity })),
        }), (r) => `Inspection recorded: ${r.inspection.result}${r.ncrs.length ? ` — ${r.ncrs.length} NCR(s) raised: ${r.ncrs.map((n: NonConformance) => n.ncr_no).join(', ')}` : ''}`, onRecorded);
        if (ok) { f.set('location', ''); f.set('notes', ''); setItems(fromTemplate(f.values.inspectionType)); }
      }}>
        <Field label="Type">
          <select value={f.values.inspectionType} onChange={(e) => { f.set('inspectionType', e.target.value); setItems(fromTemplate(e.target.value)); }} className={inputCls}>
            {Object.keys(TEMPLATES).map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
          </select>
        </Field>
        <Field label="Date"><input type="date" {...f.bind('inspectedOn')} max={todayHarare()} className={inputCls} /></Field>
        <Field label="Location"><input {...f.bind('location')} required placeholder="Block C, ground floor slab" className={inputCls} /></Field>
        <Field label="Milestone (optional)">
          <select {...f.bind('milestoneId')} className={inputCls}>
            <option value="">—</option>
            {milestones.map((m) => <option key={m.milestone_id} value={m.milestone_id}>{m.seq}. {m.name}</option>)}
          </select>
        </Field>
        <div className="sm:col-span-2 space-y-1">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Checklist — {failed ? `${failed} failing` : 'all passing'}</span>
          {items.map((c, k) => (
            <div key={k} className="flex flex-wrap items-center gap-1">
              <button type="button" onClick={() => update(k, { passed: !c.passed })} aria-label={c.passed ? 'Mark failed' : 'Mark passed'}
                className={`w-7 h-7 rounded-md font-bold ${c.passed ? 'bg-emerald-600/80 text-white' : 'bg-rose-600/80 text-white'}`}>{c.passed ? '✓' : '✗'}</button>
              <input value={c.item} onChange={(e) => update(k, { item: e.target.value })} className={`${inputCls} flex-1 min-w-40`} aria-label="Checklist item" />
              {!c.passed && <>
                <select value={c.severity ?? 'MAJOR'} onChange={(e) => update(k, { severity: e.target.value as Severity })} className={`${inputCls} w-24`} aria-label="Severity">
                  {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <input value={c.note ?? ''} onChange={(e) => update(k, { note: e.target.value })} placeholder="Finding" className={`${inputCls} w-40`} aria-label="Finding" />
              </>}
            </div>
          ))}
          <Button type="button" variant="ghost" onClick={() => setItems((xs) => [...xs, { item: '', passed: true, note: '', severity: 'MAJOR' }])}>+ Item</Button>
        </div>
        <Field label="Notes" wide><input {...f.bind('notes')} className={inputCls} /></Field>
        <div className="sm:col-span-2 flex justify-end">
          <Button type="submit" variant={failed ? 'danger' : 'success'} disabled={busy}>{failed ? `Record FAIL (${failed} NCR)` : 'Record PASS'}</Button>
        </div>
      </form>
    </Card>
  );
}

function RaiseNcr({ projectId, milestones, ctx, onRaised }: { projectId: string; milestones: Milestone[]; ctx: Ctx; onRaised: () => unknown }) {
  const [open, setOpen] = useState(false);
  const f = useForm({ description: '', severity: 'MAJOR', milestoneId: '' });
  const { busy, run } = useAction(ctx);
  if (!open) return <Button variant="danger" onClick={() => setOpen(true)}>+ Raise NCR</Button>;
  return (
    <form className="flex flex-wrap gap-2" onSubmit={async (e) => {
      e.preventDefault();
      if (await run(() => api.raiseNcr(projectId, { ...f.values, milestoneId: f.values.milestoneId || undefined }), 'NCR raised', onRaised)) { f.reset(); setOpen(false); }
    }}>
      <input {...f.bind('description')} required placeholder="Defect found" className={`${inputCls} w-64`} aria-label="Defect description" />
      <select {...f.bind('severity')} className={`${inputCls} w-28`} aria-label="Severity">{SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
      <select {...f.bind('milestoneId')} className={`${inputCls} w-44`} aria-label="Milestone">
        <option value="">No milestone</option>
        {milestones.map((m) => <option key={m.milestone_id} value={m.milestone_id}>{m.name}</option>)}
      </select>
      <Button type="submit" variant="danger" disabled={busy}>Raise</Button>
      <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
    </form>
  );
}
