/**
 * Rule Engine Service
 *
 * Matches email threads against Brain Core ClassificationRules.
 * Zero AI cost — pure pattern matching against senderPatterns[], subjectPatterns[], bodyPatterns[].
 * Run this FIRST in the triage pipeline; only call AI if no rule matches.
 */

import { prisma } from '../config/database';

export interface RuleMatch {
  categoryKey: string;
  categoryName: string;
  priority: string;
  action: string;
}

/**
 * Glob match: * matches any substring, ? matches a single character.
 * Case-insensitive.
 */
function matchGlob(text: string, pattern: string): boolean {
  if (!pattern) return false;
  // Escape regex metacharacters except * and ?
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i').test(text);
}

/**
 * Check whether a thread matches any active ClassificationRule for the given user.
 * Patterns are checked in this order: senderPatterns → subjectPatterns → bodyPatterns.
 * Returns the first matching rule, or null if none match.
 * Also increments the rule's timesMatched counter (fire-and-forget).
 */
export async function matchClassificationRule(
  thread: {
    subject: string | null;
    participantEmails: string[];
    messages?: Array<{ bodyText: string | null }>;
  },
  userId: string
): Promise<RuleMatch | null> {
  const rules = await prisma.classificationRule.findMany({
    where: { userId, isActive: true },
    // Check most-frequently matched rules first (faster on average)
    orderBy: { timesMatched: 'desc' },
  });

  if (rules.length === 0) return null;

  const subjectLower = (thread.subject ?? '').toLowerCase();
  const bodyLower = thread.messages
    ? thread.messages.map((m) => m.bodyText ?? '').join(' ').toLowerCase()
    : '';

  for (const rule of rules) {
    let matched = false;

    // ── Sender patterns ───────────────────────────────────────────────────
    if (!matched && rule.senderPatterns.length > 0) {
      matched = rule.senderPatterns.some((pattern) =>
        thread.participantEmails.some((email) =>
          matchGlob(email.toLowerCase(), pattern.toLowerCase())
        )
      );
    }

    // ── Subject patterns (substring match) ────────────────────────────────
    if (!matched && rule.subjectPatterns.length > 0) {
      matched = rule.subjectPatterns.some((pattern) =>
        subjectLower.includes(pattern.toLowerCase())
      );
    }

    // ── Body patterns (substring match — only when messages are available) ─
    if (!matched && rule.bodyPatterns.length > 0 && bodyLower) {
      matched = rule.bodyPatterns.some((pattern) =>
        bodyLower.includes(pattern.toLowerCase())
      );
    }

    if (matched) {
      // Increment match counter — fire-and-forget so we don't slow the triage pipeline
      prisma.classificationRule
        .update({
          where: { id: rule.id },
          data: { timesMatched: { increment: 1 } },
        })
        .catch(() => {});

      return {
        categoryKey: rule.categoryKey,
        categoryName: rule.categoryName,
        priority: rule.priority,
        action: rule.action,
      };
    }
  }

  return null;
}
