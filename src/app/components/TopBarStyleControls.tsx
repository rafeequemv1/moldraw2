/**
 * Compact top-bar font / bond / opacity controls for the current selection.
 * Font & bond use number-only dropdowns with a small unit caption below.
 * Opacity is an icon that reveals a slider underneath when clicked.
 */
import { useEffect, useRef, useState } from 'react';
import { Droplets } from 'lucide-react';
import {
  BOND_THICKNESS_PRESETS_PX,
  LABEL_FONT_SIZE_PRESETS_PT,
} from '@moldraw/core';
import type { Molecule } from '@moldraw/domain';
import { useChromeOverlay } from '../chromeDismiss';

export interface TopBarStyleControlsProps {
  molecule: Molecule;
  selectedAtomIds: string[];
  selectedBondIds?: string[];
  /** Document default font size (Settings). */
  documentFontSizePt: number;
  /** Document default bond thickness (Settings). */
  documentBondThicknessPx: number;
  onApplyFontSize: (pt: number | null) => void;
  onApplyBondThickness: (px: number | null) => void;
  /** Optional: selection opacity 0–1; null clears overrides. */
  onApplyOpacity?: (opacity: number | null) => void;
}

function sharedLabelFontPt(molecule: Molecule, atomIds: string[]): number | undefined {
  if (atomIds.length === 0) return undefined;
  const pts = atomIds
    .map(id => molecule.atoms.find(a => a.id === id)?.labelFontSizePt)
    .filter((v): v is number => v != null);
  if (pts.length === 0) return undefined;
  const first = pts[0];
  return pts.every(p => p === first) ? first : undefined;
}

function sharedBondThickness(
  molecule: Molecule,
  atomIds: string[],
  bondIds: string[],
): number | undefined {
  const bonds =
    bondIds.length > 0
      ? molecule.bonds.filter(b => bondIds.includes(b.id))
      : (() => {
          const set = new Set(atomIds);
          return molecule.bonds.filter(b => set.has(b.fromAtomId) || set.has(b.toAtomId));
        })();
  const thicknesses = bonds.map(b => b.thicknessPx).filter((v): v is number => v != null);
  if (thicknesses.length === 0) return undefined;
  const first = thicknesses[0];
  return thicknesses.every(t => t === first) ? first : undefined;
}

function sharedOpacity(
  molecule: Molecule,
  atomIds: string[],
  bondIds: string[],
): number | undefined {
  const atomOps = atomIds
    .map(id => molecule.atoms.find(a => a.id === id)?.opacity)
    .filter((v): v is number => v != null);
  const bonds =
    bondIds.length > 0
      ? molecule.bonds.filter(b => bondIds.includes(b.id))
      : (() => {
          const set = new Set(atomIds);
          return molecule.bonds.filter(b => set.has(b.fromAtomId) || set.has(b.toAtomId));
        })();
  const bondOps = bonds.map(b => b.opacity).filter((v): v is number => v != null);
  const all = [...atomOps, ...bondOps];
  if (all.length === 0) return undefined;
  const first = all[0];
  return all.every(o => Math.abs(o - first) < 1e-6) ? first : undefined;
}

export function TopBarStyleControls({
  molecule,
  selectedAtomIds,
  selectedBondIds = [],
  documentFontSizePt,
  documentBondThicknessPx,
  onApplyFontSize,
  onApplyBondThickness,
  onApplyOpacity,
}: TopBarStyleControlsProps) {
  const [opacityOpen, setOpacityOpen] = useState(false);
  const opacityWrapRef = useRef<HTMLDivElement>(null);
  useChromeOverlay(opacityOpen, () => setOpacityOpen(false));

  const hasAtoms = selectedAtomIds.length > 0;
  const hasBonds =
    selectedBondIds.length > 0 ||
    (hasAtoms &&
      molecule.bonds.some(
        b => selectedAtomIds.includes(b.fromAtomId) || selectedAtomIds.includes(b.toAtomId),
      ));

  useEffect(() => {
    if (!opacityOpen) return;
    const onDoc = (e: MouseEvent) => {
      const el = opacityWrapRef.current;
      if (el && !el.contains(e.target as Node)) setOpacityOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [opacityOpen]);

  if (!hasAtoms && !hasBonds) return null;

  const fontPt = sharedLabelFontPt(molecule, selectedAtomIds);
  const bondPx = sharedBondThickness(molecule, selectedAtomIds, selectedBondIds);
  const opacity = sharedOpacity(molecule, selectedAtomIds, selectedBondIds);
  const opacityPct = Math.round((opacity ?? 1) * 100);

  return (
    <div className="app-top-bar__style-controls" role="group" aria-label="Selection style">
      <label className="app-top-bar__style-field" title="Font size for selected atom labels">
        <select
          className="app-top-bar__style-select"
          disabled={!hasAtoms}
          value={fontPt != null ? String(fontPt) : 'default'}
          aria-label="Font size in points"
          onChange={e => {
            const v = e.target.value;
            onApplyFontSize(v === 'default' ? null : Number(v));
          }}
        >
          <option value="default">{documentFontSizePt}</option>
          {LABEL_FONT_SIZE_PRESETS_PT.map(pt => (
            <option key={pt} value={String(pt)}>
              {pt}
            </option>
          ))}
        </select>
        <span className="app-top-bar__style-unit" aria-hidden>
          pt
        </span>
      </label>
      <label className="app-top-bar__style-field" title="Bond thickness for selected bonds">
        <select
          className="app-top-bar__style-select"
          disabled={!hasBonds}
          value={bondPx != null ? String(bondPx) : 'default'}
          aria-label="Bond thickness in pixels"
          onChange={e => {
            const v = e.target.value;
            onApplyBondThickness(v === 'default' ? null : Number(v));
          }}
        >
          <option value="default">{documentBondThicknessPx}</option>
          {BOND_THICKNESS_PRESETS_PX.map(px => (
            <option key={px} value={String(px)}>
              {px}
            </option>
          ))}
        </select>
        <span className="app-top-bar__style-unit" aria-hidden>
          px
        </span>
      </label>
      {onApplyOpacity ? (
        <div className="app-top-bar__opacity-wrap" ref={opacityWrapRef}>
          <button
            type="button"
            className={`action-btn icon-only app-top-bar__opacity-btn${opacityOpen || opacityPct < 100 ? ' active' : ''}`}
            title="Selection transparency"
            aria-label="Selection transparency"
            aria-expanded={opacityOpen}
            onClick={() => setOpacityOpen(v => !v)}
          >
            <Droplets size={16} strokeWidth={2} aria-hidden />
          </button>
          {opacityOpen ? (
            <div className="app-top-bar__opacity-popover" role="dialog" aria-label="Opacity">
              <input
                type="range"
                className="app-top-bar__style-opacity"
                min={0}
                max={100}
                step={5}
                value={opacityPct}
                aria-label="Selection opacity"
                onChange={e => {
                  const pct = Number(e.target.value);
                  if (pct >= 100) onApplyOpacity(null);
                  else onApplyOpacity(pct / 100);
                }}
              />
              <span className="app-top-bar__style-opacity-pct" aria-hidden>
                {opacityPct}%
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
