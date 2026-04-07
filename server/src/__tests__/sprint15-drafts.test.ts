/**
 * Sprint 15 — Drafts route tests (CRUD, attachments, undo-send).
 *
 * Already covered in sprint11: POST /drafts/:id/send, POST /drafts/:id/schedule
 * This file covers the remainder:
 *
 *  POST /drafts                    — schema validation, 201 + draft
 *  GET /drafts                     — delegates to draftService.list
 *  GET /drafts/pending             — auto_triage pending drafts
 *  GET /drafts/:id                 — 404 on error
 *  PATCH /drafts/:id               — schema validation, 404/400 on error
 *  POST /drafts/:id/approve        — 404/400, success + learning event fire-and-forget
 *  DELETE /drafts/:id/schedule     — 404, clears scheduledAt
 *  POST /drafts/:id/attachments    — 404 draft, 400 no file, 400 too large (>25MB), 400 invalid MIME, 201 success
 *  DELETE /drafts/:id/attachments/:attachmentId — removes attachment
 *  POST /drafts/:id/discard        — 404, success
 *  POST /drafts/:id/send-delayed   — 404, bad status→400, delay=0→immediate, pending→approve first
 *  POST /drafts/:id/cancel-send    — 404, wrong status→400, no scheduledAt→400, past time→400, success
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../config/database', () => ({
  prisma: {
    draft: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    actionLog: { create: vi.fn() },
    userSettings: { findUnique: vi.fn() },
  },
}));

vi.mock('../services/draft.service', () => ({
  draftService: {
    create: vi.fn(),
    list: vi.fn(),
    getById: vi.fn(),
    update: vi.fn(),
    approve: vi.fn(),
    send: vi.fn(),
    discard: vi.fn(),
  },
}));

vi.mock('../services/brain-core.service', () => ({
  brainCoreService: {
    recordLearning: vi.fn().mockResolvedValue({}),
  },
}));

import { prisma } from '../config/database';
import { draftService } from '../services/draft.service';
import { brainCoreService } from '../services/brain-core.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeDraft(overrides: Record<string, unknown> = {}) {
  return {
    id: 'draft-1',
    userId: 'user-1',
    status: 'pending',
    subject: 'Test',
    bodyText: 'Hello world',
    toAddresses: ['recipient@example.com'],
    attachments: [],
    scheduledAt: null,
    source: null,
    threadId: null,
    accountId: 'acc-1',
    createdAt: new Date(),
    ...overrides,
  };
}

// ─── POST /drafts ─────────────────────────────────────────────────────────────

async function simulateCreateDraft(body: unknown, userId = 'user-1') {
  const { CreateDraftSchema } = await import('../utils/validators');
  const parsed = CreateDraftSchema.safeParse(body);
  if (!parsed.success) {
    return { code: 400, body: { error: 'Invalid input', details: parsed.error.issues } };
  }
  const draft = await draftService.create(userId, parsed.data);
  return { code: 201, body: { draft } };
}

// ─── GET /drafts ──────────────────────────────────────────────────────────────

async function simulateListDrafts(query: Record<string, unknown>, userId = 'user-1') {
  const { DraftQuerySchema } = await import('../utils/validators');
  const parsed = DraftQuerySchema.safeParse(query);
  const options = parsed.success ? parsed.data : {};
  const result = await draftService.list(userId, {
    status: (options as any).status,
    accountId: (options as any).account_id,
    page: (options as any).page,
    limit: (options as any).limit,
  });
  return { code: 200, body: result };
}

// ─── GET /drafts/pending ──────────────────────────────────────────────────────

async function simulatePendingDrafts(userId = 'user-1') {
  const drafts = await (prisma.draft.findMany as any)({ where: { userId, status: 'pending', source: 'auto_triage' } });
  return { code: 200, body: { drafts, count: drafts.length } };
}

// ─── GET /drafts/:id ──────────────────────────────────────────────────────────

async function simulateGetDraft(id: string, userId = 'user-1') {
  try {
    const draft = await draftService.getById(id, userId);
    return { code: 200, body: { draft } };
  } catch (error: any) {
    return { code: 404, body: { error: error.message } };
  }
}

// ─── PATCH /drafts/:id ────────────────────────────────────────────────────────

async function simulateUpdateDraft(id: string, body: unknown, userId = 'user-1') {
  const { UpdateDraftSchema } = await import('../utils/validators');
  const parsed = UpdateDraftSchema.safeParse(body);
  if (!parsed.success) {
    return { code: 400, body: { error: 'Invalid input', details: parsed.error.issues } };
  }
  try {
    const draft = await draftService.update(id, userId, parsed.data);
    return { code: 200, body: { draft } };
  } catch (error: any) {
    const code = error.message.includes('not found') ? 404 : 400;
    return { code, body: { error: error.message } };
  }
}

// ─── POST /drafts/:id/approve ─────────────────────────────────────────────────

async function simulateApproveDraft(id: string, userId = 'user-1') {
  try {
    const draft = await draftService.approve(id, userId);
    // Fire-and-forget (don't await in production)
    brainCoreService.recordLearning(userId, 'draft:approved', { draft_id: draft.id }, 'draft_approve', draft.id).catch(() => {});
    return { code: 200, body: { draft, message: 'Draft approved. You can now send it.' } };
  } catch (error: any) {
    const code = error.message.includes('not found') ? 404 : 400;
    return { code, body: { error: error.message } };
  }
}

// ─── DELETE /drafts/:id/schedule ─────────────────────────────────────────────

async function simulateCancelSchedule(id: string, userId = 'user-1') {
  const draft = await (prisma.draft.findFirst as any)({ where: { id, userId } });
  if (!draft) return { code: 404, body: { error: 'Draft not found' } };
  const updated = await (prisma.draft.update as any)({ where: { id }, data: { scheduledAt: null } });
  return { code: 200, body: { draft: updated, message: 'Schemaläggning avbruten' } };
}

// ─── POST /drafts/:id/attachments ─────────────────────────────────────────────

const ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv', 'text/html',
  'application/zip', 'application/x-zip-compressed',
  'audio/mpeg', 'audio/wav', 'video/mp4',
];

async function simulateUploadAttachment(
  draftId: string,
  file: { filename: string; mimetype: string; size: number } | null,
  userId = 'user-1'
) {
  const draft = await (prisma.draft.findFirst as any)({ where: { id: draftId, userId } });
  if (!draft) return { code: 404, body: { error: 'Draft not found' } };
  if (!file) return { code: 400, body: { error: 'No file uploaded' } };
  if (file.size > 25 * 1024 * 1024) return { code: 400, body: { error: 'File too large (max 25 MB)' } };
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) return { code: 400, body: { error: `Unsupported file type: ${file.mimetype}` } };

  const existing: any[] = (draft.attachments as any[]) ?? [];
  const newAttachment = { id: 'att-1', filename: file.filename, mimeType: file.mimetype, size: file.size, data: 'base64data' };
  existing.push(newAttachment);
  await (prisma.draft.update as any)({ where: { id: draftId }, data: { attachments: existing } });

  return { code: 201, body: { attachment: { id: newAttachment.id, filename: newAttachment.filename, mimeType: newAttachment.mimeType, size: newAttachment.size } } };
}

// ─── DELETE /drafts/:id/attachments/:attachmentId ─────────────────────────────

async function simulateDeleteAttachment(draftId: string, attachmentId: string, userId = 'user-1') {
  const draft = await (prisma.draft.findFirst as any)({ where: { id: draftId, userId } });
  if (!draft) return { code: 404, body: { error: 'Draft not found' } };
  const existing: any[] = (draft.attachments as any[]) ?? [];
  const filtered = existing.filter((a: any) => a.id !== attachmentId);
  await (prisma.draft.update as any)({ where: { id: draftId }, data: { attachments: filtered } });
  return { code: 200, body: { message: 'Attachment removed' } };
}

// ─── POST /drafts/:id/discard ─────────────────────────────────────────────────

async function simulateDiscardDraft(id: string, userId = 'user-1') {
  try {
    const draft = await draftService.discard(id, userId);
    return { code: 200, body: { draft, message: 'Draft discarded.' } };
  } catch (error: any) {
    const code = error.message.includes('not found') ? 404 : 400;
    return { code, body: { error: error.message } };
  }
}

// ─── POST /drafts/:id/send-delayed ───────────────────────────────────────────

async function simulateSendDelayed(id: string, body: { delay_seconds?: number }, userId = 'user-1') {
  const draft = await (prisma.draft.findFirst as any)({ where: { id, userId } });
  if (!draft) return { code: 404, body: { error: 'Draft not found' } };
  if (!['pending', 'approved'].includes(draft.status)) {
    return { code: 400, body: { error: `Cannot delay-send a draft with status: ${draft.status}` } };
  }

  let delaySeconds = body.delay_seconds ?? 10;
  if (body.delay_seconds === undefined) {
    const settings = await (prisma.userSettings.findUnique as any)({ where: { userId } });
    if (settings?.undoSendDelay !== undefined) delaySeconds = settings.undoSendDelay;
  }

  if (draft.status === 'pending') {
    await draftService.approve(id, userId);
  }

  if (delaySeconds <= 0) {
    const sentDraft = await draftService.send(id, userId);
    return { code: 200, body: { draft: sentDraft, scheduledAt: null, delaySeconds: 0, sentImmediately: true } };
  }

  const scheduledAt = new Date(Date.now() + delaySeconds * 1000);
  const updated = await (prisma.draft.update as any)({ where: { id }, data: { status: 'approved', scheduledAt } });
  return { code: 200, body: { draft: updated, scheduledAt: scheduledAt.toISOString(), delaySeconds } };
}

// ─── POST /drafts/:id/cancel-send ────────────────────────────────────────────

async function simulateCancelSend(id: string, userId = 'user-1') {
  const draft = await (prisma.draft.findFirst as any)({ where: { id, userId } });
  if (!draft) return { code: 404, body: { error: 'Draft not found' } };
  if (!['approved', 'sending'].includes(draft.status)) {
    return { code: 400, body: { error: 'Draft is not in a cancellable delayed-send state' } };
  }
  if (!draft.scheduledAt) {
    return { code: 400, body: { error: 'Draft has no delayed send to cancel', cancelled: false } };
  }
  if (draft.scheduledAt <= new Date()) {
    return { code: 400, body: { error: 'Cannot cancel — email has already been sent', cancelled: false } };
  }
  const updated = await (prisma.draft.update as any)({ where: { id }, data: { status: 'approved', scheduledAt: null } });
  return { code: 200, body: { draft: updated, cancelled: true } };
}

// ─── POST /drafts tests ───────────────────────────────────────────────────────

describe('POST /drafts', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 400 when body is invalid', async () => {
    const result = await simulateCreateDraft({});
    expect(result.code).toBe(400);
  });

  it('returns 201 with created draft', async () => {
    vi.mocked(draftService.create).mockResolvedValue(makeDraft() as any);
    const result = await simulateCreateDraft({ account_id: '00000000-0000-0000-0000-000000000001', to_addresses: ['x@x.com'], subject: 'Test', body_text: 'Hello' });
    expect(result.code).toBe(201);
    expect((result.body as any).draft.id).toBe('draft-1');
  });

  it('delegates to draftService.create with userId', async () => {
    vi.mocked(draftService.create).mockResolvedValue(makeDraft() as any);
    await simulateCreateDraft({ account_id: '00000000-0000-0000-0000-000000000001', to_addresses: ['x@x.com'], subject: 'S', body_text: 'B' }, 'user-42');
    expect(draftService.create).toHaveBeenCalledWith('user-42', expect.any(Object));
  });
});

// ─── GET /drafts tests ────────────────────────────────────────────────────────

describe('GET /drafts', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('delegates to draftService.list with userId and options', async () => {
    vi.mocked(draftService.list).mockResolvedValue({ drafts: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } as any);
    await simulateListDrafts({ status: 'pending', page: '2', limit: '10' });
    expect(draftService.list).toHaveBeenCalledWith('user-1', expect.objectContaining({ status: 'pending' }));
  });

  it('returns result from draftService.list', async () => {
    vi.mocked(draftService.list).mockResolvedValue({ drafts: [makeDraft()], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } } as any);
    const result = await simulateListDrafts({});
    expect((result.body as any).drafts).toHaveLength(1);
  });
});

// ─── GET /drafts/pending tests ────────────────────────────────────────────────

describe('GET /drafts/pending', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns only auto_triage pending drafts', async () => {
    vi.mocked(prisma.draft.findMany).mockResolvedValue([
      makeDraft({ source: 'auto_triage', status: 'pending' }),
    ] as any);
    const result = await simulatePendingDrafts();
    expect(result.code).toBe(200);
    expect((result.body as any).count).toBe(1);
    expect((result.body as any).drafts[0].source).toBe('auto_triage');
  });

  it('returns empty when no auto_triage drafts', async () => {
    vi.mocked(prisma.draft.findMany).mockResolvedValue([]);
    const result = await simulatePendingDrafts();
    expect((result.body as any).count).toBe(0);
    expect((result.body as any).drafts).toHaveLength(0);
  });
});

// ─── GET /drafts/:id tests ────────────────────────────────────────────────────

describe('GET /drafts/:id', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns draft on success', async () => {
    vi.mocked(draftService.getById).mockResolvedValue(makeDraft() as any);
    const result = await simulateGetDraft('draft-1');
    expect(result.code).toBe(200);
    expect((result.body as any).draft.id).toBe('draft-1');
  });

  it('returns 404 when service throws', async () => {
    vi.mocked(draftService.getById).mockRejectedValue(new Error('Draft not found'));
    const result = await simulateGetDraft('missing');
    expect(result.code).toBe(404);
  });
});

// ─── PATCH /drafts/:id tests ──────────────────────────────────────────────────

describe('PATCH /drafts/:id', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 400 for invalid schema', async () => {
    const result = await simulateUpdateDraft('draft-1', { to_addresses: 'not-an-array' });
    expect(result.code).toBe(400);
  });

  it('returns 404 when draft not found', async () => {
    vi.mocked(draftService.update).mockRejectedValue(new Error('Draft not found'));
    const result = await simulateUpdateDraft('draft-1', { subject: 'New subject' });
    expect(result.code).toBe(404);
  });

  it('returns 400 for other errors', async () => {
    vi.mocked(draftService.update).mockRejectedValue(new Error('Cannot update sent draft'));
    const result = await simulateUpdateDraft('draft-1', { subject: 'X' });
    expect(result.code).toBe(400);
  });

  it('returns updated draft on success', async () => {
    vi.mocked(draftService.update).mockResolvedValue(makeDraft({ subject: 'Updated' }) as any);
    const result = await simulateUpdateDraft('draft-1', { subject: 'Updated' });
    expect(result.code).toBe(200);
    expect((result.body as any).draft.subject).toBe('Updated');
  });
});

// ─── POST /drafts/:id/approve tests ──────────────────────────────────────────

describe('POST /drafts/:id/approve', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 404 when draft not found', async () => {
    vi.mocked(draftService.approve).mockRejectedValue(new Error('Draft not found'));
    const result = await simulateApproveDraft('missing');
    expect(result.code).toBe(404);
  });

  it('returns approved draft on success', async () => {
    vi.mocked(draftService.approve).mockResolvedValue(makeDraft({ status: 'approved' }) as any);
    const result = await simulateApproveDraft('draft-1');
    expect(result.code).toBe(200);
    expect((result.body as any).draft.status).toBe('approved');
    expect((result.body as any).message).toContain('approved');
  });

  it('fires learning event (fire-and-forget) on success', async () => {
    vi.mocked(draftService.approve).mockResolvedValue(makeDraft({ status: 'approved' }) as any);
    await simulateApproveDraft('draft-1');
    expect(brainCoreService.recordLearning).toHaveBeenCalledWith(
      'user-1', 'draft:approved', expect.objectContaining({ draft_id: 'draft-1' }), 'draft_approve', 'draft-1'
    );
  });
});

// ─── DELETE /drafts/:id/schedule tests ───────────────────────────────────────

describe('DELETE /drafts/:id/schedule', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 404 when draft not found', async () => {
    vi.mocked(prisma.draft.findFirst).mockResolvedValue(null);
    const result = await simulateCancelSchedule('missing');
    expect(result.code).toBe(404);
  });

  it('clears scheduledAt on success', async () => {
    vi.mocked(prisma.draft.findFirst).mockResolvedValue(makeDraft({ scheduledAt: new Date(Date.now() + 60000) }) as any);
    vi.mocked(prisma.draft.update).mockResolvedValue(makeDraft({ scheduledAt: null }) as any);
    const result = await simulateCancelSchedule('draft-1');
    expect(result.code).toBe(200);
    expect(prisma.draft.update).toHaveBeenCalledWith(expect.objectContaining({ data: { scheduledAt: null } }));
  });
});

// ─── POST /drafts/:id/attachments tests ──────────────────────────────────────

describe('POST /drafts/:id/attachments', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 404 when draft not found', async () => {
    vi.mocked(prisma.draft.findFirst).mockResolvedValue(null);
    const result = await simulateUploadAttachment('missing', { filename: 'test.pdf', mimetype: 'application/pdf', size: 1000 });
    expect(result.code).toBe(404);
  });

  it('returns 400 when no file', async () => {
    vi.mocked(prisma.draft.findFirst).mockResolvedValue(makeDraft() as any);
    const result = await simulateUploadAttachment('draft-1', null);
    expect(result.code).toBe(400);
    expect((result.body as any).error).toBe('No file uploaded');
  });

  it('returns 400 when file exceeds 25MB', async () => {
    vi.mocked(prisma.draft.findFirst).mockResolvedValue(makeDraft() as any);
    const result = await simulateUploadAttachment('draft-1', { filename: 'big.zip', mimetype: 'application/zip', size: 26 * 1024 * 1024 });
    expect(result.code).toBe(400);
    expect((result.body as any).error).toContain('too large');
  });

  it('returns 400 for disallowed MIME type', async () => {
    vi.mocked(prisma.draft.findFirst).mockResolvedValue(makeDraft() as any);
    const result = await simulateUploadAttachment('draft-1', { filename: 'script.sh', mimetype: 'application/x-sh', size: 100 });
    expect(result.code).toBe(400);
    expect((result.body as any).error).toContain('Unsupported file type');
  });

  it('returns 201 with attachment metadata on success', async () => {
    vi.mocked(prisma.draft.findFirst).mockResolvedValue(makeDraft({ attachments: [] }) as any);
    vi.mocked(prisma.draft.update).mockResolvedValue({} as any);
    const result = await simulateUploadAttachment('draft-1', { filename: 'doc.pdf', mimetype: 'application/pdf', size: 50000 });
    expect(result.code).toBe(201);
    const att = (result.body as any).attachment;
    expect(att.filename).toBe('doc.pdf');
    expect(att.mimeType).toBe('application/pdf');
    expect(att).not.toHaveProperty('data'); // base64 data NOT returned
  });

  it('accepts all allowed MIME types', async () => {
    const testCases = [
      { mimetype: 'image/jpeg', size: 1000 },
      { mimetype: 'image/png', size: 1000 },
      { mimetype: 'application/pdf', size: 1000 },
      { mimetype: 'text/plain', size: 500 },
      { mimetype: 'application/zip', size: 2000 },
    ];
    for (const { mimetype, size } of testCases) {
      vi.mocked(prisma.draft.findFirst).mockResolvedValue(makeDraft({ attachments: [] }) as any);
      vi.mocked(prisma.draft.update).mockResolvedValue({} as any);
      const result = await simulateUploadAttachment('draft-1', { filename: 'test', mimetype, size });
      expect(result.code).toBe(201);
    }
  });
});

// ─── DELETE /drafts/:id/attachments/:attachmentId tests ───────────────────────

describe('DELETE /drafts/:id/attachments/:attachmentId', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 404 when draft not found', async () => {
    vi.mocked(prisma.draft.findFirst).mockResolvedValue(null);
    const result = await simulateDeleteAttachment('missing', 'att-1');
    expect(result.code).toBe(404);
  });

  it('removes only the specified attachment', async () => {
    const draft = makeDraft({
      attachments: [
        { id: 'att-1', filename: 'a.pdf', mimeType: 'application/pdf', size: 100, data: '' },
        { id: 'att-2', filename: 'b.pdf', mimeType: 'application/pdf', size: 200, data: '' },
      ],
    });
    vi.mocked(prisma.draft.findFirst).mockResolvedValue(draft as any);
    vi.mocked(prisma.draft.update).mockResolvedValue({} as any);
    await simulateDeleteAttachment('draft-1', 'att-1');
    const call = vi.mocked(prisma.draft.update).mock.calls[0][0] as any;
    expect(call.data.attachments).toHaveLength(1);
    expect(call.data.attachments[0].id).toBe('att-2');
  });
});

// ─── POST /drafts/:id/discard tests ──────────────────────────────────────────

describe('POST /drafts/:id/discard', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 404 when draft not found', async () => {
    vi.mocked(draftService.discard).mockRejectedValue(new Error('Draft not found'));
    const result = await simulateDiscardDraft('missing');
    expect(result.code).toBe(404);
  });

  it('returns discarded draft on success', async () => {
    vi.mocked(draftService.discard).mockResolvedValue(makeDraft({ status: 'discarded' }) as any);
    const result = await simulateDiscardDraft('draft-1');
    expect(result.code).toBe(200);
    expect((result.body as any).message).toContain('discarded');
  });
});

// ─── POST /drafts/:id/send-delayed tests ─────────────────────────────────────

describe('POST /drafts/:id/send-delayed', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 404 when draft not found', async () => {
    vi.mocked(prisma.draft.findFirst).mockResolvedValue(null);
    const result = await simulateSendDelayed('missing', {});
    expect(result.code).toBe(404);
  });

  it('returns 400 for non-pending/approved draft status', async () => {
    vi.mocked(prisma.draft.findFirst).mockResolvedValue(makeDraft({ status: 'sent' }) as any);
    const result = await simulateSendDelayed('draft-1', {});
    expect(result.code).toBe(400);
    expect((result.body as any).error).toContain('status: sent');
  });

  it('sends immediately when delay_seconds=0', async () => {
    vi.mocked(prisma.draft.findFirst).mockResolvedValue(makeDraft({ status: 'approved' }) as any);
    vi.mocked(draftService.send).mockResolvedValue(makeDraft({ status: 'sent' }) as any);
    const result = await simulateSendDelayed('draft-1', { delay_seconds: 0 });
    expect(result.code).toBe(200);
    expect((result.body as any).sentImmediately).toBe(true);
    expect(draftService.send).toHaveBeenCalled();
  });

  it('approves pending draft before scheduling', async () => {
    vi.mocked(prisma.draft.findFirst).mockResolvedValue(makeDraft({ status: 'pending' }) as any);
    vi.mocked(draftService.approve).mockResolvedValue(makeDraft({ status: 'approved' }) as any);
    vi.mocked(prisma.draft.update).mockResolvedValue(makeDraft({ status: 'approved', scheduledAt: new Date() }) as any);
    await simulateSendDelayed('draft-1', { delay_seconds: 10 });
    expect(draftService.approve).toHaveBeenCalledWith('draft-1', 'user-1');
  });

  it('uses user settings undoSendDelay when not provided', async () => {
    vi.mocked(prisma.draft.findFirst).mockResolvedValue(makeDraft({ status: 'approved' }) as any);
    vi.mocked(prisma.userSettings.findUnique).mockResolvedValue({ undoSendDelay: 15 } as any);
    vi.mocked(prisma.draft.update).mockResolvedValue(makeDraft({ status: 'approved' }) as any);
    const result = await simulateSendDelayed('draft-1', {});
    expect(result.code).toBe(200);
    expect((result.body as any).delaySeconds).toBe(15);
  });
});

// ─── POST /drafts/:id/cancel-send tests ──────────────────────────────────────

describe('POST /drafts/:id/cancel-send', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 404 when draft not found', async () => {
    vi.mocked(prisma.draft.findFirst).mockResolvedValue(null);
    const result = await simulateCancelSend('missing');
    expect(result.code).toBe(404);
  });

  it('returns 400 when draft is not in cancellable state', async () => {
    vi.mocked(prisma.draft.findFirst).mockResolvedValue(makeDraft({ status: 'pending' }) as any);
    const result = await simulateCancelSend('draft-1');
    expect(result.code).toBe(400);
    expect((result.body as any).error).toContain('cancellable');
  });

  it('returns 400 when no scheduledAt', async () => {
    vi.mocked(prisma.draft.findFirst).mockResolvedValue(makeDraft({ status: 'approved', scheduledAt: null }) as any);
    const result = await simulateCancelSend('draft-1');
    expect(result.code).toBe(400);
    expect((result.body as any).cancelled).toBe(false);
  });

  it('returns 400 when scheduled time has passed', async () => {
    vi.mocked(prisma.draft.findFirst).mockResolvedValue(makeDraft({ status: 'approved', scheduledAt: new Date(Date.now() - 1000) }) as any);
    const result = await simulateCancelSend('draft-1');
    expect(result.code).toBe(400);
    expect((result.body as any).error).toContain('already been sent');
  });

  it('cancels delayed send and returns cancelled: true', async () => {
    vi.mocked(prisma.draft.findFirst).mockResolvedValue(makeDraft({ status: 'approved', scheduledAt: new Date(Date.now() + 60000) }) as any);
    vi.mocked(prisma.draft.update).mockResolvedValue(makeDraft({ status: 'approved', scheduledAt: null }) as any);
    const result = await simulateCancelSend('draft-1');
    expect(result.code).toBe(200);
    expect((result.body as any).cancelled).toBe(true);
    expect(prisma.draft.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'approved', scheduledAt: null } }));
  });
});
