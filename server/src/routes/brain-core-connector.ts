import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  archiveConnectorThread,
  approveConnectorDraft,
  BRAIN_CORE_CONNECTOR_CONTRACT,
  createConnectorDraft,
  getConnectorClassifiedSummary,
  getConnectorDraft,
  getConnectorHealth,
  getConnectorInboxSummary,
  getConnectorThread,
  getConnectorTriageStatus,
  listConnectorThreads,
  markConnectorThreadRead,
  sendConnectorDraft,
  toConnectorResponseError,
} from '../services/brain-core-connector.service';

const threadMailboxSchema = z.enum(['inbox', 'sent', 'trash', 'archive', 'snoozed', 'all']);

const connectorThreadQuerySchema = z.object({
  account_id: z.string().uuid().optional(),
  label: z.string().optional(),
  unread: z.union([
    z.boolean(),
    z.enum(['true', 'false']).transform((value) => value === 'true'),
  ]).optional(),
  search: z.string().optional(),
  cursor: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(25),
  mailbox: threadMailboxSchema.optional(),
});

const connectorInboxSummaryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(25).default(10),
});

const connectorTriageStatusQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(30).default(1),
});

const connectorDraftCreateSchema = z.object({
  account_id: z.string().uuid().optional(),
  accountId: z.string().uuid().optional(),
  thread_id: z.string().uuid().optional(),
  threadId: z.string().uuid().optional(),
  to: z.array(z.string().email()).min(1).optional(),
  to_addresses: z.array(z.string().email()).min(1).optional(),
  cc: z.array(z.string().email()).optional(),
  cc_addresses: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  bcc_addresses: z.array(z.string().email()).optional(),
  subject: z.string().min(1).max(500),
  body: z.string().min(1).optional(),
  body_text: z.string().min(1).optional(),
  bodyHtml: z.string().optional(),
  body_html: z.string().optional(),
  replyToMessageId: z.string().optional(),
  reply_to_message_id: z.string().optional(),
}).superRefine((data, ctx) => {
  if (!(data.to || data.to_addresses)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['to'],
      message: 'to or to_addresses is required',
    });
  }

  if (!(data.body || data.body_text)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['body'],
      message: 'body or body_text is required',
    });
  }
}).transform((data) => ({
  accountId: data.accountId ?? data.account_id,
  threadId: data.threadId ?? data.thread_id,
  to: data.to ?? data.to_addresses ?? [],
  cc: data.cc ?? data.cc_addresses ?? [],
  bcc: data.bcc ?? data.bcc_addresses ?? [],
  subject: data.subject,
  body: data.body ?? data.body_text ?? '',
  bodyHtml: data.bodyHtml ?? data.body_html,
}));

function getHeaderString(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

async function brainCoreConnectorAuth(request: FastifyRequest, reply: FastifyReply) {
  const apiKey = getHeaderString(request.headers['x-api-key']);

  if (apiKey && env.COMMAND_API_KEY && apiKey === env.COMMAND_API_KEY) {
    const requestedAccountId = getHeaderString(request.headers['x-account-id']);
    if (requestedAccountId) {
      const account = await prisma.emailAccount.findFirst({
        where: { id: requestedAccountId, isActive: true },
        select: { userId: true },
      });

      if (!account) {
        return reply.code(403).send({
          success: false,
          contract_version: BRAIN_CORE_CONNECTOR_CONTRACT,
          error: 'X-Account-Id does not resolve to an active account',
        });
      }

      request.userId = account.userId;
      request.userEmail = '';
      return;
    }

    const activeAccounts = await prisma.emailAccount.findMany({
      where: { isActive: true },
      select: { userId: true },
      take: 10,
    });
    const userIds = [...new Set(activeAccounts.map((account) => account.userId))];

    if (userIds.length === 1) {
      request.userId = userIds[0];
      request.userEmail = '';
      return;
    }

    return reply.code(409).send({
      success: false,
      contract_version: BRAIN_CORE_CONNECTOR_CONTRACT,
      error: 'Ambiguous API key context. Provide X-Account-Id for connector routes.',
    });
  }

  return authMiddleware(request, reply);
}

function ok<T>(data: T, meta?: Record<string, unknown>) {
  return {
    success: true,
    contract_version: BRAIN_CORE_CONNECTOR_CONTRACT,
    data,
    ...(meta ? { meta } : {}),
  };
}

function handleConnectorError(reply: FastifyReply, error: unknown) {
  const normalized = toConnectorResponseError(error);
  return reply.code(normalized.statusCode).send({
    success: false,
    contract_version: BRAIN_CORE_CONNECTOR_CONTRACT,
    error: normalized.message,
  });
}

export async function brainCoreConnectorRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', brainCoreConnectorAuth);

  fastify.get('/connectors/brain-core/health', async (request, reply) => {
    try {
      return ok(await getConnectorHealth(request.userId));
    } catch (error) {
      return handleConnectorError(reply, error);
    }
  });

  fastify.get('/connectors/brain-core/inbox-summary', async (request, reply) => {
    const parsed = connectorInboxSummaryQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({
        success: false,
        contract_version: BRAIN_CORE_CONNECTOR_CONTRACT,
        error: 'Invalid query',
        details: parsed.error.issues,
      });
    }

    try {
      return ok(await getConnectorInboxSummary(request.userId, parsed.data.limit));
    } catch (error) {
      return handleConnectorError(reply, error);
    }
  });

  fastify.get('/connectors/brain-core/threads', async (request, reply) => {
    const parsed = connectorThreadQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({
        success: false,
        contract_version: BRAIN_CORE_CONNECTOR_CONTRACT,
        error: 'Invalid query',
        details: parsed.error.issues,
      });
    }

    try {
      const result = await listConnectorThreads(request.userId, {
        accountId: parsed.data.account_id,
        label: parsed.data.label,
        unread: parsed.data.unread,
        search: parsed.data.search,
        cursor: parsed.data.cursor,
        page: parsed.data.page,
        limit: parsed.data.limit,
        mailbox: parsed.data.mailbox,
      });

      return ok(result.threads, result.meta);
    } catch (error) {
      return handleConnectorError(reply, error);
    }
  });

  fastify.get('/connectors/brain-core/threads/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      return ok(await getConnectorThread(request.userId, id));
    } catch (error) {
      return handleConnectorError(reply, error);
    }
  });

  fastify.post('/connectors/brain-core/threads/:id/read', async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      return ok(await markConnectorThreadRead(request.userId, id));
    } catch (error) {
      return handleConnectorError(reply, error);
    }
  });

  fastify.post('/connectors/brain-core/threads/:id/archive', async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      return ok(await archiveConnectorThread(request.userId, id));
    } catch (error) {
      return handleConnectorError(reply, error);
    }
  });

  fastify.get('/connectors/brain-core/triage-status', async (request, reply) => {
    const parsed = connectorTriageStatusQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({
        success: false,
        contract_version: BRAIN_CORE_CONNECTOR_CONTRACT,
        error: 'Invalid query',
        details: parsed.error.issues,
      });
    }

    try {
      return ok(await getConnectorTriageStatus(request.userId, parsed.data.days));
    } catch (error) {
      return handleConnectorError(reply, error);
    }
  });

  fastify.get('/connectors/brain-core/classified-summary', async (request, reply) => {
    try {
      return ok(await getConnectorClassifiedSummary(request.userId));
    } catch (error) {
      return handleConnectorError(reply, error);
    }
  });

  fastify.post('/connectors/brain-core/drafts', async (request, reply) => {
    const parsed = connectorDraftCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        success: false,
        contract_version: BRAIN_CORE_CONNECTOR_CONTRACT,
        error: 'Invalid input',
        details: parsed.error.issues,
      });
    }

    try {
      return reply.code(201).send(ok(await createConnectorDraft(request.userId, parsed.data)));
    } catch (error) {
      return handleConnectorError(reply, error);
    }
  });

  fastify.get('/connectors/brain-core/drafts/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      return ok(await getConnectorDraft(request.userId, id));
    } catch (error) {
      return handleConnectorError(reply, error);
    }
  });

  fastify.post('/connectors/brain-core/drafts/:id/approve', async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      return ok(await approveConnectorDraft(request.userId, id));
    } catch (error) {
      return handleConnectorError(reply, error);
    }
  });

  fastify.post('/connectors/brain-core/drafts/:id/send', async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      return ok(await sendConnectorDraft(request.userId, id));
    } catch (error) {
      return handleConnectorError(reply, error);
    }
  });
}
