/**
 * Seed Brain Core — Email workflow rules, writing profile, and known contacts.
 *
 * Run: npm run seed:brain-core
 * (or: npx ts-node src/scripts/seed-brain-core.ts)
 *
 * Idempotent — uses upsert, safe to run multiple times.
 * Requires DATABASE_URL in environment.
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const prisma = new PrismaClient();

async function seed() {
  // Resolve userId from first active account (single-owner deployment)
  const account = await prisma.emailAccount.findFirst({ where: { isActive: true } });
  if (!account) {
    console.error('Inget aktivt konto hittades. Lägg till ett konto i CDP-gränssnittet först.');
    process.exit(1);
  }
  const userId = account.userId;
  console.log(`\nSeeding Brain Core for userId: ${userId}\n`);

  // Import and delegate to service (single source of truth for seed data)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { seedBrainCore } = require('../services/seed-brain-core.service');
  const result = await seedBrainCore(userId);

  console.log(`  [OK] WritingModes: ${result.writingModes}`);
  console.log(`  [OK] VoiceAttributes: ${result.voiceAttributes}`);
  console.log(`  [OK] ClassificationRules: ${result.classificationRules}`);
  console.log(`  [OK] Contacts: ${result.contacts}`);
  console.log('\nBrain Core seedad!\n');
}

seed()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
