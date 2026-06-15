import { CATEGORIES, type Confidence, type SignalEvent } from '@/lib/types';

export function CategoryPill({ category }: { category: SignalEvent['category'] }) {
  const meta = CATEGORIES[category];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
      style={{ color: meta.color, background: `${meta.color}1a`, border: `1px solid ${meta.color}40` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />
      {meta.label}
    </span>
  );
}

const CONFIDENCE_STYLES: Record<Confidence, { color: string; label: string }> = {
  high: { color: '#34d399', label: 'High confidence' },
  medium: { color: '#fbbf24', label: 'Medium confidence' },
  low: { color: '#fb7185', label: 'Low confidence' },
};

export function ConfidenceBadge({ confidence, compact = false }: { confidence: Confidence; compact?: boolean }) {
  const s = CONFIDENCE_STYLES[confidence];
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium"
      style={{ color: s.color, background: `${s.color}14` }}
      title={s.label}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color, boxShadow: `0 0 6px ${s.color}` }} />
      {compact ? confidence : s.label}
    </span>
  );
}

export function RiskBadge({ risk }: { risk: number }) {
  if (risk < 7) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-rose-300">
      ⚠ risk {risk}/10
    </span>
  );
}

export function VerifyFlag({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
      ⚑ verify ×{count}
    </span>
  );
}

export function ScoreMeter({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2 text-[10px] text-slate-400">
      <span className="w-14 shrink-0">{label}</span>
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.min(100, value * 10)}%`, background: color, boxShadow: `0 0 6px ${color}` }}
        />
      </div>
      <span className="w-7 text-right font-mono text-slate-300">{value}/10</span>
    </div>
  );
}
