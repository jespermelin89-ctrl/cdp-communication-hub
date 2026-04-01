# CDP Communication Hub — Build Specification 4: V1.1 Intelligence & Power Features

> v1.0.0 shipped. 142 commits, ~30k LOC, 16 sidor, 30 komponenter, 16 routes, 15 services, 30 tester.
> Noll TypeScript-errors. v1.0.0 taggad.
> Denna spec bygger v1.1 — gör appen SMARTARE och mer kraftfull för daglig användning.

---

## PRINCIPER

- `npx tsc --noEmit` i client OCH server innan varje commit — NOLL errors
- Push till main efter varje commit
- ALLA UI-texter SVENSKA med i18n-nycklar (sv, en, es, ru)
- Lucide-ikoner
- Tailwind + `dark:` på ALLT
- ALDRIG auto-send email, ALDRIG auto-delete
- Inga nakna `console.*` i client prod-kod
- Om Prisma-schema ändras: `npx prisma db push`
- Varje sprint = 1 commit

---

## SPRINT 1: FOLLOW-UP REMINDERS — Awaiting Reply Tracking

### Problem
Schema har `awaitingReply` på DailySummary men ingen feature trackar vilka mail man väntar svar på.

### 1A. Schema — FollowUpReminder

```prisma
model FollowUpReminder {
  id          String      @id @default(cuid())
  userId      String      @map("user_id")
  threadId    String      @map("thread_id")
  thread      EmailThread @relation(fields: [threadId], references: [id], onDelete: Cascade)
  remindAt    DateTime    @map("remind_at")
  reason      String?     // "awaiting_reply" | "follow_up" | "custom"
  note        String?
  isCompleted Boolean     @default(false) @map("is_completed")
  createdAt   DateTime    @default(now()) @map("created_at")

  @@map("follow_up_reminders")
}
```

Lägg till relation i EmailThread: `followUpReminders FollowUpReminder[]`

### 1B. Auto-detect awaiting reply

I `server/src/services/sync-scheduler.service.ts`, ny funktion:

- Hitta trådar där SISTA meddelandet skickades AV ANVÄNDAREN
- Och det var > 48 timmar sedan
- Och ingen FollowUpReminder redan finns
- → Skapa automatisk reminder med `reason: 'awaiting_reply'`

Kör i sync-loopen, efter autoTriageNewThreads.

### 1C. Backend routes

```
GET    /follow-ups                    — Lista aktiva reminders (isCompleted: false)
POST   /threads/:id/follow-up         — Skapa manuell reminder { remind_at, note }
PATCH  /follow-ups/:id/complete        — Markera som klar
DELETE /follow-ups/:id                 — Ta bort
```

### 1D. Frontend — Dashboard-widget

I `client/app/page.tsx`, ny "Väntar svar"-sektion med klickbara trådar, tid sedan senaste meddelande, och markera-klar-knapp.

### 1E. Thread detail — follow-up knapp

Lägg till i action-menyn: "Följ upp" med tidvals-dropdown (24h, 3d, 1v, custom).

### 1F. Push notification

I sync-scheduler: om reminder.remindAt har passerats → skicka push "⏰ Inget svar på: [subject]" + markera som levererad.

### 1G. Amanda chat — follow-up intent

Regex: `/följ upp|follow.?up|väntar svar|awaiting/i` → lista aktiva follow-ups.

### COMMIT: `feat: follow-up reminders — awaiting reply detection, manual reminders, push alerts`

---

## SPRINT 2: RICH TEXT COMPOSE (HTML Email)

### Problem
Alla utgående mail är plain text. De flesta mail-klienter skickar HTML.

### 2A. Installera Tiptap

```bash
cd client && npm install @tiptap/react @tiptap/starter-kit @tiptap/extension-link @tiptap/extension-placeholder @tiptap/extension-underline
```

### 2B. RichTextEditor komponent

Skapa `client/components/RichTextEditor.tsx`:

- Tiptap editor med StarterKit + Link + Underline + Placeholder
- Toolbar: Bold, Italic, Underline | BulletList, OrderedList | Link, Blockquote
- Tailwind prose-styling, dark mode support
- `onChange` callback med HTML-output

### 2C. Compose — toggle plain/rich

I compose: state `editorMode: 'plain' | 'rich'`, default `'rich'`.
Toggle-knapp i toolbar. Rich → RichTextEditor. Plain → textarea.

### 2D. Backend — skicka HTML

I Gmail sendEmail: om `bodyHtml` finns, bygg `multipart/alternative` med text/plain + text/html.
I SMTP sendEmail: samma approach via nodemailer `html` field.

### 2E. Draft schema

Lägg till: `bodyHtml String? @map("body_html")` i Draft-modellen.
Uppdatera draft-routes att acceptera `body_html`.

### 2F. Reply — citera som HTML blockquote

Vid svar på HTML-mail, inkludera original som `<blockquote>` med datum och avsändare.

### COMMIT: `feat: rich text compose — Tiptap editor, HTML email send, plain/rich toggle`

---

## SPRINT 3: EMAIL TEMPLATES

### Problem
Quick-templates finns men man kan inte spara egna mallar.

### 3A. Schema

```prisma
model EmailTemplate {
  id         String   @id @default(cuid())
  userId     String   @map("user_id")
  name       String
  subject    String?
  bodyText   String?  @map("body_text")
  bodyHtml   String?  @map("body_html")
  category   String?  // "outreach" | "follow-up" | "authority" | "custom"
  variables  Json?    // ["{{namn}}", "{{ärende}}"]
  usageCount Int      @default(0) @map("usage_count")
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  @@map("email_templates")
}
```

### 3B. CRUD routes — `server/src/routes/templates.ts`

```
GET    /templates              — Lista (sorterat på usageCount desc)
POST   /templates              — Skapa
PATCH  /templates/:id          — Uppdatera
DELETE /templates/:id          — Ta bort
POST   /templates/:id/use      — Öka usageCount, returnera med variabler
POST   /templates/generate     — AI genererar mall från instruktion + writing mode
```

### 3C. Compose-integration

Template-panel/dropdown i compose. Klick → fyll i subject + body. "Spara som mall"-knapp.

### 3D. Seed 5 mallar

1. Myndighetsförfrågan (formell sv)
2. Uppföljning ärende (formell sv)
3. Tack och bekräftelse (casual sv)
4. English outreach
5. Kort svar (casual sv)

### COMMIT: `feat: email templates — CRUD, AI generation, compose integration, seed templates`

---

## SPRINT 4: ANALYTICS DASHBOARD

### Problem
Ingen visuell översikt av mail-mönster.

### 4A. Installera Recharts

```bash
cd client && npm install recharts
```

### 4B. Analytics page — `client/app/analytics/page.tsx`

Charts:
1. **Mail-volym** — linjediagram, 30 dagar (mottagna vs skickade per dag)
2. **Klassificering** — donut chart (fördelning per kategori)
3. **Prio-fördelning** — bar chart (high/medium/low)
4. **Top 10 avsändare** — horisontell bar
5. **Amanda-aktivitet** — antal AI-klassificeringar, genererade utkast, learning events

### 4C. Backend — `server/src/routes/analytics.ts`

```
GET /analytics/overview?days=30
```

Returnera: mail per dag, sent per dag, klassificeringsfördelning, top senders, prioritetsfördelning, Amanda-stats.

Använd Prisma `groupBy` + raw queries för aggregeringar.

### 4D. Schema — response time tracking

Lägg till i EmailThread:
```prisma
firstReceivedAt    DateTime? @map("first_received_at")
firstRepliedAt     DateTime? @map("first_replied_at")
responseTimeHours  Float?    @map("response_time_hours")
```

Beräkna vid send: `responseTimeHours = (now - firstReceivedAt) / 3600000`.
Visa genomsnittlig svarstid i analytics.

### 4E. Navigation

Lägg till analytics-länk i settings-sidan och eventuellt i BottomNav (ersätt Activity eller lägg till som submeny).

### COMMIT: `feat: analytics dashboard — recharts, mail volume, response time, top senders`

---

## SPRINT 5: SAVED VIEWS + SMART FILTERS

### Problem
Inbox har filter men man kan inte spara kombinationer.

### 5A. Schema

```prisma
model SavedView {
  id       String   @id @default(cuid())
  userId   String   @map("user_id")
  name     String
  icon     String?
  filters  Json     // { mailbox, priority, classification, labels, accountId, search }
  sortKey  String?  @map("sort_key")
  position Int      @default(0)
  createdAt DateTime @default(now()) @map("created_at")

  @@map("saved_views")
}
```

### 5B. CRUD routes

```
GET    /views              — Lista (sorterat på position)
POST   /views              — Skapa
PATCH  /views/:id          — Uppdatera
DELETE /views/:id          — Ta bort
PATCH  /views/reorder      — Ändra ordning { ids: string[] }
```

### 5C. Frontend — sparade vyer i inbox

Visa som horisontell rad av chips ovanför mailbox-tabs. Klick → applicera alla filter. Aktiv vy highlightad.

"Spara som vy"-knapp synlig när filter är aktiva. Dialog: namn + emoji.

### 5D. Seed default views

```typescript
[
  { name: 'Viktigt', icon: '⚡', filters: { priority: 'high' } },
  { name: 'Oläst', icon: '📬', filters: { mailbox: 'inbox', isRead: false } },
  { name: 'CDP', icon: '🎯', filters: { labels: ['cdp'] } },
  { name: 'Myndigheter', icon: '🏛️', filters: { labels: ['myndighet'] } },
]
```

### COMMIT: `feat: saved views — custom filter combinations, smart presets, reorder`

---

## SPRINT 6: THREAD UX IMPROVEMENTS

### Problem
Thread detail saknar inline reply, per-message forward, och participant-lista.

### 6A. Inline reply per meddelande

Under varje expanderat meddelande: "Svara"-knapp → öppnar inline textarea under just det meddelandet. Svar skapar draft med korrekt `in-reply-to`.

### 6B. Forward specifikt meddelande

"Vidarebefordra"-knapp per meddelande → navigerar till compose med det enskilda meddelandet som body (inte hela tråden).

### 6C. Participant list

Överst i tråden: visa unika deltagare som chips med avatarer. Klickbar → gå till /contacts/:email.

### 6D. Copy message text

Per meddelande: "Kopiera"-knapp → `navigator.clipboard.writeText(msg.body)`. Toast: "Kopierat!"

### 6E. Per-message action menu

Samla alla per-message actions (svara, vidarebefordra, kopiera) i en "..."-dropdown.

### 6F. Exact timestamp tooltip

Hover på relativ tid → visa exakt datum+tid: `2026-04-01 14:23`.

### COMMIT: `feat: thread UX — inline reply, forward message, participants, copy, timestamps`

---

## SPRINT 7: BRAIN CORE INSIGHTS + LEARNING DASHBOARD

### Problem
Brain Core samlar learning events men det finns inget sätt att se vad Amanda har lärt sig.

### 7A. Learning insights endpoint

`GET /brain-core/learning-insights`:

```typescript
{
  totalEvents: number,
  byType: Record<string, number>,        // { draft_approved: 12, classification_override: 3, ... }
  recentEvents: LearningEvent[],          // senaste 20
  patterns: Array<{
    description: string,                  // AI-genererad insikt
    confidence: number,
    basedOn: number,
  }>,
  topContacts: Array<{
    email: string,
    threadCount: number,
    preferredMode: string,
    avgResponseTime: number,
  }>,
}
```

### 7B. Frontend — Learning-tab i brain-core settings

Utöka `client/app/settings/brain-core/page.tsx` med tabs:

**Writing Modes** (befintlig)
**Learning Insights** (ny):
- Totala events per typ
- Senaste 20 events med beskrivningar
- AI-genererade patterns: "Du svarar alltid formellt till @kronofogden.se"
- Trend: learning events per vecka

**Contact Intelligence** (ny):
- Top 10 kontakter efter frekvens
- Per kontakt: preferred mode, senaste kontakt, svarstid
- Klick → alla trådar med kontakten

### 7C. Voice profile test

"Testa"-knapp: skriv en instruktion → AI genererar text i vald writing mode → preview.

### COMMIT: `feat: brain core insights — learning dashboard, contact intelligence, voice test`

---

## SPRINT 8: V1.1 RELEASE

### 8A. Nya tester

- `server/src/__tests__/follow-up.test.ts` — CRUD + auto-detection
- `server/src/__tests__/templates.test.ts` — CRUD + usage count
- `server/src/__tests__/analytics.test.ts` — overview endpoint
- `server/src/__tests__/saved-views.test.ts` — CRUD + reorder
- `client/__tests__/rich-text-editor.test.ts` — render, toolbar

### 8B. Run all tests

```bash
cd server && npx vitest run
cd client && npx vitest run
```

Fix ALLA failures.

### 8C. CHANGELOG

Lägg till v1.1.0 section med alla features.

### 8D. Version bump

```json
"version": "1.1.0"
```

### 8E. Git tag

```bash
git tag -a v1.1.0 -m "v1.1.0 — Intelligence & Power Features"
```

### COMMIT: `chore: v1.1.0 release — follow-ups, rich text, templates, analytics, saved views, thread UX, brain insights`

---

## SAMMANFATTNING — 8 sprints, 8 commits:

1. `feat: follow-up reminders — awaiting reply detection, manual reminders, push alerts`
2. `feat: rich text compose — Tiptap editor, HTML email send, plain/rich toggle`
3. `feat: email templates — CRUD, AI generation, compose integration, seed templates`
4. `feat: analytics dashboard — recharts, mail volume, response time, top senders`
5. `feat: saved views — custom filter combinations, smart presets, reorder`
6. `feat: thread UX — inline reply, forward message, participants, copy, timestamps`
7. `feat: brain core insights — learning dashboard, contact intelligence, voice test`
8. `chore: v1.1.0 release — tests, changelog, version bump`

## ORDNING

Sprint 1-7 är alla oberoende — kör i angiven ordning.
Sprint 8 (release) ska vara SIST.
