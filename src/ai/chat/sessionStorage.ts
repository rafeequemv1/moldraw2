/** Persist chat transcript + structured session memory (localStorage + IndexedDB). */

import type { ChatMessage, StructuredSessionMemory } from '@moldraw/ai/chat';
import {
  createEmptySessionMemory,
  normalizeSessionMemory,
} from '@moldraw/ai/chat';
import { idbClearChatSession, idbLoadChatSession, idbSaveChatSession } from './sessionIdb';

const STORAGE_KEY = 'moldraw.ai.chat-session-v2';
/** Migrate folded-string sessions from v1. */
const LEGACY_STORAGE_KEY = 'moldraw.ai.chat-session-v1';
const UI_SOFT_LIMIT = 80;
const LLM_CONTENT_PERSIST_MAX = 4000;

export interface PersistedChatSession {
  messages: ChatMessage[];
  /**
   * Structured goals / pending plan / last tools / prefs / canvas fingerprint.
   * Legacy string blot is migrated into `foldNotes`.
   */
  structured: StructuredSessionMemory;
  /**
   * @deprecated Prefer `structured`. Kept for one-release migration / tools that
   * still read a string blot.
   */
  memory: string;
  updatedAt: number;
}

const EMPTY: PersistedChatSession = {
  messages: [],
  structured: createEmptySessionMemory(),
  memory: '',
  updatedAt: 0,
};

function trimMessages(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length <= UI_SOFT_LIMIT) return messages;
  return messages.slice(messages.length - UI_SOFT_LIMIT);
}

function capLlmContent(s: string | undefined): string | undefined {
  if (!s) return undefined;
  if (s.length <= LLM_CONTENT_PERSIST_MAX) return s;
  return JSON.stringify({
    truncated: true,
    preview: s.slice(0, LLM_CONTENT_PERSIST_MAX - 80),
  });
}

/** Strip base64 attachments and cap tool JSON so storage stays under quota. */
function slimForStorage(messages: ChatMessage[]): ChatMessage[] {
  return messages.map(m => {
    let next: ChatMessage = m;
    if (m.attachments?.length) {
      const n = m.attachments.length;
      const note = `(${n} image${n > 1 ? 's' : ''} attached)`;
      next = {
        id: m.id,
        role: m.role,
        content: m.content.trim() ? m.content : note,
        ...(m.llmContent != null ? { llmContent: m.llmContent } : {}),
        ...(m.toolArgs !== undefined ? { toolArgs: m.toolArgs } : {}),
        ...(m.toolName != null ? { toolName: m.toolName } : {}),
        ...(m.toolOk != null ? { toolOk: m.toolOk } : {}),
        ...(m.focusAtomIds ? { focusAtomIds: m.focusAtomIds } : {}),
        ...(m.focusBounds ? { focusBounds: m.focusBounds } : {}),
        ...(m.focusLabel != null ? { focusLabel: m.focusLabel } : {}),
      };
    }
    if (next.role === 'tool' && next.llmContent) {
      const capped = capLlmContent(next.llmContent);
      next = { ...next, llmContent: capped };
    }
    return next;
  });
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object') return false;
  const m = value as Record<string, unknown>;
  return (
    typeof m.id === 'string' &&
    typeof m.content === 'string' &&
    (m.role === 'user' || m.role === 'assistant' || m.role === 'tool')
  );
}

function coerceSession(parsed: Partial<PersistedChatSession> & { memory?: unknown }): PersistedChatSession {
  const messages = Array.isArray(parsed.messages)
    ? parsed.messages.filter(isChatMessage)
    : [];
  const structured = normalizeSessionMemory(
    parsed.structured ??
      (typeof parsed.memory === 'string' ? parsed.memory : undefined),
  );
  return {
    messages: trimMessages(messages),
    structured,
    memory: structured.foldNotes,
    updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
  };
}

export function loadChatSession(): PersistedChatSession {
  if (typeof window === 'undefined') return { ...EMPTY, structured: createEmptySessionMemory() };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return coerceSession(JSON.parse(raw) as Partial<PersistedChatSession>);
    }
    // One-time migrate from v1 (string memory only).
    const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      const migrated = coerceSession(JSON.parse(legacy) as Partial<PersistedChatSession>);
      saveChatSession({ messages: migrated.messages, structured: migrated.structured });
      try {
        window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      } catch {
        /* ignore */
      }
      return migrated;
    }
    return { ...EMPTY, structured: createEmptySessionMemory() };
  } catch {
    return { ...EMPTY, structured: createEmptySessionMemory() };
  }
}

/** Async hydrate when localStorage was empty but IndexedDB has a backup. */
export async function loadChatSessionAsync(): Promise<PersistedChatSession> {
  const fromLs = loadChatSession();
  if (fromLs.messages.length > 0 || fromLs.structured.foldNotes || fromLs.structured.goals.length) {
    return fromLs;
  }
  const fromIdb = await idbLoadChatSession();
  if (!fromIdb) return fromLs;
  return coerceSession(fromIdb);
}

export function saveChatSession(session: {
  messages: ChatMessage[];
  structured: StructuredSessionMemory;
}): void {
  if (typeof window === 'undefined') return;
  const structured = normalizeSessionMemory(session.structured);
  const payload: PersistedChatSession = {
    messages: slimForStorage(trimMessages(session.messages)),
    structured,
    memory: structured.foldNotes.slice(-2000),
    updatedAt: Date.now(),
  };

  const writeLs = (body: PersistedChatSession) => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(body));
  };

  try {
    writeLs(payload);
  } catch {
    // quota — drop llmContent, then shrink transcript
    try {
      const stripToolPayload = (m: ChatMessage): ChatMessage => {
        if (m.role !== 'tool') return m;
        return {
          id: m.id,
          role: 'tool',
          content: m.content,
          toolName: m.toolName,
          toolOk: m.toolOk,
          ...(m.focusAtomIds ? { focusAtomIds: m.focusAtomIds } : {}),
          ...(m.focusBounds ? { focusBounds: m.focusBounds } : {}),
          ...(m.focusLabel != null ? { focusLabel: m.focusLabel } : {}),
        };
      };
      const stripped: PersistedChatSession = {
        ...payload,
        messages: payload.messages.map(stripToolPayload),
      };
      writeLs(stripped);
    } catch {
      try {
        writeLs({
          messages: slimForStorage(trimMessages(session.messages))
            .slice(-40)
            .map(m => {
              if (m.role !== 'tool') return m;
              return {
                id: m.id,
                role: 'tool' as const,
                content: m.content,
                toolName: m.toolName,
                toolOk: m.toolOk,
              };
            }),
          structured: {
            ...structured,
            foldNotes: structured.foldNotes.slice(-800),
          },
          memory: structured.foldNotes.slice(-800),
          updatedAt: Date.now(),
        });
      } catch {
        /* ignore */
      }
    }
  }

  void idbSaveChatSession(payload);
}

export function clearChatSession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  void idbClearChatSession();
}
