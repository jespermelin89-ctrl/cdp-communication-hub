import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function createSessionToken(username: string): string {
  const payload = JSON.stringify({ username, exp: Date.now() + 30 * 24 * 60 * 60 * 1000 }); // 30 days
  const hmac = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  return Buffer.from(payload).toString('base64url') + '.' + hmac;
}

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ error: 'Ogiltigt anrop' }, { status: 400 });
    }

    // Verify credentials via backend (checks DB hash first, falls back to env var)
    const verifyRes = await fetch(`${BACKEND_URL}/api/v1/auth/admin/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (!verifyRes.ok) {
      const err = await verifyRes.json().catch(() => ({}));
      return NextResponse.json(
        { error: err.error || 'Fel användarnamn eller lösenord' },
        { status: verifyRes.status }
      );
    }

    // Credentials valid — issue session cookie
    const token = createSessionToken(username);
    const response = NextResponse.json({ ok: true });
    response.cookies.set('cdp_session', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/',
    });
    return response;
  } catch {
    return NextResponse.json({ error: 'Ogiltigt anrop' }, { status: 400 });
  }
}
