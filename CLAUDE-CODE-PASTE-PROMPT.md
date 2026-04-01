Du jobbar i cdp-communication-hub projektet. v1.3.0 är byggd men INTE deployad. Det finns kritiska git-problem att lösa. Läs CLAUDE.md och STYRDOKUMENT.md först.

Kör dessa steg i ordning:

## STEG 1: INVENTERA

```bash
git status
git branch -a
git log --oneline -5
git log --oneline main -5
git diff --stat HEAD
```

Förstå läget: koden ligger på `feat/sprint2-docs-and-config`, `main` är långt bakom.

## STEG 2: COMMITTA OCOMMITTADE ÄNDRINGAR

Det finns 13 modified + 5 untracked filer. Kolla igenom ändringarna (git diff) och committa med ett bra meddelande. Inkludera ALLA relevanta filer men INTE `.claude/settings.local.json`.

```bash
npx tsc --noEmit  # i BÅDA server och client — NOLL errors innan commit
```

COMMIT: `fix: post-v1.3 cleanup — draft fixes, push digest, thread pagination, cache keys`

## STEG 3: MERGA TILL MAIN

Merga hela feat-branchen till main. All v1.3.0-kod + cleanup ska in.

```bash
git checkout main
git merge feat/sprint2-docs-and-config --no-edit
```

Om det blir konflikter — lös dem. Koden på feat-branchen är nyast och korrekt.

## STEG 4: KÖR TESTER

```bash
cd server && npx vitest run 2>&1 | tail -30
```

Om vitest failar pga rollup/rolldown native binary:
- Nedgradera vitest till en version som funkar: `npm install vitest@3.0.9 @vitest/coverage-v8@3.0.9 --save-dev`
- ELLER sätt `VITEST_SKIP_NATIVE=1`
- Kör igen tills ALLA tester passerar

Samma för client:
```bash
cd client && npx vitest run 2>&1 | tail -30
```

## STEG 5: TYPECHECKA + BUILDA

```bash
cd server && npx tsc --noEmit
cd client && npx tsc --noEmit
cd server && npm run build
cd client && npm run build
```

Fixa ALLA errors. Noll TypeScript-fel, noll build-errors.

## STEG 6: UPPDATERA CLAUDE.md

Lägg till under "Completed Work" i CLAUDE.md:

### ✅ v1.3.0 — Communication Flow (8 sprints)
- Thread view: HTML rendering (DOMPurify sanitized iframe), quoted text collapse, message accordion, avatar headers
- Inline reply & forward: reply/reply-all/forward in thread view, quick reply suggestions, In-Reply-To headers
- Keyboard shortcuts: vim-style (j/k/e/#/r/a/f), two-key combos (g+i, g+d), help overlay (?), context-aware
- Real-time SSE: /events/stream endpoint, live inbox updates, connection indicator, exponential backoff reconnect
- Snooze UI: preset picker, custom datetime, hover actions, mobile swipe gestures, auto-unsnooze in scheduler
- Performance: cursor pagination, SWR infinite scroll, virtual list rendering, optimistic mutations
- Settings: unified sidebar layout, onboarding wizard, compact mode, notification sound, external images toggle
- Release: 36 server + 9 client test files, v1.3.0 tag

Uppdatera "Current Git Status" och "TODO" sektionerna.

## STEG 7: KÖR STYRDOKUMENT

```bash
npm run styrdokument
```

## STEG 8: COMMITTA + PUSHA

```bash
git add -A
git commit -m "chore: merge v1.3.0 to main — git cleanup, CLAUDE.md update, deploy ready"
git push origin main
```

Verifiera att push lyckas.

## REGLER
- NOLL TypeScript-errors innan commit
- Lösa ALLA test-failures
- ALDRIG force push
- ALDRIG ändra koden i steg som inte handlar om det
- Om något failar: fixa det, committa separat, pusha igen
