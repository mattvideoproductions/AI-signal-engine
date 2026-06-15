'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { briefToMarkdown } from '@/lib/markdown';
import {
  CATEGORIES,
  FILTER_CATEGORIES,
  localDayKey,
  type AgentStatus,
  type Category,
  type CreatorBrief,
  type LogEntry,
  type SignalEvent,
  type StoryBundle,
  type StreamMessage,
} from '@/lib/types';
import AgentLog from './AgentLog';
import DayRail from './DayRail';
import GraphCanvas, { type EdgePair } from './GraphCanvas';
import { BundlePanel, ConnectionInsightPanel, Inspector } from './Inspector';
import StoryCard from './StoryCard';

const STATUS_META: Record<AgentStatus, { label: string; color: string; pulse: boolean }> = {
  idle: { label: 'Idle', color: '#94a3b8', pulse: false },
  scanning: { label: 'Scanning', color: '#22d3ee', pulse: true },
  bundling: { label: 'Bundling', color: '#a78bfa', pulse: true },
  ready: { label: 'Ready', color: '#34d399', pulse: false },
};

function downloadMarkdown(brief: CreatorBrief) {
  const blob = new Blob([briefToMarkdown(brief)], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `creator-brief-${brief.generated_at.slice(0, 10)}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Dashboard() {
  const router = useRouter();
  const [events, setEvents] = useState<SignalEvent[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState<AgentStatus>('idle');
  const [filters, setFilters] = useState<Category[]>([]);
  const [search, setSearch] = useState('');
  const [activeDay, setActiveDay] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [inspected, setInspected] = useState<SignalEvent | null>(null);
  const [shownBundle, setShownBundle] = useState<StoryBundle | null>(null);
  const [edgePair, setEdgePair] = useState<EdgePair | null>(null);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [showEntities, setShowEntities] = useState(true);
  const [layoutVersion, setLayoutVersion] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  // Collapsible chrome — hide any panel for a full-map view. Persisted locally.
  const [showRail, setShowRail] = useState(true);
  const [showFeed, setShowFeed] = useState(true);
  const [showLog, setShowLog] = useState(true);
  const timersRef = useRef<number[]>([]);

  function togglePanel(key: 'rail' | 'feed' | 'log') {
    const setters = { rail: setShowRail, feed: setShowFeed, log: setShowLog } as const;
    setters[key]((v) => {
      window.localStorage.setItem(`ase_panel_${key}`, String(!v));
      return !v;
    });
  }

  const markNew = useCallback((id: string) => {
    setNewIds((prev) => new Set(prev).add(id));
    const t = window.setTimeout(() => {
      setNewIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 7000);
    timersRef.current.push(t);
  }, []);

  // Initial load + live SSE subscription.
  useEffect(() => {
    let cancelled = false;

    // restore panel visibility (default: everything shown)
    setShowRail(window.localStorage.getItem('ase_panel_rail') !== 'false');
    setShowFeed(window.localStorage.getItem('ase_panel_feed') !== 'false');
    setShowLog(window.localStorage.getItem('ase_panel_log') !== 'false');

    fetch('/api/events')
      .then((r) => (r.ok ? r.json() : { events: [] }))
      .then((d: { events: SignalEvent[] }) => {
        if (!cancelled) setEvents(d.events ?? []);
      })
      .catch(() => undefined);

    fetch('/api/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.config) setShowEntities(Boolean(d.config.showEntities));
      })
      .catch(() => undefined);

    const es = new EventSource('/api/stream');
    es.onmessage = (m) => {
      let msg: StreamMessage;
      try {
        msg = JSON.parse(m.data) as StreamMessage;
      } catch {
        return;
      }
      switch (msg.type) {
        case 'hello':
          setStatus(msg.data.status);
          setLogs(msg.data.logs);
          break;
        case 'event':
          setEvents((prev) => (prev.some((e) => e.id === msg.data.id) ? prev : [...prev, msg.data]));
          markNew(msg.data.id);
          break;
        case 'status':
          setStatus(msg.data);
          break;
        case 'log':
          setLogs((prev) => [...prev.slice(-199), msg.data]);
          break;
        case 'bundle':
          setShownBundle(msg.data);
          break;
        case 'remove':
          setEvents((prev) => prev.filter((e) => e.id !== msg.data.id));
          setSelectedIds((prev) => prev.filter((id) => id !== msg.data.id));
          setInspected((prev) => (prev?.id === msg.data.id ? null : prev));
          setEdgePair((prev) =>
            prev && (prev.a.id === msg.data.id || prev.b.id === msg.data.id) ? null : prev,
          );
          break;
        case 'clear':
          setEvents([]);
          setSelectedIds([]);
          setInspected(null);
          setShownBundle(null);
          setEdgePair(null);
          setActiveDay(null);
          break;
      }
    };

    const timers = timersRef.current;
    return () => {
      cancelled = true;
      es.close();
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [markNew]);

  // ---- actions --------------------------------------------------------------

  async function startDemo() {
    setBusy('demo');
    setActiveDay(null);
    try {
      await fetch('/api/demo', { method: 'POST' });
    } finally {
      setBusy(null);
    }
  }

  async function clearBoard() {
    if (!window.confirm('Clear all events and bundles from the board?')) return;
    setBusy('clear');
    try {
      await fetch('/api/events', { method: 'DELETE' });
    } finally {
      setBusy(null);
    }
  }

  async function generateBrief() {
    setBusy('brief');
    try {
      const res = await fetch('/api/brief', { method: 'POST' });
      if (res.ok) router.push('/brief');
    } finally {
      setBusy(null);
    }
  }

  async function exportBrief() {
    setBusy('export');
    try {
      const res = await fetch('/api/brief', { method: 'POST' });
      if (res.ok) {
        const { brief } = (await res.json()) as { brief: CreatorBrief };
        downloadMarkdown(brief);
      }
    } finally {
      setBusy(null);
    }
  }

  const bundleByIds = useCallback(async (ids: string[]) => {
    const storyIds = ids.filter((id) => !id.startsWith('ent:'));
    if (storyIds.length === 0) return;
    setBusy('bundle');
    try {
      const res = await fetch('/api/bundle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_ids: storyIds, bundle_name: '', bundle_goal: '' }),
      });
      if (res.ok) {
        const { bundle } = (await res.json()) as { bundle: StoryBundle };
        setEdgePair(null);
        setShownBundle(bundle);
        setSelectedIds([]);
      }
    } finally {
      setBusy(null);
    }
  }, []);

  const removeEvent = useCallback(async (id: string, ignoreTopic: boolean) => {
    await fetch(`/api/events?id=${encodeURIComponent(id)}${ignoreTopic ? '&ignore=1' : ''}`, {
      method: 'DELETE',
    });
    // SSE 'remove' broadcast updates local state for all clients.
  }, []);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleFilter(cat: Category) {
    setFilters((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));
  }

  // ---- derived --------------------------------------------------------------

  /** Day Rail time-travel: scope the whole board to one retrieval day. */
  const dayEvents = useMemo(
    () => (activeDay ? events.filter((e) => localDayKey(e.created_at) === activeDay) : events),
    [events, activeDay],
  );

  const visibleCards = useMemo(() => {
    let list = filters.length === 0 ? dayEvents : dayEvents.filter((e) => filters.includes(e.category));
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((e) =>
        `${e.title} ${e.summary} ${e.source_name} ${e.related_entities.join(' ')}`.toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [dayEvents, filters, search]);

  const selectedStoryCount = selectedIds.filter((id) => !id.startsWith('ent:')).length;
  const statusMeta = STATUS_META[status];
  const dayLabel = activeDay
    ? new Date(`${activeDay}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : null;

  const btn =
    'rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <main className="flex h-screen flex-col gap-3 overflow-hidden p-3">
      {/* ---- header ---- */}
      <header className="glass flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
        <div className="mr-2 flex items-center gap-3">
          <span className="wordmark-sigil" aria-hidden>
            ◉
          </span>
          <div>
            <h1 className="wordmark text-lg font-extrabold leading-tight">AI Signal Engine</h1>
            <p className="text-[9px] uppercase tracking-[0.32em] text-slate-500">
              Agent-powered signal intelligence map
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-slate-700/50 bg-slate-900/60 px-3 py-1">
          <span
            className={`h-2 w-2 rounded-full ${statusMeta.pulse ? 'animate-pulse-dot' : ''}`}
            style={{ background: statusMeta.color, boxShadow: `0 0 8px ${statusMeta.color}` }}
          />
          <span className="text-[11px] font-semibold" style={{ color: statusMeta.color }}>
            {statusMeta.label}
          </span>
          <span className="text-[10px] text-slate-600">
            · {dayEvents.length} signals{dayLabel ? ` · ${dayLabel}` : ''}
          </span>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button onClick={startDemo} disabled={busy !== null || status === 'scanning'} className={`${btn} console-btn console-btn-cyan`}>
            ▶ Demo Scan
          </button>
          <button onClick={generateBrief} disabled={busy !== null || events.length === 0} className={`${btn} console-btn console-btn-violet`}>
            ✦ Generate Brief
          </button>
          <button onClick={exportBrief} disabled={busy !== null || events.length === 0} className={`${btn} console-btn console-btn-slate`}>
            ↓ Export
          </button>
          <button onClick={clearBoard} disabled={busy !== null} className={`${btn} console-btn console-btn-rose`}>
            ✕ Clear
          </button>
          <nav className="ml-1 flex items-center gap-1 border-l border-slate-700/50 pl-3 text-xs">
            <Link href="/brief" className="rounded px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100">
              Brief
            </Link>
            <Link href="/settings" className="rounded px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100">
              Settings
            </Link>
          </nav>
        </div>
      </header>

      {/* ---- filters + search ---- */}
      <div className="flex flex-wrap items-center gap-2 px-1">
        {FILTER_CATEGORIES.map((cat) => {
          const meta = CATEGORIES[cat];
          const active = filters.includes(cat);
          return (
            <button
              key={cat}
              onClick={() => toggleFilter(cat)}
              className="rounded-full border px-3 py-1 text-[11px] font-semibold transition"
              style={
                active
                  ? { color: '#04060e', background: meta.color, borderColor: meta.color, boxShadow: `0 0 12px ${meta.color}80` }
                  : { color: meta.color, background: `${meta.color}10`, borderColor: `${meta.color}40` }
              }
            >
              {meta.label}
            </button>
          );
        })}
        {(filters.length > 0 || activeDay) && (
          <button
            onClick={() => {
              setFilters([]);
              setActiveDay(null);
            }}
            className="rounded-full px-2 py-1 text-[11px] text-slate-400 hover:text-slate-200"
          >
            clear filters
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search nodes…"
            className="w-52 rounded-lg border border-slate-700/60 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-200 outline-none transition focus:border-cyan-400/50"
          />
          <button
            onClick={() => setShowEntities((v) => !v)}
            className={`${btn} border ${showEntities ? 'border-violet-500/50 bg-violet-500/10 text-violet-300' : 'border-slate-700/60 bg-slate-900/60 text-slate-500'}`}
            title="Toggle entity nodes"
          >
            ◇ Entities
          </button>
          <button onClick={() => setLayoutVersion((v) => v + 1)} className={`${btn} border border-slate-700/60 bg-slate-900/60 text-slate-300 hover:bg-slate-800`}>
            ⟳ Reset Layout
          </button>

          {/* panel visibility — collapse chrome for a full-map view */}
          <div className="flex items-center gap-1 rounded-lg border border-slate-700/60 bg-slate-900/60 p-0.5" title="Show/hide panels">
            {(
              [
                ['rail', showRail, '🗓', 'Days rail'],
                ['feed', showFeed, '📰', 'Signal feed'],
                ['log', showLog, '📜', 'Agent log'],
              ] as const
            ).map(([key, on, icon, label]) => (
              <button
                key={key}
                onClick={() => togglePanel(key)}
                className={`rounded px-2 py-1 text-[11px] transition ${
                  on ? 'bg-slate-700/70 text-slate-200' : 'text-slate-600 hover:text-slate-400'
                }`}
                title={`${on ? 'Hide' : 'Show'} ${label}`}
              >
                {icon}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ---- main area ---- */}
      <div className="flex min-h-0 flex-1 gap-3">
        {/* day rail: time-travel through retrieval days */}
        {showRail && <DayRail events={events} activeDay={activeDay} onSelect={setActiveDay} />}

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="glass relative min-h-0 flex-1 overflow-hidden">
            <GraphCanvas
              events={dayEvents}
              filters={filters}
              search={search}
              newIds={newIds}
              selectedIds={selectedIds}
              showEntities={showEntities}
              layoutVersion={layoutVersion}
              onSelectionChange={setSelectedIds}
              onInspect={setInspected}
              onEdgeInspect={(pair) => {
                setInspected(null);
                setEdgePair(pair);
              }}
            />

            {/* radar sweep while Hermes scans */}
            {status === 'scanning' && (
              <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="scan-sweep" />
              </div>
            )}

            {dayEvents.length === 0 && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-sm text-slate-500">
                    {activeDay ? 'No signals charted for this day.' : 'The board is quiet.'}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    {activeDay ? (
                      'Pick another day on the rail, or jump back to ALL.'
                    ) : (
                      <>
                        Hit <span className="text-cyan-400">▶ Start Demo Scan</span> or point Hermes at{' '}
                        <code className="text-violet-300">/api/events</code>
                      </>
                    )}
                  </p>
                </div>
              </div>
            )}

            {inspected && (
              <Inspector
                event={inspected}
                selected={selectedIds.includes(inspected.id)}
                onClose={() => setInspected(null)}
                onToggleSelect={() => toggleSelect(inspected.id)}
                onRemove={(ignoreTopic) => removeEvent(inspected.id, ignoreTopic)}
              />
            )}
            {shownBundle && <BundlePanel bundle={shownBundle} onClose={() => setShownBundle(null)} />}
            {edgePair && (
              <ConnectionInsightPanel
                pair={edgePair}
                onClose={() => setEdgePair(null)}
                onBundlePair={bundleByIds}
                onInspect={(event) => {
                  setEdgePair(null);
                  setInspected(event);
                }}
              />
            )}

            {selectedStoryCount >= 2 && (
              <div className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2">
                <button
                  onClick={() => bundleByIds(selectedIds)}
                  disabled={busy !== null}
                  className="rounded-full bg-gradient-to-r from-amber-400 to-orange-400 px-5 py-2 text-xs font-bold text-slate-950 shadow-[0_0_24px_rgba(251,191,36,0.45)] transition hover:brightness-110"
                >
                  📦 Bundle {selectedStoryCount} Selected
                </button>
              </div>
            )}

            <p className="pointer-events-none absolute right-3 top-3 z-10 text-[10px] text-slate-600">
              click a thread for insight · shift+drag to multi-select · scroll to zoom
            </p>
          </div>

          {showLog && (
            <div className="h-40 shrink-0">
              <AgentLog logs={logs} />
            </div>
          )}
        </div>

        {/* ---- side panel: story cards ---- */}
        {showFeed && (
        <aside className="glass flex w-[360px] shrink-0 flex-col overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-700/40 px-3 py-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Signal Feed{dayLabel ? ` · ${dayLabel}` : ''}
            </span>
            <span className="ml-auto rounded-full bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-slate-400">
              {visibleCards.length}
            </span>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-2.5">
            {visibleCards.length === 0 && (
              <p className="px-2 py-6 text-center text-xs text-slate-600">No signals match the current view.</p>
            )}
            {visibleCards.map((event) => (
              <StoryCard
                key={event.id}
                event={event}
                isNew={newIds.has(event.id)}
                selected={selectedIds.includes(event.id)}
                onInspect={() => setInspected(event)}
                onToggleSelect={() => toggleSelect(event.id)}
                onRemove={() => removeEvent(event.id, false)}
              />
            ))}
          </div>
        </aside>
        )}
      </div>
    </main>
  );
}
