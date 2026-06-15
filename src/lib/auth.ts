import crypto from 'node:crypto';
import type { NextRequest } from 'next/server';

export const SESSION_COOKIE = 'ase_session';

/**
 * Derived session token: SHA-256 of the app password with a static prefix.
 * The middleware (edge runtime) computes the same value with Web Crypto.
 * The password itself is never stored in the cookie.
 */
export function sessionTokenValue(): string {
  return crypto
    .createHash('sha256')
    .update(`ase-session:${process.env.APP_PASSWORD ?? ''}`)
    .digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/** Valid dashboard session (cookie set by /api/login). */
export function hasSession(req: NextRequest): boolean {
  if (!process.env.APP_PASSWORD) return true; // open mode — dev only, warned in README
  const cookie = req.cookies.get(SESSION_COOKIE)?.value ?? '';
  return cookie !== '' && safeEqual(cookie, sessionTokenValue());
}

/** Valid `Authorization: Bearer <INGEST_TOKEN>` header (used by Hermes). */
export function hasIngestToken(req: NextRequest): boolean {
  const token = process.env.INGEST_TOKEN;
  if (!token) return false;
  const header = req.headers.get('authorization') ?? '';
  return safeEqual(header, `Bearer ${token}`);
}

export function unauthorized(): Response {
  return Response.json({ error: 'unauthorized' }, { status: 401 });
}
