/**
 * GET /api/v1/docs
 * Machine-readable API surface listing all stable endpoints.
 * Used by BRAIN-OS and external integrations to discover capabilities.
 * No authentication required (list is not sensitive).
 */

import { FastifyInstance } from 'fastify';

const ENDPOINTS = [
  // ── Auth ──────────────────────────────────────────────────────────────────
  { method: 'GET',    path: '/auth/me',                     auth: true,  stable: true,  description: 'Get current authenticated user' },
  { method: 'GET',    path: '/auth/google',                 auth: false, stable: true,  description: 'Initiate Google OAuth flow' },
  { method: 'GET',    path: '/auth/google/callback',        auth: false, stable: true,  description: 'Google OAuth callback' },
  { method: 'POST',   path: '/auth/logout',                 auth: true,  stable: true,  description: 'Revoke OAuth tokens and clear session' },

  // ── Accounts ──────────────────────────────────────────────────────────────
  { method: 'GET',    path: '/accounts',                    auth: true,  stable: true,  description: 'List connected email accounts' },
  { method: 'POST',   path: '/accounts',                    auth: true,  stable: true,  description: 'Connect a new email account (IMAP)' },
  { method: 'PATCH',  path: '/accounts/:id',                auth: true,  stable: true,  description: 'Update account settings (signature, display name, etc.)' },
  { method: 'DELETE', path: '/accounts/:id',                auth: true,  stable: true,  description: 'Disconnect an account' },

  // ── Threads ───────────────────────────────────────────────────────────────
  { method: 'GET',    path: '/threads',                     auth: true,  stable: true,  description: 'List threads with optional filters (account_id, label, search, page, limit)' },
  { method: 'POST',   path: '/threads/sync',                auth: true,  stable: true,  description: 'Sync new threads from Gmail/IMAP' },
  { method: 'POST',   path: '/threads/batch',               auth: true,  stable: true,  description: 'Batch action on threads (archive|trash|read|unread|star|unstar)' },
  { method: 'POST',   path: '/threads/:id/sync-messages',   auth: true,  stable: true,  description: 'Fetch and cache all messages for a thread' },
  { method: 'POST',   path: '/threads/:id/read',            auth: true,  stable: true,  description: 'Mark thread as read' },
  { method: 'POST',   path: '/threads/:id/unread',          auth: true,  stable: true,  description: 'Mark thread as unread' },
  { method: 'POST',   path: '/threads/:id/star',            auth: true,  stable: true,  description: 'Star thread' },
  { method: 'POST',   path: '/threads/:id/unstar',          auth: true,  stable: true,  description: 'Unstar thread' },
  { method: 'POST',   path: '/threads/:id/archive',         auth: true,  stable: true,  description: 'Archive thread (non-destructive — removes INBOX label)' },
  { method: 'POST',   path: '/threads/:id/trash',           auth: true,  stable: true,  description: 'Move thread to trash (reversible within 30 days)' },
  { method: 'POST',   path: '/threads/:id/restore',         auth: true,  stable: true,  description: 'Restore trashed thread to inbox' },
  { method: 'POST',   path: '/threads/:id/snooze',          auth: true,  stable: true,  description: 'Snooze thread until a given datetime. Body: { until: ISO8601 }' },
  { method: 'DELETE', path: '/threads/:id/snooze',          auth: true,  stable: true,  description: 'Unsnooze thread immediately' },
  { method: 'PATCH',  path: '/threads/:id',                 auth: true,  stable: true,  description: 'Update thread metadata (e.g. custom labels)' },
  { method: 'GET',    path: '/threads/:threadId/messages/:messageId/attachments/:attachmentId', auth: true, stable: true, description: 'Download attachment binary' },
  { method: 'GET',    path: '/threads/:threadId/messages/:messageId/inline/:cid', auth: true, stable: true, description: 'Proxy inline (CID) image from email HTML' },

  // ── Drafts ────────────────────────────────────────────────────────────────
  { method: 'GET',    path: '/drafts',                      auth: true,  stable: true,  description: 'List drafts (status filter supported)' },
  { method: 'POST',   path: '/drafts',                      auth: true,  stable: true,  description: 'Create a new draft' },
  { method: 'GET',    path: '/drafts/:id',                  auth: true,  stable: true,  description: 'Get draft by ID' },
  { method: 'PATCH',  path: '/drafts/:id',                  auth: true,  stable: true,  description: 'Update draft content' },
  { method: 'POST',   path: '/drafts/:id/approve',          auth: true,  stable: true,  description: 'Approve draft for sending (pending→approved)' },
  { method: 'POST',   path: '/drafts/:id/send',             auth: true,  stable: true,  description: 'Send approved draft via Gmail. REQUIRES status=approved.' },
  { method: 'POST',   path: '/drafts/:id/discard',          auth: true,  stable: true,  description: 'Discard a draft' },

  // ── AI ────────────────────────────────────────────────────────────────────
  { method: 'POST',   path: '/ai/analyze/:threadId',        auth: true,  stable: true,  description: 'Run AI analysis on a thread' },
  { method: 'POST',   path: '/ai/generate-draft',           auth: true,  stable: true,  description: 'Generate a draft reply using AI' },
  { method: 'POST',   path: '/ai/generate-draft/:threadId', auth: true,  stable: true,  description: 'Generate a draft reply for a specific thread' },

  // ── Chat / Amanda ─────────────────────────────────────────────────────────
  { method: 'POST',   path: '/chat/command',                auth: true,  stable: true,  description: 'Execute structured chat command' },
  { method: 'POST',   path: '/chat/ask',                    auth: true,  stable: true,  description: 'Natural language query to Amanda AI assistant' },

  // ── Command Center ────────────────────────────────────────────────────────
  { method: 'GET',    path: '/command-center',              auth: true,  stable: true,  description: 'Dashboard overview — pending drafts, priority counts, recent activity' },

  // ── Brain Core ────────────────────────────────────────────────────────────
  { method: 'GET',    path: '/brain-core/writing-profile',  auth: true,  stable: true,  description: 'Get writing profile (modes, voice attributes)' },
  { method: 'POST',   path: '/brain-core/writing-profile',  auth: true,  stable: true,  description: 'Update writing profile' },
  { method: 'GET',    path: '/brain-core/contacts',         auth: true,  stable: true,  description: 'List contact profiles' },
  { method: 'GET',    path: '/brain-core/classification-rules', auth: true, stable: true, description: 'List AI classification rules' },
  { method: 'GET',    path: '/brain-core/daily-summary',    auth: true,  stable: true,  description: 'Get today\'s AI daily summary' },
  { method: 'POST',   path: '/brain-core/daily-summary/generate', auth: true, stable: true, description: 'Generate a new AI daily summary' },
  { method: 'POST',   path: '/brain-core/learn',            auth: true,  stable: true,  description: 'Record a learning event' },

  // ── Brain Summary (BRAIN-OS integration) ─────────────────────────────────
  { method: 'GET',    path: '/brain-summary',               auth: true,  stable: true,  description: 'Aggregated read-only summary for BRAIN-OS. NOTE: draft body_text is never included.' },

  // ── Brain Core Connector (stable adapter surface) ────────────────────────
  { method: 'GET',    path: '/connectors/brain-core/health',             auth: true,  stable: true,  description: 'Health and contract metadata for the Brain Core connector surface' },
  { method: 'GET',    path: '/connectors/brain-core/inbox-summary',       auth: true,  stable: true,  description: 'Dedicated inbox summary contract for Brain Core' },
  { method: 'GET',    path: '/connectors/brain-core/threads',             auth: true,  stable: true,  description: 'List threads in Brain Core connector format. Returns data=array, pagination in meta.' },
  { method: 'GET',    path: '/connectors/brain-core/threads/:id',         auth: true,  stable: true,  description: 'Get thread detail in Brain Core connector format' },
  { method: 'POST',   path: '/connectors/brain-core/threads/:id/read',    auth: true,  stable: true,  description: 'Mark thread as read using Brain Core connector contract' },
  { method: 'POST',   path: '/connectors/brain-core/threads/:id/archive', auth: true,  stable: true,  description: 'Archive thread using Brain Core connector contract' },
  { method: 'GET',    path: '/connectors/brain-core/triage-status',       auth: true,  stable: true,  description: 'Fetch triage status summary in Brain Core connector format' },
  { method: 'GET',    path: '/connectors/brain-core/classified-summary',  auth: true,  stable: true,  description: 'Fetch classified inbox summary in Brain Core connector format' },
  { method: 'POST',   path: '/connectors/brain-core/drafts',              auth: true,  stable: true,  description: 'Create a draft using Brain Core-friendly input aliases (to/body/threadId)' },
  { method: 'GET',    path: '/connectors/brain-core/drafts/:id',          auth: true,  stable: true,  description: 'Get a draft in Brain Core connector format' },
  { method: 'POST',   path: '/connectors/brain-core/drafts/:id/approve',  auth: true,  stable: true,  description: 'Approve a draft using Brain Core connector contract' },
  { method: 'POST',   path: '/connectors/brain-core/drafts/:id/send',     auth: true,  stable: true,  description: 'Send an approved draft using Brain Core connector contract' },

  // ── Push Notifications ────────────────────────────────────────────────────
  { method: 'POST',   path: '/push/subscribe',              auth: true,  stable: true,  description: 'Subscribe device to Web Push notifications' },
  { method: 'DELETE', path: '/push/subscribe',              auth: true,  stable: true,  description: 'Unsubscribe device from Web Push notifications' },

  // ── Action Logs ───────────────────────────────────────────────────────────
  { method: 'GET',    path: '/action-logs',                 auth: true,  stable: true,  description: 'List recent action logs' },

  // ── Categories & Rules ───────────────────────────────────────────────────
  { method: 'GET',    path: '/categories',                  auth: true,  stable: true,  description: 'List email categories' },
  { method: 'POST',   path: '/categories',                  auth: true,  stable: true,  description: 'Create email category' },
  { method: 'GET',    path: '/rules',                       auth: true,  stable: true,  description: 'List sender rules' },
  { method: 'POST',   path: '/rules',                       auth: true,  stable: true,  description: 'Create sender rule' },
  { method: 'DELETE', path: '/rules/:id',                   auth: true,  stable: true,  description: 'Delete sender rule' },

  // ── Docs ──────────────────────────────────────────────────────────────────
  { method: 'GET',    path: '/docs',                        auth: false, stable: true,  description: 'This endpoint — machine-readable API surface' },
];

export async function docsRoutes(fastify: FastifyInstance) {
  fastify.get('/docs', async (_request, _reply) => {
    return {
      version: '1.0',
      base: '/api/v1',
      note: 'All paths are relative to base. BRAIN-OS must use /api/v1/ prefix.',
      safety: {
        never_auto_send: true,
        never_auto_delete: true,
        draft_gate: 'POST /drafts/:id/send requires status=approved',
        connector_contract: 'Brain Core connector endpoints return { success, contract_version, data, meta? }',
      },
      endpoints: ENDPOINTS,
      total: ENDPOINTS.length,
    };
  });
}
