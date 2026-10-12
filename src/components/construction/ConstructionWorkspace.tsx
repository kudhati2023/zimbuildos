import React, { useEffect, useState } from 'react';
import { ClipboardCheck, HardHat, LineChart, Truck, Gavel, Building2 } from 'lucide-react';
import * as api from '../../api';
import type { ConstructionProject, ProjectStatus, Session } from '../../types';
import { Badge, Button, Card, Ctx, Empty, Field, ProgressBar, humanize, inputCls, statusTone, todayHarare, useAction, useForm, useLoader, usd } from './ui';
import { JobCostingPanel } from './JobCostingPanel';
import { SiteProgressPanel } from './SiteProgressPanel';
import { TendersPanel } from './TendersPanel';
import { QualityPanel } from './QualityPanel';
import { PlantPanel } from './PlantPanel';

/** Mirrors CONSTRUCTION_READ_ROLES in zhms-api/src/auth.js. */
const READ_ROLES = ['PROJECT_MANAGER', 'QUANTITY_SURVEYOR', 'SITE_SUPERVISOR', 'QA_INSPECTOR', 'PLANT_MANAGER', 'ENGINEER', 'CEO', 'FINANCE_MANAGER', 'AUDITOR'];
const NEXT_STATUS: Record<ProjectStatus, ProjectStatus[]> = {
  PLANNING: ['ACTIVE', 'ON_HOLD'], ACTIVE: ['ON_HOLD', 'COMPLETED'], ON_HOLD: ['ACTIVE'], COMPLETED: ['ACTIVE', 'CLOSED'], CLOSED: [],
};
const MODULES = [
  { id: 'COSTS', label: 'Job Costing', icon: LineChart },
  { id: 'PROGRESS', label: 'Site Progress', icon: HardHat },
  { id: 'TENDERS', label: 'Tenders & Subcontracts', icon: Gavel },
  { id: 'QUALITY', label: 'Quality Control', icon: ClipboardCheck },
  { id: 'PLANT', label: 'Plant & Maintenance', icon: Truck },
] as const;
type ModuleId = typeof MODULES[number]['id'];

export function ConstructionWorkspace({ session, notify, fail }: { session: Session | null; notify: (m: string) => void; fail: (e: unknown) => void }) {
  const hasRole = (...roles: string[]) => !!session?.roles.some((r) => roles.includes(r));
  const ctx: Ctx = { sub: session?.sub ?? null, hasRole, notify, fail };

  if (!session) {
    return <Card title="Construction operations"><Empty>Sign in with a construction role (project manager, quantity surveyor, site supervisor, QA inspector, plant manager) or a subcontractor account.</Empty></Card>;
  }
  if (!hasRole(...READ_ROLES)) {
    if (hasRole('SUBCONTRACTOR')) {
      return (
        <div className="space-y-4">
          <Header title="Subcontractor portal" subtitle="Bid on open tenders, follow your subcontracts and submit progress claims" />
          <TendersPanel ctx={ctx} />
        </div>
      );
    }
    return <Card title="Construction operations"><Empty>Your sign-in has no construction role.</Empty></Card>;
  }
  return <StaffWorkspace ctx={ctx} />;
}

function Header({ title, subtitle, children }: { title: string; subtitle: string; children?: React.ReactNode }) {
  return (
    <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl flex justify-between items-center gap-4 flex-wrap">
      <div>
        <span className="text-[10px] text-amber-400 font-bold uppercase tracking-widest block mb-1">Construction Operations &amp; Project Management</span>
        <h2 className="text-base font-bold text-white flex items-center gap-2"><Building2 className="w-5 h-5 text-amber-400" />{title}</h2>
        <p className="text-slate-400 text-xs mt-1">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

function StaffWorkspace({ ctx }: { ctx: Ctx }) {
  const [projects, reload] = useLoader<ConstructionProject[]>(() => api.fetchProjects(), [], ctx, []);
  const [projectId, setProjectId] = useState<string>('');
  const [module, setModule] = useState<ModuleId>('COSTS');
  const [creating, setCreating] = useState(false);
  const { busy, run } = useAction(ctx);
  const project = projects.find((p) => p.project_id === projectId) ?? null;

  useEffect(() => {
    if (!projectId && projects[0]) setProjectId(projects[0].project_id);
  }, [projects, projectId]);

  return (
    <div className="space-y-4">
      <Header title="Projects, job costing, site progress, tenders, quality and plant"
        subtitle="Every figure comes from the zhms-api ledger; budgets, cost postings, inspections and claims are append-only and audited.">
        {ctx.hasRole('PROJECT_MANAGER') && <Button onClick={() => setCreating(!creating)}>{creating ? 'Close' : '+ New project'}</Button>}
      </Header>

      {creating && <NewProject ctx={ctx} onCreated={async (id) => { setCreating(false); await reload(); setProjectId(id); }} />}

      <Card title="Project portfolio" subtitle="Budget vs cost to date, physical progress and open quality / claim items">
        {projects.length === 0 ? <Empty>No construction projects yet.{ctx.hasRole('PROJECT_MANAGER') ? ' Create the first one above.' : ''}</Empty> : (
          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
            {projects.map((p) => {
              const budget = Number(p.budget_usd ?? 0);
              const spent = budget > 0 ? (Number(p.actual_usd ?? 0) / budget) * 100 : 0;
              return (
                <button key={p.project_id} onClick={() => setProjectId(p.project_id)}
                  className={`text-left p-3 rounded-xl border transition space-y-2 ${projectId === p.project_id ? 'border-amber-500 bg-amber-950/20' : 'border-slate-800 bg-slate-950/60 hover:border-slate-600'}`}>
                  <div className="flex items-center gap-2"><span className="font-bold text-white truncate">{p.code}</span><Badge tone={statusTone(p.status)}>{humanize(p.status)}</Badge></div>
                  <div className="text-slate-300 truncate">{p.name}</div>
                  <div className="text-[11px] text-slate-400 flex justify-between"><span>Progress</span><span>{p.percent_complete ?? 0}%</span></div>
                  <ProgressBar value={p.percent_complete ?? 0} tone="indigo" />
                  <div className="text-[11px] text-slate-400 flex justify-between"><span>{usd(p.actual_usd)} spent</span><span>of {usd(p.budget_usd)}</span></div>
                  <ProgressBar value={spent} tone={spent > 100 ? 'red' : spent > 90 ? 'amber' : 'green'} />
                  <div className="flex gap-1 flex-wrap">
                    {!!p.open_ncrs && <Badge tone="red">{p.open_ncrs} open NCR</Badge>}
                    {!!p.claims_awaiting_certification && <Badge tone="amber">{p.claims_awaiting_certification} claim(s) to certify</Badge>}
                    <span className="text-[10px] text-slate-500 ml-auto">{p.last_site_report ? `Diary ${p.last_site_report}` : 'No site diary'}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {project && (
        <>
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 flex flex-wrap items-center gap-3">
            <div className="min-w-0">
              <div className="font-bold text-white">{project.code} — {project.name}</div>
              <div className="text-[11px] text-slate-400">{project.site_location} · client {project.client_name} · {project.start_date} → {project.planned_end_date} · contract {usd(project.contract_value_usd)}</div>
            </div>
            {ctx.hasRole('PROJECT_MANAGER') && NEXT_STATUS[project.status].length > 0 && (
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-slate-500 uppercase">Move to</span>
                {NEXT_STATUS[project.status].map((s) => (
                  <Button key={s} variant={s === 'CLOSED' ? 'danger' : 'ghost'} disabled={busy}
                    onClick={() => (s !== 'CLOSED' || window.confirm('Closing a project stops all further cost postings. Continue?'))
                      && run(() => api.setProjectStatus(project.project_id, s), `${project.code} is now ${humanize(s)}`, reload)}>{humanize(s)}</Button>
                ))}
              </div>
            )}
            <div className="flex bg-slate-950/80 border border-slate-800 p-1 rounded-xl ml-auto overflow-x-auto">
              {MODULES.map(({ id, label, icon: Icon }) => (
                <button key={id} onClick={() => setModule(id)}
                  className={`px-3 py-1.5 rounded-lg whitespace-nowrap flex items-center gap-1 ${module === id ? 'bg-amber-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'}`}>
                  <Icon className="w-3.5 h-3.5" /><span>{label}</span>
                </button>
              ))}
            </div>
          </div>

          {module === 'COSTS' && <JobCostingPanel key={project.project_id} projectId={project.project_id} ctx={ctx} />}
          {module === 'PROGRESS' && <SiteProgressPanel key={project.project_id} projectId={project.project_id} ctx={ctx} />}
          {module === 'TENDERS' && <TendersPanel key={project.project_id} projectId={project.project_id} ctx={ctx} />}
          {module === 'QUALITY' && <QualityPanel key={project.project_id} projectId={project.project_id} ctx={ctx} />}
          {module === 'PLANT' && <PlantPanel projectId={project.project_id} ctx={ctx} />}
        </>
      )}
    </div>
  );
}

function NewProject({ ctx, onCreated }: { ctx: Ctx; onCreated: (projectId: string) => unknown }) {
  const f = useForm({ code: '', name: '', siteLocation: '', clientName: 'ZimBuild', contractValueUsd: '', startDate: todayHarare(), plannedEndDate: '', developmentId: '', status: 'ACTIVE' });
  const { busy, run } = useAction(ctx);
  return (
    <Card title="New construction project">
      <form className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2" onSubmit={async (e) => {
        e.preventDefault();
        let id = '';
        const v = f.values;
        const ok = await run(async () => { id = (await api.createProject({ ...v, developmentId: v.developmentId || undefined, contractValueUsd: v.contractValueUsd || undefined })).project_id; },
          `Project ${v.code.toUpperCase()} created`);
        if (ok) onCreated(id);
      }}>
        <Field label="Code"><input {...f.bind('code')} required placeholder="BUD-PH2-CIVILS" className={inputCls} /></Field>
        <Field label="Name"><input {...f.bind('name')} required className={inputCls} /></Field>
        <Field label="Site location"><input {...f.bind('siteLocation')} required className={inputCls} /></Field>
        <Field label="Client"><input {...f.bind('clientName')} required className={inputCls} /></Field>
        <Field label="Contract value (USD)"><input {...f.bind('contractValueUsd')} inputMode="decimal" className={inputCls} /></Field>
        <Field label="Start date"><input type="date" {...f.bind('startDate')} required className={inputCls} /></Field>
        <Field label="Planned completion"><input type="date" {...f.bind('plannedEndDate')} required className={inputCls} /></Field>
        <Field label="Housing development id (optional)"><input {...f.bind('developmentId')} placeholder="dev-hre-budiriro" className={inputCls} /></Field>
        <Field label="Status"><select {...f.bind('status')} className={inputCls}><option value="ACTIVE">Active</option><option value="PLANNING">Planning</option></select></Field>
        <div className="lg:col-span-3 flex items-end justify-end"><Button type="submit" disabled={busy}>Create project</Button></div>
      </form>
    </Card>
  );
}
