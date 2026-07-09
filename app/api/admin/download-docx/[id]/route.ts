import { NextRequest, NextResponse } from 'next/server';
import { isAuthed } from '@/lib/admin-auth';
import { getDb, Submission, Figure, ParsedSections, CoAuthor, IssueSettings } from '@/lib/db';
import { buildArticleHtml } from '@/lib/article-template';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Editable Word download. Rather than hand-assembling a .docx (which can't match
// the browser-rendered PDF), we serve the *same* HTML that produces the PDF as a
// Word-openable document. Word renders the CSS — float-right figures, fonts,
// spacing — so the editable copy looks like the PDF, and stays fully editable.
// (Editors can "Save As .docx" in one click if they want the native format.)
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = getDb();
  const row = db.prepare('SELECT * FROM submissions WHERE id = ?').get(params.id) as Submission | undefined;
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const figures: Figure[] = JSON.parse(row.figures || '[]');
  const sections: ParsedSections = row.sections ? JSON.parse(row.sections) : { body: [] };
  const coAuthors: CoAuthor[] = JSON.parse(row.co_authors || '[]');
  const issueSettings = db.prepare('SELECT * FROM issue_settings WHERE id = 1').get() as
    | IssueSettings
    | undefined;

  try {
    const html = buildArticleHtml(
      {
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
        issueSeason: issueSettings?.issue_season ?? undefined,
        issueNumber: issueSettings?.issue_number ?? undefined,
      },
      true,      // embed images as base64 so the file is self-contained
      'word',    // Word page-setup CSS + editable-document styling
    );

    const filename = `${row.last_name}_${row.first_name}_article.doc`;
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'application/msword',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error('Word document generation failed for submission', params.id, err);
    return new NextResponse(
      `<html><body style="font-family:sans-serif;padding:40px;max-width:560px;margin:auto">
        <h2 style="color:#b91c1c">Word document generation failed</h2>
        <p>The editable Word document could not be generated. Go back and try again.</p>
        <p style="color:#666;font-size:13px">Details: ${String(err instanceof Error ? err.message : err)
          .replace(/</g, '&lt;')}</p>
      </body></html>`,
      { status: 500, headers: { 'Content-Type': 'text/html' } },
    );
  }
}
