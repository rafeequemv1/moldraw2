/**
 * Floating H/C/N/O/S/P/F/Cl/Br/I island on the 2D canvas (top-right) plus periodic table opener.
 */
import { useState } from 'react';
import { ChevronsLeft, ChevronsRight, Grid3x3 } from 'lucide-react';
import { QUICK_ELEMENT_PALETTE } from '@moldraw/domain';
import { placementPaletteShortcutLabel } from '../keyboard/shortcutCatalog';
import { PeriodicTableModal } from './PeriodicTableModal';

export interface AtomPaletteProps {
  activePlacementElement: string;
  onSelect: (symbol: string) => void;
  show3DViewer?: boolean;
  onToggle3DViewer?: () => void;
}

export function AtomPalette({
  activePlacementElement,
  onSelect,
  show3DViewer = false,
  onToggle3DViewer,
}: AtomPaletteProps) {
  const [periodicOpen, setPeriodicOpen] = useState(false);
  const quickActive = QUICK_ELEMENT_PALETTE.some(
    e => e !== 'divider' && e.sym === activePlacementElement,
  );

  return (
    <>
      <aside className="element-island element-island--dock" aria-label="Atom palette">
        {QUICK_ELEMENT_PALETTE.map((row, i) =>
          row === 'divider' ? (
            <div key={`el-div-${i}`} className="element-island-divider" role="separator" />
          ) : (
            <button
              key={row.sym}
              type="button"
              data-el={row.sym}
              className={`element-island-btn ${
                activePlacementElement === row.sym ? 'element-island-btn-active' : ''
              }`}
              style={{ color: row.color }}
              title={(() => {
                const kb = placementPaletteShortcutLabel(row.sym);
                const base = `Place ${row.sym} (click canvas or extend bonds / chain)`;
                return kb ? `${base} — keyboard ${kb}` : base;
              })()}
              aria-pressed={activePlacementElement === row.sym}
              onClick={() => onSelect(row.sym)}
            >
              <span
                className={
                  row.sym.length > 1 ? 'element-island-symbol-sm' : 'element-island-symbol'
                }
              >
                {row.sym}
              </span>
            </button>
          ),
        )}
        <div className="element-island-divider" role="separator" />
        <button
          type="button"
          className={`element-island-btn element-island-btn--periodic${
            !quickActive || periodicOpen ? ' element-island-btn-active' : ''
          }`}
          title="Periodic table — all elements"
          aria-label="Open periodic table"
          aria-haspopup="dialog"
          aria-expanded={periodicOpen}
          onClick={() => setPeriodicOpen(true)}
        >
          <Grid3x3 size={14} strokeWidth={2} />
          {!quickActive ? (
            <span className="element-island-symbol-sm" style={{ marginTop: 2 }}>
              {activePlacementElement}
            </span>
          ) : null}
        </button>
        {onToggle3DViewer ? (
          <>
            <div className="element-island-divider" role="separator" />
            <button
              type="button"
              className={`element-island-btn element-island-btn--3d-toggle${show3DViewer ? ' is-open' : ''}`}
              title={show3DViewer ? 'Hide 3D viewer' : 'Show 3D viewer'}
              aria-label={show3DViewer ? 'Hide 3D viewer' : 'Show 3D viewer'}
              aria-pressed={show3DViewer}
              onClick={onToggle3DViewer}
            >
              {show3DViewer ? (
                <ChevronsRight size={18} strokeWidth={2.6} aria-hidden />
              ) : (
                <ChevronsLeft size={18} strokeWidth={2.6} aria-hidden />
              )}
            </button>
          </>
        ) : null}
      </aside>
      <PeriodicTableModal
        open={periodicOpen}
        activeElement={activePlacementElement}
        onClose={() => setPeriodicOpen(false)}
        onSelect={onSelect}
      />
    </>
  );
}
