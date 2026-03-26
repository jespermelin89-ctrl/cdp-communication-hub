/**
 * Action log routes - Audit trail access.
 */

import { FastifyInstance } from 'fastify';
import { actionLogService } from '../services/action-log.service';
import { authMiddleware } from '../middleware/auth.middleware';

export async function actionLogRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  /**
   * GET /action-logs - List action logs for the current user
   */
  fastify.get('/action-logs', async (request) => {
    const { action_type, target_type, target_id, page, limit } = request.query as {
      action_type?: string;
      target_type?: string;
      target_id?: string;
      page?: string;
      limit?: string;
    };

    return actionLogService.list({
      userId: request.userId,
      actionType: action_type,
      targetType: target_type,
      targetId: target_id,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
    });
  });
}
