'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface Figure {
  path: string;
  caption: string;
  number: number;
  filename: string;
  sectionIndex?: number;
  sectionName?: string;
  sectionMatchStatus?: 'matched' | 'unmatched' | 'ambiguous';
  sectionMatchedHeading?: string;
}

interface Section {
  heading: string;
  subsections: { subheading?: string; text: string }[];
}

interface ParsedSections {
  introduction?: string;
  body: Section[];
  conclusion?: string;
  acknowledgments?: string;
  references?: string;
  raw?: string;
}

interface Submission {
  id: string;
  created_at: number;
  status: 'pending' | 'accepted' | 'rejected';
  first_name: string;
  last_name: string;
  affiliation: string;
  email: string;
  guardian_email: string;
  title: string;
  abstract: string;
  keywords: string;
  journal: string;
  acknowledgments?: string;
  coi?: string;
  figures: string;
  sections?: string;
  manuscript_path?: string;
}

const STATUS_COLORS = {
  pending: 'bg-amber-100 text-amber-700',
  accepted: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-2 border-b border-gray-100 last:border-0">
      <dt className="text-xs font-semibold text-gray-500 w-36 flex-shrink-0 pt-0.5">{label}</dt>
      <dd className="text-sm text-gray-800 flex-1">{children}</dd>
    </div>
  );
}

// Editable working copy of the parsed structure. Body subsections are flattened
// to one text block per section (the parser only ever emits one).
interface SectionDraft {
  introduction: string;
  body: { heading: string; text: string }[];
  conclusion: string;
  references: string;
}

function toDraft(s: ParsedSections): SectionDraft {
  return {
    introduction: s.introduction ?? '',
    body: s.body.map(b => ({
      heading: b.heading,
      text: b.subsections.map(ss => ss.text).join('\n\n'),
    })),
    conclusion: s.conclusion ?? '',
    references: s.references ?? '',
  };
}

function fromDraft(d: SectionDraft, original: ParsedSections | null): ParsedSections {
  return {
    ...(original ?? {}),
    raw: undefined,
    introduction: d.introduction.trim() || undefined,
    body: d.body
      .filter(b => b.heading.trim() || b.text.trim())
      .map(b => ({ heading: b.heading.trim(), subsections: [{ text: b.text.trim() }] })),
    conclusion: d.conclusion.trim() || undefined,
    // Each non-empty line is one reference entry; storage/rendering uses
    // blank-line separation, so normalise single newlines up to double.
    references: d.references.trim()
      ? d.references.split(/\n+/).map(l => l.trim()).filter(Boolean).join('\n\n')
      : undefined,
  };
}

function buildSectionLabels(sections: ParsedSections | null): string[] {
  if (!sections) return ['Introduction'];
  const labels: string[] = [];
  if (sections.introduction) labels.push('Introduction');
  for (const s of sections.body) labels.push(s.heading);
  if (sections.conclusion) labels.push('Conclusion');
  if (labels.length === 0) labels.push('Beginning');
  return labels;
}

export default function AdminSubmissionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [sub, setSub] = useState<Submission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [figures, setFigures] = useState<Figure[]>([]);
  const [savingFigs, setSavingFigs] = useState(false);
  const [figSaved, setFigSaved] = useState(false);
  const [sections, setSections] = useState<ParsedSections | null>(null);
  const [reparsing, setReparsing] = useState(false);
  const [reparseMsg, setReparseMsg] = useState('');
  const [editingSections, setEditingSections] = useState(false);
  const [draft, setDraft] = useState<SectionDraft | null>(null);
  const [savingSections, setSavingSections] = useState(false);
  const [sectionsMsg, setSectionsMsg] = useState('');

  useEffect(() => {
    fetch(`/api/admin/submission/${id}`)
      .then(r => {
        if (r.status === 401) { router.push('/admin'); return null; }
        return r.json();
      })
      .then(data => {
        if (data) {
          setSub(data);
          setFigures(JSON.parse(data.figures || '[]'));
          setSections(data.sections ? JSON.parse(data.sections) : null);
        }
        setLoading(false);
      })
      .catch(() => { setError('Failed to load submission.'); setLoading(false); });
  }, [id, router]);

  async function updateStatus(status: string) {
    let note: string | undefined;
    let notify = false;
    if (status === 'accepted' || status === 'rejected') {
      if (!confirm(`Mark this submission as ${status}?`)) {
        setSub(prev => (prev ? { ...prev } : prev)); // re-render so the select snaps back
        return;
      }
      const noteInput = prompt(
        `The student will be emailed about this decision.\n\nOptional note to include (leave blank for none).\nPress Cancel to change status WITHOUT emailing the student.`
      );
      notify = noteInput !== null;
      note = noteInput || undefined;
    }
    const res = await fetch('/api/admin/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status, note, notify }),
    });
    if (handleExpired(res)) return;
    setSub(prev => prev ? { ...prev, status: status as Submission['status'] } : prev);
  }

  async function saveFigurePlacements() {
    setSavingFigs(true);
    const res = await fetch(`/api/admin/save-figures/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ figures }),
    });
    setSavingFigs(false);
    if (handleExpired(res)) return;
    if (res.ok) {
      setFigSaved(true);
      setTimeout(() => setFigSaved(false), 2500);
    } else {
      alert('Saving figure placements failed — please try again.');
    }
  }

  function setFigSection(figNumber: number, sectionIndex: number | undefined) {
    setFigures(prev => prev.map(f =>
      f.number === figNumber ? { ...f, sectionIndex } : f
    ));
  }

  function startEditing() {
    setDraft(toDraft(sections ?? { body: [] }));
    setEditingSections(true);
    setSectionsMsg('');
  }

  async function saveSections() {
    if (!draft) return;
    setSavingSections(true);
    const updated = fromDraft(draft, sections);
    const res = await fetch(`/api/admin/save-sections/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sections: updated }),
    });
    setSavingSections(false);
    if (handleExpired(res)) return;
    if (res.ok) {
      setSections(updated);
      setEditingSections(false);
      setSectionsMsg('Saved — preview/PDF now use the edited structure');
      setTimeout(() => setSectionsMsg(''), 4000);
    } else {
      setSectionsMsg('Save failed — please try again');
    }
  }

  function moveSection(i: number, dir: -1 | 1) {
    setDraft(prev => {
      if (!prev) return prev;
      const body = [...prev.body];
      const j = i + dir;
      if (j < 0 || j >= body.length) return prev;
      [body[i], body[j]] = [body[j], body[i]];
      return { ...prev, body };
    });
  }

  // Session-expiry guard: admin cookies last 8h; without this, a stale session
  // just shows a generic "failed" with no way to understand or recover.
  function handleExpired(res: Response): boolean {
    if (res.status === 401) {
      alert('Your editor session has expired. Please log in again — your work on this page since the last save is not stored.');
      router.push('/admin');
      return true;
    }
    return false;
  }

  async function reparse() {
    if (!confirm(
      'Re-parse the manuscript?\n\nThis re-reads the uploaded file and REPLACES the current sections and references — including any manual edits made with "Edit sections". Figure placements are re-matched too.\n\nContinue?'
    )) return;
    setReparsing(true);
    setReparseMsg('');
    const res = await fetch(`/api/admin/reparse/${id}`, { method: 'POST' });
    if (handleExpired(res)) return;
    if (res.ok) {
      const data = await res.json();
      setSections(data.sections);
      if (data.figures) setFigures(data.figures);
      const intro = data.sections.introduction ? 1 : 0;
      const body = (data.sections.body ?? []).length;
      const concl = data.sections.conclusion ? 1 : 0;
      setReparseMsg(`Done — found ${intro + body + concl} section(s)`);
    } else {
      const e = await res.json();
      setReparseMsg(e.error || 'Re-parse failed');
    }
    setReparsing(false);
  }

  if (loading) return <div className="p-8 text-gray-400">Loading…</div>;
  if (error || !sub) return <div className="p-8 text-red-500">{error || 'Not found'}</div>;

  const keywords: string[] = JSON.parse(sub.keywords || '[]');
  const sectionLabels = buildSectionLabels(sections);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#1a2744] text-white py-4 px-6 flex items-center justify-between">
        <div>
          <span className="text-2xl font-black">PRESS Journals</span>
          <span className="ml-3 text-[#2BA4C8] text-sm font-semibold">Submission Detail</span>
        </div>
        <a href="/admin" className="text-xs text-gray-400 hover:text-white">← All Submissions</a>
      </header>

      <main className="max-w-3xl mx-auto py-8 px-4 space-y-6">

        {/* Title & actions */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-lg font-bold text-gray-800 leading-snug">{sub.title}</h1>
              <p className="text-sm text-gray-500 mt-1">
                {sub.last_name}, {sub.first_name} · {new Date(sub.created_at).toLocaleDateString()}
              </p>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap ${STATUS_COLORS[sub.status]}`}>
              {sub.status}
            </span>
          </div>

          <div className="flex gap-3 mt-5 flex-wrap">
            <a
              href={`/preview/${sub.id}`}
              target="_blank"
              className="px-4 py-2 bg-[#2BA4C8] text-white rounded-lg text-sm font-semibold hover:bg-[#2090b0]"
            >
              Preview Article
            </a>
            <a
              href={`/api/download/${sub.id}`}
              className="px-4 py-2 border border-[#2BA4C8] text-[#2BA4C8] rounded-lg text-sm font-semibold hover:bg-[#f0fafd]"
            >
              Download PDF
            </a>
            <a
              href={`/api/admin/download-docx/${sub.id}`}
              className="px-4 py-2 border border-gray-400 text-gray-600 rounded-lg text-sm font-semibold hover:bg-gray-50"
            >
              ⬇ Download Word (editable)
            </a>
            <select
              value={sub.status}
              onChange={e => updateStatus(e.target.value)}
              className="border border-gray-300 rounded-lg text-sm px-3 py-2 bg-white"
            >
              <option value="pending">Mark Pending</option>
              <option value="accepted">Mark Accepted</option>
              <option value="rejected">Mark Rejected</option>
            </select>
          </div>
        </div>

        {/* Author */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-bold text-[#2BA4C8] mb-3">Author</h2>
          <dl>
            <Row label="Name">{sub.first_name} {sub.last_name}</Row>
            <Row label="Affiliation">{sub.affiliation}</Row>
            <Row label="Email">
              <a href={`mailto:${sub.email}`} className="text-[#2BA4C8] hover:underline">{sub.email}</a>
            </Row>
            <Row label="Guardian Email">
              <a href={`mailto:${sub.guardian_email}`} className="text-[#2BA4C8] hover:underline">{sub.guardian_email}</a>
            </Row>
          </dl>
        </div>

        {/* Article */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-bold text-[#2BA4C8] mb-3">Article</h2>
          <dl>
            <Row label="Journal">{sub.journal}</Row>
            <Row label="Keywords">{keywords.join(', ')}</Row>
            <Row label="Abstract"><span className="whitespace-pre-wrap">{sub.abstract}</span></Row>
            {sub.acknowledgments && <Row label="Acknowledgments">{sub.acknowledgments}</Row>}
            <Row label="COI">{sub.coi}</Row>
          </dl>
        </div>

        {/* Detected sections: view chips / inline editor */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="font-bold text-[#2BA4C8]">Article Sections</h2>
            <div className="flex items-center gap-3 flex-wrap">
              {(reparseMsg || sectionsMsg) && (
                <span className={`text-xs font-semibold ${(reparseMsg || sectionsMsg).startsWith('Done') || (reparseMsg || sectionsMsg).startsWith('Saved') ? 'text-green-600' : 'text-red-500'}`}>
                  {reparseMsg || sectionsMsg}
                </span>
              )}
              {!editingSections && (
                <button
                  onClick={startEditing}
                  className="px-3 py-1.5 border border-gray-400 text-gray-600 rounded-lg text-xs font-semibold hover:bg-gray-50"
                >
                  ✎ Edit sections
                </button>
              )}
              {sub.manuscript_path && !editingSections && (
                <button
                  onClick={reparse}
                  disabled={reparsing}
                  className="px-3 py-1.5 border border-[#2BA4C8] text-[#2BA4C8] rounded-lg text-xs font-semibold hover:bg-[#f0fafd] disabled:opacity-50"
                >
                  {reparsing ? 'Re-parsing…' : '↺ Re-parse manuscript'}
                </button>
              )}
            </div>
          </div>

          {editingSections && draft ? (
            <div className="space-y-4">
              <p className="text-xs text-gray-500">
                Edit headings and text directly — the preview, PDF, and Word download all use this structure.
                Re-parsing the manuscript will overwrite these edits.
              </p>

              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">Introduction</label>
                <textarea
                  value={draft.introduction}
                  onChange={e => setDraft(d => d ? { ...d, introduction: e.target.value } : d)}
                  rows={4}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono"
                  placeholder="(no introduction)"
                />
              </div>

              {draft.body.map((b, i) => (
                <div key={i} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      value={b.heading}
                      onChange={e => setDraft(d => {
                        if (!d) return d;
                        const body = [...d.body];
                        body[i] = { ...body[i], heading: e.target.value };
                        return { ...d, body };
                      })}
                      className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm font-semibold"
                      placeholder="Section heading"
                    />
                    <button onClick={() => moveSection(i, -1)} disabled={i === 0}
                      className="px-2 py-1 text-xs border border-gray-300 rounded disabled:opacity-30" title="Move up">↑</button>
                    <button onClick={() => moveSection(i, 1)} disabled={i === draft.body.length - 1}
                      className="px-2 py-1 text-xs border border-gray-300 rounded disabled:opacity-30" title="Move down">↓</button>
                    <button
                      onClick={() => {
                        if (!confirm(`Remove section "${b.heading}" and its text?`)) return;
                        setDraft(d => d ? { ...d, body: d.body.filter((_, j) => j !== i) } : d);
                      }}
                      className="px-2 py-1 text-xs border border-red-200 text-red-500 rounded hover:bg-red-50" title="Remove section"
                    >✕</button>
                  </div>
                  <textarea
                    value={b.text}
                    onChange={e => setDraft(d => {
                      if (!d) return d;
                      const body = [...d.body];
                      body[i] = { ...body[i], text: e.target.value };
                      return { ...d, body };
                    })}
                    rows={5}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono"
                  />
                </div>
              ))}

              <button
                onClick={() => setDraft(d => d ? { ...d, body: [...d.body, { heading: '', text: '' }] } : d)}
                className="px-3 py-1.5 border border-dashed border-gray-400 text-gray-500 rounded-lg text-xs font-semibold hover:bg-gray-50 w-full"
              >
                + Add section
              </button>

              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">Conclusion</label>
                <textarea
                  value={draft.conclusion}
                  onChange={e => setDraft(d => d ? { ...d, conclusion: e.target.value } : d)}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono"
                  placeholder="(no conclusion)"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">
                  References <span className="font-normal text-gray-400">(one per line or blank-line separated)</span>
                </label>
                <textarea
                  value={draft.references}
                  onChange={e => setDraft(d => d ? { ...d, references: e.target.value } : d)}
                  rows={8}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono"
                  placeholder="(no references)"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={saveSections}
                  disabled={savingSections}
                  className="px-4 py-2 bg-[#2BA4C8] text-white rounded-lg text-sm font-semibold hover:bg-[#2090b0] disabled:opacity-50"
                >
                  {savingSections ? 'Saving…' : 'Save sections'}
                </button>
                <button
                  onClick={() => { setEditingSections(false); setDraft(null); }}
                  className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm font-semibold hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : sections && !sections.raw ? (
            <div className="flex flex-wrap gap-2">
              {sections.introduction && (
                <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded border border-blue-200">Introduction</span>
              )}
              {sections.body.map(s => (
                <span key={s.heading} className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded border border-gray-200">
                  {s.heading}
                </span>
              ))}
              {sections.conclusion && (
                <span className="px-2 py-0.5 bg-purple-50 text-purple-700 text-xs rounded border border-purple-200">Conclusion</span>
              )}
              {sections.references && (
                <span className="px-2 py-0.5 bg-green-50 text-green-700 text-xs rounded border border-green-200">
                  References ({sections.references.split(/\n{2,}/).filter(Boolean).length})
                </span>
              )}
              {!sections.introduction && sections.body.length === 0 && !sections.conclusion && (
                <span className="text-xs text-gray-400 italic">No sections detected yet — try Re-parse, or Edit sections to enter them manually</span>
              )}
            </div>
          ) : sections?.raw ? (
            <p className="text-xs text-amber-600">Manuscript parsed as unstructured text (no headings detected). Try Re-parse, or use Edit sections to structure it manually.</p>
          ) : (
            <p className="text-xs text-gray-400 italic">No manuscript parsed yet. Use Edit sections to enter content manually.</p>
          )}
        </div>

        {/* Figures with placement control */}
        {figures.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-bold text-[#2BA4C8]">Figures ({figures.length})</h2>
              <div className="flex items-center gap-3">
                {figSaved && <span className="text-green-600 text-xs font-semibold">Saved!</span>}
                <button
                  onClick={saveFigurePlacements}
                  disabled={savingFigs}
                  className="px-3 py-1.5 bg-[#2BA4C8] text-white rounded-lg text-xs font-semibold hover:bg-[#2090b0] disabled:opacity-50"
                >
                  {savingFigs ? 'Saving…' : 'Save placements'}
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Each figure floats to the right of the text in its selected section. <strong>Auto</strong> places them sequentially (Figure 1 with intro, Figure 2 with the next section, etc.).
            </p>

            <div className="space-y-4">
              {figures.map(fig => (
                <div key={fig.number} className="flex gap-4 items-start border border-gray-100 rounded-lg p-3">
                  <img
                    src={`/api/figure/${sub.id}/${fig.number}`}
                    alt={`Figure ${fig.number}`}
                    className="w-28 h-20 object-contain bg-gray-50 rounded border border-gray-100 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-[#2BA4C8] mb-0.5">Figure {fig.number}</p>
                    <p className="text-xs text-gray-600 mb-2 line-clamp-2">
                      {fig.caption || <em className="text-gray-400">No caption</em>}
                    </p>

                    {/* Section match status from student's specification */}
                    {fig.sectionName && (
                      <div className="mb-2 flex items-start gap-1.5">
                        <span className="text-xs text-gray-400 flex-shrink-0 mt-0.5">Student said:</span>
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="font-medium text-xs text-gray-700">&ldquo;{fig.sectionName}&rdquo;</span>
                          {fig.sectionMatchStatus === 'matched' && (
                            <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-xs rounded font-medium">
                              ✓ matched to &ldquo;{fig.sectionMatchedHeading}&rdquo;
                            </span>
                          )}
                          {fig.sectionMatchStatus === 'ambiguous' && (
                            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-xs rounded font-medium">
                              ⚠ ambiguous — assign manually
                            </span>
                          )}
                          {fig.sectionMatchStatus === 'unmatched' && (
                            <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-xs rounded font-medium">
                              ✗ not found — assign manually
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    <label className="text-xs text-gray-500 font-medium block mb-1">
                      Appears with section:
                    </label>
                    <select
                      value={fig.sectionIndex !== undefined ? fig.sectionIndex : ''}
                      onChange={e => setFigSection(fig.number, e.target.value === '' ? undefined : Number(e.target.value))}
                      className="border border-gray-300 rounded text-xs px-2 py-1 bg-white w-full max-w-xs"
                    >
                      <option value="">Auto (sequential)</option>
                      {sectionLabels.map((label, idx) => (
                        <option key={idx} value={idx}>{label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
