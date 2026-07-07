import { NextRequest, NextResponse } from 'next/server';
import { getDb, Submission, Figure } from '@/lib/db';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; num: string } },
) {
  const db = getDb();
  const row = db.prepare('SELECT figures FROM submissions WHERE id = ?').get(params.id) as
    | Pick<Submission, 'figures'>
    | undefined;

  if (!row) return new NextResponse('Not found', { status: 404 });

  const figures: Figure[] = JSON.parse(row.figures || '[]');
  const num = parseInt(params.num, 10);
  const fig = figures.find(f => f.number === num);
  if (!fig || !fs.existsSync(fig.path)) {
    return new NextResponse('Not found', { status: 404 });
  }

  const ext = path.extname(fig.path).toLowerCase();
  const mime =
    ext === '.png' ? 'image/png' : ext === '.tif' || ext === '.tiff' ? 'image/tiff' : 'image/jpeg';

  const buffer = fs.readFileSync(fig.path);
  return new NextResponse(buffer, { headers: { 'Content-Type': mime } });
}
