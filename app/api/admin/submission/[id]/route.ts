import { NextRequest, NextResponse } from 'next/server';
import { isAuthed as checkAuth } from '@/lib/admin-auth';
import { getDb, Submission } from '@/lib/db';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const db = getDb();
  const row = db.prepare('SELECT * FROM submissions WHERE id = ?').get(params.id) as
    | Submission
    | undefined;
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(row);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const db = getDb();
  const row = db.prepare('SELECT id FROM submissions WHERE id = ?').get(params.id);
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  db.prepare('DELETE FROM submissions WHERE id = ?').run(params.id);

  // Remove uploaded files. The id is a UUID from our own DB row (not user input),
  // but resolve + prefix-check anyway so a crafted id can never escape uploads/.
  const uploadsRoot = path.join(process.cwd(), 'uploads');
  const dir = path.resolve(uploadsRoot, params.id);
  if (dir.startsWith(uploadsRoot + path.sep) && fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  return NextResponse.json({ ok: true });
}
