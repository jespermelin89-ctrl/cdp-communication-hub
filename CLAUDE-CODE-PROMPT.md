# Claude Code — CDP Communication Hub: Sprint 3

Läs `CLAUDE.md` och `JESPER-WRITING-PROFILE.md` FÖRST.

## Arbetssätt
- EN uppgift i taget, prio-ordning
- Committa + pusha efter varje (`git push origin master:main`)
- `cd server && npx tsc --noEmit` + `cd client && npx tsc --noEmit` innan commit
- ALDRIG bryt säkerhetsreglerna (aldrig auto-send, aldrig auto-delete)
- Inga emojis i UI. Använd SVG-ikoner eller Lucide React-ikoner istället.

## STATUS: Vad som redan funkar (rör INTE)
Allt nedan är live och fungerar i produktion. Skriv INTE om dessa:
- ✅ Groq AI-provider (llama-3.3-70b-versatile) — env.ts, ai.service.ts, chatGroq()
- ✅ AI-analys av trådar (POST /ai/analyze-thread)
- ✅ AI inbox-sammanfattning (POST /ai/summarize-inbox)
- ✅ AI draft-generering (POST /ai/generate-draft)
- ✅ cleanJsonResponse() för Llama JSON-parsing
- ✅ Sync scheduler (5 min email, 10 min AI-klassificering)
- ✅ Brain Core: 6 tabeller, service, routes, seed-script
- ✅ Dashboard, Inkorg, Utkast-center, Dark mode, i18n
- ✅ Render: GROQ_API_KEY + AI_PROVIDER=groq live

---

## PRIO 1 — Fixa draft-mottagare (BUGG)

AI-genererade utkast skickas till FEL adress (mailer-daemon@googlemail.com).

**Fix i `server/src/routes/ai.ts` → analyze-thread endpoint:**
- Hämta trådens senaste meddelande (senaste `receivedAt`)
- Sätt `toAddresses` till det meddelandets `fromAddress`
- Om `fromAddress` är `mailer-daemon@*` eller `noreply@*` → SKAPA INTE en draft

---

## PRIO 2 — AI-svar på svenska + kortare

### 2.1 Svenska som default
I alla tre system-prompts (ANALYSIS, DRAFT, SUMMARY):
- `"Always respond in Swedish unless the email is in English — then match the language."`
- DRAFT_SYSTEM_PROMPT: `"Write reply in same language as original email."`
- SUMMARY_SYSTEM_PROMPT: `"Write summary in Swedish. Be concise."`

### 2.2 AI-sammanfattningen på dashboard är för lång
Nuvarande summary-widget visar en hel textvägg. Ändra SUMMARY_SYSTEM_PROMPT:
```
Ge en KORT daglig sammanfattning av inkorgen. Max 3-4 rader.
Format:
- Rad 1: Antal olästa + viktigaste att agera på (namn + ämne)
- Rad 2: Eventuella deadlines eller brådskande ärenden
- Rad 3: Trender (t.ex. "Mycket spam från X, överväg filter")
Ingen inledning. Ingen avslutning. Bara fakta.
```

### 2.3 Daglig sammanfattning-widgeten är för tunn
Visar bara "46 nya, 25 olästa, 0 auto-sorterade" — ingen faktisk sammanfattning.
Fyll den med:
- **Behöver svar:** Lista med namn + ämne (max 5)
- **Bra att veta:** Sammanfattning av resterande
- **AI-rekommendation:** Vad bör göras först
- Hämta från `brain-core/daily-summary` endpoint (den har redan needsReply, goodToKnow, recommendation)

---

## PRIO 3 — Konto-dropdown med team/person-inställningar

### 3.1 Dropdown på kontopillarna i inkorgen
När man klickar på "jesper.melin89" / "wayofthefather" / "jesper.melin" i inkorgen:
Visa en dropdown med:
- **Kontotyp:** Personlig (en gubbe-ikon) | Team (grupp-ikon, flera personer)
- **Hanteras av:** Lista med namn/mejl (om team)
- **AI-beteende:** "Hantera normalt" | "Separera team-mejl" | "Notifiera bara"
- **Snabbåtgärder:** Synka nu, Visa inställningar

### 3.2 Backend: Utöka EmailAccount-modellen
Lägg till i `schema.prisma` → EmailAccount:
```prisma
accountType     String   @default("personal")  // "personal" | "team" | "shared"
teamMembers     String[] @default([])           // Email-adresser till andra som läser
aiHandling      String   @default("normal")     // "normal" | "separate" | "notify_only"
```
Kör `npx prisma db push` efter ändring.

### 3.3 Ikoner istället för emojis
BORT med alla emojis i UI:t (🤖, 📝, 🔥, etc.). Ersätt med Lucide React-ikoner:
- `<User />` för personligt konto
- `<Users />` för team-konto
- `<Mail />` för mail-relaterat
- `<Brain />` för AI-funktioner
- `<BarChart3 />` för statistik
- `<Settings />` för inställningar
- `<Archive />` för arkivering
- `<Trash2 />` för radering
- Prioritet: `<AlertTriangle />` (hög), `<AlertCircle />` (medium), `<CheckCircle />` (låg)

Gå igenom HELA frontend och byt ut emojis → Lucide-ikoner.

---

## PRIO 4 — Tydligare stat-kort på dashboard

Nuvarande stat-kort: "47 Olästa | 3 Hög prioritet | 5 Väntande utkast | 0 Redo att skicka"

Gör dem mer informativa:
- **Olästa (47):** Ändra inte, det är bra
- **Hög prioritet (3):** Visa tooltip eller subtitle med vem det gäller, t.ex. "Kronofogden, Michelle, Coaches"
- **Väntande utkast (5):** Byt "Väntande utkast" → "Utkast att granska" + visa en kort lista
- **Redo att skicka (0):** Byt → "Godkända att skicka"

Under stat-korten, lägg till en ny sektion:
### AI-sorteringsförslag
AI:n analyserar olästa mejl och föreslår grupper:
- "12 mejl från GitHub → Föreslår: Arkivera (notifications)"
- "3 mejl från Kronofogden → Föreslår: Hög prioritet, behöver svar"
- "5 mejl marketing/spam → Föreslår: Radera"
- Knapp per grupp: "Tillämpa" | "Ignorera"

---

## PRIO 5 — Arkivera och radera (med Gmail-synk)

### 5.1 Backend: Gmail-synkade åtgärder
Skapa endpoints:
- `POST /threads/:id/archive` → Sätter Gmail-label "ARCHIVE", tar bort "INBOX"
- `POST /threads/:id/trash` → Flyttar till Gmail Trash (inte permanent delete!)
- `POST /threads/batch` → Batch-arkivera/trasha via `{ threadIds, action: 'archive'|'trash' }`

Använd Gmail API:
```typescript
// Archive (remove from inbox):
gmail.users.messages.modify({ userId: 'me', id: messageId, requestBody: { removeLabelIds: ['INBOX'] } });
// Trash:
gmail.users.messages.trash({ userId: 'me', id: messageId });
```

### 5.2 Frontend: Knappar i inkorg + tråd-vy
- Arkivera-knapp (Archive-ikon) på varje tråd
- Radera-knapp (Trash2-ikon) på varje tråd
- **Batch-åtgärder:** Markera flera → "Arkivera valda" / "Radera valda"
- **Bekräftelse-dialog för radering:** "Är du säker? Mejlet flyttas till papperskorgen i Gmail."
- Radera = Trash i Gmail (kan återställas 30 dagar), INTE permanent delete

### 5.3 Säkerhetsregel
```
ALDRIG kör permanent delete (gmail.users.messages.delete).
Använd ALLTID trash (gmail.users.messages.trash) som kan ångras.
```

---

## PRIO 6 — Connection pool fix

Render-loggar visar: `FATAL: MaxClientsInSessionMode: max clients reached`

Kontrollera:
1. Att det bara finns EN PrismaClient-instans (singleton). Sök: `new PrismaClient`
2. Att `DATABASE_URL` har `?connection_limit=5` i slutet (eller lägg till)
3. Att `directUrl` finns i datasource-blocket i schema.prisma

---

## PRIO 7 — Tråd-detaljvy ("Öppna"-knappen)

Skapa `/inbox/[threadId]/page.tsx`:
- Hämta tråden med alla meddelanden
- Visa som konversation (avsändare, datum, body per meddelande)
- AI-analys om den finns
- Knappar: Analysera, Svara, Arkivera, Radera, Tillbaka

---

## PRIO 8 — Signatur-editor

- Textarea + preview i kontoinställningar
- Auto-append `\n\n--\n${signature}` i drafts
- Per konto (varje konto kan ha sin egen signatur)

---

## PRIO 9 — Chat-kommandoruta (Natural Language Commands)

Markera mejl → ge kommandon via fritext: "Sammanfatta dessa", "Sortera alla från X till Y"

### 9.1 Backend: `POST /api/v1/chat/command`
```typescript
Request:  { command: string, threadIds?: string[], accountId?: string, context?: string }
Response: { action: string, result: any, message: string }
```

AI tolkar kommandot → kör action (sammanfatta, klassificera, skapa drafts, sortera).

**Regler i system-prompt:**
- ALDRIG skicka mejl. Bara utkast.
- ALDRIG radera. Föreslå arkivering.
- Svara på svenska.

### 9.2 Frontend: Chat-panel
Bygg ut chat-ikonen nere till höger till en riktig panel:
- Textfält + skicka
- AI-svar i bubbla-format
- Markerade trådar i inkorgen skickas med automatiskt
- "Tillämpa"-knapp för att köra AI:ts förslag

### 9.3 API-nyckel för extern access (Siri-redo)
- Ny env var: `COMMAND_API_KEY`
- Acceptera `X-API-Key` header som alternativ till JWT
- Returnera enkel JSON för Apple Shortcuts

---

## PRIO 10 — AI Fallback-kedja

I `ai.service.ts` → `chat()`:
- Försök primary (Groq) först
- Om Groq failar → fallback till Anthropic
- Logga vilken provider som användes
- Lägg till `provider_used` i response-metadata

---

## Kör Brain Core seed (om inte redan kört)
```bash
cd server
npx prisma db push
npx prisma generate
# Kolla om writing_modes är tom. Om ja:
npx ts-node src/scripts/seed-brain-core.ts
```

---

## Checklista per commit:
1. `cd server && npx tsc --noEmit`
2. `cd client && npx tsc --noEmit`
3. Inga hårdkodade API-nycklar
4. Inga emojis i UI — använd Lucide-ikoner
5. i18n för nya strängar (SV default)
6. `git push origin master:main`

## Kom igång:
```bash
cat CLAUDE.md
cat JESPER-WRITING-PROFILE.md
```
**Börja med PRIO 1** — fixa draft-mottagare. Sen PRIO 2 (svenska + kortare AI). Sen PRIO 3 (konto-dropdown + ikoner).
