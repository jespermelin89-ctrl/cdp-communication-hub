/**
 * AIService - Stateless AI analysis and draft generation.
 *
 * This is a SUGGESTION ENGINE, not an execution engine.
 * It produces structured outputs gated behind human approval.
 *
 * Supports Groq (default/free), Anthropic (Claude), and OpenAI via unified interface.
 * Provider blacklisting: permanently-failing providers (e.g. no credits) are skipped
 * for 1 hour to avoid wasted latency on every request.
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { env } from '../config/env';
import { AIAnalysisSchema, type AIAnalysisOutput } from '../utils/validators';
import { brainCoreService } from './brain-core.service';

// System prompt for email analysis
const ANALYSIS_SYSTEM_PROMPT = `You are an email analysis assistant for a business communication hub.
Analyze the email thread and return a JSON object with exactly these fields:
- summary: 2-3 sentence summary. Be specific about what the thread is about.
- classification: exactly one of: lead, partner, personal, spam, operational, founder, outreach
- priority: exactly one of: high, medium, low
- suggested_action: exactly one of: reply, ignore, review_later, archive_suggestion
- draft_text: if suggested_action is "reply", write a direct, human-sounding reply. No robotic phrases like "I hope this finds you well". Keep it concise and professional. If not reply, set to null.
- confidence: a number between 0 and 1 indicating your confidence in the analysis
- model_used: the model identifier you are running as

LANGUAGE INSTRUCTIONS:
- Always respond in Swedish unless the email thread is in English or another language — then match the thread's language.
- The "summary" field should be written in Swedish if the thread is in Swedish, English if the thread is in English.

CRITICAL INSTRUCTIONS:
1. Return ONLY a JSON object. No text before or after the JSON.
2. Do NOT wrap the JSON in markdown code fences (no \`\`\`json).
3. Every field must be present. Use null for draft_text if not applicable.
4. The "model_used" field should be the model name you are using.

Example output:
{"summary":"The thread is about a partnership proposal from a fitness brand.","classification":"partner","priority":"high","suggested_action":"reply","draft_text":"Hi, thanks for reaching out...","confidence":0.9,"model_used":"llama-3.3-70b-versatile"}`;

// System prompt for draft generation
const DRAFT_SYSTEM_PROMPT = `You are a professional email draft writer for a business founder.
Write emails that are:
- Direct and clear, not overly formal
- Human-sounding, not robotic
- Concise - get to the point
- Context-aware when thread history is provided

LANGUAGE INSTRUCTIONS:
- Write the draft reply in the same language as the original email.
- If the email is in Swedish, reply in Swedish. If in English, reply in English. Match the thread's language exactly.

CRITICAL INSTRUCTIONS:
1. Return ONLY the email body text.
2. No subject line, no greeting suggestions outside the body, no meta-commentary.
3. No markdown formatting.`;

// System prompt for inbox summary — kept short and concise
const SUMMARY_SYSTEM_PROMPT = `Du är en mail-assistent. Ge en KORT sammanfattning på max 2-3 meningar:
1. Antal olästa som kräver åtgärd
2. Viktigaste ärenden (max 3)
3. Rekommenderad nästa åtgärd

Format: Kort och koncist. Inga listor. Inga punkter. Ren löpande text på svenska.`;

interface ThreadData {
  subject: string;
  messages: Array<{
    from: string;
    to: string[];
    body: string;
    date: string;
  }>;
}

/**
 * Strip markdown code fences and extract the JSON object from AI responses.
 * Llama and other models occasionally wrap output in ```json ... ```.
 */
function cleanJsonResponse(raw: string): string {
  let cleaned = raw.trim();
  // Strip markdown code fences
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  // Strip any text before first { or after last }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }
  return cleaned;
}

export class AIService {
  private anthropic: Anthropic | null = null;
  private openai: OpenAI | null = null;
  private groq: OpenAI | null = null;

  /** provider name → timestamp until which it is blacklisted */
  private providerBlacklist: Map<string, number> = new Map();

  constructor() {
    if (env.ANTHROPIC_API_KEY) {
      this.anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    }
    if (env.OPENAI_API_KEY) {
      this.openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    }
    if (env.GROQ_API_KEY) {
      this.groq = new OpenAI({
        apiKey: env.GROQ_API_KEY,
        baseURL: 'https://api.groq.com/openai/v1',
      });
    }
  }

  /**
   * Truncate text to maxChars to stay within provider token limits.
   * Groq TPM limit is 12 000 tokens — keep each message body under 2 000 chars.
   */
  private truncateContent(text: string | null | undefined, maxChars: number): string {
    if (!text) return '';
    if (text.length <= maxChars) return text;
    return text.substring(0, maxChars) + '... [trunkerad]';
  }

  /**
   * Returns true if the provider is not currently blacklisted.
   * Clears expired blacklist entries automatically.
   */
  private isProviderAvailable(name: string): boolean {
    const until = this.providerBlacklist.get(name);
    if (!until) return true;
    if (Date.now() > until) {
      this.providerBlacklist.delete(name);
      return true;
    }
    return false;
  }

  /**
   * Blacklist a provider for durationMs (default 1 hour).
   * Used when a provider returns a permanent error like "no credits".
   */
  private blacklistProvider(name: string, durationMs = 3_600_000): void {
    this.providerBlacklist.set(name, Date.now() + durationMs);
    console.warn(`[AI] Provider ${name} blacklisted for ${durationMs / 60000} min`);
  }

  /**
   * Returns true if the error indicates a permanent/billing failure that
   * won't resolve by retrying (no credits, invalid key, account suspended).
   */
  private isPermanentError(err: any): boolean {
    const msg: string = err?.message ?? '';
    const status: number = err?.status ?? err?.statusCode ?? 0;
    return (
      status === 402 ||
      (status === 400 && /credit|quota|billing|insufficient/i.test(msg)) ||
      /insufficient_quota|credit balance|no credits|account.*suspend/i.test(msg)
    );
  }

  /**
   * Analyze an email thread. Returns structured analysis.
   * Limits to 10 most recent messages; truncates bodies to 2 000 chars each.
   * Optionally accepts learningContext (pre-formatted string) to inject into the system prompt.
   */
  async analyzeThread(threadData: ThreadData, learningContext?: string): Promise<AIAnalysisOutput> {
    const recentMessages = threadData.messages.slice(-10).map((m) => ({
      ...m,
      body: this.truncateContent(m.body, 2000),
    }));

    const systemPrompt = learningContext
      ? ANALYSIS_SYSTEM_PROMPT + '\n\n' + learningContext
      : ANALYSIS_SYSTEM_PROMPT;

    const userMessage = `Analyze this email thread:

Subject: ${threadData.subject}

Messages (${recentMessages.length} of ${threadData.messages.length} total):
${recentMessages
  .map(
    (m, i) => `--- Message ${i + 1} ---
From: ${m.from}
To: ${m.to.join(', ')}
Date: ${m.date}
Body:
${m.body}
`
  )
  .join('\n')}`;

    const response = await this.chat(systemPrompt, userMessage);

    // Parse and validate with Zod
    let parsed: any;
    try {
      const cleaned = cleanJsonResponse(response);
      parsed = JSON.parse(cleaned);
    } catch (e) {
      throw new Error(`AI returned invalid JSON: ${response.substring(0, 200)}`);
    }

    const validated = AIAnalysisSchema.safeParse(parsed);
    if (!validated.success) {
      // Retry once with explicit correction
      const retryMessage = `Your previous response was invalid. Errors: ${JSON.stringify(validated.error.issues)}.

Please try again with EXACTLY this format:
${userMessage}`;

      const retryResponse = await this.chat(systemPrompt, retryMessage);
      const retryCleaned = cleanJsonResponse(retryResponse);
      const retryParsed = JSON.parse(retryCleaned);
      const retryValidated = AIAnalysisSchema.parse(retryParsed); // Throws if invalid
      return retryValidated;
    }

    return validated.data;
  }

  /**
   * Generate a draft email from a natural language instruction.
   * Truncates thread context bodies to 1 500 chars.
   */
  async generateDraft(options: {
    instruction: string;
    threadContext?: ThreadData;
    learningContext?: string;
  }): Promise<string> {
    let userMessage = `Write an email based on this instruction: "${options.instruction}"`;

    if (options.threadContext) {
      const recentMessages = options.threadContext.messages.slice(-5).map((m) => ({
        ...m,
        body: this.truncateContent(m.body, 1500),
      }));
      userMessage += `\n\nThis is a reply to the following thread:
Subject: ${options.threadContext.subject}

Recent messages:
${recentMessages
  .map(
    (m) => `From: ${m.from}
Date: ${m.date}
Body:
${m.body}
---`
  )
  .join('\n')}`;
    }

    const draftSystemPrompt = options.learningContext
      ? DRAFT_SYSTEM_PROMPT + '\n\n' + options.learningContext
      : DRAFT_SYSTEM_PROMPT;

    return this.chat(draftSystemPrompt, userMessage);
  }

  /**
   * Generate a draft using the user's Brain Core writing profile and learning history.
   * Fetches writing modes, voice attributes, and recent feedback to inject rich context.
   */
  async generateDraftWithProfile(options: {
    instruction: string;
    threadContext?: ThreadData;
    userId: string;
  }): Promise<string> {
    const [profile, learning] = await Promise.all([
      brainCoreService.getWritingProfile(options.userId).catch(() => ({ modes: [], attributes: [] })),
      brainCoreService.getRelevantLearning(options.userId, { eventType: 'draft' }).catch(() => []),
    ]);

    let learningContext = '';

    const modes = (profile as any)?.modes ?? [];
    const attributes = (profile as any)?.attributes ?? [];

    if (modes.length > 0) {
      learningContext += '\n\nSKRIVPROFIL — Använd rätt ton baserat på instruktionen:\n';
      for (const mode of modes) {
        learningContext += `- ${mode.name}: ${mode.description || ''}\n`;
        const phrases = mode.examplePhrases ?? mode.example_phrases ?? [];
        if (phrases.length > 0) {
          learningContext += `  Exempelfraser: ${phrases.join(', ')}\n`;
        }
      }
    }

    if (attributes.length > 0) {
      learningContext += '\nRÖSTATTRIBUT — Följ dessa ALLTID:\n';
      for (const attr of attributes) {
        learningContext += `- ${attr.attribute}: ${attr.description || ''}\n`;
      }
    }

    if (learning.length > 0) {
      learningContext += '\nTIDIGARE FEEDBACK (lär dig av detta):\n';
      for (const event of (learning as any[]).slice(-5)) {
        learningContext += `- ${event.eventType}: ${JSON.stringify(event.data).substring(0, 200)}\n`;
      }
    }

    return this.generateDraft({
      instruction: options.instruction,
      threadContext: options.threadContext,
      learningContext: learningContext || undefined,
    });
  }

  /**
   * Summarize inbox state for the Command Center daily briefing.
   * Truncates snippets to 300 chars to keep payload small.
   */
  async summarizeInbox(threads: Array<{
    subject: string;
    snippet: string;
    priority?: string;
    classification?: string;
    messageCount: number;
    lastMessageAt: Date;
    isRead: boolean;
  }>): Promise<string> {
    const userMessage = `Inkorgen har ${threads.length} trådar totalt:

${threads
  .slice(0, 30)
  .map(
    (t, i) => `${i + 1}. Ämne: ${t.subject}
   Utdrag: ${this.truncateContent(t.snippet, 300)}
   Prioritet: ${t.priority || 'ej analyserad'} | Typ: ${t.classification || 'ej analyserad'}
   Meddelanden: ${t.messageCount} | Senast: ${t.lastMessageAt.toISOString()}
   Läst: ${t.isRead ? 'ja' : 'NEJ'}`
  )
  .join('\n\n')}

Ge en kort sammanfattning.`;

    return this.chat(SUMMARY_SYSTEM_PROMPT, userMessage);
  }

  /**
   * Core chat method - tries providers in fallback order: Groq → Anthropic → OpenAI.
   * Skips blacklisted providers. Permanently-failing providers are blacklisted for 1 h.
   */
  async chat(systemPrompt: string, userMessage: string): Promise<string> {
    const allProviders: Array<{ name: string; fn: () => Promise<string> }> = [];

    if (this.groq) allProviders.push({ name: 'groq', fn: () => this.chatGroq(systemPrompt, userMessage) });
    if (this.anthropic) allProviders.push({ name: 'anthropic', fn: () => this.chatAnthropic(systemPrompt, userMessage) });
    if (this.openai) allProviders.push({ name: 'openai', fn: () => this.chatOpenAI(systemPrompt, userMessage) });

    const providers = allProviders.filter((p) => this.isProviderAvailable(p.name));

    if (providers.length === 0) {
      throw new Error('No AI provider available. All providers are blacklisted or unconfigured.');
    }

    let lastError: Error | null = null;
    for (const provider of providers) {
      try {
        const result = await provider.fn();
        if (lastError) {
          console.log(`[AI] Fallback succeeded via ${provider.name} (previous provider failed)`);
        } else {
          console.log(`[AI] Request handled by ${provider.name}`);
        }
        return result;
      } catch (err: any) {
        console.warn(`[AI] Provider ${provider.name} failed: ${err?.message}`);
        if (this.isPermanentError(err)) {
          this.blacklistProvider(provider.name);
        }
        lastError = err;
      }
    }

    throw new Error(`All AI providers failed. Last error: ${lastError?.message}`);
  }

  private async chatGroq(systemPrompt: string, userMessage: string): Promise<string> {
    const response = await this.groq!.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 2048,
      temperature: 0.3,
    });
    return response.choices[0]?.message?.content || '';
  }

  private async chatAnthropic(systemPrompt: string, userMessage: string): Promise<string> {
    const response = await this.anthropic!.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const textBlock = response.content.find((c) => c.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text response from Claude');
    }
    return textBlock.text;
  }

  private async chatOpenAI(systemPrompt: string, userMessage: string): Promise<string> {
    const response = await this.openai!.chat.completions.create({
      model: 'gpt-4o-mini', // 16x cheaper than gpt-4o, sufficient for mail analysis
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 2048,
      temperature: 0.3,
    });

    return response.choices[0]?.message?.content || '';
  }

  /**
   * Generate a structured morning briefing from urgent threads and yesterday's stats.
   * Returns fields compatible with DailySummary.create data.
   */
  async generateBriefing(
    _userId: string,
    urgentThreads: Array<{ subject: string | null; participantEmails: string[]; snippet: string | null }>,
    stats: { received: number; sent: number; classified: number }
  ): Promise<{
    needsReply: any[];
    goodToKnow: any[];
    autoArchived: any[];
    awaitingReply: any[];
    recommendation: string;
    totalNew: number;
    totalUnread: number;
    totalAutoSorted: number;
    modelUsed: string;
  }> {
    const BRIEFING_SYSTEM_PROMPT = `Du är en e-postassistent som genererar morgonbriefingar.
Analysera de brådskande trådarna och statistiken, och returnera ett JSON-objekt med exakt dessa fält:
- needsReply: array av { subject, sender } för trådar som kräver svar
- goodToKnow: array av { subject, note } för viktiga informationsmail
- autoArchived: array (kan vara tom)
- awaitingReply: array (kan vara tom)
- recommendation: en kort handlingsinriktad mening på svenska
- modelUsed: modell-id

CRITICAL: Returnera BARA ett JSON-objekt. Inga kodblock, ingen text utanför JSON.`;

    const userMessage = `Igår: ${stats.received} mottagna, ${stats.sent} skickade, ${stats.classified} klassificerade.

Brådskande trådar (${urgentThreads.length} st):
${urgentThreads
  .slice(0, 8)
  .map(
    (t, i) => `${i + 1}. Ämne: ${t.subject || '(Inget ämne)'}
   Från: ${t.participantEmails[0] ?? 'okänd'}
   Utdrag: ${(t.snippet ?? '').substring(0, 150)}`
  )
  .join('\n\n')}

Generera morgonbriefing.`;

    let parsed: any;
    try {
      const response = await this.chat(BRIEFING_SYSTEM_PROMPT, userMessage);
      const cleaned = cleanJsonResponse(response);
      parsed = JSON.parse(cleaned);
    } catch {
      // Fallback if AI fails
      parsed = {
        needsReply: urgentThreads.slice(0, 3).map((t) => ({ subject: t.subject, sender: t.participantEmails[0] ?? 'okänd' })),
        goodToKnow: [],
        autoArchived: [],
        awaitingReply: [],
        recommendation: `${urgentThreads.length} trådar kräver din uppmärksamhet idag.`,
        modelUsed: 'fallback',
      };
    }

    return {
      needsReply: Array.isArray(parsed.needsReply) ? parsed.needsReply : [],
      goodToKnow: Array.isArray(parsed.goodToKnow) ? parsed.goodToKnow : [],
      autoArchived: Array.isArray(parsed.autoArchived) ? parsed.autoArchived : [],
      awaitingReply: Array.isArray(parsed.awaitingReply) ? parsed.awaitingReply : [],
      recommendation: typeof parsed.recommendation === 'string' ? parsed.recommendation : '',
      totalNew: stats.received,
      totalUnread: urgentThreads.length,
      totalAutoSorted: stats.classified,
      modelUsed: typeof parsed.modelUsed === 'string' ? parsed.modelUsed : 'unknown',
    };
  }

  /**
   * Generate a short smart reply suggestion for a high-priority thread.
   * Returns a 1-3 sentence suggestion or null if generation fails.
   */
  async generateSmartReply(thread: {
    subject: string | null;
    messages: Array<{ from: string; body: string; date: string }>;
  }): Promise<string | null> {
    const SMART_REPLY_PROMPT = `Du är en e-postassistent. Generera ett KORT svarsförslag (1-3 meningar) för det senaste mailet i tråden.
Svaret ska vara direkt och professionellt. Inga inledningsfraser som "Hej" — bara svarskärnan.
Skriv på samma språk som det senaste mailet.
Returnera BARA svarstext, inget annat.`;

    const lastMsg = thread.messages[thread.messages.length - 1];
    if (!lastMsg) return null;

    const userMessage = `Ämne: ${thread.subject || '(Inget ämne)'}
Från: ${lastMsg.from}
Meddelande: ${lastMsg.body.substring(0, 800)}

Skriv ett kort svarsförslag.`;

    try {
      const response = await this.chat(SMART_REPLY_PROMPT, userMessage);
      const trimmed = response.trim();
      return trimmed.length > 0 && trimmed.length < 500 ? trimmed : null;
    } catch {
      return null;
    }
  }
}

// Singleton instance
export const aiService = new AIService();
