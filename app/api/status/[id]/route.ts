import { NextRequest, NextResponse } from 'next/server';
import { getDb, Submission } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Public status lookup for students. The id is an unguessable UUID that only the
// submitter (and their guardian) receive by email, so exposing title/status by id
// is acceptable; no emails or other personal data are returned.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const db = getDb();
  const row = db
    .prepare('SELECT id, title, status, created_at, first_name FROM submissions WHERE id = ?')
    .get(params.id) as
    | Pick<Submission, 'id' | 'title' | 'status' | 'created_at' | 'first_name'>
    | undefined;

  if (!row) return NextResponse.json({ exists: false });
  return NextResponse.json({
    exists: true,
    title: row.title,
    status: row.status,
    created_at: row.created_at,
    firstName: row.first_name,
  });
}
