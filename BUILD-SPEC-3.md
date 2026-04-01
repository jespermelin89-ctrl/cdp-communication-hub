# CDP Communication Hub — Build Specification 3: V1.0 Launch

> 136 commits, ~29.4k LOC, 16 sidor, 30 komponenter, 15 routes, 14 services, 29 tester.
> Noll TypeScript-errors. Alla core + advanced features implementerade.
> Denna spec tar oss till v1.0 LAUNCH — redo att installera och använda dagligen.

---

## PRINCIPER

- `npx tsc --noEmit` i client OCH server innan varje commit — NOLL errors
- Push till main efter varje commit
- ALLA UI-texter SVENSKA med i18n-nycklar (sv, en, es, ru)
- Lucide-ikoner
- Tailwind + `dark:` på ALLT
- ALDRIG auto-send email, ALDRIG auto-delete
- Inga nakna `console.*` i client prod-kod
- Om Prisma-schema ändras: `npx prisma db push`
- Varje sprint = 1 commit

---

## SPRINT 1: ATTACHMENT UPLOAD I COMPOSE

### Problem
Compose kan skicka mail men inte bifoga filer. Ingen upload endpoint finns.

### 1A. Backend — multipart upload

Installera:
```bash
cd server && npm install @fastify/multipart
```

Registrera i `server/src/index.ts`:
```typescript
await fastify.register(import('@fastify/multipart'), {
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB — Gmail max
    files: 10,
  },
});
```

### 1B. Upload endpoint

I `server/src/routes/drafts.ts`:

```typescript
// POST /drafts/:id/attachments — Upload file attachment to a draft
fastify.post('/drafts/:id/attachments', async (request, reply) => {
  const { id } = request.params as any;

  const draft = await prisma.draft.findFirst({
    where: { id, account: { userId: request.userId } },
  });
  if (!draft) return reply.code(404).send({ error: 'Draft not found' });

  const file = await request.file();
  if (!file) return reply.code(400).send({ error: 'No file uploaded' });

  const buffer = await file.toBuffer();
  const base64 = buffer.toString('base64');

  // Store attachment metadata + data in draft's attachments JSON array
  const existing = (draft.attachments as any[]) || [];
  existing.push({
    id: crypto.randomUUID(),
    filename: file.filename,
    mimeType: file.mimetype,
    size: buffer.length,
    data: base64, // Base64 encoded — sent with Gmail API
  });

  await prisma.draft.update({
    where: { id },
    data: { attachments: existing },
  });

  return {
    attachment: {
      id: existing[existing.length - 1].id,
      filename: file.filename,
      size: buffer.length,
      mimeType: file.mimetype,
    },
  };
});

// DELETE /drafts/:id/attachments/:attachmentId — Remove attachment
fastify.delete('/drafts/:id/attachments/:attachmentId', async (request, reply) => {
  const { id, attachmentId } = request.params as any;

  const draft = await prisma.draft.findFirst({
    where: { id, account: { userId: request.userId } },
  });
  if (!draft) return reply.code(404).send({ error: 'Draft not found' });

  const existing = (draft.attachments as any[]) || [];
  const filtered = existing.filter((a: any) => a.id !== attachmentId);

  await prisma.draft.update({
    where: { id },
    data: { attachments: filtered },
  });

  return { message: 'Attachment removed' };
});
```

### 1C. Prisma schema — attachments på Draft

Lägg till om det inte redan finns:
```prisma
attachments Json? @default("[]")
```

### 1D. Gmail send med attachments

I `server/src/services/gmail.service.ts`, uppdatera `sendEmail` så att den inkluderar bilagor som MIME-parts:

```typescript
async sendEmail(accountId: string, options: SendEmailOptions): Promise<SendEmailResult> {
  const gmail = await this.getClient(accountId);

  // Build MIME message
  const boundary = `boundary_${Date.now()}`;
  const attachments = options.attachments || [];

  let mimeMessage = [
    `From: ${options.from}`,
    `To: ${options.to}`,
    options.cc ? `Cc: ${options.cc}` : '',
    options.bcc ? `Bcc: ${options.bcc}` : '',
    `Subject: =?UTF-8?B?${Buffer.from(options.subject || '').toString('base64')}?=`,
    options.inReplyTo ? `In-Reply-To: ${options.inReplyTo}` : '',
    options.references ? `References: ${options.references}` : '',
    `MIME-Version: 1.0`,
  ].filter(Boolean);

  if (attachments.length > 0) {
    mimeMessage.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
    mimeMessage.push('');
    mimeMessage.push(`--${boundary}`);
    mimeMessage.push('Content-Type: text/plain; charset=UTF-8');
    mimeMessage.push('Content-Transfer-Encoding: base64');
    mimeMessage.push('');
    mimeMessage.push(Buffer.from(options.body || '').toString('base64'));

    for (const att of attachments) {
      mimeMessage.push(`--${boundary}`);
      mimeMessage.push(`Content-Type: ${att.mimeType}; name="${att.filename}"`);
      mimeMessage.push(`Content-Disposition: attachment; filename="${att.filename}"`);
      mimeMessage.push('Content-Transfer-Encoding: base64');
      mimeMessage.push('');
      mimeMessage.push(att.data); // Already base64
    }
    mimeMessage.push(`--${boundary}--`);
  } else {
    mimeMessage.push('Content-Type: text/plain; charset=UTF-8');
    mimeMessage.push('Content-Transfer-Encoding: base64');
    mimeMessage.push('');
    mimeMessage.push(Buffer.from(options.body || '').toString('base64'));
  }

  const raw = Buffer.from(mimeMessage.join('\r\n'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const response = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw, threadId: options.threadId },
  });

  return { messageId: response.data.id!, threadId: response.data.threadId! };
}
```

### 1E. SMTP send med attachments

I `server/src/services/smtp.service.ts`, uppdatera `sendEmail` att inkludera bilagor via nodemailer:
```typescript
attachments: (options.attachments || []).map(att => ({
  filename: att.filename,
  content: Buffer.from(att.data, 'base64'),
  contentType: att.mimeType,
})),
```

### 1F. Frontend — drag & drop + file picker

I `client/app/compose/page.tsx`:

```tsx
const [attachments, setAttachments] = useState<Array<{
  id: string;
  filename: string;
  size: number;
  mimeType: string;
  uploading?: boolean;
}>>([]);
const fileInputRef = useRef<HTMLInputElement>(null);

async function handleFileUpload(files: FileList) {
  // Need a draft to attach to — autosave first if no draft exists
  let draftId = autoSavedDraftId;
  if (!draftId) {
    const result = await api.createDraft({
      body_text: content,
      subject,
      to_address: toInput,
      account_id: selectedAccountId,
    });
    draftId = result.draft.id;
    setAutoSavedDraftId(draftId);
  }

  for (const file of Array.from(files)) {
    if (file.size > 25 * 1024 * 1024) {
      toast.error(`${file.name} är för stor (max 25 MB)`);
      continue;
    }

    const tempId = crypto.randomUUID();
    setAttachments(prev => [...prev, { id: tempId, filename: file.name, size: file.size, mimeType: file.type, uploading: true }]);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const result = await fetch(`/api/v1/drafts/${draftId}/attachments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: formData,
      });
      const data = await result.json();
      setAttachments(prev => prev.map(a => a.id === tempId ? { ...data.attachment, uploading: false } : a));
    } catch {
      toast.error(`Kunde inte ladda upp ${file.name}`);
      setAttachments(prev => prev.filter(a => a.id !== tempId));
    }
  }
}

async function removeAttachment(attId: string) {
  if (autoSavedDraftId) {
    await fetch(`/api/v1/drafts/${autoSavedDraftId}/attachments/${attId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${getToken()}` },
    });
  }
  setAttachments(prev => prev.filter(a => a.id !== attId));
}
```

Drop zone:
```tsx
<div
  onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
  onDragLeave={() => setDragActive(false)}
  onDrop={(e) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files.length) handleFileUpload(e.dataTransfer.files);
  }}
  className={`relative ${dragActive ? 'ring-2 ring-violet-500 bg-violet-50 dark:bg-violet-900/20' : ''}`}
>
  {/* ... existing compose form ... */}

  {/* Attachment bar */}
  <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-800 flex items-center gap-2 flex-wrap">
    <button
      onClick={() => fileInputRef.current?.click()}
      className="flex items-center gap-1 text-xs text-gray-500 hover:text-violet-600 dark:text-gray-400"
    >
      <Paperclip size={14} /> Bifoga fil
    </button>
    <input ref={fileInputRef} type="file" multiple hidden onChange={(e) => e.target.files && handleFileUpload(e.target.files)} />

    {attachments.map(att => (
      <div key={att.id} className="flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs">
        {att.uploading ? <Loader2 size={12} className="animate-spin" /> : <Paperclip size={12} />}
        <span className="max-w-[120px] truncate">{att.filename}</span>
        <span className="text-gray-400">{formatFileSize(att.size)}</span>
        <button onClick={() => removeAttachment(att.id)} className="text-gray-400 hover:text-red-500">
          <X size={12} />
        </button>
      </div>
    ))}
  </div>

  {/* Drag overlay */}
  {dragActive && (
    <div className="absolute inset-0 bg-violet-500/10 border-2 border-dashed border-violet-400 rounded-xl flex items-center justify-center z-50">
      <p className="text-violet-600 dark:text-violet-300 font-medium">Släpp filer här</p>
    </div>
  )}
</div>
```

### 1G. Draft detail — visa attachments

I `client/app/drafts/[id]/page.tsx`, visa bilagor med ta bort-knapp.

### COMMIT: `feat: attachment upload — drag & drop compose, multipart upload, Gmail/SMTP MIME attachments`

---

## SPRINT 2: GMAIL PUSH (REAL-TIME SYNC)

### Problem
Mail syncar var 5:e minut via polling. Nya mail kan ta upp till 5 min att dyka upp.

### 2A. Google Cloud Pub/Sub setup

I `server/src/services/gmail-push.service.ts`:

```typescript
import { google } from 'googleapis';

/**
 * Gmail Push Notifications via Google Cloud Pub/Sub.
 *
 * Flow:
 * 1. watch() registers a Gmail mailbox watch → Google sends notifications to our Pub/Sub topic
 * 2. Google POST:s to our webhook when new mail arrives
 * 3. We sync the specific account that received new mail
 *
 * Requires:
 * - GOOGLE_CLOUD_PROJECT_ID env var
 * - A Pub/Sub topic: projects/{project}/topics/cdp-hub-gmail
 * - A push subscription pointing to: {BACKEND_URL}/api/v1/webhooks/gmail
 * - The Gmail API service account needs Pub/Sub publisher permission
 */

export class GmailPushService {
  private readonly topicName: string;

  constructor() {
    const project = process.env.GOOGLE_CLOUD_PROJECT_ID;
    this.topicName = project ? `projects/${project}/topics/cdp-hub-gmail` : '';
  }

  /**
   * Register watch for a Gmail account. Must be renewed every 7 days.
   */
  async watch(accountId: string): Promise<{ historyId: string; expiration: string } | null> {
    if (!this.topicName) return null; // Pub/Sub not configured — fall back to polling

    const gmail = await gmailService.getGmailClient(accountId);

    const response = await gmail.users.watch({
      userId: 'me',
      requestBody: {
        topicName: this.topicName,
        labelIds: ['INBOX'],
      },
    });

    // Store historyId and expiration on account
    await prisma.emailAccount.update({
      where: { id: accountId },
      data: {
        gmailHistoryId: response.data.historyId?.toString(),
        gmailWatchExpiry: response.data.expiration
          ? new Date(parseInt(response.data.expiration))
          : null,
      },
    });

    return {
      historyId: response.data.historyId?.toString() || '',
      expiration: response.data.expiration?.toString() || '',
    };
  }

  /**
   * Renew watches for all Gmail accounts. Call daily.
   */
  async renewAllWatches(): Promise<void> {
    const accounts = await prisma.emailAccount.findMany({
      where: { provider: 'google', isActive: true },
    });

    for (const account of accounts) {
      try {
        await this.watch(account.id);
      } catch (err) {
        console.error(`Failed to renew watch for ${account.email}:`, err);
      }
    }
  }

  /**
   * Handle incoming Pub/Sub notification. Triggers incremental sync.
   */
  async handleNotification(data: { emailAddress: string; historyId: string }): Promise<void> {
    const account = await prisma.emailAccount.findFirst({
      where: { email: data.emailAddress, provider: 'google', isActive: true },
    });
    if (!account) return;

    // Trigger incremental sync from the history ID
    await gmailService.incrementalSync(account.id, data.historyId);
  }
}

export const gmailPushService = new GmailPushService();
```

### 2B. Schema — push fields

Lägg till i EmailAccount:
```prisma
gmailHistoryId    String?   @map("gmail_history_id")
gmailWatchExpiry  DateTime? @map("gmail_watch_expiry")
```

### 2C. Incremental sync

I `server/src/services/gmail.service.ts`:

```typescript
/**
 * Incremental sync using Gmail History API.
 * Much faster than full sync — only fetches changes since last historyId.
 */
async incrementalSync(accountId: string, sinceHistoryId: string): Promise<void> {
  const gmail = await this.getClient(accountId);
  const account = await prisma.emailAccount.findUnique({ where: { id: accountId } });
  if (!account) return;

  try {
    const response = await gmail.users.history.list({
      userId: 'me',
      startHistoryId: sinceHistoryId,
      historyTypes: ['messageAdded', 'labelAdded', 'labelRemoved'],
    });

    const histories = response.data.history || [];

    for (const history of histories) {
      // Process new messages
      for (const added of history.messagesAdded || []) {
        const msgId = added.message?.id;
        if (!msgId) continue;

        // Check if we already have this message
        const existing = await prisma.emailMessage.findFirst({
          where: { gmailId: msgId },
        });
        if (existing) continue;

        // Fetch and store the new message
        await this.fetchAndStoreMessage(accountId, msgId);
      }
    }

    // Update stored historyId
    if (response.data.historyId) {
      await prisma.emailAccount.update({
        where: { id: accountId },
        data: { gmailHistoryId: response.data.historyId.toString() },
      });
    }
  } catch (err: any) {
    if (err?.response?.status === 404) {
      // History expired — do full sync
      await this.fullSync(accountId);
    } else {
      throw err;
    }
  }
}
```

### 2D. Webhook endpoint

Skapa `server/src/routes/webhooks.ts`:

```typescript
// POST /webhooks/gmail — Receives Pub/Sub push notifications from Google
fastify.post('/webhooks/gmail', async (request, reply) => {
  // Pub/Sub sends base64-encoded JSON in message.data
  const body = request.body as any;
  const message = body?.message;
  if (!message?.data) {
    return reply.code(200).send(); // Acknowledge but ignore
  }

  const decoded = JSON.parse(Buffer.from(message.data, 'base64').toString());
  // decoded = { emailAddress: "user@gmail.com", historyId: "12345" }

  await gmailPushService.handleNotification(decoded).catch((err) => {
    fastify.log.error({ err, decoded }, 'Gmail push notification handling failed');
  });

  return reply.code(200).send(); // Always 200 — Google retries on non-2xx
});
```

**OBS: Denna route ska INTE kräva auth** — den tar emot från Google. Verifiera avsändare via Pub/Sub subscription.

### 2E. Watch renewal i scheduler

I `server/src/services/sync-scheduler.service.ts`, lägg till daglig renewal:

```typescript
// Every 24 hours: renew Gmail watches
if (Date.now() - lastWatchRenewal > 24 * 60 * 60 * 1000) {
  await gmailPushService.renewAllWatches().catch(() => {});
  lastWatchRenewal = Date.now();
}
```

### 2F. Fallback

Om `GOOGLE_CLOUD_PROJECT_ID` inte är satt, skippa watch-registrering. Polling-baserad sync fortsätter som fallback. Logga en info-rad vid startup: "Gmail Push: enabled" eller "Gmail Push: disabled (no GOOGLE_CLOUD_PROJECT_ID), using polling fallback".

### COMMIT: `feat: Gmail push notifications — Pub/Sub webhook, incremental sync, watch renewal`

---

## SPRINT 3: DISPATCH / OS INTEGRATION — Agent API Polish

### Problem
Amanda-chatten ska nås från Dispatch (Jespers OS-chatt) och andra externa system via agent API.

### 3A. Agent API — utöka actions

I `server/src/routes/agent.ts`, lägg till nya actions:

```typescript
const VALID_ACTIONS = [
  'briefing',      // Inbox summary
  'classify',      // Classify single thread
  'bulk-classify', // Classify all unclassified
  'draft',         // Generate draft reply
  'search',        // Search threads
  'brain-status',  // Brain Core status
  'learn',         // Record learning event
  'sync',          // Trigger email sync
  'cleanup',       // Clean up old data
  // NEW:
  'send',          // Approve + send a draft (requires draft_id)
  'schedule',      // Schedule a draft (requires draft_id + send_at)
  'snooze',        // Snooze a thread (requires thread_id + until)
  'export',        // Export threads as JSON
  'contacts',      // List contacts
  'stats',         // Inbox statistics
  'compose',       // Create new draft from scratch
  'chat',          // Free-form Amanda chat
];
```

Implementera varje ny action:

**send**: Hämtar draft, approve:ar om pending, skickar.
**schedule**: Hämtar draft, approve:ar, schemalägger.
**snooze**: Snooze:ar tråd med given tid.
**export**: Returnerar JSON med alla trådar (max 100).
**contacts**: Returnerar kontaktlista.
**stats**: Returnerar olästa, hög prio, snoozade, utkast, senaste sync.
**compose**: Skapar nytt draft med given text + account_id.
**chat**: Vidarebefordrar till chat-endpointen, returnerar Amanda-svar.

### 3B. Agent API — batch actions

Stöd batch-requests:

```typescript
// POST /api/v1/agent/batch — Execute multiple actions
fastify.post('/api/v1/agent/batch', async (request, reply) => {
  const { actions } = request.body as { actions: Array<{ action: string; params: any }> };

  const results = [];
  for (const { action, params } of actions) {
    try {
      const result = await executeAction(action, params, request.userId);
      results.push({ action, success: true, data: result });
    } catch (err) {
      results.push({ action, success: false, error: (err as Error).message });
    }
  }

  return { results };
});
```

### 3C. Agent API — webhook callback

Stöd asynkron notification tillbaka till caller:

```typescript
// Om request body innehåller callback_url, skicka resultat dit när klart
if (params.callback_url) {
  // Execute action async
  executeAction(action, params, userId).then(async (result) => {
    await fetch(params.callback_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, success: true, data: result }),
    }).catch(() => {});
  });

  return reply.code(202).send({ message: 'Accepted — result will be sent to callback_url' });
}
```

### 3D. Agent API documentation

Uppdatera `server/src/routes/docs.ts` med alla actions, deras parametrar och exempelsvar.

### 3E. Rate limiting per API key

Agent API ska ha separat rate limiting:
```typescript
// 30 req/min for agent API (vs 200 for web UI)
fastify.addHook('onRequest', async (request) => {
  if (request.url.startsWith('/api/v1/agent/')) {
    // Use X-API-Key as rate limit key instead of IP
    const apiKey = request.headers['x-api-key'];
    // ... rate limit logic specific to agent routes
  }
});
```

### COMMIT: `feat: agent API v2 — send, schedule, snooze, compose, batch, callback webhook`

---

## SPRINT 4: MOBILE RESPONSIVENESS AUDIT

### Problem
Appen är "mobile-first" men vissa sidor kan ha layout-problem på riktiga mobiler (375px bred).

### 4A. Viewport fix

Se till att ALLA sidor har korrekt min-höjd och inte scrollar horisontellt:

```css
/* I global CSS eller via Tailwind */
.page-container {
  @apply min-h-[100dvh] max-w-full overflow-x-hidden;
}
```

### 4B. Touch targets

Alla klickbara element ska vara minst 44x44px (Apple HIG):

Gå igenom och fixa:
- BottomNav-knappar: verifiera `min-h-[44px] min-w-[44px]`
- Inbox tråd-rader: redan tillräckligt stora ✓
- Filter-chips: se till att de har `py-2 px-3` minst
- Action-knappar i thread detail: verifiera storlek
- Snooze/label dropdowns: items ska ha `py-3`
- ChatWidget input: `h-[44px]` minst

### 4C. Safe area insets

I `client/app/layout.tsx`, lägg till:
```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
```

I BottomNav:
```tsx
className="pb-[env(safe-area-inset-bottom)]"
```

### 4D. Pull-to-refresh

Kontrollera att `PullToRefresh`-komponenten fungerar i inbox. Om den inte redan är integrerad, integrera den:

```tsx
// I inbox page, wrappa tråd-listan:
<PullToRefresh onRefresh={handleSync}>
  {/* Thread list */}
</PullToRefresh>
```

### 4E. Landscape mode

Se till att appen inte breakar i landscape. Specifikt:
- ChatWidget: ska inte överlappa BottomNav
- Compose: textarea ska inte bli för kort
- Thread detail: meddelanden ska vara läsbara

### 4F. Font sizes

Kontrollera att text aldrig är mindre än 14px på mobil:
- Timestamps: `text-xs` (12px) → öka till `text-sm` (14px) på mobil
- Filter-labels: kontrollera läsbarhet
- Email snippet previews: minst `text-sm`

### COMMIT: `feat: mobile audit — touch targets, safe areas, pull-to-refresh, font sizing`

---

## SPRINT 5: MULTI-INBOX UNIFIED VIEW

### Problem
Med flera konton syns alla trådar blandat. Det finns account-filter men ingen tydlig visuell separation.

### 5A. Unified inbox header

I inbox, visa en sammanställning överst:

```tsx
<div className="px-4 py-3 flex gap-3 overflow-x-auto">
  <button
    onClick={() => setSelectedAccountId('')}
    className={`shrink-0 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
      !selectedAccountId
        ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300'
        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
    }`}
  >
    Alla ({totalUnread})
  </button>
  {accounts.map(acc => (
    <button
      key={acc.id}
      onClick={() => setSelectedAccountId(acc.id)}
      className={`shrink-0 px-3 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 ${
        selectedAccountId === acc.id ? 'bg-violet-100 ...' : 'bg-gray-100 ...'
      }`}
    >
      <span className={`w-2 h-2 rounded-full ${acc.provider === 'google' ? 'bg-red-400' : 'bg-blue-400'}`} />
      {acc.label || acc.email.split('@')[0]}
      {acc.unreadCount > 0 && (
        <span className="bg-violet-600 text-white text-xs px-1.5 py-0.5 rounded-full">{acc.unreadCount}</span>
      )}
    </button>
  ))}
</div>
```

### 5B. Account color coding

Tilldela varje konto en färg (baserat på index):
```typescript
const ACCOUNT_COLORS = ['#EF4444', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6'];
```

Visa som en tunn färgrand på vänster sida av varje tråd-rad:
```tsx
<div className="absolute left-0 top-2 bottom-2 w-1 rounded-r" style={{ backgroundColor: accountColor }} />
```

### 5C. Per-account unread counts

I `server/src/routes/threads.ts`, GET `/threads`:

Returnera per-account olästa i response:
```typescript
const accountCounts = await prisma.emailThread.groupBy({
  by: ['accountId'],
  where: { isRead: false, isTrashed: false, isArchived: false },
  _count: true,
});
```

Inkludera i response: `{ threads, total, hasMore, accountCounts }`.

### 5D. Dashboard — per-account stats

I `client/app/page.tsx` (dashboard), visa per-konto statistik:
- Olästa
- Hög prio
- Senaste sync
- Konto-status (aktiv/inaktiv)

### COMMIT: `feat: unified multi-inbox — account tabs, color coding, per-account stats`

---

## SPRINT 6: FINAL SWEEP + V1.0 RELEASE

### 6A. Accessibility final pass

Kör en automatisk a11y-audit med axe:
```bash
cd client && npm install -D @axe-core/playwright
```

I Playwright-test:
```typescript
import AxeBuilder from '@axe-core/playwright';

test('inbox accessibility', async ({ page }) => {
  await page.goto('/inbox');
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
```

### 6B. Performance check

Verifiera:
- First Contentful Paint < 2s
- Total bundle size < 500KB (gzipped)
- Inga N+1 queries i backend

Lägg till `server/src/utils/query-logger.ts`:
```typescript
// In dev, log queries that take > 100ms
if (process.env.NODE_ENV !== 'production') {
  prisma.$on('query', (e) => {
    if (e.duration > 100) {
      console.warn(`Slow query (${e.duration}ms): ${e.query}`);
    }
  });
}
```

### 6C. Final test run

```bash
cd server && npx vitest run
cd client && npx vitest run
cd client && npx playwright test
```

Fix alla failures.

### 6D. CHANGELOG update

Lägg till v1.0 entries för alla sprints i denna spec.

### 6E. Version bump

I `client/package.json` och `server/package.json`:
```json
"version": "1.0.0"
```

### 6F. Git tag

```bash
git tag -a v1.0.0 -m "v1.0.0 — CDP Communication Hub launch release"
```

### COMMIT: `chore: v1.0.0 release — accessibility audit, performance check, version bump`

---

## SAMMANFATTNING — 6 sprints, 6 commits:

1. `feat: attachment upload — drag & drop compose, multipart upload, Gmail/SMTP MIME attachments`
2. `feat: Gmail push notifications — Pub/Sub webhook, incremental sync, watch renewal`
3. `feat: agent API v2 — send, schedule, snooze, compose, batch, callback webhook`
4. `feat: mobile audit — touch targets, safe areas, pull-to-refresh, font sizing`
5. `feat: unified multi-inbox — account tabs, color coding, per-account stats`
6. `chore: v1.0.0 release — accessibility audit, performance check, version bump`

## ORDNING

Sprint 1 (attachments) är mest kritisk — gör den först.
Sprint 2 (Gmail push) kan göras parallellt.
Sprint 3 (agent API) beror inte på något annat.
Sprint 4 (mobile) beror inte på något annat.
Sprint 5 (multi-inbox) beror inte på något annat.
Sprint 6 (release) ska vara SIST.

## POST-BUILD VERIFICATION

- [ ] `npx tsc --noEmit` — noll errors
- [ ] `npm run build` — lyckas
- [ ] `npx vitest run` — grönt
- [ ] `npx playwright test` — grönt
- [ ] v1.0.0 tag skapad
- [ ] CHANGELOG uppdaterad
- [ ] README final
