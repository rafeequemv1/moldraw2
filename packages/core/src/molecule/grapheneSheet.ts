/**
 * Generate graphene: gapless hexagonal close-packed (honeycomb) carbon lattice.
 * Default shape is a rectangular flake; optional circular mask.
 */
import type { Atom, Bond, Molecule } from '@moldraw/domain';
import { collectAtomsAsObjectCollection } from './arrayCollection';
import { ensureFragmentIds } from './fragmentIds';
import { mergeGeneratedLattice } from './latticeMerge';

const newId = () => Math.random().toString(36).slice(2, 11);

/**
 * Deterministic ids: `gr<sheetId>.v<key>` / `gr<sheetId>.b<keyA>-<keyB>` where
 * `key` is the vertex position relative to the sheet anchor. Growing the sheet
 * re-emits identical ids for existing vertices, so `generateGrapheneInMolecule`
 * merges incrementally (no jump, no new random ids).
 */
const GRAPHENE_ID_RE = /^gr([0-9a-z]+)\./;

const sheetIdFromAtomIds = (ids: readonly string[]): string | null => {
  for (const id of ids) {
    const m = GRAPHENE_ID_RE.exec(id);
    if (m) return m[1]!;
  }
  return null;
};

const relKey = (dx: number, dy: number) => {
  const f = (v: number) => {
    const n = Math.round(v * 50);
    return n < 0 ? `m${-n}` : `${n}`;
  };
  return `${f(dx)}_${f(dy)}`;
};

export type GrapheneShape = 'rectangular' | 'circular';

/**
 * `none` = pristine graphene. `rgo` = reduced graphene oxide: sparse residual
 * oxygen groups — edge –OH / –COOH, a few basal (sp³) –OH drawn wedged, and
 * occasional epoxide (C–O–C) bridges across basal bonds. Placement is
 * deterministic per sheet so live resizing keeps existing groups in place.
 */
export type GrapheneOxidation = 'none' | 'rgo';

export type GrapheneSheetOptions = {
  /**
   * Hexagon columns (zigzag width). For circular, used as diameter in hex cells.
   */
  cols: number;
  /** Hexagon rows (armchair height). Ignored for circular (uses cols as diameter). */
  rows: number;
  /** C–C bond length (= hexagon center-to-vertex distance). */
  bondLength: number;
  shape: GrapheneShape;
  cx: number;
  cy: number;
  oxidation?: GrapheneOxidation;
};

/** Small deterministic string hash (FNV-1a, 32-bit) → [0, 2^32). */
const hash32 = (s: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
};

/* rGO composition targets (per-site probabilities, in percent). Typical rGO has a
   C/O ratio ≈ 8–12; edges carry most of the residual oxygen. */
const RGO_EDGE_OH_PCT = 30;
const RGO_EDGE_COOH_PCT = 18;
const RGO_BASAL_OH_PCT = 6;
const RGO_EPOXIDE_PCT = 7;

const SIZE_MIN = 1;
const SIZE_MAX = 12;

const clampSize = (n: number) => Math.max(SIZE_MIN, Math.min(SIZE_MAX, Math.round(n)));

/**
 * Flat-top hex layout: `size` is center → vertex (bond length).
 * Adjacent hexes share edges with no gaps.
 */
const axialToWorld = (q: number, r: number, size: number): { x: number; y: number } => ({
  x: size * ((3 / 2) * q),
  y: size * ((Math.sqrt(3) / 2) * q + Math.sqrt(3) * r),
});

const vertKey = (x: number, y: number) => `${Math.round(x * 50)},${Math.round(y * 50)}`;

/** Rectangular grid of hex cells via odd-q offset → axial (flat-top, no gaps). */
const rectangularHexCenters = (cols: number, rows: number): Array<{ q: number; r: number }> => {
  const out: Array<{ q: number; r: number }> = [];
  const col0 = -Math.floor((cols - 1) / 2);
  const row0 = -Math.floor((rows - 1) / 2);
  for (let ci = 0; ci < cols; ci++) {
    for (let ri = 0; ri < rows; ri++) {
      const col = col0 + ci;
      const row = row0 + ri;
      // odd-q vertical layout → axial
      const q = col;
      const r = row - (col - (col & 1)) / 2;
      out.push({ q, r });
    }
  }
  return out;
};

/** Hex centers with cube distance ≤ radius (circular flake). */
const circularHexCenters = (diameter: number): Array<{ q: number; r: number }> => {
  const max = Math.max(0, Math.floor((diameter - 1) / 2));
  const out: Array<{ q: number; r: number }> = [];
  for (let q = -max; q <= max; q++) {
    const r1 = Math.max(-max, -q - max);
    const r2 = Math.min(max, -q + max);
    for (let r = r1; r <= r2; r++) out.push({ q, r });
  }
  return out;
};

/**
 * Build a graphene flake: fused aromatic hexagons, HCP honeycomb (no gaps).
 *
 * The (0,0) hex cell is anchored at `(cx, cy)`; extra columns / rows are added
 * on alternating sides. Existing vertices therefore never move when the sheet
 * grows, and with `sheetId` set their ids are reproducible.
 */
export function buildGrapheneSheet(
  options: GrapheneSheetOptions & { sheetId?: string },
): {
  atoms: Atom[];
  bonds: Bond[];
  atomIds: string[];
} {
  const cols = clampSize(options.cols);
  const rows = clampSize(options.rows);
  const a = Math.max(16, options.bondLength);
  const shape = options.shape === 'circular' ? 'circular' : 'rectangular';
  const { cx, cy } = options;
  const prefix = `gr${options.sheetId ?? newId()}`;

  const centers =
    shape === 'circular' ? circularHexCenters(cols) : rectangularHexCenters(cols, rows);

  const idByKey = new Map<string, string>();
  const atoms: Atom[] = [];
  const bondKeys = new Set<string>();
  const bonds: Bond[] = [];

  const ensureVertex = (x: number, y: number): string => {
    const key = vertKey(x, y);
    let id = idByKey.get(key);
    if (id) return id;
    id = `${prefix}.v${relKey(x - cx, y - cy)}`;
    idByKey.set(key, id);
    atoms.push({ id, element: 'C', x, y, charge: 0 });
    return id;
  };

  const addBond = (from: string, to: string) => {
    if (from === to) return;
    const key = from < to ? `${from}|${to}` : `${to}|${from}`;
    if (bondKeys.has(key)) return;
    bondKeys.add(key);
    const [lo, hi] = from < to ? [from, to] : [to, from];
    bonds.push({
      id: `${prefix}.b${lo.slice(prefix.length + 2)}-${hi.slice(prefix.length + 2)}`,
      fromAtomId: from,
      toAtomId: to,
      order: 1,
      aromatic: true,
    });
  };

  // Flat-top hex vertices at 0°, 60°, … with radius = bond length (edge-sharing HCP).
  for (const { q, r } of centers) {
    const c = axialToWorld(q, r, a);
    const hx = cx + c.x;
    const hy = cy + c.y;
    const vids: string[] = [];
    for (let i = 0; i < 6; i++) {
      const ang = (i * Math.PI) / 3;
      vids.push(ensureVertex(hx + a * Math.cos(ang), hy + a * Math.sin(ang)));
    }
    for (let i = 0; i < 6; i++) addBond(vids[i]!, vids[(i + 1) % 6]!);
  }

  if (options.oxidation === 'rgo') {
    decorateReducedGrapheneOxide({ atoms, bonds, prefix, bondLength: a });
  }

  return { atoms, bonds, atomIds: atoms.map(x => x.id) };
}

/**
 * Add residual oxygen functionality to a pristine flake (mutates `atoms` /
 * `bonds`). Group atom ids derive from the host carbon id, so regenerating the
 * same sheet (grow / shrink / toggle) re-emits identical ids and the lattice
 * merge keeps existing groups untouched.
 */
function decorateReducedGrapheneOxide(sheet: {
  atoms: Atom[];
  bonds: Bond[];
  prefix: string;
  bondLength: number;
}): void {
  const { atoms, bonds, prefix, bondLength: a } = sheet;
  const carbons = atoms.slice();
  const byId = new Map<string, Atom>();
  for (const c of carbons) byId.set(c.id, c);
  const nbrs = new Map<string, string[]>();
  for (const b of bonds) {
    (nbrs.get(b.fromAtomId) ?? nbrs.set(b.fromAtomId, []).get(b.fromAtomId)!).push(b.toAtomId);
    (nbrs.get(b.toAtomId) ?? nbrs.set(b.toAtomId, []).get(b.toAtomId)!).push(b.fromAtomId);
  }
  const suffix = (id: string) => id.slice(prefix.length + 2); // strip `gr<id>.v`
  const pct = (s: string) => hash32(`${prefix}|${s}`) % 100;
  const decorated = new Set<string>();

  const addAtom = (id: string, element: string, x: number, y: number) => {
    atoms.push({ id, element, x, y, charge: 0 });
    return id;
  };
  const addBond = (id: string, from: string, to: string, order: number, stereo?: Bond['stereo']) => {
    bonds.push({ id, fromAtomId: from, toAtomId: to, order, ...(stereo ? { stereo } : {}) });
  };
  const rot = (dx: number, dy: number, deg: number) => {
    const t = (deg * Math.PI) / 180;
    return { x: dx * Math.cos(t) - dy * Math.sin(t), y: dx * Math.sin(t) + dy * Math.cos(t) };
  };

  // 1. Edge carbons (≤ 2 lattice neighbours): –OH or –COOH pointing away from the sheet.
  for (const c of carbons) {
    const nb = nbrs.get(c.id) ?? [];
    if (nb.length === 0 || nb.length > 2) continue;
    const roll = pct(`edge:${c.id}`);
    if (roll >= RGO_EDGE_OH_PCT + RGO_EDGE_COOH_PCT) continue; // stays H-terminated
    let mx = 0;
    let my = 0;
    for (const n of nb) {
      const p = byId.get(n)!;
      mx += p.x;
      my += p.y;
    }
    mx /= nb.length;
    my /= nb.length;
    let dx = c.x - mx;
    let dy = c.y - my;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const key = suffix(c.id);
    decorated.add(c.id);
    if (roll < RGO_EDGE_OH_PCT) {
      const o = addAtom(`${prefix}.o${key}`, 'O', c.x + dx * a * 0.9, c.y + dy * a * 0.9);
      addBond(`${prefix}.bo${key}`, c.id, o, 1);
    } else {
      const ccx = c.x + dx * a;
      const ccy = c.y + dy * a;
      const cc = addAtom(`${prefix}.c${key}`, 'C', ccx, ccy);
      const d1 = rot(dx, dy, 60);
      const d2 = rot(dx, dy, -60);
      const o1 = addAtom(`${prefix}.oa${key}`, 'O', ccx + d1.x * a * 0.9, ccy + d1.y * a * 0.9);
      const o2 = addAtom(`${prefix}.ob${key}`, 'O', ccx + d2.x * a * 0.9, ccy + d2.y * a * 0.9);
      addBond(`${prefix}.bc${key}`, c.id, cc, 1);
      addBond(`${prefix}.boa${key}`, cc, o1, 2);
      addBond(`${prefix}.bob${key}`, cc, o2, 1);
    }
  }

  // 2. Basal (3-neighbour) carbons: sparse sp³ –OH, drawn wedged (out of plane).
  for (const c of carbons) {
    const nb = nbrs.get(c.id) ?? [];
    if (nb.length !== 3 || decorated.has(c.id)) continue;
    if (pct(`basal:${c.id}`) >= RGO_BASAL_OH_PCT) continue;
    const p0 = byId.get(nb[0]!)!;
    const p1 = byId.get(nb[1]!)!;
    // Bisector between two lattice bonds — reads as a substituent tilted out of plane.
    let dx = (p0.x - c.x) / a + (p1.x - c.x) / a;
    let dy = (p0.y - c.y) / a + (p1.y - c.y) / a;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const key = suffix(c.id);
    decorated.add(c.id);
    const o = addAtom(`${prefix}.o${key}`, 'O', c.x + dx * a * 0.62, c.y + dy * a * 0.62);
    addBond(`${prefix}.bo${key}`, c.id, o, 1, 'wedge');
  }

  // 3. Epoxide bridges across interior bonds whose carbons are still bare.
  const lattice = bonds.slice(); // only C–C lattice bonds existed before groups were added
  for (const b of lattice) {
    if (!byId.has(b.fromAtomId) || !byId.has(b.toAtomId)) continue;
    if (decorated.has(b.fromAtomId) || decorated.has(b.toAtomId)) continue;
    if ((nbrs.get(b.fromAtomId)?.length ?? 0) !== 3 || (nbrs.get(b.toAtomId)?.length ?? 0) !== 3) continue;
    if (pct(`epox:${b.id}`) >= RGO_EPOXIDE_PCT) continue;
    const p = byId.get(b.fromAtomId)!;
    const q = byId.get(b.toAtomId)!;
    const mxp = (p.x + q.x) / 2;
    const myp = (p.y + q.y) / 2;
    let nx = -(q.y - p.y);
    let ny = q.x - p.x;
    const len = Math.hypot(nx, ny) || 1;
    nx /= len;
    ny /= len;
    // Deterministic side choice.
    if (hash32(`${prefix}|side:${b.id}`) & 1) {
      nx = -nx;
      ny = -ny;
    }
    decorated.add(b.fromAtomId);
    decorated.add(b.toAtomId);
    const key = b.id.slice(prefix.length + 2); // strip `gr<id>.b`
    const o = addAtom(`${prefix}.oe${key}`, 'O', mxp + nx * a * 0.55, myp + ny * a * 0.55);
    addBond(`${prefix}.bea${key}`, b.fromAtomId, o, 1, 'wedge');
    addBond(`${prefix}.beb${key}`, b.toAtomId, o, 1, 'wedge');
  }
}

export type GenerateGrapheneOptions = GrapheneSheetOptions & {
  replaceAtomIds?: string[];
};

/**
 * Generate or grow a graphene sheet. When `replaceAtomIds` belong to a sheet
 * built here before, the same sheet id is reused and growth is an incremental
 * merge (existing carbons keep id + position; only the new rim is appended and
 * any now-interior stubs dropped).
 */
export function generateGrapheneInMolecule(
  prev: Molecule,
  options: GenerateGrapheneOptions,
): { molecule: Molecule; newAtomIds: string[]; allAtomIds: string[] } {
  const present = new Set(prev.atoms.map(a => a.id));
  const replace = (options.replaceAtomIds ?? []).filter(id => present.has(id));
  const sheetId = sheetIdFromAtomIds(replace) ?? newId();

  const sheet = buildGrapheneSheet({ ...options, sheetId });
  const merged = mergeGeneratedLattice(prev, replace, sheet);
  let next = merged.molecule;
  if (!merged.unchanged || replace.length === 0) {
    next = ensureFragmentIds(next);
    next = collectAtomsAsObjectCollection(next, sheet.atomIds, 'Graphene');
  }
  return {
    molecule: next,
    newAtomIds: merged.addedAtomIds,
    allAtomIds: sheet.atomIds,
  };
}

/** @deprecated Prefer cols/rows; kept for callers that still pass rings. */
export const GRAPHENE_RINGS_MIN = SIZE_MIN;
export const GRAPHENE_RINGS_MAX = SIZE_MAX;
export const GRAPHENE_COLS_MIN = SIZE_MIN;
export const GRAPHENE_COLS_MAX = SIZE_MAX;
