import { PDFDocument } from 'pdf-lib';
import type { Browser } from 'playwright';

// Playwright's Chromium build is used (not the distro's) because it's tested
// on ARM Linux containers — Debian's own chromium crashes with SIGILL on
// Ampere/Oracle VMs. Install locally with: npx playwright install chromium
//
// The browser is launched once and reused across requests — launching Chromium
// is by far the slowest part of PDF generation (several seconds on a 1-OCPU VM).
let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    const existing = await browserPromise.catch(() => null);
    if (existing && existing.isConnected()) return existing;
    browserPromise = null; // crashed or failed to launch — relaunch below
  }
  browserPromise = (async () => {
    const { chromium } = await import('playwright');
    return chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
  })();
  return browserPromise;
}

/**
 * Renders an HTML string to a PDF buffer via headless Chromium.
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
  const browser = await getBrowser();
  const page = await browser.newPage();
  // Escape the author name — it comes from user input and is interpolated into
  // the footer HTML below, so a name containing < & " must not break the markup.
  const safeAuthor = footerAuthor
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  try {
    await page.setContent(html, { waitUntil: 'load' });
    await page.waitForTimeout(600);

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
          <span style="text-transform:uppercase; letter-spacing:0.3pt;">${safeAuthor}</span>
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
    // Close only the page — the shared browser stays warm for the next request.
    await page.close().catch(() => {});
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
