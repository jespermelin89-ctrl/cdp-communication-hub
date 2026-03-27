/**
 * AIService - Stateless AI analysis and draft generation.
 *
 * This is a SUGGESTION ENGINE, not an execution engine.
 * It produces structured outputs gated behind human approval.
 *
 * Supports Groq (default/free), Anthropic (Claude), and OpenAI via unified interface.
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { env } from '../config/env';
import { AIAnalysisSchema, type AIAnalysisOutput } from '../utils/validators';

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

CRITICAL INSTRUCTIONS:
1. Return ONLY the email body text.
2. No subject line, no greeting suggestions outside the body, no meta-commentary.
3. No markdown formatting.`;

// System prompt for inbox summary
const SUMMARY_SYSTEM_PROMPT = `You are an email inbox analyst for a business founder.
Summarize the current state of the inbox in a brief, actionable daily briefing.
Focus on:
- High-priority items requiring immediate attention
- Key pending conversations
- Patterns or trends (many leads? lots of spam?)

CRITICAL INSTRUCTIONS:
1. Keep it under 200 words.
2. Be specific and actionable.
3. Return plain text, not JSON.
4. No markdown formatting.`;

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
   * Analyze an email thread. Returns structured analysis.
   * Limits to 10 most recent messages for performance.
   */
  async analyzeThread(threadData: ThreadData): Promise<AIAnalysisOutput> {
    // Limit to 10 most recent messages
    const recentMessages = threadData.messages.slice(-10);

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

    const response = await this.chat(ANALYSIS_SYSTEM_PROMPT, userMessage);

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

      const retryResponse = await this.chat(ANALYSIS_SYSTEM_PROMPT, retryMessage);
      const retryCleaned = cleanJsonResponse(retryResponse);
      const retryParsed = JSON.parse(retryCleaned);
      const retryValidated = AIAnalysisSchema.parse(retryParsed); // Throws if invalid
      return retryValidated;
    }

    return validated.data;
  }

  /**
   * Generate a draft email from a natural language instruction.
   */
  async generateDraft(options: {
    instruction: string;
    threadContext?: ThreadData;
  }): Promise<string> {
    let userMessage = `Write an email based on this instruction: "${options.instruction}"`;

    if (options.threadContext) {
      const recentMessages = options.threadContext.messages.slice(-5);
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

    return this.chat(DRAFT_SYSTEM_PROMPT, userMessage);
  }

  /**
   * Summarize inbox state for the Command Center daily briefing.
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
    const userMessage = `Here are the current inbox threads (${threads.length} total):

${threads
  .slice(0, 30) // Limit to 30 most recent for summary
  .map(
    (t, i) => `${i + 1}. Subject: ${t.subject}
   Snippet: ${t.snippet}
   Priority: ${t.priority || 'unanalyzed'} | Type: ${t.classification || 'unanalyzed'}
   Messages: ${t.messageCount} | Last activity: ${t.lastMessageAt.toISOString()}
   Read: ${t.isRead ? 'yes' : 'NO'}`
  )
  .join('\n\n')}

Provide a concise daily briefing summary.`;

    return this.chat(SUMMARY_SYSTEM_PROMPT, userMessage);
  }

  /**
   * Core chat method - routes to the configured AI provider.
   */
  private async chat(systemPrompt: string, userMessage: string): Promise<string> {
    if (env.AI_PROVIDER === 'groq' && this.groq) {
      return this.chatGroq(systemPrompt, userMessage);
    } else if (env.AI_PROVIDER === 'anthropic' && this.anthropic) {
      return this.chatAnthropic(systemPrompt, userMessage);
    } else if (env.AI_PROVIDER === 'openai' && this.openai) {
      return this.chatOpenAI(systemPrompt, userMessage);
    }
    throw new Error('No AI provider configured. Set GROQ_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY.');
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
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 2048,
      temperature: 0.3,
    });

    return response.choices[0]?.message?.content || '';
  }
}

// Singleton instance
export const aiService = new AIService();
