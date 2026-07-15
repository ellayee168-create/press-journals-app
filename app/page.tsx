'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const JOURNALS = [
  'Environment, Ecology, & Earth Protections',
  'Education & Public Health in a Changing World',
  'Investigations of History & Society',
  'Journal of Novel Mathematical Advances',
  'New Frontiers in Biology, Medicine, & Chemistry',
  'Nanotechnology & Physical Sciences Quarterly',
];

const ARTICLE_TYPES = ['Research Article', 'Review Article'];

const STEPS = ['Author Info', 'Article Info', 'Upload Manuscript', 'Upload Figures', 'Review & Submit'];

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-sm font-semibold text-gray-700 mb-1">{children}</label>;
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2BA4C8] bg-white ${props.className ?? ''}`}
    />
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2BA4C8] resize-y bg-white ${props.className ?? ''}`}
    />
  );
}

// ── Step 1: Author Info ──────────────────────────────────────────────────────
interface CoAuthor {
  firstName: string;
  lastName: string;
  affiliation: string;
}

interface AuthorInfo {
  firstName: string;
  lastName: string;
  affiliation: string;
  email: string;
  guardianEmail: string;
  isCorresponding: boolean;
  coAuthors: CoAuthor[];
}

function Step1({ data, onChange }: { data: AuthorInfo; onChange: (d: AuthorInfo) => void }) {
  const set = (k: keyof Omit<AuthorInfo, 'coAuthors'>) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      onChange({ ...data, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  function addCoAuthor() {
    onChange({ ...data, coAuthors: [...data.coAuthors, { firstName: '', lastName: '', affiliation: '' }] });
  }

  function updateCoAuthor(i: number, field: keyof CoAuthor, value: string) {
    const next = [...data.coAuthors];
    next[i] = { ...next[i], [field]: value };
    onChange({ ...data, coAuthors: next });
  }

  function removeCoAuthor(i: number) {
    onChange({ ...data, coAuthors: data.coAuthors.filter((_, idx) => idx !== i) });
  }

  return (
    <div className="space-y-5">
      {/* Primary / submitting author */}
      <div>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Primary / Submitting Author</p>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>First Name *</Label>
              <Input required value={data.firstName} onChange={set('firstName')} placeholder="Jane" />
            </div>
            <div>
              <Label>Last Name *</Label>
              <Input required value={data.lastName} onChange={set('lastName')} placeholder="Smith" />
            </div>
          </div>
          <div>
            <Label>Affiliation (School / Institution, City, State, ZIP) *</Label>
            <Input required value={data.affiliation} onChange={set('affiliation')}
              placeholder="Torrey Pines High School, San Diego, CA, 92130" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Your Email *</Label>
              <Input required type="email" value={data.email} onChange={set('email')} placeholder="jane@example.com" />
            </div>
            <div>
              <Label>Parent / Guardian Email *</Label>
              <Input required type="email" value={data.guardianEmail} onChange={set('guardianEmail')} placeholder="parent@example.com" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
            <input type="checkbox" checked={data.isCorresponding} onChange={set('isCorresponding')}
              className="w-4 h-4 accent-[#2BA4C8]" />
            I am the corresponding author (my email will be listed with an asterisk)
          </label>
        </div>
      </div>

      {/* Co-authors */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Co-Authors</p>
          <button
            type="button"
            onClick={addCoAuthor}
            className="text-xs px-3 py-1.5 bg-[#2BA4C8] text-white rounded-lg font-semibold hover:bg-[#2090b0] transition"
          >
            + Add Co-Author
          </button>
        </div>
        {data.coAuthors.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No co-authors added.</p>
        ) : (
          <div className="space-y-3">
            {data.coAuthors.map((ca, i) => (
              <div key={i} className="border border-gray-200 rounded-xl p-4 bg-gray-50 relative">
                <button
                  type="button"
                  onClick={() => removeCoAuthor(i)}
                  className="absolute top-3 right-3 text-gray-400 hover:text-red-500 text-sm"
                >✕</button>
                <p className="text-xs font-semibold text-gray-400 mb-2">Co-Author {i + 1}</p>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <Label>First Name</Label>
                    <Input value={ca.firstName} onChange={e => updateCoAuthor(i, 'firstName', e.target.value)} placeholder="John" />
                  </div>
                  <div>
                    <Label>Last Name</Label>
                    <Input value={ca.lastName} onChange={e => updateCoAuthor(i, 'lastName', e.target.value)} placeholder="Doe" />
                  </div>
                </div>
                <div>
                  <Label>Affiliation</Label>
                  <Input value={ca.affiliation} onChange={e => updateCoAuthor(i, 'affiliation', e.target.value)}
                    placeholder="Harvard-Westlake School, Los Angeles, CA, 90024" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Step 2: Article Metadata ─────────────────────────────────────────────────
interface ArticleMeta {
  articleType: string;
  title: string;
  abstract: string;
  keywords: string[];
  keywordInput: string;
  journal: string;
  acknowledgments: string;
  coi: string;
}

function Step2({ data, onChange }: { data: ArticleMeta; onChange: (d: ArticleMeta) => void }) {
  const wordCount = data.abstract.trim() ? data.abstract.trim().split(/\s+/).length : 0;
  const titleWordCount = data.title.trim() ? data.title.trim().split(/\s+/).length : 0;

  function addKeyword() {
    const kw = data.keywordInput.trim();
    if (!kw || data.keywords.includes(kw) || data.keywords.length >= 8) return;
    onChange({ ...data, keywords: [...data.keywords, kw], keywordInput: '' });
  }

  return (
    <div className="space-y-4">
      {/* Article type */}
      <div>
        <Label>Article Type *</Label>
        <div className="flex gap-3">
          {ARTICLE_TYPES.map(t => (
            <label key={t} className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 cursor-pointer text-sm font-semibold transition ${
              data.articleType === t
                ? 'border-[#2BA4C8] bg-[#e8f5fb] text-[#1B3A5C]'
                : 'border-gray-200 text-gray-500 hover:border-gray-300'
            }`}>
              <input
                type="radio"
                name="articleType"
                value={t}
                checked={data.articleType === t}
                onChange={() => onChange({ ...data, articleType: t })}
                className="accent-[#2BA4C8]"
              />
              {t}
            </label>
          ))}
        </div>
      </div>

      <div>
        <Label>Article Title * (max 15 words)</Label>
        <Input required value={data.title} onChange={e => onChange({ ...data, title: e.target.value })}
          placeholder="From Genetics to Inclusion: An Interdisciplinary Review of Down Syndrome" />
        <p className={`text-xs mt-1 ${titleWordCount > 15 ? 'text-red-500' : 'text-gray-400'}`}>
          {titleWordCount} / 15 words
        </p>
      </div>

      <div>
        <Label>Abstract * (at least 100 words)</Label>
        <Textarea required rows={6} value={data.abstract}
          onChange={e => onChange({ ...data, abstract: e.target.value })}
          placeholder="A brief summary of the topics covered, the scope of the review, and the main conclusions…" />
        <p className={`text-xs mt-1 ${wordCount < 100 ? 'text-amber-600' : 'text-green-600'}`}>
          {wordCount} words{wordCount < 100 ? ' (minimum 100)' : ' ✓'}
        </p>
      </div>

      <div>
        <Label>Keywords * (5–8 keywords)</Label>
        <div className="flex gap-2">
          <Input value={data.keywordInput} onChange={e => onChange({ ...data, keywordInput: e.target.value })}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addKeyword(); } }}
            placeholder="Type a keyword and press Enter or Add" />
          <button type="button" onClick={addKeyword}
            className="px-3 py-2 bg-[#2BA4C8] text-white rounded-lg text-sm font-semibold hover:bg-[#2090b0] whitespace-nowrap">
            Add
          </button>
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          {data.keywords.map(kw => (
            <span key={kw}
              className="bg-[#e8f6fb] text-[#2BA4C8] border border-[#2BA4C8] rounded-full px-3 py-0.5 text-sm flex items-center gap-1">
              {kw}
              <button type="button" onClick={() => onChange({ ...data, keywords: data.keywords.filter(k => k !== kw) })}
                className="ml-1 hover:text-red-500">×</button>
            </span>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-1">{data.keywords.length} / 8 keywords added</p>
      </div>

      <div>
        <Label>Journal *</Label>
        <select required value={data.journal} onChange={e => onChange({ ...data, journal: e.target.value })}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2BA4C8] bg-white">
          <option value="">Select the most relevant journal…</option>
          {JOURNALS.map(j => <option key={j} value={j}>{j}</option>)}
        </select>
      </div>

      <div>
        <Label>Acknowledgments (optional)</Label>
        <Textarea rows={3} value={data.acknowledgments}
          onChange={e => onChange({ ...data, acknowledgments: e.target.value })}
          placeholder="Recognition of funding sources and contributors…" />
      </div>

      <div>
        <Label>Conflict of Interest Statement *</Label>
        <Textarea required rows={2} value={data.coi}
          onChange={e => onChange({ ...data, coi: e.target.value })}
          placeholder="The authors declare no conflict of interest." />
      </div>
    </div>
  );
}

// ── Step 3: Upload Manuscript ────────────────────────────────────────────────
type HeadingChoice = 'header' | 'subheader' | 'none';
interface HeadingCandidate { text: string; level: 'header' | 'subheader' }
interface ParsePreview {
  headings: string[];
  candidates: HeadingCandidate[];
  refCount: number;
  totalChars: number;
  warnings: string[];
}

function Step3({ file, onChange, onDetected, choices, onChoices }: {
  file: File | null;
  onChange: (f: File | null) => void;
  onDetected: (headings: string[]) => void;
  choices: Record<string, HeadingChoice>;
  onChoices: (c: Record<string, HeadingChoice>) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [checking, setChecking] = useState(false);
  const [preview, setPreview] = useState<ParsePreview | null>(null);
  const [checkError, setCheckError] = useState('');

  // Recompute the current header list (for the figure dropdown) from the live choices.
  function publishHeaders(cands: HeadingCandidate[], ch: Record<string, HeadingChoice>) {
    const headers = cands
      .filter(c => (ch[c.text] ?? c.level) === 'header')
      .map(c => c.text);
    onDetected(headers);
  }

  function setChoice(text: string, choice: HeadingChoice) {
    const next = { ...choices, [text]: choice };
    onChoices(next);
    if (preview) publishHeaders(preview.candidates, next);
  }

  async function selectFile(f: File | null) {
    onChange(f);
    setPreview(null);
    setCheckError('');
    onDetected([]);
    onChoices({});
    if (!f) return;
    // Dry-run parse so the student sees what was detected BEFORE submitting.
    setChecking(true);
    try {
      const fd = new FormData();
      fd.append('manuscript', f);
      const res = await fetch('/api/parse-preview', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) setCheckError(data.error || 'Could not read this file.');
      else {
        setPreview(data);
        // Seed choices with the parser's guesses so the table starts pre-filled.
        const seeded: Record<string, HeadingChoice> = {};
        (data.candidates || []).forEach((c: HeadingCandidate) => { seeded[c.text] = c.level; });
        onChoices(seeded);
        publishHeaders(data.candidates || [], seeded);
      }
    } catch {
      setCheckError('Could not check the file — you can still submit, but please verify the preview afterwards.');
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Upload your manuscript as a <strong>Word (.docx)</strong> file (recommended) or PDF.
        The system extracts your text and detects section headings automatically.
      </p>
      <div className="bg-[#f0fafd] border border-[#c8e8f5] rounded-lg p-3 text-xs text-gray-600 space-y-1">
        <p className="font-semibold text-[#1B3A5C]">Formatting tips:</p>
        <p>• <strong>Main section headings</strong> → make them <span className="font-bold">bold</span>, on their own line, and short (no ending period).</p>
        <p>• <strong>Subheadings</strong> → make them <span className="italic">italic</span>, on their own line.</p>
        <p>• Make <strong>tables</strong> with Word&rsquo;s Insert → Table (not tabs/spaces). Don&rsquo;t bold or italicize whole sentences or citations.</p>
        <p className="pt-1">
          <a href="/formatting" target="_blank" className="text-[#2BA4C8] font-semibold hover:underline">
            Full formatting guide here
          </a>
        </p>
      </div>
      <div
        className="border-2 border-dashed border-[#2BA4C8] rounded-xl p-8 text-center cursor-pointer hover:bg-[#f0fafd] transition"
        onClick={() => inputRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) selectFile(f); }}
      >
        <div className="text-4xl mb-3">📄</div>
        {file ? (
          <div>
            <p className="font-semibold text-[#2BA4C8]">{file.name}</p>
            <p className="text-xs text-gray-500 mt-1">{(file.size / 1024).toFixed(1)} KB</p>
            <button type="button" onClick={e => { e.stopPropagation(); selectFile(null); }}
              className="mt-2 text-xs text-red-500 hover:underline">Remove</button>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-600">Drag & drop or <span className="text-[#2BA4C8] font-semibold">browse</span></p>
            <p className="text-xs text-gray-400 mt-1">PDF or DOCX · max 25 MB</p>
          </>
        )}
        <input ref={inputRef} type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) selectFile(f); }} />
      </div>

      {/* Parse preview feedback */}
      {checking && <p className="text-sm text-gray-500">Checking your manuscript…</p>}
      {checkError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{checkError}</div>
      )}
      {preview && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold text-gray-700">Review the headings we detected</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Fix any that are wrong, or mark something <strong>Not a heading</strong>.
              Your abstract, keywords, conflict of interest, and figure captions come from the form, so they won&rsquo;t appear here — everything else you write is kept.
            </p>
          </div>

          {preview.candidates.length > 0 ? (
            <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
              {preview.candidates.map((c, i) => {
                const cur = choices[c.text] ?? c.level;
                const opts: { v: HeadingChoice; label: string }[] = [
                  { v: 'header', label: 'Main heading' },
                  { v: 'subheader', label: 'Subheading' },
                  { v: 'none', label: 'Not a heading' },
                ];
                return (
                  <div key={i} className={`flex items-center gap-2 p-2 ${cur === 'none' ? 'opacity-50' : ''}`}>
                    <span className={`flex-1 min-w-0 text-xs truncate ${cur === 'subheader' ? 'pl-4 italic text-gray-600' : 'font-semibold text-gray-800'}`}>
                      {c.text}
                    </span>
                    <div className="flex gap-1 flex-shrink-0">
                      {opts.map(o => (
                        <button key={o.v} type="button" onClick={() => setChoice(c.text, o.v)}
                          className={`px-2 py-1 text-[11px] rounded border transition ${
                            cur === o.v
                              ? o.v === 'none'
                                ? 'bg-gray-200 border-gray-300 text-gray-700 font-semibold'
                                : 'bg-[#2BA4C8] border-[#2BA4C8] text-white font-semibold'
                              : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                          }`}>
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-gray-500 italic">
              No section headings detected. Make each heading bold (subheadings italic) and short, then re-upload.
            </p>
          )}

          <p className="text-xs text-gray-600">
            <strong>{preview.refCount}</strong> reference{preview.refCount === 1 ? '' : 's'} detected
          </p>
          {preview.warnings.map((w, i) => (
            <div key={i} className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">⚠ {w}</div>
          ))}
          <p className="text-xs text-gray-500">
            A heading missing from the list entirely? Make it bold and short in your Word document, then re-upload.
            {' '}<a href="/formatting" target="_blank" className="text-[#2BA4C8] font-semibold hover:underline">Formatting guide →</a>
          </p>
        </div>
      )}

      <p className="text-xs text-gray-400">
        No manuscript? You can skip this step — the Abstract field will be used.
      </p>
    </div>
  );
}

// ── Step 4: Upload Figures ───────────────────────────────────────────────────
interface FigureEntry { file: File; caption: string; preview: string; sectionName: string; }

type FigureMode = 'images' | 'document';

interface FigureState {
  mode: FigureMode;
  // images mode
  images: FigureEntry[];
  // document mode
  docFile: File | null;
  docCaptions: string;      // one caption per line
  docSectionNames: string;  // one section name per line (matches figure order)
}

function Step4({ state, onChange, detectedHeadings }: {
  state: FigureState;
  onChange: (s: FigureState) => void;
  detectedHeadings: string[];
}) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  function addImages(files: FileList | null) {
    if (!files) return;
    const current = state.images;
    if (current.length + files.length > 13) { alert('Maximum 13 figures.'); return; }
    const newEntries: FigureEntry[] = Array.from(files).map(file => ({
      file, caption: '', preview: URL.createObjectURL(file), sectionName: '',
    }));
    onChange({ ...state, images: [...current, ...newEntries] });
  }

  function updateCaption(i: number, caption: string) {
    const next = [...state.images];
    next[i] = { ...next[i], caption };
    onChange({ ...state, images: next });
  }

  function updateSectionName(i: number, sectionName: string) {
    const next = [...state.images];
    next[i] = { ...next[i], sectionName };
    onChange({ ...state, images: next });
  }

  function removeImage(i: number) {
    URL.revokeObjectURL(state.images[i].preview);
    onChange({ ...state, images: state.images.filter((_, idx) => idx !== i) });
  }

  function moveUp(i: number) {
    if (i === 0) return;
    const next = [...state.images];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    onChange({ ...state, images: next });
  }

  function moveDown(i: number) {
    if (i === state.images.length - 1) return;
    const next = [...state.images];
    [next[i], next[i + 1]] = [next[i + 1], next[i]];
    onChange({ ...state, images: next });
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-600">
        Upload figures as individual images, or as a single Word or PDF document containing all figures.
      </p>

      {/* Mode toggle */}
      <div className="flex gap-2">
        {([
          { key: 'images', label: '🖼️ Individual images' },
          { key: 'document', label: '📄 Figures document (PDF / DOCX)' },
        ] as const).map(m => (
          <button
            key={m.key}
            type="button"
            onClick={() => onChange({ ...state, mode: m.key })}
            className={`px-4 py-2 rounded-lg text-sm font-semibold border-2 transition ${
              state.mode === m.key
                ? 'border-[#2BA4C8] bg-[#e8f5fb] text-[#1B3A5C]'
                : 'border-gray-200 text-gray-500 hover:border-gray-300'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* ── Individual images ── */}
      {state.mode === 'images' && (
        <div className="space-y-3">
          <div
            className="border-2 border-dashed border-[#2BA4C8] rounded-xl p-6 text-center cursor-pointer hover:bg-[#f0fafd] transition"
            onClick={() => imageInputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); addImages(e.dataTransfer.files); }}
          >
            <div className="text-3xl mb-2">🖼️</div>
            <p className="text-sm text-gray-600">Click or drag images here</p>
            <p className="text-xs text-gray-400">PNG, JPG, TIFF · up to 13 figures</p>
            <input ref={imageInputRef} type="file" multiple
              accept=".png,.jpg,.jpeg,.tif,.tiff,.gif,.webp,.pdf,image/*,application/pdf" className="hidden"
              onChange={e => addImages(e.target.files)} />
          </div>

          {state.images.length > 0 && (
            <div className="space-y-3">
              {state.images.map((fig, i) => (
                <div key={i} className="border border-gray-200 rounded-xl p-3 flex gap-3 bg-white">
                  <img src={fig.preview} alt="" className="w-20 h-20 object-contain rounded border border-gray-100 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-[#2BA4C8]">Figure {i + 1}</span>
                      <div className="flex gap-1">
                        <button type="button" onClick={() => moveUp(i)} className="text-gray-400 hover:text-gray-700 text-xs px-1">▲</button>
                        <button type="button" onClick={() => moveDown(i)} className="text-gray-400 hover:text-gray-700 text-xs px-1">▼</button>
                        <button type="button" onClick={() => removeImage(i)} className="text-red-400 hover:text-red-600 text-xs px-1">✕</button>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mb-1 truncate">{fig.file.name}</p>
                    <input type="text" value={fig.caption}
                      onChange={e => updateCaption(i, e.target.value)}
                      placeholder="Figure caption…"
                      className="w-full border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#2BA4C8] bg-white mb-1" />
                    {detectedHeadings.length > 0 ? (
                      <select value={fig.sectionName}
                        onChange={e => updateSectionName(i, e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#2BA4C8] bg-gray-50 text-gray-600">
                        <option value="">Which section? (optional)</option>
                        {detectedHeadings.map((h, hi) => <option key={hi} value={h}>{h}</option>)}
                      </select>
                    ) : (
                      <input type="text" value={fig.sectionName}
                        onChange={e => updateSectionName(i, e.target.value)}
                        placeholder="Which section? (upload your manuscript first to pick from a list)"
                        className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#2BA4C8] bg-gray-50 text-gray-600 placeholder-gray-400" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Figures document ── */}
      {state.mode === 'document' && (
        <div className="space-y-4">
          <div
            className="border-2 border-dashed border-[#2BA4C8] rounded-xl p-8 text-center cursor-pointer hover:bg-[#f0fafd] transition"
            onClick={() => docInputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) onChange({ ...state, docFile: f });
            }}
          >
            <div className="text-4xl mb-3">📑</div>
            {state.docFile ? (
              <div>
                <p className="font-semibold text-[#2BA4C8]">{state.docFile.name}</p>
                <p className="text-xs text-gray-500 mt-1">{(state.docFile.size / 1024).toFixed(1)} KB</p>
                <button type="button"
                  onClick={e => { e.stopPropagation(); onChange({ ...state, docFile: null }); }}
                  className="mt-2 text-xs text-red-500 hover:underline">Remove</button>
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-600">Drag & drop or <span className="text-[#2BA4C8] font-semibold">browse</span></p>
                <p className="text-xs text-gray-400 mt-1">PDF or DOCX containing all figures (one per page / one per section)</p>
              </>
            )}
            <input ref={docInputRef} type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) onChange({ ...state, docFile: f }); }} />
          </div>

          <div>
            <Label>Figure Captions (one per line, in order)</Label>
            <Textarea
              rows={6}
              value={state.docCaptions}
              onChange={e => onChange({ ...state, docCaptions: e.target.value })}
              placeholder={"Figure 1: Layers of the epidermis.\nFigure 2: UV absorption spectrum of carotenoids.\nFigure 3: Western blot results."}
            />
            <p className="text-xs text-gray-400 mt-1">
              Enter one caption per line. They will be matched to figures in document order.
            </p>
          </div>

          <div>
            <Label>Section for each figure (one per line, optional)</Label>
            <Textarea
              rows={4}
              value={state.docSectionNames}
              onChange={e => onChange({ ...state, docSectionNames: e.target.value })}
              placeholder={"Introduction\nCancer Biology and Skin Cancer\nMethods"}
            />
            <p className="text-xs text-gray-400 mt-1">
              Type the section name where each figure should appear — line 1 for Figure 1, line 2 for Figure 2, etc. Leave a line blank to use automatic placement.
            </p>
            {detectedHeadings.length > 0 && (
              <p className="text-xs text-gray-500 mt-1">
                <span className="font-semibold">Detected sections</span> (copy these exactly): {detectedHeadings.join(' · ')}
              </p>
            )}
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400">This step is optional — you can submit without figures.</p>
    </div>
  );
}

// ── Step 5: Review ───────────────────────────────────────────────────────────
function ReviewRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 py-1 border-b border-gray-100 last:border-0">
      <dt className="font-semibold text-gray-500 w-36 flex-shrink-0 text-xs">{label}</dt>
      <dd className="text-gray-800 text-sm">{children}</dd>
    </div>
  );
}

function ReviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-white">
      <h3 className="font-bold text-[#2BA4C8] text-sm mb-2">{title}</h3>
      <dl>{children}</dl>
    </div>
  );
}

function Step5({ author, meta, manuscript, figState }: {
  author: AuthorInfo; meta: ArticleMeta; manuscript: File | null; figState: FigureState;
}) {
  const figCount = figState.mode === 'images' ? figState.images.length : (figState.docFile ? '(from document)' : 0);
  return (
    <div className="space-y-4">
      <ReviewSection title="Author Information">
        <ReviewRow label="Primary Author">{author.firstName} {author.lastName}</ReviewRow>
        <ReviewRow label="Affiliation">{author.affiliation}</ReviewRow>
        <ReviewRow label="Email">{author.email}</ReviewRow>
        <ReviewRow label="Guardian Email">{author.guardianEmail}</ReviewRow>
        <ReviewRow label="Corresponding">{author.isCorresponding ? 'Yes' : 'No'}</ReviewRow>
        {author.coAuthors.length > 0 && (
          <ReviewRow label="Co-Authors">
            {author.coAuthors.map(c => `${c.firstName} ${c.lastName}`).join(', ')}
          </ReviewRow>
        )}
      </ReviewSection>
      <ReviewSection title="Article Details">
        <ReviewRow label="Type">{meta.articleType}</ReviewRow>
        <ReviewRow label="Title">{meta.title}</ReviewRow>
        <ReviewRow label="Journal">{meta.journal}</ReviewRow>
        <ReviewRow label="Keywords">{meta.keywords.join(', ')}</ReviewRow>
        <ReviewRow label="Abstract">{meta.abstract.slice(0, 200)}{meta.abstract.length > 200 ? '…' : ''}</ReviewRow>
        {meta.acknowledgments && <ReviewRow label="Acknowledgments">{meta.acknowledgments}</ReviewRow>}
        <ReviewRow label="COI">{meta.coi}</ReviewRow>
      </ReviewSection>
      <ReviewSection title="Files">
        <ReviewRow label="Manuscript">
          {manuscript ? manuscript.name : <span className="text-amber-600 italic">No file uploaded</span>}
        </ReviewRow>
        <ReviewRow label="Figures">
          {figCount === 0 ? <span className="text-gray-400 italic">None</span> : figCount}
        </ReviewRow>
      </ReviewSection>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function SubmitPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [author, setAuthor] = useState<AuthorInfo>({
    firstName: '', lastName: '', affiliation: '', email: '', guardianEmail: '',
    isCorresponding: true, coAuthors: [],
  });

  const [meta, setMeta] = useState<ArticleMeta>({
    articleType: 'Research Article',
    title: '', abstract: '', keywords: [], keywordInput: '',
    journal: '', acknowledgments: '', coi: '',
  });

  const [manuscript, setManuscript] = useState<File | null>(null);
  // Section headings detected from the manuscript — used to populate the
  // per-figure "which section" dropdown so students pick, not type.
  const [detectedHeadings, setDetectedHeadings] = useState<string[]>([]);
  // Student's header/subheader/remove re-classification, keyed by heading text.
  const [sectionChoices, setSectionChoices] = useState<Record<string, HeadingChoice>>({});

  const [figState, setFigState] = useState<FigureState>({
    mode: 'images', images: [], docFile: null, docCaptions: '', docSectionNames: '',
  });

  // ── Draft autosave: text fields survive an accidental tab close/refresh.
  // Files can't be stored in localStorage, so those still need re-selecting.
  const DRAFT_KEY = 'press-submission-draft';
  const hydrated = useRef(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d.author) setAuthor(a => ({ ...a, ...d.author }));
        if (d.meta) setMeta(m => ({ ...m, ...d.meta }));
      }
    } catch { /* corrupted draft — start fresh */ }
    hydrated.current = true;
  }, []);
  useEffect(() => {
    if (!hydrated.current) return; // don't overwrite the stored draft with initial empty state
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ author, meta }));
    } catch { /* storage full/blocked — autosave is best-effort */ }
  }, [author, meta]);

  function validateStep(): string | null {
    if (step === 0) {
      if (!author.firstName || !author.lastName || !author.affiliation || !author.email || !author.guardianEmail)
        return 'Please fill in all required fields.';
      // The custom Next button bypasses native form validation, so check
      // email formats here — a typo means confirmation/decision emails never arrive.
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
      if (!emailRe.test(author.email.trim()))
        return `"${author.email}" doesn't look like a valid email address.`;
      if (!emailRe.test(author.guardianEmail.trim()))
        return `"${author.guardianEmail}" doesn't look like a valid guardian email address.`;
      if (author.email.trim().toLowerCase() === author.guardianEmail.trim().toLowerCase())
        return 'The guardian email should be different from your own email.';
    }
    if (step === 1) {
      if (!meta.articleType) return 'Please select an article type.';
      if (!meta.title) return 'Title is required.';
      if (meta.title.trim().split(/\s+/).length > 15) return 'Title must be 15 words or fewer.';
      if (!meta.abstract) return 'Abstract is required.';
      const aw = meta.abstract.trim().split(/\s+/).length;
      if (aw < 100) return `Abstract must be at least 100 words (currently ${aw}).`;
      if (meta.keywords.length < 5) return 'Please add at least 5 keywords.';
      if (!meta.journal) return 'Please select a journal.';
      if (!meta.coi) return 'Conflict of Interest statement is required.';
    }
    return null;
  }

  function next() {
    const err = validateStep();
    if (err) { setError(err); return; }
    setError('');
    setStep(s => s + 1);
  }

  async function submit() {
    setSubmitting(true);
    setError('');
    try {
      const fd = new FormData();
      // Author
      fd.append('firstName', author.firstName);
      fd.append('lastName', author.lastName);
      fd.append('affiliation', author.affiliation);
      fd.append('email', author.email);
      fd.append('guardianEmail', author.guardianEmail);
      fd.append('isCorresponding', String(author.isCorresponding));
      fd.append('coAuthors', JSON.stringify(author.coAuthors));
      // Meta
      fd.append('articleType', meta.articleType);
      fd.append('title', meta.title);
      fd.append('abstract', meta.abstract);
      fd.append('keywords', JSON.stringify(meta.keywords));
      fd.append('journal', meta.journal);
      fd.append('acknowledgments', meta.acknowledgments);
      fd.append('coi', meta.coi);
      // Manuscript
      if (manuscript) fd.append('manuscript', manuscript);
      fd.append('sectionOverrides', JSON.stringify(sectionChoices));
      // Figures
      if (figState.mode === 'images') {
        figState.images.forEach(fig => fd.append('figures', fig.file));
        fd.append('captions', JSON.stringify(figState.images.map(f => f.caption)));
        fd.append('sectionNames', JSON.stringify(figState.images.map(f => f.sectionName || '')));
      } else if (figState.docFile) {
        fd.append('figuresDoc', figState.docFile);
        const captionLines = figState.docCaptions.split('\n').map(l => l.trim()).filter(Boolean);
        fd.append('captions', JSON.stringify(captionLines));
        const sectionLines = figState.docSectionNames.split('\n').map(l => l.trim());
        fd.append('sectionNames', JSON.stringify(sectionLines));
      }

      const res = await fetch('/api/submit', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Submission failed');
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* best-effort */ }
      router.push(`/preview/${data.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Submission failed');
      setSubmitting(false);
    }
  }

  const stepContent = [
    <Step1 key={0} data={author} onChange={setAuthor} />,
    <Step2 key={1} data={meta} onChange={setMeta} />,
    <Step3 key={2} file={manuscript} onChange={setManuscript} onDetected={setDetectedHeadings}
      choices={sectionChoices} onChoices={setSectionChoices} />,
    <Step4 key={3} state={figState} onChange={setFigState} detectedHeadings={detectedHeadings} />,
    <Step5 key={4} author={author} meta={meta} manuscript={manuscript} figState={figState} />,
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#1a2744] text-white py-4 px-6 flex items-center justify-between">
        <div>
          <span className="text-2xl font-black tracking-tight">PRESS Journals</span>
          <span className="ml-3 text-[#2BA4C8] text-sm font-semibold">Article Submission</span>
        </div>
        <a href="/admin" className="text-xs text-gray-400 hover:text-white transition">Editor Login →</a>
      </header>

      <main className="max-w-2xl mx-auto py-10 px-4">
        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex justify-between mb-3">
            {STEPS.map((_, i) => (
              <div key={i} className="flex flex-col items-center" style={{ width: `${100 / STEPS.length}%` }}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all
                  ${i < step ? 'bg-[#2BA4C8] border-[#2BA4C8] text-white'
                    : i === step ? 'bg-white border-[#2BA4C8] text-[#2BA4C8]'
                    : 'bg-white border-gray-300 text-gray-400'}`}>
                  {i < step ? '✓' : i + 1}
                </div>
              </div>
            ))}
          </div>
          <div className="relative h-1 bg-gray-200 rounded mx-4">
            <div className="absolute top-0 left-0 h-1 bg-[#2BA4C8] rounded transition-all duration-300"
              style={{ width: `${(step / (STEPS.length - 1)) * 100}%` }} />
          </div>
          <div className="flex justify-between mt-2">
            {STEPS.map((s, i) => (
              <span key={i}
                className={`text-xs text-center leading-tight ${i === step ? 'text-[#2BA4C8] font-semibold' : 'text-gray-400'}`}
                style={{ width: `${100 / STEPS.length}%` }}>
                {s}
              </span>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <h2 className="text-xl font-bold text-gray-800 mb-6">{STEPS[step]}</h2>
          {stepContent[step]}

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
          )}

          <div className="flex justify-between mt-8 pt-4 border-t border-gray-100">
            {step > 0 ? (
              <button type="button" onClick={() => { setError(''); setStep(s => s - 1); }}
                className="px-5 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
                ← Back
              </button>
            ) : <div />}

            {step < STEPS.length - 1 ? (
              <button type="button" onClick={next}
                className="px-6 py-2 bg-[#2BA4C8] text-white rounded-lg text-sm font-semibold hover:bg-[#2090b0]">
                Continue →
              </button>
            ) : (
              <button type="button" onClick={submit} disabled={submitting}
                className="px-6 py-2 bg-[#2BA4C8] text-white rounded-lg text-sm font-semibold hover:bg-[#2090b0] disabled:opacity-50">
                {submitting ? 'Submitting…' : 'Submit Article'}
              </button>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          By submitting, you agree to the PRESS Journals submission guidelines.
        </p>
      </main>
    </div>
  );
}
