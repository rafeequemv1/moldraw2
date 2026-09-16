/**
 * Full periodic-table picker for atom placement / element change.
 */
import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import {
  PERIODIC_TABLE_CELLS,
  PERIODIC_TABLE_COLUMNS,
  type PeriodicTableCell,
} from '@moldraw/domain';
import '../../styles/periodic-table-modal.css';
import { useChromeOverlay } from '../chromeDismiss';

export interface PeriodicTableModalProps {
  open: boolean;
  activeElement: string;
  onClose: () => void;
  onSelect: (symbol: string) => void;
}

export function PeriodicTableModal({
  open,
  activeElement,
  onClose,
  onSelect,
}: PeriodicTableModalProps) {
  const [filter, setFilter] = useState('');
  useChromeOverlay(open, onClose, 'modal');

  useEffect(() => {
    if (!open) setFilter('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const q = filter.trim().toLowerCase();
  const cells = useMemo(() => {
    if (!q) return PERIODIC_TABLE_CELLS;
    return PERIODIC_TABLE_CELLS.map(c => {
      if (!c) return null;
      if (c.sym.toLowerCase().includes(q) || String(c.z).includes(q)) return c;
      return null;
    });
  }, [q]);

  if (!open) return null;

  return (
    <div
      className="periodic-table-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Periodic table"
    >
      <div className="periodic-table-dialog">
        <header className="periodic-table-header">
          <div>
            <div className="periodic-table-header__title">Periodic table</div>
            <div className="periodic-table-header__subtitle">
              Pick an element for placement (active: {activeElement})
            </div>
          </div>
          <button type="button" className="periodic-table-close" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="periodic-table-toolbar">
          <input
            type="search"
            className="periodic-table-search"
            placeholder="Search symbol or atomic number…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            aria-label="Search elements"
            autoFocus
          />
        </div>
        <div
          className="periodic-table-grid"
          style={{ gridTemplateColumns: `repeat(${PERIODIC_TABLE_COLUMNS}, minmax(0, 1fr))` }}
        >
          {cells.map((c: PeriodicTableCell, i) =>
            c ? (
              <button
                key={`${c.sym}-${i}`}
                type="button"
                className={`periodic-table-cell${activeElement === c.sym ? ' is-active' : ''}`}
                style={{ color: c.color }}
                title={`${c.sym} (Z=${c.z})`}
                onClick={() => {
                  onSelect(c.sym);
                  onClose();
                }}
              >
                <span className="periodic-table-cell__z">{c.z}</span>
                <span className="periodic-table-cell__sym">{c.sym}</span>
              </button>
            ) : (
              <div key={`empty-${i}`} className="periodic-table-cell periodic-table-cell--empty" />
            ),
          )}
        </div>
      </div>
    </div>
  );
}
