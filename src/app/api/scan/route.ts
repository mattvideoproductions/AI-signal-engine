import { type NextRequest } from 'next/server';
import { hasSession, unauthorized } from '@/lib/auth';
import { scanSources } from '@/lib/scanner';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** POST /api/scan — fetch configured RSS/page sources and create draft events. */
export async function POST(req: NextRequest) {
  if (!hasSession(req)) return unauthorized();
  const result = await scanSources();
  return Response.json(result);
}
