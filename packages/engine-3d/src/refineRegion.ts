/**
 * Region 3D refine — minimize only a dirty neighborhood, freeze the rest.
 *
 * Used for instant 3D updates after local edits (add/delete bond, change
 * element, move a few atoms). Full-molecule UFF is reserved for import /
 * major topology changes.
 */
import type { Atom, Bond, Molecule } from '@moldraw/domain';
import { buildGraph } from '@moldraw/engine';
import { kekulize, perceiveAromaticity } from '@moldraw/engine';
import { implicitHydrogensForEmbedding } from '@moldraw/engine';
import { embed3D, type Atom3D, type Conformer } from './embed';
import { perceiveStereo } from './stereo';
import { enforceStereoConstraints } from './verifyStereo3D';
import { conformerToMolblock3D } from './molblock3d';
import { buildUffTopology, setStereoTerms } from './forcefield/uff';
import { minimizeUff } from './forcefield/minimize';
import { perceiveHybridization } from './hybridization';
import { placeHydrogensVsepr } from './placeHydrogens';
import { unthreadSeed } from './unthread';

export interface Refine3DRegionOptions {
  /** Atom ids that changed (or are adjacent to a changed bond). */
  dirtyAtomIds: string[];
  /** Bond hops to expand the movable region (default 2). */
  bondBuffer?: number;
  /** Include explicit H in the conformer (default true). */
  includeHydrogens?: boolean;
  /** UFF iterations on the movable region (default 80). */
  maxIterations?: number;
  /**
   * Previous 3D molblock to seed frozen coordinates from. When omitted or
   * unmatchable, falls back to a light full embed of the new molecule.
   */
  previousMolblock3D?: string;
}

export interface Refine3DRegionResult {
  molblock: string;
  energy?: number;
  /** How many atoms were free to move (including buffer + attached H). */
  movableCount: number;
  /** Total atoms in the conformer. */
  atomCount: number;
  source: 'native-3d-region' | 'native-3d';
}

const stripTerminalHydrogens = (mol: Molecule): Molecule => {
  const g = buildGraph(mol);
  const keep = new Set(
    mol.atoms
      .filter(a => {
        if (a.element !== 'H') return true;
        return (g.nodes.get(a.id)?.neighbors.length ?? 0) > 1;
      })
      .map(a => a.id),
  );
  return {
    ...mol,
    atoms: mol.atoms.filter(a => keep.has(a.id)),
    bonds: mol.bonds.filter(b => keep.has(b.fromAtomId) && keep.has(b.toAtomId)),
  };
};

/** Expand seed atom ids by `hops` bond steps on the heavy-atom graph. */
export const expandAtomNeighborhood = (
  mol: Molecule,
  seedIds: Iterable<string>,
  hops: number,
): Set<string> => {
  const g = buildGraph(mol);
  const out = new Set<string>();
  for (const id of seedIds) {
    if (g.nodes.has(id)) out.add(id);
  }
  let frontier = [...out];
  for (let h = 0; h < hops; h++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const nb of g.nodes.get(id)?.neighbors ?? []) {
        if (out.has(nb)) continue;
        out.add(nb);
        next.push(nb);
      }
    }
    frontier = next;
    if (frontier.length === 0) break;
  }
  return out;
};

/** Parse a 3D V2000 molblock into id→xyz using sequential atom order + element. */
export const parseMolblock3DCoords = (
  molblock: string,
): { elements: string[]; coords: { x: number; y: number; z: number }[] } | null => {
  const lines = molblock.split(/\r?\n/);
  const counts = lines[3];
  if (!counts) return null;
  const nAtoms = parseInt(counts.slice(0, 3).trim() || '0', 10);
  if (!Number.isFinite(nAtoms) || nAtoms <= 0) return null;
  const elements: string[] = [];
  const coords: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < nAtoms; i++) {
    const line = lines[4 + i];
    if (!line || line.length < 34) return null;
    const raw = line.slice(31, 34).trim() || 'C';
    elements.push(raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase());
    coords.push({
      x: parseFloat(line.slice(0, 10)),
      y: parseFloat(line.slice(10, 20)),
      z: parseFloat(line.slice(20, 30)) || 0,
    });
  }
  return { elements, coords };
};

/**
 * Map previous 3D coords onto the new molecule by walking shared connectivity
 * in heavy-atom order. Returns positions for heavy atoms that match; missing
 * atoms get a placeholder near a neighbor (or origin).
 */
const seedPositionsFromPrevious = (
  mol: Molecule,
  previousMolblock3D: string | undefined,
): Map<string, { x: number; y: number; z: number }> | null => {
  if (!previousMolblock3D) return null;
  const prev = parseMolblock3DCoords(previousMolblock3D);
  if (!prev) return null;

  // Prefer matching by element sequence of heavy atoms when counts match.
  const heavy = mol.atoms.filter(a => a.element !== 'H');
  const prevHeavyIdx = prev.elements
    .map((e, i) => (e !== 'H' ? i : -1))
    .filter(i => i >= 0);
  if (heavy.length === 0 || prevHeavyIdx.length === 0) return null;

  const pos = new Map<string, { x: number; y: number; z: number }>();
  if (heavy.length === prevHeavyIdx.length) {
    // Element-sequence check — if it matches, use index mapping.
    let same = true;
    for (let i = 0; i < heavy.length; i++) {
      if (heavy[i]!.element !== prev.elements[prevHeavyIdx[i]!]!) {
        same = false;
        break;
      }
    }
    if (same) {
      for (let i = 0; i < heavy.length; i++) {
        pos.set(heavy[i]!.id, { ...prev.coords[prevHeavyIdx[i]!]! });
      }
      return pos;
    }
  }

  // Fallback: match by sorted id order within equal element counts (best-effort).
  const byElemPrev = new Map<string, number[]>();
  prevHeavyIdx.forEach(i => {
    const e = prev.elements[i]!;
    const list = byElemPrev.get(e) ?? [];
    list.push(i);
    byElemPrev.set(e, list);
  });
  const byElemNew = new Map<string, Atom[]>();
  for (const a of heavy) {
    const list = byElemNew.get(a.element) ?? [];
    list.push(a);
    byElemNew.set(a.element, list);
  }
  for (const [elem, atoms] of byElemNew) {
    const prevList = byElemPrev.get(elem);
    if (!prevList || prevList.length !== atoms.length) continue;
    atoms.forEach((a, i) => pos.set(a.id, { ...prev.coords[prevList[i]!]! }));
  }
  return pos.size > 0 ? pos : null;
};

/**
 * Refine 3D for a dirty region: freeze atoms outside dirty∪buffer, run short UFF.
 * Falls back to full `embed` path when previous coords can't be matched.
 */
export const refine3DRegion = (
  input: Molecule,
  opts: Refine3DRegionOptions,
): Refine3DRegionResult => {
  const bondBuffer = opts.bondBuffer ?? 2;
  const includeHydrogens = opts.includeHydrogens !== false;
  const maxIterations = opts.maxIterations ?? 35;

  const mol = perceiveAromaticity(kekulize(stripTerminalHydrogens(input)));
  if (mol.atoms.length === 0) {
    return {
      molblock: conformerToMolblock3D({ atoms: [], bonds: [] }),
      movableCount: 0,
      atomCount: 0,
      source: 'native-3d-region',
    };
  }

  const dirtySeeds = opts.dirtyAtomIds.filter(id => mol.atoms.some(a => a.id === id));
  const movableHeavy = expandAtomNeighborhood(mol, dirtySeeds, bondBuffer);
  // If the region covers most of the molecule, just do a normal short embed.
  const heavyCount = mol.atoms.filter(a => a.element !== 'H').length;
  if (movableHeavy.size === 0 || movableHeavy.size >= Math.max(8, heavyCount * 0.55)) {
    const conf = embed3D(input, {
      includeHydrogens,
      iterations: 40,
      forceField: 'uff',
      maxIterations,
    });
    return {
      molblock: conformerToMolblock3D(conf),
      movableCount: conf.atoms.length,
      atomCount: conf.atoms.length,
      source: 'native-3d',
    };
  }

  const seeded = seedPositionsFromPrevious(mol, opts.previousMolblock3D);
  if (!seeded) {
    const conf = embed3D(input, {
      includeHydrogens,
      iterations: 40,
      forceField: 'uff',
      maxIterations,
    });
    return {
      molblock: conformerToMolblock3D(conf),
      movableCount: conf.atoms.length,
      atomCount: conf.atoms.length,
      source: 'native-3d',
    };
  }

  const g = buildGraph(mol);
  const neighbors = new Map<string, string[]>();
  for (const a of mol.atoms) neighbors.set(a.id, g.nodes.get(a.id)?.neighbors ?? []);
  const hyb = perceiveHybridization(mol, g);

  // Fill missing heavy positions from neighbor average.
  for (const a of mol.atoms) {
    if (a.element === 'H') continue;
    if (seeded.has(a.id)) continue;
    const nbs = (neighbors.get(a.id) ?? [])
      .map(id => seeded.get(id))
      .filter((p): p is { x: number; y: number; z: number } => !!p);
    if (nbs.length > 0) {
      seeded.set(a.id, {
        x: nbs.reduce((s, p) => s + p.x, 0) / nbs.length + 0.4,
        y: nbs.reduce((s, p) => s + p.y, 0) / nbs.length + 0.2,
        z: nbs.reduce((s, p) => s + p.z, 0) / nbs.length + 0.3,
      });
    } else {
      seeded.set(a.id, { x: a.x * 0.0375, y: -a.y * 0.0375, z: 0.2 });
    }
  }

  // Un-thread only the movable region so a newly added ring that landed on top
  // of an existing ring is lifted out before minimization; frozen atoms stay put.
  unthreadSeed(seeded, mol, g, { movable: movableHeavy, passes: 2 });

  const heavyAtoms: Atom3D[] = mol.atoms
    .filter(a => a.element !== 'H')
    .map(a => ({
      id: a.id,
      element: a.element,
      charge: a.charge ?? 0,
      isotope: a.isotope,
      pos: { ...seeded.get(a.id)! },
    }));

  let allAtoms: Atom3D[] = [...heavyAtoms];
  let allBonds: Bond[] = [...mol.bonds];
  const parentOfH = new Map<string, string>();

  if (includeHydrogens) {
    const implicitH = implicitHydrogensForEmbedding(mol, g);
    const hAtoms: Atom3D[] = [];
    const hBonds: Bond[] = [];
    let hCounter = 0;
    for (const a of heavyAtoms) {
      const n = implicitH.get(a.id) ?? 0;
      if (n <= 0) continue;
      const nbrPos = (neighbors.get(a.id) ?? [])
        .filter(nid => mol.atoms.find(x => x.id === nid)?.element !== 'H')
        .map(nid => seeded.get(nid)!)
        .filter(Boolean);
      const hs = placeHydrogensVsepr(
        a.pos,
        nbrPos,
        n,
        a.element,
        hyb.get(a.id) ?? 'sp3',
      );
      for (const hp of hs) {
        hCounter += 1;
        const hid = `${a.id}_H${hCounter}`;
        hAtoms.push({ id: hid, element: 'H', charge: 0, pos: hp });
        hBonds.push({ id: `hb_${hCounter}`, fromAtomId: a.id, toAtomId: hid, order: 1 });
        parentOfH.set(hid, a.id);
      }
    }
    allAtoms = [...heavyAtoms, ...hAtoms];
    allBonds = [...mol.bonds, ...hBonds];
  }

  const movable = new Set(movableHeavy);
  for (const [hid, parent] of parentOfH) {
    if (movable.has(parent)) movable.add(hid);
  }

  const movableMask = allAtoms.map(a => movable.has(a.id));
  const movableCount = movableMask.filter(Boolean).length;

  const pseudo: Molecule = {
    atoms: allAtoms.map(a => ({ id: a.id, element: a.element, x: 0, y: 0, charge: a.charge })),
    bonds: allBonds,
  };
  const topo = buildUffTopology(pseudo);
  const stereo = perceiveStereo(input);
  if (stereo.chirals.length > 0 || stereo.cisTrans.length > 0) {
    const indexOf = new Map<string, number>();
    allAtoms.forEach((a, i) => indexOf.set(a.id, i));
    setStereoTerms(topo, stereo, indexOf);
  }

  const coords = new Float64Array(allAtoms.length * 3);
  allAtoms.forEach((a, i) => {
    coords[i * 3] = a.pos.x;
    coords[i * 3 + 1] = a.pos.y;
    coords[i * 3 + 2] = a.pos.z;
  });

  // Tiny jitter only on movable atoms so frozen region stays pixel-stable.
  for (let i = 0; i < allAtoms.length; i++) {
    if (!movableMask[i]) continue;
    const s = Math.sin((i + 1) * 12.9898) * 43758.5453;
    const j = (s - Math.floor(s) - 0.5) * 0.04;
    coords[i * 3] += j;
    coords[i * 3 + 1] += j * 0.7;
    coords[i * 3 + 2] += j * 0.5;
  }

  const result = minimizeUff(topo, coords, { maxIterations, movableMask });
  allAtoms.forEach((a, i) => {
    a.pos = { x: coords[i * 3]!, y: coords[i * 3 + 1]!, z: coords[i * 3 + 2]! };
  });

  const conf: Conformer = { atoms: allAtoms, bonds: allBonds };
  if (stereo.chirals.length > 0 || stereo.cisTrans.length > 0) {
    enforceStereoConstraints(conf, stereo);
  }
  return {
    molblock: conformerToMolblock3D(conf),
    energy: result.energy,
    movableCount,
    atomCount: allAtoms.length,
    source: 'native-3d-region',
  };
};

/**
 * Diff two molecules and return atom ids that should be treated as dirty for
 * region 3D (changed element/charge, new/removed atoms, endpoints of new/removed
 * or order-changed bonds, and atoms that moved significantly in 2D).
 */
export const dirtyAtomIdsFromEdit = (
  prev: Molecule | null,
  next: Molecule,
  moveThresholdPx = 8,
): {
  dirtyAtomIds: string[];
  topologyChanged: boolean;
  majorChange: boolean;
  /** Absolute change in heavy-atom count (import/paste vs local tweak). */
  heavyDelta: number;
} => {
  if (!prev || prev.atoms.length === 0) {
    return {
      dirtyAtomIds: next.atoms.map(a => a.id),
      topologyChanged: true,
      majorChange: true,
      heavyDelta: next.atoms.filter(a => a.element !== 'H').length,
    };
  }

  const prevById = new Map(prev.atoms.map(a => [a.id, a]));
  const nextById = new Map(next.atoms.map(a => [a.id, a]));
  const dirty = new Set<string>();
  let topologyChanged = false;

  for (const a of next.atoms) {
    const p = prevById.get(a.id);
    if (!p) {
      dirty.add(a.id);
      topologyChanged = true;
      continue;
    }
    if (p.element !== a.element || (p.charge ?? 0) !== (a.charge ?? 0)) {
      dirty.add(a.id);
      topologyChanged = true;
    }
    // Label / FG abbrev edits must dirty 3D (expandAliasesFor3D may change topology).
    const prevAlias = (p.alias ?? '').trim();
    const nextAlias = (a.alias ?? '').trim();
    if (prevAlias !== nextAlias) {
      dirty.add(a.id);
      topologyChanged = true;
    }
    if (Math.hypot(p.x - a.x, p.y - a.y) > moveThresholdPx) dirty.add(a.id);
  }
  for (const a of prev.atoms) {
    if (!nextById.has(a.id)) {
      topologyChanged = true;
      // Mark former neighbors in the new mol if still present.
      for (const b of prev.bonds) {
        if (b.fromAtomId === a.id && nextById.has(b.toAtomId)) dirty.add(b.toAtomId);
        if (b.toAtomId === a.id && nextById.has(b.fromAtomId)) dirty.add(b.fromAtomId);
      }
    }
  }

  const bondKey = (b: Bond): string => {
    const [x, y] = b.fromAtomId < b.toAtomId ? [b.fromAtomId, b.toAtomId] : [b.toAtomId, b.fromAtomId];
    return `${x}|${y}|${b.order}|${b.aromatic ? 1 : 0}|${b.stereo ?? ''}`;
  };
  const prevBonds = new Set(prev.bonds.map(bondKey));
  const nextBonds = new Set(next.bonds.map(bondKey));
  for (const b of next.bonds) {
    if (!prevBonds.has(bondKey(b))) {
      dirty.add(b.fromAtomId);
      dirty.add(b.toAtomId);
      topologyChanged = true;
    }
  }
  for (const b of prev.bonds) {
    if (!nextBonds.has(bondKey(b))) {
      if (nextById.has(b.fromAtomId)) dirty.add(b.fromAtomId);
      if (nextById.has(b.toAtomId)) dirty.add(b.toAtomId);
      topologyChanged = true;
    }
  }

  const heavyDelta = Math.abs(
    next.atoms.filter(a => a.element !== 'H').length - prev.atoms.filter(a => a.element !== 'H').length,
  );
  const majorChange =
    heavyDelta >= 6 ||
    dirty.size >= Math.max(12, Math.floor(next.atoms.filter(a => a.element !== 'H').length * 0.4));

  return { dirtyAtomIds: [...dirty], topologyChanged, majorChange, heavyDelta };
};
