/**
 * Compact chat history before sending to Gemini.
 * UI keeps the full transcript; the model only sees recent turns + a local memory blot.
 */

import {
  foldMessagesIntoMemory,
  formatSessionMemoryForLlm,
  normalizeSessionMemory,
  type StructuredSessionMemory,
} from './sessionMemory';
import type { ChatMessage } from './types';

export { foldMessagesIntoMemory };

/** How many recent messages (any role) to send raw. */
export const LLM_RECENT_MESSAGE_LIMIT = 10;

/** Cap stored UI transcript in localStorage. */
export const UI_MESSAGE_SOFT_LIMIT = 80;

/** Cap full tool JSON in the LLM transcript (token budget). */
export const LLM_TOOL_JSON_MAX_CHARS = 12_000;

function shortenAssistant(text: string, max = 400): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function capToolJson(s: string, max = LLM_TOOL_JSON_MAX_CHARS): string {
  if (s.length <= max) return s;
  return JSON.stringify({
    truncated: true,
    preview: s.slice(0, Math.max(0, max - 80)),
  });
}

/**
 * Build the message list Gemini should see: optional memory blot + recent raw messages.
 * Tool rows use full `llmContent` JSON (capped); UI transcript stays summarized.
 */
export function compactMessagesForLlm(
  messages: ChatMessage[],
  opts?: {
    memory?: string | StructuredSessionMemory;
    recentLimit?: number;
  },
): ChatMessage[] {
  const recentLimit = opts?.recentLimit ?? LLM_RECENT_MESSAGE_LIMIT;
  const structured = normalizeSessionMemory(opts?.memory);
  const memory = formatSessionMemoryForLlm(structured).trim();

  if (messages.length <= recentLimit && !memory) {
    return messages.map(slimMessageForLlm);
  }

  const recent = messages.slice(-recentLimit).map(slimMessageForLlm);
  if (!memory) return recent;

  const blot: ChatMessage = {
    id: 'memory-blot',
    role: 'user',
    content:
      'Session memory (structured — goals/plan/tools/canvas/earlier turns; do not repeat verbatim):\n' +
      memory,
  };
  return [blot, ...recent];
}

function slimMessageForLlm(m: ChatMessage): ChatMessage {
  if (m.role === 'assistant') {
    return { ...m, content: shortenAssistant(m.content), llmContent: undefined };
  }
  if (m.role === 'tool') {
    const full = capToolJson(m.llmContent ?? m.content);
    return {
      id: m.id,
      role: 'tool',
      content: full,
      llmContent: full,
      toolName: m.toolName,
      toolOk: m.toolOk,
      toolArgs: m.toolArgs,
    };
  }
  // Drop base64 from prior turns — only the current user message keeps images.
  if (m.role === 'user' && m.attachments?.length) {
    const n = m.attachments.length;
    const note = `(${n} image${n > 1 ? 's' : ''} were attached)`;
    return {
      id: m.id,
      role: 'user',
      content: m.content.trim() ? `${m.content.trim()}\n${note}` : note,
    };
  }
  return m;
}

/** Drop oldest UI messages when the transcript grows too large. */
export function trimUiMessages(messages: ChatMessage[], limit = UI_MESSAGE_SOFT_LIMIT): ChatMessage[] {
  if (messages.length <= limit) return messages;
  return messages.slice(messages.length - limit);
}
