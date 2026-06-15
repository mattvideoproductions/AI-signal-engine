import crypto from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, sessionTokenValue } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { password?: string };
  const expected = process.env.APP_PASSWORD;

  if (!expected) {
    // Open mode: no password configured. The middleware lets everything
    // through anyway; this keeps the login form functional in dev.
    return NextResponse.json({ ok: true });
  }

  const given = Buffer.from(String(body.password ?? ''));
  const want = Buffer.from(expected);
  const ok = given.length === want.length && crypto.timingSafeEqual(given, want);

  if (!ok) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, sessionTokenValue(), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: req.nextUrl.protocol === 'https:',
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
