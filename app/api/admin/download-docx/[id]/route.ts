import { NextRequest, NextResponse } from 'next/server';
import { isAuthed } from '@/lib/admin-auth';
import { getDb, Submission, Figure, ParsedSections, CoAuthor } from '@/lib/db';
import { generateArticleDocx } from '@/lib/docx-gen';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = getDb();
  const row = db.prepare('SELECT * FROM submissions WHERE id = ?').get(params.id) as Submission | undefined;
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const figures: Figure[] = JSON.parse(row.figures || '[]');
  const sections: ParsedSections = row.sections ? JSON.parse(row.sections) : { body: [] };
  const coAuthors: CoAuthor[] = JSON.parse(row.co_authors || '[]');
  const issueSettings = db.prepare('SELECT * FROM issue_settings WHERE id = 1').get() as
    | { issue_season?: string; issue_number?: string }
    | undefined;

  try {
  const buffer = await generateArticleDocx({
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    affiliation: row.affiliation,
    email: row.email,
    isCorresponding: row.is_corresponding === 1,
    coAuthors,
    articleType: row.article_type || 'Research Article',
    title: row.title,
    abstract: row.abstract,
    keywords: JSON.parse(row.keywords || '[]'),
    journal: row.journal,
    acknowledgments: row.acknowledgments,
    coi: row.coi,
    sections,
    referencesRaw: row.references_raw || undefined,
    figures,
    issueSeason: issueSettings?.issue_season,
    issueNumber: issueSettings?.issue_number,
  });

  const safe = (s: string) => (s || '').replace(/[^a-zA-Z0-9._-]/g, '_');
  const filename = `${safe(row.last_name)}_${safe(row.first_name)}_article.docx`;
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
  } catch (err) {
    console.error('DOCX generation failed for submission', params.id, err);
    return new NextResponse(
      `<html><body style="font-family:sans-serif;padding:40px;max-width:560px;margin:auto">
        <h2 style="color:#b91c1c">DOCX generation failed</h2>
        <p>The editable Word document could not be generated. Go back and try again.</p>
        <p style="color:#666;font-size:13px">Details: ${String(err instanceof Error ? err.message : err)
          .replace(/</g, '&lt;')}</p>
      </body></html>`,
      { status: 500, headers: { 'Content-Type': 'text/html' } },
    );
  }
}
