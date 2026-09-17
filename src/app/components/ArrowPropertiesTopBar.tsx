/**
 * Context-aware arrow controls in the top bar (shown when a reaction arrow is selected).
 */
import { useEffect, useRef } from 'react';
import type { ReactionArrow, ReactionArrowKind, ReactionArrowUpdatePatch } from '@moldraw/domain';
import { REACTION_ARROW_KIND_ORDER, reactionArrowSupportsReagentLabels, resolveReagentFontSize } from '@moldraw/domain';
import { ReagentFontSizeStepper } from './ReagentFontSizeStepper';

const KIND_LABELS: Record<ReactionArrowKind, string> = {
  straight: 'Straight',
  curved: 'Curved',
  s_curve: 'S-curve',
  path: 'Path',
  row_wrap: 'Wrap',
  cycle_arc: 'Cycle',
  retrosynthetic: 'Retro',
  equilibrium: 'Equilibrium',
  half_equilibrium: 'Half eq.',
  electron_flow: 'Electron flow',
  resonance: '↔',
};

export interface ArrowPropertiesTopBarProps {
  arrow: ReactionArrow;
  onUpdate: (id: string, patch: ReactionArrowUpdatePatch) => void;
  /** Focus a reagent field when user clicks a slot on the arrow. */
  focusSlot?: 'above' | 'below' | null;
}

export function ArrowPropertiesTopBar({ arrow, onUpdate, focusSlot }: ArrowPropertiesTopBarProps) {
  const aboveRef = useRef<HTMLInputElement>(null);
  const belowRef = useRef<HTMLInputElement>(null);
  const kind = arrow.kind ?? 'straight';
  const strokeWidth = arrow.strokeWidth ?? 2;
  const isElectronFlow = kind === 'electron_flow';
  const showReagents = reactionArrowSupportsReagentLabels(kind);

  useEffect(() => {
    if (!focusSlot) return;
    const el = focusSlot === 'above' ? aboveRef.current : belowRef.current;
    el?.focus({ preventScroll: true });
    el?.select();
  }, [focusSlot, arrow.id]);

  return (
    <div className="arrow-topbar" role="toolbar" aria-label="Arrow properties">
      <select
        className="arrow-topbar__select"
        value={kind}
        aria-label="Arrow type"
        title="Arrow type"
        onChange={e => onUpdate(arrow.id, { kind: e.target.value as ReactionArrowKind })}
      >
        {REACTION_ARROW_KIND_ORDER.map(k => (
          <option key={k} value={k}>
            {KIND_LABELS[k]}
          </option>
        ))}
      </select>
      {isElectronFlow ? (
        <select
          className="arrow-topbar__select arrow-topbar__select--narrow"
          value={arrow.headStyle ?? 'pair'}
          aria-label="Electron head"
          title="Electron head"
          onChange={e =>
            onUpdate(arrow.id, { headStyle: e.target.value as 'single' | 'pair' })
          }
        >
          <option value="pair">2e⁻ pair</option>
          <option value="single">Fishhook 1e⁻</option>
        </select>
      ) : null}
      <label className="arrow-topbar__weight" title="Line weight">
        <span className="arrow-topbar__weight-label">Wt</span>
        <input
          type="range"
          className="chrome-range"
          min={1}
          max={5}
          step={0.25}
          value={strokeWidth}
          aria-label="Line weight"
          onChange={e => onUpdate(arrow.id, { strokeWidth: Number(e.target.value) })}
        />
      </label>
      {showReagents ? (
        <>
          <span className="arrow-topbar__sep" aria-hidden />
          <select
            className="arrow-topbar__select arrow-topbar__select--narrow"
            value={arrow.reagentFormat ?? 'auto'}
            aria-label="Reagent format"
            title="Reagent format"
            onChange={e =>
              onUpdate(arrow.id, {
                reagentFormat: e.target.value as 'plain' | 'auto' | 'latex',
              })
            }
          >
            <option value="plain">Plain</option>
            <option value="auto">Auto</option>
            <option value="latex">LaTeX</option>
          </select>
          <input
            ref={aboveRef}
            type="text"
            className="arrow-topbar__input"
            spellCheck={false}
            placeholder="Above"
            value={arrow.reagentAbove ?? ''}
            aria-label="Reagent above arrow"
            onChange={e => onUpdate(arrow.id, { reagentAbove: e.target.value })}
          />
          <ReagentFontSizeStepper
            compact
            value={resolveReagentFontSize(arrow, 'above')}
            ariaLabel="Above text size"
            onChange={n => onUpdate(arrow.id, { reagentAboveFontSize: n })}
          />
          <input
            ref={belowRef}
            type="text"
            className="arrow-topbar__input"
            spellCheck={false}
            placeholder="Below"
            value={arrow.reagentBelow ?? ''}
            aria-label="Reagent below arrow"
            onChange={e => onUpdate(arrow.id, { reagentBelow: e.target.value })}
          />
          <ReagentFontSizeStepper
            compact
            value={resolveReagentFontSize(arrow, 'below')}
            ariaLabel="Below text size"
            onChange={n => onUpdate(arrow.id, { reagentBelowFontSize: n })}
          />
        </>
      ) : null}
    </div>
  );
}
