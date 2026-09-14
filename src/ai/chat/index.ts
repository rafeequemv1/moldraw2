export type {
  ChatMessage,
  ChatFocusBounds,
  ChatProviderId,
  ChatRole,
  ChatTurnResult,
  LlmToolDefinition,
} from '@moldraw/ai/chat';
export { buildLlmToolsFromRegistry, runToolCall, formatToolSummary } from '@moldraw/ai/chat';
export {
  runChatTurn,
  type RunChatTurnInput,
  type ChatTurnResultWithMemory,
  createEmptySessionMemory,
  normalizeSessionMemory,
  type StructuredSessionMemory,
} from '@moldraw/ai/chat';
export {
  compactMessagesForLlm,
  trimUiMessages,
  classifyChatIntent,
  buildLlmToolsForIntent,
} from '@moldraw/ai/chat';
export {
  loadChatSession,
  loadChatSessionAsync,
  saveChatSession,
  clearChatSession,
} from './sessionStorage';
export { getChatProvider, geminiProvider, GEMINI_DEFAULT_MODEL } from '@moldraw/ai/chat';
export {
  loadAiSecrets,
  saveAiSecrets,
  updateGeminiApiKey,
  updateGeminiModel,
  clearGeminiApiKey,
  hasGeminiApiKey,
  type AiSecrets,
} from './secretsStorage';
export {
  useChatSession,
  type UseChatSessionOptions,
  type DiagramLayoutMode,
} from './useChatSession';
export { CHAT_PRESET_PILLS, type ChatPresetPill } from './presets';
export {
  MAX_CHAT_IMAGES,
  blobToChatAttachment,
  imageBlobsFromDataTransfer,
  isChatImageMime,
} from './imageAttachments';
export type { ChatImageAttachment } from '@moldraw/ai/chat';
