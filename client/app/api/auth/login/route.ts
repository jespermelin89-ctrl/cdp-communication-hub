import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const ADMIN_USER = process.env.ADMIN_USERNAME || 'jesper';
const ADMIN_PASS = process.env.ADMIN_PASSWORD || '';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

function createSessionToken(username: string): string {
  const payload = JSON.stringify({ username, exp: Date.now() + 30 * 24 * 60 * 60 * 1000 }); // 30 days
  const hmac = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  return Buffer.from(payload).toString('base64url') + '.' + hmac;
}

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!ADMIN_PASS) {
      return NextResponse.json(
        { error: 'Inloggning inte konfigurerad. Sätt ADMIN_PASSWORD i miljövariabler.' },
        { status: 500 }
      );
    }

    if (username === ADMIN_USER && password === ADMIN_PASS) {
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
    }

    return NextResponse.json({ error: 'Fel användarnamn eller lösenord' }, { status: 401 });
  } catch {
    return NextResponse.json({ error: 'Ogiltigt anrop' }, { status: 400 });
  }
}
