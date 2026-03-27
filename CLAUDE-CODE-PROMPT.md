# Claude Code — NÄSTA STEG

## STATUS (2026-03-27)
Allt är pushat till `origin/main`. Render och Vercel deployar automatiskt.

Databas-fixa (migration för `account_type`, `team_members`, `ai_handling`) är commitad och pushad.
`render.yaml` har GROQ_API_KEY och AI_PROVIDER=groq.
TypeScript: 0 fel på server + client.

---

## Väntar på manuellt (kräver Supabase/Render-åtkomst)

### Seed Brain Core (kör en gång efter Render-deploy)
```bash
# I Render dashboard → cdp-hub-api → Shell
cd /srv/app/server
npm run seed:brain-core
```

### Sätt GROQ_API_KEY i Render
Render dashboard → `cdp-hub-api` → Environment → lägg till:
- `GROQ_API_KEY` = din Groq API-nyckel (från console.groq.com)

---

## Nästa funktioner att bygga

### 1. Draft-editor förbättringar
- Visa avsändarens signatur i preview
- Teckentelling (tecken/ord)
- Auto-save utkast var 30s

### 2. Notifieringar
- Browser push notifications för viktiga mail (Notification API)
- Konfigurerbar tröskel: priority=high + unread

### 3. Sök
- `GET /api/v1/threads/search?q=...` — fulltextsök i subject + snippet
- Sökfält i Inbox-sidhuvudet

### 4. Kontaktprofiler (Brain Core)
- Visa kontaktprofil i tråd-vyn (senaste kontakt, antal mail, kategori)
- Auto-uppdatera ContactProfile vid ny analys

---

## Arbetssätt
- `cd server && npx tsc --noEmit` + `cd client && npx tsc --noEmit` innan commit
- ALLTID push till main: `git push origin feat/sprint2-docs-and-config:main --force`
- Inga emojis i UI
- ALDRIG auto-send, ALDRIG auto-delete
