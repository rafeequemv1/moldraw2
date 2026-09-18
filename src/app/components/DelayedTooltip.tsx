/**
 * Minimal hover tip for editor tool buttons and their dropdown items.
 * Appears only after 500ms of hovering the same control; leaving earlier cancels it.
 * Native `title` is stripped on enter so the browser tip cannot show sooner.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const DELAY_MS = 500;

/** Editor chrome only — not site nav, auth, or community links. */
const TIP_SELECTOR = [
  '.tool-btn',
  '.toolbar-split-tool__icon',
  '.toolbar-split-tool__caret',
  '.toolbar-split-tool__item',
  '.toolbar-split-tool__library-btn',
  '.toolbar-mobile-categories__btn',
  '.toolbar-fg-tool__trigger',
  '.toolbar-fg-item',
  '.action-btn',
  '.element-island-btn',
  'button.app-top-bar__select-trigger',
  '.app-top-bar__select-item',
  '.app-top-bar__designs-btn',
  '.app-top-bar__color-trigger',
  '.app-top-bar__color-preset',
  '.app-top-bar__color-custom',
  '.app-top-bar__delete-btn',
  '.app-top-bar__rotate-btn',
  '.tb-btn-grid-toggle',
  '.tb-btn-theme-toggle',
  '.selection-align-toolbar button',
  '.selection-align-toolbar label',
  '.selection-action-toolbar button',
].join(',');

type TipState = {
  text: string;
  left: number;
  top: number;
  above: boolean;
};

function tipTarget(node: EventTarget | null): HTMLElement | null {
  if (!(node instanceof Element)) return null;
  const el = node.closest(TIP_SELECTOR);
  return el instanceof HTMLElement ? el : null;
}

function readTip(el: HTMLElement): string {
  const explicit = el.getAttribute('data-delay-tip')?.trim();
  const titled = el.getAttribute('title');
  if (titled != null) el.removeAttribute('title');
  if (explicit) return explicit;
  const text = titled?.trim() ?? '';
  if (text) el.setAttribute('data-delay-tip', text);
  return text;
}

export function DelayedTooltip() {
  const [tip, setTip] = useState<TipState | null>(null);

  useEffect(() => {
    let timer = 0;
    let current: HTMLElement | null = null;

    const hide = () => {
      window.clearTimeout(timer);
      timer = 0;
      current = null;
      setTip(null);
    };

    const onOver = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const el = tipTarget(e.target);
      if (!el || el === current) return;
      window.clearTimeout(timer);
      timer = 0;
      setTip(null);
      const text = readTip(el);
      if (!text) {
        current = null;
        return;
      }
      current = el;
      const anchor = el;
      timer = window.setTimeout(() => {
        timer = 0;
        if (current !== anchor || !anchor.isConnected) {
          current = null;
          return;
        }
        const rect = anchor.getBoundingClientRect();
        if (rect.width < 1 && rect.height < 1) return;
        const above = rect.bottom + 64 > window.innerHeight && rect.top > 64;
        const half = 110;
        const left = Math.min(
          window.innerWidth - half - 8,
          Math.max(half + 8, rect.left + rect.width / 2),
        );
        setTip({
          text,
          left,
          top: above ? rect.top - 6 : rect.bottom + 6,
          above,
        });
      }, DELAY_MS);
    };

    const onOut = (e: PointerEvent) => {
      if (!current) return;
      const from = tipTarget(e.target);
      if (from !== current) return;
      const next = tipTarget(e.relatedTarget);
      if (next === current) return;
      hide();
    };

    document.addEventListener('pointerover', onOver, true);
    document.addEventListener('pointerout', onOut, true);
    document.addEventListener('pointerdown', hide, true);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('blur', hide);
    return () => {
      hide();
      document.removeEventListener('pointerover', onOver, true);
      document.removeEventListener('pointerout', onOut, true);
      document.removeEventListener('pointerdown', hide, true);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('blur', hide);
    };
  }, []);

  if (!tip || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={`delay-tip${tip.above ? ' delay-tip--above' : ''}`}
      role="tooltip"
      style={{ left: tip.left, top: tip.top }}
    >
      {tip.text}
    </div>,
    document.body,
  );
}
