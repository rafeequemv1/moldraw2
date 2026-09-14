import type { ChatProviderId } from '../types';
import { geminiProvider } from './gemini';
import type { ChatProvider } from './types';

const PROVIDERS: Record<ChatProviderId, ChatProvider> = {
  gemini: geminiProvider,
};

export function getChatProvider(id: ChatProviderId): ChatProvider {
  const p = PROVIDERS[id];
  if (!p) throw new Error(`Unknown chat provider: ${id}`);
  return p;
}

export { geminiProvider, GEMINI_DEFAULT_MODEL } from './gemini';
export type { ChatProvider, ChatProviderParams, ChatProviderResult } from './types';
