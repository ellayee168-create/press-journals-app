import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  OverlapType,
  Packer,
  Paragraph,
  RelativeHorizontalPosition,
  RelativeVerticalPosition,
  ShadingType,
  Table,
  TableAnchorType,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import fs from 'fs';
import { ArticleData } from './article-template';
import { buildArticleLayout, meaningfulAcknowledgments } from './article-layout';
import { getJournalConfig } from './journals';
import { Figure } from './db';

// Font sizes are in half-points (docx convention: size = pt × 2). These mirror
// the PDF template exactly so the editable Word doc matches the final PDF, and —
// because every run carries an explicit size/font — the result is identical in any
// Word installation regardless of the user's default theme.
const PT = (pt: number) => Math.round(pt * 2);
const FONT = 'Arial';

// Colors come from the journal config so per-journal accents stay in sync with the PDF.
function palette(journal: string) {
  const cfg = getJournalConfig(journal);
  return { accent: cfg.color.replace('#', ''), dark: cfg.dark.replace('#', '') };
}

function run(text: string, opts: { size: number; bold?: boolean; italics?: boolean; color?: string } ) {
  return new TextRun({ text, font: FONT, size: opts.size, bold: opts.bold, italics: opts.italics, color: opts.color });
}

function sectionHeading(text: string, accent: string): Paragraph {
  return new Paragraph({
    children: [run(text, { size: PT(11), bold: true, color: accent })],
    spacing: { before: 240, after: 80 },
    keepNext: true, // don't strand a heading at the bottom of a page
  });
}

function bodyParagraph(text: string, firstIndent = true): Paragraph {
  return new Paragraph({
    children: [run(text, { size: PT(10) })],
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 80, line: 276 }, // ~1.15 line spacing
    indent: firstIndent ? { firstLine: 240 } : undefined,
  });
}

function textToParagraphs(text: string): Paragraph[] {
  if (!text) return [];
  return text
    .split(/\n{2,}/)
    .map(p => p.replace(/\n/g, ' ').trim())
    .filter(Boolean)
    .map((p, i) => bodyParagraph(p, i > 0)); // first paragraph of a section not indented
}

// Target on-page width of a floated figure box, in EMU-independent pixels.
// ~43% of the text column, matching the PDF's float width.
const FIG_BOX_PX = 250;

interface FigureDims { width: number; height: number }

// Tallest a figure image may render, matching the PDF's 4.5in cap — a very tall
// portrait image otherwise exceeds the remaining page space and forces Word to
// push the float (and surrounding text) to the next page.
const FIG_MAX_HEIGHT_PX = 380;

// Read real pixel dimensions so images keep their aspect ratio (no stretching).
async function figureDimensions(fig: Figure): Promise<FigureDims | null> {
  try {
    const sharp = (await import('sharp')).default;
    const meta = await sharp(fig.path).metadata();
    if (!meta.width || !meta.height) return null;
    let width = FIG_BOX_PX;
    let height = Math.round((meta.height / meta.width) * width);
    if (height > FIG_MAX_HEIGHT_PX) {
      width = Math.round((FIG_MAX_HEIGHT_PX / height) * width);
      height = FIG_MAX_HEIGHT_PX;
    }
    return { width, height };
  } catch {
    return null;
  }
}

// A figure as a right-floated box (caption above image) with text wrapping around
// it — the Word equivalent of the PDF's float:right figures, and still draggable.
function figureFloat(fig: Figure, dims: FigureDims | null): Table | null {
  let imageData: Buffer;
  try {
    imageData = fs.readFileSync(fig.path);
  } catch {
    return null;
  }
  const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } as const;

  const cell = new TableCell({
    margins: { top: 40, bottom: 40, left: 40, right: 40 },
    children: [
      new Paragraph({
        children: [
          run(`Figure ${fig.number}: `, { size: PT(9), bold: true, color: '333333' }),
          run(fig.caption || '', { size: PT(9), color: '333333' }),
        ],
        spacing: { after: 60 },
      }),
      new Paragraph({
        children: [
          new ImageRun({
            data: imageData,
            transformation: dims
              ? { width: dims.width, height: dims.height }
              : { width: FIG_BOX_PX, height: Math.round(FIG_BOX_PX * 0.75) },
            type: fig.filename.toLowerCase().endsWith('.png') ? 'png' : 'jpg',
          }),
        ],
      }),
    ],
  });

  return new Table({
    // ~43% of a 6.5in text column ≈ 2.8in → 4032 twips.
    width: { size: 4032, type: WidthType.DXA },
    columnWidths: [4032],
    borders: {
      top: noBorder, bottom: noBorder, left: noBorder, right: noBorder,
      insideHorizontal: noBorder, insideVertical: noBorder,
    },
    float: {
      horizontalAnchor: TableAnchorType.TEXT,
      verticalAnchor: TableAnchorType.TEXT,
      relativeHorizontalPosition: RelativeHorizontalPosition.RIGHT,
      // INLINE = float sits at its natural position in the text flow. (INSIDE
      // pinned figures toward the page edge, causing erratic page breaks.)
      relativeVerticalPosition: RelativeVerticalPosition.INLINE,
      overlap: OverlapType.NEVER,
      leftFromText: 180,
      bottomFromText: 120,
      topFromText: 60,
    },
    rows: [new TableRow({ children: [cell] })],
  });
}

// First-page masthead: navy issue box on the left, PRESS Journals wordmark + journal
// name on the right — a borderless table approximates the PDF's header layout.
function mastheadTable(data: ArticleData, accent: string, dark: string): Table {
  const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } as const;
  const borders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder,
    insideHorizontal: noBorder, insideVertical: noBorder };

  const season = data.issueSeason ?? '';
  const issueLabel = data.issueNumber ? `Issue ${data.issueNumber}` : '';

  const leftChildren: Paragraph[] =
    season || issueLabel
      ? [
          new Paragraph({ children: [run(season, { size: PT(11), bold: true, color: 'FFFFFF' })], spacing: { after: 20 } }),
          new Paragraph({ children: [run(issueLabel, { size: PT(11), bold: true, color: 'FFFFFF' })] }),
        ]
      : [new Paragraph({ children: [run('', { size: PT(11) })] })];

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders,
    columnWidths: [3000, 6360],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 32, type: WidthType.PERCENTAGE },
            shading: (season || issueLabel) ? { type: ShadingType.CLEAR, fill: dark, color: 'auto' } : undefined,
            margins: { top: 120, bottom: 120, left: 160, right: 160 },
            children: leftChildren,
          }),
          new TableCell({
            width: { size: 68, type: WidthType.PERCENTAGE },
            verticalAlign: 'center',
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [run('PRESS Journals', { size: PT(24), bold: true, color: dark })],
                spacing: { after: 20 },
              }),
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [run(data.journal, { size: PT(13), bold: true, color: accent })],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

export async function generateArticleDocx(data: ArticleData): Promise<Buffer> {
  const { accent, dark } = palette(data.journal);
  const children: (Paragraph | Table)[] = [];

  // ── Masthead ───────────────────────────────────────────────────────────────
  children.push(mastheadTable(data, accent, dark));
  children.push(new Paragraph({ children: [], spacing: { after: 160 } }));

  // ── Article type ─────────────────────────────────────────────────────────
  if (data.articleType) {
    children.push(
      new Paragraph({
        children: [run(data.articleType.toUpperCase(), { size: PT(8), bold: true, color: accent })],
        spacing: { after: 60 },
      })
    );
  }

  // ── Title ────────────────────────────────────────────────────────────────
  children.push(
    new Paragraph({
      children: [run(data.title, { size: PT(22), bold: true, color: accent })],
      spacing: { after: 120 },
    })
  );

  // ── Authors & affiliations ─────────────────────────────────────────────────
  const allAuthors = [
    { firstName: data.firstName, lastName: data.lastName, affiliation: data.affiliation },
    ...data.coAuthors,
  ];
  children.push(
    new Paragraph({
      children: [run(allAuthors.map(a => `${a.firstName} ${a.lastName}`).join(', '), { size: PT(11) })],
      spacing: { after: 40 },
    })
  );
  for (const aff of Array.from(new Set(allAuthors.map(a => a.affiliation)))) {
    children.push(
      new Paragraph({ children: [run(aff, { size: PT(9), color: '555555' })], spacing: { after: 20 } })
    );
  }
  if (data.isCorresponding) {
    children.push(
      new Paragraph({
        children: [run(`*Correspondence: ${data.email}`, { size: PT(9), italics: true, color: '555555' })],
        spacing: { after: 160 },
      })
    );
  }

  // ── Abstract ─────────────────────────────────────────────────────────────
  children.push(
    new Paragraph({
      children: [run('Abstract', { size: PT(13), bold: true, color: accent })],
      spacing: { before: 120, after: 60 },
      keepNext: true,
    })
  );
  children.push(
    new Paragraph({
      children: [run(data.abstract, { size: PT(10) })],
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: 100, line: 276 },
    })
  );
  if (data.keywords.length) {
    children.push(
      new Paragraph({
        children: [
          run('Keywords: ', { size: PT(9.5), bold: true, color: '444444' }),
          run(data.keywords.join(', '), { size: PT(9.5), color: '444444' }),
        ],
        spacing: { after: 200 },
      })
    );
  }

  // ── Body (shared layout — identical structure/figure placement to the PDF) ─
  const layout = buildArticleLayout(data.sections, data.figures);

  // Precompute every figure's real aspect ratio up front (async).
  const dimsByNumber = new Map<number, FigureDims | null>();
  await Promise.all(
    data.figures.map(async f => { dimsByNumber.set(f.number, await figureDimensions(f)); })
  );
  // A floated figure must be followed by body text for the wrap to take effect;
  // Word anchors the float to the paragraph it precedes.
  const pushFigure = (f: Figure) => {
    const t = figureFloat(f, dimsByNumber.get(f.number) ?? null);
    if (t) children.push(t);
  };

  if (layout.rawText !== undefined) {
    layout.allFiguresIfRaw.forEach(pushFigure);
    children.push(...textToParagraphs(layout.rawText));
  } else {
    for (const section of layout.sections) {
      children.push(sectionHeading(section.heading, accent));
      section.figures.forEach(pushFigure);
      for (const sub of section.subsections) {
        if (sub.subheading) {
          children.push(
            new Paragraph({
              children: [run(sub.subheading, { size: PT(10), bold: true, italics: true, color: '333333' })],
              spacing: { before: 120, after: 40 },
              keepNext: true,
            })
          );
        }
        children.push(...textToParagraphs(sub.text));
      }
    }
    layout.trailingFigures.forEach(pushFigure);
  }

  // ── Acknowledgements ──────────────────────────────────────────────────────
  const ackText = meaningfulAcknowledgments(data.acknowledgments || data.sections.acknowledgments);
  if (ackText) {
    children.push(sectionHeading('Acknowledgements', accent));
    children.push(bodyParagraph(ackText, false));
  }

  // ── References (hanging indent, matching the PDF) ──────────────────────────
  const refText = data.referencesRaw || data.sections.references || '';
  if (refText) {
    children.push(sectionHeading('References', accent));
    for (const ref of refText.split(/\n{2,}/).map(l => l.replace(/\n/g, ' ').trim()).filter(Boolean)) {
      children.push(
        new Paragraph({
          children: [run(ref, { size: PT(9) })],
          spacing: { after: 60, line: 252 },
          indent: { left: 360, hanging: 360 },
        })
      );
    }
  }

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: PT(10) } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 }, // US Letter, twips
            margin: { top: 1008, right: 1080, bottom: 1224, left: 1080 }, // 0.7 / 0.75 / 0.85 / 0.75 in
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
