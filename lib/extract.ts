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

async function extractFromDocx(filePath: string): Promise<string> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value;
}
