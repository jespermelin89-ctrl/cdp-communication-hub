// ============================================================
// Shared TypeScript types for the frontend
// ============================================================

export interface User {
  id: string;
  email: string;
  name: string | null;
  accounts: Account[];
  settings: UserSettings | null;
}


export interface UserSettings {
  id: string;
  defaultAccountId: string | null;
  uiTheme: string;
  aiTonePreference: string | null;
  bookingLink?: string | null;
  quietHoursStart?: number | null;
  quietHoursEnd?: number | null;
  digestEnabled?: boolean;
  digestTime?: number | null;
  undoSendDelay?: number;
  compactMode?: boolean;
  notificationSound?: boolean;
  externalImages?: 'ask' | 'allow' | 'block';
}

export interface CalendarAvailabilitySlot {
  start: string;
  end: string;
}

export interface CalendarAvailabilityResponse {
  supported: boolean;
  requiresReconnect: boolean;
  slots: CalendarAvailabilitySlot[];
  reason?: string;
  reauthUrl?: string;
  timeZone: string;
  days?: number;
  limit?: number;
  slotMinutes?: number;
  windowStart?: string;
  windowEnd?: string;
}

export interface CalendarCreatedEvent {
  id: string;
  htmlLink: string | null;
  summary: string | null;
  start: string;
  end: string;
  status: string | null;
}

export interface CalendarCreateEventResponse {
  supported: boolean;
  requiresReconnect: boolean;
  reason?: string;
  reauthUrl?: string;
  timeZone: string;
  event?: CalendarCreatedEvent;
}

export interface CalendarInvite {
  uid: string | null;
  method: string | null;
  status: string | null;
  summary: string | null;
  description: string | null;
  location: string | null;
  organizer: string | null;
  organizerName: string | null;
  start: string | null;
  end: string | null;
  timeZone: string | null;
  isAllDay: boolean;
}

export type CalendarInviteResponseStatus = 'accepted' | 'declined';

export interface EmailAttachment {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
  downloadable?: boolean;
  calendarInvite?: CalendarInvite | null;
}

export interface CalendarReleaseEventResponse {
  supported: boolean;
  requiresReconnect: boolean;
  reason?: string;
  reauthUrl?: string;
  timeZone: string;
  released?: boolean;
  eventId?: string;
}

export interface CalendarInviteResponse {
  supported: boolean;
  requiresReconnect: boolean;
  reason?: string;
  reauthUrl?: string;
  timeZone: string;
  responseStatus?: CalendarInviteResponseStatus;
  event?: (CalendarCreatedEvent & { responseStatus: CalendarInviteResponseStatus }) | undefined;
}

export interface CustomLabel {
  id: string;
  name: string;
  color: string;
  icon: string | null;
}

export interface EmailThread {
  id: string;
  accountId: string;
  gmailThreadId: string;
  subject: string | null;
  snippet: string | null;
  lastMessageAt: string | null;
  participantEmails: string[];
  messageCount: number;
  labels: string[];
  isRead: boolean;
  snoozedUntil: string | null;
  isSentByUser?: boolean;
  account: { id: string; emailAddress: string; provider?: string };
  latestAnalysis: AIAnalysis | null;
  messages?: EmailMessage[];
  drafts?: Draft[];
  threadLabels?: Array<{ labelId: string; label: CustomLabel }>;
}

export interface Account {
  id: string;
  emailAddress: string;
  displayName: string | null;
  provider: 'gmail' | 'imap' | string;
  isDefault: boolean;
  isActive: boolean;
  label: string | null;
  color: string | null;
  badges: string[];
  signature: string | null;
  signatureHtml: string | null;
  useSignatureOnNew: boolean;
  useSignatureOnReply: boolean;
  accountType: 'personal' | 'team' | 'shared';
  teamMembers: string[];
  aiHandling: 'normal' | 'separate' | 'notify_only';
  lastSyncAt: string | null;
  syncError: string | null;
  createdAt: string;
  threadCount?: number;
}

export interface EmailMessage {
  id: string;
  threadId: string;
  gmailMessageId: string;
  fromAddress: string;
  toAddresses: string[];
  ccAddresses: string[];
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  attachments: EmailAttachment[];
  receivedAt: string;
}

export type Message = EmailMessage;

export interface AIAnalysis {
  id: string;
  threadId: string;
  summary: string;
  classification: string;
  priority: 'high' | 'medium' | 'low';
  suggestedAction: string;
  draftText: string | null;
  confidence: number;
  modelUsed: string;
  createdAt: string;
}

export type DraftStatus = 'pending' | 'approved' | 'sent' | 'failed' | 'discarded';

export interface Draft {
  id: string;
  userId: string;
  accountId: string;
  threadId: string | null;
  toAddresses: string[];
  ccAddresses: string[];
  subject: string;
  bodyText: string;
  status: DraftStatus;
  gmailMessageId: string | null;
  approvedAt: string | null;
  sentAt: string | null;
  scheduledAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  account: { id: string; emailAddress: string };
  thread?: { subject: string | null } | null;
}

export interface CommandCenterData {
  overview: {
    pending_drafts: number;
    approved_drafts: number;
    high_priority_threads: number;
    medium_priority_threads: number;
    low_priority_threads: number;
    unread_threads: number;
    total_threads: number;
    unanalyzed_threads: number;
    high_priority_senders: string[];
  };
  drafts_preview: Draft[];
  recent_actions: Array<{
    actionType: string;
    targetType: string | null;
    metadata: any;
    createdAt: string;
  }>;
  accounts: Account[];
  per_account_stats: Record<string, { unread: number; highPriority: number }>;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Label {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  position: number;
}

export interface Template {
  id: string;
  name: string;
  subject?: string | null;
  bodyText: string;
  bodyHtml?: string | null;
  category?: string | null;
  useCount?: number;
  createdAt: string;
}

export interface SavedView {
  id: string;
  name: string;
  icon?: string | null;
  filters: Record<string, string>;
  sortKey?: string | null;
  position?: number;
}

export interface ContactProfile {
  id: string;
  emailAddress: string;
  displayName?: string | null;
  relationship?: string | null;
  preferredMode?: string | null;
  language?: string | null;
  notes?: string | null;
  totalEmails?: number;
  lastContactAt?: string | null;
}

export interface FollowUpReminder {
  id: string;
  threadId: string;
  remindAt: string;
  note?: string | null;
  completed: boolean;
  createdAt: string;
  thread?: { subject: string | null };
}

export interface ActionLog {
  id: string;
  actionType: string;
  targetType: string | null;
  targetId?: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface SearchHistoryEntry {
  id: string;
  query: string;
  filters?: Record<string, unknown> | null;
  resultCount: number;
  createdAt: string;
}

export interface WritingMode {
  id: string;
  modeKey: string;
  name: string;
  description?: string | null;
  signOff?: string | null;
  isDefault?: boolean;
  enabled?: boolean;
  tone?: string | null;
  formality?: string | null;
  characteristics?: Record<string, unknown>;
}

export interface VoiceAttribute {
  id: string;
  attribute: string;
  value: string;
  source?: string | null;
}

export interface DailySummary {
  id: string;
  date: string;
  needsReply: number;
  goodToKnow: number;
  totalThreads?: number;
  recommendation?: string | null;
  topSenders?: string[];
  generatedAt?: string;
}

export interface LearningEvent {
  id: string;
  eventType: string;
  data: Record<string, unknown>;
  sourceType?: string | null;
  sourceId?: string | null;
  createdAt: string;
}

export interface SenderRule {
  id: string;
  senderPattern: string;
  action: 'spam' | 'archive' | 'categorize' | 'mute' | 'star';
  subjectPattern?: string | null;
  categoryId?: string | null;
  priority?: string | null;
  isActive: boolean;
  confidence?: number;
}

export interface ClassificationRule {
  id: string;
  name: string;
  color?: string | null;
  icon?: string | null;
  description?: string | null;
  slug?: string;
  priority?: number;
  isSystem?: boolean;
}

export interface AnalyticsOverview {
  mailVolume: Record<string, unknown>;
  responseTime: Record<string, unknown>;
  topSenders: Array<{ email: string; count: number }>;
  classification?: Record<string, number>;
  period?: { days: number; start: string; end: string };
}
