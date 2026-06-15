import { DEMO_EVENTS, HISTORY_EVENTS } from './demo-data';
import { insertEvent, listEvents } from './events';
import { broadcast, log, setStatus } from './sse';
import { EventPayloadSchema } from './types';

const g = globalThis as unknown as { __aseDemoRunning?: boolean };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const INTERSTITIALS = [
  'Cross-referencing entities against the board…',
  'Scoring novelty and viewer interest…',
  'Checking source reliability heuristics…',
  'Tracing relationship threads…',
  'Flagging claims that need verification…',
];

/**
 * Simulates Hermes performing a live scan: 10 events drip in over ~25-40s,
 * each persisted and broadcast exactly like a real ingest. Returns false if
 * a demo is already running.
 */
export function startDemoScan(): boolean {
  if (g.__aseDemoRunning) return false;
  g.__aseDemoRunning = true;

  void (async () => {
    try {
      setStatus('scanning');
      log('🎛 Creator directive: "Scan today\'s AI landscape and build me a creator map."');
      await sleep(600);
      log('Hermes demo scan initiated — connecting to agent…');
      await sleep(900);

      // Backfill the archive (previous scan days) so the Day Rail has
      // history to explore. Backdated via retrieved_at; runs once.
      const existingTitles = new Set(listEvents().map((e) => e.title));
      let restored = 0;
      for (const h of HISTORY_EVENTS) {
        const payload = EventPayloadSchema.parse(h.payload);
        if (existingTitles.has(payload.title)) continue;
        const when = new Date(
          Date.now() - h.offsetDays * 86_400_000 - Math.floor(Math.random() * 6) * 3_600_000,
        );
        const stored = insertEvent(payload, 'live', when.toISOString());
        broadcast({ type: 'event', data: stored });
        restored++;
        await sleep(220);
      }
      if (restored > 0) {
        log(`Archive restored: ${restored} signals from the previous 3 scan days.`, 'success');
        await sleep(700);
      }

      log('Hermes: scanning 14 sources (blogs, changelogs, GitHub releases, papers)…');

      for (let i = 0; i < DEMO_EVENTS.length; i++) {
        await sleep(1800 + Math.random() * 2100);
        if (Math.random() < 0.45) {
          log(`Hermes: ${INTERSTITIALS[i % INTERSTITIALS.length]}`);
          await sleep(500 + Math.random() * 700);
        }
        const stored = insertEvent(EventPayloadSchema.parse(DEMO_EVENTS[i]));
        broadcast({ type: 'event', data: stored });
        const flags =
          stored.verification_needed.length + stored.claims_to_verify.length;
        log(
          `Signal captured: "${stored.title}" [${stored.category}, ${stored.confidence} confidence${
            flags > 0 ? `, ${flags} verification flag(s)` : ''
          }]`,
          stored.risk_score >= 7 ? 'warn' : 'success',
        );
      }

      setStatus('bundling');
      log('Hermes: clustering related signals into story threads…');
      await sleep(2400);
      setStatus('ready');
      log(
        `Scan complete — ${DEMO_EVENTS.length} signals on the board. Ready to generate a creator brief.`,
        'success',
      );
    } catch (err) {
      log(`Demo scan error: ${err instanceof Error ? err.message : 'unknown'}`, 'warn');
      setStatus('idle');
    } finally {
      g.__aseDemoRunning = false;
    }
  })();

  return true;
}
