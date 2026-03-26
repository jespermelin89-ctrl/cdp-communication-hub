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
- AI: Anthropic Claude API (claude-sonnet-4-20250514 primary), OpenAI as fallback
- Auth: Google OAuth 2.0 + JWT sessions
- Encryption: AES-256-GCM for OAuth tokens at rest
- Hosting: Vercel (frontend), Render (backend)

## Project Structure
```
server/src/
  config/       env.ts, database.ts, oauth.ts
  routes/       auth, accounts, threads, drafts, ai, command-center, action-logs
  services/     gmail.service, ai.service, draft.service, auth.service, action-log.service,
                category.service, chat-command.service, email-provider.factory, imap.service, smtp.service
  middleware/   auth.middleware, error.middleware
  utils/        encryption, email-parser, validators
  prisma/       schema.prisma

client/
  app/          page (Dashboard), drafts/, inbox/, threads/[id]/, auth/callback/, settings/
  components/   TopBar, StatusBadge, PriorityBadge, I18nProvider, LanguageSwitcher, ChatWidget, AddImapAccountModal
  lib/          api.ts (HTTP client), types.ts, i18n/ (sv, en, es, ru translations)
```

## Database (Supabase PostgreSQL)
Tables: users, email_accounts, email_threads, email_messages, ai_analyses, drafts (CRITICAL - status gate), action_logs, user_settings, categories, sender_rules

## Deployment
- **Frontend**: Vercel — auto-deploys from GitHub main branch
  - URL: https://cdp-communication-hub.vercel.app/
  - Root directory: `client`
- **Backend**: Render — auto-deploys from GitHub main branch
  - URL: https://cdp-communication-hub.onrender.com
  - Build command: `cd server && npm install && npx prisma generate && npx prisma db push && npx tsc`
- **GitHub**: github.com/jespermelin89-ctrl/cdp-communication-hub (private)
  - Default branch: main (remote) / master (local — needs alignment)

## Current Git Status (2026-03-26)

### Unpushed commits (3, on master ahead of origin/master):
1. `564f7a8` feat: smart email import with auto-provider detection
2. `8f6057c` feat: email badge system - multi-person, AI-managed, shared inbox badges
3. `aae0a24` feat: add-account OAuth flow — link new emails to existing user

### Staged but NOT committed (14 files — i18n system):
- `client/components/I18nProvider.tsx` — React Context-based language provider
- `client/components/LanguageSwitcher.tsx` — Dropdown language switcher
- `client/lib/i18n/sv.ts` — Swedish translations (default, defines Translations type)
- `client/lib/i18n/en.ts` — English translations
- `client/lib/i18n/es.ts` — Spanish translations
- `client/lib/i18n/ru.ts` — Russian translations
- `client/lib/i18n/index.ts` — i18n exports
- `client/app/layout.tsx` — Updated with I18nProvider wrapper
- `client/components/TopBar.tsx` — Updated with LanguageSwitcher
- `client/app/page.tsx` — Updated with translations
- `client/app/inbox/page.tsx` — Updated with translations
- `client/app/drafts/page.tsx` — Updated with translations
- `client/app/settings/page.tsx` — Updated with translations
- `client/app/auth/callback/page.tsx` — Updated with translations

### Unstaged change:
- `server/src/prisma/schema.prisma` — Modified (review before committing)

## What Needs To Be Done (Priority Order)

### 1. IMMEDIATE: Commit & Push existing work
- Commit the 14 staged i18n files
- Review and stage the schema.prisma change
- Push all (3 unpushed commits + new i18n commit) to remote
- Verify Vercel + Render deployments succeed

### 2. Dashboard Redesign (client/app/page.tsx)
The current staged page.tsx has basic i18n support. Needs a visual redesign with:
- Gradient stat cards (total threads, unread, AI-analyzed, pending drafts)
- Quick action cards (Sync Email, AI Analyze, New Draft, Settings)
- Email sync status panel with per-account last-sync times
- AI classification breakdown (pie/bar chart)
- Priority distribution visualization
- Pending drafts preview with approve/discard actions
- Categories overview
- Activity feed (recent action logs)
- Real data from /api/v1/command-center endpoint

### 3. Inbox Redesign (client/app/inbox/page.tsx)
The current staged inbox has basic i18n. Needs redesign with:
- AI classification badges with color coding
- Priority indicators (urgent/high/normal/low)
- Category filter tabs
- Search functionality
- Bulk analyze/classify actions
- Click-to-expand thread preview
- Visual sender badges

### 4. Sync Scheduler Service (NEW FILE: server/src/services/sync-scheduler.service.ts)
Auto-sync service that needs to be created:
- Email sync every 5 minutes
- AI classification every 10 minutes
- Failure backoff after 3 consecutive failures per account
- Uses setInterval (no extra npm dependencies)
- Graceful lifecycle (start on DB connect, stop on SIGINT/SIGTERM)
- Import and wire up in server/src/index.ts

### 5. Auto-Updating Styrdokument
Governance document that auto-updates as the system evolves. Not yet started.

### 6. Cleanup
- Remove any temporary admin/merge-accounts endpoints
- Align branch names (local master vs remote main)

## i18n System (Already Implemented)
- React Context-based with useI18n() hook
- 4 languages: sv (default), en, ru, es
- localStorage persistence with hydration-safe loading
- LanguageSwitcher in TopBar

## Key API Patterns
- All API calls go through `client/lib/api.ts` which handles auth headers + base URL
- Backend base URL: `NEXT_PUBLIC_API_URL` env var on Vercel
- JWT token stored in localStorage
- 401 responses trigger redirect to /auth/callback

## Owner
Jesper Melin (jesper.melin89@gmail.com)
GitHub: jespermelin89-ctrl
