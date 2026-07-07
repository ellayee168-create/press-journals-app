import { NextRequest, NextResponse } from 'next/server';
import { isAuthed as checkAuth } from '@/lib/admin-auth';
import { getDb, Submission } from '@/lib/db';
import { sendDecisionEmail } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id, status, note, notify } = await req.json();
  if (!['pending', 'accepted', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }
  const db = getDb();
  const row = db.prepare('SELECT * FROM submissions WHERE id = ?').get(id) as Submission | undefined;
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  db.prepare('UPDATE submissions SET status = ? WHERE id = ?').run(status, id);

  // Notify the student of the decision (fire-and-forget; a mail failure
  // must not roll back or block the status change).
  let emailed = false;
  if (notify !== false && (status === 'accepted' || status === 'rejected')) {
    sendDecisionEmail(row.email, row.first_name, row.title, status, note || undefined)
      .catch(err => console.error('Decision email failed:', err));
    emailed = true;
  }

  return NextResponse.json({ ok: true, emailed });
}
