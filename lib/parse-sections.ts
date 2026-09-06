import { ParsedSections } from './db';
import { placementTargetsFor } from './article-layout';

// ── Helpers ──────────────────────────────────────────────────────────────────

const KNOWN_INTRO   = new Set(['abstract', 'introduction', 'intro', 'background', 'overview']);
// Body-section synonyms — these stay as titled body sections, but are recognised
// so numbered/synonym variants are detected as headings and mark where the body starts.
const KNOWN_METHODS = new Set([
  'methods', 'method', 'materials and methods', 'materials & methods', 'methods and materials',
  'methodology', 'experimental', 'experimental methods', 'experimental section',
  'materials', 'procedure', 'procedures', 'study design', 'approach', 'data and methods',
]);
const KNOWN_RESULTS = new Set(['results', 'result', 'findings', 'results and discussion', 'observations']);
const KNOWN_DISCUSS = new Set(['discussion', 'discussions', 'analysis', 'general discussion', 'interpretation']);
const KNOWN_CONCL   = new Set([
  'conclusion', 'conclusions', 'summary', 'closing remarks', 'concluding remarks',
  'final remarks', 'future directions', 'conclusion and future directions',
  'conclusions and future directions', 'conclusions and future work',
]);
const KNOWN_ACK     = new Set(['acknowledgments', 'acknowledgements', 'acknowledgment', 'acknowledgement']);
const KNOWN_REFS    = new Set([
  'references', 'reference', 'reference list', 'bibliography', 'works cited',
  'literature cited', 'citations', 'cited references',
]);
// Sections DROPPED from the body only because the form already collects them —
// keeping them would print the same content twice. Everything else the student
// writes (Funding, Ethics, Data Availability, Limitations, etc.) is kept as a
// normal body section.
const KNOWN_SKIP    = new Set([
  'abstract', 'keywords', 'key words', 'keyword',                    // collected by the form
  'conflict of interest', 'conflicts of interest', 'competing interests', // form's COI field
  'declaration of competing interest', 'declaration of interest', 'disclosure', 'disclosures',
]);
// Only the legend blocks that genuinely restate the main-text float captions the
// form already collects. Supplemental legends are NOT listed: they describe
// material that has no other home in the article, so dropping them silently
// deletes content the author wrote. Keeping the Conclusion in its manuscript
// position is handled by `conclusionAfter`, not by removing what follows it.
const KNOWN_FIGS    = new Set([
  'figure legend', 'figure legends', 'figures', 'figure captions', 'figure caption',
  'table legend', 'table legends', 'list of figures', 'list of tables', 'tables',
]);
// Markers that reliably indicate the real article body has begun. Everything before
// the first one (title, author line, affiliations, correspondence) is front-matter
// the submission form already collects, so it gets dropped.
const CONTENT_START = new Set(
  Array.from(KNOWN_SKIP)
    .concat(Array.from(KNOWN_INTRO))
    .concat(Array.from(KNOWN_METHODS))
    .concat(Array.from(KNOWN_RESULTS))
    .concat(Array.from(KNOWN_DISCUSS)),
);

// Strip a leading section number/letter enumerator: "1. ", "2.1 ", "IV. ", "A) ".
function stripEnumerator(s: string): string {
  return s.replace(/^\s*(\d+(\.\d+)*|[ivxlcdm]{1,4}|[a-z])[.)]\s+/i, '').trim();
}

function normalise(s: string) {
  return stripEnumerator(s).toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
}

// Is this heading text (after stripping numbering) a recognised section name?
function isKnownSectionName(text: string): boolean {
  const n = normalise(text);
  return (
    KNOWN_SKIP.has(n) || KNOWN_FIGS.has(n) || KNOWN_INTRO.has(n) ||
    KNOWN_METHODS.has(n) || KNOWN_RESULTS.has(n) || KNOWN_DISCUSS.has(n) ||
    KNOWN_CONCL.has(n) || KNOWN_ACK.has(n) || KNOWN_REFS.has(n)
  );
}

function classifyHeading(raw: string): 'skip' | 'intro' | 'conclusion' | 'ack' | 'refs' | 'body' {
  const n = normalise(raw);
  if (KNOWN_SKIP.has(n))   return 'skip';
  if (KNOWN_FIGS.has(n))   return 'skip';
  if (KNOWN_INTRO.has(n))  return 'intro';
  if (KNOWN_CONCL.has(n))  return 'conclusion';
  if (KNOWN_ACK.has(n))    return 'ack';
  if (KNOWN_REFS.has(n))   return 'refs';
  return 'body';
}

// ── DOCX path: use mammoth HTML structure (respects Word heading styles) ─────

// Word records how far each paragraph is indented, and authors lean on that to
// lay out hand-typed lists — numbering and bullets they typed themselves rather
// than using Word's list feature. mammoth's HTML throws indentation away, which
// flattened those lists into an undifferentiated stack of paragraphs. We tag
// each paragraph with the indent Word recorded and turn it into nesting later,
// once the whole document has been seen (see indentLevels).
interface MammothParagraph { indent?: { start?: string }; styleId?: string; styleName?: string }

const INDENT_STEP = 180;                    // 1/8 inch — the bucket size we round to
const INDENT_MAX  = 7200;                   // 5 inches; beyond this is not a list

function indentStyleMap(): string[] {
  const map: string[] = [];
  for (let t = INDENT_STEP; t <= INDENT_MAX; t += INDENT_STEP) {
    map.push(`p[style-name='PJIndent${t}'] => p.pj-ind-${t}:fresh`);
  }
  return map;
}

export async function parseSectionsFromDocx(docxPath: string, overrides?: SectionOverrides): Promise<ParsedSections> {
  const mammoth = await import('mammoth');
  // `transforms` is present at runtime but missing from mammoth's type defs.
  const transforms = (mammoth as unknown as {
    transforms: { paragraph: (fn: (p: MammothParagraph) => MammothParagraph) => unknown };
  }).transforms;
  const transformDocument = transforms.paragraph((p: MammothParagraph) => {
    const raw = Number(p.indent?.start ?? 0);
    if (!Number.isFinite(raw) || raw <= 0) return p;
    const bucket = Math.min(INDENT_MAX, Math.round(raw / INDENT_STEP) * INDENT_STEP);
    if (bucket < INDENT_STEP) return p;
    return { ...p, styleId: `PJIndent${bucket}`, styleName: `PJIndent${bucket}` };
  });
  const { value: html } = await mammoth.convertToHtml(
    { path: docxPath },
    { transformDocument, styleMap: indentStyleMap() } as Parameters<typeof mammoth.convertToHtml>[1],
  );
  return parseSectionsFromHtml(html, overrides);
}

/**
 * Turn recorded indents into nesting levels, relative to the document's own
 * baseline. A manuscript whose ordinary paragraphs all sit at 1 inch is not an
 * indented document — that is simply its left margin — so the most common indent
 * becomes level 0 and only paragraphs meaningfully further right nest under it.
 */
function indentLevels(buckets: number[]): (b: number) => number {
  const freq = new Map<number, number>();
  for (const b of buckets) freq.set(b, (freq.get(b) ?? 0) + 1);
  const baseline = freq.size
    ? Array.from(freq.entries()).sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0]
    : 0;
  const PER_LEVEL = 720; // half an inch per level of nesting
  return (b: number) => {
    const level = Math.floor((b - baseline) / PER_LEVEL);
    return Math.max(0, Math.min(3, level));
  };
}

// Pull "Table N: …" caption paragraphs from the text so each recovered table can
// carry its caption. Returned in document order to pair with the tables.
function extractTableCaptions(text: string): string[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const caps: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^table\s+\d+\s*[:.]/i.test(lines[i])) continue;
    let cap = lines[i];
    let j = i + 1;
    // Accumulate wrapped caption lines until one ends a sentence.
    while (j < lines.length && !/[.!?]\)?$/.test(lines[j - 1]) && !/^(table|figure)\s+\d/i.test(lines[j])) {
      cap += ' ' + lines[j];
      j++;
    }
    caps.push(cap.replace(/\s+/g, ' ').trim());
    i = j - 1;
  }
  return caps;
}

// PDF path: parse the text, and recover real tables from the PDF grid so they
// render as tables instead of garbled body text. Table rows (tab-separated) are
// removed from the text so the same content isn't duplicated as prose.
export async function parseSectionsFromPdf(pdfPath: string, overrides?: SectionOverrides): Promise<ParsedSections> {
  const { extractPdfContent } = await import('./extract');
  const { text, tables } = await extractPdfContent(pdfPath);
  const textNoTables = text.split('\n').filter(l => !/\t[^\t]*\t/.test(l)).join('\n');
  const parsed = parseSections(textNoTables, overrides);
  if (tables.length && !parsed.raw) {
    const captions = extractTableCaptions(text);
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // Attach each table's caption beneath it (paired in document order).
    const withCaptions = tables.map((t, i) =>
      captions[i] ? `${t}<p class="table-caption">${esc(captions[i])}</p>` : t,
    );
    parsed.tables = [...(parsed.tables ?? []), ...withCaptions];
  }
  return parsed;
}

// The list of detected body headings a student can re-classify: each section
// heading (as a 'header') and each subheading (as a 'subheader'), in order.
// Derived from an auto-parse so front-matter, references, etc. are excluded.
export function getHeadingCandidates(sections: ParsedSections): Array<{ text: string; level: 'header' | 'subheader' }> {
  const out: Array<{ text: string; level: 'header' | 'subheader' }> = [];
  for (const s of sections.body) {
    out.push({ text: s.heading, level: 'header' });
    for (const sub of s.subsections) {
      if (sub.subheading) out.push({ text: sub.subheading, level: 'subheader' });
    }
  }
  return out;
}

// Convert raw mammoth HTML inner content to plain text, faithfully preserving all characters.
function htmlToText(inner: string): string {
  return inner
    .replace(/<br\s*\/?>/gi, ' ')          // line breaks → space
    .replace(/<[^>]+>/g, '')               // strip all remaining tags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\s+/g, ' ')
    .trim();
}

// A fully-italic line is often a real subheading — but authors also italicise
// inline citations ("(Janssen Research & Development, LLC, 2025)"), which must
// NOT be mistaken for headings.
function looksLikeCitation(text: string): boolean {
  const t = text.trim();
  if (t.startsWith('(') && t.endsWith(')')) return true;      // wrapped parenthetical
  if (/\(\d{4}\)/.test(t)) return true;                        // "(2023)"
  if (/,\s*\d{4}\)?\s*$/.test(t)) return true;                 // "…, 2025)" / "…, 2025"
  if (/\bet al\.?/i.test(t)) return true;                      // "Smith et al."
  return false;
}

// Classify a block's heading level from its formatting.
//   1 = main section heading (bold, <h1>/<h2>, or a known section name)
//   2 = subheading (italic, or <h3>)
//   0 = not a heading (ordinary body text)
// Raw heading format, before deciding whether italic means main-level or sub.
// Numbered / ALL-CAPS auto-detection was intentionally removed: it produced many
// false positives on numbered lists and table-cell abbreviations. Detection keys
// off explicit bold/italic formatting, which authors use reliably, plus the known
// section-name list. Editors can re-classify anything in "Edit sections".
type HeadingFormat = 'main' | 'italic' | 'sub' | 'none';

function headingFormat(rawInner: string, tag: string, text: string): HeadingFormat {
  const textNoColon = text.endsWith(':') ? text.slice(0, -1).trim() : text;

  if (tag === 'h1' || tag === 'h2') return 'main';
  if (tag === 'h3') return 'sub';

  // A recognised section name is always a main heading, whatever its formatting.
  if (isKnownSectionName(textNoColon)) return 'main';

  // Headings are short; a long line or one ending like a sentence is body text.
  if (textNoColon.length > 120 || textNoColon.endsWith('.')) return 'none';

  const innerT = rawInner.trim();
  const fullyBold = /^<strong[^>]*>[\s\S]*<\/strong>$/i.test(innerT);
  const fullyItalic = /^<em[^>]*>[\s\S]*<\/em>$/i.test(innerT);

  if (fullyBold && !looksLikeCitation(textNoColon)) return 'main';
  if (fullyItalic && !looksLikeCitation(textNoColon)) return 'italic';

  return 'none';
}

/**
 * Stretch any row that is narrower than the table so its right edge lines up.
 *
 * Authors merge header cells in Word without Word always recording a grid span,
 * which leaves a two-cell heading sitting above a five-column body and a torn
 * right edge in the proof. Widening the row's LAST cell fills the gap without
 * inventing a column or moving any value. Rows carrying a rowspan from above are
 * measured with that occupancy included, so they are not padded twice.
 */
function padShortRows(rows: string[]): void {
  const parse = (row: string) =>
    Array.from(row.matchAll(/<(t[dh])([^>]*)>([\s\S]*?)<\/\1>/gi)).map(m => ({
      tag: m[1], attrs: m[2], text: m[3],
      colspan: Math.max(1, Number(/colspan\s*=\s*"?(\d{1,2})/i.exec(m[2])?.[1] ?? 1)),
      rowspan: Math.max(1, Number(/rowspan\s*=\s*"?(\d{1,2})/i.exec(m[2])?.[1] ?? 1)),
    }));

  const parsed = rows.map(parse);
  const carried = new Array(parsed.length).fill(0);
  parsed.forEach((cells, r) => {
    for (const c of cells) {
      for (let k = 1; k < c.rowspan; k++) if (r + k < carried.length) carried[r + k] += c.colspan;
    }
  });

  const widths = parsed.map((cells, r) => carried[r] + cells.reduce((n, c) => n + c.colspan, 0));
  const freq = new Map<number, number>();
  for (const w of widths) freq.set(w, (freq.get(w) ?? 0) + 1);
  const full = Array.from(freq.entries()).sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];

  parsed.forEach((cells, r) => {
    const deficit = full - widths[r];
    if (deficit <= 0 || cells.length === 0) return;
    const last = cells[cells.length - 1];
    last.colspan += deficit;
    rows[r] = `<tr>${cells.map(c =>
      `<${c.tag}${c.colspan > 1 ? ` colspan="${c.colspan}"` : ''}` +
      `${c.rowspan > 1 ? ` rowspan="${c.rowspan}"` : ''}>${c.text}</${c.tag}>`,
    ).join('')}</tr>`;
  });
}

// Pull <table> blocks out of the HTML so their cell paragraphs don't leak into
// the section stream as fake headings. Each table is replaced with a sentinel
// paragraph (@@TABLEk@@) that preserves its position, and returned as clean HTML.
function extractTables(html: string): { html: string; tables: string[] } {
  const tables: string[] = [];
  const cleaned = html.replace(/<table[\s\S]*?<\/table>/gi, (tbl) => {
    const rows: string[] = [];
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rm: RegExpExecArray | null;
    while ((rm = rowRe.exec(tbl)) !== null) {
      const cells: string[] = [];
      const cellRe = /<(t[dh])([^>]*)>([\s\S]*?)<\/\1>/gi;
      let cm: RegExpExecArray | null;
      while ((cm = cellRe.exec(rm[1])) !== null) {
        const tag = cm[1].toLowerCase() === 'th' ? 'th' : 'td';
        // Merged cells must survive. Word tables put a single "Whites" heading
        // over a pair of data columns; dropping its colspan slid every heading
        // one column left of the numbers it labels.
        const span = (attr: string) => {
          const m = new RegExp(`${attr}\\s*=\\s*"?(\\d{1,2})`, 'i').exec(cm![2]);
          return m && Number(m[1]) > 1 ? ` ${attr}="${Number(m[1])}"` : '';
        };
        const cellText = htmlToText(cm[3])
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        cells.push(`<${tag}${span('colspan')}${span('rowspan')}>${cellText}</${tag}>`);
      }
      if (cells.length) rows.push(`<tr>${cells.join('')}</tr>`);
    }
    if (rows.length === 0) return '';
    padShortRows(rows);
    const k = tables.length;
    tables.push(`<table class="doc-table">${rows.join('')}</table>`);
    return `<p>@@TABLE${k}@@</p>`;
  });
  return { html: cleaned, tables };
}

// Student/editor re-classification of detected headings, keyed by the heading's
// normalized text: 'header' → main section, 'subheader' → nested subsection,
// 'none' → not a heading (folded into body text).
export type HeadingChoice = 'header' | 'subheader' | 'none';
export type SectionOverrides = Record<string, HeadingChoice>;

function parseSectionsFromHtml(html: string, overrides?: SectionOverrides): ParsedSections {
  // level: 0 = body text, 1 = main heading, 2 = subheading; table segments carry html.
  type Seg = { level: 0 | 1 | 2; text: string; table?: string; fmt?: HeadingFormat; indent?: number };
  const segments: Seg[] = [];

  const { html: noTableHtml, tables } = extractTables(html);

  // Pass 1 — collect segments with their raw heading format (italic unresolved).
  const blockRe = /<(h[1-3]|p|ol|ul)([^>]*)>([\s\S]*?)<\/\1>/gi;
  // Indent bucket recorded on each paragraph by parseSectionsFromDocx.
  const indentOf = (attrs: string) => Number(/\bpj-ind-(\d+)\b/.exec(attrs)?.[1] ?? 0);
  const indentBuckets: number[] = [];
  let m: RegExpExecArray | null;
  let olCounter = 1; // persists across consecutive <ol> blocks, resets at each heading

  while ((m = blockRe.exec(noTableHtml)) !== null) {
    const tag = m[1].toLowerCase();
    const attrs = m[2];
    const innerHtml = m[3];
    const indent = indentOf(attrs);

    if (tag === 'ol' || tag === 'ul') {
      const isOrdered = tag === 'ol';
      if (!isOrdered) olCounter = 1;
      const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
      let liM: RegExpExecArray | null;
      while ((liM = liRe.exec(innerHtml)) !== null) {
        const text = htmlToText(liM[1]);
        if (text && text.replace(/[^a-z0-9]/gi, '').length >= 3) {
          segments.push({ level: 0, text: isOrdered ? `${olCounter++}. ${text}` : `• ${text}` });
        }
      }
    } else {
      const text = htmlToText(innerHtml);
      const tableMatch = text.match(/^@@TABLE(\d+)@@$/);
      if (tableMatch) {
        segments.push({ level: 0, text: '', table: tables[Number(tableMatch[1])] });
        continue;
      }
      if (!text || text.replace(/[^a-z0-9]/gi, '').length < 3) continue;
      const textNoColon = text.endsWith(':') ? text.slice(0, -1).trim() : text;
      const fmt = headingFormat(innerHtml, tag, text);
      if (fmt !== 'none') olCounter = 1;
      if (fmt === 'none') indentBuckets.push(indent);
      segments.push({ level: 0, text: fmt !== 'none' ? textNoColon : text, fmt, indent });
    }
  }

  if (segments.length === 0) return { body: [], raw: '' };

  // Resolve raw indents into nesting levels now that the whole document is known.
  const toLevel = indentLevels(indentBuckets);
  for (const seg of segments) seg.indent = seg.indent ? toLevel(seg.indent) : 0;

  // Decide whether italic headings are a MAIN level or a SUB level for THIS
  // document. Some authors italicise their main section headings (no bold at
  // all); others use bold for sections and italic for subheadings. If italic
  // headings outnumber bold body-level headings, italic is the main level.
  const boldBodyCount = segments.filter(s => s.fmt === 'main' && classifyHeading(s.text) === 'body').length;
  const italicCount = segments.filter(s => s.fmt === 'italic').length;
  const italicIsMain = italicCount > boldBodyCount;
  for (const s of segments) {
    if (s.fmt === 'main') s.level = 1;
    else if (s.fmt === 'sub') s.level = 2;
    else if (s.fmt === 'italic') s.level = italicIsMain ? 1 : 2;
  }

  // Apply the student's/editor's heading re-classification. Any detected heading
  // whose text matches an override is forced to that role; 'none' demotes it to
  // body text. Keys are normalized so the client can send raw heading text.
  if (overrides && Object.keys(overrides).length) {
    const normMap: SectionOverrides = {};
    for (const [k, v] of Object.entries(overrides)) normMap[normalise(k)] = v;

    // A 'none' on every heading leaves the article as one undifferentiated block
    // with all its figures stranded at the end. That is never what an author
    // means by "not a heading" — it is what a mis-click or a stale override set
    // produces — and it is unrecoverable from the proof, so the demotions are
    // ignored when they would erase the entire structure. Explicit
    // header/subheader choices are always honoured.
    // The form seeds a choice for EVERY detected heading, so a normal override
    // set is a mix of 'header' and 'subheader'. An all-'none' set is therefore
    // not a considered decision — it is a degenerate set (mis-clicks, or a stale
    // set carried over from another document) that flattens the article into one
    // block and strands every figure at the end.
    const values = Object.values(normMap);
    const wouldEraseEverything = values.length >= 3 && values.every(v => v === 'none');

    for (const s of segments) {
      if (s.level === 0) continue;
      const choice = normMap[normalise(s.text)];
      if (choice === 'header') s.level = 1;
      else if (choice === 'subheader') s.level = 2;
      else if (choice === 'none' && !wouldEraseEverything) s.level = 0;
    }
  }

  // Merge a bare URL paragraph that immediately follows a body paragraph
  // (reference pattern: <ol><li>Author, Title, date,</li></ol><p>www.url.com</p>)
  const merged: Seg[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const next = i + 1 < segments.length ? segments[i + 1] : null;
    if (seg.level === 0 && !seg.table && next && next.level === 0 && !next.table &&
        /^(https?:\/\/|www\.)/i.test(next.text)) {
      merged.push({ level: 0, text: seg.text + ' ' + next.text, indent: seg.indent });
      i++;
    } else {
      merged.push(seg);
    }
  }

  groupTableFragments(merged);
  attachTableCaptions(merged);

  return buildResult(mergedSegmentsToBlocks(merged));
}

// ── Table grouping & caption pairing (DOCX path) ─────────────────────────────

type TableSeg = { level: 0 | 1 | 2; text: string; table?: string };

const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Text of a table's first cell — the signal that a fragment repeats a header row. */
function firstCellText(tableHtml: string): string {
  const m = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/i.exec(tableHtml);
  return m ? m[1].replace(/\s+/g, ' ').trim().toLowerCase() : '';
}

/** Rows of a table, so two fragments can be spliced into one <table>. */
function tableRows(tableHtml: string): string {
  const m = /<table[^>]*>([\s\S]*?)<\/table>/i.exec(tableHtml);
  return m ? m[1] : '';
}

/** Row count and the table's usual number of columns — its "shape". */
function tableShape(tableHtml: string): { rows: number; cols: number } {
  // Width is the number of COLUMNS a row occupies, not the number of cells it
  // contains — a cell with colspan="2" fills two of them.
  const widths = Array.from(tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi))
    .map(m => Array.from(m[1].matchAll(/<t[dh]([^>]*)>/gi))
      .reduce((n, c) => n + Math.max(1, Number(/colspan\s*=\s*"?(\d{1,2})/i.exec(c[1])?.[1] ?? 1)), 0));
  if (widths.length === 0) return { rows: 0, cols: 0 };
  const freq = new Map<number, number>();
  for (const w of widths) freq.set(w, (freq.get(w) ?? 0) + 1);
  // Most common width, ties broken toward the wider row.
  const cols = Array.from(freq.entries()).sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
  return { rows: widths.length, cols };
}

/**
 * A long table split across several Word tables arrives as consecutive table
 * segments with nothing between them. Fuse those back into one so the proof
 * shows one table with one caption instead of a stack of anonymous fragments —
 * while keeping genuinely separate back-to-back tables apart.
 *
 * A fragment continues the open table when it has the same column count. Two
 * signals start a new one instead:
 *   • a different column count — a different table, not a continuation;
 *   • a first cell repeating the open table's first cell — Word's repeated
 *     header row, i.e. the author started a fresh table with the same stub.
 * A one-or-two-row opener is treated as a title band whose shape is unknown, so
 * the fragment that follows sets the group's column count rather than splitting.
 */
function groupTableFragments(segs: TableSeg[]): void {
  let openIdx = -1;    // fragment currently accumulating
  let openHead = '';   // its first-cell text
  let openCols = 0;    // its column count; 0 = not yet known (title band)

  const startGroup = (i: number, head: string, shape: { rows: number; cols: number }) => {
    openIdx = i;
    openHead = head;
    openCols = shape.rows <= 2 ? 0 : shape.cols;
  };

  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    if (seg.table) {
      const head = firstCellText(seg.table);
      const shape = tableShape(seg.table);
      const repeatsHeader = openIdx >= 0 && !!openHead && head === openHead;
      const continues = openIdx >= 0 && !repeatsHeader && (openCols === 0 || shape.cols === openCols);

      if (continues) {
        segs[openIdx].table = segs[openIdx].table!.replace(
          /<\/table>/i, `${tableRows(seg.table)}</table>`,
        );
        if (openCols === 0 && shape.rows > 2) openCols = shape.cols;
        seg.table = undefined;
        seg.text = '';
      } else {
        startGroup(i, head, shape);
      }
      continue;
    }
    // Any real content between tables closes the open group. A caption paragraph
    // does not: it belongs to the table it sits beside.
    if (seg.text && !isCaption(seg.text)) { openIdx = -1; openHead = ''; openCols = 0; }
  }

  // Re-align widths on the MERGED tables. A fragment is padded against its own
  // rows when it is first extracted, but a heading split into its own one-row
  // fragment only reveals itself as narrow once the body rows are joined on.
  for (const seg of segs) {
    if (!seg.table) continue;
    const rows = Array.from(seg.table.matchAll(/<tr[^>]*>[\s\S]*?<\/tr>/gi)).map(m => m[0]);
    if (rows.length < 2) continue;
    padShortRows(rows);
    seg.table = seg.table.replace(
      /(<table[^>]*>)[\s\S]*?(<\/table>)/i,
      (_full, open: string, close: string) => `${open}${rows.join('')}${close}`,
    );
  }
}

/**
 * Give every recovered table its caption. Adjacent captions are matched first;
 * anything left over is paired with the remaining un-captioned tables in
 * document order, so a caption the author placed a paragraph away from its table
 * is still printed instead of being silently dropped as stray caption text.
 */
function attachTableCaptions(segs: TableSeg[]): void {
  const isTableCaption = (t: string) => /^(table\s+s?\d+\s*[:.]|table of\b)/i.test(t.trim());
  const tableIdx = segs.map((s, i) => (s.table ? i : -1)).filter(i => i >= 0);
  const captioned = new Set<number>();

  const consume = (capIdx: number, tIdx: number) => {
    segs[tIdx].table += `<p class="table-caption">${escHtml(segs[capIdx].text.trim())}</p>`;
    segs[capIdx].text = '';
    captioned.add(tIdx);
  };

  // Pass 1 — a caption directly after (preferred) or before its table.
  for (const t of tableIdx) {
    for (const j of [t + 1, t - 1]) {
      const nb = segs[j];
      if (nb && !nb.table && nb.text && isTableCaption(nb.text)) { consume(j, t); break; }
    }
  }

  // Pass 2 — leftovers, paired in document order.
  const strays = segs
    .map((s, i) => (!s.table && s.text && isTableCaption(s.text) ? i : -1))
    .filter(i => i >= 0);
  const orphans = tableIdx.filter(i => !captioned.has(i));
  for (let k = 0; k < Math.min(strays.length, orphans.length); k++) {
    consume(strays[k], orphans[k]);
  }
}

// Group leveled segments into section blocks. A level-1 heading opens a new
// section; a level-2 heading opens a new subsection within it; body text and
// tables attach to the current subsection / section.
interface RawSubsection { subheading?: string; text: string; tables?: string[] }

// A nested paragraph is stored with one leading tab per level. Tabs survive JSON
// and the admin "Edit sections" textarea, and the renderer turns them back into
// a left margin — so the author's own list indentation reaches the proof.
const INDENT_MARK = '\t';
interface RawBlock { heading: string; subsections: RawSubsection[]; tables: string[] }

function mergedSegmentsToBlocks(
  segs: Array<{ level: 0 | 1 | 2; text: string; table?: string; indent?: number }>,
): RawBlock[] {
  const blocks: RawBlock[] = [];
  let cur: RawBlock = { heading: '', subsections: [], tables: [] };
  let curSub: RawSubsection | null = null;

  const ensureSub = () => {
    if (!curSub) { curSub = { text: '' }; cur.subsections.push(curSub); }
    return curSub;
  };

  for (const seg of segs) {
    if (seg.level === 1) {
      if (cur.heading || cur.subsections.length || cur.tables.length) blocks.push(cur);
      cur = { heading: seg.text, subsections: [], tables: [] };
      curSub = null;
    } else if (seg.level === 2) {
      curSub = { subheading: seg.text, text: '' };
      cur.subsections.push(curSub);
    } else if (seg.table) {
      // Keep the table where the author put it. Collecting them at section level
      // used to dump every table of a long Results section in one block pages
      // away from the prose that discusses it.
      const sub = ensureSub();
      (sub.tables ??= []).push(seg.table);
    } else if (!seg.text || isCaption(seg.text)) {
      // Drop figure/table caption paragraphs from body text (figures are uploaded
      // separately; table captions are attached to their table).
      continue;
    } else {
      const sub = ensureSub();
      const para = INDENT_MARK.repeat(seg.indent ?? 0) + seg.text;
      sub.text = sub.text ? `${sub.text}\n\n${para}` : para;
    }
  }
  if (cur.heading || cur.subsections.length || cur.tables.length) blocks.push(cur);
  return blocks;
}

// ── PDF / plain-text path ─────────────────────────────────────────────────────

// PDFs carry no bold/italic info, so a heading can only be guessed from shape.
// A recognised section name always counts. Otherwise a heading must be a short,
// standalone, Title-Case line — with hard guards against the things that used to
// be mis-detected: running footers (stripped earlier), reference lines (heading
// detection stops once References begins — see parseSections), table cells (tabs),
// figure/table captions, and page numbers. Anything less certain stays body text.
function looksLikeHeading(line: string): boolean {
  const t = line.trim();
  if (isKnownSectionName(t)) return true;

  if (!t || t.length > 85) return false;
  if (/\t/.test(t)) return false;                     // table cell (tab-separated)
  if (/[.,;:]$/.test(t)) return false;                // ends like a sentence
  if (/^\d/.test(t)) return false;                    // starts with a number
  if (/^(table|figure|fig\.)\b/i.test(t)) return false; // figure/table caption
  if (/[([{]/.test(t)) return false;                  // citations/parentheticals

  const words = t.split(/\s+/);
  if (words.length < 2 || words.length > 10) return false;
  if (!/^[A-Z]/.test(t)) return false;

  // Title Case: most words capitalised, few filler words → looks like a heading,
  // not a sentence that merely happens to start with a capital letter.
  const fillers = new Set(['the','a','an','in','of','and','to','is','was','are','for','on','at','by','with','from','or','as','that','this']);
  const lower = words.map(w => w.toLowerCase());
  const fillerRatio = lower.filter(w => fillers.has(w)).length / words.length;
  if (fillerRatio >= 0.5) return false;
  const capRatio = words.filter(w => /^[A-Z0-9]/.test(w)).length / words.length;
  return capRatio >= 0.6;
}

// Detect and remove running headers/footers: a short line whose text (ignoring
// page numbers) repeats on many pages. This strips things like a running title
// printed at the bottom of every page, which otherwise become fake headings.
function stripRunningHeadersFooters(text: string): string {
  const lines = text.split('\n');
  const norm = (l: string) =>
    l.replace(/\t/g, ' ').replace(/\b\d+\b/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const freq = new Map<string, number>();
  for (const l of lines) {
    const n = norm(l);
    if (n.length >= 8 && n.length <= 100) freq.set(n, (freq.get(n) ?? 0) + 1);
  }
  // Repeats on 4+ pages → almost certainly a running header/footer, not content.
  const repeated = new Set<string>();
  freq.forEach((count, n) => { if (count >= 4) repeated.add(n); });
  if (repeated.size === 0) return text;
  return lines.filter(l => !repeated.has(norm(l))).join('\n');
}

// A PDF has no paragraph markers, so a paragraph break is inferred: the current
// line ends a sentence AND is clearly shorter than a full text line (i.e. it's a
// last line, not a mid-paragraph wrap).
function endsSentence(line: string): boolean {
  return /[.!?]["'”’)\]]?$/.test(line.trim());
}

// APA reference entries start with an author or an organisation with a year;
// continuation/title lines don't. Unicode-aware so accented names (Huérfano,
// Pérez) are recognised.
function looksLikeRefStart(line: string): boolean {
  const t = line.trim();
  const U = 'A-ZÀ-ÖØ-Þ';                    // uppercase incl. Latin-1 accents
  const L = "A-Za-zÀ-ÖØ-öø-ÿ.'’\\-";        // any letter incl. accents + name punctuation (hyphen escaped)
  if (new RegExp(`^[${U}][${L}]+,\\s+[${U}]\\.?`).test(t)) return true;                        // "Al-Amrani, S." / "Huérfano-Maldonado, Y."
  if (new RegExp(`^[${U}][${L}]+\\s+[${U}][${L}]+,\\s+[${U}]`).test(t)) return true;            // "Yoleidy Huérfano-Maldonado, Mora, M."
  if (new RegExp(`^[${U}][${L}&]*(\\s+[${U}&][${L}&]*){0,6}\\.?\\s*\\(\\d{4}`).test(t)) return true; // "American Cancer Society. (2023"
  return false;
}

// Figure/table caption lines that shouldn't appear in the body text (figures are
// uploaded separately; tables are recovered on their own).
function isCaption(text: string): boolean {
  const t = text.trim();
  return /^(figure|table|fig\.?)\s*\d*\s*[:.]/i.test(t) || /^table of\b/i.test(t);
}

export function parseSections(rawText: string, overrides?: SectionOverrides): ParsedSections {
  if (!rawText || rawText.trim().length < 50) {
    return { body: [], raw: rawText ?? '' };
  }

  const lines = stripRunningHeadersFooters(rawText)
    .split('\n')
    .map(l => l.trim())
    // Drop pdf-parse page-break markers and blank lines. Blank lines in a PDF are
    // page-break/footer artifacts, NOT paragraph boundaries — treating them as
    // breaks split paragraphs at every page. Paragraph breaks come from the
    // short-sentence-ending-line signal instead.
    .filter(l => l !== '' && !/^--\s*\d+\s+of\s+\d+\s*--$/i.test(l));

  // Estimate the full column width so short last-lines can be told from wraps.
  const lens = lines.map(l => l.length).filter(n => n > 0).sort((a, b) => a - b);
  const fullWidth = lens.length ? lens[Math.floor(lens.length * 0.9)] : 80;
  const shortLineMax = fullWidth * 0.85;

  interface Block { heading: string; paragraphs: string[] }
  const blocks: Block[] = [];
  let cur: Block = { heading: '', paragraphs: [] };
  let pendingLines: string[] = [];
  let refAccum = '';       // the reference entry currently being assembled
  // Once References starts, stop heading detection and switch to entry-splitting.
  let inReferences = false;

  const flushPara = () => {
    const t = pendingLines.join(' ').replace(/\s+/g, ' ').trim();
    if (t && !isCaption(t)) cur.paragraphs.push(t); // drop figure/table captions
    pendingLines = [];
  };
  const flushRef = () => {
    const t = refAccum.replace(/\s+/g, ' ').trim();
    if (t) cur.paragraphs.push(t);
    refAccum = '';
  };

  for (const line of lines) {
    const t = line.trim();

    if (!inReferences && looksLikeHeading(line)) {
      flushPara();
      if (cur.heading || cur.paragraphs.length > 0) blocks.push(cur);
      cur = { heading: t, paragraphs: [] };
      if (classifyHeading(t) === 'refs') inReferences = true;
      continue;
    }

    if (inReferences) {
      if (t === '') continue;
      // New entry when the previous one already has its (year …) — matches
      // "(2021)" and date forms like "(2023, June 15)" — and this line starts
      // like an author/organisation.
      if (refAccum && /\(\d{4}/.test(refAccum) && looksLikeRefStart(t)) flushRef();
      refAccum = refAccum ? `${refAccum} ${t}` : t;
      continue;
    }

    // A caption line starts its own paragraph so isCaption() can drop it cleanly.
    if (isCaption(t)) flushPara();
    pendingLines.push(t);
    // Short sentence-ending line → paragraph break.
    if (endsSentence(t) && t.length < shortLineMax) flushPara();
  }
  flushPara();
  flushRef();
  if (cur.heading || cur.paragraphs.length > 0) blocks.push(cur);

  const knownCount = blocks.filter(b => {
    const n = normalise(b.heading);
    return KNOWN_INTRO.has(n) || KNOWN_CONCL.has(n) || KNOWN_ACK.has(n) || KNOWN_REFS.has(n) || KNOWN_SKIP.has(n);
  }).length;

  // If we found no known headings AND no other headings, fall back to raw
  if (blocks.length <= 1 && knownCount === 0) {
    return { body: [], raw: rawText };
  }

  // Adapt the flat {heading, paragraphs} blocks to the shared RawBlock shape.
  let rawBlocks: RawBlock[] = blocks.map(b => ({
    heading: b.heading,
    subsections: [{ text: b.paragraphs.join('\n\n') }],
    tables: [],
  }));
  // Apply the student's/editor's heading re-classification (same as the DOCX path).
  if (overrides && Object.keys(overrides).length) {
    rawBlocks = applyBlockOverrides(rawBlocks, overrides);
  }
  return buildResult(rawBlocks);
}

// Re-classify detected headings for the flat (PDF) block list: 'none' demotes a
// heading into the previous section's body text; 'subheader' nests it as a
// subsection of the previous section; 'header' keeps it. Mirrors the DOCX path
// so a PDF submission honours the header/subheader/remove table too.
function applyBlockOverrides(rawBlocks: RawBlock[], overrides: SectionOverrides): RawBlock[] {
  const normMap: SectionOverrides = {};
  for (const [k, v] of Object.entries(overrides)) normMap[normalise(k)] = v;
  const out: RawBlock[] = [];
  for (const b of rawBlocks) {
    const choice = b.heading ? normMap[normalise(b.heading)] : undefined;
    const prev = out[out.length - 1];
    if (choice === 'none' && prev) {
      const text = [b.heading, blockText(b)].filter(Boolean).join('\n\n');
      const sub = prev.subsections[prev.subsections.length - 1] ?? (prev.subsections.push({ text: '' }), prev.subsections[prev.subsections.length - 1]);
      sub.text = sub.text ? `${sub.text}\n\n${text}` : text;
      prev.tables.push(...b.tables);
    } else if (choice === 'subheader' && prev) {
      prev.subsections.push({ subheading: b.heading, text: blockText(b) });
      prev.tables.push(...b.tables);
    } else {
      out.push(b);
    }
  }
  return out;
}

// ── Shared result builder ─────────────────────────────────────────────────────

function blockText(block: RawBlock): string {
  return block.subsections.map(s => s.text).filter(Boolean).join('\n\n').trim();
}

// A leading block is title/author front-matter if most of its lines read like
// author names, affiliations, or correspondence rather than prose.
function looksLikeAuthorBlock(block: RawBlock): boolean {
  const ps = blockText(block).split(/\n\n/).filter(Boolean);
  if (ps.length === 0) return false;
  const authorish = ps.filter(p => {
    if (p.length > 200) return false;
    if (/@/.test(p)) return true;
    if (/\b(universit|college|school|institute|department|hospital|laborator|academy|center|centre)\b/i.test(p)) return true;
    if (/correspond/i.test(p)) return true;
    if (/^\*/.test(p)) return true;
    if (p.length < 90 && /[,*\d]/.test(p) && /[A-Za-z]/.test(p)) return true;
    return false;
  }).length;
  return authorish >= Math.ceil(ps.length / 2);
}

function buildResult(blocks: RawBlock[]): ParsedSections {
  const result: ParsedSections = { body: [] };

  // Drop leading front-matter (title, authors, affiliation, correspondence).
  const firstContentIdx = blocks.findIndex(b => CONTENT_START.has(normalise(b.heading)));
  if (firstContentIdx > 0) {
    blocks = blocks.slice(firstContentIdx);
  } else if (firstContentIdx === -1 && blocks.length > 0 && looksLikeAuthorBlock(blocks[0])) {
    blocks = blocks.slice(1);
  }

  const orphanTables: string[] = [];
  for (const block of blocks) {
    const text = blockText(block);
    const kind = classifyHeading(block.heading);
    const blockTables = [...block.tables, ...block.subsections.flatMap(s => s.tables ?? [])];

    // Tables in non-body sections (e.g. supplementary tables after References)
    // are collected separately so they still render instead of being dropped.
    if (kind !== 'body' && blockTables.length) orphanTables.push(...blockTables);

    if (kind === 'skip') continue;
    if (!block.heading && !text && block.tables.length === 0) continue;

    // Preamble text (before any heading) goes into intro if we don't have one yet.
    if (!block.heading) {
      if (!result.introduction && text.length > 50) result.introduction = text;
      continue;
    }

    if (kind === 'intro') {
      result.introduction = (result.introduction ? result.introduction + '\n\n' : '') + text;
    } else if (kind === 'conclusion') {
      result.conclusion = (result.conclusion ? result.conclusion + '\n\n' : '') + text;
      // Remember where the Conclusion sat in the manuscript so the proof can put
      // it back there. Without this it was always rendered last, pushing it past
      // anything the author wrote after it (appendices, abbreviation lists).
      result.conclusionAfter ??= result.body.length;
    } else if (kind === 'ack') {
      result.acknowledgments = text;
    } else if (kind === 'refs') {
      result.references = text;
    } else {
      const subsections = block.subsections.filter(s => s.subheading || s.text.trim() || s.tables?.length);
      result.body.push({
        heading: block.heading,
        subsections: subsections.length ? subsections : [{ text }],
        ...(block.tables.length ? { tables: block.tables } : {}),
      });
    }
  }

  if (orphanTables.length) result.tables = orphanTables;
  return result;
}

// ── Section name matching ─────────────────────────────────────────────────────

export type SectionMatchResult =
  | { status: 'matched'; index: number; heading: string }
  | { status: 'ambiguous'; candidates: string[] }
  | { status: 'unmatched' };

/**
 * Given a section name typed by the student/editor, find the closest
 * section index in the parsed document. Tries exact → starts-with → contains.
 * Returns 'ambiguous' when multiple sections score equally.
 */
// Section pickers hand back a breadcrumb — "Results → Status of Key Urban
// Infrastructure Domains → Transportation". The last segment is the section the
// author actually chose; the earlier ones are only there to disambiguate it for
// a human reader. Matched whole, a breadcrumb is dominated by its own root:
// "results status of key…" is prefixed by the heading "Results", which scores
// higher than the leaf it contains, so every figure in the paper collapses onto
// "Results" — and reports itself as a confident match while doing it.
const BREADCRUMB_SPLIT = /\s*(?:→|➔|»|\||->|>>|>)\s*/;

export function matchSectionByName(name: string, sections: ParsedSections): SectionMatchResult {
  const segments = name.split(BREADCRUMB_SPLIT).map(s => s.trim()).filter(Boolean);
  if (segments.length > 1) {
    // Try the leaf on its own first; only fall back to the raw string if the
    // leaf is unrecognisable (e.g. the author typed a path we can't resolve).
    const leaf = matchSectionByName(segments[segments.length - 1], sections);
    if (leaf.status === 'matched') return leaf;
  }

  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  const normName = norm(name);
  if (!normName) return { status: 'unmatched' };

  const candidates: { index: number; heading: string; score: number }[] = [];

  function check(heading: string, idx: number) {
    const normH = norm(heading);
    let score = 0;
    // word-overlap: fraction of the typed name's words found in the heading
    const nameWords = normName.split(' ').filter(Boolean);
    const headWords = new Set(normH.split(' ').filter(Boolean));
    const overlap = nameWords.length
      ? nameWords.filter(w => headWords.has(w)).length / nameWords.length
      : 0;

    if (normH === normName)                                            score = 4; // exact
    else if (normH.startsWith(normName) || normName.startsWith(normH)) score = 3; // prefix
    // Every word of the name appears in this heading. Ranked above a bare
    // substring hit so "advances in treating T-ALL" picks "Advances in treating
    // pediatric T-ALL" rather than the subheading "T-ALL" it merely contains.
    else if (overlap === 1)                                            score = 2.5;
    else if (normH.includes(normName) || normName.includes(normH))     score = 2; // substring
    else if (overlap >= 0.6)                                           score = 1; // majority of words
    if (score > 0) candidates.push({ index: idx, heading, score });
  }

  // Subheadings are placement targets too. The submission form has always
  // offered them in its "Which section?" list (see getHeadingCandidates), but
  // matching only ever looked at top-level headings — so a student who picked a
  // subheading got "not found" and their figure fell back to a sequential guess.
  for (const t of placementTargetsFor(sections)) check(t.label, t.index);

  if (candidates.length === 0) return { status: 'unmatched' };

  // Sort by score desc; take top tier
  candidates.sort((a, b) => b.score - a.score);
  const topScore = candidates[0].score;
  const top = candidates.filter(c => c.score === topScore);

  if (top.length === 1) return { status: 'matched', index: top[0].index, heading: top[0].heading };
  return { status: 'ambiguous', candidates: top.map(c => c.heading) };
}

/** Apply section-name matching to a figure array in-place. Returns the figures. */
export function applyFigureSectionMatches<T extends { sectionName?: string; sectionIndex?: number; sectionMatchStatus?: string; sectionMatchedHeading?: string }>(
  figures: T[],
  sections: ParsedSections,
): T[] {
  for (const fig of figures) {
    if (!fig.sectionName?.trim()) continue;
    const result = matchSectionByName(fig.sectionName, sections);
    fig.sectionMatchStatus = result.status;
    if (result.status === 'matched') {
      fig.sectionIndex = result.index;
      fig.sectionMatchedHeading = result.heading;
    } else {
      fig.sectionMatchedHeading = undefined;
    }
  }
  return figures;
}
