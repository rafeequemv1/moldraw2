/** Shared caret for the inline canvas-text editor (UTF-16 indices). */
export type InlineTextCaret = { start: number; end: number };

let inlineTextCaret: InlineTextCaret = { start: 0, end: 0 };
let boundEl: HTMLTextAreaElement | null = null;
const caretListeners = new Set<(caret: InlineTextCaret) => void>();
let selectionListening = false;

function readEl(el: HTMLTextAreaElement): InlineTextCaret {
  return { start: el.selectionStart ?? 0, end: el.selectionEnd ?? 0 };
}

function notify(next: InlineTextCaret): void {
  caretListeners.forEach(fn => fn(next));
}

function onDocumentSelectionChange(): void {
  if (!boundEl || document.activeElement !== boundEl) return;
  const live = readEl(boundEl);
  if (live.start === inlineTextCaret.start && live.end === inlineTextCaret.end) return;
  inlineTextCaret = live;
  notify(live);
}

function ensureSelectionListener(): void {
  if (selectionListening || typeof document === 'undefined') return;
  selectionListening = true;
  document.addEventListener('selectionchange', onDocumentSelectionChange);
}

/**
 * Live textarea indices while the editor is focused; otherwise the last
 * range captured before focus left (toolbar clicks must not wipe this).
 */
export function getInlineTextCaret(): InlineTextCaret {
  if (boundEl && document.activeElement === boundEl) return readEl(boundEl);
  return inlineTextCaret;
}

export function setInlineTextCaret(start: number, end: number): void {
  if (inlineTextCaret.start === start && inlineTextCaret.end === end) return;
  inlineTextCaret = { start, end };
  notify(inlineTextCaret);
}

/** Keep `selectionStart` / `selectionEnd` readable after the textarea blurs. */
export function bindInlineTextCaretEl(el: HTMLTextAreaElement | null): void {
  boundEl = el;
  if (!el) return;
  ensureSelectionListener();
  if (document.activeElement === el) {
    const live = readEl(el);
    if (live.start !== inlineTextCaret.start || live.end !== inlineTextCaret.end) {
      inlineTextCaret = live;
      notify(live);
    }
  }
}

export function subscribeInlineTextCaret(fn: (caret: InlineTextCaret) => void): () => void {
  caretListeners.add(fn);
  return () => {
    caretListeners.delete(fn);
  };
}
