import { type NextRequest } from 'next/server';
import { hasIngestToken, hasSession, unauthorized } from '@/lib/auth';
import { buildBundle, listBundles, saveBundle } from '@/lib/bundle';
import { getEventsByIds } from '@/lib/events';
import { broadcast, log } from '@/lib/sse';
import { BundleRequestSchema } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** GET /api/bundle — all stored bundles. */
export async function GET(req: NextRequest) {
  if (!hasSession(req) && !hasIngestToken(req)) return unauthorized();
  return Response.json({ bundles: listBundles() });
}

/** POST /api/bundle — create a story bundle from selected events. */
export async function POST(req: NextRequest) {
  if (!hasSession(req) && !hasIngestToken(req)) return unauthorized();

  const body = await req.json().catch(() => null);
  const parsed = BundleRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'invalid payload', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const events = getEventsByIds(parsed.data.event_ids);
  if (events.length === 0) {
    return Response.json({ error: 'no matching events for given ids' }, { status: 404 });
  }

  const bundle = buildBundle(events, parsed.data.bundle_name, parsed.data.bundle_goal);
  saveBundle(bundle);
  broadcast({ type: 'bundle', data: bundle });
  log(`Story bundle created: "${bundle.name}" (${events.length} signals).`, 'success');

  return Response.json({ bundle }, { status: 201 });
}
