import { PDFDocument } from 'pdf-lib';

/**
 * Renders an HTML string to a PDF buffer via Puppeteer.
 * footerAuthor: "LAST, FIRST" shown bottom-left.
 * accentColor: journal hex color for the teal footer bar.
 * showFooter: set false for cover/frontmatter pages that have their own styling.
 */
export async function htmlToPdf(
  html: string,
  footerAuthor = '',
  accentColor = '#2BA4C8',
  showFooter = true,
): Promise<Buffer> {
  const puppeteer = await import('puppeteer');
  const browser = await puppeteer.default.launch({
    headless: true,
    // In Docker we install Debian's chromium and point to it (see Dockerfile);
    // locally this is unset and puppeteer uses its own bundled browser.
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 600));

    const sharedBase = `
      font-family: Arial, Helvetica, sans-serif;
      font-size: 7.5pt;
      color: #444;
      width: 100%;
      padding: 0 0.75in;
      box-sizing: border-box;
    `;

    // Footer: thick accent bar + author left / page right / URL center below
    const footerTemplate = showFooter ? `
      <div style="${sharedBase}">
        <div style="width:100%; height:4pt; background:${accentColor}; margin-bottom:4pt;"></div>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="text-transform:uppercase; letter-spacing:0.3pt;">${footerAuthor}</span>
          <span style="font-size:8pt;" class="pageNumber"></span>
        </div>
        <div style="text-align:center; margin-top:2pt; font-size:7pt; color:#777;">PRESS-Journals.org</div>
      </div>` : `<div></div>`;

    // No running header — matches the example PDF
    const headerTemplate = `<div></div>`;

    const pdf = await page.pdf({
      format: 'Letter',
      margin: {
        top: '0.65in',
        right: '0.75in',
        bottom: showFooter ? '0.9in' : '0.65in',
        left: '0.75in',
      },
      printBackground: true,
      displayHeaderFooter: showFooter,
      headerTemplate,
      footerTemplate,
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

/** Merges an array of PDF buffers into one PDF buffer using pdf-lib. */
export async function mergePdfs(pdfs: Buffer[]): Promise<Buffer> {
  const merged = await PDFDocument.create();
  for (const pdfBuf of pdfs) {
    const doc = await PDFDocument.load(pdfBuf);
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    pages.forEach(p => merged.addPage(p));
  }
  return Buffer.from(await merged.save());
}
