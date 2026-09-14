/**
 * Progressive center-out (BFS tree) 3D embed.
 *
 * Instead of minimizing the whole molecule at once, grow a spanning tree from
 * a central atom shell-by-shell. Each shell is refined with previous shells
 * frozen — lower peak load, and the UI can stream partial conformers so the
 * user sees 3D build outward in real time.
 *
 * Performance: UFF runs on **heavy atoms only**. Implicit hydrogens are placed
 * once after minimization (and cheaply on progress frames for display). For
 * paclitaxel that is ~62 DOF×3 instead of ~113.
 */
import type { Bond, Molecule } from '@moldraw/domain';
import { covalentRadius } from '@moldraw/core';
import { buildGraph } from '@moldraw/engine';
import { kekulize, perceiveAromaticity } from '@moldraw/engine';
import { implicitHydrogensForEmbedding } from '@moldraw/engine';
import { applySeed3D, embed3D, type Atom3D, type Conformer } from './embed';
import { perceiveStereo } from './stereo';
import { enforceStereoConstraints } from './verifyStereo3D';
import { applyDepictionStereoSeed } from './stereoSeed';
import { conformerToMolblock3D } from './molblock3d';
import { buildUffTopology, setStereoTerms } from './forcefield/uff';
import { minimizeUff } from './forcefield/minimize';
import { perceiveHybridization } from './hybridization';
import { placeHydrogensVsepr } from './placeHydrogens';
import { tryIndigo2DSeed } from './indigoSeed';
import { unthreadSeed } from './unthread';
import { snapCoordinationPolyhedra } from './coordinationSeed';
import { isUffMetal } from './forcefield/uffParams';

export interface Progressive3DOptions {
  includeHydrogens?: boolean;
  /** UFF iterations per shell (default 28). */
  shellIterations?: number;
  /** Final polish iterations on heavy atoms (default 64; 0 to skip). */
  finalIterations?: number;
  /**
   * How many previous BFS shells stay movable with the current shell
   * (default 2). Wider buffer reduces frozen-atom clashes at junctions.
   */
  shellBuffer?: number;
  /** Called after each shell with a partial 3D molblock. */
  onProgress?: (update: Progressive3DProgress) => void;
  /**
   * Starting 3D coordinates (Å) by atom id — re-minimize an existing conformer
   * (e.g. canvas Structure Perspective pose) instead of lifting the flat 2D seed.
   */
  seed3D?: ReadonlyMap<string, { x: number; y: number; z: number }>;
}

export interface Progressive3DProgress {
  molblock: string;
  /** 0..1 */
  fraction: number;
  shell: number;
  shellCount: number;
  movableCount: number;
  atomCount: number;
  done: boolean;
  energy?: number;
}

export interface Progressive3DResult {
  molblock: string;
  energy?: number;
  shellCount: number;
  source: 'native-3d-progressive';
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

/** Pick a central heavy atom: highest degree, then closest to 2D centroid. */
export const pickCenterAtomId = (mol: Molecule): string | null => {
  const heavy = mol.atoms.filter(a => a.element !== 'H');
  if (heavy.length === 0) return null;
  const g = buildGraph(mol);
  let best = heavy[0]!;
  let bestScore = -Infinity;
  const cx = heavy.reduce((s, a) => s + a.x, 0) / heavy.length;
  const cy = heavy.reduce((s, a) => s + a.y, 0) / heavy.length;
  for (const a of heavy) {
    const deg = g.nodes.get(a.id)?.neighbors.length ?? 0;
    const dist = Math.hypot(a.x - cx, a.y - cy);
    const score = deg * 1000 - dist;
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return best.id;
};

/** BFS shells from center: shells[0] = [center], shells[k] = atoms at distance k. */
export const bfsShells = (mol: Molecule, centerId: string): string[][] => {
  const g = buildGraph(mol);
  const heavyIds = new Set(mol.atoms.filter(a => a.element !== 'H').map(a => a.id));
  if (!heavyIds.has(centerId)) return [];

  const visited = new Set<string>([centerId]);
  const shells: string[][] = [[centerId]];
  let frontier = [centerId];

  while (frontier.length > 0) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const nb of g.nodes.get(id)?.neighbors ?? []) {
        if (!heavyIds.has(nb) || visited.has(nb)) continue;
        visited.add(nb);
        next.push(nb);
      }
    }
    if (next.length === 0) break;
    shells.push(next);
    frontier = next;
  }

  // Orphans (disconnected components) — append as final shell.
  for (const id of heavyIds) {
    if (!visited.has(id)) {
      if (shells.length === 0) shells.push([]);
      shells[shells.length - 1]!.push(id);
      visited.add(id);
    }
  }
  return shells;
};

/** Deterministic out-of-plane seed so UFF can escape the flat 2D depiction. */
const seedZ = (i: number): number => {
  const s = Math.sin((i + 1) * 12.9898) * 43758.5453;
  return (s - Math.floor(s) - 0.5) * 0.7;
};

const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * Push apart non-bonded heavy atoms that are closer than a soft clash floor.
 * Bonded / 1–3 pairs are left alone. Runs a few sweeps so multi-body piles
 * separate without needing a full UFF pass.
 */
export const resolveHeavyClashes = (
  pos: Map<string, { x: number; y: number; z: number }>,
  mol: Molecule,
  sweeps = 4,
): number => {
  const heavy = mol.atoms.filter(a => a.element !== 'H');
  if (heavy.length < 2) return 0;

  const bonded = new Set<string>();
  const g = buildGraph(mol);
  for (const b of mol.bonds) {
    if (
      mol.atoms.find(a => a.id === b.fromAtomId)?.element === 'H' ||
      mol.atoms.find(a => a.id === b.toAtomId)?.element === 'H'
    ) {
      continue;
    }
    bonded.add(pairKey(b.fromAtomId, b.toAtomId));
    // Also skip 1–3 (angle) pairs — they are constrained by valence.
    const n1 = g.nodes.get(b.fromAtomId)?.neighbors ?? [];
    const n2 = g.nodes.get(b.toAtomId)?.neighbors ?? [];
    for (const nb of n1) {
      if (nb !== b.toAtomId) bonded.add(pairKey(nb, b.toAtomId));
    }
    for (const nb of n2) {
      if (nb !== b.fromAtomId) bonded.add(pairKey(nb, b.fromAtomId));
    }
  }

  let fixed = 0;
  for (let sweep = 0; sweep < sweeps; sweep++) {
    for (let i = 0; i < heavy.length; i++) {
      const a = heavy[i]!;
      const pa = pos.get(a.id);
      if (!pa) continue;
      const ra = covalentRadius(a.element);
      for (let j = i + 1; j < heavy.length; j++) {
        const b = heavy[j]!;
        if (bonded.has(pairKey(a.id, b.id))) continue;
        const pb = pos.get(b.id);
        if (!pb) continue;
        const dx = pb.x - pa.x;
        const dy = pb.y - pa.y;
        const dz = pb.z - pa.z;
        const dist = Math.hypot(dx, dy, dz);
        // Soft floor ≈ 1.55× covalent sum (C…C ≈ 2.35 Å). Severe overlaps
        // from progressive freezing sit well below this.
        const minDist = (ra + covalentRadius(b.element)) * 1.55;
        if (dist >= minDist || dist < 1e-8) continue;
        const push = (minDist - dist) * 0.55;
        const inv = 1 / dist;
        const ox = dx * inv * push * 0.5;
        const oy = dy * inv * push * 0.5;
        const oz = dz * inv * push * 0.5;
        pa.x -= ox;
        pa.y -= oy;
        pa.z -= oz;
        pb.x += ox;
        pb.y += oy;
        pb.z += oz;
        fixed += 1;
      }
    }
  }
  return fixed;
};

/**
 * Progressive BFS 3D: grow from center outward, refine each shell with prior
 * shells frozen, stream partial molblocks via onProgress.
 *
 * UFF always minimizes the heavy-atom skeleton; H are attached after (and on
 * progress frames for display only).
 */
export const embed3DProgressive = (
  input: Molecule,
  opts: Progressive3DOptions = {},
): Progressive3DResult => {
  const includeHydrogens = opts.includeHydrogens !== false;
  const shellIterations = opts.shellIterations ?? 28;
  const finalIterations = opts.finalIterations ?? 64;
  const shellBuffer = Math.max(1, opts.shellBuffer ?? 2);
  const onProgress = opts.onProgress;

  const mol = perceiveAromaticity(kekulize(stripTerminalHydrogens(input)));
  if (mol.atoms.length === 0) {
    return {
      molblock: conformerToMolblock3D({ atoms: [], bonds: [] }),
      shellCount: 0,
      source: 'native-3d-progressive',
    };
  }

  const heavy = mol.atoms.filter(a => a.element !== 'H');
  // Small molecules: one-shot embed is already fast — skip progressive overhead.
  if (heavy.length <= 18) {
    const conf = embed3D(input, {
      includeHydrogens,
      iterations: 80,
      forceField: 'uff',
      maxIterations: 120,
      seed3D: opts.seed3D,
    });
    const mb = conformerToMolblock3D(conf);
    onProgress?.({
      molblock: mb,
      fraction: 1,
      shell: 1,
      shellCount: 1,
      movableCount: conf.atoms.length,
      atomCount: conf.atoms.length,
      done: true,
    });
    return { molblock: mb, shellCount: 1, source: 'native-3d-progressive' };
  }

  const centerId = pickCenterAtomId(mol);
  if (!centerId) {
    const conf = embed3D(input, { includeHydrogens, maxIterations: 80, seed3D: opts.seed3D });
    return {
      molblock: conformerToMolblock3D(conf),
      shellCount: 1,
      source: 'native-3d-progressive',
    };
  }

  const shells = bfsShells(mol, centerId);
  const g = buildGraph(mol);
  const neighbors = new Map<string, string[]>();
  for (const a of mol.atoms) neighbors.set(a.id, g.nodes.get(a.id)?.neighbors ?? []);

  // Seed from 2D depiction (or Indigo / grid if no coords).
  let bondSum = 0;
  let bondCount = 0;
  const atomById = new Map(mol.atoms.map(a => [a.id, a]));
  for (const b of mol.bonds) {
    const a1 = atomById.get(b.fromAtomId);
    const a2 = atomById.get(b.toAtomId);
    if (a1 && a2) {
      bondSum += Math.hypot(a1.x - a2.x, a1.y - a2.y);
      bondCount += 1;
    }
  }
  const avgBond2D = bondCount > 0 ? bondSum / bondCount : 0;
  const hasDepiction = avgBond2D > 1e-6;
  const pos = new Map<string, { x: number; y: number; z: number }>();

  const allHeavyIds = new Set(heavy.map(a => a.id));
  // Perceive from the original input (wedge/dash + drawn coords) before seeding.
  const stereo = perceiveStereo(input);

  if (hasDepiction) {
    const factor = 1.5 / avgBond2D;
    mol.atoms.forEach((a, i) => {
      if (a.element === 'H') return;
      pos.set(a.id, {
        x: a.x * factor,
        y: -a.y * factor,
        z: seedZ(i),
      });
    });
    // Same as embed3D: bake wedges/E–Z into the seed so UFF cannot invert stereo.
    applyDepictionStereoSeed(mol, pos, stereo);
  } else {
    const seeded = tryIndigo2DSeed(mol);
    if (seeded) {
      const byId = new Map(seeded.atoms.map(a => [a.id, a]));
      mol.atoms.forEach((a, i) => {
        if (a.element === 'H') return;
        const s = byId.get(a.id);
        if (s) {
          pos.set(a.id, { x: s.x, y: s.y, z: seedZ(i) });
        } else {
          pos.set(a.id, { x: (i % 8) * 1.5, y: Math.floor(i / 8) * 1.5, z: seedZ(i) });
        }
      });
    } else {
      // No depiction and no Indigo seed — grid seed.
      mol.atoms.forEach((a, i) => {
        if (a.element === 'H') return;
        pos.set(a.id, { x: (i % 8) * 1.5, y: Math.floor(i / 8) * 1.5, z: seedZ(i) });
      });
    }
    if (stereo.chirals.length > 0 || stereo.cisTrans.length > 0) {
      applyDepictionStereoSeed(mol, pos, stereo);
    }
  }

  // Existing 3D geometry (re-clean in place) overrides the lifted 2D seed.
  applySeed3D(pos, opts.seed3D, [...allHeavyIds]);

  // Separate interlocked / overlapping ring systems before shell refinement.
  // A ring threaded by another ring's bond cannot be un-threaded by UFF.
  unthreadSeed(pos, mol, g);

  // Metal centres: seed donors on the ideal coordination polyhedron.
  const hasMetals = mol.atoms.some(a => isUffMetal(a.element));
  if (hasMetals) snapCoordinationPolyhedra(pos, mol, g);

  const hyb = perceiveHybridization(mol, g);
  let lastEnergy: number | undefined;
  let lastMb: string;

  /** Heavy-atom-only conformer — used for all UFF work. */
  const buildHeavyConformer = (): Conformer => {
    const heavyAtoms: Atom3D[] = [...allHeavyIds].map(id => {
      const a = atomById.get(id)!;
      return {
        id,
        element: a.element,
        charge: a.charge ?? 0,
        isotope: a.isotope,
        pos: { ...pos.get(id)! },
      };
    });
    const heavyBonds = mol.bonds.filter(
      b => allHeavyIds.has(b.fromAtomId) && allHeavyIds.has(b.toAtomId),
    );
    return { atoms: heavyAtoms, bonds: heavyBonds };
  };

  /** Attach implicit H with VSEPR tetrahedral/trigonal geometry. */
  const withHydrogens = (heavyConf: Conformer): Conformer => {
    if (!includeHydrogens) return heavyConf;
    const subMol: Molecule = {
      atoms: mol.atoms.filter(a => allHeavyIds.has(a.id)),
      bonds: heavyConf.bonds,
    };
    const subG = buildGraph(subMol);
    const implicitH = implicitHydrogensForEmbedding(subMol, subG);
    const hAtoms: Atom3D[] = [];
    const hBonds: Bond[] = [];
    let hCounter = 0;
    for (const a of heavyConf.atoms) {
      const n = implicitH.get(a.id) ?? 0;
      if (n <= 0) continue;
      const nbrPos = (neighbors.get(a.id) ?? [])
        .filter(nid => allHeavyIds.has(nid))
        .map(nid => pos.get(nid)!)
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
      }
    }
    return {
      atoms: [...heavyConf.atoms, ...hAtoms],
      bonds: [...heavyConf.bonds, ...hBonds],
    };
  };

  /** Short UFF with heavy frozen — settle H bond lengths/angles. */
  const polishHydrogens = (
    conf: Conformer,
    iterations: number,
  ): { conf: Conformer; energy?: number } => {
    if (iterations <= 0 || conf.atoms.every(a => a.element !== 'H')) {
      return { conf };
    }
    const movableMask = conf.atoms.map(a => a.element === 'H');
    const pseudo: Molecule = {
      atoms: conf.atoms.map(a => ({
        id: a.id,
        element: a.element,
        x: 0,
        y: 0,
        charge: a.charge,
      })),
      bonds: conf.bonds,
    };
    const topo = buildUffTopology(pseudo);
    const coords = new Float64Array(conf.atoms.length * 3);
    conf.atoms.forEach((a, i) => {
      coords[i * 3] = a.pos.x;
      coords[i * 3 + 1] = a.pos.y;
      coords[i * 3 + 2] = a.pos.z;
    });
    const result = minimizeUff(topo, coords, { maxIterations: iterations, movableMask });
    const atoms = conf.atoms.map((a, i) => ({
      ...a,
      pos: {
        x: coords[i * 3]!,
        y: coords[i * 3 + 1]!,
        z: coords[i * 3 + 2]!,
      },
    }));
    return { conf: { atoms, bonds: conf.bonds }, energy: result.energy };
  };

  const emitMolblock = (heavyConf: Conformer, polishH = false): string => {
    let conf = withHydrogens(heavyConf);
    if (polishH && includeHydrogens) {
      const polished = polishHydrogens(conf, 20);
      conf = polished.conf;
      if (typeof polished.energy === 'number') lastEnergy = polished.energy;
    }
    return conformerToMolblock3D(conf);
  };

  // Frame 0: full structure (2D seed + optional H for display).
  {
    const flatHeavy = buildHeavyConformer();
    lastMb = emitMolblock(flatHeavy);
    onProgress?.({
      molblock: lastMb,
      fraction: 0,
      shell: 0,
      shellCount: shells.length,
      movableCount: 0,
      atomCount: withHydrogens(flatHeavy).atoms.length,
      done: false,
    });
  }

  const refineShellHeavy = (movableHeavy: Set<string>): number | undefined => {
    const conf = buildHeavyConformer();
    if (conf.atoms.length < 2) return undefined;

    const movableMask = conf.atoms.map(a => movableHeavy.has(a.id));
    const pseudo: Molecule = {
      atoms: conf.atoms.map(a => ({
        id: a.id,
        element: a.element,
        x: 0,
        y: 0,
        charge: a.charge,
      })),
      bonds: conf.bonds,
    };
    const topo = buildUffTopology(pseudo);
    if (stereo.chirals.length || stereo.cisTrans.length) {
      const indexOf = new Map<string, number>();
      conf.atoms.forEach((a, i) => indexOf.set(a.id, i));
      setStereoTerms(topo, stereo, indexOf);
    }

    const coords = new Float64Array(conf.atoms.length * 3);
    conf.atoms.forEach((a, i) => {
      coords[i * 3] = a.pos.x;
      coords[i * 3 + 1] = a.pos.y;
      coords[i * 3 + 2] = a.pos.z;
    });
    for (let i = 0; i < conf.atoms.length; i++) {
      if (!movableMask[i]) continue;
      const s = Math.sin((i + 1) * 12.9898) * 43758.5453;
      const j = (s - Math.floor(s) - 0.5) * 0.12;
      coords[i * 3]! += j;
      coords[i * 3 + 1]! += j * 0.6;
      coords[i * 3 + 2]! += j * 1.4;
    }

    const result = minimizeUff(topo, coords, {
      maxIterations: shellIterations,
      movableMask,
    });
    conf.atoms.forEach((a, i) => {
      a.pos = {
        x: coords[i * 3]!,
        y: coords[i * 3 + 1]!,
        z: coords[i * 3 + 2]!,
      };
      pos.set(a.id, { ...a.pos });
    });
    if (stereo.chirals.length || stereo.cisTrans.length) {
      enforceStereoConstraints(conf, stereo);
      conf.atoms.forEach(a => pos.set(a.id, { ...a.pos }));
    }
    return result.energy;
  };

  for (let s = 0; s < shells.length; s++) {
    const shell = shells[s]!;
    const movable = new Set(shell);
    // Soft buffer: previous N shells can flex at the junction so frozen
    // atoms don't trap new shells into overlaps.
    for (let b = 1; b <= shellBuffer && s - b >= 0; b++) {
      for (const id of shells[s - b]!) movable.add(id);
    }
    lastEnergy = refineShellHeavy(movable);
    // Separate any residual non-bonded clashes before streaming the frame.
    resolveHeavyClashes(pos, mol, 2);
    const heavyConf = buildHeavyConformer();
    lastMb = emitMolblock(heavyConf);
    onProgress?.({
      molblock: lastMb,
      fraction: (s + 1) / (shells.length + (finalIterations > 0 ? 1 : 0)),
      shell: s + 1,
      shellCount: shells.length,
      movableCount: movable.size,
      atomCount: withHydrogens(heavyConf).atoms.length,
      done: false,
      energy: lastEnergy,
    });
  }

  // Final polish: resolve clashes, then full-molecule heavy UFF, then H.
  resolveHeavyClashes(pos, mol, 5);
  if (hasMetals) snapCoordinationPolyhedra(pos, mol, g);
  if (finalIterations > 0 && allHeavyIds.size > 0) {
    const conf = buildHeavyConformer();
    const movableMask = conf.atoms.map(() => true);
    const pseudo: Molecule = {
      atoms: conf.atoms.map(a => ({
        id: a.id,
        element: a.element,
        x: 0,
        y: 0,
        charge: a.charge,
      })),
      bonds: conf.bonds,
    };
    const topo = buildUffTopology(pseudo);
    if (stereo.chirals.length || stereo.cisTrans.length) {
      const indexOf = new Map<string, number>();
      conf.atoms.forEach((a, i) => indexOf.set(a.id, i));
      setStereoTerms(topo, stereo, indexOf);
    }
    const coords = new Float64Array(conf.atoms.length * 3);
    conf.atoms.forEach((a, i) => {
      coords[i * 3] = a.pos.x;
      coords[i * 3 + 1] = a.pos.y;
      coords[i * 3 + 2] = a.pos.z;
    });
    const result = minimizeUff(topo, coords, {
      maxIterations: finalIterations,
      movableMask,
      gradTolerance: 5e-3,
    });
    conf.atoms.forEach((a, i) => {
      a.pos = {
        x: coords[i * 3]!,
        y: coords[i * 3 + 1]!,
        z: coords[i * 3 + 2]!,
      };
      pos.set(a.id, { ...a.pos });
    });
    // One more clash sweep in case UFF stopped early on a soft plateau.
    resolveHeavyClashes(pos, mol, 3);
    conf.atoms.forEach(a => {
      const p = pos.get(a.id);
      if (p) a.pos = { ...p };
    });
    if (stereo.chirals.length || stereo.cisTrans.length) {
      enforceStereoConstraints(conf, stereo);
      conf.atoms.forEach(a => pos.set(a.id, { ...a.pos }));
    }
    lastMb = emitMolblock(conf, true);
    lastEnergy = result.energy;
  } else {
    lastMb = emitMolblock(buildHeavyConformer(), true);
  }

  onProgress?.({
    molblock: lastMb,
    fraction: 1,
    shell: shells.length,
    shellCount: shells.length,
    movableCount: allHeavyIds.size,
    atomCount: parseInt(lastMb.split(/\r?\n/)[3]?.slice(0, 3) ?? '0', 10) || allHeavyIds.size,
    done: true,
    energy: lastEnergy,
  });

  return {
    molblock: lastMb,
    energy: lastEnergy,
    shellCount: shells.length,
    source: 'native-3d-progressive',
  };
};
