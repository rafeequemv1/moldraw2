/**
 * Inline expand/collapse row for mobile bottom sheets.
 * Tap the trigger to reveal nested actions in the same sheet (no flyout).
 */
import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export interface MobileSheetAccordionProps {
  open: boolean;
  onToggle: () => void;
  label: ReactNode;
  icon?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  triggerClassName?: string;
}

export function MobileSheetAccordion({
  open,
  onToggle,
  label,
  icon,
  hint,
  children,
  triggerClassName = 'mobile-sheet-list__btn',
}: MobileSheetAccordionProps) {
  return (
    <div className={`mobile-sheet-accordion${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className={`${triggerClassName} mobile-sheet-accordion__trigger`}
        aria-expanded={open}
        onClick={e => {
          e.stopPropagation();
          onToggle();
        }}
      >
        {icon}
        <span className="mobile-sheet-accordion__label">{label}</span>
        {hint}
        <ChevronDown size={16} strokeWidth={2} className="mobile-sheet-accordion__chevron" aria-hidden />
      </button>
      {open ? (
        <div className="mobile-sheet-accordion__body" role="group">
          {children}
        </div>
      ) : null}
    </div>
  );
}
