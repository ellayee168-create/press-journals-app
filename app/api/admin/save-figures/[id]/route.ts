import { NextRequest, NextResponse } from 'next/server';
import { isAuthed } from '@/lib/admin-auth';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = getDb();
  const { figures } = await req.json();
  if (!Array.isArray(figures)) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

  db.prepare('UPDATE submissions SET figures = ? WHERE id = ?').run(
    JSON.stringify(figures),
    params.id,
  );
  return NextResponse.json({ ok: true });
}
