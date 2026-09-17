/**
 * Floating single-line editor for reagent text on a reaction arrow.
 */
import { useEffect, useRef } from 'react';
import { DEFAULT_REAGENT_FONT_SIZE } from '@moldraw/domain';

export interface InlineArrowReagentEditorProps {
  position: { left: number; top: number; zoom: number };
  slot: 'above' | 'below';
  draft: string;
  fontSize?: number;
  onDraftChange: (next: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}

export function InlineArrowReagentEditor({
  position,
  slot,
  draft,
  fontSize = DEFAULT_REAGENT_FONT_SIZE,
  onDraftChange,
  onCommit,
  onCancel,
}: InlineArrowReagentEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus({ preventScroll: true });
    input.select();
  }, [slot]);

  return (
    <div
      className="arrow-reagent-inline"
      style={{ left: position.left, top: position.top }}
      role="dialog"
      aria-label={slot === 'above' ? 'Reagent above arrow' : 'Reagent below arrow'}
    >
      <input
        ref={inputRef}
        type="text"
        className="arrow-reagent-inline__input"
        spellCheck={false}
        placeholder={slot === 'above' ? 'Above' : 'Below'}
        value={draft}
        style={{ fontSize: `${Math.max(11, fontSize * position.zoom)}px` }}
        onChange={e => onDraftChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onCommit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
      />
    </div>
  );
}
