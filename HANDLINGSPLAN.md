# Communication Hub — Handlingsplan från ekosystem-review

**Datum:** 2026-03-27
**Källa:** `../../AI-review-paket/SLUTDOKUMENT.md` (gemensam handlingsplan, Claude + Kodex)
**Status:** Godkänd av båda parter. Redo att genomföras.

---

## Bakgrund

En gemensam granskning av hela CDP-portföljen (Claude Opus + ChatGPT Kodex, 7 rundor) har identifierat att Communication Hub är det enda deployade systemet i portföljen och fungerar väl, men har specifika åtgärder kring migrationsdisciplin, API-yta och testning.

---

## FAS 1: Omedelbara riskreduceringar (24–72 timmar)

### Åtgärd 5: Prisma-migrationshistorik
- **Problem:** Prisma-schema existerar men `prisma/migrations/`-mappen är tom. Utan migrationshistorik kan ingen ny utvecklare eller deploy reproducera databasen.
- **Gör:** Verifiera nuvarande databasläge (Supabase), välj rätt migrationsmetod:
  - `prisma migrate dev --name init` om databasen är tom/ny
  - `prisma migrate diff` eller `prisma db pull` om databasen redan har data i produktion
  - Committa och pusha resultatet
- **Varför akut:** Utan migrationshistorik ingen reproducerbar setup.

---

## FAS 2: Strukturella beslut (vecka 1–2)

### Åtgärd 9: Skapa `/api/v1/brain-summary` endpoint
- **Vad:** Ny lättviktig endpoint som returnerar:
  - Olästa meddelanden (antal)
  - Viktiga/flaggade trådar
  - Väntande godkännanden (drafts med status != approved)
  - Dagens sammanfattning (AI-genererad)
- **Varför:** BRAIN-OS behöver en aggregerad vy. Idag finns ingen summary-endpoint.
- **Krav:** Respektera approval-modellen — aldrig exponera draft-innehåll utan godkännande.
- **Notera prefix:** BRAIN-OS anropar `/api/...` men Communication Hub serverar under `/api/v1/...`. Koordinera med BRAIN-OS om prefix.

### Åtgärd 10: Frys officiell API-yta
- **Vad:** Dokumentera vilka routes under `/api/v1/` som är stabila för externa konsumenter (t.ex. BRAIN-OS).
- **Gör:** Skapa en sektion i CLAUDE.md eller en separat `API_SURFACE.md` som listar:
  - Stabila endpoints (kan anropas av BRAIN-OS)
  - Interna endpoints (kan ändras utan varning)
  - Planerade endpoints (brain-summary etc.)
- **Varför:** BRAIN-OS-connectors antar endpoints som kanske inte är tänkta att vara stabila.

---

## FAS 4: Medellånga förbättringar (vecka 3+)

### Åtgärd 20: Stärk testtäckning
- **Nuläge:** ~20 tester
- **Mål:** Minst 50 tester
- **Fokusområden:**
  - AI-routes (classification, draft generation)
  - Draft-approval-flödet (draft → review → approve → send)
  - Brain-summary endpoint (ny)
  - Edge cases: OAuth token expiry, rate limiting, concurrent drafts

---

## Identifierad API-prefix-mismatch

BRAIN-OS connector (`comm-hub.client.ts`) anropar:
- `/api/threads` → borde vara `/api/v1/threads`
- `/api/drafts` → borde vara `/api/v1/drafts`

Communication Hub serverar ALLA routes under `/api/v1/`:
- auth, accounts, threads, drafts, ai, command-center, action-logs, providers, categories, chat, brain-core

**Åtgärd:** Antingen BRAIN-OS uppdaterar sina connectors till `/api/v1/`, eller Communication Hub skapar aliases. Koordinera med BRAIN-OS-chatten.

---

## Referensdokument

- `../../ECOSYSTEM.md` — Portföljöversikt och integrationsregister
- `../../AI-review-paket/SLUTDOKUMENT.md` — Fullständig handlingsplan (23 åtgärder, 4 faser)
- `CLAUDE.md` — Projektbibel
