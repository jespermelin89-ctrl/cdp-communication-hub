# Claude Code — SPRINT: VOICE INPUT + LEARNING SYSTEM + EMAIL WORKFLOW

## STATUS (2026-03-28)

### FUNKAR LIVE
- Dashboard, 3 konton (102+ trådar), AI-sammanfattning, daglig sammanfattning
- Fallback-kedjan Groq → Anthropic → OpenAI bekräftad
- Content truncation redan implementerad i ai.service.ts
- Agent API `/api/v1/agent/execute` med 5 actions (briefing, classify, draft, search, brain-status)
- COMMAND_API_KEY satt i Render
- Amanda (Cowork) har mail-agent skill installerad — kan läsa Gmail direkt via MCP
- PWA manifest + service worker finns

### ENVIRONMENT PÅ RENDER
- AI_PROVIDER=groq, GROQ_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY, COMMAND_API_KEY — alla satta

---

## FIXA NU — 4 STEG I ORDNING

### STEG 1: Röstinput — Mikrofon i ChatWidget (PRIO 1)

Lägg till Web Speech API push-to-talk i `client/components/ChatWidget.tsx`.

**Ny komponent** `client/components/VoiceButton.tsx`:
```tsx
'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, MicOff, Loader } from 'lucide-react';

interface VoiceButtonProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  lang?: string;
}

export default function VoiceButton({ onTranscript, disabled, lang = 'sv-SE' }: VoiceButtonProps) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSupported(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = lang;
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      onTranscript(transcript);
      setListening(false);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
  }, [lang, onTranscript]);

  const toggle = useCallback(() => {
    if (!recognitionRef.current) return;
    if (listening) {
      recognitionRef.current.stop();
    } else {
      recognitionRef.current.start();
      setListening(true);
    }
  }, [listening]);

  if (!supported) return null;

  return (
    <button
      onClick={toggle}
      disabled={disabled}
      className={`p-2 rounded-lg transition-colors ${
        listening
          ? 'bg-red-500 text-white animate-pulse'
          : 'text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20'
      }`}
      title={listening ? 'Stoppa inspelning' : 'Tryck för att prata'}
      type="button"
    >
      {listening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
    </button>
  );
}
```

**Integrera i ChatWidget.tsx:**

1. Importera VoiceButton:
```tsx
import VoiceButton from './VoiceButton';
```

2. Lägg till en callback i ChatWidget:
```tsx
const handleVoiceTranscript = useCallback((text: string) => {
  setInput((prev) => prev ? `${prev} ${text}` : text);
  // Auto-send om användaren bara pratade (inget befintligt text)
  // Avvakta — låt användaren bekräfta. Men fokusera input.
  inputRef.current?.focus();
}, []);
```

3. Placera VoiceButton bredvid Send-knappen i input-raden:
```tsx
<div className="flex items-center gap-1">
  <VoiceButton onTranscript={handleVoiceTranscript} disabled={loading} />
  <button onClick={handleSend} disabled={!input.trim() || loading} /* ... */ >
    <Send className="w-4 h-4" />
  </button>
</div>
```

**Notera:** Web Speech API funkar i Safari (iOS) och Chrome. Kräver HTTPS (Vercel ger det). Ingen extra dependency.

---

### STEG 2: Apple Shortcuts / Siri-integration (PRIO 1)

Skapa en **guide-sida** `client/app/setup-siri/page.tsx` som visar instruktioner + genererar en `.shortcut`-fil.

**Enklaste Siri-lösningen — URL Scheme:**

Siri Shortcuts kan trigga en URL. Vår PWA lyssnar på en query-param.

1. I `client/app/layout.tsx` eller en dedikerad route, lägg till URL-param-hantering:

```tsx
// client/app/page.tsx (eller layout.tsx via useSearchParams)
// Om ?voice=1 — öppna chatten och starta lyssnaren direkt
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('voice') === '1') {
    setIsOpen(true);
    // Trigga voice recognition efter kort delay
    setTimeout(() => {
      // Dispatch custom event som VoiceButton lyssnar på
      window.dispatchEvent(new CustomEvent('cdp:start-voice'));
    }, 500);
  }
}, []);
```

2. I VoiceButton, lyssna på `cdp:start-voice`:
```tsx
useEffect(() => {
  const handler = () => {
    if (recognitionRef.current && !listening) {
      recognitionRef.current.start();
      setListening(true);
    }
  };
  window.addEventListener('cdp:start-voice', handler);
  return () => window.removeEventListener('cdp:start-voice', handler);
}, [listening]);
```

3. **Apple Shortcut-konfiguration** (instruktioner på setup-siri-sidan):
```
Shortcut name: "Kolla mail"
Trigger: "Hej Siri, kolla mail"
Action 1: Open URL → https://cdp-communication-hub.vercel.app/?voice=1&cmd=briefing
```

Ytterligare shortcuts:
- "Svara på mail" → `?voice=1&cmd=reply`
- "Nytt mail" → `?voice=1&cmd=compose`

4. **Läs cmd-param i ChatWidget** och skicka automatiskt command:
```tsx
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const cmd = params.get('cmd');
  if (cmd === 'briefing') {
    // Auto-send briefing-kommando
    handleSendMessage('Ge mig en mail briefing');
  }
}, []);
```

---

### STEG 3: Learning System — Brain Core (PRIO 1)

Brain Core har redan `POST /brain-core/learn` och `GET /brain-core/learning-stats`. Nu ska vi ANVÄNDA dem.

#### A) Auto-learn vid användarinteraktion

I `server/src/routes/chat.ts`, efter varje framgångsrik command, logga ett learning event:

```typescript
// Efter en lyckad inbox_summary / categorize / mark_spam / etc:
try {
  await brainCoreService.recordLearning(
    request.userId,
    `command:${action}`,                    // event_type
    {
      command: action,
      params: body.params || {},
      thread_ids: body.thread_ids || [],
      result_summary: result.summary || null,
      timestamp: new Date().toISOString(),
    },
    'chat_widget',                          // source_type
    body.thread_ids?.[0] || undefined       // source_id
  );
} catch { /* silent — learning is non-critical */ }
```

#### B) Auto-learn vid draft-godkännande

I draft-approve-flödet (när användaren godkänner ett utkast):

```typescript
// event_type: 'draft:approved'
await brainCoreService.recordLearning(userId, 'draft:approved', {
  draft_id: draft.id,
  thread_id: draft.threadId,
  to_addresses: draft.toAddresses,
  subject: draft.subject,
  tone: detectTone(draft.bodyText),  // 'casual_sv' | 'formal_sv' | 'english'
  word_count: draft.bodyText.split(/\s+/).length,
  reply_time_hours: calcReplyTime(thread),
});
```

#### C) Auto-learn vid klassificering som ändras

Om användaren manuellt ändrar prioritet eller kategori:

```typescript
// event_type: 'classification:override'
await brainCoreService.recordLearning(userId, 'classification:override', {
  thread_id: threadId,
  ai_priority: originalAnalysis.priority,
  user_priority: newPriority,
  ai_classification: originalAnalysis.classification,
  user_classification: newClassification,
  sender: thread.participantEmails,
  subject: thread.subject,
});
```

#### D) Hämta learning history för bättre AI-calls

Skapa en ny metod i `brain-core.service.ts`:

```typescript
async getRelevantLearning(userId: string, context: {
  sender?: string;
  subject?: string;
  eventType?: string;
}): Promise<LearningEvent[]> {
  const where: any = { userId };

  // Hämta senaste 50 events, filtrera på typ om angett
  if (context.eventType) {
    where.eventType = context.eventType;
  }

  const events = await prisma.learningEvent.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  // Filtrera på avsändare om relevant
  if (context.sender) {
    const senderEvents = events.filter(e =>
      JSON.stringify(e.data).includes(context.sender!)
    );
    if (senderEvents.length > 0) return senderEvents;
  }

  return events;
}
```

#### E) Inject learning context i AI-prompts

I `ai.service.ts`, innan AI-anrop för classification/draft:

```typescript
// Hämta learning context
const learningHistory = await brainCoreService.getRelevantLearning(userId, {
  sender: thread.participantEmails[0],
  eventType: 'classification:override',
});

// Lägg till i AI-prompten:
const learningContext = learningHistory.length > 0
  ? `\n\nHistorik — så har Jesper hanterat liknande mail tidigare:\n${
      learningHistory.slice(0, 5).map(e =>
        `- ${e.eventType}: ${JSON.stringify(e.data).substring(0, 200)}`
      ).join('\n')
    }`
  : '';

// Append till system prompt
const systemPrompt = baseSystemPrompt + learningContext;
```

---

### STEG 4: Email Workflow Rules — Seeda Brain Core (PRIO 2)

Kör ett seed-script som populerar Brain Core med Jespers regler.

**Skapa/uppdatera** `server/src/scripts/seed-brain-core.ts`:

```typescript
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function seed() {
  // Hitta Jespers userId
  const account = await prisma.emailAccount.findFirst({ where: { isActive: true } });
  if (!account) throw new Error('Inget aktivt konto');
  const userId = account.userId;

  console.log(`Seeding Brain Core for userId: ${userId}`);

  // ── WRITING MODES ─────────────────────────────────────────
  const writingModes = [
    {
      key: 'casual_sv',
      label: 'Svenska vardaglig',
      description: 'Direkt, varm, inga korporativa fraser. Korta meningar. "du" inte "ni".',
      examples: [
        'Hej! Tack för att du hörde av dig.',
        'Absolut, vi kör på det. Hojta om du behöver nåt.',
        'Perfekt, jag tittar på det imorgon.',
      ],
      signature: '/Jesper',
    },
    {
      key: 'formal_sv',
      label: 'Svenska formell',
      description: 'Fortfarande direkt men polerad. För myndigheter och affärskontakter.',
      examples: [
        'Tack för informationen. Jag återkommer inom kort.',
        'Jag bifogar de efterfrågade dokumenten.',
      ],
      signature: 'Med vänlig hälsning,\nJesper Melin',
    },
    {
      key: 'english',
      label: 'English',
      description: 'Confident, slightly informal. For international contacts and pitches.',
      examples: [
        'Hey! Thanks for reaching out.',
        'Sounds great — let me know how you want to move forward.',
      ],
      signature: 'Best,\nJesper',
    },
  ];

  for (const mode of writingModes) {
    await prisma.writingMode.upsert({
      where: { userId_key: { userId, key: mode.key } },
      update: mode,
      create: { userId, ...mode },
    });
    console.log(`  ✓ Writing mode: ${mode.key}`);
  }

  // ── VOICE ATTRIBUTES ──────────────────────────────────────
  const voiceAttributes = [
    { key: 'tone', value: 'Direkt och varm — aldrig korporativ' },
    { key: 'formality', value: 'Informell som default, formell för myndigheter' },
    { key: 'greeting', value: 'Hej / Hey — aldrig "Bästa" eller "Kära"' },
    { key: 'closing', value: '"Mvh" eller "/Jesper" — ALDRIG "Med vänliga hälsningar"' },
    { key: 'style', value: 'Korta meningar. Rak på sak. Ingen onödig fyllnadstext.' },
    { key: 'apology', value: 'Aldrig överdrivet ursäktande. Rakt och ärligt.' },
  ];

  for (const attr of voiceAttributes) {
    await prisma.voiceAttribute.upsert({
      where: { userId_key: { userId, key: attr.key } },
      update: attr,
      create: { userId, ...attr },
    });
    console.log(`  ✓ Voice attribute: ${attr.key}`);
  }

  // ── CLASSIFICATION RULES ──────────────────────────────────
  const classificationRules = [
    // AUTO/SKRÄP
    {
      name: 'noreply_auto',
      pattern: 'from:noreply@* OR from:no-reply@*',
      classification: 'auto',
      priority: 'low',
      description: 'Automatiska noreply-mail → auto/low',
    },
    {
      name: 'github_notifications',
      pattern: 'from:notifications@github.com',
      classification: 'notification',
      priority: 'low',
      description: 'GitHub-notiser → gruppera och sammanfatta',
    },
    {
      name: 'render_deploy_ok',
      pattern: 'from:no-reply@render.com AND NOT subject:failed',
      classification: 'auto',
      priority: 'low',
      description: 'Render deploy OK → auto/low',
    },
    {
      name: 'skool_notifications',
      pattern: 'from:*@skool.com',
      classification: 'notification',
      priority: 'low',
      description: 'Skool community-notiser',
    },
    {
      name: 'newsletter',
      pattern: 'from:*newsletter* OR list:*',
      classification: 'newsletter',
      priority: 'low',
      description: 'Nyhetsbrev',
    },
    // BRA ATT VETA
    {
      name: 'render_deploy_fail',
      pattern: 'from:no-reply@render.com AND subject:failed',
      classification: 'alert',
      priority: 'medium',
      description: 'Render deploy FAILED → bra att veta',
    },
    {
      name: 'github_ci_fail',
      pattern: 'from:notifications@github.com AND (subject:failed OR subject:failing)',
      classification: 'alert',
      priority: 'medium',
      description: 'GitHub CI failure → bra att veta',
    },
    // HÖG PRIORITET
    {
      name: 'kronofogden',
      pattern: 'from:*@kronofogden.se',
      classification: 'authority',
      priority: 'high',
      description: 'Kronofogden — ALLTID hög prio',
    },
    {
      name: 'forsakringskassan',
      pattern: 'from:*@forsakringskassan.se',
      classification: 'authority',
      priority: 'high',
      description: 'Försäkringskassan — ALLTID hög prio',
    },
    {
      name: 'skatteverket',
      pattern: 'from:*@skatteverket.se',
      classification: 'authority',
      priority: 'high',
      description: 'Skatteverket — ALLTID hög prio',
    },
    {
      name: 'skuldsanering_keyword',
      pattern: 'subject:skuldsanering OR body:skuldsanering',
      classification: 'authority',
      priority: 'high',
      description: 'Skuldsaneringsärenden',
    },
    {
      name: 'sjukersattning_keyword',
      pattern: 'subject:sjukersättning OR body:sjukersättning',
      classification: 'authority',
      priority: 'high',
      description: 'Sjukersättning-relaterat',
    },
    {
      name: 'vardskada_keyword',
      pattern: 'subject:vårdskada OR body:vårdskada OR subject:patientnämnd',
      classification: 'authority',
      priority: 'high',
      description: 'Vårdskadeärenden',
    },
    // KRÄVER SVAR
    {
      name: 'direct_question',
      pattern: 'AI_DETECT:direct_question_to_jesper',
      classification: 'needs_reply',
      priority: 'high',
      description: 'Direkt fråga som kräver Jespers svar (AI-detekterad)',
    },
  ];

  for (const rule of classificationRules) {
    await prisma.classificationRule.upsert({
      where: { userId_name: { userId, name: rule.name } },
      update: rule,
      create: { userId, ...rule },
    });
    console.log(`  ✓ Classification rule: ${rule.name}`);
  }

  // ── CONTACT PROFILES (kända kontakter) ────────────────────
  const contacts = [
    {
      emailAddress: 'no-reply@render.com',
      displayName: 'Render',
      relationship: 'service',
      notes: 'Deploy-notiser. OK = ignorera. Failed = kolla.',
      autoAction: 'archive_if_ok',
    },
    {
      emailAddress: 'notifications@github.com',
      displayName: 'GitHub',
      relationship: 'service',
      notes: 'CI/CD-notiser. Gruppera. Failures = bra att veta.',
      autoAction: 'group_and_summarize',
    },
  ];

  for (const contact of contacts) {
    await prisma.contactProfile.upsert({
      where: { userId_emailAddress: { userId, emailAddress: contact.emailAddress } },
      update: contact,
      create: { userId, ...contact },
    });
    console.log(`  ✓ Contact: ${contact.emailAddress}`);
  }

  console.log('\n✅ Brain Core seedad!');
  await prisma.$disconnect();
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

**Lägg till npm script** i `server/package.json`:
```json
"scripts": {
  "seed:brain-core": "npx ts-node src/scripts/seed-brain-core.ts"
}
```

**Kör:** `cd server && npm run seed:brain-core`

---

## STEG 5: Agent API — Learn action (PRIO 2)

Lägg till en ny action `learn` i `server/src/routes/agent.ts` så Amanda kan skicka learning events direkt:

```typescript
// I ALLOWED_ACTIONS, lägg till 'learn':
const ALLOWED_ACTIONS = ['briefing', 'classify', 'draft', 'search', 'brain-status', 'learn'] as const;

// I switch-satsen, ny case:
case 'learn': {
  if (!params.event_type) {
    return reply.code(400).send({ success: false, error: 'params.event_type krävs.' });
  }
  const event = await brainCoreService.recordLearning(
    userId,
    params.event_type,
    params.data || {},
    params.source_type || 'amanda_agent',
    params.source_id
  );
  return {
    success: true,
    action,
    data: { event_id: event.id, event_type: event.eventType },
  };
}
```

Det gör att Amanda (Cowork skill) kan rapportera:
- `{ action: "learn", params: { event_type: "user:feedback", data: { instruction: "svara alltid kort till X" } } }`
- `{ action: "learn", params: { event_type: "draft:style_preference", data: { context: "replied casual to formal email" } } }`

---

## STEG 6: ChatWidget — Loading States & Error Handling (PRIO 3)

Förbättra UX i ChatWidget:

1. **Skeleton loading** under AI-svar (inte bara spinner)
2. **Retry-knapp** vid fel
3. **Offline-banner** om navigator.onLine === false
4. **Voice feedback** — kort vibration (navigator.vibrate(50)) när inspelning startar/stoppar på mobil

---

## REGLER
- `cd server && npx tsc --noEmit` + `cd client && npx tsc --noEmit` innan commit
- ALLTID push till main
- Lucide-ikoner, inga emojis i UI
- ALDRIG auto-send, ALDRIG auto-delete
- All AI-text på SVENSKA
- Testa lokalt innan push

## KOM IGÅNG:
**Steg 1 + 2 kan göras i samma commit (voice + Siri). Steg 3 (learning) i nästa. Steg 4 (seed) separat. Steg 5 + 6 sist.**
