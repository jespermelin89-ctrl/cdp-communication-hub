# Changelog

All notable changes to CDP Communication Hub are documented here.

---

## v1.0.0 — CDP Communication Hub Launch (2026-04-01)

### BUILD-SPEC-3 Sprint 6 — Final Sweep + Release
- `chore: v1.0.0 release — accessibility audit, performance check, version bump`
- Automated accessibility audit with `@axe-core/playwright` (inbox + dashboard)
- Slow-query logger in server dev mode (logs queries > 100ms)
- All 325 tests passing (231 server + 94 client vitest)
- CHANGELOG updated for all BUILD-SPEC-3 sprints
- Git tag `v1.0.0` created

### BUILD-SPEC-3 Sprint 5 — Unified Multi-Inbox
- `feat: unified multi-inbox — account tabs, color coding, per-account stats`
- **client**: Inbox header replaced with horizontal account tabs (color dots, unread badges)
- **client**: "Alla" aggregate tab with total unread count across all accounts
- **client**: Dashboard `AccountSyncCard` shows per-account unread + high-priority counts
- **server**: `GET /threads` returns `accountCounts` (per-account unread via `groupBy`)
- **server**: `GET /command-center` returns `per_account_stats` (unread + highPriority per account)
- **types**: `CommandCenterData.per_account_stats` added

### BUILD-SPEC-3 Sprint 4 — Mobile Audit
- `feat: mobile audit — touch targets, safe areas, pull-to-refresh, font sizing`
- 44px minimum touch targets on all NavItem links
- `env(safe-area-inset-bottom)` padding via `.pb-safe-bottom` and `.safe-bottom` CSS utilities
- `max-w-full overflow-x-hidden` on body; `.page-container` utility class
- Filter chips and thread timestamps bumped to `text-sm` / `min-h-[36px]`

### BUILD-SPEC-3 Sprint 3 — Agent API v2
- `feat: agent API v2 — send, schedule, snooze, compose, batch, callback webhook`
- Expanded `ALLOWED_ACTIONS`: send, schedule, snooze, export, contacts, stats, compose, chat
- `callback_url` async support — fires inner action, POSTs result to callback URL via `setImmediate`
- `POST /agent/batch` — proxies up to 20 actions in one request via `app.inject()`
- All 8 new action handlers in agent switch

### BUILD-SPEC-3 Sprint 2 — Gmail Push Notifications
- `feat: Gmail push notifications — Pub/Sub webhook, incremental sync, watch renewal`
- `GmailPushService`: `watch()`, `renewAllWatches()`, `handleNotification()`
- `POST /webhooks/gmail` — decodes Pub/Sub base64 message, triggers incremental sync
- `incrementalSync()` on `GmailService` using History API with fallback to full fetch
- Daily watch renewal registered in `sync-scheduler.service`
- CSRF exemption for `/webhooks/` routes

### BUILD-SPEC-3 Sprint 1 — Attachment Upload
- `feat: attachment upload — drag & drop compose, multipart upload, Gmail/SMTP MIME attachments`
- `@fastify/multipart` registered (25MB / 10 files limit)
- `POST /drafts/:id/attachments` and `DELETE /drafts/:id/attachments/:attachmentId`
- `Draft.attachments Json?` added to Prisma schema
- Gmail MIME multipart/mixed construction with base64-encoded attachments
- SMTP nodemailer attachment mapping
- Compose page: drag & drop zone, attachment chips, auto-create draft on first attach

### Sprint 7 — Production Readiness
- `feat: production ready — build verification, migration, env docs, README, changelog`
- Client production build verified clean (Next.js 15, 17 routes)
- Server TypeScript compilation verified clean (zero errors)
- `server/.env.example` updated with grouped sections and all required/optional vars
- `render.yaml` verified with all env vars for Render auto-deploy
- README updated: full feature list, keyboard shortcuts table, Amanda capabilities, architecture diagram, deploy guide, env var reference
- CHANGELOG created

### Sprint 6 — Integration Tests + Build Verification
- `feat: integration tests + build verification — lifecycle tests, component tests, TS audit`
- **server**: thread label state machine tests (`thread-lifecycle.test.ts`)
- **server**: draft lifecycle gate tests — pending→approved→sent, schedule, discard, markFailed (`draft-lifecycle.test.ts`)
- **server**: JWT lifecycle tests — generate, verify, tamper, iat field (`auth-flow.test.ts`)
- **server**: CSV/JSON export format tests — header columns, row build, quote escaping, archived/trashed detection (`export.test.ts`)
- **client**: ThemeProvider logic tests — isValidTheme, resolveTheme, getHtmlClass (`theme-provider.test.ts`)
- **client**: UndoQueue tests — execute, undoLast, canUndo, double-undo guard, clear (`undo-action.test.ts`)
- **client**: Inbox keyboard tests — moveFocus arithmetic, shortcut dispatch, INPUT/TEXTAREA guard, metaKey guard (`inbox-keyboard.test.ts`)
- 325 tests total (231 server + 94 client), all passing

### Sprint 5 — Notification Digest + Quiet Hours
- `feat: notification digest + quiet hours — queued notifications, morning digest, settings UI`
- **schema**: `UserSettings` gets `quietHoursStart`, `quietHoursEnd`, `digestEnabled`, `digestTime`
- **server**: `push.service` — quiet hours gate; queues notifications to ActionLog during quiet window
- **server**: `push.service` — `sendDigest()` — bundles queued overnight notifications into a single morning push
- **server**: `sync-scheduler.service` — `runMorningBriefings()` now also triggers digest for users whose digest hour matches
- **server**: `GET /user/settings` and `PATCH /user/settings` endpoints for notification preferences
- **client**: Settings page — Notifications section with quiet hours from/to selects, digest toggle, save feedback
- **i18n**: `notifications`, `quietHours`, `quietHoursFrom`, `quietHoursTo`, `digestEnabled`, `digestHint`, `saved` keys in sv/en/es/ru

### Sprint 4 — Keyboard Power User
- `feat: keyboard power user — vim-style inbox nav, visual focus, command palette actions`
- **client**: `useKeyboardShortcuts` extended with `o`/`Enter` (open), `#` (trash confirm), `s` (star), `x` (select), `u` (mark unread), `/` (focus search), `?` (shortcuts help)
- **client**: Inbox threads render with visual focus ring on keyboard-focused item
- **client**: `/` shortcut focuses the search input via `searchInputRef`
- **client**: `ShortcutsHelpModal` updated with all new shortcuts
- Shortcuts suppressed inside input elements and when Meta/Ctrl held

### Sprint 3 — Data Export
- `feat: data export — CSV/JSON thread export + brain core backup`
- **server**: `GET /threads/export?format=csv` — full thread list as CSV with 10 columns (ID, Subject, From, Date, Priority, Classification, Labels, Read, Archived, Trashed)
- **server**: `GET /threads/export?format=json` — structured JSON export
- **server**: `GET /brain-core/export` — JSON export of writing modes, contacts, rules, learning events, voice attributes, sender rules
- **client**: Settings page — Data & Backup section with three export buttons
- **i18n**: `dataBackup`, `exportMailCsv`, `exportMailJson`, `exportBrainCore`, `exportHint` keys in sv/en/es/ru

### Sprint 2 — Spam + Unsubscribe
- `feat: spam + unsubscribe — report spam, block sender, List-Unsubscribe header support`
- **schema**: `EmailMessage` gets `unsubscribeUrl` field parsed from `List-Unsubscribe` header on sync
- **server**: `gmail.service` — extracts and stores `List-Unsubscribe` URL during message upsert
- **server**: `POST /threads/:id/spam` — trash thread + auto-create/update sender rule + log action
- **server**: `POST /brain-core/sender-rules` — upsert sender rule (findFirst + conditional create/update)
- **server**: Thread GET response includes `unsubscribeUrl` from latest message
- **client**: Thread page — MoreVertical dropdown with Report Spam, Block Sender, Unsubscribe items
- **client**: `api.ts` — `reportSpam()`, `blockSender()` helpers
- **i18n**: `reportSpam`, `blockSender`, `unsubscribe`, `spamSuccess`, `blockSuccess`, `moreActions` keys in sv/en/es/ru

---

## v0.5.0 — Advanced Features

### Sprint 1 — Conversation UX
- `feat: conversation UX — message collapse, quoted text folding, thread summary`
- Individual messages in thread view collapse to single-line preview beyond the first
- Quoted reply chains (`>` prefixed blocks) folded by default with toggle
- Thread summary button (Σ) triggers AI summarization; result displayed inline
- **i18n**: `showQuoted`, `hideQuoted`, `summarize`, `summarizing`, `threadSummary` keys added

---

## v0.4.0 — Push, Snooze, Labels, Contacts

- Web Push notifications with VAPID (service worker + push subscription management)
- Snooze threads — hide until time, wake with push notification
- Label management — star, archive, trash with undo toast
- Contact auto-learn — frequent senders become contacts with relationship tagging
- Activity log — Past Actions feed showing recent system events

---

## v0.3.0 — UX Polish

- Full dark mode — Tailwind `dark:` classes everywhere, system/light/dark toggle, persisted to DB
- PWA — installable on iOS/Android, offline service worker, Web App Manifest
- i18n — Swedish (default), English, Spanish, Russian; all UI text via translation keys
- Undo toasts — 5-second undo window after archive/trash/star actions
- Infinite scroll — IntersectionObserver pagination replaces "Load more"
- Keyboard shortcuts — `j`/`k` navigation, `u`/`Esc` back, `Cmd+K` chat

---

## v0.2.0 — AI Layer

- AI classification — Groq (default) → Anthropic → OpenAI fallback chain
- Amanda morning briefing — 07:00 scheduler, DailySummary push + in-app card
- Smart reply suggestions — proposed draft for high-priority threads with open questions
- Brain Core — writing modes, voice attributes, sender rules, learning events
- Chat widget — `Cmd+K` command palette with analyze/summarize/draft/search/brief
- Priority learning — open/archive/reply events improve future triage weights

---

## v0.1.0 — Core

- Google OAuth 2.0 + JWT auth + AES-256-GCM Gmail token encryption
- Gmail sync — fetch threads/messages, upsert to PostgreSQL, 5-minute scheduler
- Inbox — Sent, Archive, Trash, Snoozed mailbox tabs with thread list
- Drafts — generate → review → approve → Gmail send queue
- Scheduled send — approve + pick delivery time; scheduler sends at the right moment
- Multi-account — connect multiple Gmail accounts per user
- CSRF protection, rate limiting, structured logging
