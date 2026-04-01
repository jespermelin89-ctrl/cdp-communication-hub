/**
 * API client - Centralized HTTP client for backend communication.
 * All requests go through this module.
 */

const API_BASE = '/api/v1';

// Circuit breaker — opens after 3 consecutive network failures, self-heals after 30s
let consecutiveFailures = 0;
let circuitOpenUntil = 0;

class ApiClient {
  private token: string | null = null;
  private isRedirecting = false;

  setToken(token: string) {
    this.token = token;
    if (typeof window !== 'undefined') {
      localStorage.setItem('cdp_token', token);
    }
  }

  getToken(): string | null {
    // Always sync with localStorage to avoid stale in-memory values
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('cdp_token');
      this.token = stored;
    }
    return this.token;
  }

  clearToken() {
    this.token = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('cdp_token');
    }
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  // Wake up the backend from Render free tier sleep
  async wakeBackend(): Promise<boolean> {
    const maxAttempts = 3;
    const timeout = 15000; // 15s per attempt

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        // Hit the health endpoint directly on the backend (not through Vercel proxy which adds latency)
        const resp = await fetch('/api/v1/health', {
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (resp.ok) return true;
      } catch (e) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`Backend wake attempt ${i + 1}/${maxAttempts}...`);
        }
        // Wait a bit before retrying
        if (i < maxAttempts - 1) {
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    }
    return false;
  }

  private async requestWithRetry<T>(
    method: string,
    path: string,
    body?: any,
    query?: Record<string, string>,
    retries = 2
  ): Promise<T> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await this.request<T>(method, path, body, query);
      } catch (err: any) {
        // Never retry auth errors — redirect is already in flight
        if (err.message === 'Session expired') throw err;
        // Never retry client errors (4xx) — retrying won't help
        if (err.message?.startsWith('Request failed') && attempt === 0) throw err;
        // Last attempt — propagate
        if (attempt === retries) throw err;
        // Exponential backoff: 2s, 4s
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
      }
    }
    throw new Error('Max retries nåddes — försök igen');
  }

  private async request<T>(
    method: string,
    path: string,
    body?: any,
    query?: Record<string, string>
  ): Promise<T> {
    if (typeof window === 'undefined') {
      throw new Error('API client can only be used in browser context');
    }

    // Circuit breaker: fail fast while open
    if (circuitOpenUntil > Date.now()) {
      throw new Error('Tjänsten är tillfälligt otillgänglig — försök igen om en stund');
    }

    const url = new URL(`${API_BASE}${path}`, window.location.origin);
    if (query) {
      Object.entries(query).forEach(([k, v]) => {
        if (v !== undefined && v !== null) url.searchParams.set(k, v);
      });
    }

    const headers: Record<string, string> = {};

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // CSRF double-submit: attach cookie value as header on mutations
    const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
    if (!safeMethods.includes(method.toUpperCase())) {
      const csrfToken = document.cookie
        .split('; ')
        .find((c) => c.startsWith('csrf_token='))
        ?.split('=')[1];
      if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken;
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      if (fetchErr?.name === 'AbortError') {
        consecutiveFailures++;
        if (consecutiveFailures >= 3) {
          circuitOpenUntil = Date.now() + 30000;
        }
        throw new Error('Förfrågan tog för lång tid — försök igen');
      }
      // Network error (offline, DNS, etc.)
      consecutiveFailures++;
      if (consecutiveFailures >= 3) {
        circuitOpenUntil = Date.now() + 30000;
      }
      throw fetchErr;
    }
    clearTimeout(timeoutId);
    // Successful fetch — reset circuit breaker
    consecutiveFailures = 0;

    // JWT auto-renew: backend piggybacks a fresh token when the current one is near expiry
    const refreshedToken = response.headers.get('X-Refreshed-Token');
    if (refreshedToken) {
      this.setToken(refreshedToken);
    }

    if (response.status === 401) {
      let body: any = {};
      try { body = await response.json(); } catch { /* ignore parse error */ }

      // REAUTH: OAuth token revoked for a Gmail account — do NOT log out the session
      if (body.reauth) {
        throw new Error(`REAUTH_REQUIRED:${body.email || ''}`);
      }

      this.clearToken();
      // Guard against multiple simultaneous 401s triggering redirect race
      if (!this.isRedirecting) {
        this.isRedirecting = true;
        window.location.href = '/';
      }
      throw new Error('Session expired');
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Request failed');
    }

    return data as T;
  }

  // Auth
  async getAuthUrl(): Promise<{ url: string }> {
    return this.request('POST', '/auth/google');
  }

  async getProfile() {
    return this.requestWithRetry<{ user: any }>('GET', '/auth/me');
  }

  // Accounts
  async getAccounts() {
    return this.requestWithRetry<{ accounts: any[] }>('GET', '/accounts');
  }

  async setDefaultAccount(accountId: string) {
    return this.request('POST', '/accounts/set-default', { account_id: accountId });
  }

  async addImapAccount(data: {
    email_address: string;
    display_name?: string;
    label?: string;
    color?: string;
    imap_host: string;
    imap_port?: number;
    imap_use_ssl?: boolean;
    smtp_host: string;
    smtp_port?: number;
    smtp_use_ssl?: boolean;
    password: string;
  }) {
    return this.request<{ account: any; message: string; mailboxes?: string[] }>(
      'POST', '/accounts/imap', data
    );
  }

  async testImapConnection(data: {
    email_address: string;
    imap_host: string;
    imap_port?: number;
    imap_use_ssl?: boolean;
    smtp_host: string;
    smtp_port?: number;
    smtp_use_ssl?: boolean;
    password: string;
  }) {
    return this.request<{ success: boolean; error?: string; details?: any }>(
      'POST', '/accounts/test-imap', data
    );
  }

  async updateAccount(id: string, data: {
    display_name?: string;
    label?: string;
    color?: string;
    is_active?: boolean;
    signature?: string | null;
    account_type?: 'personal' | 'team' | 'shared';
    ai_handling?: 'normal' | 'separate' | 'notify_only';
    team_members?: string[];
  }) {
    return this.request<{ account: any }>('PATCH', `/accounts/${id}`, data);
  }

  async syncAccount(id: string) {
    return this.request<{ message: string }>('POST', `/accounts/${id}/sync`);
  }

  async deleteAccount(id: string) {
    return this.request<{ message: string }>('DELETE', `/accounts/${id}`);
  }

  // Badges
  async addBadge(accountId: string, badge: string) {
    return this.request<any>('POST', `/accounts/${accountId}/badges`, { badge });
  }

  async removeBadge(accountId: string, badge: string) {
    return this.request<any>('DELETE', `/accounts/${accountId}/badges/${badge}`);
  }

  // Threads
  async getThreads(params?: { account_id?: string; page?: number; limit?: number; search?: string; mailbox?: string }) {
    const query: Record<string, string> = {};
    if (params?.account_id) query.account_id = params.account_id;
    if (params?.page) query.page = String(params.page);
    if (params?.limit) query.limit = String(params.limit);
    if (params?.search) query.search = params.search;
    if (params?.mailbox) query.mailbox = params.mailbox;
    return this.requestWithRetry<{ threads: any[]; pagination: any; total?: number; page?: number; pageSize?: number; hasMore?: boolean; mailbox?: string }>('GET', '/threads', undefined, query);
  }

  async getThread(id: string) {
    return this.requestWithRetry<{ thread: any }>('GET', `/threads/${id}`);
  }

  async syncThreads(accountId: string, maxResults = 20) {
    return this.request('POST', '/threads/sync', { account_id: accountId, max_results: maxResults });
  }

  async syncMessages(threadId: string) {
    return this.request('POST', `/threads/${threadId}/sync-messages`);
  }

  async archiveThread(threadId: string) {
    return this.request('POST', `/threads/${threadId}/archive`);
  }

  async trashThread(threadId: string) {
    return this.request('POST', `/threads/${threadId}/trash`);
  }

  async markThreadAsRead(threadId: string) {
    return this.request('POST', `/threads/${threadId}/read`);
  }

  async markThreadAsUnread(threadId: string) {
    return this.request('POST', `/threads/${threadId}/unread`);
  }

  async starThread(threadId: string) {
    return this.request('POST', `/threads/${threadId}/star`);
  }

  async unstarThread(threadId: string) {
    return this.request('POST', `/threads/${threadId}/unstar`);
  }

  async batchThreadAction(threadIds: string[], action: 'archive' | 'trash' | 'read' | 'unread' | 'star' | 'unstar') {
    return this.request('POST', '/threads/batch', { threadIds, action });
  }

  async restoreThread(id: string) {
    return this.request<{ message: string }>('POST', `/threads/${id}/restore`);
  }

  async updateThread(id: string, data: { labels?: string[] }) {
    return this.request<{ thread: any }>('PATCH', `/threads/${id}`, data);
  }

  async downloadAttachment(threadId: string, messageId: string, attachmentId: string): Promise<Blob> {
    if (typeof window === 'undefined') throw new Error('Browser only');
    const url = new URL(`${API_BASE}/threads/${threadId}/messages/${messageId}/attachments/${attachmentId}`, window.location.origin);
    const token = this.getToken();
    const resp = await fetch(url.toString(), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!resp.ok) throw new Error('Download failed');
    return resp.blob();
  }

  // Drafts
  async getDrafts(params?: { status?: string; account_id?: string; page?: number }) {
    const query: Record<string, string> = {};
    if (params?.status) query.status = params.status;
    if (params?.account_id) query.account_id = params.account_id;
    if (params?.page) query.page = String(params.page);
    return this.requestWithRetry<{ drafts: any[]; pagination: any }>('GET', '/drafts', undefined, query);
  }

  async getDraft(id: string) {
    return this.requestWithRetry<{ draft: any }>('GET', `/drafts/${id}`);
  }

  async createDraft(data: {
    account_id: string;
    thread_id?: string;
    to_addresses: string[];
    cc_addresses?: string[];
    bcc_addresses?: string[];
    subject: string;
    body_text: string;
  }) {
    return this.request<{ draft: any }>('POST', '/drafts', data);
  }

  async updateDraft(id: string, data: {
    to_addresses?: string[];
    cc_addresses?: string[];
    bcc_addresses?: string[];
    subject?: string;
    body_text?: string;
  }) {
    return this.request<{ draft: any }>('PATCH', `/drafts/${id}`, data);
  }

  async approveDraft(id: string) {
    return this.request<{ draft: any; message: string }>('POST', `/drafts/${id}/approve`);
  }

  async sendDraft(id: string) {
    return this.request<{ draft: any; message: string }>('POST', `/drafts/${id}/send`);
  }

  async discardDraft(id: string) {
    return this.request<{ draft: any }>('POST', `/drafts/${id}/discard`);
  }

  async scheduleDraft(id: string, sendAt: string) {
    return this.request<{ draft: any; message: string }>('POST', `/drafts/${id}/schedule`, { send_at: sendAt });
  }

  async cancelSchedule(id: string) {
    return this.request<{ draft: any; message: string }>('DELETE', `/drafts/${id}/schedule`);
  }

  // AI
  async analyzeThread(threadId: string) {
    return this.request<{ analysis: any; draft: any; message: string }>('POST', '/ai/analyze-thread', {
      thread_id: threadId,
    });
  }

  async generateDraft(data: {
    account_id: string;
    thread_id?: string;
    instruction: string;
    to_addresses?: string[];
    subject?: string;
  }) {
    return this.request<{ draft: any; message: string }>('POST', '/ai/generate-draft', data);
  }

  async summarizeInbox(accountId: string) {
    return this.request<{ summary: string }>('POST', '/ai/summarize-inbox', {
      account_id: accountId,
    });
  }

  // Command Center
  async getCommandCenter() {
    return this.requestWithRetry<any>('GET', '/command-center');
  }

  // Categories & Rules
  async getCategories() {
    return this.requestWithRetry<{ categories: any[] }>('GET', '/categories');
  }

  async createCategory(data: { name: string; color?: string; icon?: string; description?: string }) {
    return this.request<{ category: any }>('POST', '/categories', data);
  }

  async deleteCategory(id: string) {
    return this.request<{ message: string }>('DELETE', `/categories/${id}`);
  }

  async getRules() {
    return this.requestWithRetry<{ rules: any[] }>('GET', '/categories/rules');
  }

  async createRule(data: {
    sender_pattern: string;
    subject_pattern?: string;
    action: string;
    category_slug?: string;
    priority?: string;
  }) {
    return this.request<{ rule: any; message: string }>('POST', '/categories/rules', data);
  }

  async deleteRule(id: string) {
    return this.request<{ message: string }>('DELETE', `/categories/rules/${id}`);
  }

  async classifyThreads() {
    return this.request<{ classified: number; total: number; results: any }>('POST', '/categories/classify');
  }

  // Provider detection — passes current token for add-account OAuth state
  async detectProvider(email: string) {
    const currentToken = this.getToken();
    const body: any = { email };
    if (currentToken) {
      body.token = currentToken; // Embed in OAuth state for add-account flow
    }
    return this.request<{
      provider: {
        id: string;
        name: string;
        type: string;
        icon: string;
        authMethod: 'oauth' | 'imap';
        imapDefaults?: { host: string; port: number; secure: boolean };
        smtpDefaults?: { host: string; port: number; secure: boolean };
      };
      authUrl?: string;
      requiresImap?: boolean;
      message?: string;
    }>(
      'POST', '/auth/connect', body
    );
  }

  async getProviders() {
    return this.requestWithRetry<{ providers: any[] }>('GET', '/providers');
  }

  // Chat commands
  async chatCommand(command: string, params?: any) {
    return this.request<{ type: string; message: string; data?: any }>('POST', '/chat/command', { command, params });
  }

  async chatAsk(message: string, threadIds?: string[]) {
    return this.request<{ type: string; message: string; data?: any }>('POST', '/chat/ask', {
      message,
      ...(threadIds && threadIds.length > 0 ? { thread_ids: threadIds } : {}),
    });
  }

  // Brain Summary (BRAIN-OS / external consumer endpoint)
  async getBrainSummary() {
    return this.requestWithRetry<any>('GET', '/brain-summary');
  }

  // Brain Core
  async getDailySummary() {
    return this.requestWithRetry<{ summary: any }>('GET', '/brain-core/daily-summary');
  }

  async regenerateDailySummary() {
    return this.request<{ summary: any }>('POST', '/brain-core/daily-summary');
  }

  async getWritingProfile() {
    return this.requestWithRetry<{ profile: { modes: any[]; attributes: any[] } }>('GET', '/brain-core/writing-profile');
  }

  async getContacts(search?: string) {
    const url = search ? `/brain-core/contacts?search=${encodeURIComponent(search)}` : '/brain-core/contacts';
    return this.requestWithRetry<{ contacts: any[] }>('GET', url);
  }

  async updateContact(id: string, data: { displayName?: string; relationship?: string; preferredMode?: string; language?: string; notes?: string }) {
    return this.request<{ contact: any }>('PATCH', `/brain-core/contacts/${id}`, data);
  }

  async getContactThreads(id: string) {
    return this.request<{ threads: any[] }>('GET', `/brain-core/contacts/${id}/threads`);
  }

  async getClassificationRules() {
    return this.requestWithRetry<{ rules: any[] }>('GET', '/brain-core/classification');
  }

  async recordLearning(eventType: string, data?: object, sourceType?: string, sourceId?: string) {
    return this.request<{ event: any }>('POST', '/brain-core/learn', {
      event_type: eventType,
      data,
      source_type: sourceType,
      source_id: sourceId,
    });
  }

  async bulkClassify(limit = 10) {
    return this.request<{
      analyzed: number;
      total_unanalyzed: number;
      ai_calls: number;
      results: Array<{ thread_id: string; subject: string | null; priority: string; classification: string; source: 'rule' | 'ai' }>;
    }>('POST', '/ai/bulk-classify', { limit });
  }

  // Action Logs
  async getActionLogs(params?: { page?: number; limit?: number }) {
    const query: Record<string, string> = {};
    if (params?.page) query.page = String(params.page);
    if (params?.limit) query.limit = String(params.limit);
    return this.requestWithRetry<{ logs: any[]; pagination: any }>('GET', '/action-logs', undefined, query);
  }

  async subscribePush(data: { endpoint: string; keys: { p256dh: string; auth: string } }) {
    return this.request<{ ok: boolean }>('POST', '/push/subscribe', data);
  }

  async unsubscribePush(endpoint: string) {
    return this.request<{ ok: boolean }>('DELETE', '/push/subscribe', { endpoint });
  }

  async snoozeThread(id: string, until: string) {
    return this.request<{ message: string }>('POST', `/threads/${id}/snooze`, { until });
  }

  async unsnoozeThread(id: string) {
    return this.request<{ message: string }>('DELETE', `/threads/${id}/snooze`);
  }

  async getUserSettings() {
    return this.request<{ settings: any }>('GET', '/user/settings');
  }

  async updateUserSettings(data: {
    quietHoursStart?: number;
    quietHoursEnd?: number;
    digestEnabled?: boolean;
    digestTime?: number;
    uiTheme?: string;
  }) {
    return this.request<{ settings: any }>('PATCH', '/user/settings', data);
  }

  async reportSpam(threadId: string) {
    return this.request<{ message: string }>('POST', `/threads/${threadId}/spam`);
  }

  async blockSender(senderPattern: string) {
    return this.request<{ rule: any }>('POST', '/brain-core/sender-rules', {
      senderPattern,
      action: 'spam',
    });
  }

  // Follow-up reminders
  async getFollowUps() {
    return this.requestWithRetry<{ reminders: any[] }>('GET', '/follow-ups');
  }

  async createFollowUp(threadId: string, remindAt: string, note?: string) {
    return this.request<{ reminder: any }>('POST', `/threads/${threadId}/follow-up`, {
      remind_at: remindAt,
      note,
    });
  }

  async completeFollowUp(id: string) {
    return this.request<{ reminder: any }>('PATCH', `/follow-ups/${id}/complete`, {});
  }

  async deleteFollowUp(id: string) {
    return this.request<{ ok: boolean }>('DELETE', `/follow-ups/${id}`);
  }

  // Email templates
  async getTemplates() {
    return this.requestWithRetry<{ templates: any[] }>('GET', '/templates');
  }

  async createTemplate(data: {
    name: string;
    subject?: string;
    body_text?: string;
    body_html?: string;
    category?: string;
  }) {
    return this.request<{ template: any }>('POST', '/templates', data);
  }

  async updateTemplate(id: string, data: {
    name?: string;
    subject?: string;
    body_text?: string;
    body_html?: string;
    category?: string;
  }) {
    return this.request<{ template: any }>('PATCH', `/templates/${id}`, data);
  }

  async deleteTemplate(id: string) {
    return this.request<{ ok: boolean }>('DELETE', `/templates/${id}`);
  }

  async useTemplate(id: string) {
    return this.request<{ template: any }>('POST', `/templates/${id}/use`, {});
  }

  async generateTemplate(instructions: string, name?: string, category?: string) {
    return this.request<{ template: any }>('POST', '/templates/generate', {
      instructions,
      name,
      category,
    });
  }

  // Analytics
  async getAnalytics(days = 30) {
    return this.requestWithRetry<any>('GET', '/analytics/overview', undefined, { days: String(days) });
  }

  // Saved views
  async getSavedViews() {
    return this.requestWithRetry<{ views: any[] }>('GET', '/views');
  }

  async createSavedView(data: { name: string; icon?: string; filters: Record<string, any>; sort_key?: string }) {
    return this.request<{ view: any }>('POST', '/views', data);
  }

  async updateSavedView(id: string, data: { name?: string; icon?: string; filters?: Record<string, any>; sort_key?: string }) {
    return this.request<{ view: any }>('PATCH', `/views/${id}`, data);
  }

  async deleteSavedView(id: string) {
    return this.request<{ ok: boolean }>('DELETE', `/views/${id}`);
  }

  async reorderViews(ids: string[]) {
    return this.request<{ views: any[] }>('PATCH', '/views/reorder', { ids });
  }

  // Brain Core insights
  async getLearningInsights() {
    return this.requestWithRetry<any>('GET', '/brain-core/learning-insights');
  }

  async testVoiceMode(modeKey: string, instruction: string) {
    return this.request<{ preview: string; mode: string }>('POST', '/brain-core/voice-test', {
      mode_key: modeKey,
      instruction,
    });
  }
}

export const api = new ApiClient();
