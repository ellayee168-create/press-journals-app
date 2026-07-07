import fs from 'fs';
import path from 'path';

function esc(text: string): string {
  return (text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function imageToBase64(imgPath?: string): string {
  if (!imgPath) return '';
  try {
    const abs = path.isAbsolute(imgPath) ? imgPath : path.join(process.cwd(), imgPath);
    const buf = fs.readFileSync(abs);
    const ext = path.extname(abs).toLowerCase().slice(1);
    const mime =
      ext === 'png' ? 'image/png' :
      ext === 'gif' ? 'image/gif' :
      ext === 'webp' ? 'image/webp' :
      'image/jpeg';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return '';
  }
}

export interface TopRead {
  id: string;
  title: string;
  author: string;
}

export interface CoverData {
  issueNumber: string;
  issueSeason: string;
  coverPhotoPath?: string;
  topReads: TopRead[];
  authorSpotlight: string[];
}

export function buildCoverHtml(data: CoverData): string {
  const photoSrc = imageToBase64(data.coverPhotoPath);
  const photoStyle = photoSrc
    ? `background-image: url('${photoSrc}'); background-size: cover; background-position: center;`
    : 'background: #4a8fa8;';

  const topReadsHtml = data.topReads.length
    ? data.topReads.map(r =>
        `<div class="top-read-item">&#9675; &ldquo;${esc(r.title)}&rdquo; by ${esc(r.author)}</div>`
      ).join('\n')
    : '<div class="top-read-item">&#9675; Articles coming soon</div>';

  const spotlightHtml = data.authorSpotlight.length
    ? data.authorSpotlight.map(a => `<div class="spotlight-name">${esc(a)}</div>`).join('\n')
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>PRESS Journals — Issue ${esc(data.issueNumber)}</title>
<style>
@page { size: letter; margin: 0; }
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: Arial, Helvetica, sans-serif;
  width: 8.5in;
  height: 11in;
  overflow: hidden;
  background: #C5DEF0;
}
.cover {
  width: 8.5in;
  height: 11in;
  position: relative;
  background: #C5DEF0;
  display: flex;
  flex-direction: column;
}
.cover-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 0;
  flex-shrink: 0;
  z-index: 10;
  position: relative;
}
.issue-box {
  background: #1B3A5C;
  color: #fff;
  padding: 0.18in 0.22in;
  min-width: 1.6in;
  line-height: 1.55;
}
.issue-box .ib-line { font-size: 13pt; font-weight: bold; }
.press-title-area {
  flex: 1;
  padding: 0.14in 0.25in 0.1in;
  text-align: right;
}
.press-title {
  font-size: 36pt;
  font-weight: bold;
  color: #1B3A5C;
  line-height: 1.1;
  letter-spacing: -0.5pt;
}

/* Cover photo fills the middle section */
.cover-photo {
  flex: 1;
  ${photoStyle}
  position: relative;
  z-index: 1;
}

/* Text overlaid on the photo */
.cover-overlay {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: 50%;
  padding: 0.25in 0.3in;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.2in;
  z-index: 5;
}
.overlay-section-title {
  font-size: 16pt;
  font-weight: bold;
  color: #fff;
  text-shadow: 1px 1px 4px rgba(0,0,0,0.5);
  margin-bottom: 4pt;
}
.top-read-item {
  font-size: 9pt;
  color: #fff;
  text-shadow: 1px 1px 3px rgba(0,0,0,0.6);
  line-height: 1.4;
  margin-bottom: 4pt;
  padding-left: 8pt;
}
.spotlight-section { margin-top: 4pt; }
.spotlight-name {
  font-size: 12pt;
  font-weight: bold;
  color: #fff;
  text-shadow: 1px 1px 4px rgba(0,0,0,0.5);
  padding-left: 14pt;
  line-height: 1.5;
}

/* Bottom footer strip */
.cover-footer {
  background: #fff;
  text-align: center;
  padding: 0.12in 0.3in;
  font-size: 8.5pt;
  color: #333;
  line-height: 1.5;
  flex-shrink: 0;
  z-index: 10;
}
</style>
</head>
<body>
<div class="cover">
  <div class="cover-top">
    <div class="issue-box">
      <div class="ib-line">${esc(data.issueSeason)}</div>
      <div class="ib-line">Issue ${esc(data.issueNumber)}</div>
    </div>
    <div class="press-title-area">
      <div class="press-title">Press Journals</div>
    </div>
  </div>

  <div class="cover-photo">
    <div class="cover-overlay">
      <div>
        <div class="overlay-section-title">Editor&rsquo;s Top Reads:</div>
        ${topReadsHtml}
      </div>
      ${data.authorSpotlight.length ? `
      <div class="spotlight-section">
        <div class="overlay-section-title">Author Spotlight:</div>
        ${spotlightHtml}
      </div>` : ''}
    </div>
  </div>

  <div class="cover-footer">
    Peer Review for Emerging Student Scholars Journal is a part of the HH Scholars LLC ecosystem<br>
    Access articles at PRESS-journals.org
  </div>
</div>
</body>
</html>`;
}

export interface FrontMatterData {
  issueNumber: string;
  editorsLetter: string;
  articles: Array<{ title: string; author: string; journal: string }>;
}

export function buildFrontMatterHtml(data: FrontMatterData): string {
  // Group articles by journal
  const byJournal: Record<string, Array<{ title: string; author: string }>> = {};
  for (const a of data.articles) {
    if (!byJournal[a.journal]) byJournal[a.journal] = [];
    byJournal[a.journal].push({ title: a.title, author: a.author });
  }

  const tocRows = Object.entries(byJournal)
    .map(([journal, arts]) => `
      <div class="toc-section">
        <div class="toc-journal">${esc(journal)}</div>
        ${arts.map(a => `
          <div class="toc-item">
            <span class="toc-bullet">&#9675;</span>
            <span><em>${esc(a.title)}</em> by ${esc(a.author)}</span>
          </div>`).join('')}
      </div>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>PRESS Journals Front Matter</title>
<style>
@page { size: letter; margin: 0; }
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 10pt;
  color: #111;
  background: #fff;
}

/* ── Shared page chrome ─── */
.fm-page {
  width: 8.5in;
  min-height: 11in;
  display: flex;
  flex-direction: column;
  break-after: page;
}
.fm-header {
  background: #1B3A5C;
  color: #fff;
  text-align: center;
  padding: 0.28in 0.7in 0.22in;
}
.fm-header-title { font-size: 26pt; font-weight: bold; }
.fm-header-sub { font-size: 11pt; font-weight: normal; margin-top: 3pt; color: #cde; }
.fm-border {
  border: 1.5pt solid #1B3A5C;
  margin: 0.25in 0.5in 0;
  flex: 1;
  padding: 0.3in 0.4in;
}

/* ── Letter page ── */
.letter-body {
  font-size: 10.5pt;
  line-height: 1.65;
  color: #111;
}
.letter-body p { margin-bottom: 8pt; text-align: justify; }
.letter-body b { font-weight: bold; }
.letter-body .salutation { margin-bottom: 12pt; }
.letter-body .sign-off { margin-top: 16pt; }

/* ── TOC page ── */
.toc-section { margin-bottom: 18pt; }
.toc-journal { font-size: 11pt; font-weight: bold; color: #111; margin-bottom: 6pt; }
.toc-item {
  display: flex;
  gap: 8pt;
  font-size: 10.5pt;
  font-style: normal;
  color: #222;
  margin-bottom: 5pt;
  padding-left: 12pt;
  line-height: 1.4;
}
.toc-bullet { flex-shrink: 0; color: #555; }

/* ── TOC bottom dark box ── */
.toc-bottom {
  background: #1B3A5C;
  margin: 0 0.5in;
  padding: 0.2in 0.4in;
  flex-shrink: 0;
}
.toc-disclaimer {
  font-size: 8pt;
  color: #cde;
  line-height: 1.6;
}
</style>
</head>
<body>

<!-- ── Letter from the Editors ── -->
<div class="fm-page">
  <div class="fm-header">
    <div class="fm-header-title">PRESS Journals</div>
    <div class="fm-header-sub">Letter from the Editors</div>
  </div>
  <div class="fm-border">
    <div class="letter-body">
      ${formatLetter(data.editorsLetter)}
    </div>
  </div>
  <div style="height:0.3in;"></div>
</div>

<!-- ── Table of Contents ── -->
<div class="fm-page">
  <div class="fm-header">
    <div class="fm-header-title">PRESS Journals</div>
    <div class="fm-header-sub">Issue ${esc(data.issueNumber)} Table of Contents</div>
  </div>
  <div class="fm-border">
    ${tocRows}
  </div>
  <div class="toc-bottom">
    <div class="toc-disclaimer">
      Important information and disclaimers:<br>
      PRESS Journals is a part of the HH Scholars LLC ecosystem.<br>
      All articles featured in PRESS Journals are open-source and available online.<br>
      PRESS Journals is published online by HH Scholars LLC headquarters in San Francisco, CA.<br>
      Questions for the author of a published work can be directed to our editors at editor@press-journals.org.
    </div>
  </div>
</div>

</body>
</html>`;
}

function formatLetter(raw: string): string {
  if (!raw) {
    return `<p class="salutation">Dear Readers,</p>
<p>Welcome to PRESS Journals, where young minds drive innovation.</p>
<p class="sign-off">Sincerely,<br>The Editors at PRESS Journals</p>`;
  }
  return raw
    .split(/\n{2,}/)
    .map(p => p.replace(/\n/g, ' ').trim())
    .filter(Boolean)
    .map(p => `<p>${esc(p)}</p>`)
    .join('\n');
}
