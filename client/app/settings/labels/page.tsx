'use client';

import { useState, useEffect } from 'react';
import TopBar from '@/components/TopBar';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { Tag, Plus, Trash2, Check, Edit2, X } from 'lucide-react';

const PRESET_COLORS = [
  '#3B82F6', '#EF4444', '#F59E0B', '#10B981', '#8B5CF6',
  '#EC4899', '#06B6D4', '#6B7280',
];

interface Label {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  position: number;
}

export default function LabelsSettingsPage() {
  const [labels, setLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#3B82F6');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  useEffect(() => {
    loadLabels();
  }, []);

  async function loadLabels() {
    try {
      const res = await api.getLabels();
      setLabels(res.labels);
    } catch {
      toast.error('Kunde inte ladda etiketter');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await api.createLabel({ name: newName.trim(), color: newColor });
      setLabels((prev) => [...prev, res.label]);
      setNewName('');
      setNewColor('#3B82F6');
      toast.success('Etikett skapad');
    } catch {
      toast.error('Kunde inte skapa etikett — namnet kanske redan finns');
    } finally {
      setCreating(false);
    }
  }

  async function handleSaveEdit(id: string) {
    try {
      const res = await api.updateLabel(id, { name: editName.trim(), color: editColor });
      setLabels((prev) => prev.map((l) => (l.id === id ? res.label : l)));
      setEditingId(null);
      toast.success('Etikett uppdaterad');
    } catch {
      toast.error('Kunde inte uppdatera etikett');
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.deleteLabel(id);
      setLabels((prev) => prev.filter((l) => l.id !== id));
      setDeleteConfirmId(null);
      toast.success('Etikett borttagen');
    } catch {
      toast.error('Kunde inte ta bort etikett');
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <TopBar />
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Tag size={24} className="text-violet-600 dark:text-violet-400" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Etiketter</h1>
        </div>

        {/* Create new label */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 mb-6 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Ny etikett</h2>
          <div className="flex gap-3 items-end flex-wrap">
            <div className="flex-1 min-w-[160px]">
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Namn</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
                placeholder="t.ex. Viktigt"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm outline-none focus:ring-2 focus:ring-violet-400"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Färg</label>
              <div className="flex gap-1.5 flex-wrap">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setNewColor(c)}
                    className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 flex items-center justify-center"
                    style={{ backgroundColor: c, borderColor: newColor === c ? '#1e40af' : 'transparent' }}
                  >
                    {newColor === c && <Check size={12} className="text-white" />}
                  </button>
                ))}
                <input
                  type="color"
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value)}
                  className="w-7 h-7 rounded-full cursor-pointer border-2 border-gray-200 dark:border-gray-600"
                  title="Anpassad färg"
                />
              </div>
            </div>
            <button
              onClick={handleCreate}
              disabled={!newName.trim() || creating}
              className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
            >
              <Plus size={14} />
              Skapa
            </button>
          </div>
        </div>

        {/* Labels list */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-400 text-sm">Laddar etiketter...</div>
          ) : labels.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">Inga etiketter ännu. Skapa en ovan.</div>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {labels.map((label) => (
                <li key={label.id} className="flex items-center gap-3 px-5 py-3">
                  {editingId === label.id ? (
                    <>
                      {/* Inline edit */}
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(label.id); if (e.key === 'Escape') setEditingId(null); }}
                        className="flex-1 px-3 py-1.5 rounded-lg border border-violet-300 dark:border-violet-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm outline-none focus:ring-2 focus:ring-violet-400"
                        autoFocus
                      />
                      <div className="flex gap-1">
                        {PRESET_COLORS.map((c) => (
                          <button
                            key={c}
                            onClick={() => setEditColor(c)}
                            className="w-5 h-5 rounded-full border-2"
                            style={{ backgroundColor: c, borderColor: editColor === c ? '#1e40af' : 'transparent' }}
                          />
                        ))}
                      </div>
                      <button onClick={() => handleSaveEdit(label.id)} className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20">
                        <Check size={14} />
                      </button>
                      <button onClick={() => setEditingId(null)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">
                        <X size={14} />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: label.color }} />
                      <span className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-200">{label.name}</span>
                      <button
                        onClick={() => { setEditingId(label.id); setEditName(label.name); setEditColor(label.color); }}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      >
                        <Edit2 size={13} />
                      </button>
                      {deleteConfirmId === label.id ? (
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-red-600 dark:text-red-400">Ta bort?</span>
                          <button onClick={() => handleDelete(label.id)} className="text-xs px-2 py-0.5 bg-red-600 text-white rounded-md hover:bg-red-700">Ja</button>
                          <button onClick={() => setDeleteConfirmId(null)} className="text-xs px-2 py-0.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">Nej</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirmId(label.id)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
