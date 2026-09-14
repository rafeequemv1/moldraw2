/**
 * Headless chat helpers (LLM tool bridge + Gemini provider). App owns UI/secrets.
 */
export type {
  ChatMessage,
  ChatImageAttachment,
  ChatFocusBounds,
  ChatProviderId,
  ChatRole,
  ChatTurnResult,
  LlmToolDefinition,
} from './types';
export {
  buildLlmToolsFromRegistry,
  buildLlmToolsForChat,
  buildLlmToolsForIntent,
  buildLlmToolsForUserText,
  userRequestsCanvasEdit,
  classifyChatIntent,
  extractChatFocusTarget,
  runToolCall,
  formatToolSummary,
  formatToolProgressLabel,
} from './toolBridge';
export type { ChatIntent } from './intentRouter';
export {
  compactMessagesForLlm,
  foldMessagesIntoMemory,
  trimUiMessages,
  LLM_RECENT_MESSAGE_LIMIT,
  UI_MESSAGE_SOFT_LIMIT,
} from './compactHistory';
export {
  createEmptySessionMemory,
  normalizeSessionMemory,
  formatSessionMemoryForLlm,
  updateSessionMemoryAfterTurn,
  type StructuredSessionMemory,
  type SessionToolMemoryEntry,
} from './sessionMemory';
export {
  buildCanvasPreambleFingerprint,
  formatCanvasPreambleForLlm,
  type CanvasPreambleFingerprint,
} from './canvasPreamble';
export {
  runChatTurn,
  type RunChatTurnInput,
  type ChatTurnResultWithMemory,
  type DiagramLayoutMode,
} from './runChatTurn';
export { getChatProvider, geminiProvider, GEMINI_DEFAULT_MODEL } from './providers';
export type { ChatProgressEvent } from './providers/types';
export {
  listGeminiModels,
  type GeminiModelInfo,
  MOLDRAW_CHAT_MODELS,
  MOLDRAW_PREFERRED_MODEL,
  GEMINI_RECOMMENDED_SCHEME_MODEL,
  resolveGeminiModelId,
  isGeminiProModel,
} from './providers/geminiModels';
export { formatChatError, type FormattedChatError } from './formatChatError';
export { generateStructuredJson, type GenerateStructuredJsonOptions } from './generateStructured';
