import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Crops the blank margin off a rasterized PDF page. A figure PDF page is a full
 * sheet with the picture on part of it; left as-is, the proof reserves the whole
 * sheet's height for the figure and leaves a large gap below it. Returns the
 * input unchanged if the image is blank or can't be processed.
 */
export async function trimWhitespace(img: Buffer): Promise<Buffer> {
  try {
    const sharp = (await import('sharp')).default;
    const flat = await sharp(img).flatten({ background: '#ffffff' }).png().toBuffer();
    const { info } = await sharp(flat)
      .trim({ background: '#ffffff', threshold: 12 })
      .toBuffer({ resolveWithObject: true });
    if (info.width < 20 || info.height < 20) return img;
    return await sharp(flat)
      .trim({ background: '#ffffff', threshold: 12 })
      .extend({ top: 8, bottom: 8, left: 8, right: 8, background: '#ffffff' })
      .png()
      .toBuffer();
  } catch {
    return img;
  }
}

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
    const paths = fs
      .readdirSync(outputDir)
      .filter(f => /^fig.+\.png$/.test(f))
      .sort()
      .map(f => path.join(outputDir, f));
    await trimFiles(paths);
    return paths;
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
    const paths = fs
      .readdirSync(outputDir)
      .filter(f => /^fig-\d+\.png$/.test(f))
      .sort()
      .map(f => path.join(outputDir, f));
    await trimFiles(paths);
    return paths;
  } catch {
    return [];
  }
}

async function trimFiles(paths: string[]): Promise<void> {
  for (const p of paths) fs.writeFileSync(p, await trimWhitespace(fs.readFileSync(p)));
}
