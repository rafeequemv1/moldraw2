/**
 * Left-docked AI chat — minimal modern composer with image attach, optional
 * diagram layout, preset pills, and a queued-message list (edit / delete / send).
 */
import { useRef, useEffect, useState, useCallback } from 'react';
import {
  Bot,
  Check,
  ChevronDown,
  ImagePlus,
  ListOrdered,
  Pencil,
  Plus,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatFocusBounds, ChatImageAttachment, ChatMessage } from '@moldraw/ai/chat';
import { isGeminiProModel } from '@moldraw/ai/chat';
import {
  CHAT_PRESET_PILLS,
  MAX_CHAT_IMAGES,
  blobToChatAttachment,
  imageBlobsFromDataTransfer,
  useChatSession,
  type DiagramLayoutMode,
} from '../../ai/chat';
import type { AiExecutionContext } from '@moldraw/ai';

type QueuedChat = { id: string; text: string };

function AssistantMarkdown({ text }: { text: string }) {
  return (
    <div className="chat-panel__md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="chat-panel__md-table-wrap">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

function toolHasFocusTarget(m: ChatMessage): boolean {
  return Boolean(m.toolOk && (m.focusAtomIds?.length || m.focusBounds));
}

/** Focus tools that ran after the previous user/assistant turn, attached under the reply. */
function focusToolsBefore(messages: ChatMessage[], assistantIndex: number): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (let i = assistantIndex - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role === 'user' || m.role === 'assistant') break;
    if (m.role === 'tool' && toolHasFocusTarget(m)) out.unshift(m);
  }
  return out;
}

function CanvasFocusLink({
  message,
  onFocus,
}: {
  message: ChatMessage;
  onFocus: (target: { atomIds?: string[]; bounds?: ChatFocusBounds }) => void;
}) {
  return (
    <button
      type="button"
      className="chat-panel__focus-link"
      onClick={() =>
        onFocus({
          atomIds: message.focusAtomIds,
          bounds: message.focusBounds,
        })
      }
    >
      {message.focusLabel ? `Show on canvas · ${message.focusLabel}` : 'Show on canvas'}
    </button>
  );
}

export interface ChatPanelProps {
  aiCtx: AiExecutionContext;
  getApiKey: () => string;
  onOpenSettings: () => void;
  onSaveApiKey?: (key: string) => void;
  onFocusCanvas?: (target: { atomIds?: string[]; bounds?: ChatFocusBounds }) => void;
}

export function ChatPanel({
  aiCtx,
  getApiKey,
  onOpenSettings,
  onSaveApiKey,
  onFocusCanvas,
}: ChatPanelProps) {
  const [draft, setDraft] = useState('');
  const [keyDraft, setKeyDraft] = useState('');
  const [pendingImages, setPendingImages] = useState<ChatImageAttachment[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [diagramLayoutMode, setDiagramLayoutMode] = useState<DiagramLayoutMode>('both');
  const [showDiagramOptions, setShowDiagramOptions] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [queue, setQueue] = useState<QueuedChat[]>([]);
  const [editingQueueId, setEditingQueueId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const plusWrapRef = useRef<HTMLDivElement>(null);
  const {
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
  } = useChatSession({ aiCtx, getApiKey, diagramLayoutMode });

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isLoading, progressLabel, progressSteps]);

  useEffect(() => {
    if (!plusOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (plusWrapRef.current && !plusWrapRef.current.contains(e.target as Node)) {
        setPlusOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [plusOpen]);

  const addImageBlobs = useCallback(async (blobs: Blob[]) => {
    if (!blobs.length) return;
    setAttachError(null);
    const room = MAX_CHAT_IMAGES - pendingImages.length;
    if (room <= 0) {
      setAttachError(`Up to ${MAX_CHAT_IMAGES} images per message.`);
      return;
    }
    const take = blobs.slice(0, room);
    try {
      const next = await Promise.all(take.map(b => blobToChatAttachment(b)));
      setPendingImages(prev => [...prev, ...next].slice(0, MAX_CHAT_IMAGES));
      if (blobs.length > room) {
        setAttachError(`Only ${MAX_CHAT_IMAGES} images allowed — extra files skipped.`);
      }
    } catch (e) {
      setAttachError(e instanceof Error ? e.message : 'Could not read image');
    }
  }, [pendingImages.length]);

  const removePendingImage = useCallback((id: string) => {
    setPendingImages(prev => prev.filter(a => a.id !== id));
    setAttachError(null);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim() && pendingImages.length === 0) return;
    const imgs = pendingImages;
    void sendUserMessage(draft, imgs);
    setDraft('');
    setPendingImages([]);
    setAttachError(null);
  };

  const handlePreset = (prompt: string) => {
    if (!hasApiKey || isLoading) return;
    void sendUserMessage(prompt, pendingImages.length ? pendingImages : undefined);
    setPendingImages([]);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const blobs = imageBlobsFromDataTransfer(e.clipboardData);
    if (!blobs.length) return;
    e.preventDefault();
    void addImageBlobs(blobs);
  };

  const queueCurrentDraft = () => {
    const text = draft.trim();
    if (!text) return;
    setQueue(prev => [
      ...prev,
      { id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, text },
    ]);
    setDraft('');
    setPlusOpen(false);
  };

  const deleteQueued = (id: string) => {
    setQueue(prev => prev.filter(q => q.id !== id));
    if (editingQueueId === id) {
      setEditingQueueId(null);
      setEditDraft('');
    }
  };

  const startEditQueued = (item: QueuedChat) => {
    setEditingQueueId(item.id);
    setEditDraft(item.text);
  };

  const saveEditQueued = () => {
    if (!editingQueueId) return;
    const text = editDraft.trim();
    if (!text) {
      deleteQueued(editingQueueId);
      return;
    }
    setQueue(prev => prev.map(q => (q.id === editingQueueId ? { ...q, text } : q)));
    setEditingQueueId(null);
    setEditDraft('');
  };

  const sendQueued = (id: string) => {
    const item = queue.find(q => q.id === id);
    if (!item || !hasApiKey || isLoading) return;
    void sendUserMessage(item.text);
    deleteQueued(id);
  };

  const canSend = hasApiKey && !isLoading && (draft.trim().length > 0 || pendingImages.length > 0);

  return (
    <aside className="chat-panel" aria-label="AI chat">
      <header className="chat-panel__header">
        <div className="chat-panel__title">
          <Bot size={15} strokeWidth={2} />
          <span>Chat</span>
        </div>
        <div className="chat-panel__header-controls">
          <label className="chat-panel__model-label" title="Pro models are better for reaction SMILES">
            <span className="visually-hidden">Gemini model</span>
            <select
              className="chat-panel__model-select"
              value={modelId}
              disabled={isLoading || !hasApiKey}
              aria-label="Gemini model"
              onChange={e => setModelId(e.target.value)}
            >
              {chatModels.map(m => (
                <option key={m.id} value={m.id}>
                  {m.displayName}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="chat-panel__icon-btn"
            title="Clear conversation"
            onClick={clearChat}
            disabled={messages.length === 0 || isLoading}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </header>

      {hasApiKey && isGeminiProModel(modelId) ? (
        <p className="chat-panel__model-tip">Pro — better reaction SMILES</p>
      ) : null}

      {!hasApiKey ? (
        <div className="chat-panel__setup">
          <p>
            Paste a Gemini API key to chat. Stored only in this browser —{' '}
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">
              get a key
            </a>
            .
          </p>
          {onSaveApiKey ? (
            <form
              className="chat-panel__key-form"
              onSubmit={e => {
                e.preventDefault();
                const key = keyDraft.trim();
                if (!key) return;
                onSaveApiKey(key);
                setKeyDraft('');
              }}
            >
              <input
                type="password"
                autoComplete="off"
                className="chat-panel__key-input"
                placeholder="AIza…"
                aria-label="Gemini API key"
                value={keyDraft}
                onChange={e => setKeyDraft(e.target.value)}
              />
              <button type="submit" className="chat-panel__key-save" disabled={!keyDraft.trim()}>
                Save
              </button>
            </form>
          ) : null}
          <button type="button" className="chat-panel__setup-btn" onClick={onOpenSettings}>
            Settings → AI
          </button>
        </div>
      ) : null}

      <div ref={listRef} className="chat-panel__messages">
        {messages.length === 0 && hasApiKey ? (
          <p className="chat-panel__hint">
            Ask anything about the structure, or attach an image with +.
          </p>
        ) : null}
        {messages.map((m, index) => {
          // Tool rows stay in history for the model; UI never lists Applied/Failed dumps.
          if (m.role === 'tool') return null;

          if (m.role === 'assistant') {
            const focusTools = onFocusCanvas ? focusToolsBefore(messages, index) : [];
            return (
              <div key={m.id} className="chat-panel__msg chat-panel__msg--assistant">
                <div className="chat-panel__msg-assistant">
                  <AssistantMarkdown text={m.content} />
                </div>
                {focusTools.length > 0 ? (
                  <div className="chat-panel__focus-links">
                    {focusTools.map(t => (
                      <CanvasFocusLink key={t.id} message={t} onFocus={onFocusCanvas!} />
                    ))}
                  </div>
                ) : null}
              </div>
            );
          }

          return (
            <div key={m.id} className="chat-panel__msg chat-panel__msg--user">
              <div className="chat-panel__msg-user">
                {m.attachments?.length ? (
                  <div className="chat-panel__msg-thumbs">
                    {m.attachments.map(a => (
                      <img
                        key={a.id}
                        src={a.dataUrl}
                        alt="Attached"
                        className="chat-panel__msg-thumb"
                      />
                    ))}
                  </div>
                ) : null}
                {m.content.trim() ? <p className="chat-panel__msg-text">{m.content}</p> : null}
              </div>
            </div>
          );
        })}
        {isLoading ? (
          <div className="chat-panel__status" role="status" aria-live="polite">
            <span className="chat-panel__working-pulse" aria-hidden="true" />
            <div className="chat-panel__status-body">
              <span className="chat-panel__status-text">{progressLabel ?? 'Working…'}</span>
              {progressSteps.length > 0 ? (
                <details className="chat-panel__steps">
                  <summary>Show steps</summary>
                  <ol className="chat-panel__steps-list">
                    {progressSteps.map((step, i) => (
                      <li key={`${i}-${step}`}>{step}</li>
                    ))}
                  </ol>
                </details>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="chat-panel__error" role="alert">
          <div className="chat-panel__error-body">
            <p className="chat-panel__error-message">{error.message}</p>
            {error.detail ? (
              <details className="chat-panel__error-details">
                <summary>Details</summary>
                <pre className="chat-panel__error-detail-text">{error.detail}</pre>
              </details>
            ) : null}
          </div>
          <button type="button" className="chat-panel__error-dismiss" onClick={() => clearError()}>
            Dismiss
          </button>
        </div>
      ) : null}

      {hasApiKey ? (
        <div className="chat-panel__presets" role="group" aria-label="Quick prompts">
          {CHAT_PRESET_PILLS.map(pill => (
            <button
              key={pill.id}
              type="button"
              className="chat-panel__pill"
              disabled={isLoading}
              title={pill.prompt}
              onClick={() => handlePreset(pill.prompt)}
            >
              {pill.label}
            </button>
          ))}
        </div>
      ) : null}

      {queue.length > 0 ? (
        <div className="chat-panel__queue" aria-label="Queued messages">
          <div className="chat-panel__queue-head">
            <ListOrdered size={12} strokeWidth={2} aria-hidden />
            <span>Queue · {queue.length}</span>
          </div>
          <ul className="chat-panel__queue-list">
            {queue.map(item => (
              <li key={item.id} className="chat-panel__queue-item">
                {editingQueueId === item.id ? (
                  <div className="chat-panel__queue-edit">
                    <textarea
                      className="chat-panel__queue-edit-input"
                      value={editDraft}
                      rows={2}
                      autoFocus
                      onChange={e => setEditDraft(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          saveEditQueued();
                        }
                        if (e.key === 'Escape') {
                          setEditingQueueId(null);
                          setEditDraft('');
                        }
                      }}
                    />
                    <div className="chat-panel__queue-edit-actions">
                      <button
                        type="button"
                        className="chat-panel__queue-icon"
                        title="Save"
                        aria-label="Save queued message"
                        onClick={saveEditQueued}
                      >
                        <Check size={12} strokeWidth={2.5} />
                      </button>
                      <button
                        type="button"
                        className="chat-panel__queue-icon"
                        title="Cancel"
                        aria-label="Cancel edit"
                        onClick={() => {
                          setEditingQueueId(null);
                          setEditDraft('');
                        }}
                      >
                        <X size={12} strokeWidth={2.5} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="chat-panel__queue-text">{item.text}</p>
                    <div className="chat-panel__queue-actions">
                      <button
                        type="button"
                        className="chat-panel__queue-icon"
                        title="Send now"
                        aria-label="Send queued message"
                        disabled={!hasApiKey || isLoading}
                        onClick={() => sendQueued(item.id)}
                      >
                        <Send size={11} strokeWidth={2.25} />
                      </button>
                      <button
                        type="button"
                        className="chat-panel__queue-icon"
                        title="Edit"
                        aria-label="Edit queued message"
                        onClick={() => startEditQueued(item)}
                      >
                        <Pencil size={11} strokeWidth={2.25} />
                      </button>
                      <button
                        type="button"
                        className="chat-panel__queue-icon chat-panel__queue-icon--danger"
                        title="Delete"
                        aria-label="Delete queued message"
                        onClick={() => deleteQueued(item.id)}
                      >
                        <Trash2 size={11} strokeWidth={2.25} />
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {pendingImages.length > 0 ? (
        <div className="chat-panel__pending" aria-label="Images to send">
          {pendingImages.map(a => (
            <div key={a.id} className="chat-panel__pending-item">
              <img src={a.dataUrl} alt="" className="chat-panel__pending-thumb" />
              <button
                type="button"
                className="chat-panel__pending-remove"
                title="Remove image"
                aria-label="Remove image"
                onClick={() => removePendingImage(a.id)}
                disabled={isLoading}
              >
                <X size={11} strokeWidth={2.5} />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {attachError ? (
        <p className="chat-panel__attach-error" role="status">
          {attachError}
        </p>
      ) : null}

      {hasApiKey ? (
        <div className="chat-panel__options">
          <button
            type="button"
            className={`chat-panel__options-toggle${showDiagramOptions ? ' is-open' : ''}`}
            aria-expanded={showDiagramOptions}
            onClick={() => setShowDiagramOptions(v => !v)}
          >
            Diagram
            <ChevronDown size={11} strokeWidth={2.25} aria-hidden />
            <span className="chat-panel__options-hint">optional</span>
          </button>
          {showDiagramOptions ? (
            <div
              className="chat-panel__diagram-toggle"
              role="group"
              aria-label="Diagram layout for lab manuals"
            >
              {(
                [
                  { id: 'glassware', label: 'Steps', title: 'Glassware procedure steps only' },
                  { id: 'scheme', label: 'Scheme', title: 'Reaction scheme only' },
                  { id: 'both', label: 'Both', title: 'Glassware steps above, reaction scheme below' },
                ] as const
              ).map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  className={`chat-panel__diagram-btn${diagramLayoutMode === opt.id ? ' is-active' : ''}`}
                  title={opt.title}
                  aria-pressed={diagramLayoutMode === opt.id}
                  disabled={isLoading}
                  onClick={() => setDiagramLayoutMode(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <form className="chat-panel__composer" onSubmit={handleSubmit}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          className="visually-hidden"
          aria-hidden
          tabIndex={-1}
          onChange={e => {
            const files = e.target.files ? Array.from(e.target.files) : [];
            e.target.value = '';
            void addImageBlobs(files);
          }}
        />
        <div className="chat-panel__composer-shell">
          <div ref={plusWrapRef} className="chat-panel__plus-wrap">
            <button
              type="button"
              className={`chat-panel__plus${plusOpen ? ' is-open' : ''}`}
              title="Attach or queue"
              aria-label="More actions"
              aria-expanded={plusOpen}
              disabled={!hasApiKey || isLoading}
              onClick={() => setPlusOpen(v => !v)}
            >
              <Plus size={16} strokeWidth={2.25} />
            </button>
            {plusOpen ? (
              <div className="chat-panel__plus-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className="chat-panel__plus-item"
                  disabled={pendingImages.length >= MAX_CHAT_IMAGES}
                  onClick={() => {
                    setPlusOpen(false);
                    fileInputRef.current?.click();
                  }}
                >
                  <ImagePlus size={14} strokeWidth={2} aria-hidden />
                  Upload image
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="chat-panel__plus-item"
                  disabled={!draft.trim()}
                  onClick={queueCurrentDraft}
                >
                  <ListOrdered size={14} strokeWidth={2} aria-hidden />
                  Queue message
                </button>
              </div>
            ) : null}
          </div>
          <textarea
            className="chat-panel__input"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onPaste={handlePaste}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder={
              hasApiKey
                ? pendingImages.length
                  ? 'Ask about the image…'
                  : 'Message…'
                : 'API key required'
            }
            disabled={!hasApiKey || isLoading}
            rows={1}
          />
          <button
            type="submit"
            className="chat-panel__send"
            disabled={!canSend}
            aria-label="Send message"
          >
            <Send size={14} strokeWidth={2.25} />
          </button>
        </div>
      </form>
    </aside>
  );
}
