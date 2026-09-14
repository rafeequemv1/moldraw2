import type { AiExecutionContext } from '../types';
import {
  buildCanvasPreambleFingerprint,
  formatCanvasPreambleForLlm,
} from './canvasPreamble';
import { getChatProvider } from './providers';
import type { ChatProgressEvent } from './providers/types';
import {
  compactMessagesForLlm,
  LLM_RECENT_MESSAGE_LIMIT,
} from './compactHistory';
import { classifyChatIntent } from './intentRouter';
import {
  enforceDiagramLayoutToolCall,
  type DiagramLayoutMode,
} from './diagramLayoutEnforce';
import {
  normalizeSessionMemory,
  updateSessionMemoryAfterTurn,
  type StructuredSessionMemory,
} from './sessionMemory';
import {
  buildLlmToolsForIntent,
  extractChatFocusTarget,
  formatToolSummary,
  runToolCall,
} from './toolBridge';
import type { ChatImageAttachment, ChatMessage, ChatProviderId, ChatTurnResult } from './types';

export type { DiagramLayoutMode } from './diagramLayoutEnforce';
export type { StructuredSessionMemory } from './sessionMemory';

function newMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Cap persisted tool JSON so localStorage stays under quota. */
const PERSIST_TOOL_JSON_MAX = 6000;

function capPersistedToolJson(s: string): string {
  if (s.length <= PERSIST_TOOL_JSON_MAX) return s;
  return JSON.stringify({
    truncated: true,
    preview: s.slice(0, PERSIST_TOOL_JSON_MAX - 80),
  });
}

/**
 * UI gets a short summary in `content`; full tool JSON stays in `llmContent`
 * for subsequent Gemini history turns.
 */
function summarizeToolMessage(raw: ChatMessage): ChatMessage {
  const fullJson = raw.llmContent ?? raw.content;
  let errDetail: string | undefined;
  if (raw.toolOk === false && fullJson) {
    try {
      const parsed = JSON.parse(fullJson) as { error?: string };
      errDetail = typeof parsed.error === 'string' ? parsed.error : undefined;
    } catch {
      /* ignore */
    }
  }
  const focus =
    raw.toolOk !== false ? extractChatFocusTarget(fullJson, raw.toolName) : undefined;
  return {
    ...raw,
    ...focus,
    llmContent: capPersistedToolJson(fullJson),
    content: raw.toolName
      ? formatToolSummary(raw.toolName, raw.toolOk ?? false, errDetail)
      : raw.content,
  };
}

export interface RunChatTurnInput {
  providerId: ChatProviderId;
  apiKey: string;
  /** Model id (provider default when omitted). */
  model?: string;
  messages: ChatMessage[];
  userText: string;
  /** Optional images attached to this user turn (vision). */
  attachments?: ChatImageAttachment[];
  aiCtx: AiExecutionContext;
  maxToolRounds?: number;
  /**
   * Structured session memory (or legacy string blot). Updated every turn and
   * returned for persistence.
   */
  sessionMemory?: StructuredSessionMemory | string;
  /** Live thinking / tool progress for the chat UI. */
  onProgress?: (event: ChatProgressEvent) => void;
  /** Append each tool result to the transcript as it finishes (before the final reply). */
  onToolMessage?: (message: ChatMessage) => void;
  /** Chat Diagram toggle — glassware steps / reaction scheme / both. */
  diagramLayoutMode?: DiagramLayoutMode;
}

export interface ChatTurnResultWithMemory extends ChatTurnResult {
  /** Updated structured memory after the turn (persist in localStorage / IDB). */
  sessionMemory: StructuredSessionMemory;
  /** Intent used for tool subset (debug / UI). */
  intent: string;
  /** How many tools were exposed this turn. */
  toolCount: number;
}

/**
 * Append user message, run provider + tool loop, return assistant reply and
 * intermediate tool messages for the transcript.
 *
 * Sends Gemini: intent-scoped tools + compacted history (recent + memory blot)
 * + live canvas preamble. UI still receives summarized tool rows.
 */
export async function runChatTurn(input: RunChatTurnInput): Promise<ChatTurnResultWithMemory> {
  const {
    providerId,
    apiKey,
    model,
    messages,
    userText,
    attachments,
    aiCtx,
    maxToolRounds = 8,
    sessionMemory,
    onProgress,
    onToolMessage,
    diagramLayoutMode = 'both',
  } = input;

  aiCtx.diagramLayoutMode = diagramLayoutMode;

  let nextMemory = normalizeSessionMemory(sessionMemory);

  const trimmed = userText.trim();
  const imgs = (attachments ?? []).filter(a => a.dataUrl && a.mimeType.startsWith('image/'));
  const defaultImagePrompt =
    'Draw the chemical structure(s) from the attached image(s) on the canvas.';
  const content = trimmed || (imgs.length ? defaultImagePrompt : '');
  if (!content && imgs.length === 0) {
    return {
      assistantText: '',
      sessionMemory: nextMemory,
      intent: 'general',
      toolCount: 0,
      newMessages: [],
    };
  }

  const userMsg: ChatMessage = {
    id: newMessageId(),
    role: 'user',
    content,
    ...(imgs.length ? { attachments: imgs } : {}),
  };

  const intent = classifyChatIntent(content, { hasImages: imgs.length > 0 });
  const tools = buildLlmToolsForIntent(intent);

  // Fold anything that will fall out of the recent window into memory.
  const overflow =
    messages.length > LLM_RECENT_MESSAGE_LIMIT
      ? messages.slice(0, messages.length - LLM_RECENT_MESSAGE_LIMIT)
      : [];
  if (overflow.length) {
    nextMemory = updateSessionMemoryAfterTurn(nextMemory, {
      overflow,
      userText: '',
      assistantText: '',
      toolMessages: [],
    });
  }

  const canvasFp = buildCanvasPreambleFingerprint(aiCtx);
  nextMemory = {
    ...nextMemory,
    canvas: canvasFp,
    prefs: { ...nextMemory.prefs, diagramLayoutMode },
    updatedAt: Date.now(),
  };

  const llmHistory = compactMessagesForLlm(messages, {
    memory: nextMemory,
    recentLimit: LLM_RECENT_MESSAGE_LIMIT,
  });
  const transcriptForLlm = [...llmHistory, userMsg];

  const provider = getChatProvider(providerId);
  const streamedTools = Boolean(onToolMessage);

  onProgress?.({
    phase: 'thinking',
    detail: `Planning (${intent}, ${tools.length} tools)…`,
  });

  const diagramSuffix =
    `Diagram toggle (user): layoutMode=${diagramLayoutMode}. CRITICAL: honor this toggle. ` +
    (diagramLayoutMode === 'glassware'
      ? 'MUST call molecule.build_lab_manual with steps[] (glassware only). Do NOT call molecule.build_reaction_scheme. '
      : diagramLayoutMode === 'scheme'
        ? 'Reaction scheme only — molecule.build_reaction_scheme or build_lab_manual layoutMode:scheme. '
        : 'MUST call molecule.build_lab_manual with steps[] AND compounds[] (apparatus on top, scheme below). Do NOT call molecule.build_reaction_scheme alone — glassware is required. ') +
    'Always pass layoutMode matching the toggle.';

  const canvasPreamble = formatCanvasPreambleForLlm(aiCtx);
  const systemInstructionSuffix = `${diagramSuffix}\n\n${canvasPreamble}`;

  const { assistantText, toolMessages } = await provider.chat({
    apiKey,
    model,
    messages: transcriptForLlm,
    tools,
    maxToolRounds,
    systemInstructionSuffix,
    onProgress,
    onToolMessage: streamedTools
      ? raw => {
          onToolMessage!(summarizeToolMessage(raw));
        }
      : undefined,
    onToolCall: async (name, args) => {
      const enforced = enforceDiagramLayoutToolCall(name, args, diagramLayoutMode);
      return runToolCall(enforced.name, enforced.args, aiCtx);
    },
  });

  const summaryMessages: ChatMessage[] = streamedTools
    ? []
    : toolMessages.map(tm => summarizeToolMessage(tm));

  const assistantMsg: ChatMessage = {
    id: newMessageId(),
    role: 'assistant',
    content: assistantText,
  };

  // Refresh structured memory with this turn's outcomes + post-tool canvas.
  nextMemory = updateSessionMemoryAfterTurn(nextMemory, {
    userText: content,
    assistantText,
    toolMessages: streamedTools
      ? toolMessages.map(summarizeToolMessage)
      : summaryMessages,
    diagramLayoutMode,
    canvas: buildCanvasPreambleFingerprint(aiCtx),
  });

  return {
    assistantText,
    sessionMemory: nextMemory,
    intent,
    toolCount: tools.length,
    newMessages: streamedTools
      ? [userMsg, assistantMsg]
      : [userMsg, ...summaryMessages, assistantMsg],
  };
}
