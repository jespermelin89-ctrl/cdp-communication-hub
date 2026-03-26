'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import TopBar from '@/components/TopBar';
import PriorityBadge from '@/components/PriorityBadge';
import { api } from '@/lib/api';
import type { EmailThread } from '@/lib/types';

export default function ThreadDetailPage() {
  const params = useParams();
  const router = useRouter();
  const threadId = params.id as string;

  const [thread, setThread] = useState<EmailThread | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [draftInstruction, setDraftInstruction] = useState('');

  useEffect(() => {
    loadThread();
  }, [threadId]);

  async function loadThread() {
    try {
      setLoading(true);
      const result = await api.getThread(threadId);
      setThread(result.thread);
    } catch (err: any) {
      console.error('Failed to load thread:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleAnalyze() {
    setAnalyzing(true);
    try {
      await api.syncMessages(threadId);
      const result = await api.analyzeThread(threadId);
      if (result.draft) {
        alert(`Analysis complete! A reply draft was created (status: pending). View it in Draft Center.`);
      }
      await loadThread();
    } catch (err: any) {
      alert(`Analysis failed: ${err.message}`);
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleGenerateDraft() {
    if (!draftInstruction.trim()) return;
    setGeneratingDraft(true);
    try {
      const result = await api.generateDraft({
        account_id: thread!.account.id!,
        thread_id: threadId,
        instruction: draftInstruction,
      });
      setDraftInstruction('');
      alert(result.message);
      router.push(`/drafts/${result.draft.id}`);
    } catch (err: any) {
      alert(`Generate draft failed: ${err.message}`);
    } finally {
      setGeneratingDraft(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <TopBar />
        <div className="text-center py-12 text-gray-500">Loading thread...</div>
      </div>
    );
  }

  if (!thread) {
    return (
      <div className="min-h-screen bg-gray-50">
        <TopBar />
        <div className="text-center py-12 text-gray-500">Thread not found.</div>
      </div>
    );
  }

  const analysis = thread.latestAnalysis;

  return (
    <div className="min-h-screen bg-gray-50">
      <TopBar />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-gray-700 mb-4">
          &larr; Back to Inbox
        </button>

        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{thread.subject || '(No Subject)'}</h1>
            <div className="text-sm text-gray-500 mt-1">
              {thread.messageCount} messages | {thread.account.emailAddress}
            </div>
          </div>
          {analysis && <PriorityBadge priority={analysis.priority} />}
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Messages Column */}
          <div className="lg:col-span-2 space-y-4">
            {thread.messages && thread.messages.length > 0 ? (
              thread.messages.map((msg) => (
                <div key={msg.id} className="card">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-900">{msg.fromAddress}</span>
                    <span className="text-xs text-gray-400">
                      {new Date(msg.receivedAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mb-3">
                    To: {msg.toAddresses.join(', ')}
                    {msg.ccAddresses.length > 0 && (
                      <span> | Cc: {msg.ccAddresses.join(', ')}</span>
                    )}
                  </div>
                  <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                    {msg.bodyText || '(No text content)'}
                  </div>
                </div>
              ))
            ) : (
              <div className="card text-center py-8">
                <p className="text-gray-500 mb-4">Messages not yet synced.</p>
                <button
                  onClick={async () => {
                    await api.syncMessages(threadId);
                    await loadThread();
                  }}
                  className="btn-primary"
                >
                  Sync Messages
                </button>
              </div>
            )}

            {/* Generate Reply Draft */}
            <div className="card border-brand-200 bg-brand-50/30">
              <h3 className="text-sm font-medium text-gray-900 mb-3">Generate Reply Draft</h3>
              <textarea
                value={draftInstruction}
                onChange={(e) => setDraftInstruction(e.target.value)}
                placeholder="Tell the AI what to write, e.g.: 'Reply confirming the meeting for Thursday at 2pm'"
                rows={3}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-y mb-3"
              />
              <button
                onClick={handleGenerateDraft}
                disabled={generatingDraft || !draftInstruction.trim()}
                className="btn-primary text-sm"
              >
                {generatingDraft ? 'Generating...' : 'Generate Draft'}
              </button>
            </div>
          </div>

          {/* AI Analysis Sidebar */}
          <div className="space-y-4">
            {analysis ? (
              <div className="card">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">AI Analysis</h3>

                <div className="space-y-3">
                  <div>
                    <div className="text-xs font-medium text-gray-500 uppercase mb-1">Summary</div>
                    <div className="text-sm text-gray-700">{analysis.summary}</div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div>
                      <div className="text-xs font-medium text-gray-500 uppercase mb-1">Type</div>
                      <span className="badge bg-gray-100 text-gray-700">{analysis.classification}</span>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-gray-500 uppercase mb-1">Priority</div>
                      <PriorityBadge priority={analysis.priority} />
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-medium text-gray-500 uppercase mb-1">Suggested Action</div>
                    <span className="badge bg-brand-100 text-brand-700">{analysis.suggestedAction}</span>
                  </div>

                  <div className="text-xs text-gray-400 pt-2 border-t border-gray-100">
                    Confidence: {Math.round(analysis.confidence * 100)}% | {analysis.modelUsed}
                  </div>
                </div>
              </div>
            ) : (
              <div className="card text-center">
                <p className="text-sm text-gray-500 mb-3">No AI analysis yet.</p>
                <button
                  onClick={handleAnalyze}
                  disabled={analyzing}
                  className="btn-primary text-sm w-full"
                >
                  {analyzing ? 'Analyzing...' : 'Run AI Analysis'}
                </button>
              </div>
            )}

            {/* Pending Drafts for this thread */}
            {thread.drafts && thread.drafts.length > 0 && (
              <div className="card">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Drafts for this Thread</h3>
                <div className="space-y-2">
                  {thread.drafts.map((draft) => (
                    <a
                      key={draft.id}
                      href={`/drafts/${draft.id}`}
                      className="block p-2 rounded border border-gray-100 hover:bg-gray-50 text-sm"
                    >
                      <span className="font-medium">{draft.subject}</span>
                      <div className="text-xs text-gray-500 mt-0.5">Status: {draft.status}</div>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
