/**
 * MCP Streamable HTTP Endpoint
 *
 * Exposes the CDP Hub agent API as a remote MCP server.
 * Cowork / Claude Code connects to this via URL instead of spawning a local process.
 *
 * Protocol: MCP JSON-RPC 2.0 over HTTP POST
 * Auth: X-API-Key header (same as agent API)
 * Endpoint: POST /mcp
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { validateAgentKey } from '../services/agent-auth.service';

// ── Tool definitions (same 18 tools as the local MCP plugin) ─────────────────

const TOOLS = [
  {
    name: 'cdp_briefing',
    description: 'Get inbox briefing — unread count, high/medium priority threads, pending drafts, triage summary. Use this first to understand inbox state.',
    inputSchema: { type: 'object' as const, properties: {}, additionalProperties: false },
    action: 'briefing',
  },
  {
    name: 'cdp_stats',
    description: 'Quick inbox statistics — unread, high priority, snoozed, pending drafts, account sync status.',
    inputSchema: { type: 'object' as const, properties: {}, additionalProperties: false },
    action: 'stats',
  },
  {
    name: 'cdp_search',
    description: 'Search email threads across all 3 accounts by subject, snippet, or participant.',
    inputSchema: {
      type: 'object' as const,
      required: ['query'],
      properties: {
        query: { type: 'string', description: 'Search query (matches subject and snippet)' },
        limit: { type: 'number', description: 'Max results (default 10, max 50)' },
      },
      additionalProperties: false,
    },
    action: 'search',
  },
  {
    name: 'cdp_classify',
    description: 'Run AI classification on a specific thread — returns priority, category, summary, suggested action.',
    inputSchema: {
      type: 'object' as const,
      required: ['thread_id'],
      properties: {
        thread_id: { type: 'string', description: 'Thread ID to classify' },
      },
      additionalProperties: false,
    },
    action: 'classify',
  },
  {
    name: 'cdp_draft',
    description: 'Generate an AI draft reply. Created with status "pending" — requires human approval before sending.',
    inputSchema: {
      type: 'object' as const,
      required: ['instruction'],
      properties: {
        instruction: { type: 'string', description: 'What the draft should say (e.g. "Tacka och bekräfta mötet")' },
        thread_id: { type: 'string', description: 'Reply to this thread (auto-detects recipient)' },
        to_addresses: { type: 'array', items: { type: 'string' }, description: 'Recipients (required if no thread_id)' },
        subject: { type: 'string', description: 'Subject line (auto-generated if replying to thread)' },
        account_id: { type: 'string', description: 'Send from this account (defaults to primary)' },
      },
      additionalProperties: false,
    },
    action: 'draft',
  },
  {
    name: 'cdp_compose',
    description: 'Create a new draft email (not a reply). Status: pending — needs approval.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        to: { type: 'string', description: 'Recipient email' },
        subject: { type: 'string', description: 'Subject line' },
        text: { type: 'string', description: 'Email body text' },
        account_id: { type: 'string', description: 'Send from this account' },
      },
      additionalProperties: false,
    },
    action: 'compose',
  },
  {
    name: 'cdp_send',
    description: 'Send an approved draft. SAFETY: Only works on drafts with status "approved" — cannot send pending drafts.',
    inputSchema: {
      type: 'object' as const,
      required: ['draft_id'],
      properties: {
        draft_id: { type: 'string', description: 'Draft ID to send' },
      },
      additionalProperties: false,
    },
    action: 'send',
  },
  {
    name: 'cdp_sync',
    description: 'Trigger Gmail sync for all 3 connected accounts. Fetches new threads.',
    inputSchema: { type: 'object' as const, properties: {}, additionalProperties: false },
    action: 'sync',
  },
  {
    name: 'cdp_bulk_triage',
    description: 'Classify and execute triage actions on untriaged threads. Uses rule engine (free) + AI (budgeted). Returns what was trashed, kept, and how many remain.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: 'Threads to process (default 30, max 50)' },
        dry_run: { type: 'boolean', description: 'Preview actions without executing' },
      },
      additionalProperties: false,
    },
    action: 'bulk-triage',
  },
  {
    name: 'cdp_triage_report',
    description: 'Triage summary with natural language voice_summary — what was sorted, trashed, kept.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        period: { type: 'string', enum: ['today', 'week', 'month'], description: 'Time period (default: today)' },
      },
      additionalProperties: false,
    },
    action: 'triage-report',
  },
  {
    name: 'cdp_contacts',
    description: 'List known contacts from Brain Core with relationship info and email frequency.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: 'Max contacts (default 50)' },
        search: { type: 'string', description: 'Filter by name or email' },
      },
      additionalProperties: false,
    },
    action: 'contacts',
  },
  {
    name: 'cdp_brain_status',
    description: 'Brain Core snapshot — writing profile, voice attributes, contacts, classification rules, daily summary.',
    inputSchema: { type: 'object' as const, properties: {}, additionalProperties: false },
    action: 'brain-status',
  },
  {
    name: 'cdp_gmail_trash',
    description: 'Move Gmail threads to trash by Gmail thread IDs.',
    inputSchema: {
      type: 'object' as const,
      required: ['gmail_thread_ids'],
      properties: {
        gmail_thread_ids: { type: 'array', items: { type: 'string' }, description: 'Gmail thread IDs to trash' },
        account_email: { type: 'string', description: 'Account email (default: jesper.melin89@gmail.com)' },
      },
      additionalProperties: false,
    },
    action: 'gmail-trash',
  },
  {
    name: 'cdp_gmail_archive',
    description: 'Archive Gmail threads (remove from inbox without deleting).',
    inputSchema: {
      type: 'object' as const,
      required: ['gmail_thread_ids'],
      properties: {
        gmail_thread_ids: { type: 'array', items: { type: 'string' }, description: 'Gmail thread IDs to archive' },
        account_email: { type: 'string', description: 'Account email' },
      },
      additionalProperties: false,
    },
    action: 'gmail-archive',
  },
  {
    name: 'cdp_gmail_mark_read',
    description: 'Mark Gmail threads as read.',
    inputSchema: {
      type: 'object' as const,
      required: ['gmail_thread_ids'],
      properties: {
        gmail_thread_ids: { type: 'array', items: { type: 'string' }, description: 'Gmail thread IDs' },
        account_email: { type: 'string', description: 'Account email' },
      },
      additionalProperties: false,
    },
    action: 'gmail-mark-read',
  },
  {
    name: 'cdp_review_queue',
    description: 'List threads waiting in the Granskning review queue.',
    inputSchema: { type: 'object' as const, properties: {}, additionalProperties: false },
    action: 'review-queue',
  },
  {
    name: 'cdp_snooze',
    description: 'Snooze a thread until a specific time.',
    inputSchema: {
      type: 'object' as const,
      required: ['thread_id', 'until'],
      properties: {
        thread_id: { type: 'string', description: 'Thread ID to snooze' },
        until: { type: 'string', description: 'ISO 8601 datetime (e.g. 2026-04-24T09:00:00Z)' },
      },
      additionalProperties: false,
    },
    action: 'snooze',
  },
  {
    name: 'cdp_inbox_status',
    description: 'Full inbox status — unread, pending review, pending drafts, rules, triage stats, classifications breakdown.',
    inputSchema: { type: 'object' as const, properties: {}, additionalProperties: false },
    action: 'inbox-status',
  },
];

// ── Internal agent execute — call the same logic as POST /api/v1/agent/execute
// We import the route handler indirectly by making an internal HTTP-like call
// through Fastify's inject mechanism.

async function executeAction(
  fastify: FastifyInstance,
  apiKey: string,
  action: string,
  params: Record<string, unknown>,
): Promise<{ success: boolean; data?: unknown; error?: string; error_code?: string }> {
  // Use Fastify's built-in inject to call the agent execute endpoint internally.
  // This reuses ALL existing logic: auth, rate limiting, audit logging, etc.
  const response = await fastify.inject({
    method: 'POST',
    url: '/api/v1/agent/execute',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
    },
    payload: { action, params },
  });

  try {
    return JSON.parse(response.body);
  } catch {
    return { success: false, error: `Internal error: ${response.statusCode}` };
  }
}

// ── JSON-RPC helpers ─────────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id?: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

function rpcResult(id: string | number | undefined, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id: id ?? null, result };
}

function rpcError(id: string | number | undefined, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

// ── Route registration ───────────────────────────────────────────────────────

export async function mcpRoutes(fastify: FastifyInstance) {
  // MCP Streamable HTTP endpoint
  // Handles: initialize, tools/list, tools/call, notifications/*
  fastify.post('/mcp', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as JsonRpcRequest | JsonRpcRequest[];

    // Support batch requests (array of JSON-RPC messages)
    if (Array.isArray(body)) {
      const responses: JsonRpcResponse[] = [];
      for (const msg of body) {
        const resp = await handleMessage(fastify, request, msg);
        if (resp) responses.push(resp);
      }
      return reply.type('application/json').send(responses);
    }

    // Single message
    const resp = await handleMessage(fastify, request, body);
    if (!resp) {
      // Notification — no response needed
      return reply.code(204).send();
    }
    return reply.type('application/json').send(resp);
  });

  // GET /mcp — SSE endpoint for server-initiated messages (not used, but spec says
  // to return 405 if not implemented)
  fastify.get('/mcp', async (_request, reply) => {
    return reply.code(405).send({ error: 'SSE not supported — use POST' });
  });

  // OPTIONS /mcp — CORS preflight
  // (handled by @fastify/cors plugin globally, but explicit for clarity)
}

async function handleMessage(
  fastify: FastifyInstance,
  request: FastifyRequest,
  msg: JsonRpcRequest,
): Promise<JsonRpcResponse | null> {
  const { id, method, params } = msg;

  switch (method) {
    case 'initialize':
      return rpcResult(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: {
          name: 'cdp-hub',
          version: '1.2.0',
          description: 'CDP Communication Hub — multi-account mail management',
        },
      });

    case 'notifications/initialized':
      // Notification — no response
      return null;

    case 'tools/list':
      return rpcResult(id, {
        tools: TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      });

    case 'tools/call': {
      const toolName = (params as Record<string, unknown>)?.name as string;
      const toolArgs = ((params as Record<string, unknown>)?.arguments || {}) as Record<string, unknown>;
      const toolDef = TOOLS.find((t) => t.name === toolName);

      if (!toolDef) {
        return rpcResult(id, {
          content: [{ type: 'text', text: `Unknown tool: ${toolName}` }],
          isError: true,
        });
      }

      // Auth — require X-API-Key header
      const apiKey = request.headers['x-api-key'] as string;
      if (!apiKey) {
        return rpcResult(id, {
          content: [{ type: 'text', text: 'Authentication required: X-API-Key header missing' }],
          isError: true,
        });
      }

      try {
        const result = await executeAction(fastify, apiKey, toolDef.action, toolArgs);
        return rpcResult(id, {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          isError: !result.success,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return rpcResult(id, {
          content: [{ type: 'text', text: `CDP Hub error: ${message}` }],
          isError: true,
        });
      }
    }

    default:
      // Unknown method
      if (id !== undefined) {
        return rpcError(id, -32601, `Method not found: ${method}`);
      }
      return null; // Notification for unknown method — ignore
  }
}
