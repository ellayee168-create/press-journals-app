import {
  AlignmentType,
  BorderStyle,
  Document,
  HorizontalPositionAlign,
  HorizontalPositionRelativeFrom,
  ImageRun,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  TextWrappingSide,
  TextWrappingType,
  VerticalPositionRelativeFrom,
  WidthType,
} from 'docx';
import { ArticleData } from './article-template';
import { buildArticleLayout, meaningfulAcknowledgments, cleanCaption } from './article-layout';
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

// Display width of a right-floated figure, ~43% of the text column (matches the PDF).
const FIG_FLOAT_PX = 250;
// Cap the image portion's display height so a tall figure fits comfortably beside text.
const FIG_MAX_IMG_PX = 300;
// Render everything at 2× for crisp text/image, then display at half size.
const SCALE = 2;

interface RenderedFigure { data: Buffer; width: number; height: number }

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Greedy word-wrap to a pixel width for the given font size.
function wrapLines(text: string, maxWidthPx: number, fontPx: number): string[] {
  const charW = fontPx * 0.52; // rough average glyph width for Arial
  const maxChars = Math.max(8, Math.floor(maxWidthPx / charW));
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (cur && (cur.length + 1 + w.length) > maxChars) { lines.push(cur); cur = w; }
    else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  return lines;
}

// Composite the caption above the image into a single PNG, so the whole figure
// (caption + image) travels together as one floating object in Word — a separate
// caption paragraph can't stay attached to a floated image.
async function renderFigure(fig: Figure): Promise<RenderedFigure | null> {
  try {
    const sharp = (await import('sharp')).default;
    const meta = await sharp(fig.path).metadata();
    if (!meta.width || !meta.height) return null;

    let dispW = FIG_FLOAT_PX;
    let dispImgH = Math.round((meta.height / meta.width) * dispW);
    if (dispImgH > FIG_MAX_IMG_PX) {
      dispImgH = FIG_MAX_IMG_PX;
      dispW = Math.round((meta.width / meta.height) * dispImgH);
    }
    const cW = dispW * SCALE;
    const cImgH = dispImgH * SCALE;
    const img = await sharp(fig.path).resize(cW, cImgH, { fit: 'fill' }).toBuffer();

    // Caption banner (rendered as SVG so text is crisp and wraps like the PDF caption).
    const fontPx = 9 * SCALE;
    const lineH = Math.round(fontPx * 1.35);
    const padX = 2 * SCALE, padTop = 2 * SCALE, padBottom = 5 * SCALE;
    const caption = `Figure ${fig.number}: ${cleanCaption(fig.caption)}`.trim();
    const lines = wrapLines(caption, cW - padX * 2, fontPx);
    const bannerH = padTop + lines.length * lineH + padBottom;
    const tspans = lines
      .map((ln, i) => `<tspan x="${padX}" y="${padTop + (i + 1) * lineH - Math.round(lineH * 0.28)}">${escXml(ln)}</tspan>`)
      .join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cW}" height="${bannerH}">`
      + `<rect width="100%" height="100%" fill="#ffffff"/>`
      + `<text font-family="Arial, Helvetica, sans-serif" font-size="${fontPx}px" fill="#333333">${tspans}</text>`
      + `</svg>`;

    const totalH = bannerH + cImgH;
    const composite = await sharp({ create: { width: cW, height: totalH, channels: 3, background: '#ffffff' } })
      .composite([{ input: Buffer.from(svg), top: 0, left: 0 }, { input: img, top: bannerH, left: 0 }])
      .png()
      .toBuffer();

    return { data: composite, width: dispW, height: Math.round(totalH / SCALE) };
  } catch {
    return null;
  }
}

// A right-floated figure image with text wrapping to its left — mirrors the PDF.
// Floating IMAGES (unlike floating tables) let text reflow across pages cleanly,
// so this avoids the erratic page breaks the table version caused. Returned as a
// run so it can be anchored inside the section's first body paragraph.
function figureFloatRun(rf: RenderedFigure): ImageRun {
  return new ImageRun({
    data: rf.data,
    type: 'png',
    transformation: { width: rf.width, height: rf.height },
    floating: {
      horizontalPosition: {
        relative: HorizontalPositionRelativeFrom.COLUMN,
        align: HorizontalPositionAlign.RIGHT,
      },
      verticalPosition: {
        relative: VerticalPositionRelativeFrom.PARAGRAPH,
        offset: 0,
      },
      wrap: { type: TextWrappingType.SQUARE, side: TextWrappingSide.LEFT },
      margins: { left: 137160, bottom: 91440 }, // ~0.15in / 0.1in in EMU
      allowOverlap: false,
    },
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

  // Precompute every figure (caption composited onto image) up front (async).
  const renderedByNumber = new Map<number, RenderedFigure | null>();
  await Promise.all(
    data.figures.map(async f => { renderedByNumber.set(f.number, await renderFigure(f)); })
  );
  const floatRunsFor = (figs: Figure[]): ImageRun[] =>
    figs
      .map(f => renderedByNumber.get(f.number))
      .filter((rf): rf is RenderedFigure => !!rf)
      .map(figureFloatRun);

  // Emit a section's body text, anchoring its floated figures inside the first
  // paragraph so text wraps to their left (matching the PDF). If the section has
  // no body text, the floats get their own paragraph.
  const emitBody = (
    subs: { subheading?: string; text: string }[],
    floats: ImageRun[],
  ) => {
    let floatsPlaced = false;
    const placeFloats = (leadRuns: (ImageRun | TextRun)[]): (ImageRun | TextRun)[] => {
      if (floatsPlaced || floats.length === 0) return leadRuns;
      floatsPlaced = true;
      return [...floats, ...leadRuns];
    };
    for (const sub of subs) {
      if (sub.subheading) {
        children.push(
          new Paragraph({
            children: [run(sub.subheading, { size: PT(10), bold: true, italics: true, color: '333333' })],
            spacing: { before: 120, after: 40 },
            keepNext: true,
          })
        );
      }
      const paras = (sub.text || '')
        .split(/\n{2,}/).map(p => p.replace(/\n/g, ' ').trim()).filter(Boolean);
      paras.forEach((p, i) => {
        children.push(
          new Paragraph({
            children: placeFloats([run(p, { size: PT(10) })]),
            alignment: AlignmentType.JUSTIFIED,
            spacing: { after: 80, line: 276 },
            indent: i > 0 ? { firstLine: 240 } : undefined,
          })
        );
      });
    }
    if (!floatsPlaced && floats.length > 0) {
      children.push(new Paragraph({ children: floats }));
    }
  };

  if (layout.rawText !== undefined) {
    emitBody([{ text: layout.rawText }], floatRunsFor(layout.allFiguresIfRaw));
  } else {
    for (const section of layout.sections) {
      children.push(sectionHeading(section.heading, accent));
      emitBody(section.subsections, floatRunsFor(section.figures));
    }
    const trailing = floatRunsFor(layout.trailingFigures);
    if (trailing.length) children.push(new Paragraph({ children: trailing }));
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
