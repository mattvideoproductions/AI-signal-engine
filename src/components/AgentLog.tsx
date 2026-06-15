'use client';

import { useEffect, useRef } from 'react';
import type { LogEntry } from '@/lib/types';

const LEVEL_COLORS: Record<LogEntry['level'], string> = {
  info: 'text-slate-400',
  success: 'text-emerald-400',
  warn: 'text-amber-400',
};

export default function AgentLog({ logs }: { logs: LogEntry[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' });
  }, [logs.length]);

  return (
    <div className="glass flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-slate-700/40 px-3 py-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-accent-green animate-pulse-dot" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Agent Log</span>
        <span className="ml-auto font-mono text-[10px] text-slate-600">{logs.length} entries</span>
      </div>
      <div ref={ref} className="flex-1 overflow-y-auto px-3 py-2 font-mono text-[11px] leading-relaxed">
        {logs.length === 0 && (
          <p className="text-slate-600">// awaiting agent activity — start a demo scan or send an event</p>
        )}
        {logs.map((entry, i) => (
          <div key={`${entry.ts}-${i}`} className="flex gap-2">
            <span className="shrink-0 text-slate-600">
              {new Date(entry.ts).toLocaleTimeString([], { hour12: false })}
            </span>
            <span className={LEVEL_COLORS[entry.level]}>{entry.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
