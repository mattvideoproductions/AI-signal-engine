import { type NextRequest } from 'next/server';
import { hasIngestToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/ingest/check - verifies only the Hermes bearer token.
 * Dashboard login cookies are deliberately ignored so this cannot give a false
 * pass when the browser is logged in but the ingest token is wrong.
 */
export async function GET(req: NextRequest) {
  if (!process.env.INGEST_TOKEN) {
    return Response.json({ ok: false, error: 'INGEST_TOKEN is not configured' }, { status: 503 });
  }

  if (!hasIngestToken(req)) {
    const header = req.headers.get('authorization') ?? '';
    return Response.json(
      {
        ok: false,
        error: 'invalid ingest token',
        hint: 'Use Authorization: Bearer <INGEST_TOKEN>, not the dashboard password.',
        auth_header_present: header.length > 0,
        auth_header_prefix: header ? header.slice(0, 16) : '',
      },
      { status: 401 },
    );
  }

  return Response.json({ ok: true, ingest: 'ready' });
}
