/**
 * CDP Hub Agent SDK
 *
 * Lightweight TypeScript client for AI agents to interact with CDP Hub.
 * Single-file, zero dependencies beyond fetch (built-in in Node 18+).
 *
 * Usage:
 *   import { CDPAgent } from './cdp-agent-sdk';
 *   const agent = new CDPAgent({ baseUrl: 'https://your-hub.vercel.app', apiKey: 'your-key' });
 *   const briefing = await agent.briefing();
 *   const draft = await agent.draft({ instruction: 'Svara artigt', thread_id: '...' });
 *   await agent.batch([
 *     { action: 'gmail-mark-read', params: { gmail_thread_ids: ['...'] } },
 *     { action: 'gmail-archive', params: { gmail_thread_ids: ['...'] } },
 *   ]);
 */

export interface CDPAgentConfig {
  /** Base URL of the CDP Hub API (e.g., https://cdp-communication-hub.vercel.app) */
  baseUrl: string;
  /** API key (COMMAND_API_KEY) */
  apiKey: string;
  /** Max retries on 5xx errors (default: 2) */
  maxRetries?: number;
  /** Timeout per request in ms (default: 30000) */
  timeout?: number;
}

export interface AgentResponse<T = Record<string, unknown>> {
  success: boolean;
  action?: string;
  data?: T;
  error?: string;
  error_code?: string;
  provider_used?: string;
}

export interface BatchItem {
  action: string;
  params?: Record<string, unknown>;
}

export class CDPAgent {
  private baseUrl: string;
  private apiKey: string;
  private maxRetries: number;
  private timeout: number;

  constructor(config: CDPAgentConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.maxRetries = config.maxRetries ?? 2;
    this.timeout = config.timeout ?? 30000;
  }

  // ── Core transport ──────────────────────────────────────────────────────

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    retries = 0
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(`${this.baseUrl}/api/v1${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const json = await res.json() as T;

      // Retry on 5xx
      if (res.status >= 500 && retries < this.maxRetries) {
        await new Promise((r) => setTimeout(r, 1000 * (retries + 1)));
        return this.request<T>(method, path, body, retries + 1);
      }

      return json;
    } finally {
      clearTimeout(timer);
    }
  }

  // ── Agent execute ───────────────────────────────────────────────────────

  async execute<T = Record<string, unknown>>(
    action: string,
    params?: Record<string, unknown>
  ): Promise<AgentResponse<T>> {
    return this.request<AgentResponse<T>>('POST', '/agent/execute', { action, params });
  }

  // ── Batch ───────────────────────────────────────────────────────────────

  async batch(actions: BatchItem[]): Promise<{
    success: boolean;
    results: AgentResponse[];
  }> {
    return this.request('POST', '/agent/batch', { actions });
  }

  // ── Async execute (returns job_id for polling) ──────────────────────────

  async executeAsync<T = Record<string, unknown>>(
    action: string,
    params?: Record<string, unknown>
  ): Promise<AgentResponse<T & { job_id?: string }>> {
    return this.request('POST', '/agent/execute', {
      action,
      params: { ...params, async: true },
    });
  }

  // ── Job status ──────────────────────────────────────────────────────────

  async jobStatus(jobId: string) {
    return this.request<{
      job_id: string;
      status: 'pending' | 'running' | 'completed' | 'failed';
      action: string;
      result?: Record<string, unknown>;
      error?: string;
    }>('GET', `/agent/jobs/${jobId}`);
  }

  // ── Webhook management ──────────────────────────────────────────────────

  async registerWebhook(url: string, events: string[], secret?: string) {
    return this.request<AgentResponse>('POST', '/agent/webhooks', { url, events, secret });
  }

  async listWebhooks() {
    return this.request<{ success: boolean; webhooks: unknown[] }>('GET', '/agent/webhooks');
  }

  async deleteWebhook(id: string) {
    return this.request<AgentResponse>('DELETE', `/agent/webhooks/${id}`);
  }

  // ── Notifications (polling) ─────────────────────────────────────────────

  async notifications() {
    return this.request<AgentResponse<{
      new_emails_30min: number;
      pending_drafts: number;
      high_priority_unread: unknown[];
    }>>('GET', '/agent/notifications');
  }

  // ── OpenAPI spec ────────────────────────────────────────────────────────

  async discover() {
    return this.request<Record<string, unknown>>('GET', '/openapi.json');
  }

  // ── Convenience methods ─────────────────────────────────────────────────

  /** Get inbox briefing with classified threads */
  async briefing() {
    return this.execute('briefing');
  }

  /** Quick inbox statistics */
  async stats() {
    return this.execute('stats');
  }

  /** Search threads */
  async search(query: string, limit?: number) {
    return this.execute('search', { query, limit });
  }

  /** Classify a specific thread */
  async classify(threadId: string) {
    return this.execute('classify', { thread_id: threadId });
  }

  /** Generate an AI draft */
  async draft(params: {
    instruction: string;
    thread_id?: string;
    to_addresses?: string[];
    subject?: string;
    account_id?: string;
  }) {
    return this.execute('draft', params);
  }

  /** Compose a new email draft */
  async compose(params: { to?: string | string[]; subject?: string; text?: string; account_id?: string }) {
    return this.execute('compose', params);
  }

  /** Send an approved draft */
  async send(draftId: string) {
    return this.execute('send', { draft_id: draftId });
  }

  /** Snooze a thread */
  async snooze(threadId: string, until: string | Date) {
    return this.execute('snooze', {
      thread_id: threadId,
      until: until instanceof Date ? until.toISOString() : until,
    });
  }

  /** Trigger email sync */
  async sync() {
    return this.execute('sync');
  }

  /** Bulk triage unclassified threads */
  async bulkTriage(limit?: number, dryRun?: boolean) {
    return this.execute('bulk-triage', { limit, dry_run: dryRun });
  }

  /** Batch cleanup threads by classification */
  async batchCleanup(classification: string, action: 'trash' | 'archive' = 'trash', limit?: number, dryRun?: boolean) {
    return this.execute('batch-cleanup', { classification, action, limit, dry_run: dryRun });
  }

  /** Trash Gmail threads */
  async gmailTrash(gmailThreadIds: string[], accountEmail?: string) {
    return this.execute('gmail-trash', { gmail_thread_ids: gmailThreadIds, account_email: accountEmail });
  }

  /** Archive Gmail threads */
  async gmailArchive(gmailThreadIds: string[], accountEmail?: string) {
    return this.execute('gmail-archive', { gmail_thread_ids: gmailThreadIds, account_email: accountEmail });
  }

  /** Mark Gmail threads as read */
  async gmailMarkRead(gmailThreadIds: string[], accountEmail?: string) {
    return this.execute('gmail-mark-read', { gmail_thread_ids: gmailThreadIds, account_email: accountEmail });
  }

  /** Get triage report */
  async triageReport(period: 'today' | 'week' | 'month' = 'today') {
    return this.execute('triage-report', { period });
  }

  /** Get Brain Core status */
  async brainStatus() {
    return this.execute('brain-status');
  }

  /** Get contacts */
  async contacts(limit?: number, search?: string) {
    return this.execute('contacts', { limit, search });
  }

  /** Chat with Amanda AI */
  async chat(message: string) {
    return this.execute('chat', { message });
  }
}

// Default export for ESM
export default CDPAgent;
