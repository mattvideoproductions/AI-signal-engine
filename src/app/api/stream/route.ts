import { type NextRequest } from 'next/server';
import { hasSession, unauthorized } from '@/lib/auth';
import { addClient, getLogs, getStatus, removeClient } from '@/lib/sse';

export const dynamic = 'force-dynamic';

/** GET /api/stream — Server-Sent Events feed for live dashboard updates. */
export async function GET(req: NextRequest) {
  if (!hasSession(req)) return unauthorized();

  const encoder = new TextEncoder();
  let clientId = 0;
  let ping: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const send = (chunk: string) => controller.enqueue(encoder.encode(chunk));
      clientId = addClient(send);

      // Initial snapshot: current agent status + recent log history.
      send(
        `data: ${JSON.stringify({
          type: 'hello',
          data: { status: getStatus(), logs: getLogs().slice(-50) },
        })}\n\n`,
      );

      ping = setInterval(() => {
        try {
          send(':ping\n\n');
        } catch {
          /* closed */
        }
      }, 25_000);

      req.signal.addEventListener('abort', () => {
        if (ping) clearInterval(ping);
        removeClient(clientId);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      if (ping) clearInterval(ping);
      removeClient(clientId);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
