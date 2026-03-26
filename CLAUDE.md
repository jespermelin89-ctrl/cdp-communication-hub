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
- Backend: Node.js + Fastify + TypeScript + Prisma + PostgreSQL
- Frontend: Next.js 15 + Tailwind CSS + TypeScript
- AI: Anthropic Claude API (primary), OpenAI as fallback
- Auth: Google OAuth 2.0 + JWT sessions
- Encryption: AES-256-GCM for OAuth tokens at rest

## Project Structure
```
server/src/
  config/       env.ts, database.ts, oauth.ts
  routes/       auth, accounts, threads, drafts, ai, command-center, action-logs
  services/     gmail.service, ai.service, draft.service, auth.service, action-log.service
  middleware/   auth.middleware, error.middleware
  utils/        encryption, email-parser, validators
  prisma/       schema.prisma

client/
  app/          page (Command Center), drafts/, inbox/, threads/[id]/, auth/callback/, settings/
  components/   TopBar, StatusBadge, PriorityBadge
  lib/          api.ts (HTTP client), types.ts
```

## Database (8 tables)
users, email_accounts, email_threads, email_messages, ai_analyses, **drafts** (CRITICAL - status gate), action_logs, user_settings

## Key API Endpoints
- `POST /api/v1/auth/google` — Start OAuth
- `POST /api/v1/threads/sync` — Fetch from Gmail
- `POST /api/v1/ai/analyze-thread` — AI analysis
- `POST /api/v1/ai/generate-draft` — AI draft generation
- `POST /api/v1/drafts` — Create pending draft
- `POST /api/v1/drafts/:id/approve` — Approve draft
- `POST /api/v1/drafts/:id/send` — Send ONLY if approved (SAFETY GATE)
- `GET /api/v1/command-center` — Dashboard data

## Current Status
- V1 codebase is complete (all backend services, routes, frontend pages)
- Needs: `npm install`, Prisma migration, env configuration, Google Cloud OAuth setup
- Ready for testing and iteration

## Development Commands
```bash
npm run install:all          # Install all dependencies
cp server/.env.example server/.env  # Then edit with real values
cd server && npx prisma migrate dev --name init  # Create DB tables
npm run dev                  # Start both server (:3001) and client (:3000)
```

## What Claude Should Focus On
When working on this project, prioritize:
1. Maintaining the safety model (draft-approve-send flow)
2. Clean, typed code (TypeScript strict mode)
3. API-first design (frontend and Claude/Dispatch consume same API)
4. Keeping scope narrow for V1 — no feature creep
5. Logging everything to action_logs

## Owner
Jesper Melin (jesper.melin89@gmail.com)
