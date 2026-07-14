import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { getDb, Figure } from '@/lib/db';
import { extractText } from '@/lib/extract';
import { parseSections, parseSectionsFromDocx, applyFigureSectionMatches } from '@/lib/parse-sections';
import { sendProofReadyNotification } from '@/lib/email';
import { extractFiguresFromDocx, extractFiguresFromPdf } from '@/lib/extract-figures';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Rasterize the first page of a PDF figure to a PNG buffer using poppler's
// pdftoppm (installed in the Docker image). Falls back by throwing so the caller
// keeps the original file if conversion isn't possible.
async function rasterizePdfFirstPage(pdfBuf: Buffer, workDir: string): Promise<Buffer> {
  const { execFile } = await import('child_process');
  const { promisify } = await import('util');
  const run = promisify(execFile);
  const inPath = path.join(workDir, `._figpdf_${Date.now()}.pdf`);
  const outBase = path.join(workDir, `._figpng_${Date.now()}`);
  fs.writeFileSync(inPath, pdfBuf);
  try {
    // -singlefile → first page only, written to <outBase>.png at 150 DPI.
    await run('pdftoppm', ['-png', '-r', '150', '-singlefile', inPath, outBase]);
    return fs.readFileSync(`${outBase}.png`);
  } finally {
    fs.rmSync(inPath, { force: true });
    fs.rmSync(`${outBase}.png`, { force: true });
  }
}

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB per file

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    // Reject oversized files up front — a huge upload would otherwise hang
    // text extraction with no feedback to the student.
    const allFiles = [
      formData.get('manuscript'),
      formData.get('figuresDoc'),
      ...formData.getAll('figures'),
    ].filter((f): f is File => f instanceof File && f.size > 0);
    for (const f of allFiles) {
      if (f.size > MAX_UPLOAD_BYTES) {
        return NextResponse.json(
          { error: `"${f.name}" is too large (${(f.size / 1024 / 1024).toFixed(1)} MB). Maximum is 25 MB per file.` },
          { status: 400 },
        );
      }
    }

    const id = uuidv4();
    const uploadDir = path.join(process.cwd(), 'uploads', id);
    fs.mkdirSync(uploadDir, { recursive: true });

    const get = (key: string): string => (formData.get(key) as string) ?? '';

    // Save manuscript
    let manuscriptPath: string | null = null;
    const manuscriptFile = formData.get('manuscript') as File | null;
    if (manuscriptFile && manuscriptFile.size > 0) {
      const ext = path.extname(manuscriptFile.name) || '.pdf';
      const dest = path.join(uploadDir, `manuscript${ext}`);
      fs.writeFileSync(dest, Buffer.from(await manuscriptFile.arrayBuffer()));
      manuscriptPath = dest;
    }

    // Extract & parse manuscript text
    let sections: string | null = null;
    let referencesRaw: string | null = null;
    let parsedSections: Awaited<ReturnType<typeof parseSections>> | null = null;
    if (manuscriptPath && manuscriptFile) {
      const isDocx =
        manuscriptFile.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        manuscriptPath.endsWith('.docx');

      if (isDocx) {
        parsedSections = await parseSectionsFromDocx(manuscriptPath);
      } else {
        const raw = await extractText(manuscriptPath, manuscriptFile.type || '');
        parsedSections = parseSections(raw);
      }
      referencesRaw = parsedSections.references || null;
      sections = JSON.stringify(parsedSections);
    }

    // ── Figures ────────────────────────────────────────────────────────────
    const figuresJson: Figure[] = [];
    const captionsRaw = get('captions');
    const captions: string[] = captionsRaw ? JSON.parse(captionsRaw) : [];
    const sectionNamesRaw = get('sectionNames');
    const sectionNames: string[] = sectionNamesRaw ? JSON.parse(sectionNamesRaw) : [];

    // Option A: individual image files
    const individualFigureFiles = formData.getAll('figures') as File[];
    const hasIndividualFigures = individualFigureFiles.some(f => f && f.size > 0);

    // Option B: figures document (DOCX or PDF)
    const figuresDocFile = formData.get('figuresDoc') as File | null;

    if (hasIndividualFigures) {
      for (let i = 0; i < individualFigureFiles.length; i++) {
        const fig = individualFigureFiles[i];
        if (!fig || fig.size === 0) continue;
        let ext = (path.extname(fig.name) || '.png').toLowerCase();
        let buf: Buffer = Buffer.from(await fig.arrayBuffer());
        // A PDF figure is rasterized to PNG (first page) so it displays in the
        // browser and the rendered PDF/preview.
        if (ext === '.pdf') {
          try {
            buf = await rasterizePdfFirstPage(buf, uploadDir);
            ext = '.png';
          } catch (e) {
            console.error('PDF figure rasterization failed:', e);
          }
        }
        // TIFF can't render in browsers or Chromium — convert to PNG on upload.
        if (ext === '.tif' || ext === '.tiff') {
          try {
            const sharp = (await import('sharp')).default;
            buf = await sharp(buf).png().toBuffer();
            ext = '.png';
          } catch (e) {
            console.error('TIFF→PNG conversion failed:', e);
          }
        }
        const filename = `figure_${i + 1}${ext}`;
        const dest = path.join(uploadDir, filename);
        fs.writeFileSync(dest, buf);
        figuresJson.push({
          path: dest,
          caption: captions[i] || '',
          number: figuresJson.length + 1,
          filename,
          sectionName: sectionNames[i] || undefined,
        });
      }
    } else if (figuresDocFile && figuresDocFile.size > 0) {
      const ext = path.extname(figuresDocFile.name).toLowerCase();
      const figDocPath = path.join(uploadDir, `figures_doc${ext}`);
      fs.writeFileSync(figDocPath, Buffer.from(await figuresDocFile.arrayBuffer()));

      let extractedPaths: string[] = [];
      if (ext === '.docx') {
        extractedPaths = await extractFiguresFromDocx(figDocPath, uploadDir);
      } else if (ext === '.pdf') {
        extractedPaths = await extractFiguresFromPdf(figDocPath, uploadDir);
      }

      for (let i = 0; i < extractedPaths.length; i++) {
        const imgPath = extractedPaths[i];
        const filename = path.basename(imgPath);
        figuresJson.push({
          path: imgPath,
          caption: captions[i] || '',
          number: i + 1,
          filename,
          sectionName: sectionNames[i] || undefined,
        });
      }
    }

    // Match student-specified section names against detected headings
    if (parsedSections) {
      applyFigureSectionMatches(figuresJson, parsedSections);
      // Re-serialize sections in case matching updated it (it doesn't, but keep in sync)
    }

    // Parse co-authors and article type
    const coAuthors = JSON.parse(get('coAuthors') || '[]');
    const articleType = get('articleType') || 'Research Article';

    const db = getDb();
    db.prepare(`
      INSERT INTO submissions (
        id, created_at, status,
        first_name, last_name, affiliation, email, guardian_email, is_corresponding,
        title, abstract, keywords, journal, acknowledgments, coi,
        sections, references_raw, manuscript_path, figures,
        co_authors, article_type
      ) VALUES (
        ?, ?, 'pending',
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?
      )
    `).run(
      id, Date.now(),
      get('firstName'), get('lastName'), get('affiliation'),
      get('email'), get('guardianEmail'),
      get('isCorresponding') === 'true' ? 1 : 0,
      get('title'), get('abstract'), get('keywords'), get('journal'),
      get('acknowledgments') || null, get('coi') || null,
      sections, referencesRaw, manuscriptPath,
      JSON.stringify(figuresJson),
      JSON.stringify(coAuthors),
      articleType,
    );

    // Notify the editorial inbox that a new proof is ready. No student emails.
    sendProofReadyNotification(get('title'), `${get('firstName')} ${get('lastName')}`, id).catch(console.error);

    return NextResponse.json({ id });
  } catch (err) {
    console.error('Submit error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
