/**
 * Legacy top-bar COFs menu. Presets now live in Library → COFs.
 * Packing sliders stay in `CofsPackingBar` (context row).
 */
import { useEffect, useRef, useState } from 'react';
import { Hexagon } from 'lucide-react';
import { COF_LAYERS_DEFAULT, COF_PACK_DEFAULT, cofLatticeForAtomIds, listCofPresets } from '@moldraw/core';
import type { Molecule } from '@moldraw/domain';
import type { CofGenerateParams, CofGenerateResult } from './types';
import { useChromeOverlay } from '../chromeDismiss';

export type CofsMenuProps = {
  molecule: Molecule;
  selectedAtomIds: string[];
  bondLengthPx: number;
  isCompact?: boolean;
  onGenerate: (params: CofGenerateParams) => CofGenerateResult;
};

export function CofsMenu({
  molecule,
  selectedAtomIds,
  bondLengthPx,
  isCompact = false,
  onGenerate,
}: CofsMenuProps) {
  const presets = listCofPresets();
  const [menuOpen, setMenuOpen] = useState(false);
  const [presetId, setPresetId] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  useChromeOverlay(menuOpen, () => setMenuOpen(false));
  const sessionRef = useRef<{
    presetId: string;
    atomIds: string[];
    latticeId?: string;
    cx: number;
    cy: number;
  } | null>(null);

  const selectedLattice = cofLatticeForAtomIds(molecule, selectedAtomIds);

  useEffect(() => {
    if (!selectedLattice) return;
    setPresetId(selectedLattice.presetId);
    sessionRef.current = {
      presetId: selectedLattice.presetId,
      atomIds: selectedLattice.atomIds,
      latticeId: selectedLattice.id,
      cx: selectedLattice.cx,
      cy: selectedLattice.cy,
    };
  }, [selectedLattice]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  const placePreset = (id: string) => {
    setMenuOpen(false);
    setPresetId(id);
    const cx = 0;
    const cy = 0;
    const placed = onGenerate({
      presetId: id,
      cols: COF_PACK_DEFAULT,
      rows: COF_PACK_DEFAULT,
      layers: COF_LAYERS_DEFAULT,
      bondLengthPx,
      cx,
      cy,
      replaceAtomIds: sessionRef.current?.atomIds,
      latticeId: sessionRef.current?.latticeId,
    });
    sessionRef.current = {
      presetId: id,
      atomIds: placed.atomIds,
      latticeId: placed.latticeId,
      cx,
      cy,
    };
  };

  const packingActive = Boolean(
    presetId || selectedLattice || (molecule.cofLattices?.length ?? 0) > 0,
  );

  return (
    <div ref={wrapRef} className="app-top-bar__file-wrap app-top-bar__cofs-wrap">
      <button
        type="button"
        className={`app-top-bar__file-btn ${menuOpen ? 'app-top-bar__file-btn--open' : ''}${
          packingActive ? ' app-top-bar__file-btn--active' : ''
        }`}
        onClick={() => setMenuOpen(v => !v)}
        title="COFs — covalent organic framework presets"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
      >
        <Hexagon size={13} strokeWidth={2} aria-hidden />
        {isCompact ? 'COF' : 'COFs'}
      </button>
      {menuOpen ? (
        <div className="app-top-bar__file-menu" role="menu" aria-label="COF presets">
          {presets.map(preset => (
            <button
              key={preset.id}
              type="button"
              role="menuitem"
              className={
                preset.id === (presetId ?? selectedLattice?.presetId)
                  ? 'app-top-bar__file-menu-item app-top-bar__file-menu-item--active'
                  : 'app-top-bar__file-menu-item'
              }
              title={preset.summary}
              onClick={() => placePreset(preset.id)}
            >
              <span className="app-top-bar__file-menu-label">{preset.label}</span>
              <span className="app-top-bar__file-menu-hint">
                {preset.id === 'cof-5' ? 'HHTP + BDBA' : 'Boroxine + BDBA'}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
