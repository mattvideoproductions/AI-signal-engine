import { NextResponse, type NextRequest } from 'next/server';

/**
 * Password gate for every page. API routes enforce their own auth
 * (session cookie or bearer token) in src/lib/auth.ts.
 *
 * The cookie holds a derived token (SHA-256 of the password with a static
 * prefix) - never the password itself. Computed here with Web Crypto because
 * proxy runs on the edge runtime.
 */
async function sessionToken(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`ase-session:${secret}`),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function proxy(req: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next(); // open mode - dev only

  const cookie = req.cookies.get('ase_session')?.value;
  if (cookie && cookie === (await sessionToken(password))) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except API routes, Next internals, the login page, and static files.
  matcher: ['/((?!api/|_next/|login|favicon.ico|.*\\.).*)'],
};
