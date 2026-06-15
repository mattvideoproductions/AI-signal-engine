'use client';

import { useMemo } from 'react';
import {
  CATEGORIES,
  CATEGORY_ICONS,
  localDayKey,
  type Category,
  type SignalEvent,
} from '@/lib/types';

interface DayStats {
  day: string; // YYYY-MM-DD local
  date: Date;
  total: number;
  topSectors: { category: Category; count: number }[];
  dominant: Category;
}

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function buildDays(events: SignalEvent[]): DayStats[] {
  const groups = new Map<string, SignalEvent[]>();
  for (const e of events) {
    const key = localDayKey(e.created_at);
    const group = groups.get(key) ?? [];
    group.push(e);
    groups.set(key, group);
  }
  const days: DayStats[] = [];
  for (const [day, group] of groups) {
    const counts = new Map<Category, number>();
    for (const e of group) counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    days.push({
      day,
      date: new Date(`${day}T12:00:00`),
      total: group.length,
      topSectors: sorted.slice(0, 3).map(([category, count]) => ({ category, count })),
      dominant: sorted[0][0],
    });
  }
  return days.sort((a, b) => b.day.localeCompare(a.day));
}

/**
 * Vertical time-travel rail: one tile per retrieval day, showing the sectors
 * most hit that day. Click a tile to filter the entire board to that day.
 */
export default function DayRail({
  events,
  activeDay,
  onSelect,
}: {
  events: SignalEvent[];
  activeDay: string | null;
  onSelect: (day: string | null) => void;
}) {
  const days = useMemo(() => buildDays(events), [events]);
  const todayKey = localDayKey(new Date().toISOString());

  return (
    <aside className="glass flex w-[88px] shrink-0 flex-col overflow-hidden">
      <div className="border-b border-slate-700/40 px-2 py-2 text-center">
        <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400">Scan Days</span>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {/* ALL tile */}
        <button
          onClick={() => onSelect(null)}
          className={`day-tile w-full rounded-xl border p-2 text-center transition ${
            activeDay === null
              ? 'border-cyan-400/70 bg-cyan-400/10 shadow-[0_0_18px_rgba(34,211,238,0.35)]'
              : 'border-slate-700/50 bg-slate-900/50 hover:border-slate-500/60 hover:bg-slate-800/60'
          }`}
        >
          <div className="text-lg leading-none">🌌</div>
          <div className={`mt-1 text-[10px] font-bold tracking-widest ${activeDay === null ? 'text-cyan-300' : 'text-slate-300'}`}>
            ALL
          </div>
          <div className="text-[9px] text-slate-500">{events.length} signals</div>
        </button>

        {days.length === 0 && (
          <p className="px-1 pt-3 text-center text-[9px] leading-relaxed text-slate-600">
            Days appear here as Hermes retrieves signals
          </p>
        )}

        {days.map((d, i) => {
          const active = activeDay === d.day;
          const domColor = CATEGORIES[d.dominant].color;
          const isToday = d.day === todayKey;
          return (
            <button
              key={d.day}
              onClick={() => onSelect(active ? null : d.day)}
              className={`day-tile relative w-full overflow-hidden rounded-xl border p-2 text-center transition ${
                active
                  ? 'bg-slate-900/80'
                  : 'border-slate-700/50 bg-slate-900/50 hover:border-slate-500/60 hover:bg-slate-800/60'
              }`}
              style={{
                animationDelay: `${i * 60}ms`,
                ...(active
                  ? { borderColor: `${domColor}aa`, boxShadow: `0 0 18px ${domColor}50` }
                  : {}),
              }}
              title={`${d.total} signal(s) retrieved — top sector: ${CATEGORIES[d.dominant].label}`}
            >
              {/* dominant-sector watermark */}
              <span className="pointer-events-none absolute -right-1 -top-1 text-2xl opacity-15">
                {CATEGORY_ICONS[d.dominant]}
              </span>

              <div className="text-[8px] font-bold tracking-[0.2em]" style={{ color: active ? domColor : '#64748b' }}>
                {isToday ? 'TODAY' : WEEKDAYS[d.date.getDay()]}
              </div>
              <div className={`text-xl font-bold leading-tight ${active ? 'text-slate-50' : 'text-slate-200'}`}>
                {d.date.getDate()}
              </div>
              <div className="text-[8px] tracking-widest text-slate-500">{MONTHS[d.date.getMonth()]}</div>

              {/* top sectors hit that day */}
              <div className="mt-1.5 flex items-center justify-center gap-1">
                {d.topSectors.map(({ category, count }) => (
                  <span
                    key={category}
                    className="flex items-center gap-px rounded px-1 py-px text-[8px] font-bold"
                    style={{ color: CATEGORIES[category].color, background: `${CATEGORIES[category].color}1a` }}
                    title={`${CATEGORIES[category].label}: ${count}`}
                  >
                    {CATEGORY_ICONS[category]}
                    {count}
                  </span>
                ))}
              </div>

              {/* signal volume bar */}
              <div className="mt-1.5 h-0.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${Math.min(100, d.total * 10)}%`,
                    background: domColor,
                    boxShadow: `0 0 6px ${domColor}`,
                  }}
                />
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
