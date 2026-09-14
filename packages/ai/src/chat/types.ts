/** Supported chat LLM backends (extend when adding providers). */
export type ChatProviderId = 'gemini';

export type ChatRole = 'user' | 'assistant' | 'tool';

/** World AABB for focusing the canvas when atom ids are unavailable. */
export interface ChatFocusBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Image attached to a user chat message (vision / “draw this”). */
export interface ChatImageAttachment {
  id: string;
  /** e.g. image/png, image/jpeg, image/webp */
  mimeType: string;
  /** data:<mime>;base64,… — preview + Gemini inlineData */
  dataUrl: string;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  /**
   * Display text for the UI bubble. For `tool` rows this is usually a short
   * summary; the model sees `llmContent` (full JSON) when present.
   */
  content: string;
  /**
   * Full tool result JSON for Gemini history. When set, providers must prefer
   * this over `content` so the UI can stay summarized without starving context.
   */
  llmContent?: string;
  /** Tool call arguments (for continuity / repair). */
  toolArgs?: unknown;
  /** User-attached images (multimodal). Omitted for assistant/tool. */
  attachments?: ChatImageAttachment[];
  /** Tool name when role is `tool` (maps to AI tool id). */
  toolName?: string;
  /** Whether a tool call succeeded (for UI summaries). */
  toolOk?: boolean;
  /**
   * Atom ids added/touched by a successful tool — used for “show on canvas”
   * cards that pan/zoom and select the result.
   */
  focusAtomIds?: string[];
  /** Optional world bounds when focusing non-atom content (schemes, etc.). */
  focusBounds?: ChatFocusBounds;
  /** Short label for the focus card (e.g. “Benzene ring”). */
  focusLabel?: string;
}

export interface LlmToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ChatTurnResult {
  assistantText: string;
  newMessages: ChatMessage[];
}

export interface RunChatTurnOptions {
  providerId: ChatProviderId;
  apiKey: string;
  messages: ChatMessage[];
  onToolCall: (toolId: string, args: unknown) => Promise<unknown>;
  tools: LlmToolDefinition[];
  maxToolRounds?: number;
}
