/**
 * Left-dock inspector for reaction / electron-flow arrows.
 * Shown when the Arrow tool is active or an arrow is selected.
 */
import { useEffect, useRef, useState } from 'react';
import type {
  ArrowHeadStyle,
  ArrowTailStyle,
  ReactionArrow,
  ReactionArrowKind,
  ReactionArrowUpdatePatch,
} from '@moldraw/domain';
import {
  CURVED_ARROW_DEFAULT_HEAD_SCALE,
  ELECTRON_FLOW_DEFAULT_HEAD_SCALE,
  REACTION_ARROW_KIND_ORDER,
  reactionArrowSupportsReagentLabels,
  resolveArrowHeadKind,
  resolveReagentFontSize,
} from '@moldraw/domain';
import { LeftParamsPanel } from './LeftParamsPanel';
import { MobileBottomSheet } from './MobileBottomSheet';
import { ReagentFontSizeStepper } from './ReagentFontSizeStepper';
import { useCompactViewport } from '../hooks/useCompactViewport';

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

const HEAD_OPTIONS: { value: ArrowHeadStyle; label: string }[] = [
  { value: 'filled', label: 'Filled' },
  { value: 'open', label: 'Open' },
  { value: 'single', label: 'Fishhook' },
  { value: 'none', label: 'None' },
];

const TAIL_OPTIONS: { value: ArrowTailStyle; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'bar', label: 'Bar' },
  { value: 'reverse', label: 'Reverse' },
  { value: 'circle', label: 'Circle' },
];

export interface ArrowPropertiesPanelProps {
  arrow: ReactionArrow | null;
  toolActive: boolean;
  toolKind?: ReactionArrowKind;
  defaultHeadStyle: ArrowHeadStyle;
  defaultTailStyle: ArrowTailStyle;
  defaultHeadScale: number;
  onUpdateArrow?: (id: string, patch: ReactionArrowUpdatePatch) => void;
  onChangeDefaults?: (patch: {
    headStyle?: ArrowHeadStyle;
    tailStyle?: ArrowTailStyle;
    headScale?: number;
  }) => void;
  focusSlot?: 'above' | 'below' | null;
}

export function ArrowPropertiesPanel({
  arrow,
  toolActive,
  toolKind = 'electron_flow',
  defaultHeadStyle,
  defaultTailStyle,
  defaultHeadScale,
  onUpdateArrow,
  onChangeDefaults,
  focusSlot,
}: ArrowPropertiesPanelProps) {
  const isCompact = useCompactViewport();
  const [dismissed, setDismissed] = useState(false);
  const aboveRef = useRef<HTMLInputElement>(null);
  const belowRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDismissed(false);
  }, [arrow?.id, toolActive]);

  useEffect(() => {
    if (!focusSlot) return;
    const el = focusSlot === 'above' ? aboveRef.current : belowRef.current;
    el?.focus({ preventScroll: true });
    el?.select();
  }, [focusSlot, arrow?.id]);

  const open = (toolActive || !!arrow) && !dismissed;
  if (!open) return null;

  const kind = arrow?.kind ?? toolKind;
  const isElectronFlow = kind === 'electron_flow';
  const showReagents = arrow ? reactionArrowSupportsReagentLabels(kind) : false;
  const headStyle = arrow?.headStyle ?? defaultHeadStyle;
  const tailStyle = arrow?.tailStyle ?? defaultTailStyle;
  const fallbackHeadScale =
    kind === 'curved' &&
    (defaultHeadScale === ELECTRON_FLOW_DEFAULT_HEAD_SCALE || defaultHeadScale == null)
      ? CURVED_ARROW_DEFAULT_HEAD_SCALE
      : defaultHeadScale;
  const headScale = arrow?.headScale ?? fallbackHeadScale;
  const headSelect = resolveArrowHeadKind(headStyle);

  const patch = (p: ReactionArrowUpdatePatch) => {
    if (arrow && onUpdateArrow) onUpdateArrow(arrow.id, p);
    else onChangeDefaults?.(p);
  };

  const applyHead = (value: ArrowHeadStyle) => {
    if (arrow && onUpdateArrow) onUpdateArrow(arrow.id, { headStyle: value });
    onChangeDefaults?.({ headStyle: value });
  };
  const applyTail = (value: ArrowTailStyle) => {
    if (arrow && onUpdateArrow) onUpdateArrow(arrow.id, { tailStyle: value });
    onChangeDefaults?.({ tailStyle: value });
  };
  const applyScale = (value: number) => {
    if (arrow && onUpdateArrow) onUpdateArrow(arrow.id, { headScale: value });
    onChangeDefaults?.({ headScale: value });
  };

  const title = isElectronFlow ? 'Electron flow' : 'Arrow';
  const fields = (
    <>
      {showReagents && arrow ? (
        <>
          <div className="arrow-params__field arrow-params__field--reagent">
            <span>Above</span>
            <input
              ref={aboveRef}
              type="text"
              spellCheck={false}
              value={arrow.reagentAbove ?? ''}
              aria-label="Reagent above arrow"
              title="Click above the arrow or type here"
              onChange={e => patch({ reagentAbove: e.target.value })}
            />
            <ReagentFontSizeStepper
              value={resolveReagentFontSize(arrow, 'above')}
              ariaLabel="Above text size"
              onChange={n => patch({ reagentAboveFontSize: n })}
            />
          </div>
          <div className="arrow-params__field arrow-params__field--reagent">
            <span>Below</span>
            <input
              ref={belowRef}
              type="text"
              spellCheck={false}
              value={arrow.reagentBelow ?? ''}
              aria-label="Reagent below arrow"
              onChange={e => patch({ reagentBelow: e.target.value })}
            />
            <ReagentFontSizeStepper
              value={resolveReagentFontSize(arrow, 'below')}
              ariaLabel="Below text size"
              onChange={n => patch({ reagentBelowFontSize: n })}
            />
          </div>
          <label className="arrow-params__field">
            <span>Format</span>
            <select
              value={arrow.reagentFormat ?? 'auto'}
              aria-label="Reagent format"
              onChange={e =>
                patch({ reagentFormat: e.target.value as 'plain' | 'auto' | 'latex' })
              }
            >
              <option value="plain">Plain</option>
              <option value="auto">Auto</option>
              <option value="latex">LaTeX</option>
            </select>
          </label>
        </>
      ) : null}

      {arrow ? (
        <label className="arrow-params__field">
          <span>Type</span>
          <select
            value={kind}
            aria-label="Arrow type"
            onChange={e => patch({ kind: e.target.value as ReactionArrowKind })}
          >
            {REACTION_ARROW_KIND_ORDER.map(k => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="arrow-params__field">
        <span>Head</span>
        <select
          value={headSelect === 'open' ? 'open' : headSelect}
          aria-label="Arrow head style"
          onChange={e => applyHead(e.target.value as ArrowHeadStyle)}
        >
          {HEAD_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <label className="arrow-params__field">
        <span>Tail</span>
        <select
          value={tailStyle}
          aria-label="Arrow tail style"
          onChange={e => applyTail(e.target.value as ArrowTailStyle)}
        >
          {TAIL_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <label className="arrow-params__field arrow-params__field--slider">
        <span>Head size</span>
        <input
          type="range"
          className="chrome-range"
          min={0.4}
          max={1.6}
          step={0.05}
          value={headScale}
          aria-label="Arrow head size"
          onChange={e => applyScale(Number(e.target.value))}
        />
        <span className="arrow-params__num">{headScale.toFixed(2)}</span>
      </label>

      {arrow ? (
        <label className="arrow-params__field arrow-params__field--slider">
          <span>Weight</span>
          <input
            type="range"
            className="chrome-range"
            min={1}
            max={5}
            step={0.25}
            value={arrow.strokeWidth ?? 2}
            aria-label="Line weight"
            onChange={e => patch({ strokeWidth: Number(e.target.value) })}
          />
        </label>
      ) : null}
    </>
  );

  if (isCompact) {
    return (
      <MobileBottomSheet
        open
        onClose={() => setDismissed(true)}
        title={title}
        size="auto"
        dimBackdrop={false}
        className="mobile-sheet--params mobile-sheet--arrow"
        ariaLabel="Arrow settings"
      >
        <div className="left-params-panel__body left-params-panel__body--sheet">{fields}</div>
      </MobileBottomSheet>
    );
  }

  return (
    <LeftParamsPanel
      title={title}
      onClose={() => setDismissed(true)}
      className="left-params-panel--arrow"
      ariaLabel="Arrow settings"
    >
      {fields}
    </LeftParamsPanel>
  );
}

export { ELECTRON_FLOW_DEFAULT_HEAD_SCALE };
