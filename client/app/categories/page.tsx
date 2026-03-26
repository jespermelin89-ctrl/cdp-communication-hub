'use client';

import { useEffect, useState } from 'react';
import TopBar from '@/components/TopBar';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

interface Category {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  icon: string | null;
  description: string | null;
  isSystem: boolean;
  _count?: { rules: number };
}

interface SenderRule {
  id: string;
  senderPattern: string;
  subjectPattern: string | null;
  action: string;
  priority: string | null;
  timesApplied: number;
  category: { name: string; icon: string | null } | null;
}

const ACTION_COLORS: Record<string, string> = {
  spam: 'bg-red-100 text-red-700',
  archive: 'bg-gray-100 text-gray-600',
  categorize: 'bg-blue-100 text-blue-700',
  mute: 'bg-orange-100 text-orange-700',
  star: 'bg-amber-100 text-amber-700',
};

export default function CategoriesPage() {
  const { t } = useI18n();
  const [categories, setCategories] = useState<Category[]>([]);
  const [rules, setRules] = useState<SenderRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [classifying, setClassifying] = useState(false);

  const [showAddRule, setShowAddRule] = useState(false);
  const [ruleForm, setRuleForm] = useState({
    sender_pattern: '',
    subject_pattern: '',
    action: 'spam',
    category_slug: '',
  });

  const [showAddCategory, setShowAddCategory] = useState(false);
  const [catForm, setCatForm] = useState({ name: '', color: '#6366F1', icon: '', description: '' });

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    try {
      const [catRes, ruleRes] = await Promise.all([api.getCategories(), api.getRules()]);
      setCategories(catRes.categories);
      setRules(ruleRes.rules);
      if (!ruleForm.category_slug && catRes.categories.length > 0) {
        setRuleForm((f) => ({ ...f, category_slug: catRes.categories[0].slug }));
      }
    } catch (err) {
      console.error('Failed to load:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddRule() {
    try {
      await api.createRule({
        sender_pattern: ruleForm.sender_pattern,
        subject_pattern: ruleForm.subject_pattern || undefined,
        action: ruleForm.action,
        category_slug: ruleForm.category_slug || undefined,
      });
      setShowAddRule(false);
      setRuleForm((f) => ({ ...f, sender_pattern: '', subject_pattern: '' }));
      await loadAll();
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleDeleteRule(id: string) {
    if (!confirm(t.categories.deleteConfirm)) return;
    try {
      await api.deleteRule(id);
      await loadAll();
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleAddCategory() {
    try {
      await api.createCategory({
        name: catForm.name,
        color: catForm.color || undefined,
        icon: catForm.icon || undefined,
        description: catForm.description || undefined,
      });
      setShowAddCategory(false);
      setCatForm({ name: '', color: '#6366F1', icon: '', description: '' });
      await loadAll();
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleClassify() {
    setClassifying(true);
    try {
      const result = await api.classifyThreads();
      alert(`${result.classified} / ${result.total}`);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setClassifying(false);
    }
  }

  const actionLabel = (action: string) => {
    const map: Record<string, string> = {
      spam: t.categories.spam,
      archive: t.categories.archive,
      categorize: t.categories.categorize,
      mute: t.categories.mute,
      star: t.categories.star,
    };
    return map[action] || action;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <TopBar />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-gray-900">{t.categories.title}</h1>
          <button
            onClick={handleClassify}
            disabled={classifying}
            className="btn-primary text-sm flex items-center gap-2"
          >
            <span className={classifying ? 'animate-spin' : ''}>⚡</span>
            {classifying ? '…' : t.categories.runClassification}
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-3 text-gray-400">
              <div className="w-7 h-7 border-2 border-gray-200 border-t-brand-500 rounded-full animate-spin" />
              <span className="text-sm">{t.categories.loading}</span>
            </div>
          </div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-6">
            {/* ── Categories ── */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-gray-900">{t.categories.categoriesHeading}</h2>
                <button
                  onClick={() => setShowAddCategory(!showAddCategory)}
                  className="btn-secondary text-xs"
                >
                  {t.categories.newCategory}
                </button>
              </div>

              {showAddCategory && (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 mb-3 space-y-3">
                  <input
                    type="text"
                    placeholder={t.categories.nameLabel}
                    value={catForm.name}
                    onChange={(e) => setCatForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="text"
                      placeholder={t.categories.emojiLabel}
                      value={catForm.icon}
                      onChange={(e) => setCatForm((f) => ({ ...f, icon: e.target.value }))}
                      className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                    />
                    <input
                      type="color"
                      value={catForm.color}
                      onChange={(e) => setCatForm((f) => ({ ...f, color: e.target.value }))}
                      className="h-[38px] rounded-xl border border-gray-200 cursor-pointer"
                    />
                    <button
                      onClick={handleAddCategory}
                      className="btn-primary text-xs"
                      disabled={!catForm.name}
                    >
                      {t.categories.create}
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {categories.map((cat) => (
                  <div
                    key={cat.id}
                    className="bg-white rounded-2xl border border-gray-200 shadow-sm py-3 px-4 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: cat.color || '#9CA3AF' }}
                      />
                      <span className="text-base">{cat.icon}</span>
                      <span className="text-sm font-medium text-gray-900">{cat.name}</span>
                      {cat._count?.rules ? (
                        <span className="text-xs text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded-full border border-gray-200">
                          {cat._count.rules}
                        </span>
                      ) : null}
                      {cat.isSystem && (
                        <span className="text-xs text-gray-400 italic">{t.categories.system}</span>
                      )}
                    </div>
                    {!cat.isSystem && (
                      <button
                        onClick={() => api.deleteCategory(cat.id).then(loadAll)}
                        className="text-xs text-red-400 hover:text-red-600"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* ── Sender Rules ── */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-gray-900">{t.categories.rulesHeading}</h2>
                <button
                  onClick={() => setShowAddRule(!showAddRule)}
                  className="btn-secondary text-xs"
                >
                  {t.categories.newRule}
                </button>
              </div>

              {showAddRule && (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 mb-3 space-y-3">
                  <input
                    type="text"
                    placeholder={t.categories.senderPattern}
                    value={ruleForm.sender_pattern}
                    onChange={(e) => setRuleForm((f) => ({ ...f, sender_pattern: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                  />
                  <input
                    type="text"
                    placeholder={t.categories.subjectPattern}
                    value={ruleForm.subject_pattern}
                    onChange={(e) => setRuleForm((f) => ({ ...f, subject_pattern: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <select
                      value={ruleForm.action}
                      onChange={(e) => setRuleForm((f) => ({ ...f, action: e.target.value }))}
                      className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-brand-500 outline-none"
                    >
                      {(['spam', 'archive', 'categorize', 'mute', 'star'] as const).map((a) => (
                        <option key={a} value={a}>{actionLabel(a)}</option>
                      ))}
                    </select>
                    <select
                      value={ruleForm.category_slug}
                      onChange={(e) => setRuleForm((f) => ({ ...f, category_slug: e.target.value }))}
                      className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-brand-500 outline-none"
                    >
                      {categories.map((c) => (
                        <option key={c.slug} value={c.slug}>{c.icon} {c.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={handleAddRule}
                      className="btn-primary text-xs"
                      disabled={!ruleForm.sender_pattern}
                    >
                      {t.categories.add}
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {rules.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-dashed border-gray-300 text-center py-10 text-sm text-gray-400">
                    {t.categories.noRules}
                  </div>
                ) : (
                  rules.map((rule) => (
                    <div
                      key={rule.id}
                      className="bg-white rounded-2xl border border-gray-200 shadow-sm py-3 px-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 font-mono truncate">
                            {rule.senderPattern}
                            {rule.subjectPattern && (
                              <span className="text-gray-400 font-normal ml-2 text-xs">[{rule.subjectPattern}]</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ACTION_COLORS[rule.action] || 'bg-gray-100 text-gray-600'}`}>
                              {actionLabel(rule.action)}
                            </span>
                            {rule.category && (
                              <span className="text-xs text-gray-600">
                                → {rule.category.icon || '📁'} {rule.category.name}
                              </span>
                            )}
                            <span className="text-xs text-gray-400">{rule.timesApplied} {t.categories.timesApplied}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteRule(rule.id)}
                          className="text-xs text-red-400 hover:text-red-600 shrink-0"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
