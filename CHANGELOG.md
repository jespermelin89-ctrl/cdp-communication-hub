# Changelog

All notable changes to CDP Communication Hub are documented here.

---

## v2.0.0 — AI Triage & Brain Core (2026-04-06)

### Sprint 1 — Smart Triage Engine
- **`server/src/services/triage-action.service.ts`**: Action executor — trash/label_review/keep_inbox/notify_then_trash/auto_draft; Gmail TRASH (reversible, never permanent delete); deploy-dedup (6h window); `Granskning` label ensured via API
- **`server/src/prisma/schema.prisma`**: `TriageLog` model with 30-day retention; `RuleSuggestion` model; `Draft.source` field for auto-triage tracking
- **`server/src/utils/auto-seed.ts`**: 17 classification rules pre-seeded on first run

### Sprint 2 — Rule Engine
- **`server/src/services/rule-engine.service.ts`**: Pattern matching across senderPatterns, subjectPatterns, classificationRules; priority ordering; maps legacy actions to TriageAction

### Sprint 3 — Gmail Push Sync (Pub/Sub)
- **`server/src/services/gmail-push.service.ts`**: `watchMailbox()` / `renewWatch()` / `handleNotification()` — Pub/Sub push replacing 5-min polling; returns `{ accountId, userId }` for downstream triage chaining
- **`server/src/routes/webhooks.ts`**: `POST /api/v1/gmail/webhook` — Pub/Sub push receiver; verifies token; triggers `autoTriageNewThreads` fire-and-forget
- Polling interval 5 min → 30 min (push is primary); watch renewal every 24h

### Sprint 4 — Granskning-vy + Regelförslag
- **`server/src/routes/review.ts`**: `GET /review`, `POST /review/:threadId/decide` (keep/trash/create_rule), `POST /rules/suggest`, `POST /rules/accept`, `POST /rules/dismiss`
- **`server/src/services/rule-suggestion.service.ts`**: Scans triage_log for domain patterns (≥2 trash from same domain); upserts RuleSuggestion; `acceptSuggestion` creates ClassificationRule
- **`client/app/review/page.tsx`**: Granskning queue with keep/trash/create-rule actions; rule suggestions panel; confidence indicators

### Sprint 5 — Auto-Draft med Tonanpassning
- **`server/src/services/ai.service.ts`**: `generateDraftWithTone()` — RecipientType (authority/business/personal/unknown) injected into AI system prompt; formal tone for Swedish authorities
- **`server/src/services/sync-scheduler.service.ts`**: `generateAutoDraft()` — creates `{ status: 'pending', source: 'auto_triage' }` draft, fires `draft.ready` webhook; `resolveRecipientType()` checks authority domains + contact profile
- **`server/src/routes/drafts.ts`**: `GET /drafts/pending` — auto-triage drafts awaiting approval
- **`client/app/drafts/page.tsx`**: AI auto-drafts banner with approve/discard actions

### Sprint 6 — Brain Core Integration
- **`server/src/services/brain-core-webhook.service.ts`**: Outbound webhook to Brain Core — events: `triage.high_priority`, `triage.unknown_sender`, `triage.completed`, `draft.ready`; fire-and-forget, never throws
- **`server/src/routes/agent.ts`**: 4 new agent actions: `triage-status`, `triage-override`, `review-queue`, `rule-suggest`; extended `briefing` with `triage_today` block

### Sprint 7 — Cleanup Cron + Triage Report + Röstkommando
- **`server/src/services/sync-scheduler.service.ts`**: `cleanupTriageLogs()` runs daily at 02:00 via `cleanupInterval`; `runTriageCleanupNow()` exported for manual/test use
- **`server/src/routes/triage.ts`**: `GET /api/v1/triage/report?period=today|week|month&action=...` — grouped by sender + classification
- **`server/src/routes/agent.ts`**: `triage-report` action with voice-friendly Swedish summary ("Idag sorterades 22 mail bort…")
- **`client/app/triage/page.tsx`**: Triage rapport — stat cards, action breakdown, classification bars, top senders, detail table

### TypeScript & Code Quality
- **`server/src/routes/auth.ts`**: Replaced 4× `as any` with `'reauthed' in result` type narrowing
- **`client/lib/api.ts`**: Added `getReviewQueue()`, `decideReviewThread()`, `getPendingSuggestions()`, `acceptRuleSuggestion()`, `dismissRuleSuggestion()`, `getTriageReport()`, `getPendingAutoDrafts()`
- **`client/components/TopBar.tsx`**: Added Granskning + Triage nav items

### Tests
- 51 test files, 653 tests — all green
- New suites: gmail-push (14), rule-suggestion (17), auto-draft (27), sprint6-brain-core (17), sprint7-cleanup (17)

---

## v1.3.0 — Communication Flow (2026-04-01)

### Sprint 1 — Thread View Overhaul
- **client/lib/i18n**: Added `thread.collapseAll`, `thread.olderMessages`, `thread.showQuoted`, `thread.hideQuoted` keys to all 4 locales (sv, en, es, ru)
- **client/lib/sanitize-html.ts**: `wrapQuotedContent` wraps `<blockquote>` in `<details>` for quote collapse; `sanitizeHtml` strips scripts/events/dangerous elements; `replaceCidImages` proxies cid: URLs
- **client/app/threads/[id]/page.tsx**: HTML email rendered via `dangerouslySetInnerHTML` with `sanitizeHtml` + `wrapQuotedContent`; `whitespace-pre-wrap` fallback for plain text; collapsible accordion for threads > 3 messages; avatar + sender + date + To/CC header per message

### Sprint 2 — Inline Reply & Forward
- **client/app/threads/[id]/page.tsx**: Inline reply form per message with `reply`/`replyAll`/`forward` modes; quick reply box; reply goes through Draft → Approve → Send gate
- **client/lib/i18n**: Added `reply` namespace (replyPlaceholder, reply, replyAll, forward, saveAsDraft, approveAndSend, quickReplies, forwardHeader) to all 4 locales

### Sprint 3 — Keyboard Shortcuts System
- **client/lib/keyboard-shortcuts.ts**: Global shortcut registry with context switching (`global`, `inbox`, `thread`, `compose`); two-key combo support (g+i, g+d etc.); ignores input/textarea/contenteditable focus
- **client/components/GlobalShortcuts.tsx**: Already registered `?`, `/`, `cmd+k`, `cmd+n`, `cmd+shift+m`, `cmd+shift+d`
- **client/components/ShortcutsHelpModal.tsx**: `?` key opens modal; grouped shortcuts with `<kbd>` styling; Esc to close
- **client/lib/i18n**: Added `shortcuts` namespace to all 4 locales

### Sprint 4 — Real-Time Inbox Updates (SSE)
- **server/src/routes/events.ts**: `GET /events/stream?token={jwt}` — SSE endpoint; auth via JWT query param; heartbeat every 30s; event types: `connected`, `thread:new`, `thread:updated`, `draft:status`, `sync:complete`, `notification`, `thread:unsnoozed`; max 50 connections per user; cleanup on disconnect
- **server/src/index.ts**: Registered `eventRoutes` under `/api/v1`
- **server/src/services/sync-scheduler.service.ts**: Emits `sync:complete` after each sync cycle; emits `thread:unsnoozed` when threads are woken from snooze
- **client/hooks/use-event-stream.ts**: `useEventStream()` hook; auto-connect on mount; exponential backoff reconnect (1s→2s→4s→30s); invalidates SWR caches on events; fallback poll every 30s if EventSource unavailable
- **client/components/TopBar.tsx**: Green/amber/red connection status dot in header with title tooltip
- **client/lib/i18n**: Added `realtime` namespace to all 4 locales

### Sprint 5 — Snooze UI + Quick Inbox Actions
- **client/components/SnoozePicker.tsx**: Dropdown with preset times (later today +3h, tomorrow 08:00, next Monday 08:00, in 1 week, custom datetime picker); click-outside to close
- **client/hooks/use-swipe.ts**: Touch swipe handler (threshold 80px); left swipe → trash, right swipe → snooze; `navigator.vibrate(30)` haptic feedback
- **client/lib/i18n**: Added `snooze` namespace (snooze, snoozedUntil, cancelSnooze, laterToday, tomorrowMorning, nextMonday, nextWeek, customDateTime, snoozedMessage) to all 4 locales

### Sprint 6 — Performance & Virtual Scrolling
- **server/src/routes/threads.ts**: Cursor-based pagination — `cursor` query param; `nextCursor` + `hasMore` + `totalCount` in response; fetches `limit+1` to detect more pages; cursor = base64(ISO8601::id)
- **server/src/utils/validators.ts**: `ThreadQuerySchema` updated: `cursor` optional, `limit` max 50, default 25
- **client/lib/api.ts**: `getThreads()` accepts `cursor` param; returns `nextCursor`, `totalCount`, `accountCounts`
- **client/hooks/use-infinite-threads.ts**: `useInfiniteThreads()` SWR infinite hook; IntersectionObserver sentinel loads next page at 200px from bottom; caches per filter combo; exposes `sentinelRef`, `mutate`, `hasMore`, `isLoadingMore`
- **client/components/VirtualThreadList.tsx**: Renders only visible rows + 10-row buffer; `transform: translateY` absolute positioning; scroll position save/restore via sessionStorage; compact mode (72px) / normal (96px)

### Sprint 7 — Settings Consolidation + Onboarding
- **server/src/prisma/schema.prisma**: `UserSettings` extended with `hasCompletedOnboarding`, `notificationSound`, `externalImages` (ask/allow/block), `compactMode`; `npx prisma db push` applied
- **server/src/routes/auth.ts**: `PATCH /user/settings` now accepts and persists the 4 new fields
- **client/lib/api.ts**: `updateUserSettings()` accepts new fields
- **client/app/settings/page.tsx**: Added compact mode toggle, notification sound toggle, external images selector (ask/allow/block); all persisted to backend
- **client/components/OnboardingWizard.tsx**: On completion writes `hasCompletedOnboarding: true` to backend (fire-and-forget)
- **client/lib/i18n**: Added `onboarding` and `settingsSections` namespaces to all 4 locales

### Sprint 8 — v1.3.0 Release
- **server tests**: 4 new test files — `sse-events.test.ts` (7 tests), `cursor-pagination.test.ts` (7 tests), `snooze.test.ts` (10 tests), `reply-forward.test.ts` (9 tests)
- **client tests**: 3 new test files — `keyboard-shortcuts.test.ts` (9 tests), `virtual-list.test.ts` (8 tests), `onboarding.test.ts` (13 tests)
- Full test suite: 429 server tests + 124 client tests — all passing
- TypeScript: zero errors in both server and client (`npx tsc --noEmit`)
- CHANGELOG updated with complete v1.3.0 history
- Version bumped to 1.3.0 in client/package.json and server/package.json
- Git tag `v1.3.0` created

---

## v1.2.0 — Bulk Actions, Labels, Signatures, Contacts, Undo Send, Attachments, Search (2026-04-01)

### Sprint 8 — v1.2 Release (tests, CHANGELOG, version bump, git tag)
- 7 new test files: bulk-actions (14), custom-labels (20), signatures (14), contact-search (17), undo-send (17), attachment-preview (22), advanced-search (20)
- Full test suite: 395 server tests + 94 client tests — all passing
- CHANGELOG updated with complete v1.2.0 history
- Version bumped to 1.2.0 in client/package.json and server/package.json
- Git tag `v1.2.0` created

### Sprint 7 — Advanced Search
- **server/routes/search.ts**: `GET /search` — full-text query + filters (from, to, dateFrom, dateTo, hasAttachment, classification, priority, accountId, labelIds); saves each search to SearchHistory
- **server/routes/search.ts**: `GET/DELETE /search/history`, `DELETE /search/history/:id`
- **server/prisma**: `SearchHistory` model (userId, query, filters JSON, resultCount, indexed by userId + createdAt desc)
- **client/app/search/page.tsx**: Advanced filter panel (all filter fields), active filter chips with clear button, search history panel with individual delete and clear-all, save-as-view action, skeleton loader
- **client/lib/api.ts**: `advancedSearch`, `getSearchHistory`, `clearSearchHistory`, `deleteSearchHistoryEntry`
- **i18n**: `search` namespace extended in all 4 locales (sv, en, es, ru)

### Sprint 6 — Attachment Preview
- **client/components/AttachmentPreview.tsx**: Grid of file-type icons, download-on-hover, opens ImageLightbox for images, hover overlay
- **client/components/ImageLightbox.tsx**: Fullscreen image overlay, keyboard arrow navigation, download button, ESC to close
- **server/routes/threads.ts**: `GET /threads/:threadId/messages/:messageId/attachments/:attachmentId/data` — returns base64/buffer for attachment download
- **client/app/threads/[id]/page.tsx**: Replaced pill attachment list with `AttachmentPreview` component
- **i18n**: `attachments` namespace in all 4 locales

### Sprint 5 — Undo Send
- **server/prisma**: `undoSendDelay` field on UserSettings (Int, default 5)
- **server/routes/drafts.ts**: `POST /drafts/:id/send-delayed` — sets status 'sending', scheduledAt = now + delay
- **server/routes/drafts.ts**: `POST /drafts/:id/cancel-send` — reverts 'sending' → 'approved' if scheduledAt > now
- **server/routes/auth.ts**: `PATCH /user/settings` now accepts `undoSendDelay` (clamped 0–30)
- **server/services/sync-scheduler**: `sendScheduledDrafts` handles both 'approved' and 'sending' status
- **client/components/UndoSendToast.tsx**: Countdown toast with progress bar and Ångra button; `showUndoSendToast(draftId, delaySec): Promise<'sent'|'cancelled'>`
- **client/app/compose/page.tsx**: `executeSend` calls `showUndoSendToast`, cancels if user clicks Ångra
- **client/app/settings/page.tsx**: Delay slider 0–30 s, saves to backend
- **i18n**: `undoSend` namespace in all 4 locales

### Sprint 4 — Contact Autocomplete
- **client/components/ContactAutocomplete.tsx**: Chip-style multi-address input, debounced server-backed search, keyboard navigation (arrow/enter/backspace), avatar initials
- **server/routes/search.ts**: `GET /contacts/search?q=&limit=`, `GET /contacts/recent?limit=`
- **client/app/compose/page.tsx**: To / CC / BCC replaced with ContactAutocomplete

### Sprint 3 — Email Signatures
- **server/prisma**: `signatureHtml`, `useSignatureOnNew`, `useSignatureOnReply` added to EmailAccount
- **server/routes/accounts.ts**: `GET /accounts/:id/signature`, `PUT /accounts/:id/signature`
- **client/lib/api.ts**: `getSignature`, `saveSignature`
- **client/app/settings/signatures/page.tsx**: Per-account signature editor (RichTextEditor), preview, copy-from-another-account
- **client/app/compose/page.tsx**: Auto-injects HTML signature on compose open based on useOnNew/useOnReply flags
- **i18n**: `signatures` namespace in all 4 locales

### Sprint 2 — Custom Labels
- **server/prisma**: `Label` model (userId, name, color, icon, position); `ThreadLabel` junction model
- **server/routes/labels.ts**: Full CRUD for labels + thread assignment + bulk-label; auto-seeds 5 defaults
- **server/index.ts**: Registered `labelRoutes`, `searchRoutes`
- **client/lib/types.ts**: `CustomLabel` interface; `EmailThread.threadLabels`; `Account` signature fields
- **client/app/settings/labels/page.tsx**: Label management UI — inline edit, color picker, delete confirmation
- **client/app/inbox/page.tsx**: Custom label chips rendered in thread list

### Sprint 1 — Bulk Actions
- **server/routes/threads.ts**: `POST /threads/bulk/archive`, `bulk/trash`, `bulk/read`, `bulk/classify`, `bulk/priority`
- **server/routes/labels.ts**: `POST /threads/bulk/label`
- **client/lib/api.ts**: `bulkArchive`, `bulkTrash`, `bulkRead`, `bulkClassifyThreads`, `bulkPriority`, `bulkLabel`
- **client/app/inbox/page.tsx**: Enhanced bulk toolbar (classify + priority dropdowns, blue highlight), Escape deselect, cmd+a select-all, keyboard shortcuts e / #
- **i18n**: `bulk` namespace in all 4 locales

---

## v1.1.0 — Intelligence & Power Features (2026-04-01)

### Sprint 8 — v1.1 Release (tests, CHANGELOG, version bump, git tag)
- 40 new unit tests: follow-ups, templates, analytics, saved-views (all passing)
- Full test suite: 271 server tests passing
- CHANGELOG updated with complete v1.1.0 history
- Version bumped to 1.1.0 in client/package.json and server/package.json
- Git tag `v1.1.0` created

### Sprint 7 — Brain Core Insights + Learning Dashboard
- **client**: Extended `settings/brain-core/page.tsx` with Learning and Contact Intelligence tabs
- **client**: Recharts LineChart for weekly learning trend, BarChart for event types
- **client**: Top contacts with preferred writing mode and email frequency
- **client**: Voice mode test panel — submit instruction, see AI preview
- **server**: `GET /brain-core/learning-insights` endpoint (totalEvents, byType, recentEvents, weeklyTrend, topContacts)
- **server**: `POST /brain-core/voice-test` endpoint
- **client/ChatWidget**: Follow-up intent regex + "Påminnelser" quick-action chip

### Sprint 6 — Thread UX Improvements
- **client/threads/[id]/page.tsx**: Participants chips (all unique email addresses in thread)
- **client/threads/[id]/page.tsx**: Per-message action menu (Reply inline, Forward, Copy text)
- **client/threads/[id]/page.tsx**: Inline reply form with textarea + send/cancel
- **client/threads/[id]/page.tsx**: Follow-up reminder button in thread header (Bell icon + dropdown with time presets)
- **client/threads/[id]/page.tsx**: Exact timestamp tooltip (sv-SE full date/time)
- **client/threads/[id]/page.tsx**: Click-outside handlers for message menus and follow-up dropdown
- **i18n**: Added `copy`, `send`, `sendNote` keys to `threadUx` in all 4 locales (sv, en, es, ru)

### Sprint 5 — Saved Views + Smart Filters
- **server**: `SavedView` Prisma model (id, userId, name, icon, filters JSON, sortOrder, timestamps)
- **server**: `GET/POST/PATCH/DELETE /views`, `PATCH /views/reorder` (reorder registered before /:id)
- **client/inbox/page.tsx**: Saved view chips in mailbox tab row
- **client/inbox/page.tsx**: "Spara som vy" inline form shown when filters are active
- **server/auto-seed**: 4 default saved views seeded for new users (Leads, Hög prioritet, Olästa, Stjärnmärkta)

### Sprint 4 — Analytics Dashboard
- **server**: `GET /analytics/overview?days=N` — mailPerDay, classificationDistribution, priorityDistribution, topSenders, Amanda stats, avgResponseTimeHours, activeFollowUps, totals
- **client/analytics/page.tsx**: LineChart (mail volume), PieChart (classification), BarChart (priority), horizontal BarChart (top senders), stat cards for Amanda
- Period selector: 7 / 30 / 90 days
- Dark mode throughout, Recharts responsive containers

### Sprint 3 — Email Templates
- **server**: `EmailTemplate` Prisma model (id, userId, name, subject, bodyText, bodyHtml, variables JSON, category, usageCount, isAiGenerated, timestamps)
- **server**: `GET/POST/PATCH/DELETE /templates`, `POST /templates/:id/use`, `POST /templates/generate` (AI generation via `aiService.chat`)
- **client/settings/templates/page.tsx**: Template list, create form, AI generation panel
- **client/compose/page.tsx**: Template picker panel, "Använd mall" applies subject + body
- **server/auto-seed**: 5 default templates seeded (Snabbsvar, Mötesbokningsförfrågan, Uppföljning, Introduktionsmejl, Tack och bekräftelse)

### Sprint 2 — Rich Text Compose (Tiptap)
- **client/components/RichTextEditor.tsx**: Tiptap editor with Bold, Italic, Underline, BulletList, OrderedList, Link, Blockquote toolbar
- **client/compose/page.tsx**: Editor mode toggle (rich/plain), bodyHtml passed on send
- **server**: `bodyHtml` field added to Draft model and draft service
- **server/gmail.service**: Multipart/alternative MIME for HTML+text emails
- **server/smtp.service**: `html` field in nodemailer mailOptions

### Sprint 1 — Follow-up Reminders
- **server**: `FollowUpReminder` Prisma model (id, threadId, userId, remindAt, reason, note, isCompleted, isAutoDetected, timestamps)
- **server**: `firstReceivedAt`, `firstRepliedAt`, `responseTimeHours` added to EmailThread
- **server**: `GET /follow-ups`, `POST /threads/:id/follow-up`, `PATCH /follow-ups/:id/complete`, `DELETE /follow-ups/:id`
- **server/sync-scheduler**: `autoDetectFollowUpReminders()` — finds threads awaiting reply > 48h, creates reminders, sends push notifications for due reminders
- **client/app/page.tsx**: Follow-up widget on dashboard (active reminders list)
- **client**: 7 new i18n namespaces (sv/en/es/ru): followUps, richText, templates, analytics, views, threadUx, brainInsights
- **client/lib/api.ts**: 18 new API methods added

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
