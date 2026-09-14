/**
 * Always-on bottom status bar: formula, MW, net charge, selection count,
 * and selected glassware / canvas-shape name.
 */
import { useMemo } from 'react';
import {
  getGlasswareEntry,
  isLabGlasswareShape,
  type Molecule,
} from '@moldraw/domain';
import { getMolecularData } from '@moldraw/core';

export interface MoleculeStatusBarProps {
  molecule: Molecule;
  selectedAtomIds: string[];
  /** Selected canvas shape id (glassware / annotation). */
  selectedCanvasShapeId?: string | null;
}

const formatFormula = (order: string[], counts: Record<string, number>): string =>
  order.map(el => (counts[el]! > 1 ? `${el}${counts[el]}` : el)).join('') || '—';

const formatCharge = (charge: number): string => {
  if (charge === 0) return '0';
  if (charge > 0) return `+${charge}`;
  return String(charge);
};

function humanizeKind(kind: string): string {
  return kind
    .split('_')
    .map(w => (w.length ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');
}

export function MoleculeStatusBar({
  molecule,
  selectedAtomIds,
  selectedCanvasShapeId = null,
}: MoleculeStatusBarProps) {
  const stats = useMemo(() => {
    const idSet = selectedAtomIds.length > 0 ? new Set(selectedAtomIds) : null;
    const atoms = idSet ? molecule.atoms.filter(a => idSet.has(a.id)) : molecule.atoms;
    const bonds = idSet
      ? molecule.bonds.filter(b => idSet.has(b.fromAtomId) && idSet.has(b.toAtomId))
      : molecule.bonds;
    if (atoms.length === 0) {
      return {
        formula: '—',
        mw: null as number | null,
        charge: 0,
        selCount: 0,
        scope: 'empty' as const,
      };
    }
    const sub: Molecule = { atoms, bonds };
    const { empirical, mw } = getMolecularData(sub);
    const charge = atoms.reduce((s, a) => s + (a.charge || 0), 0);
    return {
      formula: formatFormula(empirical.order, empirical.counts),
      mw,
      charge,
      selCount: selectedAtomIds.length,
      scope: selectedAtomIds.length > 0 ? ('selection' as const) : ('molecule' as const),
    };
  }, [molecule, selectedAtomIds]);

  const apparatusLabel = useMemo(() => {
    if (!selectedCanvasShapeId) return null;
    const shape = (molecule.canvasShapes ?? []).find(s => s.id === selectedCanvasShapeId);
    if (!shape) return null;
    if (isLabGlasswareShape(shape.kind)) {
      return getGlasswareEntry(shape.kind)?.label ?? humanizeKind(shape.kind);
    }
    return humanizeKind(shape.kind);
  }, [molecule.canvasShapes, selectedCanvasShapeId]);

  return (
    <footer className="molecule-status-bar" role="status" aria-live="polite">
      <span className="molecule-status-bar__item" title={stats.scope === 'selection' ? 'Selection formula' : 'Molecule formula'}>
        <span className="molecule-status-bar__label">Formula</span>
        <span className="molecule-status-bar__value molecule-status-bar__formula">{stats.formula}</span>
      </span>
      <span className="molecule-status-bar__sep" aria-hidden />
      <span className="molecule-status-bar__item" title="Molecular weight (g/mol)">
        <span className="molecule-status-bar__label">MW</span>
        <span className="molecule-status-bar__value">
          {stats.mw != null ? stats.mw.toFixed(2) : '—'}
        </span>
      </span>
      <span className="molecule-status-bar__sep" aria-hidden />
      <span className="molecule-status-bar__item" title="Net formal charge">
        <span className="molecule-status-bar__label">Charge</span>
        <span className="molecule-status-bar__value">{formatCharge(stats.charge)}</span>
      </span>
      <span className="molecule-status-bar__sep" aria-hidden />
      <span className="molecule-status-bar__item" title="Selected atoms (0 = whole molecule stats)">
        <span className="molecule-status-bar__label">Sel</span>
        <span className="molecule-status-bar__value">{stats.selCount}</span>
      </span>
      {apparatusLabel ? (
        <>
          <span className="molecule-status-bar__sep" aria-hidden />
          <span
            className="molecule-status-bar__item molecule-status-bar__item--apparatus"
            title="Selected apparatus / canvas shape"
          >
            <span className="molecule-status-bar__label">Apparatus</span>
            <span className="molecule-status-bar__value">{apparatusLabel}</span>
          </span>
        </>
      ) : null}
      {stats.scope === 'selection' ? (
        <span className="molecule-status-bar__hint">selection</span>
      ) : null}
    </footer>
  );
}
