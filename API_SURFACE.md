# Communication Hub — Officiell API-yta

**Version:** v1
**Base URL (produktion):** `https://cdp-communication-hub.onrender.com/api/v1`
**Auth:** `Authorization: Bearer <JWT>` (alla routes utom `/auth/*`)

För connector-routes till `BrainCore` stöds även `X-API-Key: <COMMAND_API_KEY>`.
Om flera aktiva användare finns måste klienten även skicka `X-Account-Id: <account_uuid>`
för att undvika att fel konto väljs implicit.

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

### Brain Core Connector

Den här ytan är den nya stabila adapter-ytan för `BrainCore`. Den lämnar befintliga
`/threads`, `/drafts` och `/agent/*` orörda, men exponerar ett separat kontrakt som
inte läcker interna route-shapes.

Alla connector-svar använder:

```json
{
  "success": true,
  "contract_version": "brain-core-connector.v1",
  "data": {},
  "meta": {}
}
```

`meta` används bara när extra metadata behövs, t.ex. pagination.

| Method | Path | Beskrivning |
|--------|------|-------------|
| `GET` | `/api/v1/connectors/brain-core/health` | Hälsostatus + kontraktsversion |
| `GET` | `/api/v1/connectors/brain-core/inbox-summary` | Dedikerad inbox-sammanfattning för BrainCore |
| `GET` | `/api/v1/connectors/brain-core/threads` | Lista trådar i BrainCore-format (`data` = array, `meta.pagination` = paging) |
| `GET` | `/api/v1/connectors/brain-core/threads/:id` | Tråddetalj med messages + drafts i connector-format |
| `POST` | `/api/v1/connectors/brain-core/threads/:id/read` | Markera tråd som läst |
| `POST` | `/api/v1/connectors/brain-core/threads/:id/archive` | Arkivera tråd korrekt via Gmail archive |
| `GET` | `/api/v1/connectors/brain-core/triage-status` | Triage-status i formatet BrainCore förväntar sig |
| `GET` | `/api/v1/connectors/brain-core/classified-summary` | Klassificerad inbox-summary i BrainCore-format |
| `POST` | `/api/v1/connectors/brain-core/drafts` | Skapa draft med BrainCore-vänlig payload (`to`, `body`, `threadId`) |
| `GET` | `/api/v1/connectors/brain-core/drafts/:id` | Hämta draft i connector-format |
| `POST` | `/api/v1/connectors/brain-core/drafts/:id/approve` | Godkänn draft |
| `POST` | `/api/v1/connectors/brain-core/drafts/:id/send` | Skicka godkänd draft |

---

## Interna endpoints (kan ändras utan varning)

Dessa används av frontend-appen eller äldre integrationer men är INTE den rekommenderade
externa BrainCore-ytan längre.

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
| `/api/v1/threads/*` | Webb-UI-kontrakt, inte BrainCore connector-kontrakt |
| `/api/v1/drafts/*` | Webb-UI-kontrakt, inte BrainCore connector-kontrakt |
| `/api/v1/agent/*` | Agent-API, fortfarande single-owner-orienterat |

---

## Planerade endpoints (ej driftsatta ännu)

| Path | Status |
|------|--------|
| `/api/v1/brain-summary` | ✅ Implementerad (se Fas 2) |

---

## Rekommenderad BrainCore-koppling

`BrainCore` ska framåt använda `/api/v1/connectors/brain-core/*` i stället för att läsa
direkt från webb-UI-routes eller tolka agent-svar som primärt integrationskontrakt.

Det löser tre problem:

1. Trådar och drafts får stabil shape utan wrappers som varierar mellan routes.
2. Arkivering går via riktig archive-mutation, inte via felaktig important-semantik.
3. Draft-create kan ta BrainCore-fält (`to`, `body`, `threadId`) och resolvera konto säkert.

---

## Säkerhetsregler (bryts aldrig)

1. `draft.body_text` exponeras aldrig utan att draften har `status === 'approved'`
2. Ingen endpoint triggar send/delete autonomt — allt kräver explicit godkännande
3. Alla skrivoperationer loggas i `action_logs`
