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
// Sections collected elsewhere on the form or handled separately — dropped from the body.
const KNOWN_SKIP    = new Set([
  'abstract', 'keywords', 'key words', 'keyword',
  'author contributions', 'author contribution', 'contributions',
  'funding', 'funding sources', 'financial support',
  'conflict of interest', 'conflicts of interest', 'competing interests',
  'declaration of competing interest', 'declaration of interest', 'disclosure', 'disclosures',
  'data availability', 'data availability statement', 'code availability',
  'ethics statement', 'ethics approval', 'ethical approval', 'ethics',
  'supplementary', 'supplementary materials', 'supplementary material', 'supplementary information',
  'supporting information', 'abbreviations', 'author information', 'orcid',
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

export async function parseSectionsFromDocx(docxPath: string): Promise<ParsedSections> {
  const mammoth = await import('mammoth');
  const { value: html } = await mammoth.convertToHtml({ path: docxPath });
  return parseSectionsFromHtml(html);
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

function isLikelyHeading(rawInner: string, text: string): boolean {
  const textNoColon = text.endsWith(':') ? text.slice(0, -1).trim() : text;

  // A recognised section name is always a heading, whatever its formatting
  // (covers plain-text and numbered headings like "3. Methods").
  if (isKnownSectionName(textNoColon)) return true;

  if (textNoColon.endsWith('.') || textNoColon.length > 120) return false;
  const innerT = rawInner.trim();

  // Fully bold or fully italic short line → heading.
  if (/^<strong[^>]*>[\s\S]*<\/strong>$/i.test(innerT)) return true;
  if (/^<em[^>]*>[\s\S]*<\/em>$/i.test(innerT)) return true;

  const words = textNoColon.split(/\s+/);
  // Numbered heading: "1 Title", "2.1 Title", "IV. Title" — short, title-ish.
  if (/^(\d+(\.\d+)*|[IVXLC]{1,4})[.)]?\s+[A-Z]/.test(textNoColon) && words.length <= 12) return true;
  // ALL-CAPS short standalone line → heading.
  if (textNoColon === textNoColon.toUpperCase() && /[A-Z]/.test(textNoColon) && words.length <= 10) return true;

  return false;
}

function parseSectionsFromHtml(html: string): ParsedSections {
  type Seg = { isHeading: boolean; text: string };
  const segments: Seg[] = [];

  // Walk top-level block elements in document order.
  // ol/ul are expanded into numbered/bulleted li items.
  const blockRe = /<(h[1-3]|p|ol|ul)[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  // Counter persists across consecutive <ol> blocks but resets at each heading,
  // so each section's numbered list starts from 1.
  let olCounter = 1;

  while ((m = blockRe.exec(html)) !== null) {
    const tag = m[1].toLowerCase();
    const innerHtml = m[2];

    if (tag === 'ol' || tag === 'ul') {
      const isOrdered = tag === 'ol';
      if (!isOrdered) olCounter = 1; // bullet lists don't share counter
      const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
      let liM: RegExpExecArray | null;
      while ((liM = liRe.exec(innerHtml)) !== null) {
        const text = htmlToText(liM[1]);
        if (text && text.replace(/[^a-z0-9]/gi, '').length >= 3) { // skip stray punctuation
          segments.push({ isHeading: false, text: isOrdered ? `${olCounter++}. ${text}` : `• ${text}` });
        }
      }
    } else {
      // Paragraph or explicit heading
      const text = htmlToText(innerHtml);
      // Skip near-empty segments (stray periods, etc.)
      if (!text || text.replace(/[^a-z0-9]/gi, '').length < 3) continue;
      const textNoColon = text.endsWith(':') ? text.slice(0, -1).trim() : text;
      const isExplicitHeading = tag.startsWith('h');
      const isStyleHeading = tag === 'p' && isLikelyHeading(innerHtml, text);
      const isHeading = isExplicitHeading || isStyleHeading;
      if (isHeading) olCounter = 1; // reset numbering at each new section
      segments.push({ isHeading, text: isHeading ? textNoColon : text });
    }
  }

  if (segments.length === 0) return { body: [], raw: '' };

  // Merge a bare URL paragraph that immediately follows a list-item paragraph
  // (common pattern: <ol><li>Author, Title, Journal, date,</li></ol><p>www.url.com</p>)
  const merged: Seg[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const next = i + 1 < segments.length ? segments[i + 1] : null;
    if (
      !seg.isHeading && next && !next.isHeading &&
      /^(https?:\/\/|www\.)/i.test(next.text)
    ) {
      merged.push({ isHeading: false, text: seg.text + ' ' + next.text });
      i++; // consume the URL segment
    } else {
      merged.push(seg);
    }
  }

  // Group into blocks by heading
  interface Block { heading: string; paragraphs: string[] }
  const blocks: Block[] = [];
  let cur: Block = { heading: '', paragraphs: [] };

  for (const seg of merged) {
    if (seg.isHeading) {
      if (cur.heading || cur.paragraphs.length > 0) blocks.push(cur);
      cur = { heading: seg.text, paragraphs: [] };
    } else {
      cur.paragraphs.push(seg.text);
    }
  }
  if (cur.heading || cur.paragraphs.length > 0) blocks.push(cur);

  return buildResult(blocks);
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

  return buildResult(blocks);
}

// ── Shared result builder ─────────────────────────────────────────────────────

// A leading block is title/author front-matter if most of its lines read like
// author names, affiliations, or correspondence rather than prose.
function looksLikeAuthorBlock(block: { heading: string; paragraphs: string[] }): boolean {
  const ps = block.paragraphs;
  if (ps.length === 0) return false;
  const authorish = ps.filter(p => {
    if (p.length > 200) return false;                                   // prose is long
    if (/@/.test(p)) return true;                                        // email
    if (/\b(universit|college|school|institute|department|hospital|laborator|academy|center|centre)\b/i.test(p)) return true;
    if (/correspond/i.test(p)) return true;                             // "*Correspondence:"
    if (/^\*/.test(p)) return true;
    if (p.length < 90 && /[,*\d]/.test(p) && /[A-Za-z]/.test(p)) return true; // "Bei, A.1*" author line
    return false;
  }).length;
  return authorish >= Math.ceil(ps.length / 2);
}

function buildResult(blocks: Array<{ heading: string; paragraphs: string[] }>): ParsedSections {
  const result: ParsedSections = { body: [] };

  // Drop leading front-matter (title, authors, affiliation, correspondence).
  // Preferred signal: a recognised article-start marker (Abstract / Keywords /
  // Introduction / Methods / Results / Discussion). Everything before the first
  // one is metadata the submission form already collects.
  const firstContentIdx = blocks.findIndex(b => CONTENT_START.has(normalise(b.heading)));
  if (firstContentIdx > 0) {
    blocks = blocks.slice(firstContentIdx);
  } else if (firstContentIdx === -1 && blocks.length > 0 && looksLikeAuthorBlock(blocks[0])) {
    // Fallback for papers with no recognisable start marker: if the very first
    // block is a title whose body is author/affiliation/correspondence lines, drop it.
    blocks = blocks.slice(1);
  }

  for (const block of blocks) {
    const text = block.paragraphs.join('\n\n').trim();
    const kind = classifyHeading(block.heading);

    if (kind === 'skip') continue;
    if (!block.heading && !text) continue;

    // Preamble text (before any heading) goes into intro if we don't have one yet
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
      result.body.push({ heading: block.heading, subsections: [{ text }] });
    }
  }

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
