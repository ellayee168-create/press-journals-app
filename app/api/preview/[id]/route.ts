import { NextRequest, NextResponse } from 'next/server';
import { getDb, Submission, Figure, ParsedSections, CoAuthor, IssueSettings } from '@/lib/db';
import { buildArticleHtml } from '@/lib/article-template';

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
  // Use the editor's saved issue settings so the preview matches the downloaded PDF.
  const issueSettings = db
    .prepare('SELECT * FROM issue_settings WHERE id = 1')
    .get() as IssueSettings | undefined;

  const html = buildArticleHtml({
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
  });

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
