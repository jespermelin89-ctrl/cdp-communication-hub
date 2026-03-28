'use client';

import { useState, useEffect } from 'react';
import { Mail, Bot, Mic, Smartphone, Zap, ChevronRight } from 'lucide-react';

const STEPS = [
  {
    icon: <Zap size={32} className="text-brand-500" />,
    title: 'Välkommen till CDP Hub',
    body: 'Din AI-drivna kommunikationshjälp. Läs, analysera och svara på mail — utan att skicka utan ditt godkännande.',
  },
  {
    icon: <Mail size={32} className="text-indigo-500" />,
    title: 'Din inkorg',
    body: 'Mail triageras automatiskt: hög prioritet, medium och låg. AI klassificerar nytt mail och flaggar vad som behöver svar.',
  },
  {
    icon: <Bot size={32} className="text-emerald-500" />,
    title: 'Chatta med Amanda',
    body: 'Tryck på chat-bubblan nere till höger. Skriv "kolla mail", "klassificera" eller "brain status" — eller ställ en fri fråga.',
  },
  {
    icon: <Mic size={32} className="text-rose-500" />,
    title: 'Röststyrning',
    body: 'Tryck på mikrofon-knappen i chatten för att diktera dina kommandon. Funkar med Siri via iOS-genvägar.',
  },
  {
    icon: <Smartphone size={32} className="text-amber-500" />,
    title: 'Installera som app',
    body: 'Lägg till CDP Hub på hemskärmen för snabbare åtkomst. Safari → Dela → Lägg till på hemskärmen.',
  },
];

export default function OnboardingWizard() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('cdp_onboarded')) {
      setVisible(true);
    }
  }, []);

  function complete() {
    localStorage.setItem('cdp_onboarded', '1');
    setVisible(false);
  }

  function next() {
    if (step < STEPS.length - 1) setStep(step + 1);
    else complete();
  }

  if (!visible) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 bg-black/50 dark:bg-black/70 z-50 flex items-end sm:items-center justify-center px-4 pb-safe-bottom"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-sm overflow-hidden">
        {/* Step indicator */}
        <div className="flex gap-1 px-5 pt-5 pb-0">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-all ${i <= step ? 'bg-brand-500' : 'bg-gray-200 dark:bg-gray-700'}`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="p-6 text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-gray-50 dark:bg-gray-700 rounded-2xl flex items-center justify-center">
              {current.icon}
            </div>
          </div>
          <h2 id="onboarding-title" className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">{current.title}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{current.body}</p>
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 flex items-center justify-between gap-3">
          <button
            onClick={complete}
            className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            Hoppa över
          </button>
          <button
            onClick={next}
            className="flex items-center gap-1.5 px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            {isLast ? 'Kör igång!' : 'Nästa'}
            {!isLast && <ChevronRight size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}
