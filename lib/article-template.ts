import { Figure, ParsedSections, CoAuthor } from './db';
import { getJournalConfig } from './journals';
import { buildArticleLayout, meaningfulAcknowledgments, cleanCaption } from './article-layout';
import fs from 'fs';
import path from 'path';

export interface ArticleData {
  id: string;
  firstName: string;
  lastName: string;
  affiliation: string;
  email: string;
  isCorresponding: boolean;
  coAuthors: CoAuthor[];
  articleType: string;
  title: string;
  abstract: string;
  keywords: string[];
  journal: string;
  acknowledgments?: string;
  coi?: string;
  sections: ParsedSections;
  referencesRaw?: string;
  figures: Figure[];
  issueSeason?: string;
  issueNumber?: string;
}

function esc(text: string): string {
  return (text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toParagraphs(text: string, firstNoIndent = true): string {
  if (!text) return '';
  return text
    .split(/\n{2,}/)
    .map(p => p.replace(/\n/g, ' ').trim())
    .filter(Boolean)
    .map((p, i) => {
      const cls = firstNoIndent && i === 0 ? ' class="no-indent"' : '';
      return `<p${cls}>${esc(p)}</p>`;
    })
    .join('\n');
}

export function figureToBase64(figurePath: string): string {
  try {
    const abs = path.isAbsolute(figurePath)
      ? figurePath
      : path.join(process.cwd(), figurePath);
    const buf = fs.readFileSync(abs);
    const ext = path.extname(abs).toLowerCase().slice(1);
    const mime =
      ext === 'png' ? 'image/png' :
      ext === 'tif' || ext === 'tiff' ? 'image/tiff' :
      'image/jpeg';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return '';
  }
}

function makeFigure(fig: Figure, id: string, embed: boolean): string {
  const src = embed ? figureToBase64(fig.path) : `/api/figure/${id}/${fig.number}`;
  if (!src) return '';
  return `<div class="fig">
  <p class="fig-caption"><strong>Figure ${fig.number}:</strong> ${esc(cleanCaption(fig.caption))}</p>
  <img src="${src}" alt="Figure ${fig.number}">
</div>`;
}

export function buildArticleHtml(data: ArticleData, embed = false, mode: 'web' | 'word' = 'web'): string {
  const cfg = getJournalConfig(data.journal);
  const accent = cfg.color;
  const dark = cfg.dark;
  // Word opens HTML as an editable document; it needs self-contained (base64)
  // images and its own page-setup CSS rather than the on-screen preview chrome.
  const forWord = mode === 'word';
  if (forWord) embed = true;

  const season = data.issueSeason ?? '';
  const issueLabel = data.issueNumber ? `Issue ${data.issueNumber}` : '';

  // ── Author list with de-duplicated affiliation superscripts ──────────────
  const allAuthors = [
    { firstName: data.firstName, lastName: data.lastName, affiliation: data.affiliation, isCorresponding: data.isCorresponding },
    ...data.coAuthors.map(a => ({ ...a, isCorresponding: false })),
  ];
  const affiliations: string[] = [];
  function affIndex(aff: string): number {
    let idx = affiliations.indexOf(aff);
    if (idx === -1) { affiliations.push(aff); idx = affiliations.length - 1; }
    return idx;
  }
  const multipleAffiliations = new Set(allAuthors.map(a => a.affiliation)).size > 1;
  const authorNamesHtml = allAuthors.map(a => {
    const sup = (allAuthors.length > 1 && multipleAffiliations) ? `<sup>${affIndex(a.affiliation) + 1}</sup>` : '';
    const corr = a.isCorresponding ? '<sup>*</sup>' : '';
    return `${esc(a.firstName)} ${esc(a.lastName)}${sup}${corr}`;
  }).join(', ');
  const affiliationsHtml = (multipleAffiliations ? affiliations : [data.affiliation])
    .map((aff, i) =>
      `<p class="meta-line">${multipleAffiliations ? `<sup>${i + 1}</sup>` : ''}${esc(aff)}</p>`
    ).join('\n');

  const authorCaps = `${data.lastName.toUpperCase()}, ${data.firstName.toUpperCase()}`;

  // ── Figure placement & body (shared layout — see lib/article-layout.ts) ────
  const layout = buildArticleLayout(data.sections, data.figures);
  const figHtml = (fs: Figure[]) => fs.map(f => makeFigure(f, data.id, embed)).join('\n');

  let bodyHtml = '';
  if (layout.rawText !== undefined) {
    // Unstructured text — show all figures then the text
    bodyHtml += figHtml(layout.allFiguresIfRaw);
    bodyHtml += toParagraphs(layout.rawText);
  } else {
    for (const section of layout.sections) {
      bodyHtml += `<h2>${esc(section.heading)}</h2>\n${figHtml(section.figures)}`;
      for (const sub of section.subsections) {
        if (sub.subheading) bodyHtml += `<h3>${esc(sub.subheading)}</h3>\n`;
        bodyHtml += toParagraphs(sub.text) + '\n';
      }
      bodyHtml += '<div class="clearfix"></div>';
    }
    // Figures whose target section doesn't exist go at the end (never dropped).
    if (layout.trailingFigures.length) {
      bodyHtml += figHtml(layout.trailingFigures) + '<div class="clearfix"></div>';
    }
  }

  const ackText = meaningfulAcknowledgments(data.acknowledgments || data.sections.acknowledgments);
  const ackHtml = ackText
    ? `<h2>Acknowledgements</h2>\n<p class="no-indent">${esc(ackText)}</p>`
    : '';

  const refText = data.referencesRaw || data.sections.references || '';
  const refHtml = refText
    ? `<div class="refs-block"><h2>References</h2>\n<div class="refs">${toParagraphs(refText, false)}</div></div>`
    : '';

  const correspondingLine = data.isCorresponding
    ? `<p class="meta-line"><sup>*</sup>Correspondence: <a href="mailto:${esc(data.email)}">${esc(data.email)}</a></p>`
    : '';

  const articleTypeHtml = data.articleType
    ? `<div class="article-type-label">${esc(data.articleType.toUpperCase())}</div>`
    : '';

  const keywordsHtml = data.keywords.length
    ? `<p class="keywords"><strong>Keywords:</strong> ${data.keywords.map(esc).join(', ')}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${esc(data.title)}</title>
<style>
/* ── Page geometry ──────────────────────────── */
@page {
  size: letter;
  margin: 0.7in 0.75in 0.85in 0.75in;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 10pt;
  line-height: 1.5;
  color: #111;
  background: #fff;
}

/* Screen preview wrapper */
@media screen {
  body { background: #d0d0d0; }
  .wrap {
    background: #fff;
    max-width: 8.5in;
    margin: 0.5in auto;
    padding: 0.7in 0.75in 0.85in;
    box-shadow: 0 2px 32px rgba(0,0,0,0.22);
    min-height: 11in;
  }
}
@media print { .wrap { padding: 0; } }

${forWord ? `
/* ── Word document page setup (MS Word reads these mso rules) ── */
@page WordSection1 {
  size: 8.5in 11.0in;
  margin: 0.7in 0.75in 0.85in 0.75in;
  mso-page-orientation: portrait;
}
div.WordSection1 { page: WordSection1; }
body { background: #ffffff; }
.wrap { max-width: none; margin: 0; padding: 0; box-shadow: none; min-height: 0; background: #ffffff; }
.screen-footer, .screen-footer-url { display: none; }
` : ''}

/* ── First-page header ───────────────────────── */
.article-first-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16pt;
  gap: 18pt;
}
.issue-box {
  background: ${dark};
  color: #fff;
  padding: 9pt 14pt 9pt 14pt;
  min-width: 1.3in;
  flex-shrink: 0;
  line-height: 1.5;
}
.issue-box .ib-season { font-size: 11pt; font-weight: bold; }
.issue-box .ib-number { font-size: 11pt; font-weight: bold; }
.journal-header-right { text-align: right; flex: 1; }
.press-journals-wordmark {
  font-size: 26pt;
  font-weight: bold;
  color: ${dark};
  line-height: 1.1;
}
.journal-name-subtitle {
  font-size: 13pt;
  font-weight: bold;
  color: ${accent};
  line-height: 1.25;
  margin-top: 2pt;
}

/* ── Article type label ──────────────────────── */
.article-type-label {
  font-size: 7.5pt;
  font-weight: bold;
  letter-spacing: 2pt;
  text-transform: uppercase;
  color: ${accent};
  margin-bottom: 5pt;
}

/* ── Article title ───────────────────────────── */
.article-title {
  font-size: 22pt;
  font-weight: bold;
  color: ${accent};
  line-height: 1.2;
  margin-bottom: 8pt;
}

/* ── Author / meta ───────────────────────────── */
.author-name {
  font-size: 11pt;
  font-weight: normal;
  color: #222;
  margin-bottom: 2pt;
}
p.meta-line {
  font-size: 9pt;
  color: #555;
  text-indent: 0;
  margin-bottom: 2pt;
}
p.meta-line a { color: ${accent}; text-decoration: none; }

/* ── Abstract (always full width) ───────────── */
.abstract-section {
  margin: 12pt 0 14pt;
}
.abstract-heading {
  font-size: 13pt;
  font-weight: bold;
  color: ${accent};
  margin-bottom: 5pt;
}
.abstract-text {
  font-size: 10pt;
  line-height: 1.5;
  text-align: justify;
  color: #111;
}
p.keywords {
  font-size: 9.5pt;
  color: #444;
  text-indent: 0;
  margin-top: 6pt;
}

/* ── Body content ────────────────────────────── */
.body-content {
  /* Single-column flow; figures float right */
}

.clearfix::after {
  content: '';
  display: table;
  clear: both;
}

h2 {
  font-size: 11pt;
  font-weight: bold;
  color: ${accent};
  margin-top: 12pt;
  margin-bottom: 4pt;
  clear: both; /* never overlap with a preceding float */
  break-after: avoid;
}
h3 {
  font-size: 10pt;
  font-weight: bold;
  font-style: italic;
  color: #333;
  margin-top: 8pt;
  margin-bottom: 2pt;
  break-after: avoid;
}

p {
  text-align: justify;
  text-indent: 1.4em;
  font-size: 10pt;
  line-height: 1.5;
  orphans: 3;
  widows: 3;
  margin-bottom: 0;
}
p + p { margin-top: 4pt; }
p.no-indent { text-indent: 0; }

/* ── Figures: float right, caption above image ── */
.fig {
  float: right;
  clear: right;
  width: 43%;
  margin: 0 0 14pt 18pt;
  break-inside: avoid;
}
.fig-caption {
  font-size: 9pt;
  line-height: 1.4;
  color: #333;
  text-indent: 0;
  text-align: left;
  margin-bottom: 5pt;
}
.fig img {
  width: 100%;
  max-height: 4.5in;
  object-fit: contain;
  display: block;
}

/* ── References ──────────────────────────────── */
.refs-block {
  margin-top: 14pt;
  padding-top: 8pt;
  border-top: 0.5pt solid #ccc;
  clear: both;
}
.refs p {
  text-indent: -1.8em;
  padding-left: 1.8em;
  text-align: left;
  font-size: 9pt;
  line-height: 1.35;
  margin-bottom: 5pt;
}

/* ── Screen-only footer simulation ───────────── */
.screen-footer {
  margin-top: 24pt;
  padding-top: 5pt;
  border-top: 4pt solid ${accent};
  display: flex;
  justify-content: space-between;
  font-size: 8pt;
  color: #555;
  clear: both;
}
.screen-footer-url {
  text-align: center;
  font-size: 8pt;
  color: #888;
  margin-top: 3pt;
}
@media print {
  .screen-footer, .screen-footer-url { display: none; }
}
</style>
</head>
<body>
<div class="${forWord ? 'WordSection1 ' : ''}wrap">

  <!-- ── First-page header ── -->
  <div class="article-first-header">
    <div class="issue-box">
      <div class="ib-season">${esc(season)}</div>
      <div class="ib-number">${esc(issueLabel)}</div>
    </div>
    <div class="journal-header-right">
      <div class="press-journals-wordmark">PRESS Journals</div>
      <div class="journal-name-subtitle">${esc(data.journal)}</div>
    </div>
  </div>

  <!-- ── Article type ── -->
  ${articleTypeHtml}

  <!-- ── Title ── -->
  <div class="article-title">${esc(data.title)}</div>

  <!-- ── Authors ── -->
  <p class="author-name">${authorNamesHtml}</p>
  ${affiliationsHtml}
  ${correspondingLine}

  <!-- ── Abstract (full width) ── -->
  <div class="abstract-section">
    <div class="abstract-heading">Abstract</div>
    <div class="abstract-text">${esc(data.abstract)}</div>
    ${keywordsHtml}
  </div>

  <!-- ── Body (single-column flow + right-floated figures) ── -->
  <div class="body-content">
    ${bodyHtml}
    ${ackHtml}
    ${refHtml}
  </div>

  <!-- Screen-only footer -->
  <div class="screen-footer">
    <span>${esc(authorCaps)}</span>
    <span>1</span>
  </div>
  <div class="screen-footer-url">PRESS-Journals.org</div>

</div>
</body>
</html>`;
}
