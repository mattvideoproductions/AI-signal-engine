'use client';

import { connectionInsight } from '@/lib/insights';
import { CATEGORIES, type SignalEvent, type StoryBundle } from '@/lib/types';
import type { EdgePair } from './GraphCanvas';
import { CategoryPill, ConfidenceBadge, RiskBadge, ScoreMeter } from './ui';

function ListBlock({ title, items, tone }: { title: string; items: string[]; tone: 'amber' | 'violet' | 'slate' }) {
  if (items.length === 0) return null;
  const toneClass =
    tone === 'amber' ? 'text-amber-300' : tone === 'violet' ? 'text-violet-300' : 'text-slate-300';
  return (
    <div>
      <h4 className={`mb-1 text-[10px] font-bold uppercase tracking-widest ${toneClass}`}>{title}</h4>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="text-[11px] leading-relaxed text-slate-300">
            • {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Inspector({
  event,
  selected,
  onClose,
  onToggleSelect,
  onRemove,
}: {
  event: SignalEvent;
  selected: boolean;
  onClose: () => void;
  onToggleSelect: () => void;
  onRemove: (ignoreTopic: boolean) => void;
}) {
  return (
    <div className="glass-strong absolute left-4 top-4 z-20 flex max-h-[calc(100%-2rem)] w-[360px] flex-col overflow-hidden">
      <div className="flex items-start justify-between gap-2 border-b border-slate-700/40 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <CategoryPill category={event.category} />
          <ConfidenceBadge confidence={event.confidence} compact />
          <RiskBadge risk={event.risk_score} />
        </div>
        <button onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-700/50 hover:text-slate-200" aria-label="Close inspector">
          ✕
        </button>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <h2 className="text-sm font-bold leading-snug text-slate-100">{event.title}</h2>
        <p className="text-[12px] leading-relaxed text-slate-300">{event.summary}</p>

        {event.source_url && (
          <a
            href={event.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate text-[11px] text-cyan-300 underline decoration-cyan-700 underline-offset-2 hover:text-cyan-200"
          >
            ↗ {event.source_name || event.source_url}
          </a>
        )}

        <div className="space-y-1.5">
          <ScoreMeter label="Novelty" value={event.novelty_score} color="#22d3ee" />
          <ScoreMeter label="Interest" value={event.viewer_interest_score} color="#a78bfa" />
          <ScoreMeter label="Risk" value={event.risk_score} color="#fb7185" />
        </div>

        <ListBlock title="⚑ Verification needed" items={event.verification_needed} tone="amber" />
        <ListBlock title="⚑ Claims to verify" items={event.claims_to_verify} tone="amber" />
        <ListBlock title="✋ Do not overstate" items={event.do_not_overstate} tone="violet" />

        {event.related_entities.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {event.related_entities.map((ent) => (
              <span key={ent} className="rounded-full bg-slate-700/50 px-2 py-0.5 text-[10px] text-slate-300">
                ◇ {ent}
              </span>
            ))}
          </div>
        )}

        {event.connections.length > 0 && (
          <ListBlock
            title="Threads"
            items={event.connections.map(
              (c) =>
                `${c.relationship} → ${c.target_title_or_id}${c.resolved_target_id ? '' : ' (unresolved)'}${
                  c.reason ? ` — ${c.reason}` : ''
                }`,
            )}
            tone="slate"
          />
        )}

        {(event.title_angle || event.thumbnail_angle) && (
          <div className="rounded-lg border border-slate-700/50 bg-slate-900/50 p-2.5">
            {event.title_angle && (
              <p className="text-[11px] text-slate-300">
                <span className="font-bold text-cyan-300">Title:</span> {event.title_angle}
              </p>
            )}
            {event.thumbnail_angle && (
              <p className="mt-1 text-[11px] text-slate-300">
                <span className="font-bold text-violet-300">Thumb:</span> {event.thumbnail_angle}
              </p>
            )}
          </div>
        )}

        {event.notes && <p className="text-[11px] italic text-slate-500">{event.notes}</p>}
        <p className="text-[10px] text-slate-600">Captured {new Date(event.created_at).toLocaleString()}</p>
      </div>
      <div className="space-y-2 border-t border-slate-700/40 p-3">
        <button
          onClick={onToggleSelect}
          className={`w-full rounded-lg px-3 py-2 text-xs font-semibold transition ${
            selected
              ? 'bg-cyan-400/20 text-cyan-300 hover:bg-cyan-400/30'
              : 'bg-slate-700/60 text-slate-200 hover:bg-slate-600/70'
          }`}
        >
          {selected ? '✓ In bundle selection — click to remove' : '+ Add to bundle selection'}
        </button>
        <div className="flex gap-2">
          <button
            onClick={() => onRemove(false)}
            className="flex-1 rounded-lg border border-slate-600/50 bg-slate-800/50 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-slate-700/60"
            title="Removes this node from the board (keeps the topic allowed)"
          >
            ✕ Remove node
          </button>
          <button
            onClick={() => onRemove(true)}
            className="flex-1 rounded-lg border border-rose-700/40 bg-rose-950/40 px-3 py-2 text-xs font-semibold text-rose-300 transition hover:bg-rose-900/40"
            title="Removes the node AND tells Hermes to skip this topic — added to the ignore list in the Hermes prompt and enforced at ingest"
          >
            🚫 Ignore topic
          </button>
        </div>
      </div>
    </div>
  );
}

/** Popup for a clicked connection thread — synthesizes a creator insight. */
export function ConnectionInsightPanel({
  pair,
  onClose,
  onBundlePair,
  onInspect,
}: {
  pair: EdgePair;
  onClose: () => void;
  onBundlePair: (ids: string[]) => void;
  onInspect: (event: SignalEvent) => void;
}) {
  const insight = connectionInsight(pair.a, pair.b, pair.relationship, pair.strength);
  const colorA = CATEGORIES[pair.a.category].color;
  const colorB = CATEGORIES[pair.b.category].color;

  const miniCard = (event: SignalEvent, color: string) => (
    <button
      onClick={() => onInspect(event)}
      className="min-w-0 flex-1 rounded-xl border bg-slate-900/70 p-2.5 text-left transition hover:bg-slate-800/70"
      style={{ borderColor: `${color}50` }}
      title="Open in inspector"
    >
      <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color }}>
        {CATEGORIES[event.category].label}
      </span>
      <p className="mt-0.5 text-[11px] font-semibold leading-snug text-slate-100" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {event.title}
      </p>
    </button>
  );

  return (
    <div className="glass-strong absolute left-1/2 top-1/2 z-30 flex max-h-[82%] w-[480px] max-w-[92%] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-700/40 px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-100">
          <span>{insight.icon}</span> Connection Insight
        </h2>
        <button onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-700/50 hover:text-slate-200" aria-label="Close insight">
          ✕
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* the two endpoints joined by an animated thread */}
        <div className="flex items-stretch gap-0">
          {miniCard(pair.a, colorA)}
          <div className="relative flex w-14 shrink-0 items-center justify-center">
            <div
              className="insight-thread h-0.5 w-full"
              style={{ background: `linear-gradient(90deg, ${colorA}, ${colorB})` }}
            />
            <span className="absolute rounded-full border border-slate-600/60 bg-slate-950 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-slate-300">
              {pair.strength}/10
            </span>
          </div>
          {miniCard(pair.b, colorB)}
        </div>

        {/* the agent's own explanation for this link — the primary answer to "why?" */}
        {pair.reason && (
          <div className="rounded-lg border border-violet-700/40 bg-violet-950/25 p-3">
            <span className="text-[9px] font-bold uppercase tracking-widest text-violet-300">
              🛰 Why the agent linked these
            </span>
            <p className="mt-1 text-[12px] leading-relaxed text-slate-100">{pair.reason}</p>
          </div>
        )}

        <div>
          <h3 className="text-[13px] font-bold leading-snug text-slate-100">{insight.headline}</h3>
          <p className="mt-1.5 text-[12px] leading-relaxed text-slate-300">{insight.analysis}</p>
        </div>

        <div className="rounded-lg border border-cyan-700/30 bg-cyan-950/20 p-3">
          <span className="text-[9px] font-bold uppercase tracking-widest text-cyan-300">🎬 Suggested move</span>
          <p className="mt-1 text-[12px] leading-relaxed text-slate-200">{insight.creatorMove}</p>
        </div>

        {insight.caution && (
          <div className="rounded-lg border border-amber-700/30 bg-amber-950/20 p-3">
            <span className="text-[9px] font-bold uppercase tracking-widest text-amber-300">⚠ Before you run with it</span>
            <p className="mt-1 text-[12px] leading-relaxed text-amber-100/80">{insight.caution}</p>
          </div>
        )}
      </div>

      <div className="border-t border-slate-700/40 p-3">
        <button
          onClick={() => onBundlePair([pair.a.id, pair.b.id])}
          className="w-full rounded-lg bg-gradient-to-r from-amber-400 to-orange-400 px-3 py-2 text-xs font-bold text-slate-950 transition hover:brightness-110"
        >
          📦 Bundle these two into a story
        </button>
      </div>
    </div>
  );
}

export function BundlePanel({ bundle, onClose }: { bundle: StoryBundle; onClose: () => void }) {
  return (
    <div className="glass-strong absolute left-1/2 top-1/2 z-30 flex max-h-[80%] w-[520px] max-w-[90%] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-700/40 px-4 py-3">
        <h2 className="text-sm font-bold text-slate-100">📦 {bundle.name}</h2>
        <button onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-700/50 hover:text-slate-200" aria-label="Close bundle">
          ✕
        </button>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-4 text-[12px] leading-relaxed text-slate-300">
        <p>{bundle.summary}</p>
        <div>
          <h4 className="mb-1 text-[10px] font-bold uppercase tracking-widest text-cyan-300">Story arc</h4>
          <p>{bundle.story_arc}</p>
        </div>
        <div>
          <h4 className="mb-1 text-[10px] font-bold uppercase tracking-widest text-violet-300">Segment outline</h4>
          <ul className="space-y-1">
            {bundle.segment_outline.map((s, i) => (
              <li key={i}>• {s}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-slate-700/50 bg-slate-900/50 p-3">
          <p>
            <span className="font-bold text-cyan-300">Recommended title:</span> {bundle.recommended_title}
          </p>
          <p className="mt-1">
            <span className="font-bold text-violet-300">Thumbnail idea:</span> {bundle.thumbnail_idea}
          </p>
        </div>
        {bundle.verification_checklist.length > 0 && (
          <div>
            <h4 className="mb-1 text-[10px] font-bold uppercase tracking-widest text-amber-300">
              Verify before filming
            </h4>
            <ul className="space-y-1">
              {bundle.verification_checklist.map((v, i) => (
                <li key={i}>☐ {v}</li>
              ))}
            </ul>
          </div>
        )}
        {bundle.source_urls.length > 0 && (
          <div>
            <h4 className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Sources</h4>
            <ul className="space-y-1">
              {bundle.source_urls.map((u) => (
                <li key={u} className="truncate">
                  <a href={u} target="_blank" rel="noopener noreferrer" className="text-cyan-300 hover:underline">
                    {u}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
