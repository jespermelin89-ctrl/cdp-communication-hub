# CDP Communication Hub - Project Context

## VIKTIGT: Läs MAIL-MEMORY.md först!
Innan du gör NÅGOT med Jespers mail, läs `../MAIL-MEMORY.md` — det är det permanenta minnet för alla mail-ärenden, historik, regler och pågående processer. Uppdatera dokumentet efter varje session.

## What This Is
An AI-powered communication layer above Gmail and connected mail accounts. NOT an email client replacement. Gmail remains source of truth for Gmail accounts. The AI layer reads, analyzes, classifies, and drafts responses, but never auto-sends or auto-deletes on its own.

## Non-Negotiable Safety Rules (NEVER violate these)
1. **Never auto-send** — AI and agent flows cannot auto-approve pending drafts. Sending requires human approval first.
2. **Never auto-delete** — System suggests cleanup, never executes deletion.
3. **Gmail is source of truth for Gmail accounts** — System caches metadata, Gmail is authoritative there.
4. **AI suggests, human decides** — Claude drafts and analyzes, never executes.
5. **Chat ≠ Approval** — Saying "send that" in chat does NOT trigger sending or auto-approval.
6. **Draft → Approve → Send** — `POST /drafts/:id/send` checks `status === 'approved'` in a transaction, and the agent can only send/schedule already-approved drafts.

## Architecture (3 Layers)
```
Gmail API ← Backend (Fastify :3001) ← AI Layer (Claude API) ← Frontend (Next.js :3000)
                     ↑
               Claude / Dispatch (reads + drafts via API, cannot auto-approve pending drafts)
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
  - URL: https://cdp-hub-api.onrender.com
  - Build command: `cd server && npm install && npm run build`
  - (`npm run build` = `prisma generate && (prisma migrate resolve --applied 0_init 2>/dev/null || true) && prisma migrate deploy && tsc`)
- **GitHub**: github.com/jespermelin89-ctrl/cdp-communication-hub (private)
  - Default branch: main

## Current Git Status (2026-04-02)

All work is committed and pushed to `origin/main`. Local branch `main` tracks `origin/main`.
Latest commit: `0a84aa8` feat: harden mail trust flow and add calendar assist (#2)

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
- Local `main` tracks `origin/main`

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

### ✅ v1.1.0 — Intelligence & Power Features
- Follow-up reminders: auto-detect (48h), manuella reminders, push-notiser
- Rich text compose: Tiptap editor, HTML-mail, plain/rich toggle
- Email templates: CRUD, AI-generering, compose-integration, 5 seed-mallar
- Analytics dashboard: Recharts, mail-volym, svarstid, top-avsändare
- Saved views: anpassade filterkombinationer, 4 default-vyer, reorder
- Thread UX: inline-svar, forward per meddelande, deltagarlista, timestamp tooltip
- Brain Core insights: learning dashboard, kontaktintelligens, röstprofiltest
- 271 tester (server)

### ✅ v1.2.0 — Daily Driver Features
- Bulk actions: multi-select inbox, arkivera/trash/läst/klassificera, keyboard shortcuts
- Custom labels: färg-taggar, tråd-tilldelning, label-hantering, bulk
- Email signatures: per-konto HTML-signaturer, auto-insert i compose
- Contact autocomplete: type-ahead, senaste kontakter, chip-mottagare
- Undo send: 10s fördröjning, avbryt, countdown-toast, konfigurerbart
- Attachment preview: thumbnails, lightbox, nedladdning, inline bildgrid
- Advanced search: filter, datumintervall, bilagor, sökhistorik, spara som vy
- 395 server + 94 client tester

### ✅ v1.3.0 — Communication Flow (2026-04-01)
- Thread view overhaul: HTML-rendering (DOMPurify), quoted text collapse, message accordion
- Inline reply & forward: reply box i tråd, reply/reply-all/forward, snabb-svar
- Keyboard shortcuts: vim-stil navigation (g i/d/s/c, j/k, r/a/f/e), help overlay, `?` trigger
- Real-time SSE: event stream `/events/stream`, live inbox, anslutningsindikator, auto-reconnect
- Snooze UI + quick actions: snooze-picker, hover-actions, svep-gester (mobil), auto-unsnooze
- Performance: cursor pagination, infinite scroll (SWR infinite), virtual list, optimistiska uppdateringar
- Settings + onboarding: unified sidebar-layout, 5-stegs wizard, compact mode, externa bilder
- 443 server + 129 client tester — alla gröna

## Nuläge (2026-04-06)

- **Git**: utgå från `git status` i arbetskopian för aktuell sanning; dokumentet lovar inte ren worktree
- **Version**: 2.14.0 (Sprint 21 klar)
- **Deploy**: Vercel + Render triggas automatiskt på push till main
- **Tester**: 1396 server (75 filer) + 153 client (13 filer) = 1549 totalt

## Completed Security Sprint (2026-04-02)

All 7 issues from the security review have been fixed and merged to main:
- ✅ S1: API key prefix removed from startup log (index.ts)
- ✅ S2: Webhook Pub/Sub token verification added (webhooks.ts + env.ts)
- ✅ S3: XSS in signature preview fixed (sanitizeHtml applied)
- ✅ S4: XSS in compose text extraction fixed (DOMParser)
- ✅ W3: Rate limiting on search endpoints (30 req/min)
- ✅ W4: Gmail token refresh error logging added
- ✅ W5: MIME type whitelist validation on attachment upload
- ✅ W1/W2: Already resolved (send_at validation existed, no CSV export)

## Completed TypeScript Sprint (2026-04-02)

- ✅ `client/lib/api.ts`: 0 `any` kvar (var ~80). 24 typade interfaces i `types.ts`
- ✅ `brain-core.ts`: Alla `request.body as any` ersatta med Zod-schemas (4 st)
- ✅ `threads.ts`: Typade ValidAction i batch route
- ✅ Security tests: 3 testfiler (server security-sprint, server security, client security-sprint)
- ✅ Lokala feature-branches städade (codex/calendar-invite-awareness, feat/sprint2-docs-and-config, master)
- Totalt: 56 testfiler (43 server + 13 client)

## Completed AI Triage Sprint (2026-04-06) — v2.0.0

### ✅ Sprint 3 — Gmail Push Sync
- `gmail-push.service.ts` — Pub/Sub push notifications replacing 5-min polling
- `POST /api/v1/gmail/webhook` — push receiver, token verification, triage chaining
- Polling fallback 30 min, watch renewal every 24h

### ✅ Sprint 4 — Granskning-vy + Regelförslag
- `review.ts` routes — keep/trash/create_rule decisions on unknown-sender threads
- `rule-suggestion.service.ts` — auto-learning from trash patterns (≥2 same domain → suggestion)
- `client/app/review/page.tsx` — full review UI with confidence indicators

### ✅ Sprint 5 — Auto-Draft med Tonanpassning
- `ai.service.ts`: `generateDraftWithTone()` with RecipientType (authority/business/personal/unknown)
- Auto-drafts created as `{ status: 'pending', source: 'auto_triage' }` — never auto-approved
- `GET /drafts/pending` + banner in drafts UI

### ✅ Sprint 6 — Brain Core Integration
- `brain-core-webhook.service.ts` — 4 outbound event types, fire-and-forget, never throws
- Agent: `triage-status`, `triage-override`, `review-queue`, `rule-suggest` actions
- Extended briefing with `triage_today` block

### ✅ Sprint 7 — Cleanup Cron + Rapport + Röst
- `cleanupTriageLogs()` — daily 02:00, deletes triage_log entries > 30 days old
- `GET /api/v1/triage/report` — period/action/sender/classification grouping
- Agent `triage-report` with voice-friendly Swedish summary
- `client/app/triage/page.tsx` — full triage rapport UI

### ✅ TypeScript fixes
- `auth.ts`: 4× `as any` replaced with `'reauthed' in result` type narrowing
- Remaining `as any` are Prisma JSON fields — acceptable per spec

## Completed Sprint 8 — Polish & Resilience (2026-04-06) — v2.1.0

### ✅ i18n för review + triage sidor
- `review` och `triage` nyckelsektioner tillagda i sv/en/es/ru
- `client/app/review/page.tsx`: all hårdkodad svenska ersatt med `t.review.*`
- `client/app/triage/page.tsx`: perioder, actions, klassificeringar, headers via `t.triage.*`

### ✅ Förstärkt AI circuit breaker (W6)
- Ny `CircuitState` per provider: `blockedUntil`, `consecutiveFailures`, `lastFailureAt`
- Permanent fel (402, billing): blockeras 1 timme
- Rate-limit (429): blockeras 2 minuter  
- Transient (5xx): blockeras 30s efter 3 konsekutiva fel inom 1 minut
- `recordSuccess()` återställer circuit direkt
- `recordFailure()` öppnar circuit med rätt duration baserat på feltyp
- 18 nya tester i `sprint8-circuit-breaker.test.ts`

## Completed Sprint 9 — i18n Completion + Route Tests (2026-04-06) — v2.2.0

### ✅ i18n för activity + notifications sidor
- `activity`: ny nyckel `subtitle`, `noLogs`, `noLogsDescription`, `loadMore` + 5 nya actionTypes (thread_archived, thread_trashed, classification_override, alert_high_priority, sync)
- `notifications`: `subtitle`, `refresh`, `allAccounts`, `emptyDescription`, 5 label-nycklar (threadArchived, threadTrashed, draftApproved, draftSent, classificationChanged)
- `time`: lade till `yesterday` och `daysAgo`
- Alla 4 språk (sv/en/es/ru) uppdaterade
- `activity/page.tsx` + `notifications/page.tsx`: all hårdkodad svenska borttagen, helper-funktioner använder `t.*`

### ✅ Route-tester för review + triage (Sprint 9)
- `sprint9-review-triage.test.ts`: 21 tester
  - GET /review: tom kö, sammanslagning av triage-metadata, saknad analys
  - POST /review/decide: Zod-schema validering (keep/trash/create_rule)
  - Rule suggestions: generateSuggestions, acceptSuggestion, dismissSuggestion
  - Triage report: period window (today/week/month), aggregering, radgruppering, schema-validering

## Completed Sprint 10 — i18n Search + Agent Tests (2026-04-06) — v2.3.0

### ✅ i18n för search-sidan
- `search` sektion (38 nycklar) tillagd i sv/en/es/ru
- `client/app/search/page.tsx`: all hårdkodad svenska/engelska ersatt med `t.search.*`
  - `CLASSIFICATION_LABELS` flyttad inuti komponenten, använder `t.triage.class*`
  - `formatRelativeTime()` använder `t.notifications.today/yesterday`
  - `activeFilterChips()` använder `t.search.chip*` med `.replace('{value}', ...)` 
  - Alla toast-anrop använder `t.search.errorDelete/historyCleaned/errorClearHistory/viewSaved/errorSaveView`
  - Alla JSX-strängar (placeholder, labels, filter options, empty state) via `t.search.*`
  - Prioritet-options använder `t.dashboard.high/medium/low`
  - `t.inbox.noSubject` för ämnesfallback

### ✅ Enhetstester för agent-actions (Sprint 6.1)
- `sprint10-agent-actions.test.ts`: 24 tester
  - `approve-rule`: anropar acceptSuggestion korrekt, saknad param, DB-fel propageras
  - `dismiss-rule`: anropar dismissSuggestion korrekt, saknad param, fel propageras
  - `review-keep`: anropar modifyLabels med INBOX, 404 vid saknad tråd
  - `review-trash`: anropar trashThread, triggar checkAndCreateSuggestion för avsändarmail, skippar om inga deltagare
  - `inbox-status`: rätta counts från DB, triage-stats aggregering, klassificeringsaggregering, tom data

## Completed Sprint 11 — i18n Completion + Route Tests (2026-04-06) — v2.4.0

### ✅ i18n för settings, drafts och dashboard
- **44 nya nycklar** tillagda i sv/en/es/ru:
  - `settings`: navAccounts, navBrainCore, navAnalytics, navTemplates, navActivity, navSearch, bookingLink/Placeholder/Hint, undoSendDelay, disconnectTitle/Description/Button, dailySummaryError, generateNew
  - `drafts`: toastApproved, discardFailed, bulkSelected/Approve/Deselect, autoDraftsBanner, autoApprove/Discard, toastDiscarded, confirmSend/DiscardTitle/Description/Button
  - `dashboard`: aiSummaryError, actionError, sortingTitle/Archive/Delete/Apply/Applying/Ignore, classifying, classifyNow, syncFailed, bulkClassifyResult
  - `followUps`: markCompleteError
- `client/app/settings/page.tsx`: nav-länkar, `(t as any)` casts → `t.settingsSections.*`, bookingLink/hint, undo-delay, disconnect ConfirmDialog
- `client/app/drafts/page.tsx`: toast-meddelanden, bulk-knappar, auto-drafts banner, ConfirmDialog för skicka/kasta
- `client/app/page.tsx` (dashboard): AI-summary error, action error, sorting proposal strings, followUps cleanup av `?.` optional chaining, classifying, daily summary error

### ✅ Route-tester för drafts + threads (Sprint 11)
- `sprint11-drafts-threads.test.ts`: 29 tester
  - `buildThreadPage`: cursor pagination (limit, nextCursor base64-format, null för tom lista, null lastMessageAt)
  - `buildMessageLookupWhere`: OR-query för id/gmailMessageId
  - `POST /drafts/:id/send`: 200 på success, 403 på SECURITY-fel (pending draft), 404/500 för övriga fel
  - `POST /drafts/:id/schedule`: validering av send_at (saknas, ogiltigt datum, förflutet), 404/400 fel, 200 på success
  - `POST /threads/batch`: input-validering (tom array, okänd action), dispatch för alla 6 actions (archive/trash/read/unread/star/unstar), partial failure med allSettled, 0 results

## Completed Sprint 12 — i18n accounts/brain-core + Webhook + Action-log Tests (2026-04-06) — v2.5.0

### ✅ i18n för settings/accounts + settings/brain-core
- 15 nya nycklar i `settings` sektionen (sv/en/es/ru): accountDefaultUpdated/UpdateError, accountInactivated/Activated/UpdateError, accountDisconnected/DisconnectError, accountSaveError, accountSyncStarted/Failed, cleanTestData/Cleaning/ConfirmTitle/ConfirmDesc, brainCoreNotSeeded
- `client/app/settings/accounts/page.tsx`: alla toast-meddelanden (set-default, toggle-active, disconnect, save, sync) via `t.settings.*`
- `client/app/settings/brain-core/page.tsx`: "Rensa test-data" heading/button, ConfirmDialog title/description/labels, "Brain Core inte seedat?" heading

### ✅ Webhook-tester (säkerhetskritisk route)
- `sprint12-webhooks.test.ts`: 16 tester
  - Token verification: rätt token → processas, fel token/saknar/ingen Bearer-prefix → 200 men skippas
  - Ingen token konfigurerad → processas fritt
  - Message parsing: saknas body/message/data, ogiltig base64, saknar emailAddress/historyId, null body
  - Triage chaining: handleNotification anropas med korrekt data, autoTriageNewThreads anropas om accountInfo returneras, skippas om null
  - Error resilience: handleNotification kastar → 200, autoTriageNewThreads kastar → 200
  - **Alltid 200** — Google-retry prevention

### ✅ Action-log-tester
- `sprint12-action-logs.test.ts`: 12 tester
  - Delegation med userId, default page=1/limit=50, strängparsning av page/limit
  - Alla filter (action_type, target_type, target_id) passas korrekt
  - Response-form: logs-array, pagination (page/limit/total/totalPages)
  - Pagination-aritmetik: ceil(total/limit), 0 vid inga logs

## Completed Sprint 13 — Command Center + Analytics + AI Route Tests (2026-04-06) — v2.6.0

### ✅ Bugfix: command-center.ts — participant email comparison
- `high_priority_senders` extraction compared participant emails against account IDs instead of account email addresses
- Fixed: added `accountEmails = new Set(accounts.map(a => a.emailAddress))` and used `.has(e)` instead of comparing against `accountIds`

### ✅ Route-tester för command-center (Sprint 13)
- `sprint13-command-center.test.ts`: 14 tester
  - Overview counts: pending/approved drafts, unanalyzed = totalThreads - analyzedThreads (6 thread.count calls), zero accounts
  - Priority breakdown (high/medium/low)
  - high_priority_senders: external participant extract, fallback to first, fallback to subject word, fallback '—', empty list
  - per_account_stats: unread + highPriority merged from two groupBy results
  - Response shape: all top-level keys, all overview fields, recent_actions limit

### ✅ Route-tester för analytics (Sprint 13)
- `sprint13-analytics.test.ts`: 30 tester
  - Days clamping: default 30, custom, max 365 (clamp), min 1 (valid), NaN→30
  - mailPerDay bucketing: zero-initialized, sorted ascending, correct received count, out-of-window ignored, sent count, null sentAt skipped
  - Classification distribution: priorityMap always has high/medium/low (pre-seeded), classification/priority counts, rule-engine excluded from aiClassifications, empty case
  - topSenders: sorted desc, max 10, lowercase normalization, null/empty fromAddress ignored
  - avgResponseTimeHours: null when empty, mean calculation, single thread
  - Totals: received/sent/analyzed counts, all zeros on empty DB
  - Response shape: all top-level keys, amanda block fields, period fields

### ✅ Route-tester för AI-routes (Sprint 13)
- `sprint13-ai-routes.test.ts`: 22 tester
  - analyze-thread validation: 400 on missing/invalid thread_id (UUID required), 404 not found, 400 no messages, 503 AI_ERROR on AI failure
  - analyze-thread auto-draft: created for external sender + reply action, NOT created for non-reply action, NOT created for noreply/mailer-daemon senders
  - generate-draft: 400 on schema validation failure, 404 account not found, 503 AI_ERROR, 400 empty recipients, 200 success with to_addresses
  - bulk-classify: limit default=10/custom/clamped to 20, rule-first (AI not called when rule matches), AI called when no rule, MAX_AI=10 cap (threads 11+ skipped), failed threads skipped, response shape

## Completed Sprint 14 — Thread i18n Calendar Keys + Agent Route Tests (2026-04-06) — v2.7.0

### ✅ i18n: 35 kalendernycklar i thread-sektionen
- Alla 4 språkfiler (sv/en/es/ru) fick 35 nya nycklar i `thread`-sektionen:
  - Mötesinbjudan: inviteAcceptDraftCreated, inviteDeclineDraftCreated, inviteAcceptedInCalendar, inviteDeclinedInCalendar
  - Bokningslänk: bookingLinkCopied, createBookingDraft, copyBookingLink, openBookingLink, addBookingLink
  - Tillgänglighet: noAvailabilityFound, availabilityLoaded, loadAvailability, loadingAvailability, availabilityPreview, createAvailabilityDraft
  - Kalenderreservation: calendarEventCreated, reserveCalendarSlot, reservingCalendarSlot, calendarEventCreatedInline, heldSlotDraftCreated, createHeldSlotDraft, releaseCalendarEvent, openCalendarEvent, calendarEventReleased
  - Mötesdetektion: meetingIntentDetected, meetingIntentWithLink, meetingIntentMissingLink
  - Kalenderanslutning: connectCalendar, connectCalendarWrite
  - Svar på inbjudningar: acceptInviteInCalendar, declineInviteInCalendar, createInviteAcceptDraft, createInviteDeclineDraft, bookingDraftCreated, availabilityDraftCreated
- `client/app/threads/[id]/page.tsx`: alla 39 `(t.thread as any).KEY ?? 'fallback'` ersatta med `t.thread.KEY`
- TypeScript kompilerar rent — inga `as any` kvar för kalendernycklar

### ✅ Route-tester för agent.ts (Sprint 14)
- `sprint14-agent.test.ts`: 41 tester
  - X-API-Key auth: tom nyckel → 401, fel nyckel → 401, korrekt → 200
  - Action-validering: okänd action → 400, inga aktiva konton → 503
  - callback_url: giltig URL → 202, ogiltig URL → 400
  - briefing: response-form (unread_count, high/medium_priority, triage_today), priority-separering
  - classify: saknar thread_id → 400, tråd ej hittad → 404, success → analysis shape
  - draft: saknar instruction → 400, inga mottagare → 400, success
  - send (SAFETY GATE): saknar draft_id → 400, ej funnen → 404, pending → 409, godkänt → skickar
  - schedule: saknar params → 400, ogiltigt datum → 400, ej hittad → 404, success
  - snooze: saknar params → 400, ogiltigt datum → 400, tråd ej hittad → 404, success
  - triage-status: byAction-aggregering, today-period
  - triage-report: ogiltig period → "today", week/month korrekt, tom voice summary, fylld voice summary med rätt tal
  - stats: response-form (unread, high_priority, snoozed, pending_drafts, accounts)
  - batch: tom array → 400, >10 → 400, inga aktiva konton → 503
  - Felhantering: Prisma/database-meddelanden sanitiseras → "Databasfel — försök igen om en stund."

## Completed Sprint 15 — Auth + Drafts Route Tests (2026-04-06) — v2.8.0

### ✅ Route-tester för auth.ts (Sprint 15)
- `sprint15-auth.test.ts`: 21 tester
  - OAuth callback (GET /auth/google/callback): saknar code → 400; normal login → redirect ?token=...; addedAccount → redirect ?token=...&added=...; reauthed → redirect ?reauthed=... + optional feature= + return_to=; throws → redirect ?error=...
  - Reauth (GET /auth/google/reauth): saknar account_id → 400; skickar feature + return_to till getReauthUrl
  - Provider detection (POST /auth/connect): ogiltig email → 400; OAuth → authUrl; IMAP-provider → requiresImap=true; OAuth-fel + IMAP-fallback → requiresImap+message; OAuth-fel, ingen IMAP → 400
  - User settings (PATCH /user/settings): upsert med userId; undoSendDelay clampad 0-30 (Zod enforces max); bookingLink-valideringsfel → 400; returnerar uppdaterade inställningar

### ✅ Route-tester för drafts.ts (Sprint 15)
- `sprint15-drafts.test.ts`: 38 tester
  - POST /drafts: schema-validering, 201 + draft, delegerar userId
  - GET /drafts: delegerar till draftService.list med options
  - GET /drafts/pending: returnerar auto_triage pending, tom lista
  - GET /drafts/:id: 404 vid fel
  - PATCH /drafts/:id: schema-valideringsfel, 404 (not found), 400 (other error), success
  - POST /drafts/:id/approve: 404, success + learning event fire-and-forget
  - DELETE /drafts/:id/schedule: 404, rensar scheduledAt
  - POST /drafts/:id/attachments: 404 draft, 400 ingen fil, 400 för stor (>25MB), 400 otillåten MIME, 201 success (data ej returneras), alla tillåtna MIME-typer
  - DELETE /drafts/:id/attachments/:attachmentId: 404, tar bort rätt bilaga
  - POST /drafts/:id/discard: 404, success
  - POST /drafts/:id/send-delayed: 404, fel status → 400, delay=0 → skickar direkt, pending → godkänns först, använder user settings undoSendDelay
  - POST /drafts/:id/cancel-send: 404, fel status → 400, ingen scheduledAt → 400, förflutet datum → 400, success (cancelled: true)

## Completed Sprint 21 — Category Service + SMTP + Brain-Core Webhook + Utils Tests (2026-04-06) — v2.14.0

### ✅ category.service.ts (Sprint 21)
- `sprint21-category-service.test.ts`: 30 tester
  - ensureDefaults: returnerar befintliga utan seeding, skapar 7 system-kategorier, isSystem=true, innehåller spam/important/business
  - create: slug från name (lowercase, bindestreck), strippar specialtecken, strippar ledande/avslutande bindestreck
  - matchRules: returns null utan regler, exakt match (case-insensitive), partiell adress → ingen match, domän-wildcard *@domain.com, domän-wildcard fel domän, *@sub.domain.com, glob *keyword*, glob utan match, glob case-insensitive, exact-sender match overrider subject-pattern (rule 1 fires before rule 4), invalid regex → skippar utan kast, returnerar första matchande regel, frågar bara aktiva regler
  - classifyThreads: tom map vid ingen match, mappar category/action/rule, inkrementerar timesApplied, processar flera trådar oberoende
  - deleteCategory: kastar 'Cannot delete system categories', raderar icke-system
  - createRule: categoryId=null utan slug, löser categoryId från slug, subjectPattern=null default

### ✅ smtp.service.ts (Sprint 21)
- `sprint21-smtp-webhook-utils.test.ts` (delvis): 14 tester
  - getCredentials (via sendEmail): icke-imap→kastar, saknar smtpHost→kastar, saknar password→kastar
  - sendEmail: from="Namn" <email> med displayName, bare email utan displayName, multiple to→kommaseparerat, cc+bcc→kommaseparerat, tom cc/bcc→utelämnas, inReplyTo+references, bilagor base64→Buffer, bodyHtml inkluderas, returnerar messageId
  - testConnection: success=true, success=false+error vid verify-fel

### ✅ brain-core-webhook.service.ts (Sprint 21)
- `sprint21-smtp-webhook-utils.test.ts` (delvis): 7 tester
  - Ingen URL→no-op (fetch ej kallat), posts med event/data/timestamp/source, X-Webhook-Secret-header när konfigurerat, INTE header utan secret, HTTP-fel→kastar ej (warn only), nätverksfel→kastar ej (warn only), Content-Type: application/json

### ✅ utils/sanitize.ts + utils/return-to.ts (Sprint 21)
- `sprint21-smtp-webhook-utils.test.ts` (delvis): 30 tester
  - sanitizeLabel: versaler, siffror, -/_, svenska tecken, raderar mellanslag+special, raderar @, trunkerar till 50
  - isValidEmail: standard, subdomain, plus-alias, saknar @, saknar domän, saknar TLD, tom, trimmar whitespace
  - sanitizeSearch: strippar kontrollkod, strippar DEL, trimmar, trunkerar till 200, bevarar normal text, bevarar unicode
  - sanitizeReturnTo: undefined→undefined, tom→undefined, /path→godkänd, /nested/path→godkänd, //→blockeras, http://→blockeras, https://→blockeras, relativ sökväg→blockeras

## Completed Sprint 20 — Brain-Summary + Docs + Events + Labels Route Tests (2026-04-06) — v2.13.0

### ✅ Route-tester för brain-summary.ts (Sprint 20)
- `sprint20-brain-summary-docs-events.test.ts` (delvis): 12 tester
  - generated_at är ISO-sträng
  - Accounts mappas korrekt (email, is_default, provider, label)
  - Filtrerar accounts på isActive:true
  - summary-counts: unread/important/pending/approved korrekt
  - important_threads: participant_count från participantEmails.length, analysis=null vid tom analyses
  - **SÄKERHET**: pending_drafts innehåller ALDRIG body_text
  - **SÄKERHET**: Prisma-select för drafts saknar body_text/bodyText
  - pending_drafts mappas till extern form (account, account_label, created_at)
  - daily_summary mappas korrekt, null vid ej genererad
  - Tomt konto → tomma arrayer
  - Thread-query begränsad till 7 dagar bakåt

### ✅ Route-tester för docs.ts (Sprint 20)
- `sprint20-brain-summary-docs-events.test.ts` (delvis): 6 tester
  - version='1.0', base='/api/v1'
  - total === endpoints.length
  - Säkerhetsflaggor: never_auto_send, never_auto_delete, draft_gate
  - Varje endpoint har method/path/auth/stable/description
  - /docs listar sig själv med auth:false
  - note nämner BRAIN-OS + /api/v1/ prefix

### ✅ Route-tester för events.ts (Sprint 20)
- `sprint20-brain-summary-docs-events.test.ts` (delvis): 10 tester
  - GET /events/stream: saknar token→401, ogiltig JWT→401, ingen userId i payload→401, giltigt token→skriver SSE-headers+200, sub-claim accepteras
  - emitToUser: ingen anslutning→inget fel, anropar send per connection, fortsätter vid kastande send, anropar ej fel användares connections

### ✅ Route-tester för labels.ts (Sprint 20)
- `sprint20-labels.test.ts`: 32 tester
  - GET /labels: seedar 5 defaults vid count=0 (skipDuplicates), seedar INTE när labels finns, returnerar sorterade på position asc
  - POST /labels: saknar name→400, tomt/whitespace→400, duplicate→409, 201 success, defaultfärg #6B7280, icon=null default, trimmar name, position=0 vid null max
  - PATCH /labels/:id: 404, uppdaterar bara angivna fält, trimmar name, uppdaterar position separat
  - DELETE /labels/:id: 404, raderar och returnerar deleted:true
  - POST /threads/:id/labels: 404 tråd, tar bort alla befintliga + skapar nya, validerar att labelIds tillhör user, anropar ej createMany vid 0 giltiga, returnerar updated-count
  - DELETE /threads/:id/labels/:labelId: 404 tråd, raderar specifik koppling
  - POST /threads/bulk/label: ej array→400, tom array→400, 404 label, tilldelar och returnerar count, filtrerar bort trådar ej tillhörande user, verifierar label-ägande

## Completed Sprint 19 — Follow-Ups + Push + Views + Templates Route Tests (2026-04-06) — v2.12.0

### ✅ Route-tester för follow-ups.ts (Sprint 19)
- `sprint19-followups-push.test.ts` (delvis): 17 tester
  - GET /follow-ups: returnerar reminders med isCompleted:false filter, inkluderar thread-detaljer, tom lista
  - POST /threads/:id/follow-up: saknar remind_at→400, tråd ej hittad→404, skapar reminder med korrekt data, konverterar remind_at string→Date, note=null när ej angiven, verifierar ägande via account.userId
  - PATCH /follow-ups/:id/complete: 404, sätter isCompleted=true, letar upp med id+userId
  - DELETE /follow-ups/:id: 404, raderar och returnerar ok:true, raderar ej utan ownership

### ✅ Route-tester för push.ts (Sprint 19)
- `sprint19-followups-push.test.ts` (delvis): 10 tester
  - POST /push/subscribe: saknar endpoint→400, endpoint ej URL→400, saknar keys→400, tom p256dh→400, upsert returnerar 201, upsert med compound key userId_endpoint
  - DELETE /push/subscribe: saknar endpoint→400, deleteMany + ok:true, sväljer deleteMany-fel tyst
  - POST /push/test: 403 när NODE_ENV≠development, anropar sendPushToUser i development, anropar ej sendPushToUser vid 403

### ✅ Route-tester för views.ts (Sprint 19)
- `sprint19-views-templates.test.ts` (delvis): 17 tester
  - GET /views: returnerar vyer sorterade på position asc, tom lista
  - POST /views: saknar name→400, saknar filters→400, position=max+1, position=0 vid null max, skapar vy med korrekt data, icon/sortKey=null som default
  - PATCH /views/reorder: ids ej array→400, ids saknas→400, anropar updateMany per id med rätt index, returnerar omhämtade vyer
  - PATCH /views/:id: 404, uppdaterar bara angivna fält, sort_key→sortKey
  - DELETE /views/:id: 404, raderar och returnerar ok:true

### ✅ Route-tester för templates.ts (Sprint 19)
- `sprint19-views-templates.test.ts` (delvis): 25 tester
  - GET /templates: returnerar sorterat på usageCount desc + createdAt desc, tom lista
  - POST /templates: saknar name→400, tom name→400, >200 tecken→400, skapar med korrekt data, optionella fält defaultar till null
  - PATCH /templates/:id: 404, uppdaterar bara angivna fält, body_text→bodyText/body_html→bodyHtml mapping
  - DELETE /templates/:id: 404, raderar och returnerar ok:true
  - POST /templates/:id/use: 404, inkrementerar usageCount med {increment:1}
  - POST /templates/generate: saknar instructions→400, tom instructions→400, parsar AI JSON och skapar template, fallback body_text när JSON-parse misslyckas, JSON inuti fritext extraheras med regex, name/category från request, category defaultar till 'ai-generated', aiService.chat kastar→500, skapar ej template vid AI-fel

## Completed Sprint 18 — Calendar + Search Route Tests (2026-04-06) — v2.11.0

### ✅ Route-tester för calendar.ts (Sprint 18)
- `sprint18-calendar.test.ts`: 28 tester
  - GET /calendar/availability: saknar account_id→400, 404 konto, delegerar options (days/limit/slot_minutes/time_zone), requiresReconnect→reauthUrl med feature=calendar, ingen reauthUrl när requiresReconnect=false
  - POST /calendar/events: saknar start/end→400, 404 konto, 404 tråd, success utan tråd, buildCalendarEventSummary anropas med trådens subject, filtererar eget konto-email ur participants, requiresReconnect→reauthUrl feature=calendar_write
  - POST /calendar/events/release: saknar event_id→400, 404 konto, "Calendar event not found"→404, "Only tentative..."→400, okänt fel propageras (throws), success, requiresReconnect→reauthUrl
  - POST /calendar/invites/respond: saknar invite_uid→400, ogiltig response_status (maybe)→400, accepterar accepted/declined, 404 konto, "Calendar invite not found"→404, requiresReconnect→reauthUrl, alla params skickas korrekt till service

### ✅ Route-tester för search.ts (Sprint 18)
- `sprint18-search.test.ts`: 35 tester
  - GET /contacts/search: tom q→alla profiler (ingen EmailMessage-fråga), sökning slår ihop+deduplicerar, profil vinner över email-meddelande (samma adress), extraherar email ur "Name <email>" format, limit clampas till 30, sorteras efter recency (null-träffar sist)
  - GET /contacts/recent: returnerar kontakter, mappar emailAddress→email, limit clampas till 20, default limit=5
  - GET /search — paginering: default page=1/limit=20, page 2 skip korrekt, limit clampas till 50, response-shape (total/page/hasMore), hasMore=false på sista sidan
  - GET /search — filter-konstruktion: textfråga→OR-clause, accountId, dateFrom/dateTo som Date-objekt, hasAttachment, classification, priority, labelIds (kommaseparerad), tom labelIds ignoreras, ingen OR utan q
  - GET /search — sökhistorik: sparas när q finns, sparas när classification-filter satt, sparas INTE vid tom sökning utan filter, filter-objekt inkluderas i sparad entry
  - GET /search — mapping: latestAnalysis från analyses[0], threadLabels→labels-array
  - GET /search/history: returnerar max 20, filtreras på userId
  - DELETE /search/history: rensar allt, returnerar deleted=true
  - DELETE /search/history/:id: 404 vid ej hittad, raderar korrekt entry

## Completed Sprint 17 — Chat + Categories + Providers Route Tests (2026-04-06) — v2.10.0

### ✅ Route-tester för chat.ts (Sprint 17)
- `sprint17-chat.test.ts`: 49 tester
  - chatAuthMiddleware: korrekt API-nyckel → userId från konto, inga aktiva konton → 403, fel nyckel → JWT auth, ingen nyckel → JWT auth
  - POST /chat/command — alla 8 kommandon: inbox_summary, mark_spam (saknar sender_pattern→500), categorize (saknar params→500), list_rules, list_categories, filter_threads (alla params, undefineds), create_category (saknar name→500, success), remove_rule (saknar rule_id→500, success)
  - Okänt kommando → type:'error' med kommandonamnet
  - Felhantering: Prisma-fel sanitiseras → "Kunde inte hämta data…", icke-Prisma-fel passeras igenom
  - recordLearning triggas efter success, ej vid fel
  - POST /chat/ask — tom/whitespace → 400; keyword routing: sammanfatta→getInboxSummary, sammanfatta med thread_ids→getFilteredThreads, spam (email/domain/kända mönster: github ci/skool, ci/cd→subjectPattern), regler/kategorier/viktig/olästa, statistik/"hur många"; AI fallback → type:'ai_response'; Prisma-sanitering i error path

### ✅ Route-tester för categories.ts (Sprint 17)
- `sprint17-categories-providers.test.ts` (delvis): 25 tester
  - GET /categories: returnerar från service, tom lista
  - POST /categories: saknar name→400, tom name→400, >100 tecken→400, success med optionella fält
  - DELETE /categories/:id: delegerar korrekt
  - GET /categories/rules: returnerar från service
  - POST /categories/rules: saknar action→400, saknar category_slug→400, saknar sender_pattern→400, skapar regel, priority konverteras till sträng, undefined priority
  - DELETE /categories/rules/:id: delegerar korrekt
  - POST /categories/classify: inga konton/trådar→classified=0, korrekt räkning, extraherar extern avsändare, fallback till första deltagare

### ✅ Route-tester för providers.ts (Sprint 17)
- `sprint17-categories-providers.test.ts` (delvis): 8 tester
  - POST /providers/detect: ogiltig email→400, saknar email→400, oauth→provider+authUrl, oauth-fel→requiresOauth, imap→imapDefaults+smtpDefaults, oauth utan imapDefaults→undefined
  - GET /providers: returnerar mappad lista, tom lista, utesluter imapDefaults vid frånvaro

## Completed Sprint 16 — Threads + Accounts Route Tests (2026-04-06) — v2.9.0

### ✅ Route-tester för threads.ts (Sprint 16)
- `sprint16-threads.test.ts`: 64 tester
  - GET /threads: UUID-validering på account_id, 404 för ej tillhörande konto, 200 med threads + total
  - GET /threads/:id: 404, latestAnalysis=null, latestAnalysis från analyses[0], smart reply triggas (unread + high-priority + question), ej triggas (isRead=true, priority≠high, ingen frågemarkering)
  - POST /threads/:id/spam: 404, 409 provider, 502 gmail-fel, skapar sender rule, uppdaterar befintlig rule
  - POST /threads/:id/read: 404, 409 (imap), 502 gmail-fel, 200 markerar som läst
  - POST /threads/:id/star: 404, 409, 200 stjärnmärkt
  - POST /threads/:id/unstar: 200
  - POST /threads/:id/archive: 404, 409, INBOX borttagen från labels
  - POST /threads/:id/trash: 404, TRASH tillagd + INBOX borttagen
  - POST /threads/:id/restore: 404, 200
  - POST /threads/:id/snooze: saknar until→400, ogiltigt datum→400, 404, snoozedUntil satt som Date
  - DELETE /threads/:id/snooze: 404, snoozedUntil=null
  - PATCH /threads/:id: 404, labels-uppdatering, recordLearning triggas vid priority/classification, ej vid labels-only
  - POST /threads/sync: saknar account_id→400, 404, 401 invalid_grant, 200, max_results clampas till 50
  - POST /threads/:id/sync-messages: 404, 401 (3 feltyper: invalid_grant/Token expired/Invalid Credentials), 502, 400 inga meddelanden, 200
  - POST /threads/bulk/archive: tom array, delvisa fel räknas korrekt, success
  - POST /threads/bulk/classify: tom array, saknar classification, hoppar threads utan analys, success
  - POST /threads/bulk/priority: tom array, saknar priority, success

### ✅ Route-tester för accounts.ts (Sprint 16)
- `sprint16-accounts.test.ts`: 46 tester
  - GET /accounts: tom lista, _count.threads → threadCount, _count borttagen
  - POST /accounts/imap: ogiltig email→400, saknar imap_host→400, tom password→400, 409 duplicate, 400 connection failed, 201 success, lösenord krypterat, default-port 993/465
  - POST /accounts/test-imap: ogiltig email→400, delegerar till emailProviderFactory, returnerar råresultat inkl. failure
  - PATCH /accounts/:id: ogiltig color→400, ogiltig account_type→400, ogiltig ai_handling→400, 404, success, giltig hex-färg, null signature
  - POST /accounts/set-default: saknar account_id→400, 404, kör transaction, 200
  - DELETE /accounts/:id: 404, skyddar sista kontot (400), raderar + loggar, returnerar email
  - POST /accounts/:id/sync: 404, startar sync
  - POST /accounts/:id/badges: okänd badge→400, undefined→400, 404, redan satt→"Badge already set", lägger till badge, alla 3 giltiga badges accepteras
  - DELETE /accounts/:id/badges/:badge: 404, tar bort badge, idempotent vid saknad badge
  - GET /accounts/:id/signature: 404, returnerar signature-objekt
  - PUT /accounts/:id/signature: 404, sparar text, sparar HTML + use-flags, partiell uppdatering

## TODO (prio-ordning)

### Post-deploy (manuellt)
1. **Seed Brain Core** — kör `npm run seed:brain-core` en gång i Render Shell
2. **Sätt GOOGLE_PUBSUB_VERIFICATION_TOKEN** i Render dashboard
3. **Städa remote branches** — `origin/codex-meeting-calendar-flow`, `origin/codex/calendar-hold-release`

### ⏳ Framtida (bygg inte nu)
- n8n workflow automation (ersätt setInterval-cronjobs)
- Microsoft OAuth
- Push notifications browser-permission prompt i onboarding

## Key API Patterns
- All API calls go through `client/lib/api.ts` which handles auth headers + base URL
- Backend base URL: `NEXT_PUBLIC_API_URL` env var on Vercel
- JWT token stored in localStorage
- 401 responses trigger redirect to `/` (root/dashboard)

## Owner
Jesper Melin (jesper.melin89@gmail.com)
GitHub: jespermelin89-ctrl
