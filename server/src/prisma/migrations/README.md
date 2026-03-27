# Prisma Migrations — Baseline Setup

## Historik

Databasen skapades ursprungligen via `prisma db push` (ingen migrationshistorik).
Migrationen `0_init` är en baseline-snapshot av det aktuella schemat — den ska INTE
köras mot en databas som redan har dessa tabeller.

## Engångssteg mot Supabase (redan gjort / att göra)

Kör detta **en gång** mot Supabase-instansen för att registrera baseline
i `_prisma_migrations`-tabellen utan att SQL:en exekveras:

```bash
cd server
npx prisma migrate resolve --applied 0_init
```

Detta skapar raden i `_prisma_migrations` och markerar migrationen som tillämpad.
Alla framtida migrationer (ny `prisma migrate dev`) appliceras normalt efter detta.

## Från och med nu

Använd aldrig `prisma db push` i produktion. Flödet är:
- Lokal utveckling: `prisma migrate dev --name beskrivning`
- Deploy (Render build): `prisma migrate deploy` (körs automatiskt via `npm run build`)
