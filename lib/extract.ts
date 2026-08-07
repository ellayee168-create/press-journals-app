import fs from 'fs';

export async function extractText(filePath: string, mimeType: string): Promise<string> {
  if (mimeType === 'application/pdf' || filePath.endsWith('.pdf')) {
    return extractFromPdf(filePath);
  }
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    filePath.endsWith('.docx')
  ) {
    return extractFromDocx(filePath);
  }
  throw new Error('Unsupported file type. Please upload a PDF or DOCX file.');
}

async function extractFromPdf(filePath: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PDFParse } = require('pdf-parse');
  const buffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  const result = await parser.getText();
  return result.text as string;
}

function esc(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\s+/g, ' ').trim();
}

// Extract both the plain text AND any real tables from a PDF. The PDF renderer
// keeps the table grid even after a Word→PDF export, so tables can be recovered
// as clean HTML (the same <table class="doc-table"> markup the DOCX path uses).
export async function extractPdfContent(filePath: string): Promise<{ text: string; tables: string[] }> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PDFParse } = require('pdf-parse');
  const buffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  const text = (await parser.getText()).text as string;

  const tables: string[] = [];
  try {
    const result = await parser.getTable();
    const pages = (result?.pages ?? []) as Array<{ tables?: string[][][] }>;
    for (const pg of pages) {
      for (const rows of pg.tables ?? []) {
        if (!rows.length) continue;
        const html = rows
          .map((row, i) =>
            '<tr>' + row.map(c => (i === 0 ? `<th>${esc(c)}</th>` : `<td>${esc(c)}</td>`)).join('') + '</tr>')
          .join('');
        tables.push(`<table class="doc-table">${html}</table>`);
      }
    }
  } catch {
    /* table extraction is best-effort */
  }
  return { text, tables };
}

async function extractFromDocx(filePath: string): Promise<string> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value;
}
