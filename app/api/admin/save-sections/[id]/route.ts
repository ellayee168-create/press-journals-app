import { NextRequest, NextResponse } from 'next/server';
import { isAuthed } from '@/lib/admin-auth';
import { getDb, ParsedSections } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Persist editor-made changes to the parsed article structure
// (renamed headings, edited text, reordered/removed sections, edited references).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sections } = (await req.json()) as { sections: ParsedSections };
  if (!sections || !Array.isArray(sections.body)) {
    return NextResponse.json({ error: 'Invalid sections payload' }, { status: 400 });
  }
  for (const s of sections.body) {
    if (typeof s.heading !== 'string' || !Array.isArray(s.subsections)) {
      return NextResponse.json({ error: 'Invalid body section shape' }, { status: 400 });
    }
  }

  const db = getDb();
  const row = db.prepare('SELECT id FROM submissions WHERE id = ?').get(params.id);
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  db.prepare('UPDATE submissions SET sections = ?, references_raw = ? WHERE id = ?').run(
    JSON.stringify(sections),
    sections.references ?? null,
    params.id,
  );

  return NextResponse.json({ ok: true });
}
