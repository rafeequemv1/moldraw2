/**
 * Text appearance controls for the selected canvas label.
 */
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Italic, Subscript, Superscript, Type, Underline } from 'lucide-react';
import type { CanvasText } from '@moldraw/domain';
import { CANVAS_FONT_FAMILIES, canvasFontCssFamily } from '../constants/fonts';
import { CHEM_TEXT_SYMBOLS } from '../constants/chemTextSymbols';

export interface TextStylePanelProps {
  selectedCanvasText: CanvasText | null;
  onUpdate: (id: string, patch: Partial<CanvasText>) => void;
  onClose: () => void;
  /** Insert a chemistry glyph at the caret (or append). */
  onInsertSymbol?: (symbol: string) => void;
  /** Docked in the 2D workspace strip / floating right rail / compact top bar. */
  variant?: 'rail' | 'workspace' | 'topbar';
}

const HEX_RE = /^#[0-9A-Fa-f]{6}$/i;

function SymbolDropdown({
  disabled,
  onInsert,
  compact,
}: {
  disabled: boolean;
  onInsert: (symbol: string) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div
      ref={wrapRef}
      className={`text-style-symbols-dd${compact ? ' text-style-symbols-dd--compact' : ''}`}
    >
      <button
        type="button"
        className={`text-style-symbols-dd__btn${open ? ' is-open' : ''}`}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Symbols"
        title="Insert chemistry symbol"
        onMouseDown={e => e.preventDefault()}
        onClick={() => setOpen(v => !v)}
      >
        <span aria-hidden>Ω</span>
        <span className="text-style-symbols-dd__label">Symbols</span>
        <ChevronDown size={11} strokeWidth={2.4} aria-hidden />
      </button>
      {open ? (
        <div className="text-style-symbols-dd__menu" role="menu" aria-label="Chemistry symbols">
          {CHEM_TEXT_SYMBOLS.map(s => (
            <button
              key={s.char}
              type="button"
              role="menuitem"
              className="text-style-symbol-btn"
              title={s.title}
              aria-label={s.title}
              onMouseDown={e => e.preventDefault()}
              onClick={() => {
                onInsert(s.char);
                setOpen(false);
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function TextStylePanel({
  selectedCanvasText,
  onUpdate,
  onClose,
  onInsertSymbol,
  variant = 'rail',
}: TextStylePanelProps) {
  const isWorkspace = variant === 'workspace';
  const isTopbar = variant === 'topbar';

  const insert = (symbol: string) => {
    if (!selectedCanvasText) return;
    if (onInsertSymbol) {
      onInsertSymbol(symbol);
      return;
    }
    onUpdate(selectedCanvasText.id, { text: `${selectedCanvasText.text}${symbol}` });
  };

  if (isTopbar) {
    if (!selectedCanvasText) return null;
    const script = selectedCanvasText.textScript ?? 'normal';
    return (
      <div className="text-style-topbar" role="toolbar" aria-label="Text appearance">
        <select
          className="text-style-topbar__font"
          value={selectedCanvasText.fontFamily ?? 'Inter'}
          aria-label="Font"
          onChange={e => onUpdate(selectedCanvasText.id, { fontFamily: e.target.value })}
        >
          {CANVAS_FONT_FAMILIES.map(f => (
            <option key={f} value={f} style={{ fontFamily: canvasFontCssFamily(f) }}>
              {f}
            </option>
          ))}
        </select>
        <label className="text-style-topbar__size">
          <span>{selectedCanvasText.fontSize}px</span>
          <input
            type="range"
            className="chrome-range"
            min={8}
            max={120}
            value={selectedCanvasText.fontSize}
            aria-label="Font size"
            onInput={e => {
              const n = parseInt((e.target as HTMLInputElement).value, 10);
              if (!Number.isNaN(n)) onUpdate(selectedCanvasText.id, { fontSize: n });
            }}
          />
        </label>
        <input
          type="color"
          className="text-style-topbar__color"
          aria-label="Text color"
          value={HEX_RE.test(selectedCanvasText.color) ? selectedCanvasText.color : '#0f172a'}
          onInput={e =>
            onUpdate(selectedCanvasText.id, { color: (e.target as HTMLInputElement).value })
          }
        />
        <button
          type="button"
          className={`text-style-icon-btn ${selectedCanvasText.fontWeight === 'bold' ? 'is-on' : ''}`}
          aria-pressed={selectedCanvasText.fontWeight === 'bold'}
          aria-label="Bold"
          onClick={() =>
            onUpdate(selectedCanvasText.id, {
              fontWeight: selectedCanvasText.fontWeight === 'bold' ? 'normal' : 'bold',
            })
          }
        >
          B
        </button>
        <button
          type="button"
          className={`text-style-icon-btn ${selectedCanvasText.fontStyle === 'italic' ? 'is-on' : ''}`}
          aria-pressed={selectedCanvasText.fontStyle === 'italic'}
          aria-label="Italic"
          onClick={() =>
            onUpdate(selectedCanvasText.id, {
              fontStyle: selectedCanvasText.fontStyle === 'italic' ? 'normal' : 'italic',
            })
          }
        >
          <Italic size={13} strokeWidth={2.25} />
        </button>
        <button
          type="button"
          className={`text-style-icon-btn ${selectedCanvasText.textDecoration === 'underline' ? 'is-on' : ''}`}
          aria-pressed={selectedCanvasText.textDecoration === 'underline'}
          aria-label="Underline"
          onClick={() =>
            onUpdate(selectedCanvasText.id, {
              textDecoration:
                selectedCanvasText.textDecoration === 'underline' ? 'none' : 'underline',
            })
          }
        >
          <Underline size={13} strokeWidth={2.25} />
        </button>
        <button
          type="button"
          className={`text-style-icon-btn ${script === 'super' ? 'is-on' : ''}`}
          aria-pressed={script === 'super'}
          aria-label="Superscript"
          onClick={() =>
            onUpdate(selectedCanvasText.id, {
              textScript: script === 'super' ? 'normal' : 'super',
            })
          }
        >
          <Superscript size={13} strokeWidth={2.25} />
        </button>
        <button
          type="button"
          className={`text-style-icon-btn ${script === 'sub' ? 'is-on' : ''}`}
          aria-pressed={script === 'sub'}
          aria-label="Subscript"
          onClick={() =>
            onUpdate(selectedCanvasText.id, {
              textScript: script === 'sub' ? 'normal' : 'sub',
            })
          }
        >
          <Subscript size={13} strokeWidth={2.25} />
        </button>
        <SymbolDropdown disabled={false} onInsert={insert} compact />
      </div>
    );
  }

  return (
    <aside
      className={`text-style-panel text-style-panel--minimal${
        isWorkspace ? ' text-style-panel--workspace' : ' text-style-panel--docked'
      }`}
      aria-label="Text appearance"
    >
      <div className="text-style-panel-header">
        <div className="text-style-panel-title">
          <Type size={14} strokeWidth={2} />
          <span>Text</span>
        </div>
        <button type="button" className="text-style-panel-close" title="Close panel" onClick={onClose}>
          ✕
        </button>
      </div>

      {selectedCanvasText ? (
        <div className={`text-style-panel-body${isWorkspace ? ' text-style-panel-body--row' : ''}`}>
          <div className="text-style-section">
            <label className="text-style-label" htmlFor="text-style-font">
              Font
            </label>
            <select
              id="text-style-font"
              className="text-style-font-select"
              value={selectedCanvasText.fontFamily ?? 'Inter'}
              onChange={e => onUpdate(selectedCanvasText.id, { fontFamily: e.target.value })}
            >
              {CANVAS_FONT_FAMILIES.map(f => (
                <option key={f} value={f} style={{ fontFamily: canvasFontCssFamily(f) }}>
                  {f}
                </option>
              ))}
            </select>
          </div>

          <div className="text-style-section">
            <label className="text-style-label" htmlFor="text-style-color">
              Color
            </label>
            <div className="text-style-color-row text-style-color-row--single">
              <input
                id="text-style-color"
                type="color"
                className="text-style-color-native"
                value={HEX_RE.test(selectedCanvasText.color) ? selectedCanvasText.color : '#0f172a'}
                onInput={e =>
                  onUpdate(selectedCanvasText.id, { color: (e.target as HTMLInputElement).value })
                }
              />
              <span className="text-style-hex-read">{selectedCanvasText.color}</span>
            </div>
          </div>

          <div className="text-style-section">
            <div className="text-style-label-row">
              <label className="text-style-label" htmlFor="text-style-size">
                Size
              </label>
              <span className="text-style-value">{selectedCanvasText.fontSize}px</span>
            </div>
            <input
              id="text-style-size"
              type="range"
              className="text-style-range"
              min={8}
              max={120}
              value={selectedCanvasText.fontSize}
              onInput={e => {
                const n = parseInt((e.target as HTMLInputElement).value, 10);
                if (!Number.isNaN(n)) onUpdate(selectedCanvasText.id, { fontSize: n });
              }}
            />
          </div>

          <div className="text-style-section">
            <span className="text-style-label">Style</span>
            <div className="text-style-type-row" role="group" aria-label="Text style">
              <button
                type="button"
                className={`text-style-chip ${selectedCanvasText.fontWeight === 'bold' ? 'text-style-chip-on' : ''}`}
                aria-pressed={selectedCanvasText.fontWeight === 'bold'}
                title="Bold"
                onClick={() =>
                  onUpdate(selectedCanvasText.id, {
                    fontWeight: selectedCanvasText.fontWeight === 'bold' ? 'normal' : 'bold',
                  })
                }
              >
                B
              </button>
              <button
                type="button"
                className={`text-style-chip ${selectedCanvasText.fontStyle === 'italic' ? 'text-style-chip-on' : ''}`}
                aria-pressed={selectedCanvasText.fontStyle === 'italic'}
                title="Italic"
                onClick={() =>
                  onUpdate(selectedCanvasText.id, {
                    fontStyle: selectedCanvasText.fontStyle === 'italic' ? 'normal' : 'italic',
                  })
                }
              >
                <Italic size={14} strokeWidth={2.5} />
              </button>
              <button
                type="button"
                className={`text-style-chip ${selectedCanvasText.textDecoration === 'underline' ? 'text-style-chip-on' : ''}`}
                aria-pressed={selectedCanvasText.textDecoration === 'underline'}
                title="Underline"
                onClick={() =>
                  onUpdate(selectedCanvasText.id, {
                    textDecoration:
                      selectedCanvasText.textDecoration === 'underline' ? 'none' : 'underline',
                  })
                }
              >
                <Underline size={14} strokeWidth={2.5} />
              </button>
            </div>
          </div>

          <div className="text-style-section">
            <span className="text-style-label">Symbols</span>
            <SymbolDropdown disabled={false} onInsert={insert} />
          </div>
        </div>
      ) : (
        <p className="text-style-panel-desc">Select canvas text to edit font, size, and color.</p>
      )}
    </aside>
  );
}
