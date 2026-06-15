import { type NextRequest } from 'next/server';
import { hasSession, unauthorized } from '@/lib/auth';
import { startDemoScan } from '@/lib/demo';

export const dynamic = 'force-dynamic';

/** POST /api/demo — kicks off the simulated Hermes scan. */
export async function POST(req: NextRequest) {
  if (!hasSession(req)) return unauthorized();
  if (process.env.DEMO_MODE === 'false') {
    return Response.json({ error: 'Demo mode is disabled (DEMO_MODE=false).' }, { status: 403 });
  }
  const started = startDemoScan();
  return Response.json({ started, message: started ? 'Demo scan started.' : 'A scan is already running.' });
}
