#!/usr/bin/env tsx
import { execSync } from 'child_process';

const checks = [
  { name: 'TypeScript (server)', cmd: 'cd server && npx tsc --noEmit' },
  { name: 'TypeScript (client)', cmd: 'cd client && npx tsc --noEmit' },
  { name: 'Tests (server)', cmd: 'cd server && npx vitest run' },
];

let failed = 0;
for (const check of checks) {
  try {
    execSync(check.cmd, { stdio: 'pipe' });
    console.log(`✅ ${check.name}`);
  } catch {
    console.log(`❌ ${check.name}`);
    failed++;
  }
}

const required = [
  'DATABASE_URL', 'JWT_SECRET', 'ENCRYPTION_KEY',
  'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI',
  'FRONTEND_URL', 'GROQ_API_KEY',
];
const missing = required.filter(k => !process.env[k]);
if (missing.length) console.log(`⚠️  Missing env vars: ${missing.join(', ')}`);

console.log(`\n${failed === 0 ? '🚀 Ready to deploy!' : `❌ ${failed} check(s) failed`}`);
process.exit(failed);
