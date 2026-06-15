import { type NextRequest } from 'next/server';
import { hasIngestToken, hasSession, unauthorized } from '@/lib/auth';
import { clearEvents, deleteEvent, insertEvent, listEvents } from '@/lib/events';
import { addIgnoredTopic, getConfig } from '@/lib/settings';
import { broadcast, log, setStatus } from '@/lib/sse';
import { IngestSchema } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** GET /api/events — all stored events (dashboard session or bearer token). */
export async function GET(req: NextRequest) {
  if (!hasSession(req) && !hasIngestToken(req)) return unauthorized();
  return Response.json({ events: listEvents() });
}

/** Case-insensitive overlap between an incoming signal and an ignored topic. */
function matchIgnoredTopic(title: string, entities: string[]): string | null {
  const topics = getConfig().ignoredTopics;
  const t = title.toLowerCase();
  const ents = entities.map((e) => e.toLowerCase());
  return (
    topics.find((topic) => {
      const k = topic.toLowerCase();
      return t.includes(k) || k.includes(t) || ents.some((e) => e.includes(k) || k.includes(e));
    }) ?? null
  );
}

/**
 * POST /api/events — ingest one event from Hermes (or any client holding the
 * bearer token). Persists to the local data file and broadcasts to live dashboards.
 * Signals matching an ignored topic are acknowledged (202) but not stored.
 * Optional `retrieved_at` lets Hermes backfill the day a signal was found.
 */
export async function POST(req: NextRequest) {
  if (!hasIngestToken(req) && !hasSession(req)) return unauthorized();

  const body = await req.json().catch(() => null);
  const parsed = IngestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'invalid payload', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { retrieved_at, ...payload } = parsed.data;

  const ignoredAs = matchIgnoredTopic(payload.title, payload.related_entities);
  if (ignoredAs) {
    log(`Signal skipped — topic is on the ignore list ("${ignoredAs}"): ${payload.title}`);
    return Response.json({ ignored: true, topic: ignoredAs }, { status: 202 });
  }

  const stored = insertEvent(payload, 'live', retrieved_at);
  broadcast({ type: 'event', data: stored });
  const flags = stored.verification_needed.length + stored.claims_to_verify.length;
  log(
    `Signal captured: "${stored.title}" [${stored.category}, ${stored.confidence} confidence${
      flags > 0 ? `, ${flags} verification flag(s)` : ''
    }]`,
    stored.risk_score >= 7 ? 'warn' : 'success',
  );

  return Response.json({ event: stored }, { status: 201 });
}

/**
 * DELETE /api/events            — clears the whole board.
 * DELETE /api/events?id=X       — removes a single event.
 * DELETE /api/events?id=X&ignore=1 — removes it AND adds the topic to the
 * ignore list (enforced at ingest + injected into the Hermes prompt).
 */
export async function DELETE(req: NextRequest) {
  if (!hasSession(req) && !hasIngestToken(req)) return unauthorized();

  const id = req.nextUrl.searchParams.get('id');
  if (id) {
    const removed = deleteEvent(id);
    if (!removed) return Response.json({ error: 'event not found' }, { status: 404 });
    if (req.nextUrl.searchParams.get('ignore') === '1') {
      addIgnoredTopic(removed.title);
      log(
        `Topic ignored: "${removed.title}" — Hermes will be instructed to skip it, and matching signals are rejected at ingest.`,
        'warn',
      );
    } else {
      log(`Node removed from board: "${removed.title}"`);
    }
    broadcast({ type: 'remove', data: { id } });
    return Response.json({ ok: true, removed: removed.id });
  }

  clearEvents();
  broadcast({ type: 'clear', data: null });
  setStatus('idle');
  log('Board cleared — all events and bundles removed.');
  return Response.json({ ok: true });
}
