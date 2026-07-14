import Link from 'next/link';

export const metadata = {
  title: 'Manuscript Formatting Guide — PRESS Journals',
};

function Rule({ title, children, why }: { title: string; children: React.ReactNode; why: string }) {
  return (
    <div className="border border-gray-200 rounded-xl p-5 bg-white">
      <h3 className="font-bold text-gray-800 mb-2">{title}</h3>
      <div className="text-sm text-gray-700 space-y-1.5">{children}</div>
      <p className="text-xs text-gray-500 mt-3 bg-gray-50 border-l-2 border-[#2BA4C8] pl-3 py-1.5">
        <span className="font-semibold text-[#2BA4C8]">Why:</span> {why}
      </p>
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
            It works best when your document follows a few simple formatting rules. Each rule below explains
            <strong> exactly what to do</strong> and <strong>why it matters</strong>, so you can format your
            document once and have it come through cleanly. After you upload, the form shows you what was
            detected — if anything looks wrong, fix the formatting and re-upload.
          </p>
        </div>

        <Rule
          title="1. Submit a Word document (.docx), not a PDF"
          why="A Word file carries the structure of your writing — which lines are headings, which text is bold or italic, where your tables are. A PDF is only a picture of the page, so the system has to guess at all of that and often gets it wrong. Word documents parse far more reliably."
        >
          <p>Save your manuscript as a <strong>.docx</strong> file. If you wrote it in Google Docs, use <em>File → Download → Microsoft Word (.docx)</em>.</p>
        </Rule>

        <Rule
          title="2. Mark main section headings in bold"
          why="The system identifies your main sections (Introduction, Discussion, and your own section titles) by looking for lines that are entirely bold. It has no other reliable way to tell a heading from a normal sentence."
        >
          <p>Put each <strong>main section heading in bold</strong>, on its own line. For example, a bold line reading <strong>Introduction</strong> or <strong>Causes and Risk Factors</strong>.</p>
          <p className="text-gray-500">Alternatively, you may use Word&rsquo;s built-in <em>Heading 1</em> style (Home → Styles).</p>
        </Rule>

        <Rule
          title="3. Mark subheadings in italics"
          why="Within a section, the system tells subheadings apart from main headings by their formatting: bold means a main heading, italics means a subheading nested underneath it. (If your paper uses italics for its main headings instead, the system will detect that and adapt — but pick one style and be consistent.)"
        >
          <p>Put each <strong>subheading in italics</strong>, on its own line — for example, an italic line reading <em>Drug resistance mechanisms</em> under a bold <strong>Treatments</strong> section.</p>
          <p className="text-gray-500">Alternatively, use Word&rsquo;s built-in <em>Heading 2</em> style.</p>
        </Rule>

        <Rule
          title="4. Keep headings short — never end a heading with a period"
          why="To avoid mistaking ordinary sentences for headings, the system treats any line that is very long, or that ends in a period, as body text — even if it is bold or italic. A real heading is a short label, not a full sentence."
        >
          <p>Keep each heading to a short phrase (a dozen words or fewer) and <strong>do not end it with a period</strong>.</p>
        </Rule>

        <Rule
          title="5. Don't bold or italicize whole sentences or citations"
          why="Because a fully-bold or fully-italic line is read as a heading, italicizing an entire sentence — or a full citation like a reference line — can make the system treat it as a section title. (The system automatically skips lines that clearly look like citations, e.g. ones ending in a year in parentheses, but it's safest not to format whole lines this way.)"
        >
          <p>Use bold and italics <strong>only</strong> for actual headings and subheadings, and for short emphasis <em>inside</em> a sentence. Don&rsquo;t format an entire paragraph, sentence, or citation as bold/italic.</p>
        </Rule>

        <Rule
          title="6. Don't rely on ALL CAPS or numbering alone to mark a heading"
          why="Many abbreviations (DNA, ALL, MRI) and list items (1., 2., 3.) are written in capitals or start with a number, so the system does NOT treat capitalization or numbering as a sign of a heading — doing so would misread abbreviations and lists as section titles. Formatting (bold/italic) is the reliable signal."
        >
          <p>A heading typed in ALL CAPS or numbered (e.g. <em>1. Methods</em>) but <strong>not</strong> bold or italic will be read as normal text. Bold or italicize your headings so they&rsquo;re recognized.</p>
        </Rule>

        <Rule
          title="7. Use real tables — insert them with Word's table tool"
          why="The system detects and rebuilds genuine Word tables (Insert → Table), keeping your rows and columns intact. If you fake a table using tabs, spaces, or separate lines, the system can't tell it's a table and the contents scatter into messy text."
        >
          <p>Create every table with <strong>Insert → Table</strong> in Word. Avoid lining up columns with tabs or spaces.</p>
        </Rule>

        <Rule
          title="8. Label your references section 'References'"
          why="The system finds your reference list by looking for a heading named References (or Bibliography / Works Cited). It keeps everything under that heading as your citations, with each entry preserved."
        >
          <p>Put a bold heading reading <strong>References</strong> above your citation list. List <strong>one reference per line</strong> (or use Word&rsquo;s numbered list). If a link sits on its own line right after a reference, it will be joined to that reference.</p>
        </Rule>

        <Rule
          title="9. Don't worry about your title, author names, or abstract in the document"
          why="Your title, authors, affiliations, and abstract are collected by the submission form itself, so the system ignores everything in your document before your first section heading — and uses the form's versions. This keeps the cover page consistent for every article."
        >
          <p>You can leave your title block and abstract in the document; they&rsquo;re simply skipped. The <strong>form&rsquo;s</strong> title, author, and abstract fields are what appear in the final article.</p>
        </Rule>

        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="font-bold text-gray-800 mb-2">After you upload</h3>
          <p className="text-sm text-gray-700">
            The form shows a <strong>&ldquo;Here&rsquo;s what we detected&rdquo;</strong> box listing every section
            heading it found and how many references it read. Check it: if a heading is missing, make sure it&rsquo;s
            bold (or italic for a subheading) and short; if something that isn&rsquo;t a heading shows up, make sure
            it isn&rsquo;t fully bold/italic. Fix your Word document and re-upload — it updates instantly.
          </p>
          <Link href="/" className="inline-block mt-4 px-5 py-2 bg-[#2BA4C8] text-white rounded-lg text-sm font-semibold hover:bg-[#2090b0]">
            Back to submission form
          </Link>
        </div>
      </main>
    </div>
  );
}
