import { NextRequest, NextResponse } from 'next/server';

/** Base64url decode (Edge-compatible, no Buffer) */
function base64urlDecode(str: string): string {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return atob(b64);
}

function isValidSession(token: string): boolean {
  try {
    const [payloadB64, hmac] = token.split('.');
    if (!payloadB64 || !hmac) return false;

    const payload = base64urlDecode(payloadB64);
    const data = JSON.parse(payload);

    // Check required fields and expiry
    return !!(data.username && data.exp && data.exp > Date.now());
  } catch {
    return false;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow login page, auth API, static files, and OAuth callback
  if (
    pathname === '/login' ||
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/auth/callback') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/icons') ||
    pathname === '/manifest.json' ||
    pathname === '/favicon.ico' ||
    pathname === '/sw.js'
  ) {
    return NextResponse.next();
  }

  // Check session cookie (httpOnly + secure + sameSite protects against theft/CSRF)
  const session = request.cookies.get('cdp_session')?.value;
  if (session && isValidSession(session)) {
    return NextResponse.next();
  }

  // Redirect to login
  const loginUrl = new URL('/login', request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
