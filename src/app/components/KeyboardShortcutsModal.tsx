/**
 * Modal listing every global keyboard shortcut, grouped by purpose.
 *
 * Copy is sourced from `src/app/keyboard/shortcutCatalog.ts`; handlers live in
 * `src/app/hooks/useKeyboardShortcuts.ts`.
 */
import { useEffect } from 'react';
import { X } from 'lucide-react';
import { SHORTCUT_MODAL_GROUPS } from '../keyboard/shortcutCatalog';

export interface KeyboardShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

const Kbd = ({ children }: { children: string }) => (
  <kbd
    style={{
      display: 'inline-block',
      minWidth: '20px',
      padding: '2px 6px',
      fontFamily:
        '"SF Mono", "Menlo", "Consolas", "Liberation Mono", monospace',
      fontSize: '10.5px',
      fontWeight: 600,
      lineHeight: '14px',
      textAlign: 'center',
      color: '#0f172a',
      background: '#f8fafc',
      border: '1px solid #cbd5e1',
      borderBottomWidth: '2px',
      borderRadius: '4px',
      whiteSpace: 'nowrap',
    }}
  >
    {children}
  </kbd>
);

export function KeyboardShortcutsModal({ open, onClose }: KeyboardShortcutsModalProps) {
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      onMouseDown={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      <div
        onMouseDown={e => e.stopPropagation()}
        style={{
          width: 'min(640px, calc(100vw - 32px))',
          maxHeight: 'calc(100vh - 64px)',
          background: '#ffffff',
          borderRadius: '12px',
          boxShadow: '0 20px 50px -12px rgba(15, 23, 42, 0.35)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 18px',
            borderBottom: '1px solid #e2e8f0',
          }}
        >
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
              Keyboard shortcuts
            </div>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
              Press{' '}
              <kbd style={{ fontFamily: 'inherit', fontSize: '10.5px' }}>Esc</kbd>{' '}
              to close
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '28px',
              height: '28px',
              border: 'none',
              borderRadius: '6px',
              background: 'transparent',
              color: '#64748b',
              cursor: 'pointer',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = '#f1f5f9';
              e.currentTarget.style.color = '#0f172a';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = '#64748b';
            }}
          >
            <X size={16} />
          </button>
        </header>

        <div style={{ padding: '14px 18px 18px', overflow: 'auto' }}>
          {SHORTCUT_MODAL_GROUPS.map(group => (
            <section key={group.title} style={{ marginBottom: '16px' }}>
              <h3
                style={{
                  margin: '0 0 6px',
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  color: '#64748b',
                }}
              >
                {group.title}
              </h3>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  rowGap: '6px',
                  columnGap: '16px',
                  alignItems: 'center',
                }}
              >
                {group.rows.map((row, ri) => (
                  <RowFragment
                    key={`${group.title}-${ri}-${row.label.slice(0, 48)}`}
                    row={row}
                  />
                ))}
              </div>
            </section>
          ))}
          <p
            style={{
              margin: '0',
              fontSize: '10.5px',
              color: '#94a3b8',
              borderTop: '1px solid #f1f5f9',
              paddingTop: '10px',
            }}
          >
            Most shortcuts are suppressed while typing in a text input or the inline atom-alias
            editor.
          </p>
        </div>
      </div>
    </div>
  );
}

const RowFragment = ({ row }: { row: { label: string; keys: string[][] } }) => (
  <>
    <span style={{ fontSize: '12px', color: '#0f172a' }}>{row.label}</span>
    <span style={{ display: 'flex', gap: '6px', alignItems: 'center', justifyContent: 'flex-end' }}>
      {row.keys.map((combo, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {i > 0 && <span style={{ fontSize: '10px', color: '#94a3b8' }}>or</span>}
          <span style={{ display: 'flex', gap: '3px' }}>
            {combo.map((k, j) => (
              <span key={j} style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                {j > 0 && <span style={{ fontSize: '10px', color: '#94a3b8' }}>+</span>}
                <Kbd>{k}</Kbd>
              </span>
            ))}
          </span>
        </span>
      ))}
    </span>
  </>
);