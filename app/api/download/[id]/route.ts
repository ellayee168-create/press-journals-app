import { NextRequest, NextResponse } from 'next/server';
import { getDb, Submission, Figure, ParsedSections, IssueSettings, CoAuthor } from '@/lib/db';
import { buildArticleHtml } from '@/lib/article-template';
import { htmlToPdf } from '@/lib/pdf-gen';
import { getJournalConfig } from '@/lib/journals';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM submissions WHERE id = ?').get(params.id) as Submission | undefined;

  if (!row) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const figures: Figure[] = JSON.parse(row.figures || '[]');
  const sections: ParsedSections = row.sections ? JSON.parse(row.sections) : { body: [] };
  const coAuthors: CoAuthor[] = JSON.parse(row.co_authors || '[]');
  const footerAuthor = `${row.last_name}, ${row.first_name}`;

  const issueSettings = db
    .prepare('SELECT * FROM issue_settings WHERE id = 1')
    .get() as IssueSettings | undefined;

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
      issueSeason: issueSettings?.issue_season ?? process.env.ISSUE_SEASON,
      issueNumber: issueSettings?.issue_number ?? process.env.ISSUE_NUMBER,
    },
    true,
  );

  const cfg = getJournalConfig(row.journal);
  try {
    const pdf = await htmlToPdf(html, footerAuthor, cfg.color, true);
    const filename = `${row.last_name}_${row.first_name}_article.pdf`;

    return new NextResponse(pdf as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        // inline = browser displays in iframe; the <a download> on the preview page still forces a save
        'Content-Disposition': `inline; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error('PDF generation failed for submission', params.id, err);
    // Human-readable page instead of a broken/blank download.
    return new NextResponse(
      `<html><body style="font-family:sans-serif;padding:40px;max-width:560px;margin:auto">
        <h2 style="color:#b91c1c">PDF generation failed</h2>
        <p>The article could not be rendered to PDF. This is usually temporary — go back and try again.</p>
        <p style="color:#666;font-size:13px">Details: ${String(err instanceof Error ? err.message : err)
          .replace(/</g, '&lt;')}</p>
      </body></html>`,
      { status: 500, headers: { 'Content-Type': 'text/html' } },
    );
  }
}
