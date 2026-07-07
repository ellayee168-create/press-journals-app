'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

interface StatusInfo {
  exists: boolean;
  title?: string;
  status?: 'pending' | 'accepted' | 'rejected';
  created_at?: number;
  firstName?: string;
}

const STATUS_DISPLAY = {
  pending: {
    label: 'Under Review',
    color: 'bg-amber-100 text-amber-700 border-amber-200',
    blurb: 'Your submission is being reviewed by the editorial team. You will receive an email when a decision is made.',
  },
  accepted: {
    label: 'Accepted 🎉',
    color: 'bg-green-100 text-green-700 border-green-200',
    blurb: 'Congratulations! Your article has been accepted for publication. Watch your email for details about the upcoming issue.',
  },
  rejected: {
    label: 'Not Accepted',
    color: 'bg-red-100 text-red-700 border-red-200',
    blurb: 'Your submission was not accepted this cycle. Check your email for feedback from the editors — we encourage you to revise and submit again.',
  },
} as const;

export default function StatusPage() {
  const { id } = useParams<{ id: string }>();
  const [info, setInfo] = useState<StatusInfo | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/status/${id}`)
      .then(r => r.json())
      .then(setInfo)
      .catch(() => setError('Could not load submission status.'));
  }, [id]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#1a2744] text-white py-4 px-6">
        <span className="text-2xl font-black">PRESS Journals</span>
        <span className="ml-3 text-[#2BA4C8] text-sm font-semibold">Submission Status</span>
      </header>

      <main className="max-w-xl mx-auto py-16 px-4">
        {error ? (
          <p className="text-red-500 text-center">{error}</p>
        ) : !info ? (
          <p className="text-gray-400 text-center">Loading…</p>
        ) : !info.exists ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <p className="text-gray-600 font-medium">Submission not found.</p>
            <p className="text-gray-400 text-sm mt-2">
              Check that you used the full link from your confirmation email.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 p-8">
            <p className="text-sm text-gray-500 mb-1">
              {info.firstName ? `Hi ${info.firstName} — here's` : "Here's"} the status of your submission:
            </p>
            <h1 className="text-lg font-bold text-gray-800 leading-snug mb-4">{info.title}</h1>
            <div className={`inline-block px-4 py-1.5 rounded-full border text-sm font-bold ${STATUS_DISPLAY[info.status!].color}`}>
              {STATUS_DISPLAY[info.status!].label}
            </div>
            <p className="text-sm text-gray-600 mt-4">{STATUS_DISPLAY[info.status!].blurb}</p>
            {info.created_at && (
              <p className="text-xs text-gray-400 mt-4">
                Submitted {new Date(info.created_at).toLocaleDateString()}
              </p>
            )}
            <div className="mt-6 pt-4 border-t border-gray-100">
              <a href={`/preview/${id}`} className="text-[#2BA4C8] text-sm font-semibold hover:underline">
                View your formatted article →
              </a>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
