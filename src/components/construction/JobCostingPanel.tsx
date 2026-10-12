import React, { useState } from 'react';
import * as api from '../../api';
import type { BudgetLine, CostCategory, CostEntry, Equipment, JobCostReport, Material } from '../../types';
import {
  Badge, Button, Card, Ctx, Empty, Field, ProgressBar, PromptButton, RoleNote, Stat, humanize, inputCls, num, statusTone,
  tdCls, thCls, todayHarare, useAction, useForm, useLoader, usd,
} from './ui';

const CATEGORIES: CostCategory[] = ['MATERIAL', 'LABOUR', 'EQUIPMENT', 'SUBCONTRACT', 'OVERHEAD'];
const KIND_CATEGORY: Record<api.CostKind, CostCategory> = { material: 'MATERIAL', labour: 'LABOUR', equipment: 'EQUIPMENT', overhead: 'OVERHEAD' };

export function JobCostingPanel({ projectId, ctx }: { projectId: string; ctx: Ctx }) {
  const [report, reload] = useLoader<JobCostReport | null>(() => api.fetchJobCostReport(projectId), [projectId], ctx, null);
  const [lines, reloadLines] = useLoader<BudgetLine[]>(() => api.fetchBudgetLines(projectId), [projectId], ctx, []);
  const [materials, reloadMaterials] = useLoader<Material[]>(() => api.fetchMaterials(), [], ctx, []);
  const [equipment] = useLoader<Equipment[]>(() => api.fetchEquipment(), [], ctx, []);
  const [category, setCategory] = useState('');
  const [entries, reloadEntries] = useLoader<CostEntry[]>(() => api.fetchCostEntries(projectId, { category: category || undefined }), [projectId, category], ctx, []);
  const refresh = async () => { await Promise.all([reload(), reloadLines(), reloadEntries()]); };

  if (!report) return <Empty>Loading job cost report…</Empty>;
  const t = report.totals;
  const ev = report.earnedValue;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Stat label="Revised budget" value={usd(t.revised_budget_usd)} hint={`Contract ${usd(t.contract_value_usd)}`} />
        <Stat label="Actual cost to date" value={usd(t.actual_usd)} hint={`${num(ev.percentComplete)}% physically complete`} />
        <Stat label="Open commitments" value={usd(t.open_commitment_usd)} hint="Subcontract value not yet certified" />
        <Stat label="Forecast final cost" value={usd(t.forecast_final_usd)} tone={t.variance_usd < 0 ? 'red' : 'green'}
          hint={`Variance ${usd(t.variance_usd)}`} />
        <Stat label="Cost performance (CPI)" value={ev.cpi ?? '—'} tone={ev.cpi === null ? undefined : ev.cpi < 0.95 ? 'red' : ev.cpi < 1 ? 'amber' : 'green'}
          hint={`EV ${usd(ev.ev_usd)} · EAC ${usd(ev.eac_usd)}`} />
        <Stat label="Projected margin" value={usd(t.projected_margin_usd)} tone={t.projected_margin_usd !== null && t.projected_margin_usd < 0 ? 'red' : undefined}
          hint={`SPI ${ev.spi ?? '—'} · ${humanize(ev.scheduleStatus)}`} />
      </div>

      {report.alerts.length > 0 && (
        <div className="bg-rose-950/40 border border-rose-500/30 rounded-xl p-3 space-y-1">
          <div className="text-[10px] font-bold uppercase tracking-wider text-rose-300">Budget alerts</div>
          {report.alerts.map((a) => (
            <div key={a.cost_code} className="flex items-center gap-2 text-slate-200">
              <Badge tone={statusTone(a.status)}>{humanize(a.status)}</Badge>
              <span className="font-bold">{a.cost_code}</span><span className="text-slate-400">{a.description}</span>
              <span className="ml-auto">{a.consumed_percent ?? '—'}% spent · variance {usd(a.variance_usd)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid xl:grid-cols-3 gap-4">
        <Card title="Cost by category" subtitle="Actual spend against revised budget (marker = forecast final)" className="xl:col-span-1">
          {report.byCategory.length === 0 ? <Empty>No budget lines yet.</Empty> : report.byCategory.map((c) => {
            const spent = c.revised_budget_usd > 0 ? (c.actual_usd / c.revised_budget_usd) * 100 : 0;
            const forecast = c.revised_budget_usd > 0 ? (c.forecast_final_usd / c.revised_budget_usd) * 100 : 0;
            return (
              <div key={c.category} className="space-y-1">
                <div className="flex justify-between text-slate-300"><span className="font-bold">{humanize(c.category)}</span>
                  <span>{usd(c.actual_usd)} / {usd(c.revised_budget_usd)}</span></div>
                <ProgressBar value={spent} planned={Math.min(forecast, 100)} tone={forecast > 100 ? 'red' : spent >= 90 ? 'amber' : 'indigo'} />
              </div>
            );
          })}
        </Card>

        <PostCostCard projectId={projectId} lines={lines} materials={materials} equipment={equipment} ctx={ctx} onPosted={refresh} />

        <Card title="Resource consumption" subtitle="Materials issued, plant hours and labour booked to this project">
          <table className="w-full text-slate-300">
            <thead className="text-[10px] uppercase text-slate-500"><tr><th className={thCls}>Resource</th><th className={thCls}>Qty</th><th className={`${thCls} text-right`}>Cost</th></tr></thead>
            <tbody className="divide-y divide-slate-800">
              {report.materialConsumption.map((m) => (
                <tr key={m.material_code}><td className={tdCls}>{m.name}</td><td className={tdCls}>{num(m.quantity, 3)} {m.unit}</td><td className={`${tdCls} text-right`}>{usd(m.amount_usd)}</td></tr>
              ))}
              {report.equipmentUsage.map((e) => (
                <tr key={e.equipment_id}><td className={tdCls}>{e.asset_tag} {e.name}</td><td className={tdCls}>{num(e.hours)} h</td><td className={`${tdCls} text-right`}>{usd(e.amount_usd)}</td></tr>
              ))}
              {report.labour.map((l) => (
                <tr key={l.unit}><td className={tdCls}>Labour ({l.workers} gang/worker refs)</td><td className={tdCls}>{num(l.quantity)} {l.unit.toLowerCase()}s</td><td className={`${tdCls} text-right`}>{usd(l.amount_usd)}</td></tr>
              ))}
            </tbody>
          </table>
          {report.materialConsumption.length + report.equipmentUsage.length + report.labour.length === 0 && <Empty>No resources booked yet.</Empty>}
        </Card>
      </div>

      <Card title="Cost lines" subtitle="Budget baseline is locked; changes are approved adjustments. Forecast = actual + uncertified subcontract value."
        actions={<AddBudgetLine projectId={projectId} ctx={ctx} onAdded={refresh} />}>
        {report.lines.length === 0 ? <Empty>Add the project's cost codes to start job costing.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-slate-300 whitespace-nowrap">
              <thead className="bg-slate-950 text-[10px] uppercase text-slate-400">
                <tr>{['Code', 'Description', 'Category', 'Original', 'Adj.', 'Revised', 'Actual', 'Committed', 'Forecast', 'Variance', 'Spent', 'Quantity', 'Status', ''].map((h) =>
                  <th key={h} className={thCls}>{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {report.lines.map((l) => (
                  <tr key={l.line_id} className="hover:bg-slate-800/30">
                    <td className={`${tdCls} font-bold text-white`}>{l.cost_code}</td>
                    <td className={tdCls}>{l.description}</td>
                    <td className={tdCls}>{humanize(l.category)}</td>
                    <td className={tdCls}>{usd(l.original_budget_usd)}</td>
                    <td className={tdCls}>{l.adjustments_usd ? usd(l.adjustments_usd) : '—'}</td>
                    <td className={tdCls}>{usd(l.revised_budget_usd)}</td>
                    <td className={tdCls}>{usd(l.actual_usd)}</td>
                    <td className={tdCls}>{l.committed_usd ? usd(l.committed_usd) : '—'}</td>
                    <td className={tdCls}>{usd(l.forecast_final_usd)}</td>
                    <td className={`${tdCls} ${l.variance_usd < 0 ? 'text-rose-300' : 'text-emerald-300'}`}>{usd(l.variance_usd)}</td>
                    <td className={`${tdCls} w-28`}>
                      <div className="space-y-1"><span>{l.consumed_percent ?? '—'}%</span>
                        <ProgressBar value={l.consumed_percent ?? 0} tone={l.status === 'OVER_BUDGET' ? 'red' : l.status === 'AT_RISK' ? 'amber' : 'green'} /></div>
                    </td>
                    <td className={tdCls}>{l.unit ? `${num(l.actual_quantity, 3)} / ${num(l.budget_quantity, 3)} ${l.unit}` : '—'}</td>
                    <td className={tdCls}><Badge tone={statusTone(l.status)}>{humanize(l.status)}</Badge></td>
                    <td className={tdCls}>
                      {ctx.hasRole('PROJECT_MANAGER') && (
                        <AdjustButton onSubmit={(amount, reason) => api.adjustBudget(projectId, l.line_id, amount, reason)} ctx={ctx} onDone={refresh} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Cost ledger" subtitle="Append-only. Corrections are reversals that keep the original visible."
        actions={(
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={`${inputCls} w-40`} aria-label="Filter by category">
            <option value="">All categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{humanize(c)}</option>)}
          </select>
        )}>
        {entries.length === 0 ? <Empty>No cost entries.</Empty> : (
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-slate-300">
              <thead className="bg-slate-950 text-[10px] uppercase text-slate-400 sticky top-0">
                <tr>{['Date', 'Code', 'Source', 'Description', 'Qty', 'Rate', 'Amount', 'By', ''].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {entries.map((e) => (
                  <tr key={e.entry_id} className={e.reversed || e.source === 'REVERSAL' ? 'text-slate-500' : ''}>
                    <td className={`${tdCls} whitespace-nowrap`}>{e.entry_date}</td>
                    <td className={tdCls}>{e.cost_code}</td>
                    <td className={tdCls}><Badge tone={e.source === 'REVERSAL' ? 'red' : 'slate'}>{humanize(e.source)}</Badge></td>
                    <td className={tdCls}>{e.description}{e.reversed && <span className="ml-1 text-rose-400">(reversed)</span>}</td>
                    <td className={`${tdCls} whitespace-nowrap`}>{num(e.quantity, 3)} {e.unit}</td>
                    <td className={tdCls}>{usd(e.unit_rate_usd)}</td>
                    <td className={`${tdCls} font-bold text-white whitespace-nowrap`}>{usd(e.amount_usd)}</td>
                    <td className={tdCls}>{e.recorded_by}</td>
                    <td className={tdCls}>
                      {ctx.hasRole('QUANTITY_SURVEYOR', 'PROJECT_MANAGER') && !e.reversed && !['REVERSAL', 'SUBCONTRACT_CERTIFICATE'].includes(e.source) && (
                        <ReverseButton entryId={e.entry_id} ctx={ctx} onDone={refresh} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <MaterialsCard materials={materials} ctx={ctx} onAdded={reloadMaterials} />
    </div>
  );
}

function ReverseButton({ entryId, ctx, onDone }: { entryId: string; ctx: Ctx; onDone: () => unknown }) {
  const { run } = useAction(ctx);
  return <PromptButton label="Reverse" variant="danger" placeholder="Reason for reversal"
    onSubmit={(reason) => run(() => api.reverseCostEntry(entryId, reason), 'Entry reversed', onDone)} />;
}

function AdjustButton({ onSubmit, ctx, onDone }: { onSubmit: (amount: string, reason: string) => Promise<unknown>; ctx: Ctx; onDone: () => unknown }) {
  const [open, setOpen] = useState(false);
  const f = useForm({ amount: '', reason: '' });
  const { busy, run } = useAction(ctx);
  if (!open) return <Button variant="ghost" onClick={() => setOpen(true)}>Adjust</Button>;
  return (
    <form className="flex items-center gap-1" onSubmit={async (e) => {
      e.preventDefault();
      if (await run(() => onSubmit(f.values.amount, f.values.reason), 'Budget adjustment approved', onDone)) { f.reset(); setOpen(false); }
    }}>
      <input {...f.bind('amount')} placeholder="±USD" className={`${inputCls} w-24`} aria-label="Adjustment amount" />
      <input {...f.bind('reason')} placeholder="Reason" className={`${inputCls} w-44`} aria-label="Adjustment reason" />
      <Button type="submit" disabled={busy}>OK</Button>
      <Button type="button" variant="ghost" onClick={() => setOpen(false)}>×</Button>
    </form>
  );
}

function PostCostCard({ projectId, lines, materials, equipment, ctx, onPosted }: {
  projectId: string; lines: BudgetLine[]; materials: Material[]; equipment: Equipment[]; ctx: Ctx; onPosted: () => unknown;
}) {
  const [kind, setKind] = useState<api.CostKind>('material');
  const f = useForm({ lineId: '', materialCode: '', equipmentId: '', workerRef: '', trade: '', unit: 'DAY', quantity: '', unitRateUsd: '', amountUsd: '', description: '', entryDate: todayHarare() });
  const { busy, run } = useAction(ctx);
  const allowed = kind === 'overhead' ? ctx.hasRole('QUANTITY_SURVEYOR') : ctx.hasRole('QUANTITY_SURVEYOR', 'SITE_SUPERVISOR');
  const eligible = lines.filter((l) => l.category === KIND_CATEGORY[kind]);
  const v = f.values;
  const material = materials.find((m) => m.material_code === v.materialCode);
  const machine = equipment.find((e) => e.equipment_id === v.equipmentId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body: Record<string, unknown> = { lineId: v.lineId, entryDate: v.entryDate, description: v.description || undefined };
    if (kind === 'material') Object.assign(body, { materialCode: v.materialCode, quantity: v.quantity, unitRateUsd: v.unitRateUsd || undefined });
    if (kind === 'labour') Object.assign(body, { workerRef: v.workerRef, trade: v.trade || undefined, unit: v.unit, quantity: v.quantity, unitRateUsd: v.unitRateUsd });
    if (kind === 'equipment') Object.assign(body, { equipmentId: v.equipmentId, hours: v.quantity, unitRateUsd: v.unitRateUsd || undefined });
    if (kind === 'overhead') Object.assign(body, { amountUsd: v.amountUsd, description: v.description });
    const okay = await run(() => api.postCost(projectId, kind, body), (r) => `Posted ${usd(r.amount_usd)} to the job cost ledger`, onPosted);
    if (okay) f.setValues({ ...v, quantity: '', amountUsd: '', description: '' });
  };

  return (
    <Card title="Post cost" subtitle="Material issues, labour timesheets, plant hours and overheads">
      <div className="flex gap-1 bg-slate-950 p-1 rounded-lg">
        {(['material', 'labour', 'equipment', 'overhead'] as api.CostKind[]).map((k) => (
          <button key={k} type="button" onClick={() => { setKind(k); f.set('lineId', ''); }}
            className={`flex-1 py-1 rounded-md text-[11px] font-bold ${kind === k ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>{humanize(k)}</button>
        ))}
      </div>
      {!allowed ? <RoleNote roles={kind === 'overhead' ? ['QUANTITY_SURVEYOR'] : ['QUANTITY_SURVEYOR', 'SITE_SUPERVISOR']} /> : (
        <form onSubmit={submit} className="grid sm:grid-cols-2 gap-2">
          <Field label={`${humanize(KIND_CATEGORY[kind])} cost line`} wide>
            <select {...f.bind('lineId')} required className={inputCls}>
              <option value="">{eligible.length ? 'Select…' : `No ${KIND_CATEGORY[kind].toLowerCase()} lines budgeted`}</option>
              {eligible.map((l) => <option key={l.line_id} value={l.line_id}>{l.cost_code} — {l.description}</option>)}
            </select>
          </Field>
          {kind === 'material' && (
            <Field label="Material" wide>
              <select {...f.bind('materialCode')} required className={inputCls}>
                <option value="">Select…</option>
                {materials.map((m) => <option key={m.material_code} value={m.material_code}>{m.name} ({usd(m.standard_rate_usd)}/{m.unit})</option>)}
              </select>
            </Field>
          )}
          {kind === 'equipment' && (
            <Field label="Machine" wide>
              <select {...f.bind('equipmentId')} required className={inputCls}>
                <option value="">Select…</option>
                {equipment.map((e) => <option key={e.equipment_id} value={e.equipment_id} disabled={e.status !== 'AVAILABLE'}>
                  {e.asset_tag} {e.name} — {usd(e.hourly_rate_usd)}/h{e.status !== 'AVAILABLE' ? ` (${humanize(e.status)})` : ''}</option>)}
              </select>
            </Field>
          )}
          {kind === 'labour' && <>
            <Field label="Worker / gang"><input {...f.bind('workerRef')} required className={inputCls} placeholder="Gang A (6 builders)" /></Field>
            <Field label="Trade"><input {...f.bind('trade')} className={inputCls} placeholder="Brickwork" /></Field>
            <Field label="Unit"><select {...f.bind('unit')} className={inputCls}><option value="DAY">Days</option><option value="HOUR">Hours</option></select></Field>
          </>}
          {kind === 'overhead' ? <>
            <Field label="Amount (USD)"><input {...f.bind('amountUsd')} required className={inputCls} inputMode="decimal" /></Field>
            <Field label="Description" wide><input {...f.bind('description')} required className={inputCls} placeholder="Site office rental — October" /></Field>
          </> : <>
            <Field label={kind === 'equipment' ? 'Hours (max 24)' : kind === 'material' ? `Quantity${material ? ` (${material.unit})` : ''}` : 'Quantity'}>
              <input {...f.bind('quantity')} required className={inputCls} inputMode="decimal" />
            </Field>
            <Field label={kind === 'labour' ? 'Rate (USD)' : 'Rate override (optional)'}>
              <input {...f.bind('unitRateUsd')} required={kind === 'labour'} className={inputCls} inputMode="decimal"
                placeholder={material ? material.standard_rate_usd : machine ? machine.hourly_rate_usd : ''} />
            </Field>
          </>}
          <Field label="Date"><input type="date" {...f.bind('entryDate')} max={todayHarare()} className={inputCls} /></Field>
          {kind !== 'overhead' && <Field label="Note (optional)" wide><input {...f.bind('description')} className={inputCls} /></Field>}
          <div className="sm:col-span-2 flex justify-end"><Button type="submit" disabled={busy}>Post to ledger</Button></div>
        </form>
      )}
    </Card>
  );
}

function AddBudgetLine({ projectId, ctx, onAdded }: { projectId: string; ctx: Ctx; onAdded: () => unknown }) {
  const [open, setOpen] = useState(false);
  const f = useForm({ costCode: '', description: '', category: 'MATERIAL', budgetUsd: '', budgetQuantity: '', unit: '' });
  const { busy, run } = useAction(ctx);
  if (!ctx.hasRole('PROJECT_MANAGER', 'QUANTITY_SURVEYOR')) return null;
  if (!open) return <Button onClick={() => setOpen(true)}>+ Budget line</Button>;
  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={async (e) => {
      e.preventDefault();
      const v = f.values;
      const ok = await run(() => api.addBudgetLine(projectId, { ...v, budgetQuantity: v.budgetQuantity || undefined, unit: v.unit || undefined }),
        `Budget line ${v.costCode.toUpperCase()} added`, onAdded);
      if (ok) { f.reset(); setOpen(false); }
    }}>
      <input {...f.bind('costCode')} required placeholder="Code e.g. 03-CONC" className={`${inputCls} w-32`} aria-label="Cost code" />
      <input {...f.bind('description')} required placeholder="Description" className={`${inputCls} w-48`} aria-label="Description" />
      <select {...f.bind('category')} className={`${inputCls} w-32`} aria-label="Category">{CATEGORIES.map((c) => <option key={c} value={c}>{humanize(c)}</option>)}</select>
      <input {...f.bind('budgetUsd')} required placeholder="Budget USD" className={`${inputCls} w-28`} inputMode="decimal" aria-label="Budget" />
      <input {...f.bind('budgetQuantity')} placeholder="Qty (opt.)" className={`${inputCls} w-24`} inputMode="decimal" aria-label="Budget quantity" />
      <input {...f.bind('unit')} placeholder="Unit" className={`${inputCls} w-20`} aria-label="Unit" />
      <Button type="submit" disabled={busy}>Add</Button>
      <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
    </form>
  );
}

function MaterialsCard({ materials, ctx, onAdded }: { materials: Material[]; ctx: Ctx; onAdded: () => unknown }) {
  const f = useForm({ materialCode: '', name: '', unit: '', standardRateUsd: '' });
  const { busy, run } = useAction(ctx);
  return (
    <Card title="Materials catalogue" subtitle="Standard rates used when issuing material to a project">
      <div className="flex flex-wrap gap-2">
        {materials.length === 0 && <span className="text-slate-500">No materials yet.</span>}
        {materials.map((m) => <Badge key={m.material_code} tone="indigo">{m.material_code} · {m.name} · {usd(m.standard_rate_usd)}/{m.unit}</Badge>)}
      </div>
      {ctx.hasRole('QUANTITY_SURVEYOR', 'PROJECT_MANAGER') && (
        <form className="flex flex-wrap gap-2" onSubmit={async (e) => {
          e.preventDefault();
          if (await run(() => api.createMaterial(f.values), 'Material added to catalogue', onAdded)) f.reset();
        }}>
          <input {...f.bind('materialCode')} required placeholder="Code e.g. CEM-325" className={`${inputCls} w-36`} aria-label="Material code" />
          <input {...f.bind('name')} required placeholder="Name" className={`${inputCls} w-56`} aria-label="Material name" />
          <input {...f.bind('unit')} required placeholder="Unit (BAG, M3…)" className={`${inputCls} w-32`} aria-label="Unit" />
          <input {...f.bind('standardRateUsd')} required placeholder="Rate USD" className={`${inputCls} w-28`} inputMode="decimal" aria-label="Standard rate" />
          <Button type="submit" disabled={busy}>Add material</Button>
        </form>
      )}
    </Card>
  );
}
