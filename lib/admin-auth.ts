import { createHash, timingSafeEqual } from 'crypto';
import type { NextRequest } from 'next/server';

// The session cookie stores an opaque token derived from the admin password,
// never the password itself. Changing ADMIN_PASSWORD invalidates all sessions.
export const SESSION_COOKIE = 'admin_session';

export function adminPassword(): string {
  return process.env.ADMIN_PASSWORD || 'admin123';
}

export function sessionToken(): string {
  return createHash('sha256')
    .update('press-admin-v1:' + adminPassword())
    .digest('hex');
}

export function isValidSessionValue(cookie: string | undefined): boolean {
  if (!cookie) return false;
  const expected = sessionToken();
  if (cookie.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(cookie), Buffer.from(expected));
}

export function isAuthed(req: NextRequest): boolean {
  return isValidSessionValue(req.cookies.get(SESSION_COOKIE)?.value);
}
