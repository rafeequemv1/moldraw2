import type { ChatMessage, LlmToolDefinition } from '../types';

/** Live progress while the model thinks or runs tools (PubChem, scheme build, …). */
export type ChatProgressEvent =
  | { phase: 'thinking'; detail?: string }
  | { phase: 'tool_start'; toolName: string; label: string }
  | { phase: 'tool_end'; toolName: string; label: string; ok: boolean };

export interface ChatProviderParams {
  apiKey: string;
  /** Model id to use (provider default when omitted). */
  model?: string;
  messages: ChatMessage[];
  tools: LlmToolDefinition[];
  onToolCall: (name: string, args: unknown) => Promise<unknown>;
  maxToolRounds: number;
  /** Optional step-by-step status for the chat UI. */
  onProgress?: (event: ChatProgressEvent) => void;
  /** Fired after each tool finishes (for live transcript rows). */
  onToolMessage?: (message: ChatMessage) => void;
  /** Appended to the fixed system instruction (e.g. diagram layout toggle). */
  systemInstructionSuffix?: string;
}

export interface ChatProviderResult {
  assistantText: string;
  toolMessages: ChatMessage[];
}

export interface ChatProvider {
  id: string;
  chat(params: ChatProviderParams): Promise<ChatProviderResult>;
}
