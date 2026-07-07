import { NextRequest, NextResponse } from 'next/server';
import { isAuthed as checkAuth } from '@/lib/admin-auth';
import { getDb, Submission } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';



export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const db = getDb();
  const rows = db
    .prepare(
      'SELECT id, created_at, status, first_name, last_name, title, journal, email, sections, references_raw, manuscript_path FROM submissions ORDER BY created_at DESC',
    )
    .all() as Array<Partial<Submission> & { sections?: string; references_raw?: string; manuscript_path?: string }>;

  // parse_ok = the manuscript produced usable structure. False → the editor
  // should open the submission and re-parse or check the uploaded file.
  const result = rows.map(({ sections, references_raw, manuscript_path, ...rest }) => {
    let parseOk = true;
    if (manuscript_path) {
      try {
        const s = sections ? JSON.parse(sections) : null;
        const hasStructure = !!s && !s.raw && (s.introduction || (s.body?.length ?? 0) > 0 || s.conclusion);
        parseOk = !!hasStructure && !!(references_raw || s?.references);
      } catch {
        parseOk = false;
      }
    }
    return { ...rest, parse_ok: parseOk };
  });
  return NextResponse.json(result);
}
