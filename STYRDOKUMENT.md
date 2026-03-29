# CDP Communication Hub — Styrdokument

> **Auto-genererat** — senast uppdaterat: 2026-03-29 04:58:32 UTC
> Kör `npm run styrdokument` för att uppdatera.

---

## Syfte

CDP Communication Hub är ett AI-drivet kommunikationslager ovanpå Gmail.
Det är **inte** en e-postklient — Gmail förblir källa till sanning.
Systemet läser, analyserar, klassificerar och utkastas svar, men **skickar eller raderar aldrig autonomt**.

---

## Icke-förhandlingsbara säkerhetsregler

| # | Regel |
|---|-------|
| 1 | **Aldrig auto-skicka** — AI skapar utkast. Skickning kräver explicit mänskligt godkännande. |
| 2 | **Aldrig auto-radera** — Systemet föreslår städning, exekverar den aldrig. |
| 3 | **Gmail är källan** — Systemet cachelagrar metadata; Gmail är auktoritativt. |
| 4 | **AI föreslår, människa beslutar** — Claude utkastas och analyserar, exekverar inte. |
| 5 | **Chatt ≠ godkännande** — Att skriva "skicka det" i chatt triggar ingen sändning. |
| 6 | **Draft → Approve → Send** — Genomdrivs på databasnivå. `POST /drafts/:id/send` kontrollerar `status === 'approved'` i en transaktion. |

---

## Arkitektur

```
Gmail API ← Backend (Fastify :3001) ← AI Layer (Claude API) ← Frontend (Next.js :3000)
                     ↑
               Claude / Dispatch (läser + utkastas via API, kan inte godkänna eller skicka)
```

- **Backend** är den enda porten mot Gmail API och AI-leverantören.
- **AI-lagret** är tillståndslöst — tar emot JSON, returnerar JSON, utbytbart mellan Claude och OpenAI.
- **Frontend** pratar enbart med backend via REST. Rör aldrig Gmail eller AI direkt.

---

## Teknikstack

| Lager | Teknik |
|-------|--------|
| Backend | Node.js + Fastify + TypeScript + Prisma |
| Databas | PostgreSQL (Supabase) |
| Frontend | Next.js 15 + Tailwind CSS + TypeScript |
| AI primär | Anthropic Claude (claude-sonnet-4-20250514) |
| AI fallback | OpenAI GPT |
| Auth | Google OAuth 2.0 + JWT |
| Kryptering | AES-256-GCM för OAuth-tokens i vila |
| Hosting | Vercel (frontend) + Render (backend) |
| i18n | sv (default), en, ru, es |

---

## Backend — API-rutter

Prefix: `/api/v1`

| Endpoint | Fil |
|----------|-----|
| `GET     /accounts` | `accounts` |
| `POST    /accounts/imap` | `accounts` |
| `POST    /accounts/test-imap` | `accounts` |
| `PATCH   /accounts/:id` | `accounts` |
| `POST    /accounts/set-default` | `accounts` |
| `DELETE  /accounts/:id` | `accounts` |
| `POST    /accounts/:id/badges` | `accounts` |
| `DELETE  /accounts/:id/badges/:badge` | `accounts` |
| `GET     /action-logs` | `action-logs` |
| `POST    /ai/analyze-thread` | `ai` |
| `POST    /ai/generate-draft` | `ai` |
| `POST    /ai/summarize-inbox` | `ai` |
| `POST    /ai/bulk-classify` | `ai` |
| `POST    /auth/google` | `auth` |
| `GET     /auth/google/callback` | `auth` |
| `POST    /auth/connect` | `auth` |
| `GET     /auth/me` | `auth` |
| `GET     /brain-core/writing-profile` | `brain-core` |
| `PATCH   /brain-core/writing-mode/:key` | `brain-core` |
| `GET     /brain-core/contacts` | `brain-core` |
| `PATCH   /brain-core/contact/:email` | `brain-core` |
| `GET     /brain-core/classification` | `brain-core` |
| `GET     /brain-core/daily-summary` | `brain-core` |
| `POST    /brain-core/daily-summary` | `brain-core` |
| `POST    /brain-core/learn` | `brain-core` |
| `GET     /brain-core/learning-stats` | `brain-core` |
| `GET     /brain-summary` | `brain-summary` |
| `GET     /command-center` | `command-center` |
| `POST    /drafts` | `drafts` |
| `GET     /drafts` | `drafts` |
| `GET     /drafts/:id` | `drafts` |
| `PATCH   /drafts/:id` | `drafts` |
| `POST    /drafts/:id/approve` | `drafts` |
| `POST    /drafts/:id/send` | `drafts` |
| `POST    /drafts/:id/discard` | `drafts` |
| `POST    /providers/detect` | `providers` |
| `GET     /providers` | `providers` |
| `GET     /threads` | `threads` |
| `GET     /threads/:id` | `threads` |
| `POST    /threads/sync` | `threads` |
| `POST    /threads/:id/sync-messages` | `threads` |
| `POST    /threads/:id/read` | `threads` |
| `POST    /threads/:id/star` | `threads` |
| `POST    /threads/:id/unstar` | `threads` |
| `POST    /threads/:id/unread` | `threads` |
| `POST    /threads/:id/archive` | `threads` |
| `POST    /threads/:id/trash` | `threads` |
| `POST    /threads/batch` | `threads` |
| `PATCH   /threads/:id` | `threads` |

---

## Backend — Tjänster

- `action-log.service.ts`
- `ai.service.ts`
- `auth.service.ts`
- `brain-core.service.ts`
- `category.service.ts`
- `chat-command.service.ts`
- `draft.service.ts`
- `email-provider.factory.ts`
- `gmail.service.ts`
- `imap.service.ts`
- `rule-engine.service.ts`
- `smtp.service.ts`
- `sync-scheduler.service.ts`

---

## Databas — Tabeller (16 st)

- `User`
- `EmailAccount`
- `EmailThread`
- `EmailMessage`
- `AIAnalysis`
- `Draft`
- `ActionLog`
- `Category`
- `SenderRule`
- `WritingMode`
- `VoiceAttribute`
- `ContactProfile`
- `ClassificationRule`
- `LearningEvent`
- `DailySummary`
- `UserSettings`

### Kritisk tabell: `Draft`

Varje utgående e-post börjar som ett utkast här.
`status`-fältet genomdriver godkännandebarriären:

```
pending → approved → sent
                  ↘ failed
        ↘ discarded
```

Inget API-anrop kan kringgå detta — `POST /drafts/:id/send` kontrollerar statusen i en databastransaktion.

---

## Frontend — Sidor

- `/ (dashboard)`
- `/activity`
- `/auth/callback`
- `/categories`
- `/compose`
- `/drafts`
- `/drafts/[id]`
- `/inbox`
- `/notifications`
- `/search`
- `/settings`
- `/settings/accounts`
- `/settings/brain-core`
- `/setup-siri`
- `/threads/[id]`

---

## Synk-schema (Bakgrundsschemaläggare)

| Jobb | Intervall | Detalj |
|------|-----------|--------|
| E-postsynk | var 5:e minut | Hämtar 20 senaste trådar per aktivt konto |
| AI-klassificering | var 10:e minut | Klassificerar upp till 10 oanalyserade trådar |
| Backoff | 3 failures → skippa 1 cykel | Minskar belastning vid API-fel |

---

## Deployment

| Tjänst | URL | Trigger |
|--------|-----|---------|
| Frontend (Vercel) | https://cdp-communication-hub.vercel.app | Push till `main` |
| Backend (Render) | https://cdp-communication-hub.onrender.com | Push till `main` |
| GitHub | github.com/jespermelin89-ctrl/cdp-communication-hub | — |

---

## Serverpaket (14 direktberoenden)

<details>
<summary>Visa alla</summary>

- `@anthropic-ai/sdk ^0.39.0`
- `@fastify/cookie ^11.0.0`
- `@fastify/cors ^10.0.0`
- `@fastify/rate-limit ^10.2.0`
- `@prisma/client ^6.2.0`
- `dotenv ^16.4.0`
- `fastify ^5.2.0`
- `googleapis ^144.0.0`
- `imapflow ^1.0.170`
- `jsonwebtoken ^9.0.2`
- `mailparser ^3.7.0`
- `nodemailer ^6.9.0`
- `openai ^4.77.0`
- `zod ^3.24.0`

</details>

---

## Ägarskap

**Jesper Melin** (jesper.melin89@gmail.com)
GitHub: [jespermelin89-ctrl](https://github.com/jespermelin89-ctrl)

---

_Detta dokument genereras automatiskt av `scripts/update-styrdokument.js`.
Ändra inte manuellt — kör `npm run styrdokument` igen efter kodändringar._
