# Changelog

All notable changes to CDP Communication Hub are documented here.

---

## v1.0.0 — Launch Ready (2026-04-01)

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
