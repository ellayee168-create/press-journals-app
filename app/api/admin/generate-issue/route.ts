import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { isValidSessionValue } from '@/lib/admin-auth';
import { generateFullIssue } from '@/lib/journal-assembler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAuthed(): boolean {
  return isValidSessionValue(cookies().get('admin_session')?.value);
}

export async function GET() {
  if (!isAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const pdf = await generateFullIssue();

    return new NextResponse(pdf as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="PRESS_Journals_Issue.pdf"',
      },
    });
  } catch (err) {
    console.error('Issue generation failed:', err);
    return NextResponse.json(
      { error: `Issue PDF generation failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
}
