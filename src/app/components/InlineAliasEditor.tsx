/**
 * In-place atom / functional-group label editor.
 * Feels like a text field: input stays pinned on the atom; suggestions drop below.
 */
import { forwardRef, useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { ABBREV_TEMPLATE_MAP, buildAliasDisplayRuns } from '@moldraw/domain';
import type { AliasSuggestionItem } from '../types';
import { useIsTouchUi } from '../hooks/useCompactViewport';
import { AliasTouchKeypad } from './AliasTouchKeypad';

function AliasRunsPreview({ draft }: { draft: string }) {
  const runs = buildAliasDisplayRuns(draft);
  if (!runs.length) return <span className="alias-inline-editor__mirror-placeholder">&nbsp;</span>;
  return (
    <>
      {runs.map((run, i) =>
        run.kind === 'sub' ? (
          <sub key={i}>{run.text}</sub>
        ) : (
          <span key={i}>{run.text}</span>
        ),
      )}
    </>
  );
}

export interface InlineAliasEditorProps {
  position: { left: number; top: number; zoom: number };
  draft: string;
  onDraftChange: (next: string) => void;
  suggestions: AliasSuggestionItem[];
  suggestIndex: number;
  onSuggestIndexChange: (next: number) => void;
  focused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  activePreviewKey: string | null;
  setActivePreviewKey: (key: string | null) => void;
  activePreviewPinned: boolean;
  setActivePreviewPinned: (pinned: boolean | ((prev: boolean) => boolean)) => void;
  error: string | null;
  onCommit: (draftOverride?: string) => void;
  onCancel: () => void;
}

export const InlineAliasEditor = forwardRef<HTMLInputElement, InlineAliasEditorProps>(
  function InlineAliasEditor(
    {
      position,
      draft,
      onDraftChange,
      suggestions,
      suggestIndex,
      onSuggestIndexChange,
      focused,
      onFocus,
      onBlur,
      activePreviewKey,
      setActivePreviewKey,
      activePreviewPinned,
      error,
      onCommit,
      onCancel,
    },
    ref,
  ) {
    const listId = useId();
    const rootRef = useRef<HTMLDivElement>(null);
    const [suggestionsOpen, setSuggestionsOpen] = useState(false);
    const ignoreBlurCommitRef = useRef(false);
    const touchUi = useIsTouchUi();
    const fontPx = Math.max(12, 15 * position.zoom);
    const showPanel = suggestionsOpen && suggestions.length > 0;

    useEffect(() => {
      if (!focused) setSuggestionsOpen(false);
    }, [focused]);

    const acceptSuggestion = (value: string) => {
      const v = value.trim();
      if (!v) return;
      onDraftChange(v);
      onSuggestIndexChange(0);
      setSuggestionsOpen(false);
      onCommit(v);
    };

    const commitFromBlur = () => {
      if (ignoreBlurCommitRef.current) {
        ignoreBlurCommitRef.current = false;
        return;
      }
      // Click moved into caret / panel — keep editing.
      const active = document.activeElement;
      if (active && rootRef.current?.contains(active)) return;
      onCommit();
    };

    return (
      <div
        ref={rootRef}
        className="alias-inline-editor"
        style={{
          left: position.left,
          top: position.top,
        }}
      >
        {/* Anchor size = input row only so opening the panel never shifts the text. */}
        <div className="alias-inline-editor__anchor">
          {touchUi ? (
            <AliasTouchKeypad
              draft={draft}
              onDraftChange={next => {
                onDraftChange(next);
                onSuggestIndexChange(0);
              }}
              onCommit={() => {
                setSuggestionsOpen(false);
                onCommit();
              }}
              onCancel={() => {
                setSuggestionsOpen(false);
                onCancel();
              }}
            />
          ) : null}
          <div className={`alias-inline-editor__row${focused ? ' alias-inline-editor__row--focus' : ''}`}>
            <div className="alias-inline-editor__input-wrap" style={{ fontSize: `${fontPx}px` }}>
              <span className="alias-inline-editor__mirror" aria-hidden="true">
                <AliasRunsPreview draft={draft} />
              </span>
              <input
                ref={ref}
                type="text"
                className="canvas-inline-text alias-inline-editor__input alias-inline-editor__input--overlay"
                value={draft}
                size={Math.max(2, Math.min(24, draft.length + 1))}
                onChange={e => {
                  onDraftChange(e.target.value);
                  onSuggestIndexChange(0);
                }}
                onFocus={onFocus}
                onBlur={() => {
                  onBlur();
                  window.setTimeout(commitFromBlur, 0);
                }}
                onKeyDown={e => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setSuggestionsOpen(false);
                    onCancel();
                    return;
                  }
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    if (!suggestionsOpen) {
                      setSuggestionsOpen(true);
                      onSuggestIndexChange(0);
                      return;
                    }
                    if (suggestions.length) {
                      onSuggestIndexChange(Math.min(suggestions.length - 1, suggestIndex + 1));
                    }
                    return;
                  }
                  if (e.key === 'ArrowUp' && suggestionsOpen && suggestions.length) {
                    e.preventDefault();
                    onSuggestIndexChange(Math.max(0, suggestIndex - 1));
                    return;
                  }
                  if ((e.key === 'Enter' || e.key === 'Tab') && suggestionsOpen && suggestions.length) {
                    e.preventDefault();
                    const pick =
                      suggestions[Math.max(0, Math.min(suggestIndex, suggestions.length - 1))];
                    if (pick?.value?.trim()) acceptSuggestion(pick.value);
                    else (e.currentTarget as HTMLInputElement).blur();
                    return;
                  }
                  if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault();
                    setSuggestionsOpen(false);
                    (e.currentTarget as HTMLInputElement).blur();
                  }
                }}
                spellCheck={false}
                aria-label="Functional group label"
                aria-autocomplete="list"
                aria-expanded={showPanel}
                aria-controls={showPanel ? listId : undefined}
                style={{ fontSize: `${fontPx}px` }}
              />
            </div>
            {suggestions.length > 0 ? (
              <button
                type="button"
                className={`alias-inline-editor__caret${suggestionsOpen ? ' alias-inline-editor__caret--open' : ''}`}
                aria-label={suggestionsOpen ? 'Hide suggestions' : 'Show suggestions'}
                aria-expanded={suggestionsOpen}
                tabIndex={-1}
                onMouseDown={e => {
                  e.preventDefault();
                  ignoreBlurCommitRef.current = true;
                  setSuggestionsOpen(v => !v);
                }}
              >
                <ChevronDown size={11} strokeWidth={2} aria-hidden />
              </button>
            ) : null}
          </div>

          {(showPanel || error) ? (
            <div className="alias-inline-editor__dropdown">
              {showPanel ? (
                <div id={listId} className="alias-inline-editor__panel" role="listbox">
                  {suggestions.slice(0, 10).map((s, idx) => (
                    <button
                      key={`${s.value}-${idx}`}
                      type="button"
                      role="option"
                      aria-selected={idx === suggestIndex}
                      className={`alias-inline-editor__option${idx === suggestIndex ? ' alias-inline-editor__option--active' : ''}`}
                      onMouseDown={e => {
                        e.preventDefault();
                        ignoreBlurCommitRef.current = true;
                        acceptSuggestion(s.value);
                      }}
                      onMouseEnter={() => {
                        onSuggestIndexChange(idx);
                        if (!activePreviewPinned) setActivePreviewKey(s.key ?? null);
                      }}
                      onMouseLeave={() => {
                        if (!activePreviewPinned) setActivePreviewKey(null);
                      }}
                      title={`Use ${s.value}`}
                    >
                      <span className="alias-inline-editor__option-label">{s.value}</span>
                      {!s.custom && s.category ? (
                        <span className="alias-inline-editor__option-meta">
                          {s.category === 'protecting_group' ? 'PG' : s.category}
                        </span>
                      ) : s.custom ? (
                        <span className="alias-inline-editor__option-meta">custom</span>
                      ) : null}
                    </button>
                  ))}
                  {activePreviewKey && ABBREV_TEMPLATE_MAP[activePreviewKey]?.preview ? (
                    <div className="alias-inline-editor__preview" aria-hidden>
                      <svg viewBox="0 0 96 44" width="100%" height={40}>
                        {ABBREV_TEMPLATE_MAP[activePreviewKey].preview.bonds.map((b, i) => {
                          const a = ABBREV_TEMPLATE_MAP[activePreviewKey].preview.atoms[b[0]];
                          const c = ABBREV_TEMPLATE_MAP[activePreviewKey].preview.atoms[b[1]];
                          if (!a || !c) return null;
                          return (
                            <line
                              key={`pb-${i}`}
                              x1={a.x}
                              y1={a.y}
                              x2={c.x}
                              y2={c.y}
                              stroke="#334155"
                              strokeWidth={b[2] === 2 ? 1.8 : 1.2}
                            />
                          );
                        })}
                        {ABBREV_TEMPLATE_MAP[activePreviewKey].preview.atoms.map((a, i) => (
                          <text
                            key={`pa-${i}`}
                            x={a.x}
                            y={a.y + 3}
                            textAnchor="middle"
                            fontSize={9}
                            fontWeight={a.attach ? 700 : 600}
                            fill={a.attach ? '#0ea5e9' : '#0f172a'}
                          >
                            {a.el}
                          </text>
                        ))}
                      </svg>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {error ? <div className="alias-inline-editor__error">{error}</div> : null}
            </div>
          ) : null}
        </div>
      </div>
    );
  },
);
