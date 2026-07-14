import { ParsedSections } from './db';

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
// Figure/table captions are collected & rendered separately, so any legend section must not leak in.
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

export async function parseSectionsFromDocx(docxPath: string, overrides?: SectionOverrides): Promise<ParsedSections> {
  const mammoth = await import('mammoth');
  const { value: html } = await mammoth.convertToHtml({ path: docxPath });
  return parseSectionsFromHtml(html, overrides);
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
      const cellRe = /<(t[dh])[^>]*>([\s\S]*?)<\/\1>/gi;
      let cm: RegExpExecArray | null;
      while ((cm = cellRe.exec(rm[1])) !== null) {
        const isHeader = cm[1].toLowerCase() === 'th';
        const cellText = htmlToText(cm[2])
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        cells.push(isHeader ? `<th>${cellText}</th>` : `<td>${cellText}</td>`);
      }
      if (cells.length) rows.push(`<tr>${cells.join('')}</tr>`);
    }
    if (rows.length === 0) return '';
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
  type Seg = { level: 0 | 1 | 2; text: string; table?: string; fmt?: HeadingFormat };
  const segments: Seg[] = [];

  const { html: noTableHtml, tables } = extractTables(html);

  // Pass 1 — collect segments with their raw heading format (italic unresolved).
  const blockRe = /<(h[1-3]|p|ol|ul)[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  let olCounter = 1; // persists across consecutive <ol> blocks, resets at each heading

  while ((m = blockRe.exec(noTableHtml)) !== null) {
    const tag = m[1].toLowerCase();
    const innerHtml = m[2];

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
      segments.push({ level: 0, text: fmt !== 'none' ? textNoColon : text, fmt });
    }
  }

  if (segments.length === 0) return { body: [], raw: '' };

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
    for (const s of segments) {
      if (s.level === 0) continue;
      const choice = normMap[normalise(s.text)];
      if (choice === 'header') s.level = 1;
      else if (choice === 'subheader') s.level = 2;
      else if (choice === 'none') s.level = 0;
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
      merged.push({ level: 0, text: seg.text + ' ' + next.text });
      i++;
    } else {
      merged.push(seg);
    }
  }

  return buildResult(mergedSegmentsToBlocks(merged));
}

// Group leveled segments into section blocks. A level-1 heading opens a new
// section; a level-2 heading opens a new subsection within it; body text and
// tables attach to the current subsection / section.
interface RawSubsection { subheading?: string; text: string }
interface RawBlock { heading: string; subsections: RawSubsection[]; tables: string[] }

function mergedSegmentsToBlocks(
  segs: Array<{ level: 0 | 1 | 2; text: string; table?: string }>,
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
      cur.tables.push(seg.table);
    } else {
      const sub = ensureSub();
      sub.text = sub.text ? `${sub.text}\n\n${seg.text}` : seg.text;
    }
  }
  if (cur.heading || cur.subsections.length || cur.tables.length) blocks.push(cur);
  return blocks;
}

// ── PDF / plain-text path ─────────────────────────────────────────────────────

function looksLikeHeading(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 100) return false;
  if (t.endsWith('.') || t.endsWith(',') || t.endsWith(';')) return false;
  const words = t.split(/\s+/);
  if (words.length > 12) return false;
  // All-caps word(s)
  if (t === t.toUpperCase() && /[A-Z]/.test(t)) return true;
  // Starts with capital, no lowercase 'e' at start of sentence words
  const n = normalise(t);
  if (KNOWN_INTRO.has(n) || KNOWN_CONCL.has(n) || KNOWN_ACK.has(n) || KNOWN_REFS.has(n)) return true;
  // Title-case short line with few very common filler words
  if (/^[A-Z]/.test(t)) {
    const fillers = new Set(['the', 'a', 'an', 'in', 'of', 'and', 'to', 'is', 'was', 'are', 'for', 'on', 'at', 'by', 'with', 'from']);
    const fillerCount = words.map(w => w.toLowerCase()).filter(w => fillers.has(w)).length;
    const ratio = fillerCount / words.length;
    if (ratio < 0.4 && words.length <= 8) return true;
  }
  return false;
}

export function parseSections(rawText: string): ParsedSections {
  if (!rawText || rawText.trim().length < 50) {
    return { body: [], raw: rawText ?? '' };
  }

  const lines = rawText.split('\n').map(l => l.trimEnd());

  interface Block { heading: string; paragraphs: string[] }
  const blocks: Block[] = [];
  let cur: Block = { heading: '', paragraphs: [] };
  let pendingLines: string[] = [];

  for (const line of lines) {
    if (looksLikeHeading(line)) {
      // Flush pending lines as a paragraph into current block
      const pending = pendingLines.join(' ').trim();
      if (pending) cur.paragraphs.push(pending);
      pendingLines = [];
      // Save current block
      if (cur.heading || cur.paragraphs.length > 0) blocks.push(cur);
      cur = { heading: line.trim(), paragraphs: [] };
    } else if (line.trim() === '') {
      // Blank line → flush accumulated lines as one paragraph
      const pending = pendingLines.join(' ').trim();
      if (pending) cur.paragraphs.push(pending);
      pendingLines = [];
    } else {
      pendingLines.push(line.trim());
    }
  }
  const pending = pendingLines.join(' ').trim();
  if (pending) cur.paragraphs.push(pending);
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
  const rawBlocks: RawBlock[] = blocks.map(b => ({
    heading: b.heading,
    subsections: [{ text: b.paragraphs.join('\n\n') }],
    tables: [],
  }));
  return buildResult(rawBlocks);
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

    // Tables in non-body sections (e.g. supplementary tables after References)
    // are collected separately so they still render instead of being dropped.
    if (kind !== 'body' && block.tables.length) orphanTables.push(...block.tables);

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
    } else if (kind === 'ack') {
      result.acknowledgments = text;
    } else if (kind === 'refs') {
      result.references = text;
    } else {
      const subsections = block.subsections.filter(s => s.subheading || s.text.trim());
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
export function matchSectionByName(name: string, sections: ParsedSections): SectionMatchResult {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  const normName = norm(name);
  if (!normName) return { status: 'unmatched' };

  const candidates: { index: number; heading: string; score: number }[] = [];
  let idx = 0;

  function check(heading: string) {
    const normH = norm(heading);
    let score = 0;
    if (normH === normName)                                        score = 4; // exact
    else if (normH.startsWith(normName) || normName.startsWith(normH)) score = 3; // prefix
    else if (normH.includes(normName) || normName.includes(normH)) score = 2; // substring
    else {
      // word-overlap: fraction of name words found in heading
      const nameWords = normName.split(' ').filter(Boolean);
      const headWords = new Set(normH.split(' ').filter(Boolean));
      const overlap = nameWords.filter(w => headWords.has(w)).length / nameWords.length;
      if (overlap >= 0.6) score = 1; // majority of words match
    }
    if (score > 0) candidates.push({ index: idx, heading, score });
    idx++;
  }

  if (sections.introduction) check('Introduction');
  for (const s of sections.body) check(s.heading);
  if (sections.conclusion) check('Conclusion');

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
