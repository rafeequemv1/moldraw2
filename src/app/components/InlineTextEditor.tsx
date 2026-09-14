/**
 * Floating in-place text editor. Formatting (bold / italic / sub / super) lives in
 * the top toolbar when text is selected — no floating tooltip chrome.
 */
import { forwardRef, useCallback, useRef } from 'react';
import type { CanvasText } from '@moldraw/domain';

export interface InlineTextEditorProps {
  selectedCanvasText: CanvasText;
  position: { left: number; top: number; zoom: number };
  onUpdate: (id: string, patch: Partial<CanvasText>) => void;
  onFocus: () => void;
  onBlur: () => void;
}

function measureFit(text: string, t: CanvasText): { boxWidth: number; boxHeight: number } {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const script = t.textScript ?? 'normal';
  const fs = script === 'super' || script === 'sub' ? t.fontSize * 0.72 : t.fontSize;
  const italic = t.fontStyle === 'italic' ? 'italic ' : '';
  const weight = t.fontWeight === 'bold' ? 'bold ' : '';
  const family = t.fontFamily?.trim() || 'Inter';
  if (ctx) ctx.font = `${italic}${weight}${fs}px ${family}, sans-serif`;
  const lines = text.split(/\r?\n/);
  const lineHeight = fs * 1.3;
  let maxW = 40;
  for (const line of lines) {
    const w = ctx ? ctx.measureText(line || ' ').width : (line.length || 1) * fs * 0.55;
    if (w > maxW) maxW = w;
  }
  const padX = 10;
  const padY = 8;
  const contentW = maxW + padX * 2;
  const contentH = Math.max(1, lines.length) * lineHeight + padY * 2;
  return {
    boxWidth: Math.max(56, Math.max(t.boxWidth ?? 0, contentW)),
    boxHeight: Math.max(28, Math.max(t.boxHeight ?? 0, contentH)),
  };
}

export const InlineTextEditor = forwardRef<HTMLTextAreaElement, InlineTextEditorProps>(
  function InlineTextEditor({ selectedCanvasText, position, onUpdate, onFocus, onBlur }, ref) {
    const t = selectedCanvasText;
    const blurTimer = useRef<number | null>(null);
    const rotDeg = ((t.rotationRad ?? 0) * 180) / Math.PI;
    const z = position.zoom;
    const boxW = Math.max(56, (t.boxWidth ?? 120) * z);
    const boxH = Math.max(28, (t.boxHeight ?? 36) * z);
    const script = t.textScript ?? 'normal';
    const fs = (script === 'super' || script === 'sub' ? t.fontSize * 0.72 : t.fontSize) * z;

    const clearBlurTimer = () => {
      if (blurTimer.current != null) {
        window.clearTimeout(blurTimer.current);
        blurTimer.current = null;
      }
    };

    const handleChange = useCallback(
      (value: string) => {
        const fit = measureFit(value, t);
        onUpdate(t.id, { text: value, boxWidth: fit.boxWidth, boxHeight: fit.boxHeight });
      },
      [onUpdate, t],
    );

    return (
      <div
        className="canvas-inline-text-root"
        style={{
          position: 'fixed',
          zIndex: 620,
          left: position.left,
          top: position.top,
          transform: 'translate(-50%, -50%)',
          transformOrigin: 'center center',
          pointerEvents: 'auto',
        }}
        onMouseDown={e => e.stopPropagation()}
      >
        <textarea
          ref={ref}
          className="canvas-inline-text"
          value={t.text}
          onChange={e => handleChange(e.target.value)}
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
          }}
          spellCheck={false}
          style={{
            display: 'block',
            width: boxW,
            height: boxH,
            minWidth: 56 * z,
            minHeight: 28 * z,
            fontSize: `${Math.max(10, fs)}px`,
            fontWeight: t.fontWeight === 'bold' ? 700 : 500,
            fontStyle: t.fontStyle === 'italic' ? 'italic' : 'normal',
            textDecoration: t.textDecoration === 'underline' ? 'underline' : 'none',
            fontFamily: `${t.fontFamily?.trim() || 'Inter'}, sans-serif`,
            color: t.color,
            textAlign: 'center',
            lineHeight: 1.3,
            padding: `${6 * z}px ${8 * z}px`,
            margin: 0,
            border: 'none',
            borderRadius: 0,
            background: 'transparent',
            boxShadow: 'none',
            outline: 'none',
            resize: 'none',
            overflow: 'hidden',
            userSelect: 'text',
            caretColor: t.color,
            boxSizing: 'border-box',
            transform: `rotate(${rotDeg}deg)`,
            transformOrigin: 'center center',
          }}
        />
      </div>
    );
  },
);
