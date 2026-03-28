# CDP Communication Hub - Project Context

## What This Is
An AI-powered communication overlay on Gmail. NOT an email client replacement — Gmail stays source of truth. The system reads, analyzes, classifies, and drafts responses, but NEVER sends or deletes autonomously. Every outbound email follows: Read → Analyze → Draft → Review → Approve → Gmail Sends.

## Non-Negotiable Safety Rules (NEVER violate these)
1. **Never auto-send** — AI creates drafts only. Sending requires explicit human approval.
2. **Never auto-delete** — System suggests cleanup, never executes deletion.
3. **Gmail is source of truth** — System caches metadata, Gmail is authoritative.
4. **AI suggests, human decides** — Claude drafts and analyzes, never executes.
5. **Chat ≠ Approval** — Saying "send that" in chat does NOT trigger sending. Only explicit UI/API approval.
6. **Draft → Approve → Send** — Enforced at database level. `POST /drafts/:id/send` checks `status === 'approved'` in a transaction. No override parameter exists.

## Architecture (3 Layers)
```
Gmail API ← Backend (Fastify :3001) ← AI Layer (Claude API) ← Frontend (Next.js :3000)
                     ↑
               Claude / Dispatch (reads + drafts via API, cannot approve or send)
```

- **Backend** is the SOLE gateway to Gmail API and AI provider. No other component talks to Gmail directly.
- **AI Layer** is stateless. Receives JSON, returns JSON. Swappable between Claude and OpenAI.
- **Frontend** talks ONLY to backend API via REST. Never touches Gmail or AI directly.

## Tech Stack
- Backend: Node.js + Fastify + TypeScript + Prisma + PostgreSQL (Supabase)
- Frontend: Next.js 15 + Tailwind CSS + TypeScript
- AI: Groq (llama-3.3-70b-versatile, free tier, default) | Anthropic Claude (claude-sonnet-4-5) | OpenAI (gpt-4o)
- Auth: Google OAuth 2.0 + JWT sessions
- Encryption: AES-256-GCM for OAuth tokens at rest
- Hosting: Vercel (frontend), Render (backend)

## Project Structure
```
server/src/
  config/       env.ts, database.ts, oauth.ts
  routes/       auth, accounts, threads, drafts, ai, command-center, action-logs, brain-core
  services/     gmail.service, ai.service, draft.service, auth.service, action-log.service,
                category.service, chat-command.service, email-provider.factory, imap.service, smtp.service,
                brain-core.service
  scripts/      seed-brain-core.ts (run: npm run seed:brain-core)
  middleware/   auth.middleware, error.middleware
  utils/        encryption, email-parser, validators
  prisma/       schema.prisma

client/
  app/          page (Dashboard), drafts/, inbox/, threads/[id]/, auth/callback/, settings/
  components/   TopBar, StatusBadge, PriorityBadge, I18nProvider, LanguageSwitcher, ChatWidget, AddImapAccountModal
  lib/          api.ts (HTTP client), types.ts, i18n/ (sv, en, es, ru translations)
```

## Database (Supabase PostgreSQL)
Tables: users, email_accounts, email_threads, email_messages, ai_analyses, drafts (CRITICAL - status gate), action_logs, user_settings, categories, sender_rules, writing_modes, voice_attributes, contact_profiles, classification_rules, learning_events, daily_summaries

## Deployment
- **Frontend**: Vercel — auto-deploys from GitHub main branch
  - URL: https://cdp-communication-hub.vercel.app/
  - Root directory: `client`
- **Backend**: Render — auto-deploys from GitHub main branch
  - URL: https://cdp-communication-hub.onrender.com
  - Build command: `cd server && npm install && npm run build`
  - (`npm run build` = `prisma generate && (prisma migrate resolve --applied 0_init 2>/dev/null || true) && prisma migrate deploy && tsc`)
- **GitHub**: github.com/jespermelin89-ctrl/cdp-communication-hub (private)
  - Default branch: main (remote) / master (local — needs alignment)

## Current Git Status (2026-03-27)

All work is committed and pushed to `origin/main`. Local branch `master` tracks `origin/main`.
Latest commit: `057146b` feat: brain-summary tests + Render deploy fix + client api method

## Completed Work (2026-03-27)

### ✅ i18n System
React Context-based with useI18n() hook, 4 languages (sv default, en, es, ru), localStorage persistence, LanguageSwitcher in TopBar.

### ✅ Dashboard Redesign (client/app/page.tsx)
Gradient stat cards, quick action buttons, priority distribution bars, account sync status panel, activity feed, categories grid, AI inbox summary widget (auto-fetches on load, sessionStorage cache, refresh button).

### ✅ Inbox Redesign (client/app/inbox/page.tsx)
Color-coded AI classification badges, priority filter pills, classification filter tabs, checkbox multi-select + bulk analyze, click-to-expand, per-thread spinner, inline error display (no more alert() dialogs).

### ✅ Sync Scheduler (server/src/services/sync-scheduler.service.ts)
Email sync every 5 min, AI classification every 10 min, backoff after 3 failures/account.

### ✅ Auto-Updating Styrdokument
`STYRDOKUMENT.md`, `scripts/update-styrdokument.js`, `.git/hooks/post-commit`.

### ✅ PWA Support
manifest.json, sw.js (network-first/cache-first), offline.html, SVG icons, PwaRegistrar.tsx.

### ✅ Dark Mode (client/components/ThemeProvider.tsx)
Tailwind `darkMode: 'class'`, ThemeProvider context, 🌙/☀️ toggle in TopBar, localStorage persistence. Dark variants on all pages and shared CSS classes.

### ✅ AI Analyze Button Fix
- `sync-messages` route: try/catch with 401 on expired Gmail token, 502 on provider error, 400 if no messages
- Frontend: per-thread inline error state (Map), no more alert() dialogs

### ✅ Priority Overview Fix
Command-center returns `unanalyzed_threads` count. Dashboard shows unanalyzed with link to inbox.

### ✅ Add Account Button
Brand-colored "+ Lägg till konto" button in TopBar (all pages).

### ✅ Email Signatures
- `EmailAccount.signature` field (TEXT, nullable) in schema.prisma
- `PATCH /accounts/:id` accepts and saves signature
- DraftService.create() auto-appends `\n\n--\n{signature}` to body
- Signature editor (textarea + live preview) in /settings/accounts

### ✅ TypeScript fixes
- sv.ts: removed `as const` so Translations uses string types
- AddEmailAccount: DetectedProvider aligned with API response
- types.ts: `Message = EmailMessage` alias

### ✅ Cleanup
- Removed `POST /auth/admin/merge-accounts` temporary endpoint
- Local `master` tracks `origin/main`

### ✅ AI Endpoint Fix (Sprint 2)
- Fixed wrong model name: `claude-sonnet-4-20250514` → `claude-sonnet-4-5`
- Added try/catch in all 3 AI routes returning 503 with `{ error, message, code: 'AI_ERROR' }`
- Added AI key startup logging in index.ts

### ✅ Brain Core Data Layer (Sprint 2)
- 6 new Prisma models: WritingMode, VoiceAttribute, ContactProfile, ClassificationRule, LearningEvent, DailySummary
- `brain-core.service.ts`: writing profile, contacts, classification rules, daily summary (AI-powered), learning events
- `brain-core.ts`: 9 REST endpoints under `/api/v1/brain-core/*`
- `seed-brain-core.ts`: seeds writing profile from JESPER-WRITING-PROFILE.md (run `npm run seed:brain-core`)
- Dashboard: Brain Core daily summary widget with needs-reply, good-to-know, AI recommendation, regenerate
- i18n: brainCore keys in all 4 languages

### ✅ Groq AI Provider (Sprint 2 Final)
- `env.ts`: GROQ_API_KEY added, AI_PROVIDER default changed to 'groq'
- `ai.service.ts`: Groq via OpenAI SDK (baseURL: api.groq.com), model: llama-3.3-70b-versatile
- `cleanJsonResponse()` helper: strips markdown fences from Llama responses
- Strengthened system prompts with explicit JSON format instructions + example output
- Groq free tier: 30 req/min, 14400 req/day — no cost

### ✅ Batch AI Classification (Sprint 2 Final)
- sync-scheduler: processes unanalyzed threads in batches of 5, 2s delay between batches
- Respects Groq rate limit (30 req/min)

### ✅ Prisma Migration Baseline — Fas 1 (Sprint 2 Final)
- `server/src/prisma/migrations/0_init/migration.sql`: baseline SQL for all 16 tables
- Generated via `prisma migrate diff --from-empty` — safe for existing Supabase DB with production data
- `server/package.json` build script: idempotent — `migrate resolve --applied 0_init || true` before `migrate deploy`
- First Render deploy registers baseline; subsequent deploys skip silently

### ✅ Brain Summary Endpoint + API Surface — Fas 2 (Sprint 2 Final)
- `GET /api/v1/brain-summary`: aggregated read-only view for BRAIN-OS
  - Returns: generated_at, accounts, summary counts, important_threads (metadata only), pending_drafts (metadata only), daily_summary
  - Safety guarantee: `draft.body_text` NEVER included — excluded by Prisma select, verified in tests
- `API_SURFACE.md` (project root): stable vs internal endpoints, prefix mismatch documented
  - BRAIN-OS must use `/api/v1/` not `/api/` — no aliases added on Hub side
- `client/lib/api.ts`: `getBrainSummary()` method added

### ✅ Vitest Test Suite — Fas 4 (Sprint 2 Final)
- `server/vitest.config.ts`: Node environment, v8 coverage
- `server/package.json`: `test`, `test:watch`, `test:coverage` scripts
- 87 tests across 4 files:
  - `validators.test.ts` (34 tests): all Zod schemas
  - `ai-service.test.ts` (21 tests): cleanJsonResponse, AIAnalysisSchema, parsing pipeline
  - `draft-approval.test.ts` (20 tests): state machine — pending→approved→sent safety gate
  - `brain-summary.test.ts` (13 tests): response shape, SAFETY body_text never leaks (×2), counts, daily_summary, empty inbox

### ✅ DB Migration Fix + Render Config (Sprint 3)
- `server/src/prisma/migrations/20260327000000_add_account_fields/migration.sql`: ALTER TABLE adds `account_type`, `team_members`, `ai_handling` (IF NOT EXISTS — safe re-run)
- `render.yaml`: added `GROQ_API_KEY` (sync: false) and `AI_PROVIDER=groq`
- Build script (`prisma migrate deploy`) auto-applies migration on next Render deploy
- Brain Core tables already in `0_init` baseline — not missing

### ✅ Archive/Trash Actions (Sprint 3)
- `POST /threads/:id/archive` — removes INBOX label via `gmail.users.threads.modify`
- `POST /threads/:id/trash` — moves to trash via `gmail.users.threads.trash` (never delete)
- `POST /threads/batch` — batch archive or trash with `Promise.allSettled`
- Inbox: Archive/Trash icon buttons per row + batch action bar with confirmation modal
- Thread view: Archive/Trash/Analyze buttons in header
- `client/lib/api.ts`: `archiveThread`, `trashThread`, `batchThreadAction`

### ✅ AI Fallback Chain (Sprint 3)
- `ai.service.ts`: `chat()` iterates providers — Groq → Anthropic → OpenAI
- Logs warning per failed provider, throws only when all fail
- `env.ts`: `COMMAND_API_KEY` added for Apple Shortcuts / Siri integration

### ✅ Chat Improvements (Sprint 3)
- `chat-context.tsx`: React context sharing selected inbox thread IDs with ChatWidget
- ChatWidget: reset button, selected-threads amber banner, badge on FAB, apply-analyze button on thread_list responses
- `chat.ts` backend: `chatAuthMiddleware` (X-API-Key OR JWT), Prisma errors sanitized

## Kända Buggar / TODO (2026-03-27)

### 🟡 Drafts-sidan tom
- Inga utkast visas — kan bero på att inga drafts skapats än (kör Analysera i inbox för att skapa)

### 🟡 Dubbla konton (legacy)
- Eventuella duplikat skapade INNAN `@@unique([userId, emailAddress])` lades till i schema
- Fix: ta bort manuellt via Prisma Studio eller SQL: DELETE FROM email_accounts WHERE id NOT IN (SELECT MIN(id) FROM email_accounts GROUP BY user_id, email_address)

### ⏳ Framtida (bygg inte nu)
- n8n workflow automation (ersätt setInterval-cronjobs)
- Microsoft OAuth
- E-postsignaturer: visa i draft-editorn (frontend preview redan finns via draft body)

## TODO (prio-ordning)

1. ✅ **Fix AI analyze flow** — inline errors, sync-messages try/catch, proper error codes
2. ✅ **Fix dubbla konton** — `@@unique([userId, emailAddress])` finns i schema
3. ✅ **Fix priority overview** — visar oanalyserade + länk till inbox
4. ✅ **Dark mode** — ThemeProvider, Tailwind `darkMode: 'class'`, toggle i TopBar
5. ✅ **Synligare "Lägg till konto"-knapp** — brand-färgad knapp i TopBar
6. ✅ **AI inbox-sammanfattning** — dashboard-widget med sessionStorage-cache
7. ✅ **E-postsignaturer per konto** — signature-fält, editor, auto-append i DraftService
8. ✅ **Fix drafts-sidan** — empty state med hint och länk till inbox
9. ✅ **DB-migration** — `20260327000000_add_account_fields` för account_type/team_members/ai_handling; render.yaml har GROQ_API_KEY
10. ✅ **Arkivera/radera** — `/threads/:id/archive`, `/threads/:id/trash`, `/threads/batch`; Archive/Trash knappar i Inbox + tråd-vy
11. ✅ **AI fallback-kedja** — Groq → Anthropic → OpenAI med logging
12. ✅ **Draft editor** — auto-save (30s debounce) + tecken/ord-räknare i realtid
13. ✅ **Browser-notifieringar** — useNotifications hook, Bell/BellOff i TopBar, notifyNewHighPriority i Inbox
14. ✅ **AI-stabilitet** — truncateContent (body→2000, snippet→300), provider blacklist (1h), gpt-4o-mini, utökad NO_REPLY_PATTERN
15. ✅ **Account dropdown** — AccountDropdown i Inbox + settings editor för accountType/aiHandling/teamMembers
16. **Seed Brain Core** — kör `npm run seed:brain-core` en gång i Render Shell efter deploy
17. **n8n integration** (framtida — planera bara, bygg inte)

## Key API Patterns
- All API calls go through `client/lib/api.ts` which handles auth headers + base URL
- Backend base URL: `NEXT_PUBLIC_API_URL` env var on Vercel
- JWT token stored in localStorage
- 401 responses trigger redirect to `/` (root/dashboard)

## Owner
Jesper Melin (jesper.melin89@gmail.com)
GitHub: jespermelin89-ctrl
