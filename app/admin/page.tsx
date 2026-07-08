'use client';

import { useState, useEffect, useRef } from 'react';

interface Submission {
  id: string;
  created_at: number;
  status: 'pending' | 'accepted' | 'rejected';
  first_name: string;
  last_name: string;
  title: string;
  journal: string;
  email: string;
  parse_ok?: boolean;
}

interface IssueSettings {
  issue_number: string;
  issue_season: string;
  editors_letter: string;
  top_reads: Array<{ id: string; title: string; author: string }>;
  author_spotlight: string[];
}

const STATUS_COLORS = {
  pending: 'bg-amber-100 text-amber-700',
  accepted: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

// ── Login screen ────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.ok) onLogin();
    else setError('Invalid password.');
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow border border-gray-200 p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-2xl font-black text-[#1a2744]">PRESS Journals</div>
          <div className="text-[#2BA4C8] font-semibold text-sm mt-1">Editor Dashboard</div>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2BA4C8]"
              placeholder="Enter editor password"
            />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button
            type="submit"
            className="w-full py-2 bg-[#2BA4C8] text-white rounded-lg text-sm font-semibold hover:bg-[#2090b0]"
          >
            Log In
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Submissions tab ──────────────────────────────────────────────────────────
function SubmissionsTab() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Submission['status']>('all');
  const [reparsingAll, setReparsingAll] = useState(false);
  const [reparseAllMsg, setReparseAllMsg] = useState('');

  async function fetchSubmissions() {
    setLoading(true);
    const res = await fetch('/api/admin/submissions');
    if (res.ok) setSubmissions(await res.json());
    setLoading(false);
  }

  useEffect(() => { fetchSubmissions(); }, []);

  async function updateStatus(id: string, status: string) {
    const sub = submissions.find(s => s.id === id);
    let note: string | undefined;
    let notify = false;
    if (status === 'accepted' || status === 'rejected') {
      if (!confirm(`Mark "${sub?.title ?? 'this submission'}" as ${status}?`)) {
        setSubmissions(prev => [...prev]); // re-render so the select snaps back
        return;
      }
      const noteInput = prompt(
        `The student will be emailed about this decision.\n\nOptional note to include (leave blank for none).\nPress Cancel to change status WITHOUT emailing the student.`
      );
      notify = noteInput !== null;
      note = noteInput || undefined;
    }
    await fetch('/api/admin/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status, note, notify }),
    });
    setSubmissions(prev =>
      prev.map(s => s.id === id ? { ...s, status: status as Submission['status'] } : s)
    );
  }

  async function deleteSubmission(s: Submission) {
    if (!confirm(
      `Permanently delete "${s.title}" by ${s.first_name} ${s.last_name}?\n\nThis removes the submission and all its uploaded files. This cannot be undone.`
    )) return;
    const res = await fetch(`/api/admin/submission/${s.id}`, { method: 'DELETE' });
    if (res.ok) setSubmissions(prev => prev.filter(x => x.id !== s.id));
    else alert('Delete failed — please try again.');
  }

  const flagged = submissions.filter(s => s.parse_ok === false);

  async function reparseAllFlagged() {
    if (!confirm(`Re-parse ${flagged.length} flagged submission(s)? This re-reads each stored manuscript with the latest parser.`)) return;
    setReparsingAll(true);
    setReparseAllMsg('');
    let ok = 0, failed = 0;
    for (const s of flagged) {
      const res = await fetch(`/api/admin/reparse/${s.id}`, { method: 'POST' });
      if (res.ok) ok++; else failed++;
    }
    await fetchSubmissions();
    setReparsingAll(false);
    setReparseAllMsg(`Re-parsed ${ok} submission(s)` + (failed ? `, ${failed} failed (open them individually to see why)` : ''));
  }

  const visible = submissions.filter(s => {
    if (statusFilter !== 'all' && s.status !== statusFilter) return false;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      const hay = `${s.first_name} ${s.last_name} ${s.title} ${s.journal} ${s.email}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h2 className="text-lg font-bold text-gray-800">
          Submissions ({visible.length}{visible.length !== submissions.length ? ` of ${submissions.length}` : ''})
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search author, title, journal…"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-[#2BA4C8]"
          />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
            className="border border-gray-300 rounded-lg text-sm px-3 py-2 bg-white"
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="accepted">Accepted</option>
            <option value="rejected">Rejected</option>
          </select>
          {flagged.length > 0 && (
            <button
              onClick={reparseAllFlagged}
              disabled={reparsingAll}
              className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-semibold hover:bg-amber-600 disabled:opacity-50"
              title="Re-run the manuscript parser on every submission flagged with ⚠ check parse"
            >
              {reparsingAll ? 'Re-parsing…' : `↺ Re-parse ${flagged.length} flagged`}
            </button>
          )}
          <button
            onClick={fetchSubmissions}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-100"
          >
            Refresh
          </button>
        </div>
      </div>
      {reparseAllMsg && (
        <p className="text-sm text-green-700 font-medium mb-3">{reparseAllMsg}</p>
      )}

      {loading ? (
        <p className="text-gray-400 text-sm">Loading…</p>
      ) : submissions.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
          No submissions yet.
        </div>
      ) : visible.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
          No submissions match your search.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Date</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Author</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Title</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Journal</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.map(s => (
                <tr key={s.id} className="hover:bg-gray-50 transition">
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                    {new Date(s.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">
                    {s.last_name}, {s.first_name}
                  </td>
                  <td className="px-4 py-3 text-gray-700 max-w-xs">
                    <a href={`/admin/${s.id}`} className="hover:text-[#2BA4C8] hover:underline">
                      {s.title}
                    </a>
                    {s.parse_ok === false && (
                      <span
                        className="ml-2 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-xs rounded font-semibold whitespace-nowrap"
                        title="The manuscript didn't parse into sections/references — open the submission and check the file or re-parse."
                      >
                        ⚠ check parse
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs max-w-[160px] truncate">
                    {s.journal}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[s.status]}`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 flex-wrap">
                      <a href={`/preview/${s.id}`} target="_blank"
                        className="text-[#2BA4C8] hover:underline text-xs">Preview</a>
                      <a href={`/api/download/${s.id}`}
                        className="text-[#2BA4C8] hover:underline text-xs">PDF</a>
                      <select
                        value={s.status}
                        onChange={e => updateStatus(s.id, e.target.value)}
                        className="border border-gray-200 rounded text-xs px-1 py-0.5 bg-white"
                      >
                        <option value="pending">Pending</option>
                        <option value="accepted">Accept</option>
                        <option value="rejected">Reject</option>
                      </select>
                      <button
                        onClick={() => deleteSubmission(s)}
                        className="text-red-400 hover:text-red-600 text-xs"
                        title="Delete this submission and its files"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Issue Builder tab ────────────────────────────────────────────────────────
function IssueBuilderTab() {
  const [settings, setSettings] = useState<IssueSettings>({
    issue_number: '001',
    issue_season: 'Fall 2024',
    editors_letter: '',
    top_reads: [],
    author_spotlight: [],
  });
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [coverFilename, setCoverFilename] = useState('');
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saved, setSaved] = useState(false);

  const [spotlightInput, setSpotlightInput] = useState('');
  const coverRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/admin/issue-settings').then(r => r.json()).then(d => {
      if (d.issue_number) {
        setSettings({
          issue_number: d.issue_number,
          issue_season: d.issue_season,
          editors_letter: d.editors_letter || '',
          top_reads: JSON.parse(typeof d.top_reads === 'string' ? d.top_reads : JSON.stringify(d.top_reads || [])),
          author_spotlight: JSON.parse(typeof d.author_spotlight === 'string' ? d.author_spotlight : JSON.stringify(d.author_spotlight || [])),
        });
      }
      // Show that a previously uploaded cover photo is still on file
      if (d.cover_photo_path) {
        setCoverFilename(d.cover_photo_path.split('/').pop() || 'cover photo on file');
      }
    }).catch(() => {});

    fetch('/api/admin/submissions').then(r => r.json()).then(setSubmissions).catch(() => {});
  }, []);

  async function saveSettings() {
    setSaving(true);
    await fetch('/api/admin/issue-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function uploadCover(file: File) {
    const fd = new FormData();
    fd.append('photo', file);
    const res = await fetch('/api/admin/cover-photo', { method: 'POST', body: fd });
    if (res.ok) setCoverFilename(file.name);
  }

  function toggleTopRead(s: Submission) {
    const exists = settings.top_reads.find(r => r.id === s.id);
    if (exists) {
      setSettings(prev => ({ ...prev, top_reads: prev.top_reads.filter(r => r.id !== s.id) }));
    } else {
      setSettings(prev => ({
        ...prev,
        top_reads: [...prev.top_reads, {
          id: s.id,
          title: s.title,
          author: `${s.first_name} ${s.last_name}`,
        }],
      }));
    }
  }

  function addSpotlight() {
    const name = spotlightInput.trim();
    if (!name || settings.author_spotlight.includes(name)) return;
    setSettings(prev => ({ ...prev, author_spotlight: [...prev.author_spotlight, name] }));
    setSpotlightInput('');
  }

  function removeSpotlight(name: string) {
    setSettings(prev => ({ ...prev, author_spotlight: prev.author_spotlight.filter(n => n !== name) }));
  }

  const acceptedSubmissions = submissions.filter(s => s.status === 'accepted');

  return (
    <div className="space-y-6">

      {/* Issue Info */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-bold text-gray-800 mb-4">Issue Information</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-600 mb-1">Issue Number</label>
            <input
              value={settings.issue_number}
              onChange={e => setSettings(p => ({ ...p, issue_number: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2BA4C8]"
              placeholder="e.g. 001"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-600 mb-1">Season / Date</label>
            <input
              value={settings.issue_season}
              onChange={e => setSettings(p => ({ ...p, issue_season: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2BA4C8]"
              placeholder="e.g. Fall 2024 or January 2025"
            />
          </div>
        </div>
      </div>

      {/* Cover Photo */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-bold text-gray-800 mb-1">Cover Photo</h3>
        <p className="text-sm text-gray-500 mb-3">This image appears on the journal cover. Use a high-resolution landscape photo.</p>
        <div
          className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-[#2BA4C8] transition"
          onClick={() => coverRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file) uploadCover(file);
          }}
        >
          <input
            ref={coverRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) uploadCover(f); }}
          />
          {coverFilename ? (
            <p className="text-green-700 font-medium text-sm">✓ {coverFilename} <span className="text-gray-400 font-normal">(click or drop to replace)</span></p>
          ) : (
            <>
              <p className="text-gray-500 text-sm font-medium">Drop image here or click to browse</p>
              <p className="text-gray-400 text-xs mt-1">JPG, PNG, WebP</p>
            </>
          )}
        </div>
      </div>

      {/* Editor's Letter */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-bold text-gray-800 mb-1">Letter from the Editors</h3>
        <p className="text-sm text-gray-500 mb-3">Paste the full letter text. Use blank lines between paragraphs.</p>
        <textarea
          value={settings.editors_letter}
          onChange={e => setSettings(p => ({ ...p, editors_letter: e.target.value }))}
          rows={10}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#2BA4C8]"
          placeholder={"Dear Readers,\n\nWelcome to PRESS Journals...\n\nSincerely,\nThe Editors"}
        />
      </div>

      {/* Editor's Top Reads */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-bold text-gray-800 mb-1">Editor&rsquo;s Top Reads</h3>
        <p className="text-sm text-gray-500 mb-3">Select accepted articles to feature on the cover.</p>
        {acceptedSubmissions.length === 0 ? (
          <p className="text-gray-400 text-sm italic">No accepted submissions yet. Accept submissions in the Submissions tab first.</p>
        ) : (
          <div className="space-y-2">
            {acceptedSubmissions.map(s => {
              const checked = !!settings.top_reads.find(r => r.id === s.id);
              return (
                <label key={s.id} className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleTopRead(s)}
                    className="mt-0.5 accent-[#2BA4C8]"
                  />
                  <div>
                    <div className="text-sm font-medium text-gray-800 group-hover:text-[#2BA4C8] transition">{s.title}</div>
                    <div className="text-xs text-gray-500">by {s.first_name} {s.last_name} · {s.journal}</div>
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* Author Spotlight */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-bold text-gray-800 mb-1">Author Spotlight</h3>
        <p className="text-sm text-gray-500 mb-3">Add author names to highlight on the cover.</p>
        <div className="flex gap-2 mb-3">
          <input
            value={spotlightInput}
            onChange={e => setSpotlightInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSpotlight(); } }}
            placeholder="Author name"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2BA4C8]"
          />
          <button
            onClick={addSpotlight}
            className="px-4 py-2 bg-[#2BA4C8] text-white rounded-lg text-sm font-semibold hover:bg-[#2090b0]"
          >
            Add
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {settings.author_spotlight.map(name => (
            <span key={name} className="flex items-center gap-1.5 bg-[#e8f5fb] text-[#1B3A5C] px-3 py-1 rounded-full text-sm font-medium">
              {name}
              <button onClick={() => removeSpotlight(name)} className="text-gray-400 hover:text-red-500 leading-none">&times;</button>
            </span>
          ))}
        </div>
      </div>

      {/* Save + Generate buttons */}
      <div className="flex items-center gap-3">
        <button
          onClick={saveSettings}
          disabled={saving}
          className="px-6 py-2.5 bg-[#1B3A5C] text-white rounded-lg text-sm font-semibold hover:bg-[#152d49] disabled:opacity-60"
        >
          {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Settings'}
        </button>

        <a
          href="/api/admin/generate-issue"
          onClick={async e => {
            e.preventDefault();
            setGenerating(true);
            try {
              // Save first, then generate
              await fetch('/api/admin/issue-settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings),
              });
              const res = await fetch('/api/admin/generate-issue');
              if (!res.ok) {
                const err = await res.json().catch(() => null);
                alert(err?.error || `Issue PDF generation failed (HTTP ${res.status}). Please try again.`);
                return;
              }
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download = 'PRESS_Journals_Issue.pdf';
              link.click();
              URL.revokeObjectURL(url);
            } catch {
              alert('Issue PDF generation failed — could not reach the server.');
            } finally {
              setGenerating(false);
            }
          }}
          className={`px-6 py-2.5 rounded-lg text-sm font-semibold text-white transition ${generating ? 'bg-gray-400 pointer-events-none' : 'bg-[#2BA4C8] hover:bg-[#2090b0]'}`}
        >
          {generating ? 'Generating PDF…' : '↓ Generate Full Journal PDF'}
        </a>

        <p className="text-xs text-gray-400 ml-2">
          Includes all <strong className="text-gray-600">accepted</strong> submissions.
          Currently: {acceptedSubmissions.length} accepted.
        </p>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null); // null = checking cookie
  const [tab, setTab] = useState<'submissions' | 'issue'>('submissions');

  // Restore a still-valid session after page refresh instead of forcing re-login.
  useEffect(() => {
    fetch('/api/admin/login')
      .then(r => r.json())
      .then(d => setAuthed(!!d.authed))
      .catch(() => setAuthed(false));
  }, []);

  if (authed === null) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400 text-sm">Loading…</div>;
  }
  if (!authed) return <LoginScreen onLogin={() => setAuthed(true)} />;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#1a2744] text-white py-4 px-6 flex items-center justify-between">
        <div>
          <span className="text-2xl font-black">PRESS Journals</span>
          <span className="ml-3 text-[#2BA4C8] text-sm font-semibold">Editor Dashboard</span>
        </div>
        <div className="flex items-center gap-4">
          <a href="/" className="text-xs text-gray-400 hover:text-white">← Submission Form</a>
          <button
            onClick={async () => {
              await fetch('/api/admin/logout', { method: 'POST' });
              setAuthed(false);
            }}
            className="text-xs text-gray-400 hover:text-white border border-gray-600 rounded px-3 py-1.5"
          >
            Log out
          </button>
        </div>
      </header>

      {/* Tab bar */}
      <div className="border-b border-gray-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 flex gap-0">
          {([
            { key: 'submissions', label: 'Submissions' },
            { key: 'issue', label: 'Issue Builder' },
          ] as const).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-5 py-3 text-sm font-semibold border-b-2 transition ${
                tab === t.key
                  ? 'border-[#2BA4C8] text-[#2BA4C8]'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-6xl mx-auto py-8 px-4">
        {tab === 'submissions' ? <SubmissionsTab /> : <IssueBuilderTab />}
      </main>
    </div>
  );
}
