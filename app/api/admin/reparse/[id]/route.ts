import { NextRequest, NextResponse } from 'next/server';
import { isAuthed } from '@/lib/admin-auth';
import { getDb, Submission, Figure } from '@/lib/db';
import { parseSectionsFromDocx, parseSectionsFromPdf, applyFigureSectionMatches, SectionOverrides } from '@/lib/parse-sections';
import path from 'path';
import fs from 'fs';
import { extractFiguresFromPdf } from '@/lib/extract-figures';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = getDb();
  const row = db.prepare('SELECT * FROM submissions WHERE id = ?').get(params.id) as Submission | undefined;
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!row.manuscript_path) return NextResponse.json({ error: 'No manuscript file stored' }, { status: 400 });

  // Honor heading overrides: use any sent in the request, else the stored ones.
  let overrides: SectionOverrides = {};
  try {
    const body = await req.json().catch(() => null);
    if (body && body.sectionOverrides) overrides = body.sectionOverrides;
    else if (row.section_overrides) overrides = JSON.parse(row.section_overrides);
  } catch { /* keep empty */ }

  const manuscriptPath = row.manuscript_path;
  const ext = path.extname(manuscriptPath).toLowerCase();
  const isDocx = ext === '.docx';

  let parsed;
  if (isDocx) {
    parsed = await parseSectionsFromDocx(manuscriptPath, overrides);
  } else {
    parsed = await parseSectionsFromPdf(manuscriptPath, overrides);
  }

  const referencesRaw = parsed.references ?? null;

  // Re-apply section name matching with the freshly parsed sections
  const figures: Figure[] = JSON.parse(row.figures || '[]');

  // Re-run figure extraction from the stored figures PDF, so improvements to it
  // (e.g. trimming blank page margins) reach existing submissions. Images are
  // rewritten in place under the same filenames, so captions, placements and any
  // admin edits stored on each figure are kept. Skipped unless the re-extraction
  // yields exactly the figures already on file.
  const uploadDir = path.dirname(manuscriptPath);
  const figuresPdf = path.join(uploadDir, 'figures_doc.pdf');
  if (figures.length && fs.existsSync(figuresPdf)) {
    const tmpDir = fs.mkdtempSync(path.join(uploadDir, '.reextract_'));
    try {
      const fresh = await extractFiguresFromPdf(figuresPdf, tmpDir);
      const same = fresh.length === figures.length &&
        figures.every((f, i) => path.basename(f.path) === path.basename(fresh[i]));
      if (same) fresh.forEach((src, i) => fs.copyFileSync(src, figures[i].path));
    } catch (e) {
      console.error('Figure re-extraction failed; keeping stored figures:', e);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  applyFigureSectionMatches(figures, parsed);

  db.prepare('UPDATE submissions SET sections = ?, references_raw = ?, figures = ?, section_overrides = ? WHERE id = ?').run(
    JSON.stringify(parsed),
    referencesRaw,
    JSON.stringify(figures),
    JSON.stringify(overrides),
    params.id,
  );

  return NextResponse.json({ sections: parsed, figures });
}
