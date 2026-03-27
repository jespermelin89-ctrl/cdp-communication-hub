# Claude Code — CDP Communication Hub: Sprint 2 (Final)

Läs `CLAUDE.md`, `STYRDOKUMENT.md` och `JESPER-WRITING-PROFILE.md` FÖRST.

## Arbetssätt
- EN uppgift i taget, prio-ordning
- Committa + pusha efter varje (`git push origin master:main`)
- `cd server && npx tsc --noEmit` + `cd client && npx tsc --noEmit` innan commit
- ALDRIG bryt säkerhetsreglerna (aldrig auto-send, aldrig auto-delete)

## STATUS: Redan klart
✅ Dark mode, ✅ Lägg till konto-knapp, ✅ Signatur i schema, ✅ Brain Core tabeller (6 st),
✅ brain-core.service.ts, ✅ brain-core routes, ✅ seed-brain-core.ts, ✅ Inbox UX,
✅ Drafts empty state, ✅ Error handling (503 istället för 500), ✅ Daglig sammanfattning-widget,
✅ GROQ_API_KEY + AI_PROVIDER=groq satta i Render env vars (deploy triggad 2026-03-27)

---

## PRIO 1 — Byt AI-provider till Groq (GRATIS, blockerande)

AI-anropen returnerar 503 för att det inte finns pengar laddat på Anthropic API.
Vi byter till **Groq** som har gratis tier utan tidsgräns (30 req/min, 14400 req/dag).
Groq kör OpenAI-kompatibelt API — vi kan återanvända befintlig OpenAI-kod.

### 1.1 Skapa Groq-konto och hämta API-nyckel

Jesper har redan fått nyckeln. Den läggs till i Render env vars som `GROQ_API_KEY`.

### 1.2 Uppdatera `server/src/config/env.ts`

```typescript
// Lägg till:
GROQ_API_KEY: z.string().optional(),
AI_PROVIDER: z.enum(['anthropic', 'openai', 'groq']).default('groq'),  // ← default till groq
```

### 1.3 Uppdatera `server/src/services/ai.service.ts`

Lägg till Groq som provider. Groq använder OpenAI SDK med annan baseURL:

```typescript
import OpenAI from 'openai';

// I constructor:
if (env.GROQ_API_KEY) {
  this.groq = new OpenAI({
    apiKey: env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
  });
}

// I chat():
private async chat(systemPrompt: string, userMessage: string): Promise<string> {
  if (env.AI_PROVIDER === 'groq' && this.groq) {
    return this.chatGroq(systemPrompt, userMessage);
  } else if (env.AI_PROVIDER === 'anthropic' && this.anthropic) {
    return this.chatAnthropic(systemPrompt, userMessage);
  } else if (env.AI_PROVIDER === 'openai' && this.openai) {
    return this.chatOpenAI(systemPrompt, userMessage);
  }
  throw new Error('No AI provider configured. Set GROQ_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY.');
}

private async chatGroq(systemPrompt: string, userMessage: string): Promise<string> {
  const response = await this.groq!.chat.completions.create({
    model: 'llama-3.3-70b-versatile',  // Bästa gratis-modellen
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    max_tokens: 2048,
    temperature: 0.3,
  });
  return response.choices[0]?.message?.content || '';
}
```

**VIKTIGT om promptsen:** Llama-modeller behöver tydligare instruktioner än Claude.
Uppdatera `ANALYSIS_SYSTEM_PROMPT` i samma fil — lägg till i slutet:

```
CRITICAL INSTRUCTIONS:
1. Return ONLY a JSON object. No text before or after the JSON.
2. Do NOT wrap the JSON in markdown code fences (no ```json).
3. Every field must be present. Use null for draft_text if not applicable.
4. The "model_used" field should be "llama-3.3-70b-versatile".

Example output:
{"summary":"...","classification":"operational","priority":"low","suggested_action":"archive_suggestion","draft_text":null,"confidence":0.85,"model_used":"llama-3.3-70b-versatile"}
```

Gör samma sak för `DRAFT_SYSTEM_PROMPT` och `SUMMARY_SYSTEM_PROMPT` — lägg alltid till
explicit JSON-format-instruktion och ett example output.

### 1.4 Uppdatera `server/src/index.ts` — startup-logg

```typescript
console.log(`[AI] Provider: ${env.AI_PROVIDER} | Groq: ${env.GROQ_API_KEY ? 'SET' : 'MISSING'} | Anthropic: ${env.ANTHROPIC_API_KEY ? 'SET' : 'MISSING'}`);
```

### 1.5 ~~Lägg till GROQ_API_KEY i Render~~ ✅ KLART

Redan gjort manuellt i Render Dashboard. Skippa detta steg.

### 1.6 JSON-parsing safety

Llama-modeller kan ibland returnera JSON wrappat i ```json ... ```.
I `analyzeThread()` och alla metoder som parsar AI-svar, lägg till:

```typescript
function cleanJsonResponse(raw: string): string {
  let cleaned = raw.trim();
  // Strip markdown code fences
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  // Strip any text before first { or after last }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }
  return cleaned;
}
```

Använd `cleanJsonResponse()` INNAN `JSON.parse()` överallt.

### 1.7 Testa lokalt

```bash
cd server
# Lägg till i .env:
# GROQ_API_KEY=gsk_xxxxx
# AI_PROVIDER=groq
npm run dev
# Testa:
curl -X POST http://localhost:3001/api/v1/ai/analyze-thread \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <jwt>" \
  -d '{"thread_id":"<id>"}'
```

---

## PRIO 2 — Kör seed och testa Brain Core

### 2.1 Push schema till Supabase
```bash
cd server
npx prisma db push
npx prisma generate
```

### 2.2 Kör seed-scriptet
```bash
npx ts-node src/scripts/seed-brain-core.ts
```

### 2.3 Testa Brain Core endpoints
```bash
curl http://localhost:3001/api/v1/brain-core/writing-profile -H "Authorization: Bearer <jwt>"
curl http://localhost:3001/api/v1/brain-core/classification -H "Authorization: Bearer <jwt>"
```

---

## PRIO 3 — Koppla ihop sammanfattning med AI

### 3.1 Dashboard daily summary ska använda AI

I `brain-core.service.ts` → `generateDailySummary()`:
- Hämta olästa trådar
- Kör dem genom `classificationRules` från databasen
- För "needs_reply"-trådar → kort sammanfattning
- Generera AI-rekommendation via `aiService.chat()`
- Spara i `daily_summaries`

### 3.2 Automatisk klassificering vid synk

I `sync-scheduler.service.ts` → efter synk:
- Hämta nya oanalyserade trådar
- Kör `aiService.analyzeThread()` på dem (max 5 åt gången för att inte överstiga Groq rate limit)
- Vänta 2 sekunder mellan varje batch (rate limit: 30/min)
- Spara resultat i `ai_analyses`

---

## PRIO 4 — Signatur-editor i UI (om tid finns)

- `signature` finns redan i schema
- Lägg till textarea + preview i `/settings/accounts`
- Auto-append signaturen i draft service (redan delvis implementerat)

---

## Checklista per commit:
1. `cd server && npx tsc --noEmit` ✅
2. `cd client && npx tsc --noEmit` ✅
3. Inga hårdkodade API-nycklar
4. i18n för nya strängar
5. `git push origin master:main`

## Kom igång:
```bash
cat CLAUDE.md
cat JESPER-WRITING-PROFILE.md
```
**Börja med 1.2** — uppdatera env.ts och ai.service.ts för Groq. Det fixar alla AI-funktioner.
