/**
 * Compact font-size stepper for reaction-arrow reagent / condition labels.
 */
import {
  clampReagentFontSize,
  REAGENT_FONT_SIZE_MAX,
  REAGENT_FONT_SIZE_MIN,
} from '@moldraw/domain';

export interface ReagentFontSizeStepperProps {
  value: number;
  ariaLabel: string;
  onChange: (next: number) => void;
  compact?: boolean;
}

export function ReagentFontSizeStepper({
  value,
  ariaLabel,
  onChange,
  compact = false,
}: ReagentFontSizeStepperProps) {
  const set = (n: number) => onChange(clampReagentFontSize(n));
  const cls = compact ? 'arrow-topbar__size' : 'arrow-params__size';
  return (
    <span className={cls} title={`${ariaLabel} (${value}px)`}>
      <button
        type="button"
        className={`${cls}-btn`}
        aria-label={`${ariaLabel} smaller`}
        onMouseDown={e => e.preventDefault()}
        onClick={() => set(value - 1)}
      >
        −
      </button>
      <input
        type="number"
        className={`${cls}-input`}
        min={REAGENT_FONT_SIZE_MIN}
        max={REAGENT_FONT_SIZE_MAX}
        step={1}
        value={value}
        aria-label={ariaLabel}
        onChange={e => {
          const n = Number(e.target.value);
          if (!Number.isNaN(n)) set(n);
        }}
      />
      <button
        type="button"
        className={`${cls}-btn`}
        aria-label={`${ariaLabel} larger`}
        onMouseDown={e => e.preventDefault()}
        onClick={() => set(value + 1)}
      >
        +
      </button>
    </span>
  );
}
