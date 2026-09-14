/**
 * Full-length stick cylinders. 3Dmol's native double-bond path offsets by
 * 1.5×radius and splits each stick at the midpoint, so C=O looks like four
 * short tubes with a gap. We hide those sticks and draw two continuous
 * cylinders ourselves (one color per half, same axis, no radius seam).
 */
import {
  HYDROGEN_COLOR,
  SELECTED_STICK_RADIUS,
  STICK_RADIUS,
  TOONISH_STICK_RADIUS,
  jmolElementColor,
} from '../styleConstants';
import type { ViewerDisplayMode } from './types';

type Vec = { x: number; y: number; z: number };

export type StickAtom = {
  x?: number;
  y?: number;
  z?: number;
  elem?: string;
  serial?: number;
  index?: number;
  color?: unknown;
  bonds?: number[];
  bondOrder?: number[];
};

type StickViewer = {
  addCylinder?: (spec: {
    start: Vec;
    end: Vec;
    radius: number;
    color: string;
    fromCap?: number;
    toCap?: number;
    dashed?: boolean;
  }) => unknown;
  addShape?: (spec: object) => unknown;
  removeAllShapes?: () => void;
  mapAtomProperties?: (fn: (atom: Record<string, unknown>) => void) => void;
};

type StickModel = {
  selectedAtoms?: (sel: object) => StickAtom[];
};

const CAP_ROUND = 2;

const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale = (a: Vec, s: number): Vec => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a: Vec): number => Math.hypot(a.x, a.y, a.z);

const norm = (a: Vec): Vec => {
  const L = len(a);
  return L < 1e-8 ? { x: 0, y: 1, z: 0 } : scale(a, 1 / L);
};

const vecOf = (a: StickAtom): Vec | null => {
  if (!Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(a.z)) return null;
  return { x: a.x as number, y: a.y as number, z: a.z as number };
};

const colorToHex = (value: unknown, elem: string): string => {
  if (elem === 'H') return HYDROGEN_COLOR;
  if (typeof value === 'string' && value.trim()) {
    const s = value.trim();
    if (s.startsWith('#') || s.startsWith('rgb') || s.startsWith('hsl')) return s;
    if (/^[0-9a-fA-F]{6}$/.test(s)) return `#${s}`;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `#${(value >>> 0).toString(16).padStart(6, '0').slice(-6)}`;
  }
  if (value && typeof value === 'object') {
    const rec = value as { r?: number; g?: number; b?: number };
    if (
      typeof rec.r === 'number' &&
      typeof rec.g === 'number' &&
      typeof rec.b === 'number'
    ) {
      const hex = (n: number) =>
        Math.round(n > 1 ? n : n * 255)
          .toString(16)
          .padStart(2, '0');
      return `#${hex(rec.r)}${hex(rec.g)}${hex(rec.b)}`;
    }
  }
  return jmolElementColor(elem);
};

/** Parallel stick count: 1 / 2 / 3. Aromatic (molfile 4) stays a single stick. */
const parallelCount = (order: number): 1 | 2 | 3 => {
  if (order >= 2.9 && order < 3.6) return 3;
  if (order >= 1.9 && order < 2.6) return 2;
  return 1;
};

/** In-plane unit offset (rejects the bond axis so ring doubles stay in the ring). */
const bondPerp = (from: StickAtom, to: StickAtom, atoms: StickAtom[]): Vec => {
  const a = vecOf(from)!;
  const b = vecOf(to)!;
  const along = norm(sub(b, a));
  const tryNeighbor = (atom: StickAtom, other: StickAtom): Vec | null => {
    for (const idx of atom.bonds ?? []) {
      const n = atoms[idx];
      if (!n || n === other) continue;
      const nv = vecOf(n);
      if (!nv) continue;
      const ref = sub(nv, vecOf(atom)!);
      const rejected = sub(ref, scale(along, dot(ref, along)));
      if (len(rejected) > 1e-4) return norm(rejected);
    }
    return null;
  };
  return (
    tryNeighbor(from, to) ??
    tryNeighbor(to, from) ??
    norm(
      len({ x: -along.y, y: along.x, z: 0 }) > 0.2
        ? { x: -along.y, y: along.x, z: 0 }
        : { x: 0, y: -along.z, z: along.y },
    )
  );
};

export const viewerSupportsCustomSticks = (viewer: StickViewer): boolean =>
  typeof viewer.addCylinder === 'function' || typeof viewer.addShape === 'function';

const addCylinder = (
  viewer: StickViewer,
  spec: {
    start: Vec;
    end: Vec;
    radius: number;
    color: string;
    fromCap?: number;
    toCap?: number;
    dashed?: boolean;
  },
): void => {
  if (typeof viewer.addCylinder === 'function') {
    viewer.addCylinder(spec);
    return;
  }
  viewer.addShape?.({ spec: { type: 'cylinder', ...spec } });
};

export type DrawStickCylindersOptions = {
  viewer: StickViewer;
  models: StickModel[];
  mode: ViewerDisplayMode;
  showHydrogens: boolean;
  selectedAtomIndices?: number[];
};

/**
 * Draw ball-and-stick / stick / toonish bonds as custom cylinders.
 * Caller must omit 3Dmol `stick` styles (or they will sit on the axis).
 */
export const drawStickCylinders = ({
  viewer,
  models,
  mode,
  showHydrogens,
  selectedAtomIndices = [],
}: DrawStickCylindersOptions): void => {
  if (mode === 'spacefill' || mode === 'line' || mode === 'cross' || mode === 'ballStick') return;
  if (!viewerSupportsCustomSticks(viewer)) return;
  viewer.removeAllShapes?.();
  viewer.mapAtomProperties?.(atom => {
    const style = atom.style;
    if (style && typeof style === 'object') {
      (style as { stick?: { hidden?: boolean } }).stick = { hidden: true };
    }
  });

  const selected = new Set(selectedAtomIndices);
  const baseR =
    mode === 'toonish' ? TOONISH_STICK_RADIUS : STICK_RADIUS;

  for (const model of models) {
    const atoms = model.selectedAtoms?.({}) ?? [];
    const seen = new Set<string>();
    for (let i = 0; i < atoms.length; i++) {
      const from = atoms[i];
      const fromPos = vecOf(from);
      if (!fromPos) continue;
      if (from.elem === 'H' && !showHydrogens) continue;
      const bonds = from.bonds ?? [];
      const orders = from.bondOrder ?? [];
      for (let b = 0; b < bonds.length; b++) {
        const j = bonds[b];
        if (!Number.isFinite(j)) continue;
        const to =
          atoms[j] ??
          atoms.find(a => a.index === j || a.serial === j);
        if (!to) continue;
        const toPos = vecOf(to);
        if (!toPos) continue;
        if (to.elem === 'H' && !showHydrogens) continue;

        const ka = from.serial ?? from.index ?? i;
        const kb = to.serial ?? to.index ?? j;
        const pair = ka < kb ? `${ka}:${kb}` : `${kb}:${ka}`;
        if (seen.has(pair)) continue;
        seen.add(pair);

        const otherEnd = to.bonds?.indexOf(i) ?? to.bonds?.indexOf(from.index ?? i) ?? -1;
        const order =
          orders[b] ??
          (otherEnd >= 0 ? to.bondOrder?.[otherEnd] : undefined) ??
          1;
        const count = parallelCount(order);
        const fromSelected =
          (from.serial != null && selected.has(from.serial)) ||
          (from.index != null && selected.has(from.index));
        const toSelected =
          (to.serial != null && selected.has(to.serial)) ||
          (to.index != null && selected.has(to.index));
        const highlighted = fromSelected || toSelected;

        const r =
          count === 1
            ? highlighted
              ? SELECTED_STICK_RADIUS
              : baseR
            : highlighted
              ? SELECTED_STICK_RADIUS * 0.9
              : baseR * 0.9;
        const offsetDist = count === 1 ? 0 : r * 1.02;
        const perp = count === 1 ? { x: 0, y: 0, z: 0 } : scale(bondPerp(from, to, atoms), offsetDist);

        const fromColor = highlighted
          ? '#2563eb'
          : colorToHex(from.color, from.elem ?? 'C');
        const toColor = highlighted
          ? '#2563eb'
          : colorToHex(to.color, to.elem ?? 'C');

        const mid = scale(add(fromPos, toPos), 0.5);
        const along = norm(sub(toPos, fromPos));
        const overlap = scale(along, r * 0.7);
        const shifts: Vec[] =
          count === 1
            ? [{ x: 0, y: 0, z: 0 }]
            : count === 2
              ? [perp, scale(perp, -1)]
              : [perp, { x: 0, y: 0, z: 0 }, scale(perp, -1)];

        for (const shift of shifts) {
          const a = add(fromPos, shift);
          const m = add(mid, shift);
          const c = add(toPos, shift);
          try {
            addCylinder(viewer, {
              start: a,
              end: add(m, overlap),
              radius: r,
              color: fromColor,
              fromCap: CAP_ROUND,
              toCap: CAP_ROUND,
              dashed: false,
            });
            addCylinder(viewer, {
              start: sub(m, overlap),
              end: c,
              radius: r,
              color: toColor,
              fromCap: CAP_ROUND,
              toCap: CAP_ROUND,
              dashed: false,
            });
          } catch (err) {
            console.warn('[viewer-3d] addCylinder failed', err);
          }
        }
      }
    }
  }
};
