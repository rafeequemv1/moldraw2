/** localStorage key for AI secrets (not part of exportable AppSettings). */
const STORAGE_KEY = 'moldraw.ai.secrets';

export interface AiSecrets {
  geminiApiKey: string;
  /** Preferred Gemini model id ('' = provider default). */
  geminiModel: string;
}

const DEFAULT_SECRETS: AiSecrets = {
  geminiApiKey: '',
  geminiModel: '',
};

export function loadAiSecrets(): AiSecrets {
  if (typeof window === 'undefined') return { ...DEFAULT_SECRETS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SECRETS };
    const parsed = JSON.parse(raw) as Partial<AiSecrets>;
    return {
      geminiApiKey: typeof parsed.geminiApiKey === 'string' ? parsed.geminiApiKey : '',
      geminiModel: typeof parsed.geminiModel === 'string' ? parsed.geminiModel : '',
    };
  } catch {
    return { ...DEFAULT_SECRETS };
  }
}

export function saveAiSecrets(secrets: AiSecrets): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(secrets));
}

export function updateGeminiApiKey(key: string): AiSecrets {
  const next = { ...loadAiSecrets(), geminiApiKey: key.trim() };
  saveAiSecrets(next);
  return next;
}

export function clearGeminiApiKey(): AiSecrets {
  return updateGeminiApiKey('');
}

export function updateGeminiModel(model: string): AiSecrets {
  const next = { ...loadAiSecrets(), geminiModel: model.trim() };
  saveAiSecrets(next);
  return next;
}

export function hasGeminiApiKey(): boolean {
  return loadAiSecrets().geminiApiKey.length > 0;
}
