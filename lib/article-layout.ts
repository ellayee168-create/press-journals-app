import { Figure, ParsedSections } from './db';

// Single source of truth for how a parsed article maps onto rendered sections and
// how figures are distributed across them. Both the HTML template and the DOCX
// generator consume this, so the student preview, the PDF, and the editable Word
// document always agree on structure and figure placement.

export interface RenderedSubsection {
  subheading?: string;
  text: string;
}

export interface RenderedSection {
  heading: string;
  subsections: RenderedSubsection[];
  figures: Figure[];
}

export interface ArticleLayout {
  sections: RenderedSection[];
  trailingFigures: Figure[]; // figures whose target section doesn't exist — rendered at the end
  rawText?: string;          // set when the manuscript couldn't be structured
  allFiguresIfRaw: Figure[]; // figures to show before raw text
}

// The ordered list of sections that will actually render, in display order:
// Introduction (if present) → body sections → Conclusion (if present).
// This ordering matches the admin "Appears with section" dropdown exactly, so a
// figure's sectionIndex means the same thing everywhere.
function orderedSections(sections: ParsedSections): RenderedSection[] {
  const list: RenderedSection[] = [];
  if (sections.introduction) {
    list.push({ heading: 'Introduction', subsections: [{ text: sections.introduction }], figures: [] });
  }
  for (const s of sections.body) {
    list.push({ heading: s.heading, subsections: s.subsections, figures: [] });
  }
  if (sections.conclusion) {
    list.push({ heading: 'Conclusion', subsections: [{ text: sections.conclusion }], figures: [] });
  }
  return list;
}

export function buildArticleLayout(sections: ParsedSections, figures: Figure[]): ArticleLayout {
  if (sections.raw) {
    return { sections: [], trailingFigures: [], rawText: sections.raw, allFiguresIfRaw: [...figures] };
  }

  const rendered = orderedSections(sections);
  const trailingFigures: Figure[] = [];
  let autoSlot = 0;

  for (const fig of figures) {
    // Explicit placement wins; otherwise assign sequentially to the next section.
    const slot = fig.sectionIndex ?? autoSlot++;
    if (Number.isInteger(slot) && slot >= 0 && slot < rendered.length) {
      rendered[slot].figures.push(fig);
    } else {
      // Target section doesn't exist (e.g. a figure assigned to "Introduction"
      // on a paper that has none) — keep it rather than dropping it silently.
      trailingFigures.push(fig);
    }
  }

  return { sections: rendered, trailingFigures, allFiguresIfRaw: [] };
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
