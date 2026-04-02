import { z } from 'zod';

// ============================================================
// AI Analysis Output Schema
// ============================================================
export const AIAnalysisSchema = z.object({
  summary: z.string().min(10).max(500),
  classification: z.enum([
    'lead',
    'partner',
    'personal',
    'spam',
    'operational',
    'founder',
    'outreach',
  ]),
  priority: z.enum(['high', 'medium', 'low']),
  suggested_action: z.enum(['reply', 'ignore', 'review_later', 'archive_suggestion']),
  draft_text: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  model_used: z.string(),
});

export type AIAnalysisOutput = z.infer<typeof AIAnalysisSchema>;

// ============================================================
// Draft Schemas
// ============================================================
export const CreateDraftSchema = z.object({
  account_id: z.string().uuid(),
  thread_id: z.string().uuid().optional(),
  to_addresses: z.array(z.string().email()).min(1),
  cc_addresses: z.array(z.string().email()).optional().default([]),
  bcc_addresses: z.array(z.string().email()).optional().default([]),
  subject: z.string().min(1).max(500),
  body_text: z.string().min(1),
  body_html: z.string().optional(),
});

export type CreateDraftInput = z.infer<typeof CreateDraftSchema>;

export const UpdateDraftSchema = z.object({
  to_addresses: z.array(z.string().email()).optional(),
  cc_addresses: z.array(z.string().email()).optional(),
  bcc_addresses: z.array(z.string().email()).optional(),
  subject: z.string().min(1).max(500).optional(),
  body_text: z.string().min(1).optional(),
  body_html: z.string().optional(),
});

export type UpdateDraftInput = z.infer<typeof UpdateDraftSchema>;

// ============================================================
// Thread Query Schema
// ============================================================
export const ThreadQuerySchema = z.object({
  account_id: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(25),
  cursor: z.string().optional(),
  search: z.string().optional(),
  label: z.string().optional(),
  mailbox: z.enum(['inbox', 'sent', 'trash', 'archive', 'snoozed', 'all']).optional(),
});

export type ThreadQueryInput = z.infer<typeof ThreadQuerySchema>;

// ============================================================
// Draft Query Schema
// ============================================================
export const DraftQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'sent', 'failed', 'discarded']).optional(),
  account_id: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type DraftQueryInput = z.infer<typeof DraftQuerySchema>;

// ============================================================
// AI Request Schemas
// ============================================================
export const AnalyzeThreadRequestSchema = z.object({
  thread_id: z.string().uuid(),
});

export const GenerateDraftRequestSchema = z.object({
  account_id: z.string().uuid(),
  thread_id: z.string().uuid().optional(),
  instruction: z.string().min(1).max(2000),
  to_addresses: z.array(z.string().email()).optional(),
  subject: z.string().optional(),
});

export const SummarizeInboxRequestSchema = z.object({
  account_id: z.string().uuid(),
});

// ============================================================
// Brain Core Schemas
// ============================================================
export const UpdateWritingModeSchema = z.object({
  tone: z.string().optional(),
  formality: z.string().optional(),
  enabled: z.boolean().optional(),
  description: z.string().optional(),
  signOff: z.string().optional(),
});

export type UpdateWritingModeInput = z.infer<typeof UpdateWritingModeSchema>;

export const UpdateContactSchema = z.object({
  displayName: z.string().optional(),
  relationship: z.string().optional(),
  preferredMode: z.string().optional(),
  language: z.string().optional(),
  notes: z.string().optional(),
});

export type UpdateContactInput = z.infer<typeof UpdateContactSchema>;

export const LearnEventSchema = z.object({
  event_type: z.string().min(1),
  data: z.record(z.unknown()).optional().default({}),
  source_type: z.string().optional(),
  source_id: z.string().optional(),
});

export type LearnEventInput = z.infer<typeof LearnEventSchema>;

export const VoiceTestSchema = z.object({
  mode_key: z.string().min(1),
  instruction: z.string().min(1).max(2000),
});

export type VoiceTestInput = z.infer<typeof VoiceTestSchema>;
