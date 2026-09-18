/**
 * In-place editor for a selected `CanvasText`.
 *
 * Geometry matches the canvas (`canvasTextEditorLayout`). Formatting lives in
 * the left-dock TextStylePanel — not the molecule Color menu or top bar.
 */
import { forwardRef, useCallback, useEffect, useMemo, useRef, type ForwardedRef } from 'react';
import type { CanvasText } from '@moldraw/domain';
import {
  buildCanvasTextFont,
  canvasTextAlign,
  canvasTextEditorLayout,
  canvasTextEffectiveFontSize,
  canvasTextFitContentPatch,
  inferTextEdit,
  remapTextScriptRanges,
  resolveCanvasTextInk,
  resolveCanvasTextScripts,
} from '@moldraw/canvas/geometry';
import { bindInlineTextCaretEl, getInlineTextCaret, setInlineTextCaret } from '../inlineTextCaret';

export interface InlineTextEditorProps {
  selectedCanvasText: CanvasText;
  /** Client-space centre of the text box + current camera zoom. */
  position: { left: number; top: number; zoom: number };
  onUpdate: (id: string, patch: Partial<CanvasText>) => void;
  onFocus: () => void;
  onBlur: () => void;
  /** Escape: leave the editor and drop the selection. */
  onEscape?: () => void;
  /** Fired once the textarea is in the DOM (host may hand it the caret). */
  onMount?: () => void;
  /** Structure ink of the active theme — default-coloured labels follow it. */
  themeInk?: string;
}

let measureCtx: CanvasRenderingContext2D | null = null;
function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (measureCtx) return measureCtx;
  if (typeof document === 'undefined') return null;
  measureCtx = document.createElement('canvas').getContext('2d');
  return measureCtx;
}

/** Handle half-size in screen px — mirrors `drawCanvasTexts` (`max(4.5, 5.5/zoom)` world). */
const handleInsetPx = (zoom: number): number => Math.max(4.5 * zoom, 5.5) + 1;

function assignRef<T>(ref: ForwardedRef<T>, value: T | null): void {
  if (typeof ref === 'function') ref(value);
  else if (ref) ref.current = value;
}

export const InlineTextEditor = forwardRef<HTMLTextAreaElement, InlineTextEditorProps>(
  function InlineTextEditor(
    { selectedCanvasText, position, onUpdate, onFocus, onBlur, onEscape, onMount, themeInk },
    ref,
  ) {
    const t = selectedCanvasText;
    const ink = resolveCanvasTextInk(t, themeInk ?? t.color);
    const blurTimer = useRef<number | null>(null);
    const innerRef = useRef<HTMLTextAreaElement | null>(null);
    const tRef = useRef(t);
    tRef.current = t;
    const onUpdateRef = useRef(onUpdate);
    onUpdateRef.current = onUpdate;
    const z = position.zoom;
    const align = canvasTextAlign(t);

    const onMountRef = useRef(onMount);
    onMountRef.current = onMount;
    useEffect(() => {
      onMountRef.current?.();
    }, []);

    const layout = useMemo(() => {
      const ctx = getMeasureCtx();
      if (!ctx) return null;
      return canvasTextEditorLayout(ctx, t);
    }, [t]);

    const clearBlurTimer = () => {
      if (blurTimer.current != null) {
        window.clearTimeout(blurTimer.current);
        blurTimer.current = null;
      }
    };

    const syncCaretFromEl = (el: HTMLTextAreaElement) => {
      // Ignore select/collapse that fires after focus has already left (toolbar).
      if (typeof document !== 'undefined' && document.activeElement !== el) return;
      setInlineTextCaret(el.selectionStart ?? 0, el.selectionEnd ?? 0);
    };

    useEffect(() => () => bindInlineTextCaretEl(null), []);

    const handleChange = useCallback(
      (value: string) => {
        const ctx = getMeasureCtx();
        const edit = inferTextEdit(t.text, value, getInlineTextCaret());
        const nextScripts = remapTextScriptRanges(
          resolveCanvasTextScripts(t),
          edit.start,
          edit.end,
          edit.insertLen,
          value.length,
        );
        const next: CanvasText = {
          ...t,
          text: value,
          textScripts: nextScripts,
          textScript: 'normal',
        };
        const fit = ctx ? canvasTextFitContentPatch(ctx, next) : {};
        onUpdate(t.id, { text: value, textScripts: nextScripts, textScript: 'normal', ...fit });
      },
      [onUpdate, t],
    );

    // Capture-phase: Space / letters must reach this editor even if the canvas
    // still has focus. Global hand-pan / tool shortcuts must not eat them.
    useEffect(() => {
      const onKeyDown = (e: KeyboardEvent) => {
        const ta = innerRef.current;
        if (!ta) return;
        if (e.isComposing) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;

        const isSpace = e.key === ' ' || e.code === 'Space';
        const isPrintable = isSpace || (e.key.length === 1 && e.key !== 'Enter');
        if (!isPrintable) return;

        const ae = document.activeElement as HTMLElement | null;
        const inField =
          ae &&
          (ae === ta ||
            ae.tagName === 'INPUT' ||
            ae.tagName === 'TEXTAREA' ||
            ae.tagName === 'SELECT' ||
            ae.isContentEditable);
        if (inField) {
          if (ae === ta && isSpace) e.stopPropagation();
          return;
        }

        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
        const ch = isSpace ? ' ' : e.key;
        const cur = tRef.current;
        const start = ta.selectionStart ?? cur.text.length;
        const end = ta.selectionEnd ?? start;
        const next = cur.text.slice(0, start) + ch + cur.text.slice(end);
        const nextScripts = remapTextScriptRanges(
          resolveCanvasTextScripts(cur),
          start,
          end,
          ch.length,
          next.length,
        );
        const ctx = getMeasureCtx();
        const fitted = ctx
          ? canvasTextFitContentPatch(ctx, { ...cur, text: next, textScripts: nextScripts })
          : {};
        onUpdateRef.current(cur.id, {
          text: next,
          textScripts: nextScripts,
          textScript: 'normal',
          ...fitted,
        });
        ta.focus({ preventScroll: true });
        requestAnimationFrame(() => {
          const pos = start + ch.length;
          ta.setSelectionRange(pos, pos);
          setInlineTextCaret(pos, pos);
        });
      };
      const onKeyUp = (e: KeyboardEvent) => {
        if (e.code === 'Space' || e.key === ' ') {
          e.stopPropagation();
          if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
        }
      };
      window.addEventListener('keydown', onKeyDown, true);
      window.addEventListener('keyup', onKeyUp, true);
      return () => {
        window.removeEventListener('keydown', onKeyDown, true);
        window.removeEventListener('keyup', onKeyUp, true);
      };
    }, []);

    if (!layout) return null;

    const { box, lineHeight, blockTop, scriptDy } = layout;
    const rotDeg = ((t.rotationRad ?? 0) * 180) / Math.PI;
    const boxW = box.width * z;
    const boxH = box.height * z;
    const inset = Math.min(handleInsetPx(z), boxW / 4, boxH / 4);
    const fsPx = canvasTextEffectiveFontSize(t) * z;
    const font = buildCanvasTextFont(t);
    const fontFamily = font.slice(font.indexOf('px ') + 3);
    const hideGlyphs = resolveCanvasTextScripts(t).length > 0;

    return (
      <div
        className="canvas-inline-text-root"
        style={{
          position: 'fixed',
          zIndex: 620,
          left: position.left,
          top: position.top,
          width: boxW,
          height: boxH,
          transform: `translate(-50%, -50%) rotate(${rotDeg}deg)`,
          transformOrigin: 'center center',
          pointerEvents: 'none',
        }}
      >
        <textarea
          ref={el => {
            innerRef.current = el;
            assignRef(ref, el);
            bindInlineTextCaretEl(el);
          }}
          className="canvas-inline-text"
          value={t.text}
          placeholder="Text"
          wrap="soft"
          onChange={e => handleChange(e.target.value)}
          onSelect={e => syncCaretFromEl(e.currentTarget)}
          onClick={e => syncCaretFromEl(e.currentTarget)}
          onPointerUp={e => syncCaretFromEl(e.currentTarget)}
          onPointerDown={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
          onFocus={() => {
            clearBlurTimer();
            onFocus();
            const el = innerRef.current;
            if (el) syncCaretFromEl(el);
          }}
          onBlur={() => {
            clearBlurTimer();
            blurTimer.current = window.setTimeout(() => onBlur(), 120);
          }}
          onKeyDown={e => {
            e.stopPropagation();
            syncCaretFromEl(e.currentTarget);
            if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
              e.preventDefault();
              (e.currentTarget as HTMLTextAreaElement).blur();
              onEscape?.();
            }
          }}
          onKeyUp={e => {
            e.stopPropagation();
            syncCaretFromEl(e.currentTarget);
          }}
          spellCheck={false}
          style={{
            position: 'absolute',
            left: inset,
            top: inset,
            width: Math.max(0, boxW - inset * 2),
            height: Math.max(0, boxH - inset * 2),
            display: 'block',
            boxSizing: 'border-box',
            margin: 0,
            padding: `${Math.max(0, blockTop * z - inset)}px 0 0 0`,
            border: 'none',
            borderRadius: 0,
            background: 'transparent',
            boxShadow: 'none',
            outline: 'none',
            resize: 'none',
            overflow: 'hidden',
            whiteSpace: 'pre-wrap',
            overflowWrap: 'break-word',
            wordBreak: 'break-word',
            textAlign: align,
            fontSize: `${fsPx}px`,
            lineHeight: `${lineHeight * z}px`,
            fontWeight: t.fontWeight === 'bold' ? 700 : 400,
            fontStyle: t.fontStyle === 'italic' ? 'italic' : 'normal',
            textDecoration: t.textDecoration === 'underline' ? 'underline' : 'none',
            fontFamily,
            color: hideGlyphs ? 'transparent' : ink,
            WebkitTextFillColor: hideGlyphs ? 'transparent' : undefined,
            caretColor: ink,
            cursor: 'text',
            userSelect: 'text',
            pointerEvents: 'auto',
            transform: scriptDy ? `translateY(${scriptDy * z}px)` : undefined,
          }}
        />
      </div>
    );
  },
);
