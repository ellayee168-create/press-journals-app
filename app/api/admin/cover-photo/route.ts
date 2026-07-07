import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { cookies } from 'next/headers';
import { isValidSessionValue } from '@/lib/admin-auth';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAuthed(): boolean {
  return isValidSessionValue(cookies().get('admin_session')?.value);
}

export async function POST(req: NextRequest) {
  if (!isAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get('photo') as File | null;
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

  const uploadDir = path.join(process.cwd(), 'uploads', 'issue');
  fs.mkdirSync(uploadDir, { recursive: true });

  const ext = file.name.split('.').pop() ?? 'jpg';
  const filename = `cover.${ext}`;
  const dest = path.join(uploadDir, filename);

  const buf = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(dest, buf);

  const db = getDb();
  db.prepare('UPDATE issue_settings SET cover_photo_path = ?, updated_at = ? WHERE id = 1')
    .run(dest, Date.now());

  return NextResponse.json({ ok: true, path: dest });
}
