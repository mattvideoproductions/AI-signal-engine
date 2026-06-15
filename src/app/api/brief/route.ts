import { type NextRequest } from 'next/server';
import { hasIngestToken, hasSession, unauthorized } from '@/lib/auth';
import { generateBrief, getLatestBrief, saveBrief } from '@/lib/brief';
import { listBundles } from '@/lib/bundle';
import { listEvents } from '@/lib/events';
import { getConfig } from '@/lib/settings';
import { log, setStatus } from '@/lib/sse';

export const dynamic = 'force-dynamic';

/** GET /api/brief — latest stored brief (or null). */
export async function GET(req: NextRequest) {
  if (!hasSession(req) && !hasIngestToken(req)) return unauthorized();
  return Response.json({ brief: getLatestBrief() });
}

/**
 * POST /api/brief — generates and stores a fresh creator brief from current
 * events and bundles. v1 uses deterministic local logic (see src/lib/brief.ts);
 * swap in an LLM there later if a key is configured.
 */
export async function POST(req: NextRequest) {
  if (!hasSession(req) && !hasIngestToken(req)) return unauthorized();

  const brief = generateBrief(listEvents(), listBundles(), getConfig());
  saveBrief(brief);
  setStatus('ready');
  log('Creator brief generated.', 'success');

  return Response.json({ brief }, { status: 201 });
}
