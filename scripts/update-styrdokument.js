#!/usr/bin/env node
/**
 * update-styrdokument.js
 *
 * Scans the codebase and regenerates STYRDOKUMENT.md.
 * Run: node scripts/update-styrdokument.js
 * Or:  npm run styrdokument (from repo root)
 *
 * Zero external dependencies — plain Node.js fs/path only.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT  = path.join(ROOT, 'STYRDOKUMENT.md');

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function readFile(rel) {
  try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
  catch { return ''; }
}

function listFiles(rel, ext) {
  const dir = path.join(ROOT, rel);
  try {
    return fs.readdirSync(dir)
      .filter(f => f.endsWith(ext))
      .map(f => f.replace(ext, ''));
  } catch { return []; }
}

/** Extract all HTTP method registrations from a route file */
function extractRoutes(routeFile) {
  const src = readFile(`server/src/routes/${routeFile}.ts`);
  const lines = src.split('\n');
  const routes = [];
  for (const line of lines) {
    const m = line.match(/fastify\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/);
    if (m) routes.push(`${m[1].toUpperCase().padEnd(7)} ${m[2]}`);
  }
  return routes;
}

/** Extract model names from schema.prisma */
function extractModels() {
  const src = readFile('server/src/prisma/schema.prisma');
  const models = [];
  for (const line of src.split('\n')) {
    const m = line.match(/^model\s+(\w+)\s*\{/);
    if (m) models.push(m[1]);
  }
  return models;
}

/** Extract i18n languages from index.ts */
function extractLanguages() {
  const src = readFile('client/lib/i18n/index.ts');
  const langs = [];
  for (const line of src.split('\n')) {
    const m = line.match(/import\s+\w+\s+from\s+['"`]\.\/(\w+)['"`]/);
    if (m && m[1] !== 'sv') langs.push(m[1]);
  }
  return ['sv (default)', ...langs];
}

/** Get server dependencies (non-dev) from package.json */
function extractDeps() {
  try {
    const pkg = JSON.parse(readFile('server/package.json'));
    return Object.entries(pkg.dependencies || {}).map(([k, v]) => `${k} ${v}`);
  } catch { return []; }
}

/** Count lines in a file (rough code size indicator) */
function lineCount(rel) {
  const src = readFile(rel);
  return src ? src.split('\n').length : 0;
}

// ──────────────────────────────────────────────
// Gather data
// ──────────────────────────────────────────────

const now = new Date().toISOString().slice(0, 19).replace('T', ' ') + ' UTC';

const routeFiles = listFiles('server/src/routes', '.ts');
const serviceFiles = listFiles('server/src/services', '.ts');
const clientPages = listFiles('client/app', '');  // dirs
const models = extractModels();
const languages = extractLanguages();
const deps = extractDeps();

// Build route table
const routeTable = [];
for (const rf of routeFiles) {
  const endpoints = extractRoutes(rf);
  for (const ep of endpoints) {
    routeTable.push({ file: rf, endpoint: ep });
  }
}

// Client pages (Next.js app router directories)
const appDir = path.join(ROOT, 'client/app');
function walkAppPages(dir, prefix = '') {
  const pages = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const name = entry.name;
      if (name.startsWith('_') || name.startsWith('.')) continue;
      const route = prefix + '/' + name;
      const hasPage = fs.existsSync(path.join(dir, name, 'page.tsx'));
      if (hasPage) pages.push(route);
      pages.push(...walkAppPages(path.join(dir, name), route));
    }
  } catch {}
  return pages;
}
const frontendRoutes = ['/ (dashboard)', ...walkAppPages(appDir).map(r => r)];

// ──────────────────────────────────────────────
// Render document
// ──────────────────────────────────────────────

const doc = `# CDP Communication Hub — Styrdokument

> **Auto-genererat** — senast uppdaterat: ${now}
> Kör \`npm run styrdokument\` för att uppdatera.

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
| 6 | **Draft → Approve → Send** — Genomdrivs på databasnivå. \`POST /drafts/:id/send\` kontrollerar \`status === 'approved'\` i en transaktion. |

---

## Arkitektur

\`\`\`
Gmail API ← Backend (Fastify :3001) ← AI Layer (Claude API) ← Frontend (Next.js :3000)
                     ↑
               Claude / Dispatch (läser + utkastas via API, kan inte godkänna eller skicka)
\`\`\`

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
| i18n | ${languages.join(', ')} |

---

## Backend — API-rutter

Prefix: \`/api/v1\`

${routeTable.length === 0
  ? '_Inga rutter hittade_'
  : routeTable.map(r => `| \`${r.endpoint}\` | \`${r.file}\` |`).join('\n')
    ? `| Endpoint | Fil |\n|----------|-----|\n` + routeTable.map(r => `| \`${r.endpoint}\` | \`${r.file}\` |`).join('\n')
    : '_Inga rutter hittade_'
}

---

## Backend — Tjänster

${serviceFiles.map(s => `- \`${s}.ts\``).join('\n')}

---

## Databas — Tabeller (${models.length} st)

${models.map(m => `- \`${m}\``).join('\n')}

### Kritisk tabell: \`Draft\`

Varje utgående e-post börjar som ett utkast här.
\`status\`-fältet genomdriver godkännandebarriären:

\`\`\`
pending → approved → sent
                  ↘ failed
        ↘ discarded
\`\`\`

Inget API-anrop kan kringgå detta — \`POST /drafts/:id/send\` kontrollerar statusen i en databastransaktion.

---

## Frontend — Sidor

${frontendRoutes.map(r => `- \`${r}\``).join('\n')}

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
| Frontend (Vercel) | https://cdp-communication-hub.vercel.app | Push till \`main\` |
| Backend (Render) | https://cdp-communication-hub.onrender.com | Push till \`main\` |
| GitHub | github.com/jespermelin89-ctrl/cdp-communication-hub | — |

---

## Serverpaket (${deps.length} direktberoenden)

<details>
<summary>Visa alla</summary>

${deps.map(d => `- \`${d}\``).join('\n')}

</details>

---

## Ägarskap

**Jesper Melin** (jesper.melin89@gmail.com)
GitHub: [jespermelin89-ctrl](https://github.com/jespermelin89-ctrl)

---

_Detta dokument genereras automatiskt av \`scripts/update-styrdokument.js\`.
Ändra inte manuellt — kör \`npm run styrdokument\` igen efter kodändringar._
`;

fs.writeFileSync(OUT, doc, 'utf8');
console.log(`✓ STYRDOKUMENT.md uppdaterat (${doc.split('\n').length} rader)`);
