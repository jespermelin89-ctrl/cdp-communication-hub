'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import TopBar from '@/components/TopBar';
import {
  Smartphone,
  Mic,
  ArrowLeft,
  ExternalLink,
  CheckCircle,
  Check,
  Copy,
  QrCode,
  Zap,
} from 'lucide-react';

const BASE_URL = 'https://cdp-communication-hub.vercel.app';

const shortcuts = [
  {
    name: 'Kolla mail',
    trigger: 'Hej Siri, kolla mail',
    url: `${BASE_URL}/?cmd=briefing`,
    description: 'Öppnar CDP och visar din mail-briefing automatiskt.',
    emoji: '📬',
    color: 'brand',
  },
  {
    name: 'Röstmeddelande till CDP',
    trigger: 'Hej Siri, nytt mail-kommando',
    url: `${BASE_URL}/?voice=1`,
    description: 'Öppnar CDP och startar mikrofonen direkt — tala ditt kommando.',
    emoji: '🎙️',
    color: 'purple',
  },
  {
    name: 'Svara på mail',
    trigger: 'Hej Siri, svara på mail',
    url: `${BASE_URL}/?cmd=reply`,
    description: 'Visar trådar som väntar på svar.',
    emoji: '↩️',
    color: 'amber',
  },
  {
    name: 'Skriv nytt mail',
    trigger: 'Hej Siri, skriv nytt mail',
    url: `${BASE_URL}/?cmd=compose`,
    description: 'Öppnar chat-widgeten redo för att komponera ett nytt mail.',
    emoji: '✏️',
    color: 'green',
  },
];

// Step screenshots: mock iPhone UI as SVG placeholders
const stepScreenshots: Array<{ label: string; mockContent: string }> = [
  { label: 'Steg 1–2', mockContent: 'shortcuts-list' },
  { label: 'Steg 3', mockContent: 'add-action' },
  { label: 'Steg 4–5', mockContent: 'open-url' },
  { label: 'Steg 6', mockContent: 'siri-record' },
];

function PhoneMockup({ type }: { type: string }) {
  const screens: Record<string, React.ReactNode> = {
    'shortcuts-list': (
      <svg viewBox="0 0 160 280" className="w-full h-full">
        <rect width="160" height="280" rx="16" fill="#1C1C1E" />
        <rect x="8" y="8" width="144" height="264" rx="12" fill="#F2F2F7" />
        {/* Status bar */}
        <rect x="12" y="14" width="60" height="8" rx="4" fill="#8E8E93" opacity="0.4" />
        <rect x="120" y="14" width="28" height="8" rx="4" fill="#8E8E93" opacity="0.4" />
        {/* Title */}
        <text x="80" y="42" textAnchor="middle" fontSize="11" fontWeight="700" fill="#1C1C1E">Genvägar</text>
        {/* Plus button */}
        <circle cx="144" cy="38" r="10" fill="#007AFF" />
        <text x="144" y="42" textAnchor="middle" fontSize="14" fill="white" fontWeight="300">+</text>
        {/* List items */}
        {[0,1,2].map(i => (
          <g key={i}>
            <rect x="12" y={58 + i * 52} width="136" height="44" rx="10" fill="white" />
            <rect x="20" y={68 + i * 52} width="24" height="24" rx="6" fill={['#007AFF','#FF2D55','#34C759'][i]} />
            <rect x="52" y={72 + i * 52} width="70" height="8" rx="4" fill="#1C1C1E" />
            <rect x="52" y={84 + i * 52} width="50" height="6" rx="3" fill="#8E8E93" opacity="0.6" />
          </g>
        ))}
      </svg>
    ),
    'add-action': (
      <svg viewBox="0 0 160 280" className="w-full h-full">
        <rect width="160" height="280" rx="16" fill="#1C1C1E" />
        <rect x="8" y="8" width="144" height="264" rx="12" fill="#F2F2F7" />
        <text x="80" y="42" textAnchor="middle" fontSize="11" fontWeight="700" fill="#1C1C1E">Ny genväg</text>
        {/* Search bar */}
        <rect x="12" y="52" width="136" height="28" rx="10" fill="white" />
        <rect x="24" y="62" width="80" height="8" rx="4" fill="#C7C7CC" />
        <text x="24" y="90" fontSize="9" fill="#8E8E93">Sök åtgärder</text>
        {/* Action items */}
        {['Öppna URL','Skicka meddelande','Få URL-innehåll'].map((label, i) => (
          <g key={i}>
            <rect x="12" y={100 + i * 44} width="136" height="36" rx="10" fill="white" />
            <rect x="20" y={110 + i * 44} width="20" height="16" rx="4" fill="#007AFF" />
            <text x="48" y={122 + i * 44} fontSize="9" fill="#1C1C1E" fontWeight="600">{label}</text>
          </g>
        ))}
        {/* Highlight first item */}
        <rect x="12" y="100" width="136" height="36" rx="10" fill="#007AFF" opacity="0.15" />
      </svg>
    ),
    'open-url': (
      <svg viewBox="0 0 160 280" className="w-full h-full">
        <rect width="160" height="280" rx="16" fill="#1C1C1E" />
        <rect x="8" y="8" width="144" height="264" rx="12" fill="#F2F2F7" />
        <text x="80" y="42" textAnchor="middle" fontSize="11" fontWeight="700" fill="#1C1C1E">Öppna URL</text>
        {/* URL field */}
        <rect x="12" y="56" width="136" height="48" rx="10" fill="white" />
        <text x="20" y="74" fontSize="8" fill="#8E8E93">URL</text>
        <rect x="20" y="80" width="120" height="8" rx="4" fill="#007AFF" opacity="0.8" />
        <text x="20" y="96" fontSize="7" fill="#8E8E93">cdp-communication-hub.vercel.app</text>
        {/* Three dots button */}
        <rect x="118" y="14" width="28" height="20" rx="8" fill="#E5E5EA" />
        <circle cx="126" cy="24" r="2" fill="#8E8E93" />
        <circle cx="132" cy="24" r="2" fill="#8E8E93" />
        <circle cx="138" cy="24" r="2" fill="#8E8E93" />
        {/* Add to Siri button */}
        <rect x="12" y="180" width="136" height="36" rx="18" fill="#1C1C1E" />
        <text x="80" y="203" textAnchor="middle" fontSize="10" fill="white" fontWeight="600">Lägg till Siri</text>
      </svg>
    ),
    'siri-record': (
      <svg viewBox="0 0 160 280" className="w-full h-full">
        <rect width="160" height="280" rx="16" fill="#1C1C1E" />
        <rect x="8" y="8" width="144" height="264" rx="12" fill="#1C1C1E" />
        {/* Siri waveform */}
        <circle cx="80" cy="120" r="50" fill="none" stroke="#007AFF" strokeWidth="1.5" opacity="0.3" />
        <circle cx="80" cy="120" r="38" fill="none" stroke="#007AFF" strokeWidth="1.5" opacity="0.5" />
        <circle cx="80" cy="120" r="26" fill="#007AFF" opacity="0.8" />
        <text x="80" y="127" textAnchor="middle" fontSize="20">🎙️</text>
        {/* Waveform bars */}
        {[0,1,2,3,4,5,6].map(i => {
          const h = [12,20,30,16,28,18,10][i];
          return <rect key={i} x={44 + i * 12} y={170 - h/2} width="6" height={h} rx="3" fill="#007AFF" opacity={0.7} />;
        })}
        <text x="80" y="210" textAnchor="middle" fontSize="10" fill="white" opacity="0.8">Spela in "Kolla mail"</text>
        {/* Done button */}
        <rect x="40" y="230" width="80" height="28" rx="14" fill="#007AFF" />
        <text x="80" y="249" textAnchor="middle" fontSize="10" fill="white" fontWeight="600">Klar</text>
      </svg>
    ),
  };
  return screens[type] ?? null;
}

export default function SetupSiriPage() {
  const [copied, setCopied] = useState<string | null>(null);
  const [showQr, setShowQr] = useState<string | null>(null);

  function copyUrl(url: string, key: string) {
    navigator.clipboard?.writeText(url).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  const pwaQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=8&color=4F46E5&data=${encodeURIComponent(BASE_URL)}`;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <TopBar />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {/* Back nav */}
        <div className="flex items-center gap-3 mb-6">
          <Link
            href="/settings"
            className="text-sm text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1"
          >
            <ArrowLeft size={14} />
            Inställningar
          </Link>
        </div>

        {/* Page title */}
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-brand-500 rounded-xl flex items-center justify-center">
            <Mic size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Apple Shortcuts / Siri
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Styr CDP med rösten via Siri på iPhone och iPad
            </p>
          </div>
        </div>

        {/* PWA install card with QR code */}
        <div className="mt-6 mb-8 p-5 bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800 rounded-2xl">
          <div className="flex gap-4 items-start">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Zap size={15} className="text-brand-600 dark:text-brand-400" />
                <span className="font-semibold text-brand-700 dark:text-brand-300 text-sm">Installera CDP som app (PWA) först</span>
              </div>
              <p className="text-sm text-brand-700 dark:text-brand-300 mb-3">
                Öppna länken i Safari på iPhone → tryck <strong>Dela</strong> → <strong>Lägg till på hemskärmen</strong>.
                Då öppnar Siri-genvägar appen direkt istället för i Safari.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-white/70 dark:bg-brand-900/40 border border-brand-200 dark:border-brand-700 rounded-lg px-3 py-2 text-brand-700 dark:text-brand-300 font-mono break-all">
                  {BASE_URL}
                </code>
                <button
                  onClick={() => copyUrl(BASE_URL, 'pwa')}
                  className="shrink-0 p-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg transition-colors"
                  title="Kopiera länk"
                >
                  {copied === 'pwa' ? <Check size={14} /> : <Copy size={14} />}
                </button>
                <button
                  onClick={() => setShowQr(showQr === 'pwa' ? null : 'pwa')}
                  className={`shrink-0 p-2 rounded-lg transition-colors ${showQr === 'pwa' ? 'bg-brand-500 text-white' : 'bg-white dark:bg-brand-900/40 text-brand-600 hover:bg-brand-100 dark:hover:bg-brand-900/60 border border-brand-200 dark:border-brand-700'}`}
                  title="Visa QR-kod"
                >
                  <QrCode size={14} />
                </button>
              </div>
            </div>
          </div>

          {showQr === 'pwa' && (
            <div className="mt-4 flex flex-col items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={pwaQrUrl}
                alt="QR-kod för CDP PWA"
                width={160}
                height={160}
                className="rounded-xl border-4 border-white shadow-md"
              />
              <p className="text-xs text-brand-600 dark:text-brand-400">
                Skanna med iPhone-kameran för att öppna CDP i Safari
              </p>
            </div>
          )}
        </div>

        {/* Step-by-step guide */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-5 flex items-center gap-2">
            <Smartphone size={18} />
            Steg-för-steg: Skapa en Siri-genväg
          </h2>

          <div className="grid sm:grid-cols-2 gap-6">
            {/* Steps list */}
            <ol className="space-y-4">
              {[
                { title: 'Öppna Genvägar', body: 'Öppna appen Genvägar på iPhone eller iPad.' },
                { title: 'Skapa ny genväg', body: 'Tryck på "+" (plus) längst upp till höger.' },
                { title: 'Lägg till åtgärd', body: 'Tryck "Lägg till åtgärd" → sök efter "Öppna URL" och välj den.' },
                { title: 'Klistra in URL', body: 'Klistra in URL:en från en av genvägsrutorna nedan.' },
                { title: 'Lägg till Siri', body: 'Tryck "…" (tre punkter) uppe till höger → ge genvägen ett namn → "Lägg till till Siri".' },
                { title: 'Spela in frasen', body: 'Spela in triggerfrasen, t.ex. "Kolla mail", och tryck Klar.' },
              ].map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="shrink-0 w-7 h-7 rounded-full bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400 flex items-center justify-center font-bold text-xs mt-0.5">
                    {i + 1}
                  </span>
                  <div>
                    <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">{step.title}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">{step.body}</div>
                  </div>
                </li>
              ))}
            </ol>

            {/* Step screenshots — 4 phone mockups in 2×2 grid */}
            <div className="grid grid-cols-2 gap-3">
              {stepScreenshots.map((s) => (
                <div key={s.label} className="flex flex-col items-center gap-1.5">
                  <div className="w-full max-w-[100px] mx-auto drop-shadow-lg">
                    <PhoneMockup type={s.mockContent} />
                  </div>
                  <span className="text-xs text-gray-400 dark:text-gray-500">{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Shortcut cards */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <CheckCircle size={18} />
            Färdiga genvägar — kopiera URL:en
          </h2>
          <div className="space-y-4">
            {shortcuts.map((s) => {
              const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=6&data=${encodeURIComponent(s.url)}`;
              const cardKey = s.name;
              return (
                <div
                  key={s.name}
                  className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4"
                >
                  <div className="flex items-start gap-3 mb-3">
                    <span className="text-2xl">{s.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900 dark:text-gray-100">{s.name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        Siri-fras: <span className="font-medium text-gray-700 dark:text-gray-300">"{s.trigger}"</span>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{s.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-gray-700 dark:text-gray-300 break-all font-mono">
                      {s.url}
                    </code>
                    <button
                      onClick={() => copyUrl(s.url, cardKey)}
                      title="Kopiera URL"
                      className={`shrink-0 flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg transition-all font-medium ${
                        copied === cardKey
                          ? 'bg-green-500 text-white'
                          : 'bg-brand-500 hover:bg-brand-600 text-white'
                      }`}
                    >
                      {copied === cardKey ? (
                        <><Check size={13} /> Kopierat</>
                      ) : (
                        <><Copy size={13} /> Kopiera</>
                      )}
                    </button>
                    <button
                      onClick={() => setShowQr(showQr === cardKey ? null : cardKey)}
                      title="Visa QR-kod"
                      className={`shrink-0 p-2 rounded-lg transition-colors border text-sm ${
                        showQr === cardKey
                          ? 'bg-brand-500 text-white border-brand-500'
                          : 'bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-600 hover:border-brand-300'
                      }`}
                    >
                      <QrCode size={14} />
                    </button>
                  </div>

                  {showQr === cardKey && (
                    <div className="mt-3 flex flex-col items-center gap-2 py-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={qrUrl}
                        alt={`QR-kod för ${s.name}`}
                        width={140}
                        height={140}
                        className="rounded-xl border-4 border-white shadow-md"
                      />
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        Skanna för att testa genvägen direkt på iPhone
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Web Speech API notice */}
        <section className="mt-8 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl text-sm text-amber-700 dark:text-amber-300">
          <strong>Obs:</strong> Röstinput i chat-widgeten använder Web Speech API (stöds i Safari på iOS 14.5+ och Chrome).
          Kräver HTTPS — Vercel-deployments ger detta automatiskt.{' '}
          <a
            href="https://caniuse.com/speech-recognition"
            target="_blank"
            rel="noopener noreferrer"
            className="underline inline-flex items-center gap-1"
          >
            Browserkompatibilitet <ExternalLink size={12} />
          </a>
        </section>
      </main>
    </div>
  );
}
