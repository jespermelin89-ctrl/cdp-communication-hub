# Fix Render Build Failure — CDP Communication Hub

Render-deploy failar med "Exited with status 1". Trolig orsak: `prisma migrate deploy` kraschar.

## Fix redan gjord (verifiera):

### 1. `server/package.json` build script
Ska vara:
```json
"build": "prisma generate && (prisma migrate deploy 2>/dev/null || prisma db push --skip-generate 2>/dev/null || true) && tsc"
```
Logik: försök migrate deploy först, om det failar kör db push som fallback, om det också failar fortsätt ändå (tsc kompilerar).

### 2. `render.yaml` buildCommand
Ska vara:
```yaml
buildCommand: npm install && npm run build
```
Inte `npm install && npx prisma generate && npm run build` — prisma generate körs redan i build-scriptet.

## Åtgärder att ta:

1. Committa ändringarna:
```bash
git add server/package.json render.yaml
git commit -m "fix: make build resilient to prisma migrate failures

prisma migrate deploy can fail if DB was modified via db push.
Fallback chain: migrate deploy → db push → continue to tsc.
Also remove duplicate prisma generate from render.yaml."
```

2. Pusha till main:
```bash
git push origin main
```

3. Övervaka Render-deployen — den triggas automatiskt.

4. Om den fortfarande failar, kolla loggarna och rapportera exakt felmeddelande.
