/**
 * Touch keypad for the inline atom-label editor. Shown only in touch UI
 * (coarse pointer): big tap targets for the common elements, charge suffixes
 * and frequent group labels so users don't have to fight the software
 * keyboard for two-letter symbols and subscripts.
 *
 * Tapping never blurs the text input (pointerdown is prevented), so the
 * blur-commit path in `InlineAliasEditor` is not triggered by the keypad.
 */
import { useLayoutEffect, useRef, useState } from 'react';
import { Check, Delete, X } from 'lucide-react';

const ELEMENT_KEYS = ['C', 'N', 'O', 'S', 'P', 'F', 'Cl', 'Br', 'I', 'H', 'B', 'Si'] as const;
const GROUP_KEYS = ['R', 'OH', 'NH2', 'OMe', 'Me', 'Et', 'Ph', 'Boc'] as const;

export interface AliasTouchKeypadProps {
  draft: string;
  onDraftChange: (next: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}

const stopFocusLoss = (e: React.PointerEvent) => {
  // Keep the caret in the text input; also suppresses compat mouse events.
  e.preventDefault();
};

const appendCharge = (draft: string, sign: '+' | '-'): string => {
  const base = draft.replace(/[+-]\d*$/u, '');
  return `${base || 'C'}${sign}`;
};

export function AliasTouchKeypad({ draft, onDraftChange, onCommit, onCancel }: AliasTouchKeypadProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [shiftX, setShiftX] = useState(0);

  // Keep the keypad inside the viewport when the atom sits near an edge.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 6;
    let dx = 0;
    if (rect.left - shiftX < margin) dx = margin - (rect.left - shiftX);
    else if (rect.right - shiftX > window.innerWidth - margin) {
      dx = window.innerWidth - margin - (rect.right - shiftX);
    }
    if (Math.abs(dx - shiftX) > 0.5) setShiftX(dx);
  }, [shiftX, draft]);

  const key = (label: string, onTap: () => void, extraClass = '', aria?: string) => (
    <button
      key={label}
      type="button"
      className={`alias-touch-keypad__key${extraClass ? ` ${extraClass}` : ''}`}
      onPointerDown={stopFocusLoss}
      onClick={onTap}
      aria-label={aria ?? label}
      tabIndex={-1}
    >
      {label}
    </button>
  );

  return (
    <div
      ref={ref}
      className="alias-touch-keypad"
      role="toolbar"
      aria-label="Atom label keypad"
      style={{ marginLeft: shiftX }}
      onPointerDown={stopFocusLoss}
    >
      <div className="alias-touch-keypad__row">
        {ELEMENT_KEYS.map(el =>
          key(el, () => onDraftChange(el), draft === el ? 'alias-touch-keypad__key--active' : ''),
        )}
      </div>
      <div className="alias-touch-keypad__row">
        {key('+', () => onDraftChange(appendCharge(draft, '+')), 'alias-touch-keypad__key--muted', 'Positive charge')}
        {key('−', () => onDraftChange(appendCharge(draft, '-')), 'alias-touch-keypad__key--muted', 'Negative charge')}
        {GROUP_KEYS.map(g =>
          key(g, () => onDraftChange(g), draft === g ? 'alias-touch-keypad__key--active' : ''),
        )}
        <button
          type="button"
          className="alias-touch-keypad__key alias-touch-keypad__key--muted"
          onPointerDown={stopFocusLoss}
          onClick={() => onDraftChange(draft.slice(0, -1))}
          aria-label="Backspace"
          tabIndex={-1}
        >
          <Delete size={16} strokeWidth={2} aria-hidden />
        </button>
        <button
          type="button"
          className="alias-touch-keypad__key alias-touch-keypad__key--cancel"
          onPointerDown={stopFocusLoss}
          onClick={onCancel}
          aria-label="Cancel label edit"
          tabIndex={-1}
        >
          <X size={16} strokeWidth={2.2} aria-hidden />
        </button>
        <button
          type="button"
          className="alias-touch-keypad__key alias-touch-keypad__key--commit"
          onPointerDown={stopFocusLoss}
          onClick={onCommit}
          aria-label="Apply label"
          tabIndex={-1}
        >
          <Check size={16} strokeWidth={2.4} aria-hidden />
        </button>
      </div>
    </div>
  );
}
