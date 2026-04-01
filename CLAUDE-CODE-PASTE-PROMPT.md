Du jobbar i cdp-communication-hub projektet. Det finns en fil som heter BUILD-SPEC-5.md i samma mapp som README.md och package.json (projektets rot). Kör detta kommando först för att verifiera att filen finns:

cat ./BUILD-SPEC-5.md | head -5

Läs sedan hela filen. Den innehåller 8 sprints som bygger v1.2.0. Börja med Sprint 1 och jobba dig igenom alla i ordning. Varje sprint = 1 commit. Följ alla regler i specifikationen. Kör npx tsc --noEmit i BÅDA client och server innan varje commit. Sprint 8 är release — tagga v1.2.0. Bygg klart allt.
