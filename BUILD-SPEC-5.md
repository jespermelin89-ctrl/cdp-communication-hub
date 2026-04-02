# CDP Communication Hub — Build Specification 5: V1.2 Daily Driver Features

> v1.1.0 shipped. 143 commits, ~32k LOC, 18 sidor, 31 komponenter, 20 routes, 15 services, 271 tester.
> Noll TypeScript-errors. v1.1.0 taggad.
> Denna spec bygger v1.2 — gör appen till en riktig daglig mailklient man VILL använda.

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

## SPRINT 1: BULK ACTIONS + MULTI-SELECT

### Problem
Man kan bara agera på en tråd i taget. Ingen checkbox-selektion i inbox.

### 1A. Inbox multi-select mode

I `client/app/inbox/page.tsx`:

- State: `selectedThreadIds: Set<string>`, `isSelectMode: boolean`
- Lång-tryck ELLER checkbox-ikon till vänster om varje tråd → aktiverar select mode
- "Markera alla"-checkbox i headern
- Visuell feedback: selected trådar med blå bakgrund `bg-blue-50 dark:bg-blue-900/30`
- Escape / "Avbryt"-knapp → avmarkera alla

### 1B. Bulk action toolbar

Fast toolbar som dyker upp OVANFÖR trådlistan när `selectedThreadIds.size > 0`:

Knappar:
- **Arkivera** (Archive icon) — flytta valda till arkiv
- **Markera läst/oläst** (Mail/MailOpen icon) — toggle
- **Papperskorg** (Trash2 icon) — flytta till trash
- **Klassificera** (Tag icon) — dropdown med kategorier, applicera på alla
- **Prioritet** (AlertTriangle icon) — dropdown med high/medium/low

Visa: `"3 valda"` text med antal.

### 1C. Backend — bulk endpoints

```
POST /threads/bulk/archive     { threadIds: string[] }
POST /threads/bulk/trash       { threadIds: string[] }
POST /threads/bulk/read        { threadIds: string[], isRead: boolean }
POST /threads/bulk/classify    { threadIds: string[], classification: string }
POST /threads/bulk/priority    { threadIds: string[], priority: string }
```

Varje endpoint: validera att alla threadIds tillhör användarens konton. Returnera `{ updated: number }`.

### 1D. Keyboard shortcuts

- `x` → toggle select på fokuserad tråd
- `Ctrl+A` i inbox → markera alla synliga
- `e` med selection → arkivera
- `#` med selection → trash

### 1E. i18n

Nycklar under `bulk`:
```
selected: "{{count}} valda"
archive: "Arkivera"
markRead: "Markera läst"
markUnread: "Markera oläst"
trash: "Papperskorg"
classify: "Klassificera"
selectAll: "Markera alla"
deselectAll: "Avmarkera"
```

### COMMIT: `feat: bulk actions — multi-select inbox, bulk archive/trash/read/classify, keyboard shortcuts`

---

## SPRINT 2: CUSTOM LABELS & TAGS

### Problem
`labels` på EmailThread är bara Gmail-labels. Ingen möjlighet att skapa egna tags.

### 2A. Schema — Label

```prisma
model Label {
  id        String   @id @default(cuid())
  userId    String   @map("user_id")
  name      String
  color     String   @default("#6B7280") // hex color
  icon      String?  // lucide icon name
  position  Int      @default(0)
  createdAt DateTime @default(now()) @map("created_at")

  threadLabels ThreadLabel[]

  @@unique([userId, name])
  @@map("labels")
}

model ThreadLabel {
  id        String   @id @default(cuid())
  threadId  String   @map("thread_id")
  labelId   String   @map("label_id")
  createdAt DateTime @default(now()) @map("created_at")

  thread EmailThread @relation(fields: [threadId], references: [id], onDelete: Cascade)
  label  Label       @relation(fields: [labelId], references: [id], onDelete: Cascade)

  @@unique([threadId, labelId])
  @@map("thread_labels")
}
```

Lägg till relation i EmailThread: `threadLabels ThreadLabel[]`

### 2B. CRUD routes — `server/src/routes/labels.ts`

```
GET    /labels                     — Lista alla (sorterat på position)
POST   /labels                     — Skapa { name, color, icon }
PATCH  /labels/:id                 — Uppdatera
DELETE /labels/:id                 — Ta bort (cascade tar ThreadLabel)
POST   /threads/:id/labels         — Tilldela labels { labelIds: string[] }
DELETE /threads/:id/labels/:labelId — Ta bort label från tråd
POST   /threads/bulk/label         — Bulk: tilldela label { threadIds: string[], labelId: string }
```

### 2C. Frontend — label management

Settings-sida: `client/app/settings/labels/page.tsx`:
- Lista labels med färgprov + drag-to-reorder
- Skapa ny: namn + färgväljare (8 preset-färger + custom hex)
- Edit inline
- Delete med bekräftelse

### 2D. Inbox — label badges

I trådlistan: visa labels som färgade chips bredvid subject.
Klick på chip → filtrera inbox på den labeln.

### 2E. Thread detail — label picker

I thread header action menu: "Etiketter"-knapp → checkbox-lista med alla labels. Toggle on/off.

### 2F. Saved views integration

Uppdatera saved views filters att stödja `labelIds: string[]`.

### 2G. Seed 5 default labels

```typescript
[
  { name: 'CDP', color: '#3B82F6', icon: 'target' },
  { name: 'Myndighet', color: '#EF4444', icon: 'building-2' },
  { name: 'Ekonomi', color: '#F59E0B', icon: 'coins' },
  { name: 'Personligt', color: '#10B981', icon: 'heart' },
  { name: 'Viktigt', color: '#8B5CF6', icon: 'star' },
]
```

### COMMIT: `feat: custom labels — color tags, thread assignment, label management, bulk label`

---

## SPRINT 3: EMAIL SIGNATURES

### Problem
`signature` finns på EmailAccount men det finns inget UI för att hantera det, och det insertas inte automatiskt i compose.

### 3A. Schema — utöka signature

Lägg till i EmailAccount:
```prisma
signatureHtml String? @map("signature_html")
```

### 3B. Signature editor page

`client/app/settings/signatures/page.tsx`:

- Per-konto signatur-editor
- Använd RichTextEditor (redan finns) för HTML-signatur
- Preview-panel som visar hur signaturen ser ut
- Toggle: "Använd på nya mail" / "Använd vid svar" per konto
- "Kopiera från annat konto"-knapp

### 3C. Backend routes

```
GET    /accounts/:id/signature       — Hämta signatur
PUT    /accounts/:id/signature       — Uppdatera { text, html, useOnNew, useOnReply }
```

### 3D. Auto-insert i compose

I compose-sidan: om kontot har signatur OCH `useOnNew` är true:
- Infoga `--\n` + signatur i slutet av body (plain) eller `<div class="signature">` (rich)
- Markera signatur-delen visuellt (grå, mindre text)
- Användaren kan ta bort/ändra den

Vid reply: om `useOnReply` → infoga signatur OVANFÖR citerad text.

### 3E. Signature settings i AccountSettings

Länk från konto-settings → signatur-editor.
Visa "Signatur: Konfigurerad ✓" eller "Signatur: Ingen" i kontolistan.

### COMMIT: `feat: email signatures — per-account HTML signatures, auto-insert compose, settings UI`

---

## SPRINT 4: CONTACT AUTOCOMPLETE

### Problem
I compose måste man skriva hela email-adressen manuellt. Inget förslag från kontakter.

### 4A. Backend — contact search endpoint

```
GET /contacts/search?q=jes&limit=10
```

Söker i ContactProfile + EmailMessage.fromAddress + EmailMessage.toAddresses.
Returnera: `{ email, displayName, lastContactAt, totalEmails }[]`
Deduplicera och sortera på senast kontaktad.

### 4B. Autocomplete komponent

`client/components/ContactAutocomplete.tsx`:

- Input-fält med debounced search (300ms)
- Dropdown med matchande kontakter: namn + email + avatar-initialer
- Tangentbordsnavigering: pil upp/ner, Enter för att välja
- Flera mottagare som "chips" (klicka X för att ta bort)
- Stöd för To, CC, BCC-fält

### 4C. Compose integration

Ersätt alla `<input>` för To/CC/BCC med `<ContactAutocomplete>`.
CC/BCC-fält: visa/dölj med "CC/BCC"-knapp (som redan finns eller skapa).

### 4D. Snabb-add okänd adress

Om sökningen ger 0 resultat och input ser ut som en giltig email: visa "Lägg till [email]" som alternativ.
Enter på tom sökning med giltig email → lägg till direkt.

### 4E. Senaste kontakter

Under autocomplete-dropdown om input är tom: visa "Senaste kontakter" (top 5 mest kontaktade senaste 30 dagarna).

### COMMIT: `feat: contact autocomplete — type-ahead compose, recent contacts, chip-style recipients`

---

## SPRINT 5: UNDO SEND

### Problem
När man klickar "Skicka" skickas mailet direkt. Inget säkerhetsnät.

### 5A. Backend — delayed send

Ändra send-flödet:

1. `POST /drafts/:id/send-delayed` → behåll draft som `approved`, sätt `scheduledAt: now + 10s`
2. Sync-scheduler letar efter drafts med `status: 'approved'` och `scheduledAt <= now` → skickar dem
3. `POST /drafts/:id/cancel-send` → om `status === 'approved'` och `scheduledAt > now` → sätt `scheduledAt: null`. Returnera `{ cancelled: true }`.

### 5B. Schema-ändring

Ingen ny draft-status behövs. `scheduledAt` räcker, och legacy-`sending` hanteras bara som bakåtkompatibilitet i schedulern.

### 5C. Frontend — undo toast

Efter klick på "Skicka":
- Visa toast/banner längst ner: "Mail skickas om 10s" med progressbar + "Ångra"-knapp
- Countdown-timer: 10 → 0
- Klick på "Ångra" → `POST /cancel-send` → toast: "Mail avbrutet" → navigera tillbaka till draft
- Om countdown når 0 → toast försvinner, mail skickas

### 5D. Settings — undo delay

I UserSettings:
```prisma
undoSendDelay Int @default(10) @map("undo_send_delay") // seconds, 0 = disabled
```

Settings-sida: slider 0-30 sekunder. 0 = skicka direkt (inget undo).

### 5E. i18n

```
undoSend:
  sending: "Skickar om {{seconds}}s..."
  undo: "Ångra"
  cancelled: "Mail avbrutet"
  sent: "Mail skickat!"
  delay: "Ångra-fördröjning"
  delayDescription: "Sekunder att vänta innan mail skickas"
```

### COMMIT: `feat: undo send — 10s delay with cancel, countdown toast, configurable delay`

---

## SPRINT 6: ATTACHMENT PREVIEW & DOWNLOAD

### Problem
Attachments visas bara som filnamn. Ingen preview, ingen nedladdning.

### 6A. Backend — attachment endpoints

```
GET /threads/:threadId/messages/:messageId/attachments/:attachmentId
```

- Gmail: hämta via `gmail.users.messages.attachments.get`
- IMAP: hämta från cached data
- Returnera: `{ data: base64, mimeType, filename, size }`

```
GET /threads/:threadId/messages/:messageId/attachments/:attachmentId/thumbnail
```

- För bilder: returnera nedskalad version (max 200x200)
- För PDF: returnera första sidan som bild (om möjligt, annars ikon)
- För annat: returnera filtyps-ikon

### 6B. Attachment preview komponent

`client/components/AttachmentPreview.tsx`:

- Grid-layout med thumbnails
- Bilder (jpg, png, gif, webp): visa thumbnail, klick → fullsize i modal
- PDF: visa PDF-ikon med sidantal om tillgängligt
- Dokument (doc, xlsx, etc): visa filtyps-ikon
- Alla: filnamn, storlek (formaterad: "2.3 MB"), download-knapp

### 6C. Lightbox modal

`client/components/ImageLightbox.tsx`:

- Fullscreen overlay med bild
- Pil vänster/höger om flera bilder i meddelandet
- Zoom med pinch/scroll
- Download-knapp
- Escape / klick utanför → stäng

### 6D. Thread detail integration

I message-vyerna: visa `<AttachmentPreview>` under meddelandetexten.
Klickbara thumbnails. Download-knappar.

### 6E. Compose — attachment list förbättring

I compose: visa bifogade filer som kort med thumbnail (för bilder) + filnamn + storlek + X-knapp.

### 6F. i18n

```
attachments:
  download: "Ladda ner"
  preview: "Förhandsgranska"
  size: "Storlek"
  noPreview: "Förhandsgranskning ej tillgänglig"
  downloading: "Laddar ner..."
```

### COMMIT: `feat: attachment preview — thumbnails, lightbox, download, inline image grid`

---

## SPRINT 7: ADVANCED SEARCH

### Problem
Sökning är bara en enkel textsökning. Inga filter, ingen historik.

### 7A. Backend — utökad sökning

Uppdatera `GET /threads` (eller skapa `GET /search`):

Query-parametrar:
```
q          — fritext (subject + body + from)
from       — avsändarfilter (partial match)
to         — mottagare
dateFrom   — datum från (ISO)
dateTo     — datum till (ISO)
hasAttachment — boolean
classification — kategori
priority   — prio
accountId  — specifikt konto
labelIds   — comma-separated label IDs
```

Bygg Prisma `where` dynamiskt baserat på parametrar.

### 7B. Schema — SearchHistory

```prisma
model SearchHistory {
  id        String   @id @default(cuid())
  userId    String   @map("user_id")
  query     String
  filters   Json?    // sparade filterparametrar
  resultCount Int?   @map("result_count")
  createdAt DateTime @default(now()) @map("created_at")

  @@index([userId, createdAt(sort: Desc)])
  @@map("search_history")
}
```

### 7C. Endpoints

```
GET    /search/history          — Senaste 20 sökningar
DELETE /search/history          — Rensa historik
DELETE /search/history/:id      — Ta bort enskild
```

### 7D. Frontend — avancerad sökning

Utöka `client/app/search/page.tsx`:

- Sökfältet överst (redan finns)
- "Filter"-knapp → expanderbar panel med:
  - Från (input)
  - Till (input)
  - Datumintervall (två datepickers)
  - Har bilaga (toggle)
  - Kategori (dropdown)
  - Prioritet (dropdown)
  - Konto (dropdown)
  - Labels (multi-select)
- Aktiva filter som chips under sökfältet
- "Rensa filter"-knapp

### 7E. Sökhistorik

Under sökfältet (när tomt): visa "Senaste sökningar" med klickbara items.
X-knapp per item → ta bort. "Rensa allt"-länk.

### 7F. Spara sökning som vy

"Spara som vy"-knapp → skapar SavedView med alla aktiva filter. Återanvänd endpoint från Sprint 5 i BUILD-SPEC-4.

### COMMIT: `feat: advanced search — filters, date range, attachments, search history, save as view`

---

## SPRINT 8: V1.2 RELEASE

### 8A. Nya tester

- `server/src/__tests__/bulk-actions.test.ts` — bulk archive, trash, read, classify
- `server/src/__tests__/labels.test.ts` — CRUD + thread assignment + bulk
- `server/src/__tests__/signatures.test.ts` — get/put signature
- `server/src/__tests__/contact-search.test.ts` — search + dedup + limit
- `server/src/__tests__/undo-send.test.ts` — delayed send + cancel
- `server/src/__tests__/attachment-preview.test.ts` — fetch attachment
- `server/src/__tests__/advanced-search.test.ts` — multi-filter query

### 8B. Run all tests

```bash
cd server && npx vitest run
cd client && npx vitest run
```

Fix ALLA failures.

### 8C. CHANGELOG

Lägg till v1.2.0 section med alla features:
- Bulk actions + multi-select
- Custom labels & tags
- Email signatures
- Contact autocomplete
- Undo send
- Attachment preview & download
- Advanced search

### 8D. Version bump

```json
"version": "1.2.0"
```

I BÅDE `client/package.json` och `server/package.json`.

### 8E. Git tag

```bash
git tag -a v1.2.0 -m "v1.2.0 — Daily Driver Features"
```

### COMMIT: `chore: v1.2.0 release — bulk actions, labels, signatures, autocomplete, undo send, attachments, search`

---

## SAMMANFATTNING — 8 sprints, 8 commits:

1. `feat: bulk actions — multi-select inbox, bulk archive/trash/read/classify, keyboard shortcuts`
2. `feat: custom labels — color tags, thread assignment, label management, bulk label`
3. `feat: email signatures — per-account HTML signatures, auto-insert compose, settings UI`
4. `feat: contact autocomplete — type-ahead compose, recent contacts, chip-style recipients`
5. `feat: undo send — 10s delay with cancel, countdown toast, configurable delay`
6. `feat: attachment preview — thumbnails, lightbox, download, inline image grid`
7. `feat: advanced search — filters, date range, attachments, search history, save as view`
8. `chore: v1.2.0 release — tests, changelog, version bump`

## ORDNING

Sprint 1-7 är alla oberoende — kör i angiven ordning.
Sprint 8 (release) ska vara SIST.
