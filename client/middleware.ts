import { NextRequest, NextResponse } from 'next/server';

const SESSION_SECRET = process.env.SESSION_SECRET || '';

/** Convert a hex string to Uint8Array */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/** Convert ArrayBuffer to hex string */
function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Base64url decode (Edge-compatible, no Buffer) */
function base64urlDecode(str: string): string {
  // Restore standard base64
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  // Decode via atob (available in Edge runtime)
  return atob(b64);
}

async function verifySessionToken(token: string): Promise<boolean> {
  if (!SESSION_SECRET) return false;
  try {
    const [payloadB64, hmac] = token.split('.');
    if (!payloadB64 || !hmac) return false;

    const payload = base64urlDecode(payloadB64);

    // Import key for HMAC-SHA256
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(SESSION_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );

    // Compute HMAC
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
    const expectedHmac = bufferToHex(signature);

    if (hmac !== expectedHmac) return false;

    const data = JSON.parse(payload);
    return data.exp > Date.now();
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow login page, login API, static files, and OAuth callback
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

  // Check session cookie
  const session = request.cookies.get('cdp_session')?.value;
  if (session && (await verifySessionToken(session))) {
    return NextResponse.next();
  }

  // Redirect to login
  const loginUrl = new URL('/login', request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
