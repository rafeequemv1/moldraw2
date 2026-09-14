/**
 * H/V/D packing sliders for the active COF lattice — shown in the top-bar
 * context row so they stay visible after a preset is placed.
 */
import { useEffect, useRef, useState } from 'react';
import {
  COF_LAYERS_MAX,
  COF_LAYERS_MIN,
  COF_PACK_MAX,
  COF_PACK_MIN,
  cofLatticeForAtomIds,
  listCofPresets,
  listMofPresets,
} from '@moldraw/core';
import type { CofLattice, Molecule } from '@moldraw/domain';
import type { CofGenerateParams, CofGenerateResult } from './types';

export type CofsPackingBarProps = {
  molecule: Molecule;
  selectedAtomIds: string[];
  bondLengthPx: number;
  onGenerate: (params: CofGenerateParams) => CofGenerateResult;
};

export function CofsPackingBar({
  molecule,
  selectedAtomIds,
  bondLengthPx,
  onGenerate,
}: CofsPackingBarProps) {
  const presets = [...listCofPresets(), ...listMofPresets()];
  const selected = cofLatticeForAtomIds(molecule, selectedAtomIds);
  const lattice = selected ?? molecule.cofLattices?.[molecule.cofLattices.length - 1];
  const [cols, setCols] = useState(lattice?.cols ?? 1);
  const [rows, setRows] = useState(lattice?.rows ?? 1);
  const [layers, setLayers] = useState(lattice?.layers ?? 1);
  const sessionRef = useRef<CofLattice | undefined>(lattice);
  const liveRafRef = useRef<number | null>(null);
  const pendingRef = useRef<{ cols?: number; rows?: number; layers?: number } | null>(null);

  useEffect(() => {
    if (!lattice) return;
    sessionRef.current = lattice;
    setCols(lattice.cols);
    setRows(lattice.rows);
    setLayers(lattice.layers ?? 1);
  }, [lattice?.id, lattice?.cols, lattice?.rows, lattice?.layers]);

  useEffect(
    () => () => {
      if (liveRafRef.current != null) window.cancelAnimationFrame(liveRafRef.current);
    },
    [],
  );

  if (!lattice) return null;

  const apply = (nextCols: number, nextRows: number, nextLayers: number, live: boolean) => {
    const lat = sessionRef.current ?? lattice;
    const c = Math.max(COF_PACK_MIN, Math.min(COF_PACK_MAX, nextCols));
    const r = Math.max(COF_PACK_MIN, Math.min(COF_PACK_MAX, nextRows));
    const d = Math.max(COF_LAYERS_MIN, Math.min(COF_LAYERS_MAX, nextLayers));
    setCols(c);
    setRows(r);
    setLayers(d);
    const placed = onGenerate({
      presetId: lat.presetId,
      cols: c,
      rows: r,
      layers: d,
      bondLengthPx: lat.bondLengthPx || bondLengthPx,
      cx: lat.cx,
      cy: lat.cy,
      replaceAtomIds: lat.atomIds,
      latticeId: lat.id,
      live,
    });
    sessionRef.current = {
      ...lat,
      cols: c,
      rows: r,
      layers: d,
      atomIds: placed.atomIds.length ? placed.atomIds : lat.atomIds,
      id: placed.latticeId ?? lat.id,
    };
  };

  const scheduleLive = (overrides: { cols?: number; rows?: number; layers?: number }) => {
    pendingRef.current = { ...pendingRef.current, ...overrides };
    if (liveRafRef.current != null) return;
    liveRafRef.current = window.requestAnimationFrame(() => {
      liveRafRef.current = null;
      const pending = pendingRef.current;
      pendingRef.current = null;
      apply(pending?.cols ?? cols, pending?.rows ?? rows, pending?.layers ?? layers, true);
    });
  };

  const endGesture = () => {
    if (liveRafRef.current != null) {
      window.cancelAnimationFrame(liveRafRef.current);
      liveRafRef.current = null;
    }
    const pending = pendingRef.current;
    pendingRef.current = null;
    const lat = sessionRef.current ?? lattice;
    const c = Math.max(COF_PACK_MIN, Math.min(COF_PACK_MAX, pending?.cols ?? lat.cols ?? cols));
    const r = Math.max(COF_PACK_MIN, Math.min(COF_PACK_MAX, pending?.rows ?? lat.rows ?? rows));
    const d = Math.max(
      COF_LAYERS_MIN,
      Math.min(COF_LAYERS_MAX, pending?.layers ?? lat.layers ?? layers),
    );
    setCols(c);
    setRows(r);
    setLayers(d);
    const placed = onGenerate({
      presetId: lat.presetId,
      cols: c,
      rows: r,
      layers: d,
      bondLengthPx: lat.bondLengthPx || bondLengthPx,
      cx: lat.cx,
      cy: lat.cy,
      replaceAtomIds: lat.atomIds,
      latticeId: lat.id,
      commitLive: true,
    });
    sessionRef.current = {
      ...lat,
      cols: c,
      rows: r,
      layers: d,
      atomIds: placed.atomIds.length ? placed.atomIds : lat.atomIds,
      id: placed.latticeId ?? lat.id,
    };
  };

  const preset = presets.find(p => p.id === lattice.presetId);
  const label = preset?.label ?? 'Framework';
  const poreTitle =
    preset?.topology === 'square-grid'
      ? 'square pores'
      : 'hexagonal pores';
  const depthTitle =
    preset?.dimensionality === 'network3d'
      ? 'Packing along c (unit cells)'
      : 'Layer packing (depth). Uses Structure Perspective — drag the Perspective tool to orbit.';

  const slider = (
    name: string,
    title: string,
    value: number,
    min: number,
    max: number,
    onChange: (n: number) => void,
  ) => (
    <label className="selection-align-toolbar__slider" title={title}>
      <span className="selection-align-toolbar__slider-label">{name}</span>
      <input
        type="range"
        className="chrome-range selection-align-toolbar__range"
        min={min}
        max={max}
        step={1}
        value={value}
        aria-label={title}
        onChange={e => onChange(Number(e.target.value))}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
      />
      <span className="selection-align-toolbar__slider-value">{value}</span>
    </label>
  );

  return (
    <span className="selection-align-toolbar__pattern-top-params app-top-bar__cofs-pack" aria-label="COF packing">
      <span className="app-top-bar__cofs-preset-label">{label} pack</span>
      {slider('H', `Horizontal packing (${poreTitle})`, cols, COF_PACK_MIN, COF_PACK_MAX, n => {
        setCols(n);
        scheduleLive({ cols: n });
      })}
      {slider('V', `Vertical packing (${poreTitle})`, rows, COF_PACK_MIN, COF_PACK_MAX, n => {
        setRows(n);
        scheduleLive({ rows: n });
      })}
      {slider('D', depthTitle, layers, COF_LAYERS_MIN, COF_LAYERS_MAX, n => {
        setLayers(n);
        scheduleLive({ layers: n });
      })}
    </span>
  );
}
