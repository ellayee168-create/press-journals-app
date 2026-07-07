import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Extract images from a DOCX file using mammoth.
 * Returns an array of absolute paths to the saved images.
 */
export async function extractFiguresFromDocx(
  docxPath: string,
  outputDir: string,
): Promise<string[]> {
  const mammoth = await import('mammoth');
  const saved: string[] = [];
  let counter = 0;

  await mammoth.convertToHtml(
    { path: docxPath },
    {
      convertImage: mammoth.images.imgElement(async (image: {
        contentType: string;
        read: () => Promise<Buffer>;
      }) => {
        try {
          const buffer = await image.read();
          const mime = image.contentType || 'image/png';
          const ext = mime.split('/')[1]?.replace('jpeg', 'jpg') ?? 'png';
          const filename = `fig-${++counter}.${ext}`;
          const dest = path.join(outputDir, filename);
          fs.writeFileSync(dest, buffer);
          saved.push(dest);
        } catch { /* skip unreadable images */ }
        return { src: '' };
      }),
    },
  );

  return saved;
}

/**
 * Extract figures from a figures PDF.
 * Each page is treated as one figure and rendered to PNG.
 * Tries pdftoppm (poppler) then Ghostscript; returns [] if neither is available.
 */
export async function extractFiguresFromPdf(
  pdfPath: string,
  outputDir: string,
): Promise<string[]> {
  // Try pdftoppm (part of poppler — `brew install poppler` on macOS)
  const ppbResult = await tryPdftoppm(pdfPath, outputDir);
  if (ppbResult.length > 0) return ppbResult;

  // Try Ghostscript (`brew install ghostscript`)
  const gsResult = await tryGhostscript(pdfPath, outputDir);
  if (gsResult.length > 0) return gsResult;

  // Neither tool available — caller should show an error to the user
  return [];
}

async function tryPdftoppm(pdfPath: string, outputDir: string): Promise<string[]> {
  try {
    const prefix = path.join(outputDir, 'fig');
    await execFileAsync('pdftoppm', ['-png', '-r', '150', pdfPath, prefix]);
    return fs
      .readdirSync(outputDir)
      .filter(f => /^fig.+\.png$/.test(f))
      .sort()
      .map(f => path.join(outputDir, f));
  } catch {
    return [];
  }
}

async function tryGhostscript(pdfPath: string, outputDir: string): Promise<string[]> {
  const outPattern = path.join(outputDir, 'fig-%03d.png');
  try {
    await execFileAsync('gs', [
      '-dBATCH', '-dNOPAUSE', '-dSAFER',
      '-sDEVICE=pngalpha', '-r150',
      `-sOutputFile=${outPattern}`,
      pdfPath,
    ]);
    return fs
      .readdirSync(outputDir)
      .filter(f => /^fig-\d+\.png$/.test(f))
      .sort()
      .map(f => path.join(outputDir, f));
  } catch {
    return [];
  }
}
