import { NextRequest, NextResponse } from 'next/server';
import { isAuthed as checkAuth } from '@/lib/admin-auth';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id, status } = await req.json();
  if (!['pending', 'accepted', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }
  const db = getDb();
  const row = db.prepare('SELECT id FROM submissions WHERE id = ?').get(id);
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Accept/Reject is an internal status only — no automated student emails.
  db.prepare('UPDATE submissions SET status = ? WHERE id = ?').run(status, id);
  return NextResponse.json({ ok: true });
}
