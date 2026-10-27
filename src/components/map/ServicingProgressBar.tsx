import React from 'react';
import { CheckCircle2, Clock, Circle, ShieldAlert, Truck } from 'lucide-react';
import type { ServicingState, StandServicing } from '../../types';

interface ServicingProgressBarProps {
  servicing: StandServicing;
  certificateRef?: string | null;
  compact?: boolean;
}

const ITEMS: { key: keyof StandServicing; label: string }[] = [
  { key: 'water', label: 'Water reticulation' },
  { key: 'sewer', label: 'Sewer reticulation' },
  { key: 'roads', label: 'Roads' },
];

const weight = (s: ServicingState) => (s === 'CERTIFIED' ? 1 : s === 'IN_PROGRESS' ? 0.5 : 0);

/**
 * ZNHSP servicing gate: a title deed can only be issued when water, sewer and roads are all
 * CERTIFIED by the civil engineering unit (enforced by zhms-api and the database).
 *
 * ⚡ Bolt: Wrapped in React.memo with a custom comparison function checking specific nested
 * properties (water, sewer, roads) to prevent O(N) unnecessary re-renders when rendered
 * in large lists like the stand registry.
 */
export const ServicingProgressBar = React.memo(({ servicing, certificateRef, compact = false }: ServicingProgressBarProps) => {
  const percentage = Math.round((ITEMS.reduce((t, i) => t + weight(servicing[i.key]), 0) / ITEMS.length) * 100);
  const certified = ITEMS.every((i) => servicing[i.key] === 'CERTIFIED');
  const barColor = certified ? 'bg-emerald-500' : percentage >= 50 ? 'bg-amber-500' : 'bg-rose-500';

  if (compact) {
    return (
      <div className="w-full">
        <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
          <div className={`h-full ${barColor} transition-all`} style={{ width: `${percentage}%` }} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-slate-300 font-semibold">
          <Truck className="w-3.5 h-3.5 text-sky-400" /> Infrastructure servicing
        </span>
        <span className={`font-mono font-bold ${certified ? 'text-emerald-400' : 'text-amber-400'}`}>{percentage}%</span>
      </div>
      <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full ${barColor} transition-all`} style={{ width: `${percentage}%` }} />
      </div>
      <ul className="grid grid-cols-3 gap-1.5 text-[10px] font-mono">
        {ITEMS.map(({ key, label }) => {
          const s = servicing[key];
          const Icon = s === 'CERTIFIED' ? CheckCircle2 : s === 'IN_PROGRESS' ? Clock : Circle;
          const color = s === 'CERTIFIED' ? 'text-emerald-400' : s === 'IN_PROGRESS' ? 'text-amber-400' : 'text-slate-500';
          return (
            <li key={key} className={`flex items-center gap-1 ${color}`} title={`${label}: ${s.replace('_', ' ').toLowerCase()}`}>
              <Icon className="w-3 h-3 shrink-0" /> {label.split(' ')[0]}
            </li>
          );
        })}
      </ul>
      <p className={`text-[10px] flex items-center gap-1 ${certified ? 'text-emerald-400' : 'text-slate-400'}`}>
        <ShieldAlert className="w-3 h-3" />
        {certified
          ? `Certified for title transfer${certificateRef ? ` · ${certificateRef}` : ''}`
          : 'Title deed blocked until all three are certified'}
      </p>
    </div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.compact === nextProps.compact &&
    prevProps.certificateRef === nextProps.certificateRef &&
    ITEMS.every((item) => prevProps.servicing[item.key] === nextProps.servicing[item.key])
  );
});
