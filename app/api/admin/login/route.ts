import { NextRequest, NextResponse } from 'next/server';
import { adminPassword, sessionToken, isAuthed, SESSION_COOKIE } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { password } = await req.json();
  if (password !== adminPassword()) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, sessionToken(), {
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 60 * 60 * 8, // 8 hours
    path: '/',
  });
  return res;
}

// Session check — lets the dashboard restore a still-valid login after a page refresh.
export async function GET(req: NextRequest) {
  return NextResponse.json({ authed: isAuthed(req) });
}
