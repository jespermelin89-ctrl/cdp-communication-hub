'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

// IMAP/SMTP presets for auto-detection
const PROVIDER_PRESETS: Record<string, { imap_host: string; imap_port: number; imap_use_ssl: boolean; smtp_host: string; smtp_port: number; smtp_use_ssl: boolean }> = {
  google: { imap_host: 'imap.gmail.com', imap_port: 993, imap_use_ssl: true, smtp_host: 'smtp.gmail.com', smtp_port: 587, smtp_use_ssl: true },
  microsoft: { imap_host: 'outlook.office365.com', imap_port: 993, imap_use_ssl: true, smtp_host: 'smtp.office365.com', smtp_port: 587, smtp_use_ssl: true },
  yahoo: { imap_host: 'imap.mail.yahoo.com', imap_port: 993, imap_use_ssl: true, smtp_host: 'smtp.mail.yahoo.com', smtp_port: 465, smtp_use_ssl: true },
  icloud: { imap_host: 'imap.mail.me.com', imap_port: 993, imap_use_ssl: true, smtp_host: 'smtp.mail.me.com', smtp_port: 587, smtp_use_ssl: true },
};

interface ProviderInfo {
  id: string;
  name: string;
  type: string;
  icon: string;
  authMethod: string;
  domains: string[];
  imapDefaults?: { host: string; port: number; secure: boolean };
  smtpDefaults?: { host: string; port: number; secure: boolean };
}

interface DetectedProvider {
  provider: ProviderInfo;
  authUrl?: string;
  requiresImap?: boolean;
}

interface AddEmailAccountProps {
  onSuccess?: () => void;
  onCancel?: () => void;
  defaultEmail?: string;
}

type Step = 'email' | 'provider' | 'imap' | 'oauth-redirect';

export default function AddEmailAccount({ onSuccess, onCancel, defaultEmail = '' }: AddEmailAccountProps) {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState(defaultEmail);
  const [detectedProvider, setDetectedProvider] = useState<DetectedProvider | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [wakingBackend, setWakingBackend] = useState(false);

  const [imapForm, setImapForm] = useState({
    email_address: email,
    display_name: '',
    label: '',
    color: '#6366F1',
    imap_host: '',
    imap_port: 993,
    imap_use_ssl: true,
    smtp_host: '',
    smtp_port: 587,
    smtp_use_ssl: true,
    password: '',
  });

  // Step 1: Submit email
  async function handleEmailSubmit() {
    if (!email || !email.includes('@')) {
      setError('Ange en giltig e-postadress');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await api.detectProvider(email);
      setDetectedProvider(result);
      setImapForm((f) => ({ ...f, email_address: email }));
      setStep('provider');
    } catch (err: any) {
      setError(err.message || 'Kunde inte identifiera e-postleverantör');
    } finally {
      setLoading(false);
    }
  }

  // Step 2: Handle OAuth redirect (Google)
  async function handleOAuthGoogle() {
    setWakingBackend(true);
    setError('');
    try {
      // Wake up the backend before initiating OAuth
      const backendReady = await api.wakeBackend();
      if (!backendReady) {
        setError('Servern svarar inte. Försök igen om en stund.');
        setWakingBackend(false);
        return;
      }

      // Use the authUrl from detectProvider if available, otherwise fetch fresh
      if (detectedProvider?.authUrl) {
        window.location.href = detectedProvider.authUrl;
      } else {
        const result = await api.detectProvider(email);
        if (result?.authUrl) {
          window.location.href = result.authUrl;
        } else {
          throw new Error('Kunde inte hämta OAuth-URL');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Kunde inte starta Google-autentisering');
      setWakingBackend(false);
    }
  }

  // Step 3: Test IMAP connection
  async function handleTestConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.testImapConnection({
        email_address: imapForm.email_address,
        imap_host: imapForm.imap_host,
        imap_port: imapForm.imap_port,
        imap_use_ssl: imapForm.imap_use_ssl,
        smtp_host: imapForm.smtp_host,
        smtp_port: imapForm.smtp_port,
        smtp_use_ssl: imapForm.smtp_use_ssl,
        password: imapForm.password,
      });
      setTestResult(result);
    } catch (err: any) {
      setTestResult({ success: false, error: err.message });
    } finally {
      setTesting(false);
    }
  }

  // Step 3: Save IMAP account
  async function handleSaveImap() {
    setSaving(true);
    setError('');
    try {
      await api.addImapAccount({
        email_address: imapForm.email_address,
        display_name: imapForm.display_name || undefined,
        label: imapForm.label || undefined,
        color: imapForm.color || undefined,
        imap_host: imapForm.imap_host,
        imap_port: imapForm.imap_port,
        imap_use_ssl: imapForm.imap_use_ssl,
        smtp_host: imapForm.smtp_host,
        smtp_port: imapForm.smtp_port,
        smtp_use_ssl: imapForm.smtp_use_ssl,
        password: imapForm.password,
      });
      onSuccess?.();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // Helper to update IMAP form field
  function updateImapField(field: string, value: any) {
    setImapForm((f) => ({ ...f, [field]: value }));
    setTestResult(null);
  }

  // Helper to switch to manual IMAP mode with presets
  function switchToManualImap() {
    // Use API-returned defaults first, fall back to local presets
    const apiImap = detectedProvider?.provider?.imapDefaults;
    const apiSmtp = detectedProvider?.provider?.smtpDefaults;
    const providerKey = detectedProvider?.provider?.id?.toLowerCase() || 'custom';
    const preset = PROVIDER_PRESETS[providerKey];
    setImapForm((f) => ({
      ...f,
      imap_host: apiImap?.host || preset?.imap_host || '',
      imap_port: apiImap?.port || preset?.imap_port || 993,
      imap_use_ssl: apiImap?.secure ?? preset?.imap_use_ssl ?? true,
      smtp_host: apiSmtp?.host || preset?.smtp_host || '',
      smtp_port: apiSmtp?.port || preset?.smtp_port || 587,
      smtp_use_ssl: preset.smtp_use_ssl,
    }));
    setStep('imap');
  }

  // ============================================================
  // Step 1: Email Input
  // ============================================================
  if (step === 'email') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="card max-w-md w-full">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Anslut din e-post</h1>
            <p className="text-gray-600">
              Skriv in din e-postadress så hittar vi rätt anslutningsmetod
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError('');
                }}
                onKeyPress={(e) => e.key === 'Enter' && handleEmailSubmit()}
                placeholder="namn@example.com"
                className="w-full px-4 py-3 border border-gray-200 rounded-lg text-base focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              />
            </div>

            {error && (
              <div className="p-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">
                {error}
              </div>
            )}

            <button
              onClick={handleEmailSubmit}
              disabled={loading || !email}
              className="btn-primary w-full text-base py-3 font-medium"
            >
              {loading ? 'Söker...' : 'Fortsätt'}
            </button>
          </div>

          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-xs text-gray-500 text-center">
              Stöder Gmail, Outlook, Yahoo, iCloud och IMAP
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // Step 2: Provider Detected
  // ============================================================
  if (step === 'provider' && detectedProvider) {
    const providerId = detectedProvider.provider?.id?.toLowerCase() || '';
    const providerType = detectedProvider.provider?.type?.toLowerCase() || '';
    const isGoogle = providerId === 'google' || providerType === 'google';
    const isMicrosoft = providerId === 'microsoft' || providerType === 'microsoft';
    const hasOAuth = detectedProvider.authUrl || isGoogle;

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="card max-w-md w-full">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">E-postleverantör identifierad</h1>
            <p className="text-gray-600 text-sm">
              Vi identifierade <strong>{email}</strong>
            </p>
          </div>

          <div className="space-y-4">
            {/* OAuth Google */}
            {isGoogle && (
              <>
                <button
                  onClick={handleOAuthGoogle}
                  disabled={wakingBackend}
                  className="w-full px-4 py-3 bg-white border-2 border-gray-200 text-gray-900 rounded-lg font-medium hover:border-gray-300 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  {wakingBackend ? 'Förbereder anslutning...' : 'Anslut med Google'}
                </button>
                <div className="text-center text-sm text-gray-500">eller</div>
              </>
            )}

            {/* OAuth Microsoft - disabled */}
            {isMicrosoft && (
              <>
                <div className="relative">
                  <button
                    disabled
                    className="w-full px-4 py-3 bg-gray-100 text-gray-400 rounded-lg font-medium cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zm12.6 0H12.6V0H24v11.4z" fill="#00A4EF"/>
                    </svg>
                    Anslut med Microsoft
                  </button>
                  <div className="absolute top-2 right-2 bg-amber-100 text-amber-700 text-xs px-2 py-1 rounded">
                    Kommer snart
                  </div>
                </div>
                <div className="text-center text-sm text-gray-500">eller</div>
              </>
            )}

            {/* Manual IMAP Fallback */}
            <button
              onClick={switchToManualImap}
              className="w-full px-4 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
            >
              Anslut manuellt (IMAP)
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // Step 3: IMAP Form
  // ============================================================
  if (step === 'imap') {
    const canTest = imapForm.email_address && imapForm.imap_host && imapForm.smtp_host && imapForm.password;
    const canSave = canTest && (testResult?.success || false);

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="card max-w-lg w-full max-h-[90vh] overflow-y-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">IMAP/SMTP Inställningar</h1>
            <p className="text-sm text-gray-600">
              Konfigurera e-postservern för <strong>{imapForm.email_address}</strong>
            </p>
          </div>

          <div className="space-y-5">
            {/* Email Address (read-only) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">E-postadress</label>
              <input
                type="email"
                value={imapForm.email_address}
                disabled
                className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-600 text-sm"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lösenord</label>
              <input
                type="password"
                value={imapForm.password}
                onChange={(e) => updateImapField('password', e.target.value)}
                placeholder="Använd appspecifikt lösenord om 2FA är aktiverat"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              />
            </div>

            {/* IMAP Server */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">IMAP Server</label>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  value={imapForm.imap_host}
                  onChange={(e) => updateImapField('imap_host', e.target.value)}
                  placeholder="imap.example.com"
                  className="col-span-2 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                />
                <input
                  type="number"
                  value={imapForm.imap_port}
                  onChange={(e) => updateImapField('imap_port', parseInt(e.target.value) || 993)}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                />
              </div>
              <label className="flex items-center gap-2 mt-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={imapForm.imap_use_ssl}
                  onChange={(e) => updateImapField('imap_use_ssl', e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="text-sm text-gray-600">Använd SSL/TLS</span>
              </label>
            </div>

            {/* SMTP Server */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">SMTP Server</label>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  value={imapForm.smtp_host}
                  onChange={(e) => updateImapField('smtp_host', e.target.value)}
                  placeholder="smtp.example.com"
                  className="col-span-2 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                />
                <input
                  type="number"
                  value={imapForm.smtp_port}
                  onChange={(e) => updateImapField('smtp_port', parseInt(e.target.value) || 587)}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                />
              </div>
              <label className="flex items-center gap-2 mt-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={imapForm.smtp_use_ssl}
                  onChange={(e) => updateImapField('smtp_use_ssl', e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="text-sm text-gray-600">Använd SSL/TLS</span>
              </label>
            </div>

            {/* Display Options */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Visningsnamn</label>
                <input
                  type="text"
                  value={imapForm.display_name}
                  onChange={(e) => updateImapField('display_name', e.target.value)}
                  placeholder="Valfritt"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Etikett</label>
                <input
                  type="text"
                  value={imapForm.label}
                  onChange={(e) => updateImapField('label', e.target.value)}
                  placeholder="t.ex. Arbete"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Färg för märke</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={imapForm.color}
                  onChange={(e) => updateImapField('color', e.target.value)}
                  className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer"
                />
                <span className="text-sm text-gray-500">{imapForm.color}</span>
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
                  ? '✓ Anslutningstest lyckades! IMAP och SMTP fungerar.'
                  : `✗ Anslutning misslyckades: ${testResult.error}`}
              </div>
            )}

            {error && (
              <div className="p-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">
                {error}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="mt-6 flex items-center justify-between gap-3">
            <button
              onClick={handleTestConnection}
              disabled={!canTest || testing}
              className="btn-secondary text-sm"
            >
              {testing ? 'Testar...' : 'Testa anslutning'}
            </button>

            <div className="flex gap-3">
              <button
                onClick={() => setStep('provider')}
                className="btn-secondary text-sm"
              >
                Tillbaka
              </button>
              <button
                onClick={handleSaveImap}
                disabled={!canSave || saving}
                className="btn-success text-sm"
              >
                {saving ? 'Ansluter...' : 'Spara & anslut'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
