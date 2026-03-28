# Claude Code — NÄSTA SPRINT: AI-STABILITET + SMART FALLBACK

## STATUS (2026-03-28 09:40)

### FUNKAR LIVE ✅
- Dashboard med Lucide-ikoner, svenska, 3 konton (102 trådar)
- AI-sammanfattning genererar svensk text (Groq eller OpenAI fallback)
- Daglig sammanfattning med KRÄVER SVAR (6) / BRA ATT VETA (2) / REKOMMENDATION + prioritetsbadges (high/medium)
- AI-sorteringsförslag med Tillämpa/Ignorera-knappar
- Inkorg med sök, prioritetsfilter, kategoriflikar, arkivera/radera
- Chat-widget "Mail-assistent" med refresh och vänliga felmeddelanden
- Email-sync för 3 konton (wayofthefather, jesper.melin89, jesper.melin) — scheduler var 5 min
- Utkast med badge-count (5), prioritetsöversikt, senaste aktivitet
- Notifikationsklocka i header
- Error sanitization (inga Prisma-fel exponeras)
- Database migration körd (account_type, team_members, ai_handling)
- **Fallback-kedjan FUNGERAR: Groq → Anthropic → OpenAI**
  - Bekräftat i loggar: "[AI] Fallback succeeded via openai (previous provider failed)"
  - Groq hanterar mindre requests, OpenAI tar över vid 413

### ENVIRONMENT PÅ RENDER
- AI_PROVIDER=groq
- GROQ_API_KEY ✅ (free tier, llama-3.3-70b-versatile)
- ANTHROPIC_API_KEY ✅ (inga credits — skippa i fallback)
- OPENAI_API_KEY ✅ (nyligen tillagd, $3.56 saldo, gpt-4o)

---

## FIXA NU (PRIO 1-2)

### 1. Groq token-trunkering (PRIO 1) — VIKTIGAST
Render-loggar visar fortfarande:
```
[AI] Provider groq failed: 413 Request too large
TPM Limit 12000, Requested 14815
```

**Fix i `server/src/services/ai.service.ts`:**

```typescript
// Lägg till helper-funktion
private truncateContent(text: string, maxChars: number = 2000): string {
  if (!text || text.length <= maxChars) return text;
  return text.substring(0, maxChars) + '... [trunkerad]';
}

// Använd i summarizeInbox(), analyzeThread(), classifyEmail():
const truncatedThreads = threads.map(t => ({
  ...t,
  messages: t.messages?.map(m => ({
    ...m,
    body: this.truncateContent(m.body, 2000),
    snippet: this.truncateContent(m.snippet, 500)
  }))
}));
```

Mål: Håll total payload under 8000 tokens (~32 000 tecken) per request.

### 2. Smart provider-caching (PRIO 2)
Anthropic har inga credits och kommer ALLTID faila med 400. Slösa inte tid på det.

**Fix:**
```typescript
// I ai.service.ts constructor eller som class-property
private providerBlacklist: Map<string, number> = new Map(); // provider -> blacklisted until (timestamp)

private isProviderAvailable(provider: string): boolean {
  const blacklistedUntil = this.providerBlacklist.get(provider);
  if (!blacklistedUntil) return true;
  if (Date.now() > blacklistedUntil) {
    this.providerBlacklist.delete(provider);
    return true;
  }
  return false;
}

// Vid 400/402 "credit balance" error:
this.providerBlacklist.set('anthropic', Date.now() + 3600000); // blacklist 1h
```

### 3. Byt OpenAI-modell till gpt-4o-mini (PRIO 2)
`gpt-4o` kostar $2.50/M input tokens. `gpt-4o-mini` kostar $0.15/M — 16x billigare.
För mail-klassificering och sammanfattning räcker mini gott.

**Fix i `ai.service.ts`:**
```typescript
// Ändra i chatOpenAI()
model: 'gpt-4o-mini' // istället för 'gpt-4o'
```

### 4. Utkast till mailer-daemon (PRIO 3)
Utkast adresseras till "mailer-daemon@googlemail.com". Uppdatera NO_REPLY_PATTERN:
```typescript
const NO_REPLY_PATTERN = /^(noreply|no-reply|no\.reply|mailer-daemon|postmaster|bounce|notifications?)/i;
```

---

## BYGGA HÄRNÄST (PRIO 3-4)

### 5. Brain Core seed
Tabellerna (WritingMode, VoiceAttribute, ClassificationRule) är tomma.
```bash
npx ts-node src/scripts/seed-brain-core.ts
```

### 6. Förbättra AI-sammanfattning
Sammanfattningen är för lång. Uppdatera SUMMARY_SYSTEM_PROMPT:
```
Du är en mail-assistent. Ge en KORT sammanfattning (max 2-3 meningar):
1. Antal olästa som kräver åtgärd
2. Viktigaste ärenden (max 3)
3. Rekommenderad nästa åtgärd
Format: Kort och koncist. Inga listor.
```

### 7. Account dropdown
Kontopillerna ska ha dropdown vid klick med:
- Kontotyp: Personal / Team / Shared
- AI-hantering: Normal / Separat / Notify only
- Teammedlemmar (om team)

---

## REGLER
- `cd server && npx tsc --noEmit` + `cd client && npx tsc --noEmit` innan commit
- ALLTID push till main: `git push origin main`
- Lucide-ikoner, inga emojis i UI
- ALDRIG auto-send, ALDRIG auto-delete
- Testa lokalt innan push
- All AI-text ska vara på SVENSKA

## KOM IGÅNG:
**Steg 1: Fixa token-trunkering (punkt 1). Det löser 90% av AI-felen.**
**Steg 2: Lägg till provider-blacklist (punkt 2) + byt till gpt-4o-mini (punkt 3).**
**Steg 3: Brain Core seed (punkt 5).**
