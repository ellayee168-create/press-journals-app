import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { parseSections, parseSectionsFromDocx } from '@/lib/parse-sections';
import { extractText } from '@/lib/extract';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB — Next.js rejects extra route exports, keep local

// Dry-run parse of a manuscript before submission. Nothing is stored — the file
// is written to a temp path, parsed, and deleted. Returns the detected structure
// plus warnings so the student can fix problems before submitting.
export async function POST(req: NextRequest) {
  let tmpPath: string | null = null;
  try {
    const formData = await req.formData();
    const file = formData.get('manuscript') as File | null;
    if (!file || file.size === 0) {
      return NextResponse.json({ error: 'No manuscript file provided' }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 25 MB.` },
        { status: 400 },
      );
    }

    const ext = path.extname(file.name).toLowerCase() || '.pdf';
    if (ext !== '.pdf' && ext !== '.docx') {
      return NextResponse.json({ error: 'Please upload a PDF or Word (.docx) file.' }, { status: 400 });
    }

    tmpPath = path.join(os.tmpdir(), `press-preview-${Date.now()}${ext}`);
    fs.writeFileSync(tmpPath, Buffer.from(await file.arrayBuffer()));

    const parsed =
      ext === '.docx'
        ? await parseSectionsFromDocx(tmpPath)
        : parseSections(await extractText(tmpPath, 'application/pdf'));

    const headings: string[] = [];
    if (parsed.introduction) headings.push('Introduction');
    for (const s of parsed.body) headings.push(s.heading);
    if (parsed.conclusion) headings.push('Conclusion');

    const refCount = parsed.references
      ? parsed.references.split(/\n{2,}/).filter(Boolean).length
      : 0;

    const totalChars =
      (parsed.raw?.length ?? 0) +
      (parsed.introduction?.length ?? 0) +
      parsed.body.reduce((n, s) => n + s.subsections.reduce((m, ss) => m + ss.text.length, 0), 0) +
      (parsed.conclusion?.length ?? 0);

    const warnings: string[] = [];
    if (totalChars < 500) {
      warnings.push(
        'Very little text could be read from this file. If it is a scanned PDF or an image-based document, please upload a Word (.docx) version instead.',
      );
    } else if (parsed.raw) {
      warnings.push(
        'No section headings were detected — the article will be formatted as one continuous block. Make sure your headings are on their own line (bold or italic works best in Word).',
      );
    }
    if (!parsed.raw && refCount === 0 && totalChars >= 500) {
      warnings.push(
        'No References section was detected. If your manuscript has references, make sure they sit under a heading named "References".',
      );
    }

    return NextResponse.json({ headings, refCount, totalChars, warnings });
  } catch (err) {
    console.error('Parse preview failed:', err);
    return NextResponse.json(
      { error: 'Could not read this file. Please check it opens correctly, or try a .docx version.' },
      { status: 422 },
    );
  } finally {
    if (tmpPath) fs.rmSync(tmpPath, { force: true });
  }
}
