import { NextRequest, NextResponse } from 'next/server';
import { getDb, IssueSettings } from '@/lib/db';
import { cookies } from 'next/headers';
import { isValidSessionValue } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAuthed(): boolean {
  return isValidSessionValue(cookies().get('admin_session')?.value);
}

export async function GET() {
  if (!isAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = getDb();
  const row = db.prepare('SELECT * FROM issue_settings WHERE id = 1').get() as IssueSettings;
  return NextResponse.json(row);
}

export async function POST(req: NextRequest) {
  if (!isAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const db = getDb();

  db.prepare(`
    UPDATE issue_settings SET
      issue_number = ?,
      issue_season = ?,
      editors_letter = ?,
      top_reads = ?,
      author_spotlight = ?,
      updated_at = ?
    WHERE id = 1
  `).run(
    body.issue_number ?? '001',
    body.issue_season ?? 'Fall 2024',
    body.editors_letter ?? '',
    JSON.stringify(body.top_reads ?? []),
    JSON.stringify(body.author_spotlight ?? []),
    Date.now(),
  );

  return NextResponse.json({ ok: true });
}
