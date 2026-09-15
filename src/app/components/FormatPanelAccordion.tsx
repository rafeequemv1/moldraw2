import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export interface FormatPanelAccordionProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  /** When true, section is always expanded (no toggle). */
  pinned?: boolean;
}

export function FormatPanelAccordion({
  title,
  children,
  defaultOpen = false,
  pinned = false,
}: FormatPanelAccordionProps) {
  const [open, setOpen] = useState(defaultOpen || pinned);

  if (pinned) {
    return (
      <section className="format-panel-accordion format-panel-accordion--pinned">
        <div className="format-panel-accordion__trigger format-panel-accordion__trigger--static">
          {title}
        </div>
        <div className="format-panel-accordion__body">{children}</div>
      </section>
    );
  }

  return (
    <section className={`format-panel-accordion${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="format-panel-accordion__trigger"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
      >
        <ChevronDown size={12} strokeWidth={2.2} className="format-panel-accordion__chevron" aria-hidden />
        <span>{title}</span>
      </button>
      {open ? <div className="format-panel-accordion__body">{children}</div> : null}
    </section>
  );
}
