// Type-only import: this module is shared with client components, so it must not
// pull the sqlite runtime in through ./db.
import type { Figure, ParsedSections } from './db';

// Single source of truth for how a parsed article maps onto rendered sections and
// how figures are distributed across them. Both the HTML template and the DOCX
// generator consume this, so the student preview, the PDF, and the editable Word
// document always agree on structure and figure placement.

export interface RenderedSubsection {
  subheading?: string;
  text: string;
  figures: Figure[];
  tables?: string[];
}

export interface RenderedSection {
  heading: string;
  subsections: RenderedSubsection[];
  figures: Figure[];
  tables?: string[];
}

/**
 * A place a float can be attached to, in display order. Sections and their
 * subheadings are both targets, so a figure the author tied to a subheading
 * ("Drug resistance mechanisms") lands there instead of falling back to the
 * sequential guess. `index` is what a Figure's `sectionIndex` refers to.
 */
export interface PlacementTarget {
  index: number;
  label: string;
  level: 1 | 2;
  sectionIdx: number;
  /** undefined = the section itself; otherwise the subsection within it */
  subIdx?: number;
}

export interface ArticleLayout {
  sections: RenderedSection[];
  targets: PlacementTarget[];
  trailingFigures: Figure[]; // figures whose target section doesn't exist — rendered at the end
  rawText?: string;          // set when the manuscript couldn't be structured
  allFiguresIfRaw: Figure[]; // figures to show before raw text
}

// The ordered list of sections that will actually render, in display order:
// Introduction (if present) → body sections → Conclusion. The conclusion is
// spliced back in at the position it occupied in the manuscript
// (`conclusionAfter`) rather than forced to the end, so a paper whose Conclusion
// is followed by an appendix ("List of Abbreviations") keeps the author's order.
function orderedSections(sections: ParsedSections): RenderedSection[] {
  const list: RenderedSection[] = [];
  const toRendered = (heading: string, subs: ParsedSections['body'][number]['subsections'], tables?: string[]): RenderedSection => ({
    heading,
    subsections: subs.map(s => ({ ...s, figures: [] })),
    figures: [],
    tables,
  });

  if (sections.introduction) {
    list.push(toRendered('Introduction', [{ text: sections.introduction }]));
  }

  const conclusion = sections.conclusion
    ? toRendered('Conclusion', [{ text: sections.conclusion }])
    : null;
  // Default (undefined) keeps the historical behaviour: conclusion last.
  const conclusionAt = sections.conclusionAfter ?? sections.body.length;

  sections.body.forEach((s, i) => {
    if (conclusion && i === conclusionAt) list.push(conclusion);
    list.push(toRendered(s.heading, s.subsections, s.tables));
  });
  if (conclusion && conclusionAt >= sections.body.length) list.push(conclusion);

  return list;
}

/** Flatten rendered sections into the ordered list of float placement targets. */
export function buildPlacementTargets(rendered: RenderedSection[]): PlacementTarget[] {
  const targets: PlacementTarget[] = [];
  rendered.forEach((sec, sectionIdx) => {
    targets.push({ index: targets.length, label: sec.heading, level: 1, sectionIdx });
    sec.subsections.forEach((sub, subIdx) => {
      if (!sub.subheading) return;
      targets.push({ index: targets.length, label: sub.subheading, level: 2, sectionIdx, subIdx });
    });
  });
  return targets;
}

/**
 * The float placement targets for a parsed manuscript, in display order. Shared
 * by the renderer, the "Appears with" dropdown, and section-name matching, so a
 * figure's `sectionIndex` means the same thing in all three.
 */
export function placementTargetsFor(sections: ParsedSections): PlacementTarget[] {
  if (sections.raw) return [];
  return buildPlacementTargets(orderedSections(sections));
}

/**
 * Where each float is CITED in the prose, as label key → target index.
 *
 * An author who writes "the five year survival rate (Figure 6)" has told us
 * exactly where Figure 6 belongs, in the one place that cannot be mis-filled: the
 * manuscript itself. That beats numbering figures sequentially and hoping, which
 * is what a blank "which section?" field used to fall back to — and which put a
 * survival-rate chart in the Introduction of a paper that cites it on page 18.
 *
 * Only the first citation counts; later mentions are cross-references back to a
 * figure the reader has already seen.
 */
function citationTargets(rendered: RenderedSection[], targets: PlacementTarget[]): Map<string, number> {
  const found = new Map<string, number>();
  const record = (text: string, targetIndex: number) => {
    const cites = Array.from(text.matchAll(/\b(fig(?:ure)?s?\.?|tables?)\s*(s)?\s*(\d{1,3})\b/gi));
    for (const m of cites) {
      const kind = /^t/i.test(m[1]) ? 'table' : 'figure';
      const key = `${kind} ${m[2] ? 'S' : ''}${m[3]}`.toLowerCase();
      if (!found.has(key)) found.set(key, targetIndex);
    }
  };

  for (const t of targets) {
    const sec = rendered[t.sectionIdx];
    if (t.subIdx === undefined) {
      // The section's own prose — text that sits above any subheading.
      for (const sub of sec.subsections) if (!sub.subheading) record(sub.text, t.index);
    } else {
      record(sec.subsections[t.subIdx].text, t.index);
    }
  }
  return found;
}

export function buildArticleLayout(sections: ParsedSections, figures: Figure[]): ArticleLayout {
  if (sections.raw) {
    return { sections: [], targets: [], trailingFigures: [], rawText: sections.raw, allFiguresIfRaw: [...figures] };
  }

  const rendered = orderedSections(sections);
  const targets = buildPlacementTargets(rendered);
  const trailingFigures: Figure[] = [];

  const attach = (t: PlacementTarget, fig: Figure) => {
    const sec = rendered[t.sectionIdx];
    if (t.subIdx === undefined) sec.figures.push(fig);
    else sec.subsections[t.subIdx].figures.push(fig);
  };

  const isExplicit = (fig: Figure) =>
    Number.isInteger(fig.sectionIndex) && fig.sectionIndex! >= 0 && fig.sectionIndex! < targets.length;

  // Sequential fallback must not collide with explicit placements: a figure with
  // no target fills the next target that nobody claimed, rather than blindly
  // taking slot 0, 1, 2… (which used to stack auto and explicit figures on the
  // same section and scramble the order the author asked for).
  const claimed = new Set<number>();
  for (const fig of figures) if (isExplicit(fig)) claimed.add(fig.sectionIndex!);

  let autoSlot = 0;
  const nextFreeSlot = (): number | null => {
    while (autoSlot < targets.length && claimed.has(autoSlot)) autoSlot++;
    return autoSlot < targets.length ? autoSlot++ : null;
  };

  const cited = citationTargets(rendered, targets);

  for (const fig of figures) {
    if (isExplicit(fig)) {
      attach(targets[fig.sectionIndex!], fig);
      continue;
    }
    // No section chosen — put it where the manuscript cites it, if it says.
    // Only a float the author labelled ("Figure 6: …") can be matched to a
    // citation; an unlabelled one has no number to look for.
    const label = parseCaptionLabel(fig.caption);
    const citedAt = label ? cited.get(label.key) : undefined;
    if (citedAt !== undefined) {
      attach(targets[citedAt], fig);
      continue;
    }
    const slot = nextFreeSlot();
    if (slot === null) {
      // No section left to hold it (e.g. more figures than sections, or a figure
      // assigned to a section this paper doesn't have) — keep it rather than
      // dropping it silently.
      trailingFigures.push(fig);
    } else {
      attach(targets[slot], fig);
    }
  }

  return { sections: rendered, targets, trailingFigures, allFiguresIfRaw: [] };
}

// ── Caption labels ───────────────────────────────────────────────────────────

// Authors label their own floats, and they do not all say "Figure 1". A caption
// may open with "Table 1.", "Figure S2.", "Fig. 3a:", or wrap the whole thing in
// brackets — "(Fig. 4: Nanoformulation schematic)". Outputs used to bolt a
// sequential "Figure N:" onto the front of whatever the author wrote, producing
// "Figure 1: Table 1." and "Figure 9: Figure S2.". Detecting the author's own
// label lets the proof print it instead of competing with it.
const LABEL_RE = new RegExp(
  '^[\\s(\\[]*' +                                   // optional opening bracket
  '(fig(?:ure|s?\\.?)?|table|tbl\\.?|scheme|chart|box|plate|appendix|panel)' +
  '\\s*' +
  '(s|supp(?:l(?:ementary)?)?\\.?\\s*)?' +          // supplementary marker: "S2", "Suppl. 2"
  '(\\d{1,3})' +
  '\\s*([a-z])?' +                                  // sub-panel letter: "3a"
  '\\s*[:.)\\-–—]\\s*',                             // separator
  'i',
);

const KIND_NAMES: Record<string, string> = {
  fig: 'Figure', figs: 'Figure', 'fig.': 'Figure', figure: 'Figure', figures: 'Figure',
  table: 'Table', 'tbl': 'Table', 'tbl.': 'Table',
  scheme: 'Scheme', chart: 'Chart', box: 'Box', plate: 'Plate',
  appendix: 'Appendix', panel: 'Panel',
};

export interface CaptionLabel {
  /** Display label the author gave this float, e.g. "Table 1", "Figure S2". */
  label: string;
  /** Normalised key for matching the same float across sources: "table 1". */
  key: string;
  /** 'table' floats can be de-duplicated against typeset manuscript tables. */
  kind: 'figure' | 'table' | 'other';
  /** Caption text with the author's label removed. */
  text: string;
}

/**
 * Split an author-written caption into its self-declared label and the rest.
 * Returns null when the caption carries no label of its own.
 */
export function parseCaptionLabel(caption: string): CaptionLabel | null {
  const raw = (caption || '').trim();
  if (!raw) return null;
  const m = LABEL_RE.exec(raw);
  if (!m) return null;

  const kindWord = m[1].toLowerCase().replace(/\.$/, '');
  const name = KIND_NAMES[kindWord] ?? KIND_NAMES[kindWord + '.'] ?? 'Figure';
  const supp = m[2] ? 'S' : '';
  const num = m[3];
  const sub = (m[4] ?? '').toLowerCase();

  const label = `${name} ${supp}${num}${sub}`;
  const kind = name === 'Table' ? 'table' : name === 'Figure' ? 'figure' : 'other';

  // Drop the label and any bracket it was wrapped in; close a now-unbalanced
  // trailing bracket so "(Fig. 4: schematic)(Yang, 2020)" reads cleanly.
  let text = raw.slice(m[0].length).trim();
  const opens = (text.match(/\(/g) ?? []).length;
  const closes = (text.match(/\)/g) ?? []).length;
  if (closes > opens) text = text.replace(/\)/, '').trim();

  return { label, key: label.toLowerCase(), kind, text };
}

// Strip a leading "Figure N:" / "Fig. 3a." / "Table 1." that authors type into
// the caption itself, so outputs don't double it against the app's own label.
export function cleanCaption(caption: string): string {
  const parsed = parseCaptionLabel(caption);
  return parsed ? parsed.text : (caption || '').trim();
}

/**
 * Decide what every float prints, for the submission as a whole.
 *
 * Per-float labelling is not enough: two authors' habits collide. An author who
 * labels only some captions ("(Fig. 4: …)") leaves the rest on sequential
 * numbers that can land on the same name, and an author who uploads tables as
 * images makes the sequential count run ahead of the real figure count — which
 * is how a paper with two figures ended up printing "Figure 8".
 *
 * So: author labels are honoured first and reserve their names; every unlabelled
 * float is then numbered Figure 1, 2, 3… over the floats that actually print,
 * skipping any number an author already claimed. Call this with the kept floats
 * (after duplicate removal) so dropped table images don't consume numbers.
 */
export type FloatLabels = Map<Figure, { label: string; text: string }>;

export function assignFloatLabels(figures: Figure[]): FloatLabels {
  const out: FloatLabels = new Map();
  const taken = new Set<string>();

  // Pass 1 — author-declared labels win their name.
  const unlabelled: Figure[] = [];
  for (const fig of figures) {
    const parsed = parseCaptionLabel(fig.caption);
    if (parsed && !taken.has(parsed.key)) {
      taken.add(parsed.key);
      out.set(fig, { label: parsed.label, text: parsed.text });
    } else if (parsed) {
      // Duplicate of a label already claimed — fall back to sequential numbering
      // but keep the caption text clean of the label we are not printing.
      unlabelled.push(fig);
      out.set(fig, { label: '', text: parsed.text });
    } else {
      unlabelled.push(fig);
      out.set(fig, { label: '', text: (fig.caption || '').trim() });
    }
  }

  // Pass 2 — number the rest over the floats that actually print.
  let n = 1;
  for (const fig of unlabelled) {
    while (taken.has(`figure ${n}`)) n++;
    const label = `Figure ${n}`;
    taken.add(label.toLowerCase());
    out.set(fig, { label, text: out.get(fig)!.text });
    n++;
  }
  return out;
}

// ── Duplicate floats ─────────────────────────────────────────────────────────

/** The label a typeset table's caption declares, e.g. "table 1". */
function tableHtmlLabel(tableHtml: string): string | null {
  const m = /<p class="table-caption">([\s\S]*?)<\/p>/i.exec(tableHtml);
  if (!m) return null;
  const caption = m[1].replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  const parsed = parseCaptionLabel(caption);
  return parsed?.kind === 'table' ? parsed.key : null;
}

/** Labels of the typeset tables recovered from the manuscript, e.g. {"table 1"}. */
export function typesetTableLabels(sections: ParsedSections): Set<string> {
  const labels = new Set<string>();
  const scan = (tables?: string[]) => {
    for (const t of tables ?? []) {
      const key = tableHtmlLabel(t);
      if (key) labels.add(key);
    }
  };
  scan(sections.tables);
  for (const s of sections.body) {
    scan(s.tables);
    for (const sub of s.subsections) scan(sub.tables);
  }
  return labels;
}

/** Labels of typeset tables that sit inside a body section (i.e. are placed). */
function placedTableLabels(sections: ParsedSections): Set<string> {
  const labels = new Set<string>();
  for (const s of sections.body) {
    for (const t of s.tables ?? []) { const k = tableHtmlLabel(t); if (k) labels.add(k); }
    for (const sub of s.subsections) {
      for (const t of sub.tables ?? []) { const k = tableHtmlLabel(t); if (k) labels.add(k); }
    }
  }
  return labels;
}

export interface DuplicateResolution {
  kept: Figure[];
  /** Uploaded images skipped because the manuscript's own table is used instead. */
  droppedFigures: Figure[];
  /** Labels of orphan typeset tables skipped because the upload is used instead. */
  droppedTableLabels: Set<string>;
}

/**
 * Students routinely upload a picture of a table AND leave the real table in the
 * manuscript, which printed both. Only the uploaded picture is ever skipped —
 * text recovered from the manuscript is never discarded, because a caption that
 * claims "Table 3" is the author's word about the picture, and authors do
 * misfile captions against images. Losing a real table to a mislabelled upload
 * is unrecoverable; a redundant float is something an editor can see and remove.
 *
 * The picture is skipped only when the manuscript's table sits inside a body
 * section, i.e. it is already typeset in the right place. When the author
 * collected every table after the References, both are kept: the orphan block
 * is the only copy of the data and the float may be the only copy in context.
 *
 * Matching is by explicit label only, so nothing is skipped on a guess, and
 * `keepDespiteDuplicate` lets a student or editor force the picture back in.
 */
export function dropFloatsDuplicatingTables(
  figures: Figure[],
  sections: ParsedSections,
): DuplicateResolution {
  // Only tables already typeset inside a body section make an upload redundant.
  const placed = placedTableLabels(sections);
  const droppedTableLabels = new Set<string>(); // never populated — see the note above
  if (placed.size === 0) return { kept: figures, droppedFigures: [], droppedTableLabels };

  const kept: Figure[] = [];
  const droppedFigures: Figure[] = [];
  for (const fig of figures) {
    const parsed = parseCaptionLabel(fig.caption);
    if (parsed?.kind === 'table' && placed.has(parsed.key) && !fig.keepDespiteDuplicate) {
      droppedFigures.push(fig);
    } else {
      kept.push(fig);
    }
  }
  return { kept, droppedFigures, droppedTableLabels };
}

/** Remove the orphan typeset tables that an uploaded float is standing in for. */
export function filterOrphanTables(tables: string[] | undefined, dropped: Set<string>): string[] {
  if (!tables?.length || dropped.size === 0) return tables ?? [];
  return tables.filter(t => {
    const k = tableHtmlLabel(t);
    return !(k && dropped.has(k));
  });
}

// Acknowledgments are optional and frequently left as a placeholder ("[ ]", "N/A",
// "TODO", empty brackets). Treat those as absent so no empty/weird section renders.
export function meaningfulAcknowledgments(text?: string): string | undefined {
  if (!text) return undefined;
  const stripped = text
    .replace(/\[[^\]]*\]/g, '') // remove [ ], [insert names], etc.
    .replace(/\b(n\/?a|tbd|todo|none)\b/gi, '')
    .replace(/[\s.,;:–—-]+/g, '') // punctuation/whitespace only left?
    .trim();
  return stripped.length > 0 ? text.trim() : undefined;
}
