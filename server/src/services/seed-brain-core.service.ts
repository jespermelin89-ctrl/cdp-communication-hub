/**
 * Seed Brain Core — service layer for seeding writing profile and classification rules.
 *
 * Used by:
 *  - server/src/scripts/seed-brain-core.ts  (CLI: npm run seed:brain-core)
 *  - agent.ts action 'seed-brain-core'       (HTTP: POST /agent/execute { action: 'seed-brain-core' })
 *
 * Idempotent — uses upsert, safe to run multiple times.
 */

import { prisma } from '../config/database';

export interface SeedResult {
  writingModes: number;
  voiceAttributes: number;
  classificationRules: number;
  contacts: number;
}

export async function seedBrainCore(userId: string): Promise<SeedResult> {
  // ── WRITING MODES ─────────────────────────────────────────────────────────
  const writingModes = [
    {
      modeKey: 'casual_sv',
      name: 'Svenska vardaglig',
      description: 'Direkt, varm, inga korporativa fraser. Korta meningar. "du" inte "ni".',
      examplePhrases: [
        'Hej! Tack för att du hörde av dig.',
        'Absolut, vi kör på det. Hojta om du behöver nåt.',
        'Perfekt, jag tittar på det imorgon.',
      ],
      signOff: '/Jesper',
      openerStyle: 'Hej!',
      characteristics: { formality: 'casual', language: 'sv', sentences: 'short' },
    },
    {
      modeKey: 'formal_sv',
      name: 'Svenska formell',
      description: 'Fortfarande direkt men polerad. För myndigheter och affärskontakter.',
      examplePhrases: [
        'Tack för informationen. Jag återkommer inom kort.',
        'Jag bifogar de efterfrågade dokumenten.',
        'Med anledning av ovanstående önskar jag...',
      ],
      signOff: 'Med vänlig hälsning,\nJesper Melin',
      openerStyle: 'Hej,',
      characteristics: { formality: 'formal', language: 'sv', sentences: 'full' },
    },
    {
      modeKey: 'english',
      name: 'English',
      description: 'Confident, slightly informal. For international contacts and pitches.',
      examplePhrases: [
        'Hey! Thanks for reaching out.',
        'Sounds great — let me know how you want to move forward.',
        'Quick question:',
      ],
      signOff: 'Best,\nJesper',
      openerStyle: 'Hey / Hi [name],',
      characteristics: { formality: 'semi-formal', language: 'en', sentences: 'short' },
    },
  ];

  for (const mode of writingModes) {
    await prisma.writingMode.upsert({
      where: { userId_modeKey: { userId, modeKey: mode.modeKey } },
      update: mode,
      create: { userId, ...mode },
    });
  }

  // ── VOICE ATTRIBUTES ──────────────────────────────────────────────────────
  const voiceAttributes = [
    {
      attribute: 'tone',
      score: 0.9,
      description: 'Direkt och varm — aldrig korporativ',
      examples: ['Vi kör!', 'Hojta om du behöver nåt.'],
    },
    {
      attribute: 'formality',
      score: 0.3,
      description: 'Informell som default, formell för myndigheter',
      examples: ['Hej!', 'Med vänlig hälsning, Jesper Melin'],
    },
    {
      attribute: 'greeting',
      score: 1.0,
      description: 'Hej / Hey — aldrig "Bästa" eller "Kära"',
      examples: ['Hej!', 'Hey!'],
    },
    {
      attribute: 'closing',
      score: 1.0,
      description: '"Mvh" eller "/Jesper" — ALDRIG "Med vänliga hälsningar"',
      examples: ['/Jesper', 'Mvh', 'Best,\nJesper'],
    },
    {
      attribute: 'style',
      score: 0.9,
      description: 'Korta meningar. Rak på sak. Ingen onödig fyllnadstext.',
      examples: ['Tack för att du hörde av dig.', 'Jag återkommer imorgon.'],
    },
    {
      attribute: 'apology',
      score: 0.2,
      description: 'Aldrig överdrivet ursäktande. Rakt och ärligt.',
      examples: ['Tyvärr kan jag inte...', 'Det stämmer inte — jag förklarar gärna.'],
    },
  ];

  for (const attr of voiceAttributes) {
    await prisma.voiceAttribute.upsert({
      where: { userId_attribute: { userId, attribute: attr.attribute } },
      update: attr,
      create: { userId, ...attr },
    });
  }

  // ── CLASSIFICATION RULES ──────────────────────────────────────────────────
  const classificationRules = [
    // AUTO/LÅGPRIO
    {
      categoryKey: 'noreply_auto',
      categoryName: 'Noreply automatisk',
      description: 'Automatiska noreply-mail → auto/low',
      priority: 'low',
      action: 'auto_archive',
      senderPatterns: ['noreply@*', 'no-reply@*'],
      subjectPatterns: [],
      bodyPatterns: [],
    },
    {
      categoryKey: 'github_notifications',
      categoryName: 'GitHub Notiser',
      description: 'GitHub-notiser → gruppera och sammanfatta',
      priority: 'low',
      action: 'group_and_summarize',
      senderPatterns: ['notifications@github.com'],
      subjectPatterns: [],
      bodyPatterns: [],
    },
    {
      categoryKey: 'render_deploy_ok',
      categoryName: 'Render Deploy OK',
      description: 'Render deploy OK → auto/low',
      priority: 'low',
      action: 'auto_archive',
      senderPatterns: ['no-reply@render.com'],
      subjectPatterns: [],
      bodyPatterns: ['deployed successfully', 'Deploy succeeded'],
    },
    {
      categoryKey: 'skool_notifications',
      categoryName: 'Skool Notiser',
      description: 'Skool community-notiser',
      priority: 'low',
      action: 'group_and_summarize',
      senderPatterns: ['*@skool.com'],
      subjectPatterns: [],
      bodyPatterns: [],
    },
    {
      categoryKey: 'newsletter',
      categoryName: 'Nyhetsbrev',
      description: 'Nyhetsbrev och marknadsföringsmail',
      priority: 'low',
      action: 'auto_archive',
      senderPatterns: [],
      subjectPatterns: ['newsletter', 'nyhetsbrev'],
      bodyPatterns: ['unsubscribe', 'avregistrera'],
    },
    // BRA ATT VETA
    {
      categoryKey: 'render_deploy_fail',
      categoryName: 'Render Deploy Misslyckades',
      description: 'Render deploy FAILED → bra att veta',
      priority: 'medium',
      action: 'notify',
      senderPatterns: ['no-reply@render.com'],
      subjectPatterns: ['failed', 'Failed', 'error'],
      bodyPatterns: [],
    },
    {
      categoryKey: 'github_ci_fail',
      categoryName: 'GitHub CI Misslyckades',
      description: 'GitHub CI failure → bra att veta',
      priority: 'medium',
      action: 'notify',
      senderPatterns: ['notifications@github.com'],
      subjectPatterns: ['failed', 'failing', 'Run failed'],
      bodyPatterns: [],
    },
    // HÖG PRIORITET — MYNDIGHETER
    {
      categoryKey: 'kronofogden',
      categoryName: 'Kronofogden',
      description: 'Kronofogden — ALLTID hög prio',
      priority: 'high',
      action: 'flag_immediately',
      senderPatterns: ['*@kronofogden.se'],
      subjectPatterns: [],
      bodyPatterns: [],
    },
    {
      categoryKey: 'forsakringskassan',
      categoryName: 'Försäkringskassan',
      description: 'Försäkringskassan — ALLTID hög prio',
      priority: 'high',
      action: 'flag_immediately',
      senderPatterns: ['*@forsakringskassan.se'],
      subjectPatterns: [],
      bodyPatterns: [],
    },
    {
      categoryKey: 'skatteverket',
      categoryName: 'Skatteverket',
      description: 'Skatteverket — ALLTID hög prio',
      priority: 'high',
      action: 'flag_immediately',
      senderPatterns: ['*@skatteverket.se'],
      subjectPatterns: [],
      bodyPatterns: [],
    },
    {
      categoryKey: 'skuldsanering_keyword',
      categoryName: 'Skuldsanering',
      description: 'Skuldsaneringsärenden',
      priority: 'high',
      action: 'flag_immediately',
      senderPatterns: [],
      subjectPatterns: ['skuldsanering'],
      bodyPatterns: ['skuldsanering'],
    },
    {
      categoryKey: 'sjukersattning_keyword',
      categoryName: 'Sjukersättning',
      description: 'Sjukersättning-relaterat',
      priority: 'high',
      action: 'flag_immediately',
      senderPatterns: [],
      subjectPatterns: ['sjukersättning', 'sjukersattning'],
      bodyPatterns: ['sjukersättning'],
    },
    {
      categoryKey: 'vardskada_keyword',
      categoryName: 'Vårdskada',
      description: 'Vårdskadeärenden och patientnämnd',
      priority: 'high',
      action: 'flag_immediately',
      senderPatterns: [],
      subjectPatterns: ['vårdskada', 'patientnämnd', 'vardskada'],
      bodyPatterns: ['vårdskada', 'patientnämnd'],
    },
    // KRÄVER SVAR
    {
      categoryKey: 'direct_question',
      categoryName: 'Direkt fråga',
      description: 'Direkt fråga som kräver svar (AI-detekterad)',
      priority: 'high',
      action: 'reply_required',
      senderPatterns: [],
      subjectPatterns: [],
      bodyPatterns: ['AI_DETECT:direct_question'],
    },
  ];

  for (const rule of classificationRules) {
    await prisma.classificationRule.upsert({
      where: { userId_categoryKey: { userId, categoryKey: rule.categoryKey } },
      update: rule,
      create: { userId, ...rule },
    });
  }

  // ── CONTACT PROFILES ──────────────────────────────────────────────────────
  const contacts = [
    {
      emailAddress: 'no-reply@render.com',
      displayName: 'Render',
      relationship: 'service',
      notes: 'Deploy-notiser. OK = ignorera. Failed = kolla omedelbart.',
    },
    {
      emailAddress: 'notifications@github.com',
      displayName: 'GitHub',
      relationship: 'service',
      notes: 'CI/CD-notiser. Gruppera. Failures = bra att veta.',
    },
  ];

  for (const contact of contacts) {
    await prisma.contactProfile.upsert({
      where: { userId_emailAddress: { userId, emailAddress: contact.emailAddress } },
      update: contact,
      create: { userId, ...contact },
    });
  }

  return {
    writingModes: writingModes.length,
    voiceAttributes: voiceAttributes.length,
    classificationRules: classificationRules.length,
    contacts: contacts.length,
  };
}
