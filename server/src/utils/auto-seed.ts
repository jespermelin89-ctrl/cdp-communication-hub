/**
 * auto-seed.ts — Seeds Brain Core at server startup if empty.
 *
 * Called once after the DB connection is confirmed ready.
 * Idempotent: skips entirely if any WritingMode already exists for the user.
 * This is the fallback for Render free tier where manual shell access is unavailable.
 */

import { prisma } from '../config/database';

export async function autoSeedBrainCore(): Promise<void> {
  try {
    const account = await prisma.emailAccount.findFirst({ where: { isActive: true } });
    if (!account) {
      // No account yet — user hasn't authenticated. Skip silently.
      return;
    }
    const userId = account.userId;

    const existingModes = await prisma.writingMode.count({ where: { userId } });
    if (existingModes > 0) {
      console.log('[auto-seed] Brain Core redan seedat, hoppar över.');
      return;
    }

    console.log('[auto-seed] Brain Core tom — seedar...');

    // ── WRITING MODES ──────────────────────────────────────────────────────
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
    console.log(`[auto-seed] ${writingModes.length} writing modes seedade.`);

    // ── VOICE ATTRIBUTES ───────────────────────────────────────────────────
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
    console.log(`[auto-seed] ${voiceAttributes.length} voice attributes seedade.`);

    // ── CLASSIFICATION RULES ───────────────────────────────────────────────
    const classificationRules = [
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
    ];

    for (const rule of classificationRules) {
      await prisma.classificationRule.upsert({
        where: { userId_categoryKey: { userId, categoryKey: rule.categoryKey } },
        update: rule,
        create: { userId, ...rule },
      });
    }
    console.log(`[auto-seed] ${classificationRules.length} classification rules seedade.`);

    // ── CONTACT PROFILES ───────────────────────────────────────────────────
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
    console.log(`[auto-seed] ${contacts.length} contact profiles seedade.`);

    // ── EMAIL TEMPLATES ────────────────────────────────────────────────────
    const existingTemplates = await prisma.emailTemplate.count({ where: { userId } });
    if (existingTemplates === 0) {
      const templates = [
        {
          name: 'Snabbsvar — mottaget',
          subject: 'Re: {{subject}}',
          bodyText: 'Hej!\n\nTack för ditt mail, jag har tagit emot det och återkommer inom kort.\n\n/Jesper',
          category: 'general',
        },
        {
          name: 'Mötesbokningsförfrågan',
          subject: 'Möte — {{topic}}',
          bodyText: 'Hej!\n\nJag skulle gärna vilja boka in ett kort möte för att diskutera {{topic}}.\n\nHar du möjlighet någon av dessa tider:\n- \n- \n- \n\nÅterhör gärna vad som passar.\n\n/Jesper',
          category: 'meeting',
        },
        {
          name: 'Uppföljning utan svar',
          subject: 'Uppföljning: {{subject}}',
          bodyText: 'Hej!\n\nJag hörde av mig för ett tag sedan och ville följa upp — har du haft tillfälle att titta på det?\n\nHojta om du behöver mer information.\n\n/Jesper',
          category: 'follow-up',
        },
        {
          name: 'Introduktionsmejl',
          subject: 'Introduktion — Jesper Melin, CDP Holding',
          bodyText: 'Hej!\n\nMitt namn är Jesper Melin och jag driver CDP Holding.\n\nJag hörde av mig eftersom {{reason}}.\n\nSkulle gärna ta ett kort samtal för att höra mer om er verksamhet och se om det finns något vi kan göra tillsammans.\n\nÅterhör gärna!\n\n/Jesper',
          category: 'outreach',
        },
        {
          name: 'Tack och bekräftelse',
          subject: 'Tack! — {{topic}}',
          bodyText: 'Hej!\n\nTack så mycket för {{topic}}. Det uppskattas verkligen.\n\nJag återkommer när jag har tittat igenom allt.\n\n/Jesper',
          category: 'general',
        },
      ];

      for (const tmpl of templates) {
        await prisma.emailTemplate.create({ data: { userId, ...tmpl } });
      }
      console.log(`[auto-seed] ${templates.length} email templates seedade.`);
    }

    // ── SAVED VIEWS ────────────────────────────────────────────────────────
    const existingViews = await prisma.savedView.count({ where: { userId } });
    if (existingViews === 0) {
      const views = [
        {
          name: 'Leads',
          icon: 'zap',
          filters: { classification: 'lead' },
          sortOrder: 0,
        },
        {
          name: 'Hög prioritet',
          icon: 'flame',
          filters: { priority: 'high' },
          sortOrder: 1,
        },
        {
          name: 'Olästa',
          icon: 'mail',
          filters: { isRead: false },
          sortOrder: 2,
        },
        {
          name: 'Stjärnmärkta',
          icon: 'star',
          filters: { label: 'STARRED' },
          sortOrder: 3,
        },
      ];

      for (const view of views) {
        await prisma.savedView.create({ data: { userId, ...view as any } });
      }
      console.log(`[auto-seed] ${views.length} saved views seedade.`);
    }

    console.log('[auto-seed] Brain Core klar!');
  } catch (err: any) {
    // Never crash the server due to seed failure
    console.error('[auto-seed] Fel vid seedning:', err?.message ?? err);
  }
}
