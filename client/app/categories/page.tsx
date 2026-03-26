'use client';

import { useEffect, useState } from 'react';
import TopBar from '@/components/TopBar';
import { api } from '@/lib/api';

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

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [rules, setRules] = useState<SenderRule[]>([]);
  const [loading, setLoading] = useState(true);

  // New rule form
  const [showAddRule, setShowAddRule] = useState(false);
  const [ruleForm, setRuleForm] = useState({
    sender_pattern: '',
    subject_pattern: '',
    action: 'spam',
    category_slug: 'spam',
  });

  // New category form
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
      setRuleForm({ sender_pattern: '', subject_pattern: '', action: 'spam', category_slug: 'spam' });
      await loadAll();
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleDeleteRule(id: string) {
    if (!confirm('Ta bort denna regel?')) return;
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
    try {
      const result = await api.classifyThreads();
      alert(`Klassificering klar: ${result.classified} av ${result.total} trådar matchade regler.`);
    } catch (err: any) {
      alert(err.message);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <TopBar />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Kategorier & Regler</h1>
          <button onClick={handleClassify} className="btn-primary text-sm">
            Kör Klassificering
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-500">Laddar...</div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Categories */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-gray-900">Kategorier</h2>
                <button onClick={() => setShowAddCategory(!showAddCategory)} className="btn-secondary text-xs">
                  + Ny Kategori
                </button>
              </div>

              {showAddCategory && (
                <div className="card mb-3 space-y-3">
                  <input
                    type="text"
                    placeholder="Namn"
                    value={catForm.name}
                    onChange={(e) => setCatForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="text"
                      placeholder="Emoji"
                      value={catForm.icon}
                      onChange={(e) => setCatForm((f) => ({ ...f, icon: e.target.value }))}
                      className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    />
                    <input
                      type="color"
                      value={catForm.color}
                      onChange={(e) => setCatForm((f) => ({ ...f, color: e.target.value }))}
                      className="h-[38px] rounded-lg border border-gray-200 cursor-pointer"
                    />
                    <button onClick={handleAddCategory} className="btn-primary text-xs" disabled={!catForm.name}>
                      Skapa
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {categories.map((cat) => (
                  <div key={cat.id} className="card py-3 px-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: cat.color || '#9CA3AF' }}
                      />
                      <span className="text-sm">{cat.icon}</span>
                      <span className="text-sm font-medium text-gray-900">{cat.name}</span>
                      {cat._count?.rules ? (
                        <span className="text-xs text-gray-400">{cat._count.rules} regler</span>
                      ) : null}
                    </div>
                    {!cat.isSystem && (
                      <button
                        onClick={() => api.deleteCategory(cat.id).then(loadAll)}
                        className="text-xs text-red-400 hover:text-red-600"
                      >
                        Ta bort
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Sender Rules */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-gray-900">Avsändarregler</h2>
                <button onClick={() => setShowAddRule(!showAddRule)} className="btn-secondary text-xs">
                  + Ny Regel
                </button>
              </div>

              {showAddRule && (
                <div className="card mb-3 space-y-3">
                  <input
                    type="text"
                    placeholder="Avsändarmönster (t.ex. noreply@skool.com eller *@github.com)"
                    value={ruleForm.sender_pattern}
                    onChange={(e) => setRuleForm((f) => ({ ...f, sender_pattern: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Ämnesmönster (regex, valfritt)"
                    value={ruleForm.subject_pattern}
                    onChange={(e) => setRuleForm((f) => ({ ...f, subject_pattern: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <select
                      value={ruleForm.action}
                      onChange={(e) => setRuleForm((f) => ({ ...f, action: e.target.value }))}
                      className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                    >
                      <option value="spam">Skräp</option>
                      <option value="archive">Arkivera</option>
                      <option value="categorize">Kategorisera</option>
                      <option value="mute">Tysta</option>
                      <option value="star">Stjärnmärk</option>
                    </select>
                    <select
                      value={ruleForm.category_slug}
                      onChange={(e) => setRuleForm((f) => ({ ...f, category_slug: e.target.value }))}
                      className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                    >
                      {categories.map((c) => (
                        <option key={c.slug} value={c.slug}>{c.icon} {c.name}</option>
                      ))}
                    </select>
                    <button onClick={handleAddRule} className="btn-primary text-xs" disabled={!ruleForm.sender_pattern}>
                      Lägg till
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {rules.length === 0 ? (
                  <div className="card text-center py-6 text-sm text-gray-500">
                    Inga regler ännu. Lägg till en ovan eller skriv "markera X som skräp" i chatten.
                  </div>
                ) : (
                  rules.map((rule) => (
                    <div key={rule.id} className="card py-3 px-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium text-gray-900 font-mono">
                            {rule.senderPattern}
                            {rule.subjectPattern && (
                              <span className="text-gray-400 font-normal ml-2">[{rule.subjectPattern}]</span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            {rule.category ? `${rule.category.icon || '📁'} ${rule.category.name}` : rule.action}
                            <span className="text-gray-400 ml-2">Använd {rule.timesApplied}x</span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteRule(rule.id)}
                          className="text-xs text-red-400 hover:text-red-600"
                        >
                          Ta bort
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
