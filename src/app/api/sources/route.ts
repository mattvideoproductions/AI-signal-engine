import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { hasSession, unauthorized } from '@/lib/auth';
import { addSource, listSources, removeSource } from '@/lib/settings';

export const dynamic = 'force-dynamic';

const AddSourceSchema = z.object({
  name: z.string().default(''),
  url: z.string().url(),
});

export async function GET(req: NextRequest) {
  if (!hasSession(req)) return unauthorized();
  return Response.json({ sources: listSources() });
}

export async function POST(req: NextRequest) {
  if (!hasSession(req)) return unauthorized();
  const body = await req.json().catch(() => null);
  const parsed = AddSourceSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'invalid payload — url must be a valid URL' }, { status: 400 });
  }
  const source = addSource(parsed.data.name, parsed.data.url);
  return Response.json({ source }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  if (!hasSession(req)) return unauthorized();
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return Response.json({ error: 'missing id' }, { status: 400 });
  removeSource(id);
  return Response.json({ ok: true });
}
