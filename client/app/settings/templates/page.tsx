'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import TopBar from '@/components/TopBar';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { toast } from 'sonner';
import { ChevronLeft, Plus, Trash2, Wand2, FileText, Loader2 } from 'lucide-react';

export default function TemplatesPage() {
  const { t } = useI18n();
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [aiInstructions, setAiInstructions] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSubject, setNewSubject] = useState('');
  const [newBody, setNewBody] = useState('');
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    api.getTemplates()
      .then((r) => setTemplates(r.templates ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate() {
    if (!newName.trim()) { toast.error('Ange ett mallnamn'); return; }
    setCreating(true);
    try {
      const result = await api.createTemplate({
        name: newName.trim(),
        subject: newSubject.trim() || undefined,
        body_text: newBody.trim() || undefined,
      });
      setTemplates((prev) => [result.template, ...prev]);
      setNewName('');
      setNewSubject('');
      setNewBody('');
      setShowForm(false);
      toast.success(t.templates.saved);
    } catch {
      toast.error('Kunde inte spara mall');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.deleteTemplate(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      toast.success(t.templates.deleted);
    } catch {
      toast.error('Kunde inte ta bort mall');
    }
  }

  async function handleGenerateAI() {
    if (!aiInstructions.trim()) { toast.error('Beskriv vad mallen ska innehålla'); return; }
    setAiGenerating(true);
    try {
      const result = await api.generateTemplate(aiInstructions);
      setTemplates((prev) => [result.template, ...prev]);
      setAiInstructions('');
      toast.success(t.templates.generated);
    } catch {
      toast.error('Kunde inte generera mall');
    } finally {
      setAiGenerating(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <TopBar />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/settings" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <ChevronLeft size={20} />
          </Link>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <FileText size={20} className="text-violet-500" />
            {t.templates.title}
          </h1>
          <div className="flex-1" />
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white transition-colors"
          >
            <Plus size={15} />
            {t.templates.createTemplate}
          </button>
        </div>

        {/* AI generation */}
        <div className="bg-violet-50 dark:bg-violet-900/10 border border-violet-200 dark:border-violet-800 rounded-xl p-4 mb-6">
          <h2 className="text-sm font-semibold text-violet-700 dark:text-violet-300 mb-2 flex items-center gap-1.5">
            <Wand2 size={14} />
            {t.templates.generateAI}
          </h2>
          <div className="flex gap-2">
            <textarea
              value={aiInstructions}
              onChange={(e) => setAiInstructions(e.target.value)}
              placeholder={t.templates.instructions}
              rows={2}
              className="flex-1 text-sm px-3 py-2 rounded-lg border border-violet-200 dark:border-violet-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 resize-none outline-none focus:ring-2 focus:ring-violet-400"
            />
            <button
              onClick={handleGenerateAI}
              disabled={aiGenerating}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium disabled:opacity-50 transition-colors"
            >
              {aiGenerating ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
              {aiGenerating ? t.templates.generating : 'Generera'}
            </button>
          </div>
        </div>

        {/* Create form */}
        {showForm && (
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 mb-6">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">{t.templates.createTemplate}</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t.templates.name} *</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-violet-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t.templates.subject}</label>
                <input
                  type="text"
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-violet-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t.templates.bodyText}</label>
                <textarea
                  value={newBody}
                  onChange={(e) => setNewBody(e.target.value)}
                  rows={5}
                  className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 outline-none resize-none focus:ring-2 focus:ring-violet-400"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowForm(false)}
                  className="text-sm px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Avbryt
                </button>
                <button
                  onClick={handleCreate}
                  disabled={creating}
                  className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white font-medium disabled:opacity-50 transition-colors"
                >
                  {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  Spara
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Template list */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="animate-spin text-violet-500" />
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-12 text-gray-400 dark:text-gray-500">
            <FileText size={32} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm">{t.templates.noTemplates}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {templates.map((tmpl) => (
              <div
                key={tmpl.id}
                className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-gray-900 dark:text-gray-100 text-sm">{tmpl.name}</span>
                      {tmpl.category && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400">
                          {tmpl.category}
                        </span>
                      )}
                      {tmpl.usageCount > 0 && (
                        <span className="text-xs text-gray-400">{tmpl.usageCount}× {t.templates.usageCount}</span>
                      )}
                    </div>
                    {tmpl.subject && (
                      <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                        <span className="font-medium">Ämne:</span> {tmpl.subject}
                      </div>
                    )}
                    {tmpl.bodyText && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                        {tmpl.bodyText}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleDelete(tmpl.id)}
                    className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors p-1"
                    title={t.templates.deleteTemplate}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
