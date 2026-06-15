'use client';

import { CATEGORIES, type SignalEvent } from '@/lib/types';
import { CategoryPill, ConfidenceBadge, RiskBadge, VerifyFlag } from './ui';

export default function StoryCard({
  event,
  isNew,
  selected,
  onInspect,
  onToggleSelect,
  onRemove,
}: {
  event: SignalEvent;
  isNew: boolean;
  selected: boolean;
  onInspect: () => void;
  onToggleSelect: () => void;
  onRemove: () => void;
}) {
  const color = CATEGORIES[event.category].color;
  const risky = event.risk_score >= 7 || event.confidence === 'low';

  return (
    <div
      className={`glass group relative cursor-pointer overflow-hidden p-3 transition hover:border-slate-500/40 ${
        isNew ? 'animate-slide-in' : ''
      } ${selected ? 'ring-1 ring-cyan-400/70' : ''}`}
      onClick={onInspect}
    >
      <span
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ background: color, boxShadow: `0 0 8px ${color}` }}
      />
      <div className="mb-1.5 flex items-center justify-between gap-2 pl-1.5">
        <CategoryPill category={event.category} />
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect();
            }}
            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold transition ${
              selected
                ? 'bg-cyan-400/20 text-cyan-300'
                : 'bg-slate-700/40 text-slate-400 hover:bg-slate-600/50 hover:text-slate-200'
            }`}
            title={selected ? 'Remove from bundle selection' : 'Add to bundle selection'}
          >
            {selected ? '✓ selected' : '+ select'}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="rounded px-1 py-0.5 text-[10px] font-semibold text-slate-600 opacity-0 transition hover:bg-rose-950/50 hover:text-rose-300 group-hover:opacity-100"
            title="Remove this node from the board"
          >
            ✕
          </button>
        </div>
      </div>
      <h3 className="pl-1.5 text-[13px] font-semibold leading-snug text-slate-100">{event.title}</h3>
      <p className="mt-1 pl-1.5 text-[11px] leading-relaxed text-slate-400" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {event.summary}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-1.5">
        <ConfidenceBadge confidence={event.confidence} compact />
        <RiskBadge risk={event.risk_score} />
        <VerifyFlag count={event.verification_needed.length + event.claims_to_verify.length} />
        {event.do_not_overstate.length > 0 && (
          <span className="rounded bg-violet-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-violet-300">
            ✋ don&apos;t overstate
          </span>
        )}
        {event.status === 'draft' && (
          <span className="rounded bg-slate-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300">draft</span>
        )}
      </div>
      <div className="mt-1.5 flex items-center justify-between pl-1.5 text-[10px] text-slate-500">
        <span className="truncate">{event.source_name || '—'}</span>
        <span className="font-mono">
          ★{event.viewer_interest_score} {risky && <span className="text-rose-400">⚠{event.risk_score}</span>}
        </span>
      </div>
    </div>
  );
}
