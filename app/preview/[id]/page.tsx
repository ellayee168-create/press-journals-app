'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';

type Stage = 'checking' | 'generating' | 'ready' | 'error';

export default function PreviewPage() {
  const { id } = useParams<{ id: string }>();
  const [stage, setStage] = useState<Stage>('checking');
  const [dots, setDots] = useState('');
  const iframeLoaded = useRef(false);

  // Animate ellipsis during generation
  useEffect(() => {
    if (stage !== 'generating') return;
    const t = setInterval(() => setDots(d => (d.length >= 3 ? '' : d + '.')), 450);
    return () => clearInterval(t);
  }, [stage]);

  // Step 1: confirm the submission exists (cheap DB check)
  useEffect(() => {
    fetch(`/api/status/${id}`)
      .then(r => r.json())
      .then(({ exists }) => {
        if (exists) setStage('generating');
        else setStage('error');
      })
      .catch(() => setStage('error'));
  }, [id]);

  // Step 2: once we know it exists, show the PDF iframe.
  // The browser's PDF viewer handles page rendering + page breaks.
  const pdfSrc = `/api/download/${id}`;

  return (
    <div className="min-h-screen flex flex-col bg-[#525659]">
      {/* Toolbar */}
      <div className="bg-[#1a2744] text-white py-3 px-6 flex items-center justify-between flex-shrink-0 z-20">
        <div>
          <span className="font-black text-lg tracking-tight">PRESS Journals</span>
          <span className="ml-3 text-[#2BA4C8] text-sm font-medium">Article Preview</span>
        </div>
        <div className="flex gap-3 items-center">
          <a
            href={pdfSrc}
            download
            className="px-4 py-2 bg-[#2BA4C8] text-white rounded-lg text-sm font-semibold hover:bg-[#2090b0] transition"
          >
            ↓ Download PDF
          </a>
          <a
            href="/"
            className="px-4 py-2 border border-gray-500 text-gray-300 rounded-lg text-sm hover:bg-white/10 transition"
          >
            ← New Submission
          </a>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 relative">

        {/* ── Loading / error overlay ── */}
        {(stage === 'checking' || stage === 'generating') && (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <div className="bg-white rounded-2xl shadow-2xl px-10 py-9 text-center w-80">
              <div className="w-12 h-12 rounded-full border-4 border-gray-200 border-t-[#2BA4C8] animate-spin mx-auto mb-5" />
              <p className="text-gray-800 font-semibold text-[15px] mb-2">
                {stage === 'checking' ? 'Loading…' : `Building your article${dots}`}
              </p>
              <p className="text-gray-400 text-sm leading-relaxed">
                Formatting text, placing figures, and rendering the PDF.
                This usually takes 10–20 seconds.
              </p>
            </div>
          </div>
        )}

        {stage === 'error' && (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <div className="bg-white rounded-2xl shadow-2xl px-10 py-9 text-center w-80">
              <div className="text-4xl mb-4">⚠️</div>
              <p className="text-gray-800 font-semibold text-[15px] mb-2">Submission not found</p>
              <p className="text-gray-400 text-sm mb-5">
                We couldn&apos;t locate this submission. It may have been deleted.
              </p>
              <a href="/" className="text-[#2BA4C8] text-sm hover:underline">← Back to submission form</a>
            </div>
          </div>
        )}

        {/* ── PDF iframe — mounts once submission confirmed, browser PDF viewer handles pages ── */}
        {stage === 'generating' && (
          <iframe
            src={pdfSrc}
            className="w-full border-0"
            style={{ height: 'calc(100vh - 53px)' }}
            title="Article PDF"
            onLoad={() => {
              if (!iframeLoaded.current) {
                iframeLoaded.current = true;
                setStage('ready');
              }
            }}
            onError={() => setStage('error')}
          />
        )}

        {stage === 'ready' && (
          <iframe
            src={pdfSrc}
            className="w-full border-0"
            style={{ height: 'calc(100vh - 53px)' }}
            title="Article PDF"
          />
        )}

      </div>
    </div>
  );
}
