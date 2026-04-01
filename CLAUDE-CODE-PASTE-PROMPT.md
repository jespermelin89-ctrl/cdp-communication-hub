Du jobbar i cdp-communication-hub projektet. Det finns en fil som heter BUILD-SPEC-6.md i samma mapp som README.md och package.json (projektets rot). Kör detta kommando först för att verifiera att filen finns:

cat ./BUILD-SPEC-6.md | head -5

Läs sedan hela filen. Den innehåller 8 sprints som bygger v1.3.0 — "Communication Flow". Läs även CLAUDE.md och STYRDOKUMENT.md för projektregler och arkitektur.

Börja med Sprint 1 och jobba dig igenom alla i ordning. Varje sprint = 1 commit. Följ alla regler i specifikationen. Kör npx tsc --noEmit i BÅDA client och server innan varje commit. Sprint 8 är release — tagga v1.3.0. Bygg klart allt.
