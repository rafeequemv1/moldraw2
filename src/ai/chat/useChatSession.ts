import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AiExecutionContext } from '@moldraw/ai';
import {
  createEmptySessionMemory,
  formatChatError,
  normalizeSessionMemory,
  runChatTurn,
  trimUiMessages,
  MOLDRAW_CHAT_MODELS,
  resolveGeminiModelId,
  type ChatImageAttachment,
  type ChatMessage,
  type ChatProgressEvent,
  type ChatProviderId,
  type DiagramLayoutMode,
  type FormattedChatError,
  type GeminiModelInfo,
  type StructuredSessionMemory,
} from '@moldraw/ai/chat';
import { loadAiSecrets, updateGeminiModel } from './secretsStorage';
import {
  clearChatSession,
  loadChatSession,
  loadChatSessionAsync,
  saveChatSession,
} from './sessionStorage';

export type { DiagramLayoutMode };

export interface UseChatSessionOptions {
  providerId?: ChatProviderId;
  aiCtx: AiExecutionContext;
  getApiKey?: () => string;
  /** Override model id (otherwise uses saved geminiModel / default Flash). */
  model?: string;
  /** Chat Diagram toggle: glassware steps / reaction scheme / both. */
  diagramLayoutMode?: DiagramLayoutMode;
}

export function useChatSession(options: UseChatSessionOptions) {
  const { providerId = 'gemini', aiCtx, getApiKey, diagramLayoutMode = 'both' } = options;
  const initial = useMemo(() => loadChatSession(), []);
  const [messages, setMessages] = useState<ChatMessage[]>(() => initial.messages);
  const [sessionMemory, setSessionMemory] = useState<StructuredSessionMemory>(() =>
    normalizeSessionMemory(initial.structured),
  );
  const [isLoading, setIsLoading] = useState(false);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  /** Soft human steps for optional “Show steps” (never raw tool ids). */
  const [progressSteps, setProgressSteps] = useState<string[]>([]);
  const [error, setError] = useState<FormattedChatError | null>(null);
  const [modelId, setModelIdState] = useState(() =>
    resolveGeminiModelId(options.model ?? loadAiSecrets().geminiModel),
  );

  const apiKey = useMemo(
    () => (getApiKey ? getApiKey() : loadAiSecrets().geminiApiKey),
    [getApiKey],
  );

  const hasApiKey = apiKey.length > 0;
  const chatModels: readonly GeminiModelInfo[] = MOLDRAW_CHAT_MODELS;

  const setModelId = useCallback((id: string) => {
    const resolved = resolveGeminiModelId(id);
    setModelIdState(resolved);
    updateGeminiModel(resolved);
  }, []);

  // Hydrate from IndexedDB if localStorage was empty.
  useEffect(() => {
    let cancelled = false;
    void loadChatSessionAsync().then(session => {
      if (cancelled) return;
      if (session.messages.length === 0 && !session.structured.foldNotes) return;
      setMessages(prev => (prev.length > 0 ? prev : session.messages));
      setSessionMemory(prev =>
        prev.foldNotes || prev.goals.length || prev.lastTools.length
          ? prev
          : normalizeSessionMemory(session.structured),
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist transcript + structured memory locally after each change (when idle).
  useEffect(() => {
    if (isLoading) return;
    saveChatSession({ messages, structured: sessionMemory });
  }, [messages, sessionMemory, isLoading]);

  const pushStep = useCallback((step: string) => {
    const t = step.trim();
    if (!t || /molecule\.|command\./i.test(t)) return;
    setProgressSteps(prev => (prev[prev.length - 1] === t ? prev : [...prev, t].slice(-12)));
  }, []);

  const handleProgress = useCallback(
    (event: ChatProgressEvent) => {
      // Status line always stays “Working…” — details go under Show steps.
      setProgressLabel('Working…');
      if (event.phase === 'thinking') {
        const detail = event.detail?.trim();
        if (detail && detail !== 'Thinking…' && detail !== 'Working…') pushStep(detail);
        return;
      }
      if (event.phase === 'tool_start') {
        pushStep(event.label);
        return;
      }
      if (!event.ok) pushStep('Trying another approach…');
    },
    [pushStep],
  );

  const clearError = useCallback(() => setError(null), []);

  const sendUserMessage = useCallback(
    async (text: string, attachments?: ChatImageAttachment[]) => {
      const trimmed = text.trim();
      const imgs = attachments?.filter(a => a.dataUrl) ?? [];
      if ((!trimmed && imgs.length === 0) || isLoading) return;

      if (!apiKey) {
        setError({
          message: 'Paste a Gemini API key in the panel above or in Settings → AI.',
        });
        return;
      }

      setError(null);
      setIsLoading(true);
      setProgressLabel('Working…');
      setProgressSteps(imgs.length ? ['Reading image(s)…'] : []);

      const defaultPrompt =
        'Draw the chemical structure(s) from the attached image(s) on the canvas.';
      const userMsg: ChatMessage = {
        id: `msg-${Date.now()}-user`,
        role: 'user',
        content: trimmed || (imgs.length ? defaultPrompt : ''),
        ...(imgs.length ? { attachments: imgs } : {}),
      };
      setMessages(prev => trimUiMessages([...prev, userMsg]));

      try {
        const result = await runChatTurn({
          providerId,
          apiKey,
          model: modelId,
          messages,
          userText: trimmed,
          attachments: imgs,
          aiCtx,
          sessionMemory,
          diagramLayoutMode,
          onProgress: handleProgress,
          onToolMessage: msg => {
            setMessages(prev => trimUiMessages([...prev, msg]));
          },
        });
        setSessionMemory(result.sessionMemory);
        const assistant = result.newMessages.find(m => m.role === 'assistant');
        if (assistant) {
          setMessages(prev => trimUiMessages([...prev, assistant]));
        }
      } catch (e) {
        setError(formatChatError(e));
      } finally {
        setIsLoading(false);
        setProgressLabel(null);
        setProgressSteps([]);
      }
    },
    [
      apiKey,
      aiCtx,
      diagramLayoutMode,
      handleProgress,
      isLoading,
      messages,
      modelId,
      providerId,
      sessionMemory,
    ],
  );

  const clearChat = useCallback(() => {
    setMessages([]);
    setSessionMemory(createEmptySessionMemory());
    setError(null);
    setProgressLabel(null);
    setProgressSteps([]);
    clearChatSession();
  }, []);

  return {
    messages,
    isLoading,
    progressLabel,
    progressSteps,
    error,
    hasApiKey,
    modelId,
    setModelId,
    chatModels,
    sendUserMessage,
    clearChat,
    clearError,
  };
}
