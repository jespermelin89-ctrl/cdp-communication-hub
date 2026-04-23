# CDP Communication Hub — Styrdokument

> **Auto-genererat** — senast uppdaterat: 2026-04-23 08:59:40 UTC
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
| `POST    /accounts/:id/sync` | `accounts` |
| `POST    /accounts/:id/badges` | `accounts` |
| `DELETE  /accounts/:id/badges/:badge` | `accounts` |
| `GET     /accounts/:id/signature` | `accounts` |
| `PUT     /accounts/:id/signature` | `accounts` |
| `GET     /action-logs` | `action-logs` |
| `POST    /ai/analyze-thread` | `ai` |
| `POST    /ai/generate-draft` | `ai` |
| `POST    /ai/summarize-inbox` | `ai` |
| `POST    /ai/bulk-classify` | `ai` |
| `GET     /analytics/overview` | `analytics` |
| `POST    /auth/google` | `auth` |
| `GET     /auth/google/callback` | `auth` |
| `GET     /auth/google/reauth` | `auth` |
| `POST    /auth/connect` | `auth` |
| `GET     /auth/me` | `auth` |
| `GET     /user/settings` | `auth` |
| `PATCH   /user/settings` | `auth` |
| `GET     /connectors/brain-core/health` | `brain-core-connector` |
| `GET     /connectors/brain-core/inbox-summary` | `brain-core-connector` |
| `GET     /connectors/brain-core/threads` | `brain-core-connector` |
| `GET     /connectors/brain-core/threads/:id` | `brain-core-connector` |
| `POST    /connectors/brain-core/threads/:id/read` | `brain-core-connector` |
| `POST    /connectors/brain-core/threads/:id/archive` | `brain-core-connector` |
| `GET     /connectors/brain-core/triage-status` | `brain-core-connector` |
| `GET     /connectors/brain-core/classified-summary` | `brain-core-connector` |
| `POST    /connectors/brain-core/drafts` | `brain-core-connector` |
| `GET     /connectors/brain-core/drafts/:id` | `brain-core-connector` |
| `POST    /connectors/brain-core/drafts/:id/approve` | `brain-core-connector` |
| `POST    /connectors/brain-core/drafts/:id/send` | `brain-core-connector` |
| `GET     /brain-core/writing-profile` | `brain-core` |
| `PATCH   /brain-core/writing-mode/:key` | `brain-core` |
| `GET     /brain-core/contacts` | `brain-core` |
| `PATCH   /brain-core/contacts/:id` | `brain-core` |
| `GET     /brain-core/contacts/:id/threads` | `brain-core` |
| `PATCH   /brain-core/contact/:email` | `brain-core` |
| `GET     /brain-core/classification` | `brain-core` |
| `GET     /brain-core/daily-summary` | `brain-core` |
| `POST    /brain-core/daily-summary` | `brain-core` |
| `POST    /brain-core/learn` | `brain-core` |
| `GET     /brain-core/learning-stats` | `brain-core` |
| `GET     /brain-core/export` | `brain-core` |
| `POST    /brain-core/sender-rules` | `brain-core` |
| `GET     /brain-core/learning-insights` | `brain-core` |
| `POST    /brain-core/voice-test` | `brain-core` |
| `GET     /brain-summary` | `brain-summary` |
| `GET     /calendar/availability` | `calendar` |
| `POST    /calendar/events` | `calendar` |
| `POST    /calendar/events/release` | `calendar` |
| `POST    /calendar/invites/respond` | `calendar` |
| `GET     /command-center` | `command-center` |
| `GET     /docs` | `docs` |
| `POST    /drafts` | `drafts` |
| `GET     /drafts` | `drafts` |
| `GET     /drafts/pending` | `drafts` |
| `GET     /drafts/:id` | `drafts` |
| `PATCH   /drafts/:id` | `drafts` |
| `POST    /drafts/:id/approve` | `drafts` |
| `POST    /drafts/:id/send` | `drafts` |
| `POST    /drafts/:id/schedule` | `drafts` |
| `DELETE  /drafts/:id/schedule` | `drafts` |
| `POST    /drafts/:id/attachments` | `drafts` |
| `DELETE  /drafts/:id/attachments/:attachmentId` | `drafts` |
| `POST    /drafts/:id/discard` | `drafts` |
| `POST    /drafts/:id/send-delayed` | `drafts` |
| `POST    /drafts/:id/cancel-send` | `drafts` |
| `GET     /events/stream` | `events` |
| `GET     /follow-ups` | `follow-ups` |
| `POST    /threads/:id/follow-up` | `follow-ups` |
| `PATCH   /follow-ups/:id/complete` | `follow-ups` |
| `DELETE  /follow-ups/:id` | `follow-ups` |
| `GET     /labels` | `labels` |
| `POST    /labels` | `labels` |
| `PATCH   /labels/:id` | `labels` |
| `DELETE  /labels/:id` | `labels` |
| `POST    /threads/:id/labels` | `labels` |
| `DELETE  /threads/:id/labels/:labelId` | `labels` |
| `POST    /threads/bulk/label` | `labels` |
| `POST    /providers/detect` | `providers` |
| `GET     /providers` | `providers` |
| `POST    /push/subscribe` | `push` |
| `DELETE  /push/subscribe` | `push` |
| `POST    /push/test` | `push` |
| `GET     /review` | `review` |
| `POST    /rules/suggest` | `review` |
| `POST    /rules/accept` | `review` |
| `POST    /rules/dismiss` | `review` |
| `GET     /contacts/search` | `search` |
| `GET     /contacts/recent` | `search` |
| `GET     /search` | `search` |
| `GET     /search/history` | `search` |
| `DELETE  /search/history` | `search` |
| `DELETE  /search/history/:id` | `search` |
| `GET     /templates` | `templates` |
| `POST    /templates` | `templates` |
| `PATCH   /templates/:id` | `templates` |
| `DELETE  /templates/:id` | `templates` |
| `POST    /templates/:id/use` | `templates` |
| `POST    /templates/generate` | `templates` |
| `GET     /threads` | `threads` |
| `GET     /threads/:id` | `threads` |
| `POST    /threads/:id/spam` | `threads` |
| `POST    /threads/sync` | `threads` |
| `POST    /threads/:id/sync-messages` | `threads` |
| `POST    /threads/:id/read` | `threads` |
| `POST    /threads/:id/star` | `threads` |
| `POST    /threads/:id/unstar` | `threads` |
| `POST    /threads/:id/unread` | `threads` |
| `POST    /threads/:id/archive` | `threads` |
| `POST    /threads/:id/trash` | `threads` |
| `POST    /threads/:id/restore` | `threads` |
| `POST    /threads/:id/snooze` | `threads` |
| `DELETE  /threads/:id/snooze` | `threads` |
| `POST    /threads/batch` | `threads` |
| `PATCH   /threads/:id` | `threads` |
| `GET     /threads/export` | `threads` |
| `POST    /threads/bulk/archive` | `threads` |
| `POST    /threads/bulk/trash` | `threads` |
| `POST    /threads/bulk/read` | `threads` |
| `POST    /threads/bulk/classify` | `threads` |
| `POST    /threads/bulk/priority` | `threads` |
| `GET     /triage/report` | `triage` |
| `GET     /views` | `views` |
| `POST    /views` | `views` |
| `PATCH   /views/reorder` | `views` |
| `PATCH   /views/:id` | `views` |
| `DELETE  /views/:id` | `views` |
| `POST    /webhooks/gmail` | `webhooks` |

---

## Backend — Tjänster

- `action-log.service.ts`
- `ai.service.ts`
- `auth.service.ts`
- `brain-core-connector.service.ts`
- `brain-core-webhook.service.ts`
- `brain-core.service.ts`
- `calendar.service.ts`
- `category.service.ts`
- `chat-command.service.ts`
- `draft.service.ts`
- `email-provider.factory.ts`
- `gmail-push.service.ts`
- `gmail.service.ts`
- `imap.service.ts`
- `push.service.ts`
- `rule-engine.service.ts`
- `rule-suggestion.service.ts`
- `seed-brain-core.service.ts`
- `smtp.service.ts`
- `sync-scheduler.service.ts`
- `triage-action.service.ts`

---

## Databas — Tabeller (25 st)

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
- `FollowUpReminder`
- `EmailTemplate`
- `SavedView`
- `PushSubscription`
- `UserSettings`
- `Label`
- `ThreadLabel`
- `TriageLog`
- `RuleSuggestion`
- `SearchHistory`

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
- `/analytics`
- `/auth/callback`
- `/categories`
- `/compose`
- `/contacts`
- `/drafts`
- `/drafts/[id]`
- `/inbox`
- `/notifications`
- `/review`
- `/search`
- `/settings`
- `/settings/accounts`
- `/settings/brain-core`
- `/settings/labels`
- `/settings/signatures`
- `/settings/templates`
- `/setup-siri`
- `/threads/[id]`
- `/triage`

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

## Serverpaket (17 direktberoenden)

<details>
<summary>Visa alla</summary>

- `@anthropic-ai/sdk ^0.39.0`
- `@fastify/cookie ^11.0.0`
- `@fastify/cors ^10.0.0`
- `@fastify/helmet ^13.0.2`
- `@fastify/multipart ^9.4.0`
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
- `web-push ^3.6.7`
- `zod ^3.24.0`

</details>

---

## Ägarskap

**Jesper Melin** (jesper.melin89@gmail.com)
GitHub: [jespermelin89-ctrl](https://github.com/jespermelin89-ctrl)

---

_Detta dokument genereras automatiskt av `scripts/update-styrdokument.js`.
Ändra inte manuellt — kör `npm run styrdokument` igen efter kodändringar._
