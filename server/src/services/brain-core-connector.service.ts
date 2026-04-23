import { prisma } from '../config/database';
import { draftService } from './draft.service';
import { gmailService } from './gmail.service';
import { sanitizeLabel, sanitizeSearch } from '../utils/sanitize';
import {
  getThreadMutationUnsupportedError,
  type ThreadMutationAction,
} from '../utils/thread-provider-capabilities';

export const BRAIN_CORE_CONNECTOR_CONTRACT = 'brain-core-connector.v1';

type ThreadMailbox = 'inbox' | 'sent' | 'trash' | 'archive' | 'snoozed' | 'all';

export interface ConnectorThreadListOptions {
  accountId?: string;
  label?: string;
  unread?: boolean;
  search?: string;
  cursor?: string;
  page: number;
  limit: number;
  mailbox?: ThreadMailbox;
}

export interface ConnectorDraftInput {
  accountId?: string;
  threadId?: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
  bodyHtml?: string;
}

class ConnectorHttpError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

function connectorError(statusCode: number, message: string): never {
  throw new ConnectorHttpError(statusCode, message);
}

function getThreadMutationError(provider: string, action: ThreadMutationAction): string | null {
  return getThreadMutationUnsupportedError(provider, action);
}

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function parseAttachments(value: unknown): Array<{ name: string; size: number; mimeType: string }> {
  if (!Array.isArray(value)) return [];

  return value.map((attachment) => {
    const item = (attachment ?? {}) as Record<string, unknown>;
    return {
      name: String(item.filename ?? item.name ?? ''),
      size: Number(item.size ?? 0),
      mimeType: String(item.mimeType ?? item.mime_type ?? 'application/octet-stream'),
    };
  });
}

function buildThreadPage<T extends { id: string; lastMessageAt: Date | null }>(
  threadsRaw: T[],
  limit: number
) {
  const hasMoreCursor = threadsRaw.length > limit;
  const threads = hasMoreCursor ? threadsRaw.slice(0, limit) : threadsRaw;
  const lastThread = threads[threads.length - 1];
  const nextCursor = (hasMoreCursor && lastThread?.lastMessageAt && lastThread?.id)
    ? Buffer.from(`${lastThread.lastMessageAt.toISOString()}::${lastThread.id}`).toString('base64')
    : null;

  return {
    hasMoreCursor,
    nextCursor,
    threads,
  };
}

function mapLatestAnalysis(analysis: {
  summary: string;
  classification: string;
  priority: string;
  suggestedAction: string;
  confidence?: number | null;
} | null | undefined) {
  if (!analysis) return undefined;

  return {
    summary: analysis.summary,
    classification: analysis.classification,
    priority: analysis.priority,
    suggestedAction: analysis.suggestedAction,
    confidence: analysis.confidence ?? null,
  };
}

function mapThread(thread: {
  id: string;
  accountId: string;
  gmailThreadId: string;
  subject: string | null;
  snippet: string | null;
  participantEmails: string[];
  labels: string[];
  messageCount: number;
  isRead: boolean;
  isSentByUser: boolean;
  lastMessageAt: Date | null;
  createdAt: Date;
  account: { id: string; emailAddress: string; provider: string };
  analyses?: Array<{
    summary: string;
    classification: string;
    priority: string;
    suggestedAction: string;
    confidence?: number | null;
  }>;
}) {
  const latestAnalysis = thread.analyses?.[0] ?? null;
  const primarySender = thread.participantEmails[0] ?? thread.account.emailAddress;

  return {
    id: thread.id,
    accountId: thread.accountId,
    accountEmail: thread.account.emailAddress,
    provider: thread.account.provider,
    gmailThreadId: thread.gmailThreadId,
    subject: thread.subject ?? '(No Subject)',
    snippet: thread.snippet ?? '',
    from: primarySender,
    fromEmail: primarySender,
    unread: !thread.isRead,
    important: Boolean(
      latestAnalysis?.priority === 'high' ||
      thread.labels.includes('STARRED') ||
      thread.labels.includes('IMPORTANT')
    ),
    labels: thread.labels,
    messageCount: thread.messageCount,
    isSentByUser: thread.isSentByUser,
    lastMessageAt: toIso(thread.lastMessageAt ?? thread.createdAt)!,
    aiAnalysis: mapLatestAnalysis(latestAnalysis),
  };
}

function mapMessage(message: {
  id: string;
  threadId: string;
  gmailMessageId: string;
  fromAddress: string;
  toAddresses: string[];
  ccAddresses: string[];
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  attachments: unknown;
  unsubscribeUrl: string | null;
  receivedAt: Date;
}) {
  return {
    id: message.id,
    threadId: message.threadId,
    gmailMessageId: message.gmailMessageId,
    from: message.fromAddress,
    fromEmail: message.fromAddress,
    to: message.toAddresses,
    cc: message.ccAddresses,
    subject: message.subject ?? '',
    body: message.bodyText ?? '',
    bodyHtml: message.bodyHtml ?? undefined,
    unsubscribeUrl: message.unsubscribeUrl ?? undefined,
    sentAt: message.receivedAt.toISOString(),
    attachments: parseAttachments(message.attachments),
  };
}

function mapDraft(draft: {
  id: string;
  accountId: string;
  threadId: string | null;
  toAddresses: string[];
  ccAddresses: string[];
  bccAddresses: string[];
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
  status: string;
  source?: string | null;
  approvedAt: Date | null;
  sentAt: Date | null;
  errorMessage?: string | null;
  createdAt: Date;
  updatedAt?: Date;
  account?: { emailAddress: string };
}) {
  return {
    id: draft.id,
    accountId: draft.accountId,
    accountEmail: draft.account?.emailAddress,
    threadId: draft.threadId ?? undefined,
    to: draft.toAddresses,
    cc: draft.ccAddresses,
    bcc: draft.bccAddresses,
    subject: draft.subject,
    body: draft.bodyText,
    bodyHtml: draft.bodyHtml ?? undefined,
    status: draft.status,
    source: draft.source ?? undefined,
    errorMessage: draft.errorMessage ?? undefined,
    createdAt: draft.createdAt.toISOString(),
    updatedAt: toIso(draft.updatedAt),
    approvedAt: toIso(draft.approvedAt),
    sentAt: toIso(draft.sentAt),
  };
}

export function toConnectorResponseError(error: unknown) {
  if (error instanceof ConnectorHttpError) {
    return { statusCode: error.statusCode, message: error.message };
  }

  if (error instanceof Error) {
    return { statusCode: 500, message: error.message };
  }

  return { statusCode: 500, message: 'Unknown error' };
}

async function getOwnedActiveAccount(userId: string, accountId: string) {
  const account = await prisma.emailAccount.findFirst({
    where: { id: accountId, userId, isActive: true },
    select: { id: true, userId: true, emailAddress: true, provider: true },
  });

  if (!account) connectorError(404, 'Account not found');
  return account;
}

async function resolveDraftAccountId(userId: string, input: ConnectorDraftInput): Promise<string> {
  if (input.threadId) {
    const thread = await prisma.emailThread.findFirst({
      where: { id: input.threadId, account: { userId } },
      select: { id: true, accountId: true },
    });

    if (!thread) connectorError(404, 'Thread not found');
    if (input.accountId && input.accountId !== thread.accountId) {
      connectorError(400, 'account_id does not match thread ownership');
    }

    return thread.accountId;
  }

  if (input.accountId) {
    const account = await getOwnedActiveAccount(userId, input.accountId);
    return account.id;
  }

  const activeAccounts = await prisma.emailAccount.findMany({
    where: { userId, isActive: true },
    select: { id: true },
    take: 2,
  });

  if (activeAccounts.length === 0) {
    connectorError(400, 'No active account found for draft creation');
  }

  if (activeAccounts.length > 1) {
    connectorError(400, 'account_id is required when multiple active accounts exist');
  }

  return activeAccounts[0].id;
}

export async function getConnectorHealth(userId: string) {
  const [activeAccounts, unreadThreads, pendingDrafts] = await Promise.all([
    prisma.emailAccount.count({ where: { userId, isActive: true } }),
    prisma.emailThread.count({ where: { account: { userId }, isRead: false } }),
    prisma.draft.count({ where: { userId, status: 'pending' } }),
  ]);

  return {
    status: 'ok',
    contractVersion: BRAIN_CORE_CONNECTOR_CONTRACT,
    activeAccounts,
    unreadThreads,
    pendingDrafts,
    timestamp: new Date().toISOString(),
  };
}

export async function getConnectorInboxSummary(userId: string, limit = 10) {
  const safeLimit = Math.min(Math.max(limit, 1), 25);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    recentThreadsRaw,
    unreadCount,
    importantCount,
    totalCount,
    pendingDrafts,
    approvedDrafts,
    triageLogs,
    autoDraftsPending,
  ] = await Promise.all([
    prisma.emailThread.findMany({
      where: {
        account: { userId },
        labels: { has: 'INBOX' },
        NOT: { labels: { has: 'TRASH' } },
      },
      include: {
        account: { select: { id: true, emailAddress: true, provider: true } },
        analyses: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            summary: true,
            classification: true,
            priority: true,
            suggestedAction: true,
            confidence: true,
          },
        },
      },
      orderBy: { lastMessageAt: 'desc' },
      take: safeLimit,
    }),
    prisma.emailThread.count({
      where: {
        account: { userId },
        isRead: false,
        NOT: { labels: { has: 'TRASH' } },
      },
    }),
    prisma.emailThread.count({
      where: {
        account: { userId },
        NOT: { labels: { has: 'TRASH' } },
        OR: [
          { labels: { has: 'STARRED' } },
          { labels: { has: 'IMPORTANT' } },
          { analyses: { some: { priority: 'high' } } },
        ],
      },
    }),
    prisma.emailThread.count({
      where: {
        account: { userId },
        labels: { has: 'INBOX' },
        NOT: { labels: { has: 'TRASH' } },
      },
    }),
    prisma.draft.count({ where: { userId, status: 'pending' } }),
    prisma.draft.count({ where: { userId, status: 'approved' } }),
    prisma.triageLog.findMany({
      where: { userId, createdAt: { gte: today } },
      select: { action: true },
    }),
    prisma.draft.count({
      where: { userId, source: 'auto_triage', status: 'pending' },
    }),
  ]);

  return {
    unreadCount,
    importantCount,
    totalCount,
    pendingDrafts,
    approvedDrafts,
    recentThreads: recentThreadsRaw.map(mapThread),
    triageToday: {
      total_sorted: triageLogs.length,
      trashed: triageLogs.filter((log) =>
        ['trash', 'trash_after_log', 'notify_then_trash'].includes(log.action)
      ).length,
      in_review: triageLogs.filter((log) => log.action === 'label_review').length,
      kept: triageLogs.filter((log) =>
        ['keep_inbox', 'auto_draft'].includes(log.action)
      ).length,
      auto_drafts_pending: autoDraftsPending,
    },
    generatedAt: new Date().toISOString(),
  };
}

export async function listConnectorThreads(userId: string, options: ConnectorThreadListOptions) {
  const limit = Math.min(options.limit, 50);
  const where: Record<string, unknown> = {};

  if (options.accountId) {
    await getOwnedActiveAccount(userId, options.accountId);
    where.accountId = options.accountId;
  } else {
    where.account = { userId };
  }

  if (options.search) {
    const search = sanitizeSearch(options.search);
    where.OR = [
      { subject: { contains: search, mode: 'insensitive' } },
      { snippet: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (options.label) {
    where.labels = { has: sanitizeLabel(options.label) };
  }

  if (options.unread !== undefined) {
    where.isRead = !options.unread;
  }

  const mailbox = options.mailbox;
  if (mailbox) {
    const now = new Date();
    switch (mailbox) {
      case 'inbox':
        where.labels = { has: 'INBOX' };
        where.NOT = { labels: { has: 'TRASH' } };
        where.snoozedUntil = null;
        break;
      case 'sent':
        where.isSentByUser = true;
        break;
      case 'trash':
        where.labels = { has: 'TRASH' };
        break;
      case 'archive':
        where.NOT = [{ labels: { has: 'INBOX' } }, { labels: { has: 'TRASH' } }];
        break;
      case 'snoozed':
        where.snoozedUntil = { gt: now };
        break;
      case 'all':
        where.NOT = { labels: { has: 'TRASH' } };
        break;
    }
  }

  let cursorWhere: Record<string, unknown> = {};
  if (options.cursor) {
    try {
      const decoded = Buffer.from(options.cursor, 'base64').toString('utf-8');
      const [lastMsgAt, cursorId] = decoded.split('::');
      if (lastMsgAt && cursorId) {
        cursorWhere = {
          OR: [
            { lastMessageAt: { lt: new Date(lastMsgAt) } },
            { lastMessageAt: new Date(lastMsgAt), id: { lt: cursorId } },
          ],
        };
      }
    } catch {
      cursorWhere = {};
    }
  }

  const effectiveWhere = options.cursor ? { AND: [where, cursorWhere] } : where;
  const [threadsRaw, total] = await Promise.all([
    prisma.emailThread.findMany({
      where: effectiveWhere,
      include: {
        account: { select: { id: true, emailAddress: true, provider: true } },
        analyses: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            summary: true,
            classification: true,
            priority: true,
            suggestedAction: true,
            confidence: true,
          },
        },
      },
      orderBy: { lastMessageAt: 'desc' },
      skip: options.cursor ? 0 : (options.page - 1) * limit,
      take: limit + 1,
    }),
    prisma.emailThread.count({ where }),
  ]);

  const pageData = buildThreadPage(threadsRaw, limit);

  return {
    threads: pageData.threads.map(mapThread),
    meta: {
      mailbox: mailbox ?? 'inbox',
      pagination: {
        page: options.page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: options.cursor ? pageData.hasMoreCursor : (options.page * limit < total),
        nextCursor: pageData.nextCursor,
      },
    },
  };
}

export async function getConnectorThread(userId: string, threadId: string) {
  const thread = await prisma.emailThread.findFirst({
    where: { id: threadId, account: { userId } },
    include: {
      account: { select: { id: true, emailAddress: true, provider: true } },
      messages: {
        orderBy: { receivedAt: 'asc' },
      },
      analyses: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          summary: true,
          classification: true,
          priority: true,
          suggestedAction: true,
          suggestedReply: true,
          confidence: true,
        },
      },
      drafts: {
        where: { status: { in: ['pending', 'approved', 'sent', 'failed'] } },
        orderBy: { createdAt: 'desc' },
        include: {
          account: { select: { emailAddress: true } },
        },
        take: 10,
      },
    },
  });

  if (!thread) connectorError(404, 'Thread not found');

  const latestAnalysis = thread.analyses[0] ?? null;
  const unsubscribeUrl =
    [...thread.messages].reverse().find((message) => message.unsubscribeUrl)?.unsubscribeUrl ?? null;

  return {
    thread: {
      ...mapThread({
        ...thread,
        analyses: latestAnalysis ? [latestAnalysis] : [],
      }),
      suggestedReply: latestAnalysis?.suggestedReply ?? undefined,
      unsubscribeUrl: unsubscribeUrl ?? undefined,
    },
    messages: thread.messages.map(mapMessage),
    drafts: thread.drafts.map(mapDraft),
  };
}

export async function createConnectorDraft(userId: string, input: ConnectorDraftInput) {
  const accountId = await resolveDraftAccountId(userId, input);
  const draft = await draftService.create(userId, {
    account_id: accountId,
    thread_id: input.threadId,
    to_addresses: input.to,
    cc_addresses: input.cc,
    bcc_addresses: input.bcc,
    subject: input.subject,
    body_text: input.body,
    body_html: input.bodyHtml,
  });

  return mapDraft(draft);
}

export async function getConnectorDraft(userId: string, draftId: string) {
  const draft = await draftService.getById(draftId, userId);
  return mapDraft(draft);
}

export async function approveConnectorDraft(userId: string, draftId: string) {
  const draft = await draftService.approve(draftId, userId);
  return mapDraft(draft);
}

export async function sendConnectorDraft(userId: string, draftId: string) {
  const draft = await draftService.send(draftId, userId);
  return mapDraft(draft);
}

async function getMutableOwnedThread(userId: string, threadId: string) {
  const thread = await prisma.emailThread.findFirst({
    where: { id: threadId, account: { userId } },
    include: {
      account: { select: { id: true, emailAddress: true, provider: true } },
      analyses: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          summary: true,
          classification: true,
          priority: true,
          suggestedAction: true,
          confidence: true,
        },
      },
    },
  });

  if (!thread) connectorError(404, 'Thread not found');
  return thread;
}

export async function markConnectorThreadRead(userId: string, threadId: string) {
  const thread = await getMutableOwnedThread(userId, threadId);
  const readError = getThreadMutationError(thread.account.provider, 'read');
  if (readError) connectorError(409, readError);

  try {
    await gmailService.markAsRead(thread.account.id, thread.gmailThreadId);
  } catch (error: any) {
    connectorError(502, `Gmail read-state update failed: ${error.message}`);
  }

  await prisma.emailThread.update({
    where: { id: thread.id },
    data: {
      isRead: true,
      labels: thread.labels.filter((label) => label !== 'UNREAD'),
    },
  });

  return {
    threadId: thread.id,
    status: 'read',
  };
}

export async function archiveConnectorThread(userId: string, threadId: string) {
  const thread = await getMutableOwnedThread(userId, threadId);
  const archiveError = getThreadMutationError(thread.account.provider, 'archive');
  if (archiveError) connectorError(409, archiveError);

  try {
    await gmailService.archiveThread(thread.account.id, thread.gmailThreadId);
  } catch (error: any) {
    connectorError(502, `Gmail archive failed: ${error.message}`);
  }

  await prisma.emailThread.update({
    where: { id: thread.id },
    data: {
      labels: thread.labels.filter((label) => label !== 'INBOX'),
    },
  });

  return {
    threadId: thread.id,
    status: 'archived',
  };
}

export async function getConnectorTriageStatus(userId: string, days = 1) {
  const safeDays = Math.min(Math.max(days, 1), 30);
  const since = new Date(Date.now() - safeDays * 24 * 3600 * 1000);
  if (safeDays === 1) since.setHours(0, 0, 0, 0);

  const [logs, autoDraftCount] = await Promise.all([
    prisma.triageLog.findMany({
      where: { userId, createdAt: { gte: since } },
      select: { action: true, senderEmail: true },
    }),
    prisma.draft.count({
      where: { userId, source: 'auto_triage', status: 'pending' },
    }),
  ]);

  const byAction: Record<string, number> = {};
  const senderCounts: Record<string, number> = {};
  for (const log of logs) {
    byAction[log.action] = (byAction[log.action] ?? 0) + 1;
    const sender = log.senderEmail.trim().toLowerCase();
    senderCounts[sender] = (senderCounts[sender] ?? 0) + 1;
  }

  const topSenders = Object.entries(senderCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([sender]) => sender);

  const review = byAction['label_review'] ?? 0;

  return {
    period: safeDays === 1 ? 'today' : `last_${safeDays}_days`,
    total_sorted: logs.length,
    trashed: logs.filter((log) =>
      ['trash', 'trash_after_log', 'notify_then_trash'].includes(log.action)
    ).length,
    kept: logs.filter((log) =>
      ['keep_inbox', 'auto_draft'].includes(log.action)
    ).length,
    review,
    in_review: review,
    drafts_pending: autoDraftCount,
    auto_drafts_created: autoDraftCount,
    top_senders: topSenders,
    by_action: byAction,
  };
}

export async function getConnectorClassifiedSummary(userId: string) {
  const since24h = new Date(Date.now() - 24 * 3600 * 1000);

  const [totalUnread, spamArchived, attentionLogs, urgentLogs] = await Promise.all([
    prisma.triageLog.count({
      where: {
        userId,
        action: { in: ['keep_inbox', 'label_review'] },
        createdAt: { gte: since24h },
      },
    }),
    prisma.triageLog.count({
      where: {
        userId,
        action: { in: ['trash', 'trash_after_log', 'notify_then_trash'] },
        createdAt: { gte: since24h },
      },
    }),
    prisma.triageLog.findMany({
      where: {
        userId,
        action: 'keep_inbox',
        priority: 'medium',
        createdAt: { gte: since24h },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { threadId: true, subject: true, senderEmail: true, classification: true },
    }),
    prisma.triageLog.findMany({
      where: {
        userId,
        action: 'keep_inbox',
        priority: 'high',
        createdAt: { gte: since24h },
      },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { threadId: true, subject: true, senderEmail: true, classification: true },
    }),
  ]);

  const allThreadIds = [
    ...attentionLogs.map((log) => log.threadId),
    ...urgentLogs.map((log) => log.threadId),
  ];

  const snippetMap = new Map<string, string | null>();
  if (allThreadIds.length > 0) {
    const threads = await prisma.emailThread.findMany({
      where: { id: { in: allThreadIds } },
      select: { id: true, snippet: true },
    });
    for (const thread of threads) {
      snippetMap.set(thread.id, thread.snippet ?? null);
    }
  }

  const mapItem = (item: {
    threadId: string;
    subject: string | null;
    senderEmail: string;
    classification: string;
  }) => ({
    thread_id: item.threadId,
    subject: item.subject ?? '(No Subject)',
    from: item.senderEmail,
    classification: item.classification,
    snippet: snippetMap.get(item.threadId) ?? null,
  });

  return {
    total_unread: totalUnread,
    spam_archived: spamArchived,
    need_attention: attentionLogs.map(mapItem),
    urgent: urgentLogs.map(mapItem),
    since: since24h.toISOString(),
  };
}
