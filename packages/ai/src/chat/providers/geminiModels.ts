/**
 * Gemini models available in Moldraw chat.
 * Flash = fast/cheap; Pro = better chemistry / accurate SMILES for reaction schemes.
 */

export const GEMINI_DEFAULT_MODEL = 'gemini-2.5-flash';

/** Recommended for multi-step schemes and accurate SMILES. */
export const GEMINI_RECOMMENDED_SCHEME_MODEL = 'gemini-3.1-pro-preview';

/** @deprecated Alias for older imports. */
export const MOLDRAW_PREFERRED_MODEL = GEMINI_DEFAULT_MODEL;

/** @deprecated Alias for older imports. */
export const GEMINI_FALLBACK_MODEL = GEMINI_DEFAULT_MODEL;

export interface GeminiModelInfo {
  id: string;
  displayName: string;
  /** Hint shown in the picker (e.g. best for schemes). */
  hint?: string;
  tier: 'flash' | 'pro';
}

/**
 * Curated allowlist — ids Google currently serves for generateContent.
 * Keep this short: only models that work for new API keys.
 */
export const MOLDRAW_CHAT_MODELS: readonly GeminiModelInfo[] = [
  {
    id: 'gemini-2.5-flash',
    displayName: '2.5 Flash',
    hint: 'Fast · default',
    tier: 'flash',
  },
  {
    id: 'gemini-3.1-pro-preview',
    displayName: '3.1 Pro',
    hint: 'Best for reactions & SMILES',
    tier: 'pro',
  },
] as const;

const ALLOWED = new Set(MOLDRAW_CHAT_MODELS.map(m => m.id));

/** Map stale / removed ids to a current allowlisted model. */
export function resolveGeminiModelId(requested?: string | null): string {
  const id = (requested ?? '').trim();
  if (id && ALLOWED.has(id)) return id;
  // Common legacy aliases (2.5 Pro is no longer available to new users)
  if (
    id.includes('3.1-pro') ||
    id.includes('3-pro') ||
    id.includes('2.5-pro') ||
    id === 'gemini-pro' ||
    id.includes('1.5-pro') ||
    id.includes('pro')
  ) {
    return GEMINI_RECOMMENDED_SCHEME_MODEL;
  }
  if (id.includes('flash') || id.includes('1.5')) {
    return GEMINI_DEFAULT_MODEL;
  }
  return GEMINI_DEFAULT_MODEL;
}

export function isGeminiProModel(modelId: string): boolean {
  const m = MOLDRAW_CHAT_MODELS.find(x => x.id === modelId);
  return m?.tier === 'pro';
}

/** Static list for the chat picker (API key unused). */
export async function listGeminiModels(_apiKey: string): Promise<GeminiModelInfo[]> {
  return [...MOLDRAW_CHAT_MODELS];
}
