# CDP Communication Hub — Sprint 7: Polish & Hardening

Du jobbar i `cdp-communication-hub` repot. Branch: `main`, up to date med origin.

Läs `CLAUDE.md` och `STYRDOKUMENT.md` först.

## BAKGRUND

Alla features från Sprint 6 är byggda och pushade (seed endpoint, learning system, draft editor autosave, chat polish, notifications, tester). Koden är live på Render + Vercel.

Det som kvarstår: CLAUDE.md är outdated, 21 `as any` i routes, och ett par saker som behöver verifieras och poleras.

---

## STEG 1: UPPDATERA CLAUDE.md

CLAUDE.md har utdaterad info. Uppdatera dessa sektioner:

### A) "Current Git Status" — uppdatera till faktisk senaste commit:
```
Latest commit: se `git log --oneline -1`
```

### B) Lägg till ny sektion "Completed Sprint 6 (2026-04-02)":
- ✅ Seed Brain Core agent endpoint — `POST /api/v1/agent/execute` med `action: 'seed-brain-core'`
- ✅ Learning system — auto-learn vid draft approve, classification override, chat command; learning context injiceras i AI-prompt
- ✅ Draft editor — autosave (30s debounce), ordräknare, signatur-förhandsgranskning
- ✅ Chat widget polish — loading skeleton, retry-knapp, offline-banner
- ✅ Notifications — bell dropdown i TopBar, permission-prompt, desktop push för hög-prio
- ✅ Seed brain core test suite (221 rader)

### C) Uppdatera "TODO" sektionen:
- Ta bort "Seed Brain Core" från Post-deploy (det är nu en agent action)
- Flytta `as any`-städning till "Nästa sprint" med korrekt antal: 21 kvar i routes

### D) Uppdatera test-räknare om de ändrats

**COMMIT:** `docs: update CLAUDE.md with sprint 6 completion + current status`
**PUSH:** `git push origin main`

---

## STEG 2: SISTA `as any`-STÄDNING

21 `as any` kvar i server/src/routes/. De fördelar sig så:

| Fil | Antal | Typ |
|---|---|---|
| auth.ts | 5 | union type + callback |
| threads.ts | 5 | Prisma JSON + query |
| drafts.ts | 2 | Prisma JSON |
| search.ts | 2 | Prisma JSON |
| templates.ts | 2 | Zod-fixbara |
| views.ts | 2 | Prisma JSON |
| agent.ts | 1 | Zod-fixbar |
| ai.ts | 1 | request body |
| webhooks.ts | 1 | Pub/Sub payload |

### A) Fixa de Zod-fixbara (templates.ts, agent.ts, ai.ts) — ersätt med Zod-schemas
### B) auth.ts — typa handleCallback return value, eller om det är för stort, lägg till `// eslint-disable-next-line` med kommentar
### C) Prisma JSON-fields (drafts, search, threads, views) — skapa `type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }` utility type och ersätt `as any` med `as JsonValue`
### D) webhooks.ts — typa Pub/Sub payload

Mål: 0 okommenterade `as any`. Kvar ska bara vara de med explicit `// Prisma JSON field` kommentar.

```bash
cd server && npx tsc --noEmit
cd client && npx tsc --noEmit
```

**COMMIT:** `refactor: eliminate remaining as-any — Zod schemas + JsonValue utility type`
**PUSH:** `git push origin main`

---

## STEG 3: VERIFY DEPLOY + SMOKE TEST

### A) Vänta på att Render och Vercel deployer klart (de triggas automatiskt)

### B) Kör smoke test mot produktion:
```bash
# Health check
curl -s https://cdp-hub-api.onrender.com/health | jq .

# Seed brain core via agent
curl -X POST https://cdp-hub-api.onrender.com/api/v1/agent/execute \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $COMMAND_API_KEY" \
  -d '{"action": "seed-brain-core"}'

# Briefing
curl -X POST https://cdp-hub-api.onrender.com/api/v1/agent/execute \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $COMMAND_API_KEY" \
  -d '{"action": "briefing"}'
```

### C) Rapportera resultaten — skriv output till `DEPLOY-STATUS.md` i repo-roten

**COMMIT:** `docs: deploy verification smoke test results`
**PUSH:** `git push origin main`

---

## STEG 4: RENSA UNTRACKED FILER

Det finns gamla prompt-filer i repot som inte ska committas:
```
.claude/settings.local.json
CLAUDE-CODE-BUILD-FIX.md
CLAUDE-CODE-RESTART-PROMPT.md
CLAUDE-CODE-SEED-ENDPOINT.md
```

Lägg till dessa i `.gitignore`:
```
.claude/
CLAUDE-CODE-*.md
```

**COMMIT:** `chore: gitignore prompt files and local claude settings`
**PUSH:** `git push origin main`

---

## STEG 5: SLUTVERIFIERING

```bash
cd server && npx tsc --noEmit
cd client && npx tsc --noEmit
cd server && npx vitest run
cd server && npm run build
cd client && npm run build
```

ALLA ska vara gröna. Om något failar, fixa det.

**COMMIT (bara om fixar behövdes):** `fix: sprint 7 verification fixes`
**PUSH:** `git push origin main`

---

## REGLER (ABSOLUTA)

- `npx tsc --noEmit` i BÅDE client OCH server innan VARJE commit — NOLL errors
- Push till main efter varje commit
- ALLA UI-texter SVENSKA
- **ALDRIG auto-send email, ALDRIG auto-delete**
- Inga nakna `console.*` i client prod-kod
- Fråga inget — jobba igenom alla steg i ordning

## COMMITS (4-5 st):
1. `docs: update CLAUDE.md with sprint 6 completion + current status`
2. `refactor: eliminate remaining as-any — Zod schemas + JsonValue utility type`
3. `docs: deploy verification smoke test results`
4. `chore: gitignore prompt files and local claude settings`
5. (om behövs) `fix: sprint 7 verification fixes`
