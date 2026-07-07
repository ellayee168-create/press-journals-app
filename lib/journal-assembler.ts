import { getDb, Submission, Figure, ParsedSections, IssueSettings, CoAuthor } from './db';
import { buildArticleHtml, ArticleData } from './article-template';
import { buildCoverHtml, buildFrontMatterHtml, TopRead } from './issue-templates';
import { htmlToPdf, mergePdfs } from './pdf-gen';
import { getJournalConfig } from './journals';

export async function generateFullIssue(): Promise<Buffer> {
  const db = getDb();

  // Load issue settings
  const settings = db.prepare('SELECT * FROM issue_settings WHERE id = 1').get() as IssueSettings;

  // Load all accepted submissions ordered by journal
  const rows = db
    .prepare(`SELECT * FROM submissions WHERE status = 'accepted' ORDER BY journal, created_at`)
    .all() as Submission[];

  const topReads: TopRead[] = JSON.parse(settings.top_reads || '[]');
  const authorSpotlight: string[] = JSON.parse(settings.author_spotlight || '[]');

  // 1. Cover page PDF
  const coverHtml = buildCoverHtml({
    issueNumber: settings.issue_number,
    issueSeason: settings.issue_season,
    coverPhotoPath: settings.cover_photo_path,
    topReads,
    authorSpotlight,
  });
  const coverPdf = await htmlToPdf(coverHtml, '', '#2BA4C8', false);

  // 2. Front matter PDF (letter + TOC)
  const frontMatterHtml = buildFrontMatterHtml({
    issueNumber: settings.issue_number,
    editorsLetter: settings.editors_letter || '',
    articles: rows.map(r => ({
      title: r.title,
      author: `${r.first_name} ${r.last_name}`,
      journal: r.journal,
    })),
  });
  const frontMatterPdf = await htmlToPdf(frontMatterHtml, '', '#2BA4C8', false);

  // 3. Individual article PDFs
  const articlePdfs: Buffer[] = [];
  for (const row of rows) {
    const figures: Figure[] = JSON.parse(row.figures || '[]');
    const sections: ParsedSections = row.sections ? JSON.parse(row.sections) : { body: [] };
    const coAuthors: CoAuthor[] = JSON.parse(row.co_authors || '[]');
    const cfg = getJournalConfig(row.journal);
    const footerAuthor = `${row.last_name}, ${row.first_name}`;

    const articleData: ArticleData = {
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
      issueSeason: settings.issue_season,
      issueNumber: settings.issue_number,
    };

    const html = buildArticleHtml(articleData, true);
    const pdf = await htmlToPdf(html, footerAuthor, cfg.color, true);
    articlePdfs.push(pdf);
  }

  // 4. Merge everything
  return mergePdfs([coverPdf, frontMatterPdf, ...articlePdfs]);
}
