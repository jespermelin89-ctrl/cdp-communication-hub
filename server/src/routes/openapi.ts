/**
 * GET /api/v1/openapi.json
 *
 * Auto-generated OpenAPI 3.1 specification for the CDP Hub Agent API.
 * Designed for AI agent auto-discovery — an agent can fetch this once
 * and know every action, parameter, and response shape available.
 *
 * No authentication required.
 */

import { FastifyInstance } from 'fastify';

const AGENT_ACTIONS = {
  briefing: {
    summary: 'Inbox summary with classified threads',
    params: {},
    response: {
      unread_count: 'number',
      high_priority: 'array of { id, subject, participants, account, summary, classification, last_message_at }',
      medium_priority: 'array of { id, subject, participants, summary, last_message_at }',
      unanalyzed_count: 'number',
      pending_drafts: 'array of { id, subject, status, toAddresses, createdAt }',
      daily_summary: '{ date, needs_reply, good_to_know, ai_recommendation } | null',
      triage_today: '{ total_sorted, trashed, in_review, kept, auto_drafts_pending }',
    },
  },
  classify: {
    summary: 'Run AI analysis on a specific thread',
    params: { thread_id: { type: 'string', required: true } },
    response: { thread_id: 'string', subject: 'string', priority: 'string', classification: 'string', summary: 'string', suggested_action: 'string', confidence: 'number', analysis_id: 'string' },
  },
  draft: {
    summary: 'Generate an AI draft reply (status: pending — requires human approval)',
    params: {
      instruction: { type: 'string', required: true, description: 'What the draft should say' },
      thread_id: { type: 'string', required: false, description: 'Reply to this thread' },
      to_addresses: { type: 'string[]', required: false, description: 'Recipients (auto-detected if thread_id given)' },
      subject: { type: 'string', required: false },
      account_id: { type: 'string', required: false, description: 'Send from this account (defaults to primary)' },
    },
    response: { draft_id: 'string', subject: 'string', status: 'pending', to_addresses: 'string[]', review_url: 'string' },
  },
  search: {
    summary: 'Search cached threads by subject/snippet',
    params: { query: { type: 'string', required: true }, limit: { type: 'number', required: false, default: 10, max: 50 } },
    response: { query: 'string', count: 'number', threads: 'array of { id, subject, participants, account, snippet, is_read, last_message_at, priority, classification, summary }' },
  },
  send: {
    summary: 'Send an approved draft via Gmail',
    params: { draft_id: { type: 'string', required: true } },
    response: { draft_id: 'string', status: 'sent' },
    safety: 'REQUIRES status=approved. Agent cannot send pending drafts.',
  },
  schedule: {
    summary: 'Schedule an approved draft for later sending',
    params: { draft_id: { type: 'string', required: true }, send_at: { type: 'string (ISO 8601)', required: true } },
    response: { draft_id: 'string', scheduled_at: 'string' },
  },
  compose: {
    summary: 'Create a new draft (not a reply)',
    params: {
      to: { type: 'string | string[]', required: false },
      subject: { type: 'string', required: false },
      text: { type: 'string', required: false, description: 'Draft body' },
      account_id: { type: 'string', required: false },
    },
    response: { draft_id: 'string', status: 'pending' },
  },
  snooze: {
    summary: 'Snooze a thread until a specific time',
    params: { thread_id: { type: 'string', required: true }, until: { type: 'string (ISO 8601)', required: true } },
    response: { thread_id: 'string', snoozed_until: 'string' },
  },
  sync: {
    summary: 'Trigger Gmail sync for all active accounts',
    params: {},
    response: { message: 'string' },
  },
  stats: {
    summary: 'Quick inbox statistics snapshot',
    params: {},
    response: { unread: 'number', high_priority: 'number', snoozed: 'number', pending_drafts: 'number', accounts: 'array', generated_at: 'string' },
  },
  contacts: {
    summary: 'List known contacts from Brain Core',
    params: { limit: { type: 'number', required: false, default: 50 }, search: { type: 'string', required: false } },
    response: { count: 'number', contacts: 'array of { email, name, relationship, total_emails, last_contact }' },
  },
  export: {
    summary: 'Export thread list with classifications',
    params: { limit: { type: 'number', required: false, default: 100, max: 100 } },
    response: { count: 'number', exported_at: 'string', threads: 'array' },
  },
  'brain-status': {
    summary: 'Brain Core snapshot (writing profile, contacts, rules, daily summary)',
    params: {},
    response: { writing_modes: 'number', voice_attributes: 'number', contacts: 'number', classification_rules: 'number', seeded: 'boolean', daily_summary: 'object | null', top_contacts: 'array' },
  },
  learn: {
    summary: 'Record a learning event in Brain Core',
    params: { event_type: { type: 'string', required: true }, data: { type: 'object', required: false }, source_type: { type: 'string', required: false, default: 'amanda_agent' } },
    response: { event_id: 'string', event_type: 'string' },
  },
  'bulk-classify': {
    summary: 'Classify unanalyzed threads in batch (max 20)',
    params: { limit: { type: 'number', required: false, default: 10, max: 20 } },
    response: { analyzed: 'number', total_unanalyzed: 'number', results: 'array' },
  },
  'bulk-triage': {
    summary: 'Classify + execute triage actions on untriaged threads',
    params: { limit: { type: 'number', required: false, default: 30, max: 50 }, dry_run: { type: 'boolean', required: false } },
    response: { processed: 'number', rule_matched: 'number', ai_classified: 'number', actions: 'object', errors: 'number', remaining: 'number', details: 'array' },
    safety: 'AI budget: max 15 AI calls per invocation. Rule engine matches are free.',
  },
  'batch-cleanup': {
    summary: 'Trash or archive all threads matching a classification',
    params: { classification: { type: 'string', required: true }, action: { type: '"trash" | "archive"', required: false, default: 'trash' }, limit: { type: 'number', required: false, max: 500 }, dry_run: { type: 'boolean', required: false } },
    response: { classification: 'string', matched: 'number', processed: 'number', errors: 'number' },
  },
  'gmail-trash': {
    summary: 'Trash Gmail threads directly by Gmail thread IDs',
    params: { gmail_thread_ids: { type: 'string[]', required: true }, account_email: { type: 'string', required: false, default: 'jesper.melin89@gmail.com' } },
    response: { trashed: 'number', errors: 'number', total: 'number' },
  },
  'gmail-label': {
    summary: 'Create, apply, or remove Gmail labels',
    params: { operation: { type: '"create" | "apply" | "remove" | "list"', required: true }, label_name: { type: 'string', required: false }, label_id: { type: 'string', required: false }, gmail_thread_ids: { type: 'string[]', required: false } },
    response: 'varies by operation',
  },
  'gmail-archive': {
    summary: 'Archive Gmail threads (remove from INBOX)',
    params: { gmail_thread_ids: { type: 'string[]', required: true }, account_email: { type: 'string', required: false } },
    response: { archived: 'number', errors: 'number', total: 'number' },
  },
  'gmail-mark-read': {
    summary: 'Mark Gmail threads as read',
    params: { gmail_thread_ids: { type: 'string[]', required: true }, account_email: { type: 'string', required: false } },
    response: { marked_read: 'number', errors: 'number', total: 'number' },
  },
  'triage-status': {
    summary: 'Triage activity summary for a time period',
    params: { days: { type: 'number', required: false, default: 1, max: 30 } },
    response: { period: 'string', total_sorted: 'number', trashed: 'number', in_review: 'number', kept: 'number', auto_drafts_created: 'number', top_senders: 'string[]', by_action: 'object' },
  },
  'triage-report': {
    summary: 'Voice-friendly triage report with natural language summary',
    params: { period: { type: '"today" | "week" | "month"', required: false, default: 'today' } },
    response: { period: 'string', total_sorted: 'number', trashed: 'number', in_review: 'number', kept: 'number', voice_summary: 'string' },
  },
  'triage-override': {
    summary: 'Undo a triage action — restore thread from TRASH to INBOX',
    params: { thread_id: { type: 'string', required: true } },
    response: { thread_id: 'string', subject: 'string' },
  },
  'review-queue': {
    summary: 'List threads in the review/Granskning queue',
    params: {},
    response: { count: 'number', threads: 'array' },
  },
  'rule-suggest': {
    summary: 'List pending auto-learning rule suggestions',
    params: {},
    response: { count: 'number', suggestions: 'array' },
  },
  'approve-rule': {
    summary: 'Approve a rule suggestion → creates active ClassificationRule',
    params: { suggestionId: { type: 'string', required: true } },
    response: { message: 'string' },
  },
  'dismiss-rule': {
    summary: 'Dismiss a rule suggestion',
    params: { suggestionId: { type: 'string', required: true } },
    response: { message: 'string' },
  },
  'review-keep': {
    summary: 'Move a Granskning thread back to INBOX',
    params: { threadId: { type: 'string', required: true } },
    response: { message: 'string' },
  },
  'review-trash': {
    summary: 'Trash a Granskning thread',
    params: { threadId: { type: 'string', required: true } },
    response: { message: 'string' },
  },
  'inbox-status': {
    summary: 'Full inbox status snapshot',
    params: {},
    response: { unread: 'number', pending_review: 'number', pending_drafts: 'number', rule_count: 'number', triage_stats_24h: 'object', by_classification: 'object' },
  },
  'classified-summary': {
    summary: 'Classified inbox data for Brain Core dashboard',
    params: { period: { type: '"today" | "week"', required: false, default: 'today' } },
    response: { total_unread: 'number', spam_archived: 'number', need_attention: 'array', urgent: 'array' },
  },
  'seed-brain-core': {
    summary: 'Seed Brain Core with initial writing profiles and contacts',
    params: {},
    response: { seeded: 'object' },
  },
  cleanup: {
    summary: 'Remove test/debug learning events and prune old data',
    params: { event_type_prefix: { type: 'string', required: false, default: 'test:' } },
    response: { deleted_test_events: 'number', pruned_old_events: 'number' },
  },
  chat: {
    summary: 'Natural language query to Amanda AI assistant',
    params: { message: { type: 'string', required: true } },
    response: { reply: 'string' },
  },
};

export async function openApiRoutes(fastify: FastifyInstance) {
  fastify.get('/openapi.json', async (_request, _reply) => {
    const actionPaths: Record<string, any> = {};

    for (const [action, spec] of Object.entries(AGENT_ACTIONS)) {
      const paramProperties: Record<string, any> = {};
      const required: string[] = [];

      if (spec.params && typeof spec.params === 'object') {
        for (const [pName, pSpec] of Object.entries(spec.params)) {
          if (typeof pSpec === 'object' && pSpec !== null) {
            const p = pSpec as Record<string, any>;
            paramProperties[pName] = {
              type: p.type?.includes('[]') ? 'array' : p.type?.includes('number') ? 'number' : p.type?.includes('boolean') ? 'boolean' : 'string',
              description: p.description ?? undefined,
              ...(p.default !== undefined ? { default: p.default } : {}),
              ...(p.max !== undefined ? { maximum: p.max } : {}),
            };
            if (p.required) required.push(pName);
          }
        }
      }

      actionPaths[`/agent/execute#${action}`] = {
        post: {
          operationId: `agent_${action.replace(/-/g, '_')}`,
          summary: spec.summary,
          ...((spec as any).safety ? { 'x-safety': (spec as any).safety } : {}),
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['action', ...(required.length > 0 ? ['params'] : [])],
                  properties: {
                    action: { type: 'string', const: action },
                    params: Object.keys(paramProperties).length > 0
                      ? { type: 'object', properties: paramProperties, required }
                      : { type: 'object' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Success',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', const: true },
                      action: { type: 'string' },
                      data: { type: 'object', description: JSON.stringify(spec.response) },
                    },
                  },
                },
              },
            },
            '400': { description: 'Invalid parameters', content: { 'application/json': { schema: { '$ref': '#/components/schemas/AgentError' } } } },
            '401': { description: 'Invalid API key', content: { 'application/json': { schema: { '$ref': '#/components/schemas/AgentError' } } } },
            '404': { description: 'Resource not found', content: { 'application/json': { schema: { '$ref': '#/components/schemas/AgentError' } } } },
          },
        },
      };
    }

    return {
      openapi: '3.1.0',
      info: {
        title: 'CDP Communication Hub — Agent API',
        version: '2.0.0',
        description: 'AI agent API for CDP Hub email management. Single endpoint pattern: POST /agent/execute with { action, params }. Auth: X-API-Key header.',
        contact: { name: 'CDP', email: 'jesper.melin89@gmail.com' },
      },
      servers: [
        { url: '/api/v1', description: 'Relative to deployment root' },
      ],
      security: [{ apiKey: [] }],
      paths: {
        '/agent/execute': {
          post: {
            operationId: 'agent_execute',
            summary: 'Execute any agent action',
            description: `Unified agent endpoint. Send { action: "<name>", params: {...} }. Available actions: ${Object.keys(AGENT_ACTIONS).join(', ')}`,
            security: [{ apiKey: [] }],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['action'],
                    properties: {
                      action: { type: 'string', enum: Object.keys(AGENT_ACTIONS) },
                      params: { type: 'object', description: 'Action-specific parameters' },
                    },
                  },
                },
              },
            },
            responses: {
              '200': { description: 'Action executed successfully' },
              '202': { description: 'Accepted — async callback will be POSTed when done (only when callback_url is provided)' },
              '400': { description: 'Invalid action or missing params' },
              '401': { description: 'Invalid or missing X-API-Key' },
            },
          },
        },
        '/agent/batch': {
          post: {
            operationId: 'agent_batch',
            summary: 'Execute up to 10 actions in sequence',
            security: [{ apiKey: [] }],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['actions'],
                    properties: {
                      actions: {
                        type: 'array',
                        maxItems: 10,
                        items: {
                          type: 'object',
                          required: ['action'],
                          properties: {
                            action: { type: 'string', enum: Object.keys(AGENT_ACTIONS) },
                            params: { type: 'object' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            responses: {
              '200': {
                description: 'Batch results',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        results: { type: 'array', items: { type: 'object' } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        '/agent/notifications': {
          get: {
            operationId: 'agent_notifications',
            summary: 'Poll for recent notifications (new emails, pending drafts, high-priority)',
            security: [{ apiKey: [] }],
            responses: {
              '200': {
                description: 'Notification data',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: {
                          type: 'object',
                          properties: {
                            new_emails_30min: { type: 'number' },
                            pending_drafts: { type: 'number' },
                            high_priority_unread: { type: 'array' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        '/agent/webhooks': {
          post: {
            operationId: 'agent_webhook_register',
            summary: 'Register a webhook URL to receive real-time events',
            security: [{ apiKey: [] }],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['url', 'events'],
                    properties: {
                      url: { type: 'string', format: 'uri', description: 'HTTPS URL to POST events to' },
                      events: {
                        type: 'array',
                        items: { type: 'string', enum: ['mail.received', 'mail.classified', 'draft.created', 'draft.approved', 'draft.sent', 'triage.completed', 'sync.completed'] },
                        description: 'Events to subscribe to',
                      },
                      secret: { type: 'string', description: 'Optional shared secret for HMAC-SHA256 signature verification' },
                    },
                  },
                },
              },
            },
            responses: {
              '201': { description: 'Webhook registered' },
            },
          },
          get: {
            operationId: 'agent_webhook_list',
            summary: 'List registered webhooks',
            security: [{ apiKey: [] }],
            responses: { '200': { description: 'List of webhooks' } },
          },
          delete: {
            operationId: 'agent_webhook_delete',
            summary: 'Delete a webhook by ID',
            security: [{ apiKey: [] }],
            responses: { '200': { description: 'Webhook deleted' } },
          },
        },
        '/agent/jobs/{jobId}': {
          get: {
            operationId: 'agent_job_status',
            summary: 'Check status of an async job',
            security: [{ apiKey: [] }],
            parameters: [{ name: 'jobId', in: 'path', required: true, schema: { type: 'string' } }],
            responses: {
              '200': {
                description: 'Job status',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        job_id: { type: 'string' },
                        status: { type: 'string', enum: ['pending', 'running', 'completed', 'failed'] },
                        action: { type: 'string' },
                        result: { type: 'object' },
                        created_at: { type: 'string' },
                        completed_at: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        // Action-specific docs
        ...actionPaths,
      },
      components: {
        securitySchemes: {
          apiKey: {
            type: 'apiKey',
            in: 'header',
            name: 'X-API-Key',
            description: 'Agent API key (COMMAND_API_KEY env var)',
          },
        },
        schemas: {
          AgentError: {
            type: 'object',
            required: ['success', 'error_code', 'error'],
            properties: {
              success: { type: 'boolean', const: false },
              error_code: { type: 'string', description: 'Machine-readable error code (e.g. AUTH_INVALID_API_KEY, DRAFT_NOT_APPROVED)' },
              error: { type: 'string', description: 'Human-readable error message' },
              details: { type: 'object', description: 'Additional error context' },
            },
          },
          AgentSuccess: {
            type: 'object',
            required: ['success', 'action', 'data'],
            properties: {
              success: { type: 'boolean', const: true },
              action: { type: 'string' },
              data: { type: 'object' },
              provider_used: { type: 'string', description: 'AI provider used (if applicable)' },
            },
          },
        },
      },
    };
  });
}
