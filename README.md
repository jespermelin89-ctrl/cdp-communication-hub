# CDP Communication Hub

AI-powered communication overlay on Gmail. Reads, analyzes, classifies, and drafts responses — but **never sends or deletes autonomously**. Every outbound email follows: Read → Analyze → Draft → Review → Approve → Gmail Sends.

## Tech Stack

```
Frontend  Next.js 15 + Tailwind CSS + TypeScript    (Vercel)
Backend   Fastify + TypeScript + Prisma              (Render)
Database  PostgreSQL (Supabase / Render)
AI        Groq (default) → Anthropic → OpenAI (fallback chain)
Auth      Google OAuth 2.0 + JWT + AES-256-GCM token encryption
Tests     Vitest (unit + integration, 325 tests)
```

## Features

### Inbox & Threads
- **Mailbox views** — Inbox, Sent, Archive, Trash, Snoozed tabs with live counts
- **Infinite scroll** — IntersectionObserver-based pagination, no "Load more" button
- **Thread collapse** — Long messages auto-collapsed; quoted reply chains folded by default
- **Thread summary** — One-click AI summary for long threads
- **Bulk actions** — Select multiple threads, archive or trash in one click
- **Snooze threads** — Hide until a chosen time (1h, 3h, tomorrow, Monday, custom), then resurface with push notification

### AI & Automation
- **Amanda morning briefing** — AI-generated daily briefing at 07:00 with priority summary and key actions
- **Smart reply suggestions** — Amanda proposes a reply for high-priority unread threads with open questions
- **Auto-triage** — Rule engine → AI classification on every sync; labels threads by priority and category
- **Priority learning** — Tracks opens, archives, and replies to improve future classifications

### Drafts & Sending
- **Draft queue** — Generate → Review → Approve → (Schedule) → Gmail Sends
- **Scheduled send** — Schedule approved drafts (1h, 3h, tomorrow, Monday, custom datetime)
- **BCC support** — Add BCC recipients before approval
- **Draft discard** — Reject drafts with one click; marked as discarded in queue

### Spam & Unsubscribe
- **Report spam** — Trash thread + auto-create sender rule in one action
- **Block sender** — Blacklist a sender pattern so future messages skip the inbox
- **List-Unsubscribe** — Detects `List-Unsubscribe` headers; surfaces one-click unsubscribe link

### Notifications
- **Web Push** — VAPID push notifications for new high-priority threads and snooze wake-up
- **Quiet hours** — Configure do-not-disturb window (default 22:00–07:00); notifications queued, not lost
- **Digest** — Optional morning digest push bundles all notifications queued overnight

### Data & Export
- **CSV export** — Full thread list with subject, sender, labels, priority, classification
- **JSON export** — Structured thread export for external processing
- **Brain Core backup** — Export writing modes, contacts, rules, learning events, voice attributes as JSON

### Settings & Personalization
- **Dark mode** — Full dark mode via Tailwind `dark:` classes + system / light / dark toggle; persisted per user
- **Language** — UI available in Swedish, English, Spanish, Russian (i18n, `sv` is default)
- **Brain Core settings** — Writing modes, voice attributes, sender rules, classification rules
- **Account management** — Connect/disconnect Gmail accounts, manual sync trigger

### Infrastructure
- **Multi-account** — Support for multiple Gmail accounts per user
- **PWA** — Installable on iOS/Android, offline-capable service worker
- **CSRF protection** — Double-submit cookie pattern on all state-changing routes
- **Rate limiting** — Per-IP rate limits on auth and AI routes
- **Keyboard shortcuts** — Full vim-style inbox navigation + command palette

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `j` | Move focus down (next thread) |
| `k` | Move focus up (previous thread) |
| `Enter` / `o` | Open focused thread |
| `u` / `Esc` | Back to inbox |
| `#` | Trash focused thread (with confirm) |
| `s` | Star / unstar focused thread |
| `x` | Toggle select focused thread |
| `/` | Focus search input |
| `?` | Open keyboard shortcuts help |
| `Cmd+K` | Open AI chat widget |

Shortcuts are suppressed when focus is inside an input, textarea, or select element, and when `Meta`/`Ctrl` is held.

## Amanda's Capabilities

Amanda is an AI overlay — she always suggests, never acts autonomously:

| Capability | Trigger | Output |
|-----------|---------|--------|
| Morning briefing | Scheduler 07:00 | Push notification + in-app summary |
| Smart reply | High-priority unread with question | Draft suggestion in thread view |
| Auto-triage | On every Gmail sync | Priority + classification labels |
| Thread summary | User request (Σ button) | Collapsible summary block |
| Spam detection | Report spam action | Sender rule + trash |
| Digest | Quiet-hours end | Bundled push with queued notifications |
| Priority learning | Open / archive / reply | Updates sender weight over time |
| Chat | `Cmd+K` + any query | Inline response in chat widget |

## Architecture

```
Gmail API
    ↑
Backend (Fastify :3001)
    ├── Auth        Google OAuth 2.0, JWT sessions, AES-256-GCM token storage
    ├── Accounts    Multi-account Gmail sync, manual sync trigger, token refresh
    ├── Threads     Read, classify, analyze, mailbox filters, spam/block
    ├── Drafts      Generate → Review → Approve → (Schedule) → Gmail Send
    ├── AI          Groq / Anthropic / OpenAI broker, fallback chain, blacklist
    ├── Brain Core  Writing modes, voice attributes, classification rules, learning events
    ├── Scheduler   Sync (5m), AI classify (10m), snooze wake (1m), send (1m), briefing (07:00), digest
    ├── Push        VAPID web push, quiet hours gate, digest queue, ActionLog
    └── Chat        Command widget (analyze, summarize, draft, search, schedule, brief)
         ↑
Frontend (Next.js 15 :3000)
    ├── Dashboard   Stats, activity feed, AI summary card
    ├── Inbox       Mailbox tabs, infinite scroll, bulk actions, snooze, keyboard nav
    ├── Threads     Full thread view, collapse/expand, Amanda banner, quick reply, spam/block
    ├── Drafts      Review/approve queue, scheduled send split-button
    ├── Contacts    Auto-learned profiles, relationship tags, recent threads
    └── Settings    Accounts, Brain Core, notifications (quiet hours + digest), language, dark mode
```

## Local Setup

```bash
# 1. Clone
git clone https://github.com/jespermelin89-ctrl/cdp-communication-hub.git
cd cdp-communication-hub

# 2. Install dependencies
npm run install:all

# 3. Configure environment
cp server/.env.example server/.env
# Edit server/.env — fill in DATABASE_URL, Google OAuth, JWT_SECRET, ENCRYPTION_KEY, GROQ_API_KEY

# 4. Database
cd server
npx prisma migrate deploy
npm run seed:brain-core  # optional: seed Brain Core with default writing modes + voice attributes

# 5. Generate VAPID keys (for push notifications)
npm run generate-vapid
# Copy VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY into server/.env

# 6. Start dev servers
cd ..
npm run dev
# Frontend: http://localhost:3000
# Backend:  http://localhost:3001
```

## Deploy

### Backend — Render

1. Connect GitHub repo in Render dashboard
2. Select `render.yaml` as blueprint (auto-configures web service + PostgreSQL database)
3. Set these env vars manually in Render dashboard (`sync: false` vars):

| Variable | Value |
|----------|-------|
| `FRONTEND_URL` | Your Vercel deployment URL |
| `GOOGLE_CLIENT_ID` | Google Cloud Console OAuth client |
| `GOOGLE_CLIENT_SECRET` | Google Cloud Console OAuth client |
| `GOOGLE_REDIRECT_URI` | `https://<render-url>/auth/google/callback` |
| `GROQ_API_KEY` | From console.groq.com |
| `ANTHROPIC_API_KEY` | From console.anthropic.com (optional) |
| `VAPID_PUBLIC_KEY` | Generated with `npm run generate-vapid` |
| `VAPID_PRIVATE_KEY` | Generated with `npm run generate-vapid` |
| `VAPID_SUBJECT` | `mailto:your@email.com` |
| `COMMAND_API_KEY` | Any secret string (for Apple Shortcuts) |

`JWT_SECRET`, `ENCRYPTION_KEY`, and `CSRF_SECRET` are auto-generated by Render.

4. Auto-deploys on push to `main`

### Frontend — Vercel

1. Import GitHub repo in Vercel dashboard
2. Set root directory to `client`
3. Add env var: `NEXT_PUBLIC_API_URL=https://<your-render-service>.onrender.com`
4. Auto-deploys on push to `main`

### Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials
2. Create OAuth 2.0 Client ID (Web application)
3. Add authorized redirect URI: `https://<render-url>/auth/google/callback`
4. Enable: Gmail API, People API
5. Add test users (while app is in Testing mode)

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Min 32 chars, signs all JWT tokens |
| `ENCRYPTION_KEY` | Yes | Min 32 chars, encrypts Gmail tokens at rest |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth 2.0 client |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth 2.0 client |
| `GOOGLE_REDIRECT_URI` | Yes | Must match Google Console exactly |
| `FRONTEND_URL` | Yes | Used for CORS and OAuth redirect |
| `GROQ_API_KEY` | Yes* | Primary AI provider (*one AI key required) |
| `ANTHROPIC_API_KEY` | No | Fallback AI provider |
| `OPENAI_API_KEY` | No | Fallback AI provider |
| `AI_PROVIDER` | No | Default: `groq` |
| `VAPID_PUBLIC_KEY` | No | For web push notifications |
| `VAPID_PRIVATE_KEY` | No | For web push notifications |
| `VAPID_SUBJECT` | No | Contact email for push service |
| `COMMAND_API_KEY` | No | Apple Shortcuts / agent API access |
| `CSRF_SECRET` | No | Auto-generated by Render if omitted |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start both server and client in dev mode |
| `npm run build` | Build server (tsc) and client (Next.js) |
| `npm run install:all` | Install all dependencies |
| `npm run db:migrate` | Run Prisma migrations |
| `npm run db:generate` | Regenerate Prisma client |
| `cd server && npm test` | Run all server tests (vitest, 231 tests) |
| `cd client && npm test` | Run all client tests (vitest, 94 tests) |
| `cd server && npm run seed:brain-core` | Seed Brain Core with defaults |
| `cd server && npm run generate-vapid` | Generate VAPID keys for push |
| `npx tsx scripts/deploy-check.ts` | Pre-deployment checklist |

## Safety Rules

- **Never auto-send** — every draft requires explicit human approval via UI before Gmail sends it
- **Never auto-delete** — system only suggests actions, never executes deletion
- **Gmail is source of truth** — system caches thread metadata only; original emails stay in Gmail
- **Chat ≠ Approval** — the chat widget cannot approve or send drafts
- **No silent data loss** — raw input, past actions, and routing decisions are logged and visible
