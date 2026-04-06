# Claude Code Prompt — Add seed-brain-core agent action

## Context
Render free tier has no Shell access, so we can't run `npm run seed:brain-core` manually. We need an HTTP-triggerable seed action via the existing agent API (`POST /api/v1/agent/execute` with `X-API-Key`).

The seed script at `server/src/scripts/seed-brain-core.ts` is idempotent (uses upserts). We want to expose the same logic as a new agent action.

## Task

### 1. Add `seed-brain-core` to ALLOWED_ACTIONS in `server/src/routes/agent.ts`

In the `ALLOWED_ACTIONS` array, add `'seed-brain-core'` alongside the other actions.

### 2. Add the handler case in the agent execute switch/if-chain

In `server/src/routes/agent.ts`, add a new case for `action === 'seed-brain-core'`. The handler should:

1. Find the first active EmailAccount (same as the seed script does)
2. If no active account exists, return `{ success: false, error: 'No active account found. Connect Gmail first.' }`
3. Import and call the seed data directly (don't shell out to the script). Use the Prisma client that's already imported.
4. Upsert the same data that `server/src/scripts/seed-brain-core.ts` defines:
   - WritingModes (casual_sv, formal_sv, english)
   - VoiceAttributes (tone, formality, greeting, closing, style, apology)
   - ClassificationRules (all 14 rules from the seed script)
   - ContactProfiles (render, github)
5. Return `{ success: true, action: 'seed-brain-core', data: { seeded: { writingModes: 3, voiceAttributes: 6, classificationRules: 14, contacts: 2 } } }`

### 3. Alternative cleaner approach — extract seed logic to a service function

If you prefer, you can:
1. Create `server/src/services/seed-brain-core.service.ts` that exports an async `seedBrainCore(userId: string)` function containing the seed data and upsert logic from `server/src/scripts/seed-brain-core.ts`
2. Refactor `server/src/scripts/seed-brain-core.ts` to import and call that function
3. Import and call that function from the agent route handler

This keeps the seed data in one place (DRY).

### 4. Update CLAUDE.md

Add a note under the agent API section that `seed-brain-core` is available as an agent action.

## Constraints
- Keep the same X-API-Key auth (agentKeyAuth) — no changes to auth
- The seed data must be IDENTICAL to what's in `server/src/scripts/seed-brain-core.ts`
- All upserts must be idempotent (they already are since seed script uses upserts)
- Do NOT add any new dependencies

## Test
After implementing, the following should work:
```bash
curl -X POST https://cdp-hub-api.onrender.com/api/v1/agent/execute \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $COMMAND_API_KEY" \
  -d '{"action": "seed-brain-core"}'
```

## After implementation
- Commit with message: `feat(agent): add seed-brain-core action for HTTP-triggered seeding`
- Push to main (auto-deploys to Render)
