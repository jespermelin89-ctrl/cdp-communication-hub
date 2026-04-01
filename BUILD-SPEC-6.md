# CDP Communication Hub — Build Specification 6: V1.3 Communication Flow

> v1.2.0 shipped. 151 commits, ~32k LOC, 20 sidor, 489 tester (395 server + 94 client).
> Noll TypeScript-errors. v1.2.0 taggad.
> Denna spec bygger v1.3 — gör läs/svar/navigeringsflödet till en riktig daglig mailklient.

---

## PRINCIPER

- `npx tsc --noEmit` i client OCH server innan varje commit — NOLL errors
- ALLA UI-texter SVENSKA med i18n-nycklar (sv, en, es, ru)
- Lucide-ikoner
- Tailwind + `dark:` på ALLT
- ALDRIG auto-send email, ALDRIG auto-delete
- Inga nakna `console.*` i client prod-kod
- Om Prisma-schema ändras: `npx prisma db push`
- Varje sprint = 1 commit

---

## SPRINT 1: THREAD VIEW OVERHAUL — HTML RENDERING + QUOTED TEXT COLLAPSE

### Problem
Tråd-vyn visar rå text. HTML-mail renderas inte. Citerad text tar upp hela skärmen.

### 1A. HTML email rendering

I `client/app/threads/[id]/page.tsx`:

- Om `message.bodyHtml` finns: rendera i sandboxad `<iframe srcDoc={sanitizedHtml}>` med auto-height
- Sanitera HTML med DOMPurify (installera: `npm install dompurify @types/dompurify`)
  - Tillåt: vanliga HTML-taggar, inline styles, bilder (men lazy-load med `loading="lazy"`)
  - Strip: `<script>`, `<form>`, `<object>`, `<embed>`, event handlers
- Om bara `bodyText`: rendera med `whitespace-pre-wrap` som nu
- Iframe ska ärva dark mode: inject `<style>body { color-scheme: light dark; background: transparent; }</style>`
- Auto-resize iframe höjd baserat på content (`postMessage` från iframe eller `ResizeObserver`)

### 1B. Quoted text collapse

Implementera quoted text detection och collapse:

- Detektera quoted text patterns:
  - `On {date}, {name} wrote:` (engelska)
  - `Den {datum} skrev {namn}:` (svenska)
  - `>` prefix (standard quote)
  - `---------- Forwarded message ----------`
  - Gmail `<div class="gmail_quote">`
- Default: dölj citerad text, visa `"··· Visa citerad text"` klickbar länk
- Klick → expandera med smooth animation (max-height transition)
- Spara collapse-state per meddelande i sessionStorage

### 1C. Message grouping

- Om flera meddelanden i tråden: visa som collapsed accordion
  - Senaste meddelandet expanderat
  - Äldre meddelanden collapsed: visa avsändare + datum + first line preview
  - Klick → expandera
- Visa "3 äldre meddelanden" summary badge

### 1D. Message header polish

Per meddelande:
- Avatar (initialer med färg baserat på namn-hash)
- Avsändare (bold) + email (grå, klickbar → copy)
- Datum: relative ("2 timmar sedan") + hover tooltip med exakt datum
- To/CC som expanderbar lista (visa 2 + "+3 fler")
- Reply/Forward/More knappar inline i headern

### COMMIT: `feat: thread view overhaul — HTML rendering, quoted text collapse, message accordion, header polish`

---

## SPRINT 2: INLINE REPLY & FORWARD

### Problem
Man måste navigera till /compose för att svara. Inget inline-svar i trådvyn.

### 2A. Inline reply box

I thread detail, under sista meddelandet:

- Compact reply box: avatar + "Skriv ett svar..." placeholder
- Klick → expanderar till full reply editor:
  - To-fält (pre-filled med avsändaren, editerbart med ContactAutocomplete)
  - CC/BCC toggle
  - Body textarea (auto-focus)
  - Signatur auto-insert (enligt konto-inställning)
  - Toolbar: **B** *I* attach, discard
  - "Svara" / "Svara alla" toggle-knappar
  - "Skicka som utkast" + "Godkänn & Skicka" knappar
- Escape → collapse tillbaka till compact

### 2B. Reply types

Tre lägen, switchbara med knappar:
- **Svara** (Reply): to = original sender
- **Svara alla** (Reply All): to = original sender, cc = alla andra mottagare (minus dig själv)
- **Vidarebefordra** (Forward): to = tomt, body = quoted original message med "---------- Vidarebefordrat meddelande ----------" header

### 2C. Backend — reply/forward support

I `POST /drafts`:
- Nytt fält: `replyToMessageId: string?` och `forwardFromMessageId: string?`
- Om replyTo: sätt `In-Reply-To` och `References` headers vid send (för Gmail threading)
- Om forward: kopiera attachments från original-meddelandet till det nya utkastet
- Gmail API: använd `threadId` vid send för att hålla tråden ihop

### 2D. Quick reply suggestions

- Om Brain Core har learning data för kontakten → visa 2-3 snabb-svar suggestions ovanför reply box
- Chips: "Tack, jag återkommer", "Noterat!", "Vidarebefordrar till rätt person"
- Klick → populera reply body
- AI-genererade baserat på trådinnehåll om > 5 learning events finns

### COMMIT: `feat: inline reply & forward — reply box in thread, reply/reply-all/forward, quick suggestions`

---

## SPRINT 3: KEYBOARD SHORTCUTS SYSTEM

### Problem
Bara ett fåtal shortcuts finns. Ingen help overlay. Ingen vim-style navigation.

### 3A. Shortcut engine

`client/lib/keyboard-shortcuts.ts`:

- Global event listener på `keydown`
- Context-aware: shortcuts ändras baserat på aktiv vy (inbox, thread, compose, global)
- Ignore om focus är i input/textarea/contenteditable
- Registrera shortcuts som map: `{ key: string, ctrl?: boolean, shift?: boolean, action: () => void, description: string, context: string }`
- Debounce multi-key combos (t.ex. `g` sedan `i` inom 500ms = go to inbox)

### 3B. Global shortcuts

| Tangent | Aktion |
|---------|--------|
| `?` | Visa/dölj shortcut help overlay |
| `g i` | Gå till inbox |
| `g d` | Gå till drafts |
| `g s` | Gå till search |
| `g c` | Gå till compose |
| `g t` | Gå till settings |
| `/` | Fokusera sökfältet |
| `c` | Ny compose |
| `Esc` | Stäng modal/overlay/deselect |

### 3C. Inbox shortcuts

| Tangent | Aktion |
|---------|--------|
| `j` / `k` | Nästa / föregående tråd |
| `Enter` / `o` | Öppna markerad tråd |
| `x` | Toggle select |
| `e` | Arkivera (selected) |
| `#` | Trash (selected) |
| `!` | Markera som spam |
| `Shift+I` | Markera läst |
| `Shift+U` | Markera oläst |
| `l` | Label picker |
| `v` | Flytta till... |
| `s` | Star/unstar |

### 3D. Thread shortcuts

| Tangent | Aktion |
|---------|--------|
| `r` | Reply |
| `a` | Reply all |
| `f` | Forward |
| `e` | Arkivera och tillbaka |
| `j` / `k` | Nästa / föregående meddelande i tråd |
| `n` / `p` | Nästa / föregående tråd |
| `u` | Tillbaka till inbox |

### 3E. Help overlay

`client/components/KeyboardShortcutsHelp.tsx`:

- Modal overlay med alla shortcuts grupperade per kontext
- Trigger: `?` tangent
- Sökbart: filter-input för att hitta shortcuts
- Visa tangenter som styled `<kbd>` element

### 3F. i18n

Shortcut-beskrivningar i alla 4 språk.

### COMMIT: `feat: keyboard shortcuts — vim-style navigation, help overlay, context-aware shortcuts`

---

## SPRINT 4: REAL-TIME INBOX UPDATES (SSE)

### Problem
Inbox uppdateras bara via manuell refresh eller polling. Inga live updates.

### 4A. Backend — SSE endpoint

`server/src/routes/events.ts`:

```
GET /events/stream
```

- Server-Sent Events (SSE) endpoint
- Auth via JWT query param: `/events/stream?token={jwt}`
- Heartbeat: skicka `:keepalive\n\n` var 30:e sekund
- Event types:
  - `thread:new` — ny tråd synkad (med thread metadata)
  - `thread:updated` — tråd uppdaterad (read status, labels, priority)
  - `draft:status` — draft status ändring
  - `sync:complete` — sync-cykel klar (med stats)
  - `notification` — push notification equivalent
- Hantera connection cleanup vid disconnect
- Max 50 connections per user (förhindra läckor)

### 4B. Emit events från sync

I `sync-scheduler.service.ts`:

- Emittera `thread:new` för varje ny tråd som synkas
- Emittera `thread:updated` vid classification/priority-ändringar
- Emittera `sync:complete` efter varje sync-cykel
- Använd Fastify plugin pattern eller en EventEmitter singleton

### 4C. Frontend — SSE hook

`client/hooks/use-event-stream.ts`:

- `useEventStream()` hook
- Auto-connect vid mount, auto-reconnect vid disconnect (exponentiell backoff: 1s, 2s, 4s, max 30s)
- Parse SSE events och dispatcha till SWR cache (mutate)
- Connection status indicator: grön prick i TopBar = connected, röd = disconnected
- Fallback: om SSE inte stöds → polling var 30s

### 4D. Live inbox integration

I inbox-sidan:
- Ny tråd → prepend till lista med subtle slide-in animation
- Updated tråd → update in-place
- Visa badge: "3 nya mail" klickbar banner ovanför listan (om scrollat ner)
- Sound notification (valfritt, off by default, toggle i settings)

### 4E. Live draft status

I drafts-sidan:
- Draft approved/sent → update status in-place
- Undo send countdown → live update

### COMMIT: `feat: real-time updates — SSE event stream, live inbox, connection indicator, auto-reconnect`

---

## SPRINT 5: SNOOZE UI + QUICK INBOX ACTIONS

### Problem
Snooze-endpoints finns (`POST /threads/:id/snooze`, `DELETE /threads/:id/snooze`) men inget UI. Inbox-rader saknar hover-actions.

### 5A. Snooze picker

`client/components/SnoozePicker.tsx`:

- Dropdown/popover med preset-tider:
  - "Senare idag" (3 timmar)
  - "Imorgon kl 08:00"
  - "Nästa måndag kl 08:00"
  - "Nästa vecka"
  - "Om 1 vecka"
  - "Välj datum & tid..." (datepicker)
- Anropa `POST /threads/:id/snooze { snoozedUntil: ISO8601 }`
- Visa toast: "Snoozad till {datum}"

### 5B. Snooze i thread view

- "Snooze"-knapp (Clock icon) i thread header actions
- Klick → SnoozePicker dropdown
- Om redan snoozad: visa "Snoozad till {datum}" badge + "Avbryt snooze" knapp

### 5C. Snoozed filter i inbox

- Ny filter-tab: "Snoozade" i inbox filter-pills
- Visar trådar där `snoozedUntil > now()`
- Backend: uppdatera `GET /threads` med `?filter=snoozed` parameter
- Sorterade efter snoozedUntil (närmast först)

### 5D. Auto-unsnooze

I sync-scheduler:
- Ny task: var minut, hitta trådar med `snoozedUntil <= now() AND snoozedUntil IS NOT NULL`
- Sätt `snoozedUntil = null` → tråden dyker upp i inbox igen
- Emittera SSE event `thread:unsnoozed`
- Om push notifications är aktiva: skicka "Påminnelse: {subject}"

### 5E. Inbox hover actions

I trådlistan, hover på en rad → visa action-ikoner (float right):
- Archive (Archive icon)
- Trash (Trash2 icon)
- Snooze (Clock icon) → SnoozePicker
- Mark read/unread (Mail/MailOpen icon)

Visa bara på hover (desktop) eller swipe (mobil).
Mobil: swipe left → archive, swipe right → snooze (med colored background reveal).

### 5F. Swipe gestures (mobil)

`client/hooks/use-swipe.ts`:

- Touch event handling: `touchstart`, `touchmove`, `touchend`
- Threshold: 80px horizontal drag
- Swipe left: röd bakgrund + Trash ikon → trash
- Swipe right: blå bakgrund + Clock ikon → snooze (preset: imorgon 08:00)
- Haptic feedback: `navigator.vibrate(30)`

### COMMIT: `feat: snooze UI + quick actions — snooze picker, hover actions, swipe gestures, auto-unsnooze`

---

## SPRINT 6: PERFORMANCE & VIRTUAL SCROLLING

### Problem
Inbox laddar alla trådar på en gång. Blir trögt med 100+ trådar. Ingen pagination.

### 6A. Backend — cursor pagination

Uppdatera `GET /threads`:
- Parametrar: `cursor?: string` (threadId), `limit?: number` (default 25, max 50)
- Response: `{ threads: Thread[], nextCursor: string | null, hasMore: boolean, totalCount: number }`
- Cursor = senaste trådens `lastMessageAt` + `id` (composite cursor för stabil sortering)
- Alla filter (classification, priority, account, labels, search) funkar med cursor

### 6B. Frontend — infinite scroll

`client/hooks/use-infinite-threads.ts`:

- Baserat på SWR infinite: `useSWRInfinite`
- Ladda nästa sida när scroll når 200px från botten (`IntersectionObserver`)
- Visa "Laddar fler..." spinner vid botten
- Cache per filter-kombination
- Optimistic updates: arkivera/trash → ta bort ur listan direkt utan refetch

### 6C. Virtual list rendering

`client/components/VirtualThreadList.tsx`:

- Rendera bara synliga rader + buffer (20 items)
- Estimated row height: 72px (compact), 96px (expanded)
- Dynamic height: mät faktisk höjd efter render
- Scroll position restore vid tillbaka-navigation (spara i sessionStorage)
- Implementera med CSS `transform: translateY` och absolut positionering

### 6D. Optimistic mutations

I alla inbox-actions:
- Archive: ta bort ur lista omedelbart, SWR revalidate i bakgrunden
- Trash: samma
- Read/Unread: toggle omedelbart
- Label: applicera omedelbart
- Om backend returnerar error → rollback + visa toast med felmeddelande

### 6E. Image lazy loading

I thread view:
- Alla `<img>` i email HTML: `loading="lazy"` + `decoding="async"`
- Placeholder skeleton tills bild laddas
- External image blocking toggle (default: blockera, visa "Visa bilder" knapp per meddelande)

### 6F. Bundle analysis & splitting

- Kör `npx next-bundle-analyzer` (redan installerat)
- Code split: dynamic import för:
  - SnoozePicker
  - KeyboardShortcutsHelp
  - ImageLightbox
  - ContactAutocomplete (lazy i compose)
- Target: < 200kb first load JS

### COMMIT: `feat: performance — cursor pagination, infinite scroll, virtual list, optimistic updates, lazy loading`

---

## SPRINT 7: SETTINGS CONSOLIDATION + ONBOARDING

### Problem
Settings är spridda över flera sidor utan struktur. Ingen onboarding för nya användare.

### 7A. Unified settings page

Refaktorera `client/app/settings/page.tsx` till en sidebar-layout:

- Vänster sidebar med sections:
  - Allmänt (språk, tema, undo send delay)
  - Konton (lista + lägg till + signatur per konto)
  - Etiketter (label management)
  - Brain Core (writing modes, voice attributes, classification rules)
  - Mallar (email templates)
  - Tangentbordsgenvägar (shortcut customization)
  - Notifikationer (push settings, quiet hours, sound)
  - Data & export (export, import)
- Klick på section → visa content i höger panel
- Mobil: full-width sektioner med tillbaka-knapp
- Highlight aktiv section i sidebar

### 7B. Onboarding wizard

`client/components/OnboardingWizard.tsx`:

Visas vid första login (check `UserSettings.hasCompletedOnboarding`):

Steg 1: "Välkommen till CDP Mail" — kort intro
Steg 2: "Anslut ditt konto" — Google OAuth-knapp (redan finns)
Steg 3: "Dina preferenser" — språk, tema, undo send delay
Steg 4: "Notifikationer" — push permission prompt
Steg 5: "Klart!" — redirect till dashboard

- Progress bar överst
- Skippa-knapp (sätter hasCompletedOnboarding = true)
- Stepper-navigering framåt/bakåt

### 7C. Schema

Lägg till i UserSettings:
```prisma
hasCompletedOnboarding Boolean @default(false) @map("has_completed_onboarding")
notificationSound     Boolean @default(false) @map("notification_sound")
externalImages        String  @default("ask") @map("external_images") // "always" | "never" | "ask"
compactMode           Boolean @default(false) @map("compact_mode")
```

### 7D. Compact mode

Toggle i settings:
- On: inbox rows 56px height, smaller text, tighter padding
- Off: inbox rows 80px height (current)
- Apply class `compact` on body → CSS variables for spacing

### 7E. i18n

Alla onboarding-texter + settings-labels i 4 språk.

### COMMIT: `feat: settings consolidation + onboarding — unified settings, wizard, compact mode, preferences`

---

## SPRINT 8: V1.3 RELEASE

### 8A. Nya tester

- `server/src/__tests__/sse-events.test.ts` — SSE connection, heartbeat, event dispatch
- `server/src/__tests__/cursor-pagination.test.ts` — cursor logic, filters with cursor, edge cases
- `server/src/__tests__/snooze.test.ts` — snooze/unsnooze, auto-unsnooze, snoozed filter
- `server/src/__tests__/reply-forward.test.ts` — reply draft creation, In-Reply-To header, forward with attachments
- `client/src/__tests__/keyboard-shortcuts.test.ts` — shortcut registration, context switching, input ignore
- `client/src/__tests__/virtual-list.test.ts` — render window, scroll position, dynamic height
- `client/src/__tests__/onboarding.test.ts` — wizard steps, skip, completion flag

### 8B. Run all tests

```bash
cd server && npx vitest run
cd client && npx vitest run
```

Fix ALLA failures.

### 8C. TypeScript verification

```bash
cd server && npx tsc --noEmit
cd client && npx tsc --noEmit
cd server && npm run build
cd client && npm run build
```

NOLL errors.

### 8D. CHANGELOG

Lägg till v1.3.0 section:
- Thread view overhaul (HTML rendering, quoted text collapse)
- Inline reply & forward
- Keyboard shortcuts system
- Real-time SSE updates
- Snooze UI + quick inbox actions
- Performance (cursor pagination, infinite scroll, virtual list)
- Settings consolidation + onboarding

### 8E. Version bump

```json
"version": "1.3.0"
```

I BÅDE `client/package.json` och `server/package.json`.

### 8F. Git tag

```bash
git tag -a v1.3.0 -m "v1.3.0 — Communication Flow"
```

### COMMIT: `chore: v1.3.0 release — tests, changelog, version bump`

---

## SAMMANFATTNING — 8 sprints, 8 commits:

1. `feat: thread view overhaul — HTML rendering, quoted text collapse, message accordion, header polish`
2. `feat: inline reply & forward — reply box in thread, reply/reply-all/forward, quick suggestions`
3. `feat: keyboard shortcuts — vim-style navigation, help overlay, context-aware shortcuts`
4. `feat: real-time updates — SSE event stream, live inbox, connection indicator, auto-reconnect`
5. `feat: snooze UI + quick actions — snooze picker, hover actions, swipe gestures, auto-unsnooze`
6. `feat: performance — cursor pagination, infinite scroll, virtual list, optimistic updates, lazy loading`
7. `feat: settings consolidation + onboarding — unified settings, wizard, compact mode, preferences`
8. `chore: v1.3.0 release — tests, changelog, version bump`

## ORDNING

Sprint 1-7 bygger på varandra i viss grad (Sprint 2 behöver Sprint 1, Sprint 4 används i Sprint 5).
Kör i angiven ordning. Sprint 8 (release) ska vara SIST.
