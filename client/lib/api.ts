/**
 * API client - Centralized HTTP client for backend communication.
 * All requests go through this module.
 */

const API_BASE = '/api/v1';

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
        console.log(`Backend wake attempt ${i + 1}/${maxAttempts}...`);
        // Wait a bit before retrying
        if (i < maxAttempts - 1) {
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    }
    return false;
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

    const response = await fetch(url.toString(), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (response.status === 401) {
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
    return this.request<{ user: any }>('GET', '/auth/me');
  }

  // Accounts
  async getAccounts() {
    return this.request<{ accounts: any[] }>('GET', '/accounts');
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
  }) {
    return this.request<{ account: any }>('PATCH', `/accounts/${id}`, data);
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
  async getThreads(params?: { account_id?: string; page?: number; limit?: number; search?: string }) {
    const query: Record<string, string> = {};
    if (params?.account_id) query.account_id = params.account_id;
    if (params?.page) query.page = String(params.page);
    if (params?.limit) query.limit = String(params.limit);
    if (params?.search) query.search = params.search;
    return this.request<{ threads: any[]; pagination: any }>('GET', '/threads', undefined, query);
  }

  async getThread(id: string) {
    return this.request<{ thread: any }>('GET', `/threads/${id}`);
  }

  async syncThreads(accountId: string, maxResults = 20) {
    return this.request('POST', '/threads/sync', { account_id: accountId, max_results: maxResults });
  }

  async syncMessages(threadId: string) {
    return this.request('POST', `/threads/${threadId}/sync-messages`);
  }

  // Drafts
  async getDrafts(params?: { status?: string; account_id?: string; page?: number }) {
    const query: Record<string, string> = {};
    if (params?.status) query.status = params.status;
    if (params?.account_id) query.account_id = params.account_id;
    if (params?.page) query.page = String(params.page);
    return this.request<{ drafts: any[]; pagination: any }>('GET', '/drafts', undefined, query);
  }

  async getDraft(id: string) {
    return this.request<{ draft: any }>('GET', `/drafts/${id}`);
  }

  async createDraft(data: {
    account_id: string;
    thread_id?: string;
    to_addresses: string[];
    cc_addresses?: string[];
    subject: string;
    body_text: string;
  }) {
    return this.request<{ draft: any }>('POST', '/drafts', data);
  }

  async updateDraft(id: string, data: {
    to_addresses?: string[];
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
    return this.request<any>('GET', '/command-center');
  }

  // Categories & Rules
  async getCategories() {
    return this.request<{ categories: any[] }>('GET', '/categories');
  }

  async createCategory(data: { name: string; color?: string; icon?: string; description?: string }) {
    return this.request<{ category: any }>('POST', '/categories', data);
  }

  async deleteCategory(id: string) {
    return this.request<{ message: string }>('DELETE', `/categories/${id}`);
  }

  async getRules() {
    return this.request<{ rules: any[] }>('GET', '/categories/rules');
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
    return this.request<{ provider: string; imap_host?: string; imap_port?: number; smtp_host?: string; smtp_port?: number; oauth_available?: boolean }>(
      'POST', '/auth/connect', body
    );
  }

  async getProviders() {
    return this.request<{ providers: any[] }>('GET', '/providers');
  }

  // Chat commands
  async chatCommand(command: string, params?: any) {
    return this.request<{ type: string; message: string; data?: any }>('POST', '/chat/command', { command, params });
  }

  async chatAsk(message: string) {
    return this.request<{ type: string; message: string; data?: any }>('POST', '/chat/ask', { message });
  }

  // Action Logs
  async getActionLogs(params?: { page?: number; limit?: number }) {
    const query: Record<string, string> = {};
    if (params?.page) query.page = String(params.page);
    if (params?.limit) query.limit = String(params.limit);
    return this.request<{ logs: any[]; pagination: any }>('GET', '/action-logs', undefined, query);
  }
}

export const api = new ApiClient();
