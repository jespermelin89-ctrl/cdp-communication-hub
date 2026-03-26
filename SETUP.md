# CDP Communication Hub - Setup Guide

## Quick Start

### 1. Prerequisites
- Node.js 20+
- PostgreSQL 15+
- Google Cloud Project with Gmail API enabled

### 2. Install Dependencies
```bash
cd cdp-communication-hub
npm run install:all
```

### 3. Configure Environment
```bash
cp server/.env.example server/.env
# Edit server/.env with your values
```

**Required values:**
- `DATABASE_URL` - PostgreSQL connection string
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - From Google Cloud Console
- `JWT_SECRET` - Any random 32+ character string
- `ENCRYPTION_KEY` - Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- `ANTHROPIC_API_KEY` - Your Claude API key

### 4. Google OAuth Setup
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project (or use existing)
3. Enable Gmail API
4. Create OAuth 2.0 Client ID (Web application)
5. Add redirect URI: `http://localhost:3001/api/v1/auth/google/callback`
6. Copy Client ID and Secret to `.env`

### 5. Database Setup
```bash
cd server
npx prisma generate
npx prisma migrate dev --name init
```

### 6. Run Development
```bash
# From root directory:
npm run dev

# Or separately:
cd server && npm run dev    # Backend on :3001
cd client && npm run dev    # Frontend on :3000
```

### 7. Connect Gmail
Open http://localhost:3000 and click "Connect Gmail"

---

## Architecture

```
Gmail API ← Backend (Fastify :3001) ← AI Layer (Claude) ← Frontend (Next.js :3000)
                     ↑
               Claude / Dispatch
```

## Safety Rules (Non-Negotiable)
1. Never auto-send - all emails require explicit approval
2. Never auto-delete
3. Gmail stays source of truth
4. Draft → Approve → Send (enforced at DB level)
5. Chat ≠ Approval

## API Endpoints
All under `/api/v1`:

| Method | Path | Description |
|--------|------|-------------|
| POST | /auth/google | Start OAuth flow |
| GET | /auth/google/callback | OAuth callback |
| GET | /auth/me | Current user profile |
| GET | /accounts | List connected accounts |
| GET | /threads | List cached threads |
| GET | /threads/:id | Thread detail with messages |
| POST | /threads/sync | Sync threads from Gmail |
| POST | /ai/analyze-thread | Run AI analysis |
| POST | /ai/generate-draft | Generate draft from instruction |
| POST | /ai/summarize-inbox | Daily briefing |
| POST | /drafts | Create pending draft |
| GET | /drafts | List drafts |
| PATCH | /drafts/:id | Edit pending draft |
| POST | /drafts/:id/approve | Approve draft |
| POST | /drafts/:id/send | Send approved draft |
| POST | /drafts/:id/discard | Discard draft |
| GET | /command-center | Dashboard data |
| GET | /action-logs | Audit trail |

## Tech Stack
- **Backend:** Fastify + TypeScript + Prisma + PostgreSQL
- **Frontend:** Next.js 15 + Tailwind CSS
- **AI:** Claude API (Anthropic SDK) with OpenAI fallback
- **Auth:** Google OAuth 2.0 + JWT
