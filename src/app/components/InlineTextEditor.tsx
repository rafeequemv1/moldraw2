/**
 * In-place editor for a selected `CanvasText`.
 *
 * The textarea is laid out with the *same* geometry the canvas uses
 * (`canvasTextEditorLayout`): identical box, font, line-height and vertical
 * centring, rotated about the box centre. The canvas keeps drawing the
 * transform frame + handles underneath; only the letters are swapped for the
 * live textarea, so what you type is exactly where the label renders.
 *
 * The textarea is inset from the frame by the handle size so the corner /
 * edge strip stays on the canvas — drag the frame to move, corners to
 * resize, the knob above to rotate — even while typing.
 *
 * Formatting (bold / italic / sub / super / symbols) lives in the top toolbar.
 */
import { forwardRef, useCallback, useEffect, useMemo, useRef } from 'react';
import type { CanvasText } from '@moldraw/domain';
import {
  buildCanvasTextFont,
  canvasTextEditorLayout,
  canvasTextEffectiveFontSize,
  canvasTextFitContentPatch,
  resolveCanvasTextInk,
} from '@moldraw/canvas/geometry';

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

export const InlineTextEditor = forwardRef<HTMLTextAreaElement, InlineTextEditorProps>(
  function InlineTextEditor(
    { selectedCanvasText, position, onUpdate, onFocus, onBlur, onEscape, onMount, themeInk },
    ref,
  ) {
    const t = selectedCanvasText;
    const ink = resolveCanvasTextInk(t, themeInk ?? t.color);
    const blurTimer = useRef<number | null>(null);
    const z = position.zoom;

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

    const handleChange = useCallback(
      (value: string) => {
        const ctx = getMeasureCtx();
        const next: CanvasText = { ...t, text: value };
        const fit = ctx ? canvasTextFitContentPatch(ctx, next) : {};
        onUpdate(t.id, { text: value, ...fit });
      },
      [onUpdate, t],
    );

    if (!layout) return null;

    const { box, lineHeight, blockTop, scriptDy } = layout;
    const rotDeg = ((t.rotationRad ?? 0) * 180) / Math.PI;
    const boxW = box.width * z;
    const boxH = box.height * z;
    const inset = Math.min(handleInsetPx(z), boxW / 4, boxH / 4);
    const fsPx = canvasTextEffectiveFontSize(t) * z;
    const font = buildCanvasTextFont(t);
    const fontFamily = font.slice(font.indexOf('px ') + 3);

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
          ref={ref}
          className="canvas-inline-text"
          value={t.text}
          placeholder="Text"
          wrap="off"
          onChange={e => handleChange(e.target.value)}
          onPointerDown={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
          onFocus={() => {
            clearBlurTimer();
            onFocus();
          }}
          onBlur={() => {
            clearBlurTimer();
            blurTimer.current = window.setTimeout(() => onBlur(), 120);
          }}
          onKeyDown={e => {
            e.stopPropagation();
            if (e.key === 'Escape') {
              e.preventDefault();
              (e.currentTarget as HTMLTextAreaElement).blur();
              onEscape?.();
            }
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
            // Vertical centring identical to the canvas: line block centred on cy.
            padding: `${Math.max(0, blockTop * z - inset)}px 0 0 0`,
            border: 'none',
            borderRadius: 0,
            background: 'transparent',
            boxShadow: 'none',
            outline: 'none',
            resize: 'none',
            overflow: 'hidden',
            whiteSpace: 'pre',
            textAlign: 'center',
            fontSize: `${fsPx}px`,
            lineHeight: `${lineHeight * z}px`,
            fontWeight: t.fontWeight === 'bold' ? 700 : 400,
            fontStyle: t.fontStyle === 'italic' ? 'italic' : 'normal',
            textDecoration: t.textDecoration === 'underline' ? 'underline' : 'none',
            fontFamily,
            color: ink,
            caretColor: ink,
            userSelect: 'text',
            pointerEvents: 'auto',
            transform: scriptDy ? `translateY(${scriptDy * z}px)` : undefined,
          }}
        />
      </div>
    );
  },
);
