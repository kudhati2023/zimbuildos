import React, { useCallback, useEffect, useState } from 'react';

// Shared building blocks for the construction workspace. Same visual language as the rest of ZHMS:
// dark slate panels, indigo actions, monospace data.

/** What every construction panel needs from the shell: who is signed in and how to report outcomes. */
export interface Ctx {
  sub: string | null;
  hasRole: (...roles: string[]) => boolean;
  notify: (message: string) => void;
  fail: (err: unknown) => void;
}

export const usd = (v: number | string | null | undefined) =>
  v === null || v === undefined || v === '' ? '—'
    : `${Number(v) < 0 ? '-' : ''}$${Math.abs(Number(v)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const num = (v: number | string | null | undefined, digits = 1) =>
  v === null || v === undefined ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: digits });
export const todayHarare = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Harare' }).format(new Date());
export const humanize = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

export const inputCls = 'bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-100 w-full focus:outline-none focus:border-indigo-500 disabled:opacity-50';
export const thCls = 'p-2 text-left font-semibold';
export const tdCls = 'p-2 align-top';

/** Loads data for a panel and reloads when `deps` change. Errors go to the shell's banner. */
export function useLoader<T>(fn: () => Promise<T>, deps: unknown[], ctx: Ctx, initial: T): [T, () => Promise<void>, boolean] {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await fn()); } catch (err) { ctx.fail(err); } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { load(); }, [load]);
  return [data, load, loading];
}

/** Runs one user action: shows a success message and refreshes, or reports the server's refusal. */
export function useAction(ctx: Ctx) {
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, success: string | ((r: any) => string), after?: () => unknown): Promise<boolean> => {
    setBusy(true);
    try {
      const result = await fn();
      ctx.notify(typeof success === 'function' ? success(result) : success);
      await after?.();
      return true;
    } catch (err) {
      ctx.fail(err);
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

/** Minimal form state: `bind('field')` wires an input; `reset()` restores the initial values. */
export function useForm<T extends Record<string, any>>(initial: T) {
  const [values, setValues] = useState<T>(initial);
  const set = <K extends keyof T>(key: K, value: T[K]) => setValues((v) => ({ ...v, [key]: value }));
  const bind = (key: keyof T) => ({
    value: values[key] ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => set(key, e.target.value as T[keyof T]),
  });
  return { values, set, bind, reset: () => setValues(initial), setValues };
}

export function Card({ title, subtitle, actions, children, className = '' }: {
  title?: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={`bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-3 ${className}`}>
      {(title || actions) && (
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            {title && <h3 className="text-xs font-bold text-white uppercase tracking-wider">{title}</h3>}
            {subtitle && <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

const TONES = {
  green: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  amber: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  red: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  blue: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  indigo: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
  slate: 'bg-slate-700/40 text-slate-300 border-slate-600/40',
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ tone = 'slate', children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={`inline-block px-2 py-0.5 rounded border text-[10px] font-bold whitespace-nowrap ${TONES[tone]}`}>{children}</span>;
}

/** Badge colour for the many status enums the API returns. */
export function statusTone(status: string): Tone {
  if (['WITHIN_BUDGET', 'ACTIVE', 'AVAILABLE', 'PASS', 'COMPLETED', 'CLOSED', 'PAID', 'AWARDED', 'ON_TRACK', 'AHEAD', 'COMPLETE'].includes(status)) return 'green';
  if (['AT_RISK', 'ON_HOLD', 'UNDER_MAINTENANCE', 'RESOLVED', 'SUBMITTED', 'EVALUATION', 'IN_PROGRESS', 'MAJOR', 'LATE_START', 'PLANNING'].includes(status)) return 'amber';
  if (['OVER_BUDGET', 'OUT_OF_SERVICE', 'FAIL', 'OPEN_NCR', 'REJECTED', 'CANCELLED', 'TERMINATED', 'BEHIND', 'LATE', 'CRITICAL', 'SUSPENDED'].includes(status)) return 'red';
  if (['OPEN', 'CERTIFIED'].includes(status)) return 'blue';
  return 'slate';
}

export function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: Tone }) {
  const color = tone === 'red' ? 'text-rose-300' : tone === 'amber' ? 'text-amber-300' : tone === 'green' ? 'text-emerald-300' : 'text-white';
  return (
    <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 min-w-0">
      <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold truncate">{label}</div>
      <div className={`text-base font-bold mt-1 truncate ${color}`}>{value}</div>
      {hint && <div className="text-[10px] text-slate-500 mt-0.5 truncate">{hint}</div>}
    </div>
  );
}

export function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`block space-y-1 ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">{label}</span>
      {children}
    </label>
  );
}

export function Button({ variant = 'primary', className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' | 'success' }) {
  const styles = {
    primary: 'bg-indigo-600 hover:bg-indigo-500 text-white',
    success: 'bg-emerald-600 hover:bg-emerald-500 text-white',
    danger: 'bg-rose-600/80 hover:bg-rose-500 text-white',
    ghost: 'bg-slate-800 hover:bg-slate-700 text-slate-200',
  }[variant];
  return <button {...props} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition disabled:opacity-40 disabled:cursor-not-allowed ${styles} ${className}`} />;
}

/** Actual progress bar with an optional tick for the planned position. */
export function ProgressBar({ value, planned, tone = 'indigo' }: { value: number; planned?: number; tone?: 'indigo' | 'green' | 'amber' | 'red' }) {
  const fill = { indigo: 'bg-indigo-500', green: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-rose-500' }[tone];
  return (
    <div className="relative h-2 bg-slate-800 rounded-full overflow-visible" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-2 rounded-full ${fill}`} style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }} />
      {planned !== undefined && (
        <div className="absolute -top-1 h-4 w-0.5 bg-slate-200" style={{ left: `${Math.min(Math.max(planned, 0), 100)}%` }} title={`Planned ${planned}%`} />
      )}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="bg-slate-950/60 border border-dashed border-slate-800 p-5 rounded-xl text-center text-slate-500">{children}</div>;
}

/** Panel shown when the signed-in user's roles cannot perform an action. */
export function RoleNote({ roles }: { roles: string[] }) {
  return <p className="text-[11px] text-slate-500">Requires role: {roles.join(' or ')}</p>;
}

/** Inline prompt for a reason or reference before a state change (reject, reverse, pay…). */
export function PromptButton({ label, placeholder, onSubmit, variant = 'ghost', disabled }: {
  label: string; placeholder: string; onSubmit: (value: string) => Promise<boolean>; variant?: 'primary' | 'ghost' | 'danger' | 'success'; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  if (!open) return <Button variant={variant} disabled={disabled} onClick={() => setOpen(true)}>{label}</Button>;
  return (
    <form className="flex items-center gap-1" onSubmit={async (e) => { e.preventDefault(); if (await onSubmit(value.trim())) { setOpen(false); setValue(''); } }}>
      <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} className={`${inputCls} w-48`} />
      <Button type="submit" variant={variant} disabled={!value.trim() || disabled}>OK</Button>
      <Button type="button" variant="ghost" onClick={() => setOpen(false)}>×</Button>
    </form>
  );
}
