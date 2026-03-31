# CDP Communication Hub — Final Build Specification

> 121 commits, ~26k LOC, 15 sidor, 30 komponenter, 15 routes, 14 services, 15 tester.
> Noll TypeScript-errors. Alla core features implementerade.
> Denna specifikation täcker ALLT som återstår för en komplett, dagligt användbar produkt.

---

## PRINCIPER

- `npx tsc --noEmit` i client OCH server innan varje commit — NOLL errors
- Push till main efter varje commit
- ALLA UI-texter SVENSKA med i18n-nycklar (sv, en, es, ru)
- Lucide-ikoner — inga emoji-ikoner i UI
- Tailwind + `dark:` på ALLT
- ALDRIG auto-send email, ALDRIG auto-delete
- Inga nakna `console.*` i client prod-kod
- Om Prisma-schema ändras: `npx prisma db push`
- Varje sprint = 1 commit med tydligt feat/fix prefix

---

## SPRINT 1: MAILBOX VIEWS — Inbox, Sent, Trash, Archive, Snoozed

### Problem
Inbox visar bara inkommande mail. Det finns ingen vy för skickat, papperskorg, arkiv eller snoozade trådar.

### Lösning

**1A. Mailbox-selector i inbox**

Lägg till en vy-väljare överst i `client/app/inbox/page.tsx`:

```tsx
type MailboxView = 'inbox' | 'sent' | 'trash' | 'archive' | 'snoozed' | 'all';

const MAILBOX_VIEWS: Array<{ id: MailboxView; label: string; icon: LucideIcon }> = [
  { id: 'inbox', label: 'Inkorg', icon: Inbox },
  { id: 'sent', label: 'Skickat', icon: Send },
  { id: 'archive', label: 'Arkiv', icon: Archive },
  { id: 'trash', label: 'Papperskorg', icon: Trash2 },
  { id: 'snoozed', label: 'Snoozade', icon: Clock },
];
```

Visa som horisontell tab-rad under TopBar. Varje tab visar antal olästa (badge).

**1B. Backend — query-parameter**

I `server/src/routes/threads.ts` GET `/threads`, stöd `?mailbox=` parameter:

```
inbox    → isArchived: false, isTrashed: false, snoozedUntil: null (eller passerad)
sent     → trådar där userId har skickat minst ett meddelande
trash    → isTrashed: true
archive  → isArchived: true, isTrashed: false
snoozed  → snoozedUntil > now
all      → allt utom trashade
```

**1C. Sent-mail tracking**

I `server/src/services/draft.service.ts`, vid send: sätt `isSentByUser: true` på tråden.

Lägg till i schema:
```prisma
isSentByUser Boolean @default(false) @map("is_sent_by_user")
```

**1D. Empty states per vy**

Varje mailbox-view ska ha en relevant empty state:
- Inbox: "Inget nytt — du är i kapp!"
- Sent: "Du har inte skickat något ännu"
- Trash: "Papperskorgen är tom"
- Archive: "Inget arkiverat"
- Snoozed: "Inga snoozade trådar"

**1E. Swipe-actions per vy**

- Inbox: svep vänster = arkivera, svep höger = öppna
- Trash: svep vänster = radera permanent (med ConfirmDialog), svep höger = återställ
- Archive: svep vänster = trash, svep höger = flytta till inbox

### COMMIT: `feat: mailbox views — inbox/sent/trash/archive/snoozed tabs with backend filtering`

---

## SPRINT 2: SCHEDULED SEND

### Problem
Det går inte att schemalägga mail för att skicka vid en specifik tidpunkt.

### Lösning

**2A. Schema**

Lägg till i Draft-modellen:
```prisma
scheduledAt DateTime? @map("scheduled_at")
```

**2B. Backend — schedule endpoint**

I `server/src/routes/drafts.ts`:

```
POST /drafts/:id/schedule — { send_at: ISO-datetime }
  - Sätter scheduledAt på draftet
  - Kräver att draftet är approved
  - Returnerar { draft, message: "Schemalagt för [tid]" }

DELETE /drafts/:id/schedule — Avbryt schemaläggning
  - Nollställer scheduledAt
```

**2C. Scheduler**

I `server/src/services/sync-scheduler.service.ts`, lägg till i sync-loopen:

```typescript
async function sendScheduledDrafts(): Promise<void> {
  const now = new Date();
  const ready = await prisma.draft.findMany({
    where: {
      scheduledAt: { lte: now },
      status: 'approved',
    },
    include: { account: true },
  });

  for (const draft of ready) {
    try {
      await draftService.send(draft.id, draft.account.userId);
      // Log action
      await prisma.actionLog.create({
        data: {
          userId: draft.account.userId,
          actionType: 'scheduled_send',
          targetType: 'draft',
          targetId: draft.id,
          description: `Scheduled email sent: ${draft.subject}`,
        },
      });
    } catch (err) {
      // Mark as failed, don't retry automatically
      await prisma.draft.update({
        where: { id: draft.id },
        data: {
          status: 'failed',
          errorMessage: (err as Error).message,
          scheduledAt: null,
        },
      });
    }
  }
}
```

Kör varje minut, precis som snooze-wake.

**2D. Frontend — schedule UI**

I `client/app/drafts/[id]/page.tsx` och `client/app/compose/page.tsx`:

Bredvid "Skicka"-knappen, lägg till en dropdown:
```tsx
const SCHEDULE_OPTIONS = [
  { label: 'Om 1 timme', fn: () => addHours(new Date(), 1) },
  { label: 'Om 3 timmar', fn: () => addHours(new Date(), 3) },
  { label: 'Imorgon 08:00', fn: () => setHours(addDays(new Date(), 1), 8, 0, 0, 0) },
  { label: 'Måndag 08:00', fn: () => nextMonday8am() },
  { label: 'Välj tid...', fn: null }, // opens datetime picker
];
```

Visa som split-button: [Skicka ▼] — klick = skicka nu, pil ner = schedule dropdown.

Om draftet redan är schemalagt, visa: "Schemalagt: [tid]" med "Avbryt"-knapp.

**2E. API client**

```typescript
async scheduleDraft(id: string, sendAt: string) {
  return this.request('POST', `/drafts/${id}/schedule`, { send_at: sendAt });
}
async cancelSchedule(id: string) {
  return this.request('DELETE', `/drafts/${id}/schedule`);
}
```

### COMMIT: `feat: scheduled send — approve + schedule drafts for future delivery`

---

## SPRINT 3: CONTACT MANAGEMENT

### Problem
Brain Core har ContactProfile men det finns inget UI för att se eller redigera kontakter.

### Lösning

**3A. Kontaktsida**

Skapa `client/app/contacts/page.tsx`:

- Lista alla kontakter sorterade efter senaste interaktion
- Sökfält med debounce
- Varje kontakt visar: namn, email, relationship, antal interaktioner, senaste mail
- Klickbar → expanderar inline med detaljer

**3B. Kontaktdetalj — inline expansion**

Vid klick på en kontakt, visa:
- Redigerbara fält: displayName, relationship, preferredMode, language, notes
- Senaste 5 trådar med denna kontakt (klickbara)
- "Skicka mail"-knapp → navigerar till /compose?to=email

**3C. Backend**

Kontrollera att `GET /brain-core/contacts` returnerar tillräcklig data. Om inte, utöka:

```typescript
// GET /brain-core/contacts?search=query
// Returns contacts with thread count and last interaction date
const contacts = await prisma.contactProfile.findMany({
  where: search ? {
    OR: [
      { email: { contains: search, mode: 'insensitive' } },
      { displayName: { contains: search, mode: 'insensitive' } },
    ],
  } : {},
  orderBy: { lastInteractionAt: 'desc' },
});
```

**3D. PATCH kontakt**

```
PATCH /brain-core/contacts/:id — Uppdatera kontaktinfo
Body: { displayName?, relationship?, preferredMode?, language?, notes? }
```

**3E. BottomNav — lägg till kontakter**

I `client/components/BottomNav.tsx`, byt ut en av tabs (eller lägg till 5:e):
- Kontakter med Users-ikon

### COMMIT: `feat: contact management — contact list, detail, edit, recent threads`

---

## SPRINT 4: MULTI-ACCOUNT IMAP CONNECT UI

### Problem
AddEmailAccount-komponenten har presets för Gmail, Outlook, Yahoo men IMAP-formuläret behöver UX-polish.

### Lösning

**4A. Förbättra AddEmailAccount.tsx**

- Steg 1: Välj provider (Google, Microsoft, Yahoo, Annan)
- Steg 2 (Google): OAuth-knapp → redirect
- Steg 2 (Övriga): IMAP/SMTP-formulär med presets ifyllda
  - Email, lösenord (app-password), IMAP host/port/SSL, SMTP host/port/SSL
  - "Testa anslutning"-knapp innan save
  - Tydliga instruktioner: "Använd ett app-lösenord, inte ditt vanliga lösenord"
  - Länk till guide: "Hur skapar jag ett app-lösenord?"

**4B. Connection test endpoint**

Verifiera att `POST /accounts/test-connection` redan fungerar korrekt för IMAP/SMTP. Om inte, fixa.

**4C. Account management**

I `client/app/settings/accounts/page.tsx`:
- Visa sync-status per konto (senaste sync, antal trådar)
- "Synca nu"-knapp per konto
- "Koppla bort"-knapp med ConfirmDialog
- Drag & drop för att ändra ordning (eller pilar upp/ner)

**4D. Default account**

I settings, kunna välja default-konto (det som compose öppnar med):
```
PATCH /settings — { defaultAccountId: string }
```

### COMMIT: `feat: multi-account IMAP polish — guided setup, connection test, account management`

---

## SPRINT 5: PERFORMANCE + LARGE INBOX

### Problem
Med 1000+ trådar kommer appen bli seg. SWR laddar allt i en request.

### Lösning

**5A. Server-side pagination**

I `server/src/routes/threads.ts` GET `/threads`:
- Returnera `{ threads, total, page, pageSize, hasMore }`
- Default: 20 per sida
- Stöd `?page=1&limit=20`

**5B. Infinite scroll i inbox**

I `client/app/inbox/page.tsx`, ersätt "Visa fler"-knappen med infinite scroll:

```typescript
import { useRef, useCallback } from 'react';

const observer = useRef<IntersectionObserver | null>(null);
const lastThreadRef = useCallback((node: HTMLDivElement | null) => {
  if (isLoading) return;
  if (observer.current) observer.current.disconnect();
  observer.current = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting && hasMore) {
      setPage(p => p + 1);
    }
  });
  if (node) observer.current.observe(node);
}, [isLoading, hasMore]);
```

**5C. SWR pagination**

Använd `useSWRInfinite` istället för `useSWR` i inbox:

```typescript
import useSWRInfinite from 'swr/infinite';

const getKey = (pageIndex: number, previousPageData: any) => {
  if (previousPageData && !previousPageData.hasMore) return null;
  return `/threads?page=${pageIndex + 1}&limit=20&mailbox=${mailboxView}&search=${search}`;
};

const { data, size, setSize, isLoading, mutate } = useSWRInfinite(getKey, fetcher);
const threads = data ? data.flatMap(d => d.threads) : [];
const hasMore = data?.[data.length - 1]?.hasMore ?? false;
```

**5D. Virtual list**

Installera och använd `react-window` för att bara rendera synliga trådar:

```bash
cd client && npm install react-window react-virtualized-auto-sizer && npm install -D @types/react-window
```

Wrappa tråd-listan med FixedSizeList:
```tsx
import { FixedSizeList } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';

<AutoSizer>
  {({ height, width }) => (
    <FixedSizeList
      height={height}
      width={width}
      itemCount={threads.length}
      itemSize={80}
    >
      {({ index, style }) => (
        <div style={style}>
          <ThreadRow thread={threads[index]} />
        </div>
      )}
    </FixedSizeList>
  )}
</AutoSizer>
```

**5E. Image lazy loading**

I thread detail, lägg till `loading="lazy"` på alla bilder i sanitized HTML:

I `client/lib/sanitize-html.ts`:
```typescript
// Add lazy loading to images
clean = clean.replace(/<img /gi, '<img loading="lazy" ');
```

**5F. Debounce search — redan finns, verifiera**

Kontrollera att search-debounce är 400ms i inbox och 300ms i contacts.

### COMMIT: `feat: performance — server pagination, infinite scroll, virtual list, lazy images`

---

## SPRINT 6: E2E TESTING

### Problem
Vi har 15 unit/integration-tester men inga end-to-end-tester.

### Lösning

**6A. Installera Playwright**

```bash
cd client && npm install -D @playwright/test && npx playwright install chromium
```

**6B. Playwright config**

Skapa `client/playwright.config.ts`:
```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    port: 3000,
    timeout: 30_000,
    reuseExistingServer: true,
  },
});
```

**6C. E2E-tester**

Skapa `client/e2e/`:

**`navigation.spec.ts`**:
- Navigera till /inbox, verifiera att sidan laddar
- Klicka på varje BottomNav-tab, verifiera URL
- Öppna ChatWidget med Cmd+K
- Navigera till /settings

**`inbox.spec.ts`**:
- Ladda inbox, verifiera att trådar visas ELLER empty state
- Klicka mailbox-tabs (inbox/sent/trash/archive)
- Testa sökfältet
- Testa label-filter

**`compose.spec.ts`**:
- Navigera till /compose
- Fyll i to, subject, body
- Verifiera att "Spara utkast"-knapp fungerar
- Verifiera att template-chips finns

**`dark-mode.spec.ts`**:
- Gå till /settings
- Klicka dark mode-knappen
- Verifiera att `<html>` har class="dark"
- Klicka light mode
- Verifiera att class="dark" försvinner

**`keyboard.spec.ts`**:
- Testa j/k i inbox (om trådar finns)
- Testa Cmd+K öppnar chat
- Testa Escape stänger chat

**6D. Package scripts**

```json
"e2e": "playwright test",
"e2e:ui": "playwright test --ui"
```

### COMMIT: `feat: E2E tests — Playwright setup with navigation, inbox, compose, dark mode, keyboard tests`

---

## SPRINT 7: AMANDA AUTONOMOUS MODE

### Problem
Amanda kan svara på kommandon men agerar inte självständigt. Hon borde kunna ge dagliga briefings, föreslå svar, och proaktivt kategorisera.

### Lösning

**7A. Morning briefing — auto-generate**

I `server/src/services/sync-scheduler.service.ts`, lägg till en daglig uppgift (körs 07:00):

```typescript
async function generateMorningBriefing(userId: string): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Check if already generated today
  const existing = await prisma.dailySummary.findFirst({
    where: { userId, createdAt: { gte: today } },
  });
  if (existing) return;

  // Get unread high-priority threads
  const urgent = await prisma.emailThread.findMany({
    where: {
      account: { userId, isActive: true },
      isRead: false,
      priority: 'high',
      isTrashed: false,
    },
    take: 10,
    orderBy: { lastMessageAt: 'desc' },
    include: { messages: { take: 1, orderBy: { date: 'desc' } } },
  });

  // Get yesterday's stats
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const stats = {
    received: await prisma.emailMessage.count({
      where: { thread: { account: { userId } }, date: { gte: yesterday, lt: today } },
    }),
    sent: await prisma.draft.count({
      where: { account: { userId }, status: 'sent', updatedAt: { gte: yesterday, lt: today } },
    }),
    classified: await prisma.aIAnalysis.count({
      where: { thread: { account: { userId } }, createdAt: { gte: yesterday, lt: today } },
    }),
  };

  // Generate AI summary
  const summary = await aiService.generateBriefing(userId, urgent, stats);

  await prisma.dailySummary.create({
    data: {
      userId,
      date: today,
      ...summary,
    },
  });

  // Push notification
  await sendPushToUser(userId, {
    title: '☀️ God morgon — din briefing är klar',
    body: `${stats.received} nya mail igår, ${urgent.length} kräver uppmärksamhet`,
    url: '/',
  }).catch(() => {});
}
```

**7B. Smart draft suggestions**

I `server/src/routes/threads.ts`, vid GET av en tråd, om tråden:
1. Är oläst
2. Har hög prioritet
3. Har ett tydligt fråge-mönster (frågetecken, "can you", "vänligen", etc.)

→ Inkludera ett `suggestedReply` fält med ett kort AI-genererat svar-förslag.

Cachea i AIAnalysis: `suggestedReply?: string`.

**7C. Frontend — draft suggestion**

I `client/app/threads/[id]/page.tsx`, om `thread.suggestedReply` finns:

```tsx
{thread.suggestedReply && (
  <div className="mx-4 mb-3 p-4 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-xl">
    <div className="flex items-center gap-2 mb-2">
      <Bot size={16} className="text-violet-500" />
      <span className="text-sm font-medium text-violet-700 dark:text-violet-300">Amanda föreslår</span>
    </div>
    <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">{thread.suggestedReply}</p>
    <div className="flex gap-2">
      <button
        onClick={() => handleQuickReply(thread.suggestedReply)}
        className="text-xs px-3 py-1.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700"
      >
        Använd som utkast
      </button>
      <button
        onClick={() => setSuggestedDismissed(true)}
        className="text-xs px-3 py-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400"
      >
        Ignorera
      </button>
    </div>
  </div>
)}
```

**7D. Auto-priority learning**

I learning-systemet, tracka:
- Om användaren öppnar ett mail inom 5 min → det är troligen viktigt
- Om användaren arkiverar utan att läsa → troligen oviktigt
- Om användaren svarar → definitivt viktigt

Använd detta för att förbättra framtida prioritering.

### COMMIT: `feat: Amanda autonomous — morning briefing, smart reply suggestions, priority learning`

---

## SPRINT 8: FINAL POLISH + DEPLOY READY

### 8A. Loading performance

- Kontrollera att alla dynamiska imports (`dynamic(() => import(...), { ssr: false })`) fungerar korrekt
- Verifiera att bundle size inte är onödigt stort
- Kör `npm run analyze` (bundle analyzer) och notera om något oväntat stort inkluderas

### 8B. Mobile PWA polish

- Testa att manifest.json har korrekta ikoner
- Verifiera att `theme_color` matchar TopBar
- Kontrollera att `apple-touch-icon` finns
- Verifiera att offline.html visas korrekt vid nätverksfel
- Säkerställ att install-prompt visas på Android Chrome

### 8C. SEO / Meta

I `client/app/layout.tsx`, säkerställ:
```tsx
<meta name="description" content="CDP Communication Hub — AI-driven mail client" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
```

### 8D. Final i18n audit

Kör igenom ALLA sidor och komponenter. Sök efter hårdkodade svenska strängar som borde vara i18n:
```bash
grep -rn '"[A-ZÅÄÖ][a-zåäö]' client/app/ client/components/ --include="*.tsx" | grep -v "import\|from\|className\|console\|type\|const\|let\|var"
```

Flytta ALLA till i18n-filer.

### 8E. Production environment check

Skapa `server/src/utils/env-check.ts`:
```typescript
export function validateEnv() {
  const required = [
    'DATABASE_URL', 'JWT_SECRET', 'ENCRYPTION_KEY',
    'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI',
    'FRONTEND_URL',
  ];
  const optional = [
    'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY',
    'GROQ_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY',
    'COMMAND_API_KEY',
  ];

  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.error(`FATAL: Missing required env vars: ${missing.join(', ')}`);
    process.exit(1);
  }

  const missingOptional = optional.filter(k => !process.env[k]);
  if (missingOptional.length > 0) {
    console.warn(`WARNING: Missing optional env vars: ${missingOptional.join(', ')}`);
  }
}
```

Anropa i `server/src/index.ts` innan server startar.

### 8F. Graceful shutdown

```typescript
const signals = ['SIGINT', 'SIGTERM'];
for (const signal of signals) {
  process.on(signal, async () => {
    fastify.log.info(`Received ${signal}, shutting down...`);
    await fastify.close();
    await prisma.$disconnect();
    process.exit(0);
  });
}
```

### 8G. README uppdatering

Uppdatera README.md med:
- Alla nya features (mailbox views, scheduled send, contacts, snooze, etc.)
- Uppdaterad arkitekturöversikt
- Keyboard shortcuts lista
- Amanda's capabilities lista

### COMMIT: `feat: final polish — mobile PWA, i18n audit, env validation, graceful shutdown`

---

## SAMMANFATTNING — 8 sprints, 8 commits:

1. `feat: mailbox views — inbox/sent/trash/archive/snoozed tabs with backend filtering`
2. `feat: scheduled send — approve + schedule drafts for future delivery`
3. `feat: contact management — contact list, detail, edit, recent threads`
4. `feat: multi-account IMAP polish — guided setup, connection test, account management`
5. `feat: performance — server pagination, infinite scroll, virtual list, lazy images`
6. `feat: E2E tests — Playwright setup with navigation, inbox, compose, dark mode, keyboard tests`
7. `feat: Amanda autonomous — morning briefing, smart reply suggestions, priority learning`
8. `feat: final polish — mobile PWA, i18n audit, env validation, graceful shutdown`

## ORDNING & BEROENDEN

Sprint 1 (mailbox views) bör göras först — andra sprints refererar till mailbox-filtret.
Sprint 2-4 är oberoende och kan göras i valfri ordning.
Sprint 5 (performance) bör göras efter mailbox views.
Sprint 6 (E2E) bör göras sist eller näst sist.
Sprint 7 (Amanda autonomous) kan göras när som helst.
Sprint 8 (final polish) ska vara sist.

## REGLER (repetition)

- NOLL TypeScript-errors före commit
- ALDRIG auto-send, ALDRIG auto-delete
- Alla texter i i18n (4 språk)
- Dark mode på allt
- Lucide-ikoner
- Prisma: `db push` (inte migrate)
- Test: minst 1 nytt test per sprint om det berör backend-logik
- Console: dev-guarded i client, fastify.log i server
- Error states: varje SWR-hook ska ha tydlig error-vy med retry-knapp
