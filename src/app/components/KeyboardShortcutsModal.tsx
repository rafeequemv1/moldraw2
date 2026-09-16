/**
 * Modal listing every global keyboard shortcut, grouped by purpose.
 *
 * Copy is sourced from `src/app/keyboard/shortcutCatalog.ts`; handlers live in
 * `src/app/hooks/useKeyboardShortcuts.ts`.
 */
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { SHORTCUT_MODAL_GROUPS } from '../keyboard/shortcutCatalog';
import { useChromeOverlay } from '../chromeDismiss';

export interface KeyboardShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

const Kbd = ({ children }: { children: string }) => (
  <kbd className="kb-shortcuts-modal__key">{children}</kbd>
);

function sectionNavLabel(title: string): string {
  return title.split(' (')[0];
}

export function KeyboardShortcutsModal({ open, onClose }: KeyboardShortcutsModalProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  useChromeOverlay(open, onClose, 'modal');

  useEffect(() => {
    if (open) setActiveIndex(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  const group = SHORTCUT_MODAL_GROUPS[activeIndex] ?? SHORTCUT_MODAL_GROUPS[0];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      className="kb-shortcuts-modal"
      onMouseDown={onClose}
    >
      <div className="kb-shortcuts-modal__panel" onMouseDown={e => e.stopPropagation()}>
        <header className="kb-shortcuts-modal__header">
          <div>
            <div className="kb-shortcuts-modal__title">Keyboard shortcuts</div>
            <div className="kb-shortcuts-modal__hint">
              Choose a section, then press{' '}
              <kbd className="kb-shortcuts-modal__key kb-shortcuts-modal__key--inline">Esc</kbd> to
              close
            </div>
          </div>
          <button
            type="button"
            className="kb-shortcuts-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </header>

        <div className="kb-shortcuts-modal__layout">
          <nav className="kb-shortcuts-modal__nav" aria-label="Shortcut sections">
            {SHORTCUT_MODAL_GROUPS.map((g, i) => (
              <button
                key={g.title}
                type="button"
                className={`kb-shortcuts-modal__nav-btn${i === activeIndex ? ' is-active' : ''}`}
                aria-current={i === activeIndex ? 'true' : undefined}
                onClick={() => setActiveIndex(i)}
              >
                {sectionNavLabel(g.title)}
              </button>
            ))}
          </nav>

          <div className="kb-shortcuts-modal__body">
            <section className="kb-shortcuts-modal__group">
              <h3 className="kb-shortcuts-modal__group-title">{group.title}</h3>
              <div className="kb-shortcuts-modal__rows">
                {group.rows.map((row, ri) => (
                  <RowFragment
                    key={`${group.title}-${ri}-${row.label.slice(0, 48)}`}
                    row={row}
                  />
                ))}
              </div>
            </section>
            <p className="kb-shortcuts-modal__foot">
              Most shortcuts are suppressed while typing in a text input or the inline atom-alias
              editor.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

const RowFragment = ({ row }: { row: { label: string; keys: string[][] } }) => (
  <>
    <span className="kb-shortcuts-modal__label">{row.label}</span>
    <span className="kb-shortcuts-modal__chords">
      {row.keys.map((combo, i) => (
        <span key={i} className="kb-shortcuts-modal__chord">
          {i > 0 && <span className="kb-shortcuts-modal__sep">or</span>}
          <span className="kb-shortcuts-modal__combo">
            {combo.map((k, j) => (
              <span key={j} className="kb-shortcuts-modal__combo">
                {j > 0 && <span className="kb-shortcuts-modal__sep">+</span>}
                <Kbd>{k}</Kbd>
              </span>
            ))}
          </span>
        </span>
      ))}
    </span>
  </>
);
