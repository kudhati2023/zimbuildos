import { useEffect, useState } from 'react';
import * as api from '../../api';
import type { BudgetLine, Subcontract, SubcontractDetail, Subcontractor, Tender, TenderDetail } from '../../types';
import {
  Badge, Button, Card, Ctx, Empty, Field, ProgressBar, PromptButton, Stat, humanize, inputCls, num, statusTone,
  tdCls, thCls, todayHarare, useAction, useForm, useLoader, usd,
} from './ui';

/**
 * Tender bidding, evaluation and award, then subcontract variations and progress claims.
 * Without a projectId this is the subcontractor portal: open tenders plus the firm's own bids and contracts.
 */
export function TendersPanel({ projectId, ctx }: { projectId?: string; ctx: Ctx }) {
  const staff = ctx.hasRole('PROJECT_MANAGER', 'QUANTITY_SURVEYOR', 'FINANCE_MANAGER', 'CEO', 'AUDITOR');
  const [tenders, reloadTenders] = useLoader<Tender[]>(() => api.fetchTenders(projectId), [projectId], ctx, []);
  const [subcontracts, reloadSubcontracts] = useLoader<Subcontract[]>(() => api.fetchSubcontracts(projectId), [projectId], ctx, []);
  const [firms, reloadFirms] = useLoader<Subcontractor[]>(() => (staff ? api.fetchSubcontractors() : Promise.resolve([])), [staff], ctx, []);
  const [selectedTender, setSelectedTender] = useState<string | null>(null);
  const [selectedContract, setSelectedContract] = useState<string | null>(null);
  const refresh = async () => { await Promise.all([reloadTenders(), reloadSubcontracts(), reloadFirms()]); };

  return (
    <div className="space-y-4">
      <div className="grid xl:grid-cols-5 gap-4">
        <Card title={projectId ? 'Tenders' : 'Tenders open to you'} className="xl:col-span-2"
          subtitle="Bids are sealed until the closing time; then they are scored on price and technical merit"
          actions={projectId && <IssueTender projectId={projectId} ctx={ctx} onIssued={refresh} />}>
          {tenders.length === 0 ? <Empty>No tenders.</Empty> : (
            <div className="space-y-2">
              {tenders.map((t) => (
                <button key={t.tender_id} onClick={() => setSelectedTender(t.tender_id)}
                  className={`w-full text-left p-3 rounded-xl border transition ${selectedTender === t.tender_id ? 'border-indigo-500 bg-indigo-950/30' : 'border-slate-800 bg-slate-950/60 hover:border-slate-600'}`}>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">{t.reference}</span>
                    <Badge tone={statusTone(t.status)}>{humanize(t.status)}</Badge>
                    {t.my_bid && <Badge tone="indigo">You bid</Badge>}
                    <span className="ml-auto text-slate-500">{t.bid_count !== undefined ? `${t.bid_count} bid(s)` : ''}</span>
                  </div>
                  <div className="text-slate-300 mt-1">{t.title}</div>
                  <div className="text-slate-500 text-[11px]">{t.project_code} · {t.cost_code} · closes {new Date(t.closing_at).toLocaleString()}</div>
                </button>
              ))}
            </div>
          )}
        </Card>
        <div className="xl:col-span-3">
          {selectedTender
            ? <TenderView tenderId={selectedTender} firms={firms} ctx={ctx} onChanged={refresh} />
            : <Card title="Tender detail"><Empty>Select a tender to see its bids and evaluation.</Empty></Card>}
        </div>
      </div>

      <div className="grid xl:grid-cols-5 gap-4">
        <Card title="Subcontracts" subtitle="Awarded work, certified value and retention held" className="xl:col-span-2">
          {subcontracts.length === 0 ? <Empty>No subcontracts yet.</Empty> : (
            <div className="space-y-2">
              {subcontracts.map((s) => {
                const pct = Number(s.revised_value_usd) > 0 ? (Number(s.certified_to_date_usd) / Number(s.revised_value_usd)) * 100 : 0;
                return (
                  <button key={s.subcontract_id} onClick={() => setSelectedContract(s.subcontract_id)}
                    className={`w-full text-left p-3 rounded-xl border transition ${selectedContract === s.subcontract_id ? 'border-indigo-500 bg-indigo-950/30' : 'border-slate-800 bg-slate-950/60 hover:border-slate-600'}`}>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white">{s.contract_no}</span>
                      <Badge tone={statusTone(s.status)}>{humanize(s.status)}</Badge>
                      {!!s.claims_awaiting_certification && <Badge tone="amber">Claim to certify</Badge>}
                    </div>
                    <div className="text-slate-300 mt-1">{s.subcontractor_name}</div>
                    <div className="flex justify-between text-[11px] text-slate-400 mt-1"><span>{usd(s.certified_to_date_usd)} certified</span><span>of {usd(s.revised_value_usd)}</span></div>
                    <ProgressBar value={pct} tone="green" />
                  </button>
                );
              })}
            </div>
          )}
        </Card>
        <div className="xl:col-span-3">
          {selectedContract
            ? <SubcontractView subcontractId={selectedContract} ctx={ctx} onChanged={refresh} />
            : <Card title="Subcontract detail"><Empty>Select a subcontract to see its terms, variations and claims.</Empty></Card>}
        </div>
      </div>

      {staff && <SubcontractorRegister firms={firms} ctx={ctx} onChanged={reloadFirms} />}
    </div>
  );
}

function IssueTender({ projectId, ctx, onIssued }: { projectId: string; ctx: Ctx; onIssued: () => unknown }) {
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<BudgetLine[]>([]);
  const f = useForm({ reference: '', title: '', scope: '', lineId: '', estimateUsd: '', priceWeight: '70', minTechnicalScore: '60', closingAt: '' });
  const { busy, run } = useAction(ctx);
  useEffect(() => { if (open) api.fetchBudgetLines(projectId).then(setLines).catch(ctx.fail); }, [open, projectId]);
  if (!ctx.hasRole('PROJECT_MANAGER', 'QUANTITY_SURVEYOR')) return null;
  if (!open) return <Button onClick={() => setOpen(true)}>+ Issue tender</Button>;
  const v = f.values;
  return (
    <form className="grid grid-cols-2 gap-2 w-full" onSubmit={async (e) => {
      e.preventDefault();
      const ok = await run(() => api.createTender(projectId, {
        ...v, priceWeight: Number(v.priceWeight), technicalWeight: 100 - Number(v.priceWeight), closingAt: new Date(v.closingAt).toISOString(),
      }), `Tender ${v.reference.toUpperCase()} issued`, onIssued);
      if (ok) { f.reset(); setOpen(false); }
    }}>
      <Field label="Reference"><input {...f.bind('reference')} required className={inputCls} placeholder="TND/2026/07" /></Field>
      <Field label="Subcontract cost line">
        <select {...f.bind('lineId')} required className={inputCls}>
          <option value="">Select…</option>
          {lines.filter((l) => l.category === 'SUBCONTRACT').map((l) => <option key={l.line_id} value={l.line_id}>{l.cost_code} — {l.description}</option>)}
        </select>
      </Field>
      <Field label="Title" wide><input {...f.bind('title')} required className={inputCls} /></Field>
      <Field label="Scope of works" wide><textarea {...f.bind('scope')} required rows={2} className={inputCls} /></Field>
      <Field label="Engineer's estimate (USD)"><input {...f.bind('estimateUsd')} required inputMode="decimal" className={inputCls} /></Field>
      <Field label="Closes at"><input type="datetime-local" {...f.bind('closingAt')} required className={inputCls} /></Field>
      <Field label={`Price weight ${v.priceWeight}% / technical ${100 - Number(v.priceWeight || 0)}%`}>
        <input type="range" min="0" max="100" step="5" {...f.bind('priceWeight')} className="w-full" />
      </Field>
      <Field label="Minimum technical score"><input {...f.bind('minTechnicalScore')} inputMode="decimal" className={inputCls} /></Field>
      <div className="col-span-2 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        <Button type="submit" disabled={busy}>Issue tender</Button>
      </div>
    </form>
  );
}

function TenderView({ tenderId, firms, ctx, onChanged }: { tenderId: string; firms: Subcontractor[]; ctx: Ctx; onChanged: () => unknown }) {
  const [detail, reload] = useLoader<TenderDetail | null>(() => api.fetchTender(tenderId), [tenderId], ctx, null);
  const { busy, run } = useAction(ctx);
  const done = async () => { await Promise.all([reload(), onChanged()]); };
  if (!detail) return <Card title="Tender detail"><Empty>Loading…</Empty></Card>;
  const t = detail.tender;
  const closed = new Date(t.closing_at).getTime() <= Date.now();
  const ev = detail.evaluation;

  return (
    <Card title={`${t.reference} — ${t.title}`}
      subtitle={`${t.project_code ?? ''} Price ${t.price_weight}% · technical ${t.technical_weight}% · minimum technical ${num(t.min_technical_score)} · closes ${new Date(t.closing_at).toLocaleString()}`}
      actions={<>
        <Badge tone={statusTone(t.status)}>{humanize(t.status)}</Badge>
        {t.status === 'OPEN' && ctx.hasRole('PROJECT_MANAGER', 'QUANTITY_SURVEYOR') && (
          <Button disabled={busy || !closed} title={closed ? '' : 'Bids stay sealed until the closing time'}
            onClick={() => run(() => api.closeTender(tenderId), 'Tender closed — bids opened for evaluation', done)}>Open bids</Button>
        )}
        {['OPEN', 'EVALUATION'].includes(t.status) && ctx.hasRole('PROJECT_MANAGER') && (
          <PromptButton label="Cancel" variant="danger" placeholder="Reason" onSubmit={(r) => run(() => api.cancelTender(tenderId, r), 'Tender cancelled', done)} />
        )}
      </>}>
      <p className="text-slate-300 whitespace-pre-wrap">{t.scope}</p>
      {t.estimate_usd && <p className="text-slate-400">Engineer's estimate: <span className="text-white font-bold">{usd(t.estimate_usd)}</span></p>}
      {t.status === 'AWARDED' && t.award_justification && <p className="text-amber-300">Award justification: {t.award_justification}</p>}
      {t.status === 'CANCELLED' && <p className="text-rose-300">Cancelled: {t.cancel_reason}</p>}

      {t.status === 'OPEN' && !closed && <SubmitBid tenderId={tenderId} firms={firms} ctx={ctx} onSubmitted={done} />}

      {detail.sealed && <p className="text-sky-300">🔒 {detail.bids.length} sealed bid(s). Prices are revealed when the tender closes.</p>}

      {ev ? (
        <div className="overflow-x-auto">
          <table className="w-full text-slate-300">
            <thead className="bg-slate-950 text-[10px] uppercase text-slate-400">
              <tr>{['Rank', 'Bidder', 'Price', 'Days', 'Tech score', 'Price score', 'Combined', 'Compliance'].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {ev.bids.map((b) => (
                <tr key={b.bid_id} className={b.bid_id === t.awarded_bid_id ? 'bg-emerald-950/30' : ''}>
                  <td className={`${tdCls} font-bold`}>{b.rank ?? '—'}{b.bid_id === ev.recommendedBidId && t.status === 'EVALUATION' && <span className="ml-1 text-emerald-400">★</span>}</td>
                  <td className={`${tdCls} text-white`}>{b.subcontractor_name}{b.bid_id === t.awarded_bid_id && <Badge tone="green">Awarded</Badge>}</td>
                  <td className={tdCls}>{usd(b.amount_usd)}</td>
                  <td className={tdCls}>{b.duration_days}</td>
                  <td className={tdCls}>
                    {t.status === 'EVALUATION' && ctx.hasRole('QUANTITY_SURVEYOR')
                      ? <ScoreInput initial={b.technical_score ?? ''} onSave={(s) => run(() => api.scoreBid(tenderId, b.bid_id, s), `Scored ${b.subcontractor_name}`, done)} />
                      : num(b.technical_score ?? null)}
                  </td>
                  <td className={tdCls}>{num(b.price_score)}</td>
                  <td className={`${tdCls} font-bold text-white`}>{num(b.combined_score, 2)}</td>
                  <td className={tdCls}>{b.compliant ? <Badge tone="green">Compliant</Badge> : <span className="text-rose-300">{b.non_compliance.join('; ')}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!ev.complete && t.status === 'EVALUATION' && <p className="text-amber-300 mt-2">Score every bid technically before award.</p>}
        </div>
      ) : !detail.sealed && detail.bids.length > 0 && (
        <table className="w-full text-slate-300">
          <thead className="text-[10px] uppercase text-slate-400"><tr><th className={thCls}>Your bid</th><th className={thCls}>Price</th><th className={thCls}>Days</th><th className={thCls}>Submitted</th></tr></thead>
          <tbody>{detail.bids.map((b) => (
            <tr key={b.bid_id}><td className={tdCls}>{b.subcontractor_name}</td><td className={tdCls}>{usd(b.amount_usd)}</td><td className={tdCls}>{b.duration_days}</td>
              <td className={tdCls}>{new Date(b.submitted_at).toLocaleString()}</td></tr>))}</tbody>
        </table>
      )}

      {t.status === 'EVALUATION' && ev?.complete && ctx.hasRole('PROJECT_MANAGER') && <AwardForm tenderId={tenderId} detail={detail} ctx={ctx} onAwarded={done} />}
    </Card>
  );
}

function ScoreInput({ initial, onSave }: { initial: string; onSave: (score: string) => Promise<boolean> }) {
  const [value, setValue] = useState(initial ? String(Number(initial)) : '');
  return (
    <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); onSave(value); }}>
      <input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" className={`${inputCls} w-16`} aria-label="Technical score" />
      <Button type="submit" variant="ghost" disabled={!value}>✓</Button>
    </form>
  );
}

function SubmitBid({ tenderId, firms, ctx, onSubmitted }: { tenderId: string; firms: Subcontractor[]; ctx: Ctx; onSubmitted: () => unknown }) {
  const f = useForm({ subcontractorId: '', amountUsd: '', durationDays: '', methodology: '' });
  const { busy, run } = useAction(ctx);
  const onBehalf = ctx.hasRole('PROJECT_MANAGER', 'QUANTITY_SURVEYOR');
  if (!onBehalf && !ctx.hasRole('SUBCONTRACTOR')) return null;
  return (
    <form className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 grid sm:grid-cols-2 gap-2" onSubmit={async (e) => {
      e.preventDefault();
      const v = f.values;
      const ok = await run(() => api.submitBid(tenderId, { ...v, subcontractorId: onBehalf ? v.subcontractorId : undefined, durationDays: Number(v.durationDays) }),
        'Sealed bid submitted', onSubmitted);
      if (ok) f.reset();
    }}>
      <div className="sm:col-span-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">{onBehalf ? 'Record a received bid' : 'Submit your sealed bid'}</div>
      {onBehalf && (
        <Field label="Bidder" wide>
          <select {...f.bind('subcontractorId')} required className={inputCls}>
            <option value="">Select…</option>
            {firms.filter((s) => s.status === 'ACTIVE').map((s) => <option key={s.subcontractor_id} value={s.subcontractor_id}>{s.name} ({s.trade})</option>)}
          </select>
        </Field>
      )}
      <Field label="Bid price (USD)"><input {...f.bind('amountUsd')} required inputMode="decimal" className={inputCls} /></Field>
      <Field label="Duration (days)"><input {...f.bind('durationDays')} required inputMode="numeric" className={inputCls} /></Field>
      <Field label="Methodology" wide><textarea {...f.bind('methodology')} rows={2} className={inputCls} /></Field>
      <div className="sm:col-span-2 flex justify-end"><Button type="submit" disabled={busy}>Submit bid</Button></div>
    </form>
  );
}

function AwardForm({ tenderId, detail, ctx, onAwarded }: { tenderId: string; detail: TenderDetail; ctx: Ctx; onAwarded: () => unknown }) {
  const ev = detail.evaluation!;
  const f = useForm({ bidId: ev.recommendedBidId ?? '', startDate: todayHarare(), retentionPercent: '5', paymentTermsDays: '30', defectsLiabilityMonths: '12', justification: '' });
  const { busy, run } = useAction(ctx);
  const chosen = ev.bids.find((b) => b.bid_id === f.values.bidId);
  const needsJustification = !!chosen && chosen.rank !== 1;
  return (
    <form className="bg-emerald-950/20 border border-emerald-500/30 rounded-xl p-3 grid sm:grid-cols-3 gap-2" onSubmit={async (e) => {
      e.preventDefault();
      const v = f.values;
      await run(() => api.awardTender(tenderId, {
        ...v, paymentTermsDays: Number(v.paymentTermsDays), defectsLiabilityMonths: Number(v.defectsLiabilityMonths), justification: v.justification || undefined,
      }), (r) => `Awarded: subcontract ${r.subcontract.contract_no} created${r.budgetWarning ? ` — ⚠ ${r.budgetWarning}` : ''}`, onAwarded);
    }}>
      <div className="sm:col-span-3 text-[10px] font-bold uppercase tracking-wider text-emerald-300">Award &amp; subcontract terms</div>
      <Field label="Bid">
        <select {...f.bind('bidId')} required className={inputCls}>
          {ev.bids.filter((b) => b.compliant).map((b) => <option key={b.bid_id} value={b.bid_id}>#{b.rank} {b.subcontractor_name} — {usd(b.amount_usd)}</option>)}
        </select>
      </Field>
      <Field label="Start date"><input type="date" {...f.bind('startDate')} required className={inputCls} /></Field>
      <Field label="Retention %"><input {...f.bind('retentionPercent')} inputMode="decimal" className={inputCls} /></Field>
      <Field label="Payment terms (days)"><input {...f.bind('paymentTermsDays')} inputMode="numeric" className={inputCls} /></Field>
      <Field label="Defects liability (months)"><input {...f.bind('defectsLiabilityMonths')} inputMode="numeric" className={inputCls} /></Field>
      {needsJustification && (
        <Field label="Justification (not the top-ranked bid)" wide>
          <input {...f.bind('justification')} required minLength={20} className={inputCls} placeholder="Why this bid over the recommended one?" />
        </Field>
      )}
      <div className="sm:col-span-3 flex justify-end"><Button type="submit" variant="success" disabled={busy}>Award tender</Button></div>
    </form>
  );
}

function SubcontractView({ subcontractId, ctx, onChanged }: { subcontractId: string; ctx: Ctx; onChanged: () => unknown }) {
  const [detail, reload] = useLoader<SubcontractDetail | null>(() => api.fetchSubcontract(subcontractId), [subcontractId], ctx, null);
  const { busy, run } = useAction(ctx);
  const claim = useForm({ periodEnd: todayHarare(), claimedCumulativeUsd: '' });
  const variation = useForm({ amountUsd: '', reason: '' });
  const done = async () => { await Promise.all([reload(), onChanged()]); };
  if (!detail) return <Card title="Subcontract detail"><Empty>Loading…</Empty></Card>;
  const s = detail.subcontract;
  const t = detail.totals;
  const active = s.status === 'ACTIVE';

  return (
    <Card title={`${s.contract_no} — ${s.subcontractor_name}`}
      subtitle={`${s.project_code} · ${s.cost_code} · ${s.start_date} → ${s.end_date} · retention ${num(s.retention_percent)}% · pay within ${s.payment_terms_days} days · defects liability ${s.defects_liability_months} months`}
      actions={<>
        <Badge tone={statusTone(s.status)}>{humanize(s.status)}</Badge>
        {active && ctx.hasRole('PROJECT_MANAGER') && <>
          <Button variant="ghost" disabled={busy} onClick={() => run(() => api.setSubcontractStatus(subcontractId, 'COMPLETED'), 'Subcontract marked complete', done)}>Complete</Button>
          <Button variant="danger" disabled={busy} onClick={() => window.confirm('Terminate this subcontract?') && run(() => api.setSubcontractStatus(subcontractId, 'TERMINATED'), 'Subcontract terminated', done)}>Terminate</Button>
        </>}
      </>}>
      <p className="text-slate-300">{s.scope}</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Stat label="Revised value" value={usd(t.revised_value_usd)} hint={`Original ${usd(t.original_value_usd)} · variations ${usd(t.variations_usd)}`} />
        <Stat label="Certified to date" value={usd(t.certified_to_date_usd)} hint={`${t.percent_certified}% · remaining ${usd(t.remaining_value_usd)}`} />
        <Stat label="Retention held" value={usd(t.retention_held_usd)} />
        <Stat label="Paid / certified unpaid" value={usd(t.paid_to_date_usd)} hint={`${usd(t.certified_unpaid_usd)} awaiting payment`} tone={t.certified_unpaid_usd > 0 ? 'amber' : undefined} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-slate-300 whitespace-nowrap">
          <thead className="bg-slate-950 text-[10px] uppercase text-slate-400">
            <tr>{['#', 'Period', 'Claimed (cum.)', 'Certified (cum.)', 'This period', 'Retention', 'Net payable', 'Due', 'Status', ''].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {detail.claims.map((c) => (
              <tr key={c.claim_id}>
                <td className={tdCls}>{c.claim_no}</td>
                <td className={tdCls}>{c.period_end}</td>
                <td className={tdCls}>{usd(c.claimed_cumulative_usd)}</td>
                <td className={tdCls}>{usd(c.certified_cumulative_usd)}</td>
                <td className={tdCls}>{usd(c.gross_this_period_usd)}</td>
                <td className={tdCls}>{usd(c.retention_this_period_usd)}</td>
                <td className={`${tdCls} font-bold text-white`}>{usd(c.net_payable_usd)}</td>
                <td className={`${tdCls} ${c.overdue ? 'text-rose-300 font-bold' : ''}`}>{c.payment_due_date ?? '—'}{c.overdue && ' (overdue)'}</td>
                <td className={tdCls}><Badge tone={statusTone(c.status)}>{humanize(c.status)}</Badge>
                  {c.rejection_reason && <div className="text-rose-300 text-[10px] whitespace-normal">{c.rejection_reason}</div>}
                  {c.paid_reference && <div className="text-slate-500 text-[10px]">{c.paid_reference}</div>}</td>
                <td className={`${tdCls} space-x-1`}>
                  {c.status === 'SUBMITTED' && ctx.hasRole('QUANTITY_SURVEYOR') && c.submitted_by !== ctx.sub && <>
                    <PromptButton label="Certify" variant="success" placeholder={`Cumulative ≤ ${c.claimed_cumulative_usd}`}
                      onSubmit={(v) => run(() => api.certifyClaim(c.claim_id, v), `Claim #${c.claim_no} certified`, done)} />
                    <PromptButton label="Reject" variant="danger" placeholder="Reason" onSubmit={(v) => run(() => api.rejectClaim(c.claim_id, v), `Claim #${c.claim_no} rejected`, done)} />
                  </>}
                  {c.status === 'CERTIFIED' && ctx.hasRole('FINANCE_MANAGER') && (
                    <PromptButton label="Mark paid" variant="primary" placeholder="Payment reference" onSubmit={(v) => run(() => api.payClaim(c.claim_id, v), `Claim #${c.claim_no} paid`, done)} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {detail.claims.length === 0 && <Empty>No claims yet.</Empty>}
      </div>

      {active && ctx.hasRole('QUANTITY_SURVEYOR', 'SUBCONTRACTOR') && (
        <form className="flex flex-wrap items-end gap-2" onSubmit={async (e) => {
          e.preventDefault();
          if (await run(() => api.submitClaim(subcontractId, claim.values.periodEnd, claim.values.claimedCumulativeUsd), 'Progress claim submitted for certification', done)) claim.reset();
        }}>
          <Field label="Valuation period end"><input type="date" {...claim.bind('periodEnd')} max={todayHarare()} className={inputCls} /></Field>
          <Field label="Cumulative value of work done (USD)"><input {...claim.bind('claimedCumulativeUsd')} required inputMode="decimal" className={inputCls} /></Field>
          <Button type="submit" disabled={busy}>Submit claim</Button>
        </form>
      )}

      <div className="space-y-1">
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Variations</div>
        {detail.variations.length === 0 && <p className="text-slate-500">None.</p>}
        {detail.variations.map((v) => (
          <div key={v.variation_id} className="flex gap-2 text-slate-300">
            <span className={Number(v.amount_usd) < 0 ? 'text-rose-300' : 'text-emerald-300'}>{usd(v.amount_usd)}</span>
            <span>{v.reason}</span><span className="ml-auto text-slate-500">{v.approved_by} · {new Date(v.created_at).toLocaleDateString()}</span>
          </div>
        ))}
        {active && ctx.hasRole('PROJECT_MANAGER') && (
          <form className="flex flex-wrap gap-2 pt-1" onSubmit={async (e) => {
            e.preventDefault();
            if (await run(() => api.addVariation(subcontractId, variation.values.amountUsd, variation.values.reason), 'Variation approved', done)) variation.reset();
          }}>
            <input {...variation.bind('amountUsd')} required placeholder="±USD" className={`${inputCls} w-28`} aria-label="Variation amount" />
            <input {...variation.bind('reason')} required placeholder="Reason / instruction ref." className={`${inputCls} w-72`} aria-label="Variation reason" />
            <Button type="submit" disabled={busy}>Approve variation</Button>
          </form>
        )}
      </div>
    </Card>
  );
}

function SubcontractorRegister({ firms, ctx, onChanged }: { firms: Subcontractor[]; ctx: Ctx; onChanged: () => unknown }) {
  const f = useForm({ name: '', registrationNo: '', trade: '', contactPhone: '', email: '', taxClearanceExpiry: '', userSub: '' });
  const { busy, run } = useAction(ctx);
  return (
    <Card title="Subcontractor register" subtitle="Bidders need an active status and a valid ZIMRA tax clearance at tender closing">
      <div className="overflow-x-auto">
        <table className="w-full text-slate-300">
          <thead className="bg-slate-950 text-[10px] uppercase text-slate-400">
            <tr>{['Name', 'Reg. no', 'Trade', 'Contact', 'Tax clearance', 'Active contracts', 'Status', ''].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {firms.map((s) => (
              <tr key={s.subcontractor_id}>
                <td className={`${tdCls} text-white font-bold`}>{s.name}</td>
                <td className={tdCls}>{s.registration_no}</td>
                <td className={tdCls}>{s.trade}</td>
                <td className={tdCls}>{s.contact_phone}{s.email && <div className="text-slate-500">{s.email}</div>}</td>
                <td className={tdCls}><Badge tone={s.tax_clearance_valid ? 'green' : 'red'}>{s.tax_clearance_expiry ?? 'None'}</Badge></td>
                <td className={tdCls}>{s.active_subcontracts}</td>
                <td className={tdCls}><Badge tone={statusTone(s.status)}>{humanize(s.status)}</Badge></td>
                <td className={`${tdCls} space-x-1 whitespace-nowrap`}>
                  {ctx.hasRole('PROJECT_MANAGER') && <>
                    <Button variant={s.status === 'ACTIVE' ? 'danger' : 'success'} disabled={busy}
                      onClick={() => run(() => api.updateSubcontractor(s.subcontractor_id, { status: s.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' }),
                        `${s.name} ${s.status === 'ACTIVE' ? 'suspended' : 'reinstated'}`, onChanged)}>
                      {s.status === 'ACTIVE' ? 'Suspend' : 'Reinstate'}
                    </Button>
                    <PromptButton label="Tax clearance" placeholder="New expiry YYYY-MM-DD"
                      onSubmit={(d) => run(() => api.updateSubcontractor(s.subcontractor_id, { taxClearanceExpiry: d }), 'Tax clearance updated', onChanged)} />
                  </>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {firms.length === 0 && <Empty>No subcontractors registered.</Empty>}
      </div>
      {ctx.hasRole('PROJECT_MANAGER', 'QUANTITY_SURVEYOR') && (
        <form className="grid sm:grid-cols-4 gap-2" onSubmit={async (e) => {
          e.preventDefault();
          const v = f.values;
          const body = Object.fromEntries(Object.entries(v).filter(([, x]) => x !== ''));
          if (await run(() => api.createSubcontractor(body), `${v.name} registered`, onChanged)) f.reset();
        }}>
          <input {...f.bind('name')} required placeholder="Company name" className={inputCls} aria-label="Company name" />
          <input {...f.bind('registrationNo')} required placeholder="Company reg. no" className={inputCls} aria-label="Registration number" />
          <input {...f.bind('trade')} required placeholder="Trade (civils, roofing…)" className={inputCls} aria-label="Trade" />
          <input {...f.bind('contactPhone')} required placeholder="+263…" className={inputCls} aria-label="Contact phone" />
          <input {...f.bind('email')} placeholder="Email" className={inputCls} aria-label="Email" />
          <label className="flex items-center gap-2 text-slate-400">Tax clearance expiry <input type="date" {...f.bind('taxClearanceExpiry')} className={inputCls} /></label>
          <input {...f.bind('userSub')} placeholder="Portal sign-in (user id)" className={inputCls} aria-label="Portal sign-in" />
          <Button type="submit" disabled={busy}>Register subcontractor</Button>
        </form>
      )}
    </Card>
  );
}
