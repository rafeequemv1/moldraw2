/**
 * Text appearance controls for the selected canvas label.
 * Lives in the left dock so molecule Color / style stays separate.
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Italic,
  Search,
  Subscript,
  Superscript,
  Underline,
  X,
} from 'lucide-react';
import type { CanvasText } from '@moldraw/domain';
import {
  resolveCanvasTextScripts,
  selectionHasUniformScript,
  toggleTextScriptRange,
} from '@moldraw/canvas/geometry';
import { CANVAS_FONT_FAMILIES, canvasFontCssFamily } from '../constants/fonts';
import {
  CHEM_TEXT_SYMBOL_GROUPS,
  filterChemTextSymbolGroups,
} from '../constants/chemTextSymbols';
import { useChromeOverlay } from '../chromeDismiss';
import { useCompactViewport } from '../hooks/useCompactViewport';
import { useLeftDockExclusive } from '../leftDockExclusive';
import { FormatPanelAccordion } from './FormatPanelAccordion';
import { getInlineTextCaret, subscribeInlineTextCaret, type InlineTextCaret } from '../inlineTextCaret';
import { MobileBottomSheet } from './MobileBottomSheet';

export interface TextStylePanelProps {
  selectedCanvasText: CanvasText | null;
  onUpdate: (id: string, patch: Partial<CanvasText>) => void;
  onClose: () => void;
  /** Insert a chemistry glyph at the caret (or append). */
  onInsertSymbol?: (symbol: string) => void;
}

const HEX_RE = /^#[0-9A-Fa-f]{6}$/i;

function PanelRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="app-top-bar__color-style-row">
      <span className="mol-color-side-label">{label}</span>
      {children}
    </div>
  );
}

function SymbolAccordion({
  onInsert,
}: {
  onInsert: (symbol: string) => void;
}) {
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const filteredGroups = useMemo(
    () => filterChemTextSymbolGroups(CHEM_TEXT_SYMBOL_GROUPS, query),
    [query],
  );

  return (
    <FormatPanelAccordion title="Symbols">
      <div className="text-style-symbols-dd text-style-symbols-dd--panel">
        <div className="text-style-symbols-dd__menu" role="group" aria-label="Chemistry symbols">
          <div className="text-style-symbols-dd__search">
            <Search size={12} strokeWidth={2} aria-hidden className="text-style-symbols-dd__search-icon" />
            <input
              ref={searchRef}
              type="search"
              className="text-style-symbols-dd__search-input"
              value={query}
              placeholder="Search symbols…"
              aria-label="Search symbols"
              autoComplete="off"
              onKeyDown={e => {
                e.stopPropagation();
                if (e.key === 'Escape') {
                  e.preventDefault();
                  if (query) setQuery('');
                }
              }}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
          <div className="text-style-symbols-dd__body">
            {filteredGroups.length === 0 ? (
              <div className="text-style-symbols-dd__empty">No matches</div>
            ) : (
              filteredGroups.map(group => (
                <div
                  key={group.id}
                  className="text-style-symbols-dd__group"
                  role="group"
                  aria-label={group.label}
                >
                  <div className="text-style-symbols-dd__group-label">{group.label}</div>
                  <div className="text-style-symbols-dd__grid">
                    {group.symbols.map(sym => (
                      <button
                        key={`${group.id}:${sym.char}`}
                        type="button"
                        className="text-style-symbol-btn"
                        title={sym.title}
                        aria-label={sym.title}
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => onInsert(sym.char)}
                      >
                        {sym.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </FormatPanelAccordion>
  );
}

function TextStyleBody({
  selectedCanvasText,
  onUpdate,
  onInsertSymbol,
}: {
  selectedCanvasText: CanvasText;
  onUpdate: (id: string, patch: Partial<CanvasText>) => void;
  onInsertSymbol?: (symbol: string) => void;
}) {
  const [caret, setCaret] = useState(getInlineTextCaret);
  useEffect(() => subscribeInlineTextCaret(next => setCaret(next)), []);
  /** Pointer chips apply on pointerdown; click must not toggle a second time. */
  const pointerAppliedRef = useRef(false);
  /** Range at pointerdown — before preventDefault / blur can collapse the textarea. */
  const scriptSelRef = useRef<InlineTextCaret | null>(null);

  // Capture-phase: snapshot the textarea range before the chip's default
  // focus steal fires `select` with a collapsed caret.
  useEffect(() => {
    const onPtr = () => {
      scriptSelRef.current = getInlineTextCaret();
    };
    document.addEventListener('pointerdown', onPtr, true);
    return () => document.removeEventListener('pointerdown', onPtr, true);
  }, []);

  const ranges = resolveCanvasTextScripts(selectedCanvasText);
  const selStart = Math.min(caret.start, caret.end);
  const selEnd = Math.max(caret.start, caret.end);
  const hasSelection = selEnd > selStart;
  const superOn = hasSelection && selectionHasUniformScript(ranges, selStart, selEnd, 'super');
  const subOn = hasSelection && selectionHasUniformScript(ranges, selStart, selEnd, 'sub');
  const align = selectedCanvasText.textAlign ?? 'left';

  const applyScript = (script: 'super' | 'sub', sel?: InlineTextCaret) => {
    const live = sel ?? scriptSelRef.current ?? getInlineTextCaret();
    const start = Math.min(live.start, live.end);
    const end = Math.max(live.start, live.end);
    if (end <= start) return;
    onUpdate(selectedCanvasText.id, {
      textScripts: toggleTextScriptRange(ranges, start, end, script, selectedCanvasText.text.length),
      textScript: 'normal',
    });
  };

  const onScriptPointerDown = (e: PointerEvent<HTMLButtonElement>, script: 'super' | 'sub') => {
    if (e.button !== 0) return;
    // Snapshot before the button's default focus steal collapses the textarea.
    scriptSelRef.current = getInlineTextCaret();
    e.preventDefault();
    pointerAppliedRef.current = true;
    applyScript(script, scriptSelRef.current);
  };

  const onScriptClick = (script: 'super' | 'sub') => {
    if (pointerAppliedRef.current) {
      pointerAppliedRef.current = false;
      return;
    }
    applyScript(script);
  };

  const insert = (symbol: string) => {
    if (onInsertSymbol) {
      onInsertSymbol(symbol);
      return;
    }
    onUpdate(selectedCanvasText.id, { text: `${selectedCanvasText.text}${symbol}` });
  };

  return (
    <div className="format-left-panel__accordions text-style-panel-body">
      <FormatPanelAccordion title="Text" pinned defaultOpen>
        <PanelRow label="Font">
          <select
            id="text-style-font"
            className="app-top-bar__color-style-select"
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
        </PanelRow>

        <PanelRow label="Color">
          <input
            id="text-style-color"
            type="color"
            className="text-style-color-native"
            value={HEX_RE.test(selectedCanvasText.color) ? selectedCanvasText.color : '#0f172a'}
            aria-label="Color"
            onInput={e =>
              onUpdate(selectedCanvasText.id, { color: (e.target as HTMLInputElement).value })
            }
          />
          <span className="app-top-bar__color-opacity-pct">{selectedCanvasText.color}</span>
        </PanelRow>

        <PanelRow label="Size">
          <input
            id="text-style-size"
            type="range"
            className="chrome-range app-top-bar__color-opacity-range"
            min={8}
            max={120}
            value={selectedCanvasText.fontSize}
            aria-label="Size"
            onInput={e => {
              const n = parseInt((e.target as HTMLInputElement).value, 10);
              if (!Number.isNaN(n)) onUpdate(selectedCanvasText.id, { fontSize: n });
            }}
          />
          <span className="app-top-bar__color-opacity-pct">{selectedCanvasText.fontSize}px</span>
        </PanelRow>

        <PanelRow label="Style">
          <div className="text-style-type-row" role="group" aria-label="Text style">
            <button
              type="button"
              className={`text-style-chip ${selectedCanvasText.fontWeight === 'bold' ? 'text-style-chip-on' : ''}`}
              aria-pressed={selectedCanvasText.fontWeight === 'bold'}
              title="Bold"
              onMouseDown={e => e.preventDefault()}
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
              onMouseDown={e => e.preventDefault()}
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
              onMouseDown={e => e.preventDefault()}
              onClick={() =>
                onUpdate(selectedCanvasText.id, {
                  textDecoration:
                    selectedCanvasText.textDecoration === 'underline' ? 'none' : 'underline',
                })
              }
            >
              <Underline size={14} strokeWidth={2.5} />
            </button>
            <button
              type="button"
              className={`text-style-chip ${superOn ? 'text-style-chip-on' : ''}`}
              aria-pressed={superOn}
              title="Superscript"
              onPointerDown={e => onScriptPointerDown(e, 'super')}
              onMouseDown={e => e.preventDefault()}
              onClick={() => onScriptClick('super')}
            >
              <Superscript size={14} strokeWidth={2.5} />
            </button>
            <button
              type="button"
              className={`text-style-chip ${subOn ? 'text-style-chip-on' : ''}`}
              aria-pressed={subOn}
              title="Subscript"
              onPointerDown={e => onScriptPointerDown(e, 'sub')}
              onMouseDown={e => e.preventDefault()}
              onClick={() => onScriptClick('sub')}
            >
              <Subscript size={14} strokeWidth={2.5} />
            </button>
          </div>
        </PanelRow>

        <PanelRow label="Align">
          <div className="text-style-type-row" role="group" aria-label="Text alignment">
            {(
              [
                ['left', AlignLeft, 'Align left'],
                ['center', AlignCenter, 'Align center'],
                ['right', AlignRight, 'Align right'],
              ] as const
            ).map(([value, Icon, title]) => (
              <button
                key={value}
                type="button"
                className={`text-style-chip ${align === value ? 'text-style-chip-on' : ''}`}
                aria-pressed={align === value}
                title={title}
                onMouseDown={e => e.preventDefault()}
                onClick={() => onUpdate(selectedCanvasText.id, { textAlign: value })}
              >
                <Icon size={14} strokeWidth={2.5} />
              </button>
            ))}
          </div>
        </PanelRow>
      </FormatPanelAccordion>

      <SymbolAccordion onInsert={insert} />
    </div>
  );
}

export function TextStylePanel({
  selectedCanvasText,
  onUpdate,
  onClose,
  onInsertSymbol,
}: TextStylePanelProps) {
  const isCompact = useCompactViewport();
  useLeftDockExclusive('text', !isCompact && !!selectedCanvasText, onClose);
  useChromeOverlay(!isCompact && !!selectedCanvasText, onClose, 'dock');

  useEffect(() => {
    if (isCompact || !selectedCanvasText) return undefined;
    document.documentElement.classList.add('format-left-panel-open');
    return () => document.documentElement.classList.remove('format-left-panel-open');
  }, [isCompact, selectedCanvasText]);

  if (!selectedCanvasText) return null;

  const body = (
    <TextStyleBody
      selectedCanvasText={selectedCanvasText}
      onUpdate={onUpdate}
      onInsertSymbol={onInsertSymbol}
    />
  );

  if (isCompact) {
    return (
      <MobileBottomSheet
        open
        onClose={onClose}
        title="Text"
        size="peek"
        dimBackdrop={false}
        ariaLabel="Text appearance"
      >
        {body}
      </MobileBottomSheet>
    );
  }

  if (typeof document === 'undefined') return null;
  return createPortal(
    <aside
      className="format-left-panel mol-color-side-panel text-style-left-dock"
      role="dialog"
      aria-label="Text appearance"
    >
      <div className="format-left-panel__head">
        <div className="mol-color-side-panel-title">Text</div>
        <button
          type="button"
          className="format-left-panel__close"
          onClick={onClose}
          aria-label="Close text style"
        >
          <X size={14} strokeWidth={2} aria-hidden />
        </button>
      </div>
      <div className="format-left-panel__scroll">{body}</div>
    </aside>,
    document.body,
  );
}
