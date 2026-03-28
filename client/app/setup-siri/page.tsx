'use client';

import Link from 'next/link';
import TopBar from '@/components/TopBar';
import { Smartphone, Mic, ArrowLeft, ExternalLink, CheckCircle } from 'lucide-react';

const BASE_URL = 'https://cdp-communication-hub.vercel.app';

const shortcuts = [
  {
    name: 'Kolla mail',
    trigger: 'Hej Siri, kolla mail',
    url: `${BASE_URL}/?cmd=briefing`,
    description: 'Öppnar CDP och visar din mail-briefing automatiskt.',
  },
  {
    name: 'Röstmeddelande till CDP',
    trigger: 'Hej Siri, nytt mail-kommando',
    url: `${BASE_URL}/?voice=1`,
    description: 'Öppnar CDP och startar mikrofonen direkt — tala ditt kommando.',
  },
  {
    name: 'Svara på mail',
    trigger: 'Hej Siri, svara på mail',
    url: `${BASE_URL}/?cmd=reply`,
    description: 'Visar trådar som väntar på svar.',
  },
  {
    name: 'Skriv nytt mail',
    trigger: 'Hej Siri, skriv nytt mail',
    url: `${BASE_URL}/?cmd=compose`,
    description: 'Öppnar chat-widgeten redo för att komponera ett nytt mail.',
  },
];

const steps = [
  'Öppna appen Genvägar på iPhone/iPad.',
  'Tryck på "+" (plus) längst upp till höger för att skapa en ny genväg.',
  'Tryck "Lägg till åtgärd" → sök efter "Öppna URL".',
  'Klistra in URL:en från kolumnen nedan.',
  'Tryck på knappen "…" (tre punkter) uppe till höger → ange ett namn och tryck "Lägg till till Siri".',
  'Spela in triggerfrasen (t.ex. "Kolla mail") och spara.',
];

export default function SetupSiriPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <TopBar />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link
            href="/settings"
            className="text-sm text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1"
          >
            <ArrowLeft size={14} />
            Inställningar
          </Link>
        </div>

        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-brand-500 rounded-xl flex items-center justify-center">
            <Mic size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Apple Shortcuts / Siri
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Styr CDP med rösten via Siri
            </p>
          </div>
        </div>

        {/* PWA tip */}
        <div className="mt-4 mb-8 p-4 bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800 rounded-2xl text-sm text-brand-700 dark:text-brand-300">
          <strong>Tips:</strong> Installera CDP som PWA (Dela → Lägg till på hemskärmen) för bästa upplevelse.
          Genvägar öppnar då appen direkt istället för i Safari.
        </div>

        {/* Step-by-step */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <Smartphone size={18} />
            Så här sätter du upp en genväg
          </h2>
          <ol className="space-y-2">
            {steps.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm text-gray-700 dark:text-gray-300">
                <span className="shrink-0 w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400 flex items-center justify-center font-semibold text-xs">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* Shortcut cards */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <CheckCircle size={18} />
            Färdiga genvägar
          </h2>
          <div className="space-y-4">
            {shortcuts.map((s) => (
              <div
                key={s.name}
                className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900 dark:text-gray-100 mb-0.5">
                      {s.name}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                      Siri-fras: <span className="font-medium text-gray-700 dark:text-gray-300">"{s.trigger}"</span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">{s.description}</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-gray-700 dark:text-gray-300 break-all font-mono">
                        {s.url}
                      </code>
                      <button
                        onClick={() => navigator.clipboard?.writeText(s.url)}
                        className="shrink-0 text-xs px-3 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg transition-colors font-medium"
                      >
                        Kopiera
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Web Speech API notice */}
        <section className="mt-8 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl text-sm text-amber-700 dark:text-amber-300">
          <strong>Obs:</strong> Röstinput använder Web Speech API (stöds i Safari på iOS 14+ och Chrome).
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
