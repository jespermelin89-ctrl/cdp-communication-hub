/**
 * ActionLogService - Immutable audit trail.
 *
 * Every significant action is logged here:
 * draft_created, draft_approved, draft_sent, draft_discarded, analysis_run, etc.
 */

import { PrismaClient } from '@prisma/client';
import { prisma } from '../config/database';

type ActionType =
  | 'draft_created'
  | 'draft_approved'
  | 'draft_sent'
  | 'draft_send_failed'
  | 'draft_discarded'
  | 'analysis_run'
  | 'account_connected'
  | 'account_disconnected'
  | 'token_revoked'
  | 'token_refreshed'
  | 'reauth_completed'
  | 'calendar_hold_created';

export class ActionLogService {
  /**
   * Log an action to the audit trail.
   */
  async log(
    userId: string,
    actionType: ActionType,
    targetType?: string,
    targetId?: string,
    metadata?: Record<string, any>
  ) {
    return prisma.actionLog.create({
      data: {
        userId,
        actionType,
        targetType: targetType || null,
        targetId: targetId || null,
        metadata: metadata || {},
      },
    });
  }

  /**
   * Log within an existing transaction (used by DraftService.send).
   */
  async logInTransaction(
    tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>,
    userId: string,
    actionType: ActionType,
    targetType?: string,
    targetId?: string,
    metadata?: Record<string, any>
  ) {
    return tx.actionLog.create({
      data: {
        userId,
        actionType,
        targetType: targetType || null,
        targetId: targetId || null,
        metadata: metadata || {},
      },
    });
  }

  /**
   * Query action logs with filters.
   */
  async list(options: {
    userId?: string;
    actionType?: string;
    targetType?: string;
    targetId?: string;
    page?: number;
    limit?: number;
  } = {}) {
    const { userId, actionType, targetType, targetId, page = 1, limit = 50 } = options;

    const where: any = {};
    if (userId) where.userId = userId;
    if (actionType) where.actionType = actionType;
    if (targetType) where.targetType = targetType;
    if (targetId) where.targetId = targetId;

    const [logs, total] = await Promise.all([
      prisma.actionLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { email: true, name: true } },
        },
      }),
      prisma.actionLog.count({ where }),
    ]);

    return {
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

// Singleton
export const actionLogService = new ActionLogService();
