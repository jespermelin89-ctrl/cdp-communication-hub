/**
 * Seed Brain Core tables from Jesper's writing profile.
 *
 * Run: npx ts-node src/scripts/seed-brain-core.ts
 *
 * Idempotent — uses upsert so safe to run multiple times.
 * Requires DATABASE_URL in .env and a valid userId.
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const prisma = new PrismaClient();

// The owner's userId — fetched by email at runtime
const OWNER_EMAIL = 'jesper.melin89@gmail.com';

async function main() {
  const user = await prisma.user.findUnique({ where: { email: OWNER_EMAIL } });
  if (!user) {
    console.error(`User not found: ${OWNER_EMAIL}`);
    process.exit(1);
  }

  const userId = user.id;
  console.log(`Seeding Brain Core for userId: ${userId}`);

  // ============================================================
  // Writing Modes (5 modes from JESPER-WRITING-PROFILE.md)
  // ============================================================
  const writingModes = [
    {
      modeKey: 'mode_a',
      name: 'Casual Swedish',
      description: 'Team/internal communication — Sanna, collaborators, friends',
      characteristics: {
        sentenceLength: 'short',
        formality: 'casual',
        lists: 'numbered',
        emoji: 'rarely',
        language: 'swedish_with_english_terms',
      },
      examplePhrases: [
        'Vi kör igång med dagligt content',
        'Snabb heads up:',
        'Kan du filma en kort story-sekvens?',
        'Behöver de poleras/justeras innan vi postar?',
      ],
      signOff: '/J',
      openerStyle: 'Hej [name]!',
    },
    {
      modeKey: 'mode_b',
      name: 'Formal Swedish',
      description: 'Government/institutional correspondence — Skatteverket, Kronofogden, lawyers',
      characteristics: {
        sentenceLength: 'full',
        formality: 'formal',
        lists: 'numbered',
        emoji: 'never',
        language: 'swedish_formal',
        structure: 'identification + background + request',
      },
      examplePhrases: [
        'Jag skriver till er för att jag önskar få en fullständig sammanställning',
        'Det har aldrig funnits någon avsikt att undvika betalning',
        'Jag nås enklast via e-post på denna adress',
      ],
      signOff: 'Med vänliga hälsningar, Jesper Melin',
      openerStyle: 'Full identification: name, personnummer, address',
    },
    {
      modeKey: 'mode_c',
      name: 'English Partnership Pitches',
      description: 'Brand pitches — Goodr, NoBull, Whoop, TRX, LMNT, Gymshark, etc.',
      characteristics: {
        sentenceLength: 'short_paragraphs',
        formality: 'direct_professional',
        lists: 'bullet',
        emoji: 'never',
        language: 'english',
        numbers: 'always_concrete',
        cta: 'bold_questions',
      },
      examplePhrases: [
        'No algorithms. No content theater. Just real training, real people, real results.',
        'This isn\'t influencer marketing.',
        'We\'re not asking for a sponsorship deal. We\'re asking if you want to be part of a movement.',
        'Data doesn\'t lie. Neither do we.',
      ],
      signOff: 'Jesper / Captain J',
      openerStyle: 'Hey, or Hi [name],',
    },
    {
      modeKey: 'mode_d',
      name: 'Swedish Partnership Pitches',
      description: 'Swedish brand pitches — NOCCO, Barebells, Craft',
      characteristics: {
        sentenceLength: 'short',
        formality: 'direct_casual',
        lists: 'bullet',
        emoji: 'never',
        language: 'swedish_with_english_terms',
        identity: 'swedish_connection',
      },
      examplePhrases: [
        'Barebells är svenskt. Vi är svenska.',
        'Inte influencer-marketing. Det är en gemenskap.',
      ],
      signOff: 'Jesper / Captain J',
      openerStyle: 'Direct opener connecting to Swedish identity',
    },
    {
      modeKey: 'mode_e',
      name: 'Spanish Business',
      description: 'Local Spanish partnerships — Hyrox España, ISDIN, local businesses',
      characteristics: {
        sentenceLength: 'medium',
        formality: 'professional_not_overly_formal',
        lists: 'bullet',
        language: 'spanish',
        angle: 'community_international',
      },
      examplePhrases: [
        '42 países representados en nuestra comunidad',
        'Presencia física en el Paseo Marítimo de Torrevieja',
      ],
      signOff: 'Jesper Melin / Captain J',
      openerStyle: 'Community-focused with international appeal',
    },
  ];

  for (const mode of writingModes) {
    await prisma.writingMode.upsert({
      where: { userId_modeKey: { userId, modeKey: mode.modeKey } },
      create: { userId, ...mode },
      update: mode,
    });
    console.log(`  ✓ WritingMode: ${mode.modeKey}`);
  }

  // ============================================================
  // Voice Attributes (from section 3)
  // ============================================================
  const voiceAttributes = [
    {
      attribute: 'directness',
      score: 0.9,
      description: 'Gets to the point immediately. No warming up.',
      examples: ['No algorithms. No content theater.', 'Data doesn\'t lie. Neither do we.'],
    },
    {
      attribute: 'authenticity',
      score: 1.0,
      description: 'Never corporate-speak. Always real.',
      examples: ['Om du får ett mail från mig som känns lite \'strukturerat\' — det är assistenten'],
    },
    {
      attribute: 'confidence',
      score: 0.8,
      description: 'Bold claims backed by numbers. Not arrogant.',
      examples: ['1,500+ members', '42 countries', '50-100 people daily'],
    },
    {
      attribute: 'vulnerability',
      score: 0.7,
      description: 'Shares struggle openly when relevant. Not performative.',
      examples: ['Det har aldrig funnits någon avsikt att undvika betalning'],
    },
    {
      attribute: 'energy',
      score: 0.9,
      description: 'High-energy, forward-moving.',
      examples: ['Vi kör!', 'Are you in?', 'Vill du ändra världen tillsammans?'],
    },
    {
      attribute: 'warmth',
      score: 0.6,
      description: 'Warm with team, cooler with strangers.',
      examples: ['Hej Sanna!', 'Hey,'],
    },
  ];

  for (const attr of voiceAttributes) {
    await prisma.voiceAttribute.upsert({
      where: { userId_attribute: { userId, attribute: attr.attribute } },
      create: { userId, ...attr },
      update: attr,
    });
    console.log(`  ✓ VoiceAttribute: ${attr.attribute}`);
  }

  // ============================================================
  // Classification Rules (from section 5)
  // ============================================================
  const classificationRules = [
    {
      categoryKey: 'partnership_pitch',
      categoryName: 'Partnership Pitch',
      description: 'Outgoing sponsorship/collaboration pitches to brands',
      priority: 'high',
      action: 'track_responses',
      senderPatterns: [],
      subjectPatterns: ['partnership', 'collaboration', 'sponsorship', 'sponsor'],
      bodyPatterns: ['Are you in?', 'movement', 'community', 'ambassador'],
    },
    {
      categoryKey: 'team_coordination',
      categoryName: 'Team Coordination',
      description: 'Internal communication with Sanna, coaches, team',
      priority: 'high',
      action: 'respond_or_delegate',
      senderPatterns: ['zannatrollstierna@gmail.com'],
      subjectPatterns: [],
      bodyPatterns: [],
    },
    {
      categoryKey: 'myndigheter',
      categoryName: 'Myndigheter',
      description: 'Swedish government/institutional correspondence',
      priority: 'high',
      action: 'flag_for_review',
      senderPatterns: ['*@skatteverket.se', '*@kronofogden.se', '*@forsakringskassan.se'],
      subjectPatterns: ['skatteverket', 'kronofogden', 'försäkringskassan', 'folkbokföring'],
      bodyPatterns: [],
    },
    {
      categoryKey: 'community_skool',
      categoryName: 'Community (Skool)',
      description: 'Skool notifications, new members, comments',
      priority: 'medium',
      action: 'summarize_daily',
      senderPatterns: ['noreply@skool.com'],
      subjectPatterns: ['New customer', 'New member', 'commented', 'liked'],
      bodyPatterns: [],
    },
    {
      categoryKey: 'dev_ops',
      categoryName: 'DevOps',
      description: 'Vercel, Render, GitHub deploy notifications',
      priority: 'low',
      action: 'auto_archive_unless_failure',
      senderPatterns: ['notifications@vercel.com', 'no-reply@render.com', 'no-reply@github.com'],
      subjectPatterns: ['deployment', 'build', 'deploy', 'pipeline'],
      bodyPatterns: [],
    },
    {
      categoryKey: 'marketing_tools',
      categoryName: 'Marketing Tools',
      description: 'SaaS onboarding, newsletters, product updates',
      priority: 'low',
      action: 'auto_archive',
      senderPatterns: [],
      subjectPatterns: ['newsletter', 'product update', 'onboarding', 'getting started'],
      bodyPatterns: ['unsubscribe', 'manage preferences'],
    },
    {
      categoryKey: 'delivery_failures',
      categoryName: 'Delivery Failures',
      description: 'Bounced emails, delivery status notifications',
      priority: 'medium',
      action: 'flag_and_suggest_fix',
      senderPatterns: ['mailer-daemon@googlemail.com', 'postmaster@*'],
      subjectPatterns: ['Delivery Status Notification', 'Mail Delivery Failed', 'Undeliverable'],
      bodyPatterns: [],
    },
    {
      categoryKey: 'security_alerts',
      categoryName: 'Security Alerts',
      description: 'Login alerts, password changes, 2FA',
      priority: 'high',
      action: 'flag_immediately',
      senderPatterns: ['no-reply@accounts.google.com', 'security@mail.instagram.com'],
      subjectPatterns: ['sign-in', 'new device', 'security alert', 'password changed'],
      bodyPatterns: [],
    },
    {
      categoryKey: 'personal',
      categoryName: 'Personal',
      description: 'Personal conversations, friends, family',
      priority: 'high',
      action: 'flag_for_review',
      senderPatterns: [],
      subjectPatterns: [],
      bodyPatterns: [],
    },
  ];

  for (const rule of classificationRules) {
    await prisma.classificationRule.upsert({
      where: { userId_categoryKey: { userId, categoryKey: rule.categoryKey } },
      create: { userId, ...rule },
      update: rule,
    });
    console.log(`  ✓ ClassificationRule: ${rule.categoryKey}`);
  }

  console.log('\n✅ Brain Core seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
