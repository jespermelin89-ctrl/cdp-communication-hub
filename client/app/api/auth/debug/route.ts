import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const SESSION_SECRET = process.env.SESSION_SECRET || '';

export async function GET(request: NextRequest) {
  const session = request.cookies.get('cdp_session')?.value;

  const debug: Record<string, unknown> = {
    hasSessionSecret: !!SESSION_SECRET,
    sessionSecretLength: SESSION_SECRET.length,
    sessionSecretFirst4: SESSION_SECRET.substring(0, 4),
    hasCookie: !!session,
    cookieLength: session?.length || 0,
  };

  if (session && SESSION_SECRET) {
    try {
      const [payloadB64, hmac] = session.split('.');
      const payload = Buffer.from(payloadB64, 'base64url').toString();
      const expectedHmac = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
      const parsed = JSON.parse(payload);

      debug.tokenPayload = parsed;
      debug.hmacMatch = hmac === expectedHmac;
      debug.hmacReceived = hmac?.substring(0, 8) + '...';
      debug.hmacExpected = expectedHmac.substring(0, 8) + '...';
      debug.isExpired = parsed.exp <= Date.now();
    } catch (e: unknown) {
      debug.tokenError = e instanceof Error ? e.message : String(e);
    }
  }

  return NextResponse.json(debug);
}
