# Communication Hub — Officiell API-yta

**Version:** v1
**Base URL (produktion):** `https://cdp-communication-hub.onrender.com/api/v1`
**Auth:** `Authorization: Bearer <JWT>` (alla routes utom `/auth/*`)

---

## Stabila endpoints (konsumerbara av BRAIN-OS och externa system)

Dessa routes är stabila och versionerade under `/api/v1/`. Breaking changes kräver ny
major-version och kommuniceras i förväg.

### Aggregerat

| Method | Path | Beskrivning |
|--------|------|-------------|
| `GET` | `/api/v1/brain-summary` | Aggregerad daglig vy — olästa, viktiga trådar, väntande godkännanden, dagens AI-sammanfattning |
| `GET` | `/api/v1/command-center` | Dashboard-data (threads, drafts, accounts, recent actions) |

### Trådar

| Method | Path | Beskrivning |
|--------|------|-------------|
| `GET` | `/api/v1/threads` | Lista trådar (stöder `account_id`, `page`, `limit`, `search`) |
| `GET` | `/api/v1/threads/:id` | Hämta en tråd med meddelanden och analyser |
| `POST` | `/api/v1/threads/sync` | Synka trådar från Gmail för ett konto |

### Utkast (draft-godkännandeflöde — approval-barriären är obruten)

| Method | Path | Beskrivning |
|--------|------|-------------|
| `GET` | `/api/v1/drafts` | Lista utkast (stöder `status`, `account_id`) |
| `GET` | `/api/v1/drafts/:id` | Hämta ett utkast (returnerar ALDRIG body_text utan godkännande) |
| `POST` | `/api/v1/drafts/:id/approve` | Godkänn ett utkast (status: pending → approved) |
| `POST` | `/api/v1/drafts/:id/send` | Skicka ett godkänt utkast (kräver status === 'approved') |
| `POST` | `/api/v1/drafts/:id/discard` | Kassera ett utkast |

### Brain Core

| Method | Path | Beskrivning |
|--------|------|-------------|
| `GET` | `/api/v1/brain-core/writing-profile` | Skrivprofil (modes + voice attributes) |
| `GET` | `/api/v1/brain-core/daily-summary` | Daglig sammanfattning (hämtar eller genererar) |
| `POST` | `/api/v1/brain-core/daily-summary` | Tvinga regenerering av daglig sammanfattning |
| `GET` | `/api/v1/brain-core/contacts` | Kontaktprofiler |
| `GET` | `/api/v1/brain-core/classification` | Klassificeringsregler |
| `POST` | `/api/v1/brain-core/learn` | Registrera ett lärandevände (learning event) |

---

## Interna endpoints (kan ändras utan varning)

Dessa används av frontend-appen men är INTE stabiliserade för extern konsumtion.

| Path | Anmärkning |
|------|------------|
| `/api/v1/auth/*` | OAuth-flöden, JWT-hantering — intern |
| `/api/v1/accounts/*` | Kontoinställningar, IMAP-konfiguration — intern |
| `/api/v1/threads/:id/sync-messages` | Synkar meddelanden internt — intern |
| `/api/v1/ai/*` | AI-anrop (analyze, generate-draft, summarize) — intern |
| `/api/v1/categories/*` | Sändarsregler och kategorier — intern |
| `/api/v1/chat/*` | Chat-assistent — intern |
| `/api/v1/action-logs` | Revisionslogg — intern |
| `/api/v1/providers` | Provider-detektering — intern |
| `/api/v1/brain-core/contact/:email` | PATCH kontaktprofil — intern |
| `/api/v1/brain-core/writing-mode/:key` | PATCH skrivläge — intern |
| `/api/v1/brain-core/learning-stats` | Lärandestatistik — intern |

---

## Planerade endpoints (ej driftsatta ännu)

| Path | Status |
|------|--------|
| `/api/v1/brain-summary` | ✅ Implementerad (se Fas 2) |

---

## API-prefix-mismatch med BRAIN-OS

**Problem:** BRAIN-OS connectors anropar `/api/threads`, `/api/drafts` etc.
**Korrekt prefix:** Alla Communication Hub routes serveras under `/api/v1/`.
**Lösning:** BRAIN-OS uppdaterar sina connectors till `/api/v1/`. Communication Hub
skapar INGA aliases — konsumenten anpassar sig till publicerat API.

BRAIN-OS-filer att uppdatera:
- `comm-hub.client.ts` — byt alla `/api/` till `/api/v1/`

---

## Säkerhetsregler (bryts aldrig)

1. `draft.body_text` exponeras aldrig utan att draften har `status === 'approved'`
2. Ingen endpoint triggar send/delete autonomt — allt kräver explicit godkännande
3. Alla skrivoperationer loggas i `action_logs`
