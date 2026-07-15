import Link from 'next/link';

export const metadata = {
  title: 'Manuscript Formatting Guide — PRESS Journals',
};

function Rule({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-gray-200 rounded-xl p-5 bg-white">
      <h3 className="font-bold text-gray-800 mb-2">{title}</h3>
      <div className="text-sm text-gray-700 space-y-1.5">{children}</div>
    </div>
  );
}

export default function FormattingGuide() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#1a2744] text-white py-4 px-6 flex items-center justify-between">
        <div>
          <span className="text-2xl font-black">PRESS Journals</span>
          <span className="ml-3 text-[#2BA4C8] text-sm font-semibold">Manuscript Formatting Guide</span>
        </div>
        <Link href="/" className="text-xs text-gray-400 hover:text-white">← Submission Form</Link>
      </header>

      <main className="max-w-3xl mx-auto py-8 px-4 space-y-5">
        <div className="bg-[#f0fafd] border border-[#c8e8f5] rounded-xl p-5">
          <p className="text-sm text-gray-700">
            Our system reads your manuscript automatically and rebuilds it into the journal&rsquo;s format.
            It works best when your document follows a few formatting rules.
          </p>
        </div>

        <Rule title="1. Submit a Word document (.docx), not a PDF">
          <p>Save your manuscript as a <strong>.docx</strong> file. From Google Docs, use <em>File → Download → Microsoft Word (.docx)</em>. Word files come through far more reliably than PDFs.</p>
        </Rule>

        <Rule title="2. Make main section headings bold">
          <p>Put each main section heading in <strong>bold</strong>, on its own line — e.g. <strong>Introduction</strong>. (Word&rsquo;s <em>Heading 1</em> style also works.)</p>
        </Rule>

        <Rule title="3. Make subheadings italic">
          <p>Put each subheading in <em>italics</em>, on its own line, under its section. (Word&rsquo;s <em>Heading 2</em> style also works.)</p>
        </Rule>

        <Rule title="4. Keep headings short, with no period">
          <p>A heading should be a short phrase. Anything long or ending in a period is treated as regular text.</p>
        </Rule>

        <Rule title="5. Only bold or italicize actual headings">
          <p>Don&rsquo;t bold or italicize whole sentences or citations — the system may read them as headings. Use bold/italics for headings and short emphasis only.</p>
        </Rule>

        <Rule title="6. Use real tables (Insert → Table)">
          <p>Make tables with Word&rsquo;s <strong>Insert → Table</strong> so they&rsquo;re kept intact. Tables faked with tabs or spaces come out as scattered text.</p>
        </Rule>

        <Rule title="7. Label your references 'References'">
          <p>Put a bold <strong>References</strong> heading above your citation list, one reference per line (or a numbered list).</p>
        </Rule>

        <Rule title="8. Start your body with an 'Introduction' heading">
          <p>Give your opening section a bold <strong>Introduction</strong> heading. This marks where your article begins — anything above it (title, author names) is skipped, since those come from the form.</p>
        </Rule>

        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="font-bold text-gray-800 mb-2">After you upload</h3>
          <p className="text-sm text-gray-700">
            You&rsquo;ll see the headings we detected, with each marked as a main heading or subheading.
            Fix any that are wrong, or re-upload after adjusting your Word document.
          </p>
          <Link href="/" className="inline-block mt-4 px-5 py-2 bg-[#2BA4C8] text-white rounded-lg text-sm font-semibold hover:bg-[#2090b0]">
            Back to submission form
          </Link>
        </div>
      </main>
    </div>
  );
}
