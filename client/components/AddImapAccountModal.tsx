'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

// Common IMAP/SMTP presets for popular providers
const PRESETS: Record<string, { imap_host: string; imap_port: number; smtp_host: string; smtp_port: number }> = {
  custom: { imap_host: '', imap_port: 993, smtp_host: '', smtp_port: 465 },
  outlook: { imap_host: 'outlook.office365.com', imap_port: 993, smtp_host: 'smtp.office365.com', smtp_port: 587 },
  yahoo: { imap_host: 'imap.mail.yahoo.com', imap_port: 993, smtp_host: 'smtp.mail.yahoo.com', smtp_port: 465 },
  icloud: { imap_host: 'imap.mail.me.com', imap_port: 993, smtp_host: 'smtp.mail.me.com', smtp_port: 587 },
};

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddImapAccountModal({ onClose, onSuccess }: Props) {
  const [preset, setPreset] = useState('custom');
  const [form, setForm] = useState({
    email_address: '',
    display_name: '',
    label: '',
    color: '#6366F1',
    imap_host: '',
    imap_port: 993,
    smtp_host: '',
    smtp_port: 465,
    password: '',
  });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function handlePreset(key: string) {
    setPreset(key);
    const p = PRESETS[key];
    if (p) {
      setForm((f) => ({
        ...f,
        imap_host: p.imap_host,
        imap_port: p.imap_port,
        smtp_host: p.smtp_host,
        smtp_port: p.smtp_port,
      }));
    }
  }

  function updateField(field: string, value: string | number) {
    setForm((f) => ({ ...f, [field]: value }));
    setTestResult(null);
    setError('');
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.testImapConnection({
        email_address: form.email_address,
        imap_host: form.imap_host,
        imap_port: form.imap_port,
        smtp_host: form.smtp_host,
        smtp_port: form.smtp_port,
        password: form.password,
      });
      setTestResult(result);
    } catch (err: any) {
      setTestResult({ success: false, error: err.message });
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      await api.addImapAccount({
        email_address: form.email_address,
        display_name: form.display_name || undefined,
        label: form.label || undefined,
        color: form.color || undefined,
        imap_host: form.imap_host,
        imap_port: form.imap_port,
        smtp_host: form.smtp_host,
        smtp_port: form.smtp_port,
        password: form.password,
      });
      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const canTest = form.email_address && form.imap_host && form.smtp_host && form.password;
  const canSave = canTest && (testResult?.success || false);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Connect Email via IMAP</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Connect a custom domain or third-party email account.
          </p>
        </div>

        <div className="p-6 space-y-5">
          {/* Provider Preset */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email Provider</label>
            <div className="flex gap-2 flex-wrap">
              {[
                { key: 'custom', label: 'Custom' },
                { key: 'outlook', label: 'Outlook/365' },
                { key: 'yahoo', label: 'Yahoo' },
                { key: 'icloud', label: 'iCloud' },
              ].map((p) => (
                <button
                  key={p.key}
                  onClick={() => handlePreset(p.key)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    preset === p.key
                      ? 'bg-brand-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Email + Password */}
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
              <input
                type="email"
                value={form.email_address}
                onChange={(e) => updateField('email_address', e.target.value)}
                placeholder="you@yourdomain.com"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password / App Password</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => updateField('password', e.target.value)}
                placeholder="Use an app-specific password if 2FA is enabled"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              />
            </div>
          </div>

          {/* IMAP Settings */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">IMAP Server</label>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="text"
                value={form.imap_host}
                onChange={(e) => updateField('imap_host', e.target.value)}
                placeholder="imap.example.com"
                className="col-span-2 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              />
              <input
                type="number"
                value={form.imap_port}
                onChange={(e) => updateField('imap_port', parseInt(e.target.value) || 993)}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              />
            </div>
          </div>

          {/* SMTP Settings */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">SMTP Server</label>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="text"
                value={form.smtp_host}
                onChange={(e) => updateField('smtp_host', e.target.value)}
                placeholder="smtp.example.com"
                className="col-span-2 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              />
              <input
                type="number"
                value={form.smtp_port}
                onChange={(e) => updateField('smtp_port', parseInt(e.target.value) || 465)}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              />
            </div>
          </div>

          {/* Display Options */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
              <input
                type="text"
                value={form.display_name}
                onChange={(e) => updateField('display_name', e.target.value)}
                placeholder="Optional"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Label</label>
              <input
                type="text"
                value={form.label}
                onChange={(e) => updateField('label', e.target.value)}
                placeholder="e.g. Work, Personal"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Badge Color</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={form.color}
                onChange={(e) => updateField('color', e.target.value)}
                className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer"
              />
              <span className="text-sm text-gray-500">{form.color}</span>
            </div>
          </div>

          {/* Test Result */}
          {testResult && (
            <div className={`p-3 rounded-lg text-sm ${
              testResult.success
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {testResult.success
                ? 'Connection test successful! IMAP and SMTP are working.'
                : `Connection failed: ${testResult.error}`}
            </div>
          )}

          {error && (
            <div className="p-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">
              {error}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-6 border-t border-gray-100 flex items-center justify-between">
          <button
            onClick={handleTest}
            disabled={!canTest || testing}
            className="btn-secondary text-sm"
          >
            {testing ? 'Testing...' : 'Test Connection'}
          </button>

          <div className="flex gap-3">
            <button onClick={onClose} className="btn-secondary text-sm">Cancel</button>
            <button
              onClick={handleSave}
              disabled={!canSave || saving}
              className="btn-success text-sm"
            >
              {saving ? 'Connecting...' : 'Connect Account'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
