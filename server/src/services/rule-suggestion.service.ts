/**
 * RuleSuggestionService — Sprint 4 (Auto-lärande)
 *
 * Analyses triage_log patterns and suggests new ClassificationRules when
 * the same sender domain has been trashed 2+ times in the last 30 days.
 *
 * Flow:
 *  1. After a trash action, call checkAndCreateSuggestion(senderEmail, userId)
 *  2. If domain has ≥2 trash entries in triage_log → upsert a pending RuleSuggestion
 *  3. User accepts via acceptSuggestion() → ClassificationRule is created automatically
 *  4. User dismisses via dismissSuggestion() → marked dismissed, never re-suggested
 */

import { prisma } from '../config/database';

const SUGGESTION_THRESHOLD = 2;   // trash actions from same domain before suggesting rule
const LOOKBACK_DAYS = 30;

function getDomainPattern(email: string): string {
  const domain = email.split('@')[1]?.toLowerCase().trim();
  return domain ? `*@${domain}` : email.toLowerCase();
}

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

export interface RuleSuggestionRecord {
  id: string;
  senderPattern: string;
  suggestedAction: string;
  triggerCount: number;
  status: string;
  createdAt: Date;
}

/**
 * Check if a domain should get a rule suggestion after a trash action.
 * Called from the review decide endpoint and the triage action pipeline.
 * Safe to call multiple times — upserts, never duplicates.
 */
export async function checkAndCreateSuggestion(
  senderEmail: string,
  userId: string
): Promise<void> {
  const senderPattern = getDomainPattern(senderEmail);
  const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600 * 1000);

  // Count how many times any address on this domain has been trashed
  const trashCount = await prisma.triageLog.count({
    where: {
      userId,
      createdAt: { gte: cutoff },
      action: { in: ['trash', 'trash_after_log'] },
      senderEmail: { endsWith: `@${senderEmail.split('@')[1] ?? ''}` },
    },
  });

  if (trashCount < SUGGESTION_THRESHOLD) return;

  // Upsert — don't re-suggest if already accepted/dismissed
  const existing = await prisma.ruleSuggestion.findFirst({
    where: { userId, senderPattern },
    select: { id: true, status: true, triggerCount: true },
  });

  if (existing) {
    // Only update if still pending (keep accepted/dismissed as-is)
    if (existing.status === 'pending') {
      await prisma.ruleSuggestion.update({
        where: { id: existing.id },
        data: { triggerCount: trashCount },
      });
    }
    return;
  }

  await prisma.ruleSuggestion.create({
    data: {
      userId,
      senderPattern,
      suggestedAction: 'trash',
      triggerCount: trashCount,
      status: 'pending',
    },
  });

  console.log(`[RuleSuggestion] Created suggestion for ${senderPattern} (${trashCount} trash events)`);
}

/**
 * Return all pending rule suggestions for a user.
 */
export async function getPendingSuggestions(userId: string): Promise<RuleSuggestionRecord[]> {
  return prisma.ruleSuggestion.findMany({
    where: { userId, status: 'pending' },
    orderBy: { triggerCount: 'desc' },
    select: {
      id: true,
      senderPattern: true,
      suggestedAction: true,
      triggerCount: true,
      status: true,
      createdAt: true,
    },
  });
}

/**
 * Accept a suggestion — creates a ClassificationRule and marks suggestion accepted.
 */
export async function acceptSuggestion(
  id: string,
  userId: string
): Promise<{ created: boolean; categoryKey: string }> {
  const suggestion = await prisma.ruleSuggestion.findFirst({
    where: { id, userId, status: 'pending' },
  });

  if (!suggestion) {
    throw new Error('Suggestion not found or already resolved');
  }

  // Derive a stable category key from the pattern (e.g. "*@instagram.com" → "auto_instagram_com")
  const categoryKey = `auto_${suggestion.senderPattern
    .replace(/^\*@/, '')
    .replace(/[^a-z0-9]/gi, '_')
    .toLowerCase()}`;

  const categoryName = `Auto: ${suggestion.senderPattern}`;

  // Create ClassificationRule (idempotent — skip if category already exists)
  let created = false;
  try {
    await prisma.classificationRule.create({
      data: {
        userId,
        categoryKey,
        categoryName,
        description: `Auto-generated from ${suggestion.triggerCount} trash actions`,
        priority: 'low',
        action: suggestion.suggestedAction,
        senderPatterns: [suggestion.senderPattern],
        subjectPatterns: [],
        bodyPatterns: [],
        isActive: true,
      },
    });
    created = true;
  } catch (err: any) {
    // Unique constraint violation = rule already exists — still mark suggestion accepted
    if (!err?.message?.includes('Unique constraint')) throw err;
  }

  await prisma.ruleSuggestion.update({
    where: { id },
    data: { status: 'accepted' },
  });

  console.log(`[RuleSuggestion] Accepted: ${suggestion.senderPattern} → ${suggestion.suggestedAction} (rule created: ${created})`);
  return { created, categoryKey };
}

/**
 * Dismiss a suggestion — marks it dismissed so it won't be surfaced again.
 */
export async function dismissSuggestion(id: string, userId: string): Promise<void> {
  const suggestion = await prisma.ruleSuggestion.findFirst({
    where: { id, userId },
    select: { id: true },
  });

  if (!suggestion) throw new Error('Suggestion not found');

  await prisma.ruleSuggestion.update({
    where: { id },
    data: { status: 'dismissed' },
  });
}

/**
 * Scan the full triage_log for patterns and generate/refresh all suggestions.
 * Called by POST /api/v1/rules/suggest.
 * Returns the current list of pending suggestions after the scan.
 */
export async function generateSuggestions(userId: string): Promise<RuleSuggestionRecord[]> {
  const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600 * 1000);

  // Aggregate trash actions by senderEmail
  const logs = await prisma.triageLog.findMany({
    where: {
      userId,
      createdAt: { gte: cutoff },
      action: { in: ['trash', 'trash_after_log'] },
    },
    select: { senderEmail: true },
  });

  // Group by domain
  const domainCounts = new Map<string, number>();
  for (const log of logs) {
    const domain = log.senderEmail.split('@')[1]?.toLowerCase().trim();
    if (!domain) continue;
    const pattern = `*@${domain}`;
    domainCounts.set(pattern, (domainCounts.get(pattern) ?? 0) + 1);
  }

  // Create suggestions for domains above threshold
  for (const [senderPattern, count] of domainCounts) {
    if (count < SUGGESTION_THRESHOLD) continue;

    const existing = await prisma.ruleSuggestion.findFirst({
      where: { userId, senderPattern },
      select: { id: true, status: true },
    });

    if (!existing) {
      await prisma.ruleSuggestion.create({
        data: {
          userId,
          senderPattern,
          suggestedAction: 'trash',
          triggerCount: count,
          status: 'pending',
        },
      });
    } else if (existing.status === 'pending') {
      await prisma.ruleSuggestion.update({
        where: { id: existing.id },
        data: { triggerCount: count },
      });
    }
  }

  return getPendingSuggestions(userId);
}
