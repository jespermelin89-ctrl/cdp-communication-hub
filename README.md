# CDP Communication Hub

AI-powered communication overlay on Gmail. Reads, analyzes, classifies, and drafts responses — but **never sends or deletes autonomously**. Every outbound email follows: Read → Analyze → Draft → Review → Approve → Gmail Sends.

## Tech Stack

```
Frontend  Next.js 15 + Tailwind CSS + TypeScript    (Vercel)
Backend   Fastify + TypeScript + Prisma              (Render)
Database  PostgreSQL (Supabase)
AI        Groq (default) → Anthropic → OpenAI (fallback chain)
Auth      Google OAuth 2.0 + JWT + AES-256-GCM token encryption
```

## Architecture

```
Gmail API
    ↑
Backend (Fastify :3001)
    ├── Auth       Google OAuth, JWT sessions
    ├── Accounts   Multi-account Gmail sync
    ├── Threads    Read, classify, analyze
    ├── Drafts     Generate → Review → Approve (DB-enforced gate)
    ├── AI         Groq / Anthropic / OpenAI broker
    ├── Brain Core Writing modes, voice attributes, classification rules, learning
    └── Chat       Command widget with 6 actions
         ↑
Frontend (Next.js :3000)
    ├── Dashboard  Stats, activity feed, AI summary
    ├── Inbox      Threads with AI badges, bulk actions
    ├── Drafts     Review and approve queue
    └── Settings   Accounts, Brain Core, language
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
npm run seed:brain-core  # optional: seed Brain Core with default writing modes

# 5. Start dev servers
cd ..
npm run dev
# Frontend: http://localhost:3000
# Backend:  http://localhost:3001
```

## Deploy

### Backend — Render

1. Connect GitHub repo in Render dashboard
2. Select `render.yaml` as blueprint (auto-configures service + database)
3. Set these env vars manually in Render dashboard:
   - `FRONTEND_URL` — your Vercel URL
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
   - `GROQ_API_KEY` (and/or `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`)
   - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (generate with `npm run generate-vapid`)
   - `COMMAND_API_KEY` (for Apple Shortcuts integration)
4. Auto-deploys on push to `main`

### Frontend — Vercel

1. Import GitHub repo in Vercel dashboard
2. Set root directory to `client`
3. Add env var: `NEXT_PUBLIC_API_URL=https://cdp-communication-hub.onrender.com`
4. Auto-deploys on push to `main`

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start both server and client in dev mode |
| `npm run build` | Build server (tsc + prisma) and client |
| `npm run install:all` | Install dependencies for server and client |
| `npm run db:migrate` | Run Prisma migrations |
| `npm run db:generate` | Generate Prisma client |
| `cd server && npm test` | Run server tests (vitest) |
| `cd server && npm run seed:brain-core` | Seed Brain Core defaults |
| `cd server && npm run generate-vapid` | Generate VAPID keys for push notifications |
| `npx tsx scripts/deploy-check.ts` | Pre-deployment checklist |

## Safety Rules

- **Never auto-send** — drafts require explicit human approval via UI
- **Never auto-delete** — system only suggests, never executes deletion
- **Gmail is source of truth** — system caches metadata only
- **Chat ≠ Approval** — chat widget cannot approve or send drafts
