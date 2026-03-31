# CDP Communication Hub — Build Specification 2: Final Stretch

> 129 commits, ~28k LOC (15.6k client + 12.2k server), 16 sidor, 29 komponenter, 15 routes, 14 services, 7 hooks, 22 tester.
> Noll TypeScript-errors. Alla core features implementerade.
> Denna spec tar oss från 92% till 100% — redo för daglig produktion.

---

## PRINCIPER (samma som alltid)

- `npx tsc --noEmit` i client OCH server innan varje commit — NOLL errors
- Push till main efter varje commit
- ALLA UI-texter SVENSKA med i18n-nycklar (sv, en, es, ru)
- Lucide-ikoner — inga emoji i UI
- Tailwind + `dark:` på ALLT
- ALDRIG auto-send email, ALDRIG auto-delete
- Inga nakna `console.*` i client prod-kod
- Om Prisma-schema ändras: `npx prisma db push`
- Varje sprint = 1 commit med tydligt feat/fix prefix

---

## SPRINT 1: CONVERSATION UX — Collapse, Quote, Thread Summary

### Problem
Långa mail-trådar med 10+ meddelanden är svåra att navigera. Allt visas expanderat.

### 1A. Message collapse i thread detail

I `client/app/threads/[id]/page.tsx`:

Om tråden har > 3 meddelanden, visa bara första och sista expanderade. Resten kollapsade med en klickbar rad:

```tsx
const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());
const shouldCollapseByDefault = thread.messages.length > 3;

// Auto-expand first and last message
useEffect(() => {
  if (shouldCollapseByDefault && thread.messages.length > 0) {
    const ids = new Set<string>();
    ids.add(thread.messages[0].id);
    ids.add(thread.messages[thread.messages.length - 1].id);
    setExpandedMessages(ids);
  }
}, [thread.messages]);
```

Kollapsad vy per meddelande:
```tsx
<div
  onClick={() => toggleExpand(msg.id)}
  className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-100 dark:border-gray-800"
>
  <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-medium">
    {(msg.senderName || msg.senderEmail)?.[0]?.toUpperCase()}
  </div>
  <div className="flex-1 min-w-0">
    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{msg.senderName || msg.senderEmail}</span>
    <span className="text-xs text-gray-400 ml-2">{formatRelativeDate(msg.date)}</span>
  </div>
  <ChevronDown size={16} className={`text-gray-400 transition-transform ${expandedMessages.has(msg.id) ? 'rotate-180' : ''}`} />
</div>
```

"Expandera alla"-knapp ovanför meddelandelistan.

### 1B. Quoted text collapse

I expanderade meddelanden, identifiera citatblock (rader som börjar med `>` eller `<blockquote>`) och kollapse dem:

I `client/lib/sanitize-html.ts`, lägg till en funktion:
```typescript
export function wrapQuotedContent(html: string): string {
  // Wrap <blockquote> content with a collapsible wrapper
  return html.replace(
    /(<blockquote[^>]*>)([\s\S]*?)(<\/blockquote>)/gi,
    '$1<details class="quoted-text"><summary class="text-xs text-gray-400 cursor-pointer hover:text-gray-600 py-1">···  Visa citat</summary><div class="border-l-2 border-gray-200 dark:border-gray-700 pl-3 mt-1">$2</div></details>$3'
  );
}
```

### 1C. Thread AI summary

Om tråden har > 5 meddelanden OCH en AI-analys finns, visa en kort sammanfattning överst:

```tsx
{thread.messages.length > 5 && thread.aiAnalysis?.summary && (
  <div className="mx-4 mb-3 p-3 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-xl">
    <div className="flex items-center gap-2 mb-1">
      <Bot size={14} className="text-violet-500" />
      <span className="text-xs font-medium text-violet-600 dark:text-violet-400">Sammanfattning</span>
    </div>
    <p className="text-sm text-gray-700 dark:text-gray-300">{thread.aiAnalysis.summary}</p>
  </div>
)}
```

### COMMIT: `feat: conversation UX — message collapse, quoted text folding, thread summary`

---

## SPRINT 2: SPAM + UNSUBSCRIBE + BLOCK SENDER

### 2A. Spam-rapportering

I `server/src/routes/threads.ts`:

```typescript
// POST /threads/:id/spam — Report thread as spam
fastify.post('/threads/:id/spam', async (request, reply) => {
  const { id } = request.params as any;
  const thread = await prisma.emailThread.findFirst({
    where: { id, account: { userId: request.userId } },
    include: { account: true },
  });
  if (!thread) return reply.code(404).send({ error: 'Not found' });

  // Gmail: move to SPAM
  if (thread.account.provider === 'google' && thread.gmailThreadId) {
    await gmailService.modifyLabels(thread.account.id, thread.gmailThreadId, ['SPAM'], ['INBOX']);
  }

  await prisma.emailThread.update({
    where: { id },
    data: { isTrashed: true }, // Treat as trashed locally
  });

  // Auto-create sender rule: future mail from this sender → spam
  await prisma.senderRule.upsert({
    where: {
      userId_senderPattern: {
        userId: request.userId,
        senderPattern: thread.senderEmail,
      },
    },
    update: { action: 'spam' },
    create: {
      userId: request.userId,
      senderPattern: thread.senderEmail,
      action: 'spam',
      description: `Auto-blocked: reported as spam`,
    },
  });

  return { message: 'Marked as spam and sender blocked' };
});
```

### 2B. Unsubscribe-header parsing

I `server/src/services/gmail.service.ts`, vid sync: extrahera `List-Unsubscribe` header:

```typescript
const unsubscribeHeader = headers.find((h: any) => h.name.toLowerCase() === 'list-unsubscribe');
const unsubscribeUrl = unsubscribeHeader?.value?.match(/<(https?:\/\/[^>]+)>/)?.[1] || null;
```

Spara i EmailMessage (eller i thread metadata). Lägg till i schema om det behövs:
```prisma
unsubscribeUrl String? @map("unsubscribe_url")
```

### 2C. Frontend — spam/block/unsubscribe i thread detail

I `client/app/threads/[id]/page.tsx`, lägg till i action-menyn (tre-punkter dropdown):

```tsx
const THREAD_ACTIONS = [
  { label: 'Markera som spam', icon: ShieldX, action: 'spam', variant: 'danger' },
  { label: 'Blockera avsändare', icon: Ban, action: 'block', variant: 'danger' },
  ...(thread.unsubscribeUrl ? [{ label: 'Avprenumerera', icon: MailX, action: 'unsubscribe' }] : []),
];
```

Avprenumerera: öppna unsubscribe-URL i nytt fönster + markera avsändare med lägre prioritet.

### 2D. API client

```typescript
async reportSpam(id: string) {
  return this.request('POST', `/threads/${id}/spam`);
}
async blockSender(email: string) {
  return this.request('POST', '/brain-core/sender-rules', {
    senderPattern: email,
    action: 'spam',
    description: 'Manually blocked',
  });
}
```

### COMMIT: `feat: spam + unsubscribe — report spam, block sender, List-Unsubscribe header support`

---

## SPRINT 3: DATA EXPORT + ACCOUNT BACKUP

### 3A. Export endpoint

I `server/src/routes/threads.ts`:

```typescript
// GET /threads/export?format=csv — Export all threads as CSV
fastify.get('/threads/export', async (request, reply) => {
  const { format = 'csv' } = request.query as any;

  const threads = await prisma.emailThread.findMany({
    where: { account: { userId: request.userId, isActive: true } },
    include: {
      messages: { take: 1, orderBy: { date: 'desc' } },
      aiAnalysis: true,
    },
    orderBy: { lastMessageAt: 'desc' },
  });

  if (format === 'csv') {
    const header = 'ID,Subject,From,Date,Priority,Classification,Labels,Read,Archived,Trashed\n';
    const rows = threads.map(t => [
      t.id,
      `"${(t.subject || '').replace(/"/g, '""')}"`,
      `"${t.senderEmail || ''}"`,
      t.lastMessageAt?.toISOString() || '',
      t.priority || '',
      t.aiAnalysis?.classification || '',
      `"${(t.labels || []).join(', ')}"`,
      t.isRead ? 'yes' : 'no',
      t.isArchived ? 'yes' : 'no',
      t.isTrashed ? 'yes' : 'no',
    ].join(','));

    reply
      .header('Content-Type', 'text/csv')
      .header('Content-Disposition', 'attachment; filename="cdp-hub-export.csv"')
      .send(header + rows.join('\n'));
  } else if (format === 'json') {
    reply
      .header('Content-Type', 'application/json')
      .header('Content-Disposition', 'attachment; filename="cdp-hub-export.json"')
      .send(JSON.stringify(threads, null, 2));
  }
});
```

### 3B. Brain Core export

```typescript
// GET /brain-core/export — Export all brain core data (writing modes, contacts, rules, learning)
fastify.get('/brain-core/export', async (request, reply) => {
  const [writingModes, contacts, rules, learningEvents, voiceAttrs] = await Promise.all([
    prisma.writingMode.findMany({ where: { userId: request.userId } }),
    prisma.contactProfile.findMany({ where: { userId: request.userId } }),
    prisma.classificationRule.findMany({ where: { userId: request.userId } }),
    prisma.learningEvent.findMany({ where: { userId: request.userId }, take: 500, orderBy: { createdAt: 'desc' } }),
    prisma.voiceAttribute.findMany({ where: { userId: request.userId } }),
  ]);

  reply
    .header('Content-Type', 'application/json')
    .header('Content-Disposition', 'attachment; filename="cdp-hub-brain-export.json"')
    .send(JSON.stringify({ writingModes, contacts, rules, learningEvents, voiceAttrs }, null, 2));
});
```

### 3C. Frontend — export-knappar i settings

I `client/app/settings/page.tsx`, lägg till en "Data"-sektion:

```tsx
<section>
  <h2>Data & Backup</h2>
  <div className="space-y-3">
    <button onClick={() => downloadExport('csv')}>
      <Download size={16} /> Exportera mail (CSV)
    </button>
    <button onClick={() => downloadExport('json')}>
      <Download size={16} /> Exportera mail (JSON)
    </button>
    <button onClick={() => downloadBrainExport()}>
      <Brain size={16} /> Exportera Brain Core
    </button>
  </div>
</section>
```

```typescript
function downloadExport(format: string) {
  window.open(`/api/v1/threads/export?format=${format}`, '_blank');
}
function downloadBrainExport() {
  window.open('/api/v1/brain-core/export', '_blank');
}
```

### COMMIT: `feat: data export — CSV/JSON thread export + brain core backup`

---

## SPRINT 4: KEYBOARD POWER USER + QUICK ACTIONS

### 4A. Vim-style keyboard nav i inbox

Utöka befintlig j/k-navigation med fler kommandon:

```typescript
const INBOX_SHORTCUTS: Record<string, () => void> = {
  'j': () => moveFocus(1),        // Nästa tråd
  'k': () => moveFocus(-1),       // Föregående tråd
  'o': () => openFocused(),       // Öppna fokuserad tråd (Enter)
  'e': () => archiveFocused(),    // Arkivera
  '#': () => trashFocused(),      // Trash
  's': () => starFocused(),       // Stjärnmärk
  'x': () => selectFocused(),     // Markera/avmarkera
  'u': () => markUnreadFocused(), // Markera oläst
  'r': () => replyFocused(),      // Svara (gå till tråd + fokus reply)
  '/': () => focusSearch(),       // Fokusera sökfältet
  '?': () => showShortcuts(),     // Visa genvägar
};

useEffect(() => {
  function handleKeydown(e: KeyboardEvent) {
    // Ignorera om i input/textarea
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    // Ignorera modifier-keys (Cmd, Ctrl) — dessa hanteras av GlobalShortcuts
    if (e.metaKey || e.ctrlKey) return;

    const handler = INBOX_SHORTCUTS[e.key];
    if (handler) {
      e.preventDefault();
      handler();
    }
  }
  window.addEventListener('keydown', handleKeydown);
  return () => window.removeEventListener('keydown', handleKeydown);
}, [focusedIndex, filteredThreads]);
```

### 4B. Visuell fokus-indikator

Den fokuserade tråden ska ha en tydlig visuell markering:
```tsx
className={`... ${index === focusedIndex ? 'ring-2 ring-violet-500 ring-inset bg-violet-50/50 dark:bg-violet-900/20' : ''}`}
```

### 4C. Command palette förbättring

I `client/components/ChatWidget.tsx`, lägg till snabbkommandon som matchar:

```typescript
const COMMAND_PALETTE_ACTIONS = [
  { label: 'Ny mail', shortcut: '⌘N', action: () => router.push('/compose') },
  { label: 'Sök', shortcut: '/', action: () => router.push('/search') },
  { label: 'Inkorg', shortcut: '⌘⇧M', action: () => router.push('/inbox') },
  { label: 'Utkast', shortcut: '⌘⇧D', action: () => router.push('/drafts') },
  { label: 'Kontakter', shortcut: '', action: () => router.push('/contacts') },
  { label: 'Inställningar', shortcut: '', action: () => router.push('/settings') },
  { label: 'Exportera data', shortcut: '', action: () => downloadExport('csv') },
  { label: 'Mörkt läge', shortcut: '', action: () => toggleDarkMode() },
  { label: 'Synca mail', shortcut: '', action: () => triggerSync() },
];
```

Om användaren skriver i chatten och texten matchar ett action-namn, visa det som förslag innan det skickas till AI.

### 4D. Uppdatera ShortcutsHelpModal

Lägg till alla nya shortcuts (e, #, s, x, u, o, ?) i modalen.

### COMMIT: `feat: keyboard power user — vim-style inbox nav, visual focus, command palette actions`

---

## SPRINT 5: NOTIFICATION DIGEST + QUIET HOURS

### 5A. Quiet hours

Lägg till i UserSettings:
```prisma
quietHoursStart  Int?     @default(22) @map("quiet_hours_start")  // 22:00
quietHoursEnd    Int?     @default(7)  @map("quiet_hours_end")    // 07:00
digestEnabled    Boolean  @default(false) @map("digest_enabled")
digestTime       Int?     @default(8)  @map("digest_time")        // 08:00
```

### 5B. Quiet hours — backend

I `server/src/services/push.service.ts`:

```typescript
export async function sendPushToUser(userId: string, payload: PushPayload) {
  // Check quiet hours
  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  if (settings?.quietHoursStart != null && settings?.quietHoursEnd != null) {
    const hour = new Date().getHours();
    const start = settings.quietHoursStart;
    const end = settings.quietHoursEnd;

    const isQuiet = start > end
      ? (hour >= start || hour < end)   // e.g., 22-07
      : (hour >= start && hour < end);  // e.g., 01-06

    if (isQuiet) {
      // Queue for digest instead of sending immediately
      await prisma.actionLog.create({
        data: {
          userId,
          actionType: 'notification_queued',
          targetType: 'push',
          description: JSON.stringify(payload),
        },
      });
      return; // Don't send push
    }
  }

  // ... existing send logic ...
}
```

### 5C. Digest — morgon-sammanfattning av missade notiser

I sync-scheduler, vid `digestTime`:

```typescript
async function sendDigest(userId: string): Promise<void> {
  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  if (!settings?.digestEnabled) return;

  // Get queued notifications since last digest
  const queued = await prisma.actionLog.findMany({
    where: {
      userId,
      actionType: 'notification_queued',
      createdAt: { gte: subHours(new Date(), 24) },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (queued.length === 0) return;

  const summary = queued.length === 1
    ? JSON.parse(queued[0].description!).body
    : `Du har ${queued.length} notiser sedan igår kväll`;

  await sendPushToUser(userId, {
    title: '📬 Morgondigest',
    body: summary,
    url: '/notifications',
  });

  // Mark as delivered
  await prisma.actionLog.updateMany({
    where: { id: { in: queued.map(q => q.id) } },
    data: { metadata: { delivered: true } },
  });
}
```

### 5D. Frontend — quiet hours UI

I `client/app/settings/page.tsx`:

```tsx
<section>
  <h2>Notiser</h2>
  <div>
    <label>Tysta timmar</label>
    <div className="flex gap-2 items-center">
      <select value={quietStart} onChange={...}>
        {/* 00-23 */}
      </select>
      <span>till</span>
      <select value={quietEnd} onChange={...}>
        {/* 00-23 */}
      </select>
    </div>
  </div>
  <div>
    <label>
      <input type="checkbox" checked={digestEnabled} onChange={...} />
      Morgondigest — samla notiser och skicka vid
      <select value={digestTime}>...</select>
    </label>
  </div>
</section>
```

### COMMIT: `feat: notification digest + quiet hours — queued notifications, morning digest, settings UI`

---

## SPRINT 6: INTEGRATION TESTING + BUILD VERIFICATION

### 6A. Server integration tests

Skapa `server/src/__tests__/integration/`:

**`thread-lifecycle.test.ts`**:
```typescript
// Test full lifecycle: create thread → classify → star → snooze → unsnooze → archive → restore → trash → restore
// Verify each state transition and that the correct status is returned
```

**`draft-lifecycle.test.ts`**:
```typescript
// Test: create draft → edit → approve → schedule → cancel schedule → approve again → send
// Verify draft status at each step
// Verify that unapproved drafts can't be sent
```

**`auth-flow.test.ts`**:
```typescript
// Test: JWT creation → JWT validation → JWT refresh → expired JWT rejection
// Test: re-auth flow marks account active again
```

**`export.test.ts`**:
```typescript
// Test: CSV export returns valid CSV with headers
// Test: JSON export returns valid JSON array
// Test: brain-core export includes all data types
```

### 6B. Client component tests

Skapa `client/__tests__/`:

**`theme-provider.test.tsx`**:
```typescript
// Test: default theme is 'system'
// Test: setTheme('dark') adds class to html
// Test: setTheme('light') removes class from html
```

**`undo-action.test.tsx`**:
```typescript
// Test: action executes immediately
// Test: toast shows with undo button
// Test: undo callback fires on click
```

**`inbox-keyboard.test.tsx`**:
```typescript
// Test: j key moves focus down
// Test: k key moves focus up
// Test: Enter opens focused thread
// Test: keys are ignored when input is focused
```

### 6C. Run all tests and fix failures

```bash
cd server && npx vitest run
cd client && npx vitest run
```

Fix ANY failures before committing.

### 6D. TypeScript strict check

Kör med extra strictness:
```bash
cd client && npx tsc --noEmit --strict 2>&1 | head -50
cd server && npx tsc --noEmit --strict 2>&1 | head -50
```

Notera errors men fixa bara de som är low-hanging fruit (missing null checks, etc.). Logga resten som TODO-kommentarer.

### COMMIT: `feat: integration tests + build verification — lifecycle tests, component tests, TS audit`

---

## SPRINT 7: DEPLOY VERIFICATION + PRODUCTION READINESS

### 7A. Production build test

Verifiera att BÅDA bygger:
```bash
cd client && npm run build
cd server && npm run build
```

Fix alla build errors.

### 7B. Migration baseline verification

Se till att `prisma migrate deploy` fungerar från scratch:
```bash
cd server && npx prisma migrate status
```

Om migrations är ur synk, skapa en ny baseline.

### 7C. Environment documentation

Uppdatera `server/.env.example` med ALLA env vars som behövs, grupperade:

```env
# ═══ REQUIRED ═══════════════════════════════════════
DATABASE_URL=
JWT_SECRET=
ENCRYPTION_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
FRONTEND_URL=

# ═══ AI PROVIDERS (minst en krävs) ═════════════════
GROQ_API_KEY=
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
AI_PROVIDER=groq

# ═══ PUSH NOTIFICATIONS (valfritt) ═════════════════
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:jesper.melin89@gmail.com

# ═══ AGENT API (valfritt) ══════════════════════════
COMMAND_API_KEY=
```

### 7D. Render.yaml final check

Verifiera att render.yaml inkluderar ALLA env vars som server behöver.

### 7E. README final update

Uppdatera README.md med:
- Feature-lista: alla 30+ features med kort beskrivning
- Keyboard shortcuts tabell
- Amanda capabilities
- Architecture diagram (text)
- Deploy guide: steg-för-steg Render + Vercel
- Environment variables reference

### 7F. CHANGELOG

Skapa `CHANGELOG.md` med alla commits grupperade per sprint/tema:
- v0.1: Core (auth, sync, inbox, threads, drafts)
- v0.2: AI (classification, brain core, chat)
- v0.3: UX (dark mode, PWA, swipe, keyboard)
- v0.4: Advanced (push, snooze, labels, contacts)
- v0.5: Production (security, performance, export)
- v1.0: Launch ready (this release)

### COMMIT: `feat: production ready — build verification, migration, env docs, README, changelog`

---

## SAMMANFATTNING — 7 sprints, 7 commits:

1. `feat: conversation UX — message collapse, quoted text folding, thread summary`
2. `feat: spam + unsubscribe — report spam, block sender, List-Unsubscribe header support`
3. `feat: data export — CSV/JSON thread export + brain core backup`
4. `feat: keyboard power user — vim-style inbox nav, visual focus, command palette actions`
5. `feat: notification digest + quiet hours — queued notifications, morning digest, settings UI`
6. `feat: integration tests + build verification — lifecycle tests, component tests, TS audit`
7. `feat: production ready — build verification, migration, env docs, README, changelog`

## ORDNING

Sprint 1-5 är oberoende och kan göras i valfri ordning.
Sprint 6 (tests) bör göras efter sprint 1-5.
Sprint 7 (deploy) ska vara sist.

## POST-BUILD CHECKLIST

Efter att alla sprints är klara, verifiera:
- [ ] `npx tsc --noEmit` — noll errors i BÅDA
- [ ] `npm run build` — lyckas i BÅDA
- [ ] `npx vitest run` — alla tester gröna i BÅDA
- [ ] Playwright E2E — `npx playwright test` grönt
- [ ] Inga nakna console.* i client prod-kod
- [ ] README.md uppdaterad med alla features
- [ ] CHANGELOG.md skapad
- [ ] .env.example komplett
- [ ] render.yaml komplett
