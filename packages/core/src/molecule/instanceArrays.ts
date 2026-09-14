/**
 * InstanceArray: seed fragment + placement transforms (document-level instancing).
 * Expand to real atoms for export / 3D / cleanup / break-apart / first chemistry edit.
 */
import type { Atom, Atom3DPose, Bond, InstanceArray, InstanceArraySite, Molecule } from '@moldraw/domain';
import { rotate3DPose } from './perspective3D';

export const INSTANCE_ARRAY_THRESHOLD = 1;

const newId = () => Math.random().toString(36).slice(2, 11);

const selectionCentroid = (
  atoms: Atom[],
  atomIds: string[],
): { cx: number; cy: number } | null => {
  if (atomIds.length === 0) return null;
  const set = new Set(atomIds);
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const a of atoms) {
    if (!set.has(a.id)) continue;
    sx += a.x;
    sy += a.y;
    n += 1;
  }
  if (n === 0) return null;
  return { cx: sx / n, cy: sy / n };
};

const instanceAtomId = (arrayId: string, siteIndex: number, seedAtomId: string) =>
  `ia:${arrayId}:${siteIndex}:${seedAtomId}`;

const instanceBondId = (arrayId: string, siteIndex: number, seedBondId: string) =>
  `ia:${arrayId}:${siteIndex}:b:${seedBondId}`;

/** Rotate point (x,y) about (cx,cy) by rot radians. */
const rotPoint = (x: number, y: number, cx: number, cy: number, rot: number) => {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const dx = x - cx;
  const dy = y - cy;
  return { x: cx + c * dx - s * dy, y: cy + s * dx + c * dy };
};

export function parseInstanceAtomId(
  id: string,
): { arrayId: string; siteIndex: number; seedAtomId: string } | null {
  if (!id.startsWith('ia:')) return null;
  const parts = id.slice(3).split(':');
  if (parts.length < 3 || parts[2] === 'b') return null;
  const siteIndex = Number(parts[1]);
  if (!Number.isInteger(siteIndex) || siteIndex < 0) return null;
  const seedAtomId = parts.slice(2).join(':');
  if (!parts[0] || !seedAtomId) return null;
  return { arrayId: parts[0], siteIndex, seedAtomId };
}

export function parseInstanceBondId(
  id: string,
): { arrayId: string; siteIndex: number; seedBondId: string } | null {
  if (!id.startsWith('ia:')) return null;
  const parts = id.slice(3).split(':');
  if (parts.length < 4 || parts[2] !== 'b') return null;
  const siteIndex = Number(parts[1]);
  if (!Number.isInteger(siteIndex) || siteIndex < 0) return null;
  const seedBondId = parts.slice(3).join(':');
  if (!parts[0] || !seedBondId) return null;
  return { arrayId: parts[0], siteIndex, seedBondId };
}

export const isInstanceAtomId = (id: string): boolean => parseInstanceAtomId(id) != null;

export function isValidInstanceAtomId(mol: Molecule, id: string): boolean {
  const p = parseInstanceAtomId(id);
  if (!p) return false;
  const arr = mol.instanceArrays?.find(a => a.id === p.arrayId);
  if (!arr || p.siteIndex >= arr.sites.length) return false;
  return arr.seedAtomIds.includes(p.seedAtomId);
}

export function isValidInstanceBondId(mol: Molecule, id: string): boolean {
  const p = parseInstanceBondId(id);
  if (!p) return false;
  const arr = mol.instanceArrays?.find(a => a.id === p.arrayId);
  if (!arr || p.siteIndex >= arr.sites.length) return false;
  return mol.bonds.some(b => b.id === p.seedBondId);
}

export function virtualAtomIdsForArray(arr: InstanceArray): string[] {
  const core = new Set(arr.dendrimer?.coreAtomIds ?? []);
  const ids: string[] = [];
  arr.sites.forEach((_, siteIndex) => {
    for (const sid of arr.seedAtomIds) {
      if (core.has(sid)) continue;
      ids.push(instanceAtomId(arr.id, siteIndex, sid));
    }
  });
  return ids;
}

export function seedAtomIdsOfInstanceArrays(mol: Molecule): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const arr of mol.instanceArrays ?? []) {
    for (const id of arr.seedAtomIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

export function partitionAtomIdsForInstances(
  mol: Molecule,
  atomIds: string[],
): { realAtomIds: string[]; copySites: { arrayId: string; siteIndex: number }[] } {
  const realAtomIds: string[] = [];
  const siteMap = new Map<string, { arrayId: string; siteIndex: number }>();
  for (const id of atomIds) {
    const p = parseInstanceAtomId(id);
    if (p && isValidInstanceAtomId(mol, id)) {
      siteMap.set(`${p.arrayId}:${p.siteIndex}`, {
        arrayId: p.arrayId,
        siteIndex: p.siteIndex,
      });
    } else if (!id.startsWith('ia:')) {
      realAtomIds.push(id);
    }
  }
  return { realAtomIds, copySites: [...siteMap.values()] };
}

export function applyInstanceCopyTranslation(
  mol: Molecule,
  sites: ReadonlyArray<{ arrayId: string; siteIndex: number }>,
  dx: number,
  dy: number,
): Molecule {
  if (!mol.instanceArrays?.length || sites.length === 0) return mol;
  const key = new Set(sites.map(s => `${s.arrayId}:${s.siteIndex}`));
  return {
    ...mol,
    instanceArrays: mol.instanceArrays.map(arr => ({
      ...arr,
      sites: arr.sites.map((site, i) =>
        key.has(`${arr.id}:${i}`) ? { ...site, dx: site.dx + dx, dy: site.dy + dy } : site,
      ),
    })),
  };
}

export function applyInstanceCopyRotation(
  mol: Molecule,
  sites: ReadonlyArray<{ arrayId: string; siteIndex: number }>,
  cx: number,
  cy: number,
  deltaRad: number,
): Molecule {
  if (!mol.instanceArrays?.length || sites.length === 0 || Math.abs(deltaRad) < 1e-7) {
    return mol;
  }
  const key = new Set(sites.map(s => `${s.arrayId}:${s.siteIndex}`));
  const c = Math.cos(deltaRad);
  const s = Math.sin(deltaRad);
  return {
    ...mol,
    instanceArrays: mol.instanceArrays.map(arr => {
      const sc = selectionCentroid(mol.atoms, arr.seedAtomIds);
      if (!sc) return arr;
      return {
        ...arr,
        sites: arr.sites.map((site, i) => {
          if (!key.has(`${arr.id}:${i}`)) return site;
          const px = sc.cx + site.dx;
          const py = sc.cy + site.dy;
          const nx = cx + c * (px - cx) - s * (py - cy);
          const ny = cy + s * (px - cx) + c * (py - cy);
          return { dx: nx - sc.cx, dy: ny - sc.cy, rot: site.rot + deltaRad };
        }),
      };
    }),
  };
}

const expandDendrimerArray = (
  arr: InstanceArray,
  mol: Molecule,
  atomById: Map<string, Atom>,
  extraAtoms: Atom[],
  extraBonds: Bond[],
): void => {
  const d = arr.dendrimer;
  if (!d) return;
  const coreSet = new Set(d.coreAtomIds);
  const branch = arr.seedAtomIds.filter(id => atomById.has(id) && !coreSet.has(id));
  if (branch.length === 0) return;
  const branchSet = new Set(branch);
  const intraBonds = mol.bonds.filter(
    b => branchSet.has(b.fromAtomId) && branchSet.has(b.toAtomId),
  );
  const crossBonds = mol.bonds.filter(b => {
    const fCore = coreSet.has(b.fromAtomId);
    const tCore = coreSet.has(b.toAtomId);
    const fBr = branchSet.has(b.fromAtomId);
    const tBr = branchSet.has(b.toAtomId);
    return (fCore && tBr) || (tCore && fBr);
  });
  const attachments = d.attachmentAtomIds.filter(id => atomById.has(id));

  arr.sites.forEach((site, siteIndex) => {
    const angle = site.rot;
    const idMap = new Map<string, string>();
    for (const sid of branch) {
      const src = atomById.get(sid);
      if (!src) continue;
      const nid = instanceAtomId(arr.id, siteIndex, sid);
      idMap.set(sid, nid);
      const p = rotPoint(src.x, src.y, d.cx, d.cy, angle);
      extraAtoms.push({ ...src, id: nid, x: p.x, y: p.y });
    }
    for (const b of intraBonds) {
      const from = idMap.get(b.fromAtomId);
      const to = idMap.get(b.toAtomId);
      if (!from || !to) continue;
      extraBonds.push({
        ...b,
        id: instanceBondId(arr.id, siteIndex, b.id),
        fromAtomId: from,
        toAtomId: to,
      });
    }
    const att = attachments[siteIndex + 1] ?? attachments[(siteIndex + 1) % Math.max(1, attachments.length)];
    if (!att) return;
    for (const b of crossBonds) {
      const brEnd = coreSet.has(b.fromAtomId) ? b.toAtomId : b.fromAtomId;
      const copied = idMap.get(brEnd);
      if (!copied) continue;
      extraBonds.push({
        ...b,
        id: instanceBondId(arr.id, siteIndex, b.id),
        fromAtomId: coreSet.has(b.fromAtomId) ? att : copied,
        toAtomId: coreSet.has(b.toAtomId) ? att : copied,
      });
    }
  });
};

/**
 * Expand all InstanceArrays into real atom copies (deterministic ids).
 * By default clears `instanceArrays`. Pass `keepArrays` for the canvas display
 * path so seed vs copy identity stays available for highlight / hit-test.
 */
export function expandInstanceArrays(
  mol: Molecule,
  options?: { keepArrays?: boolean },
): Molecule {
  const arrays = mol.instanceArrays;
  if (!arrays?.length) return mol;

  const atomById = new Map(mol.atoms.map(a => [a.id, a]));
  const extraAtoms: Atom[] = [];
  const extraBonds: Bond[] = [];
  const seedPose = mol.perspective3D?.positions;
  let extraPose: Record<string, Atom3DPose> | undefined;

  // COF lattices with a stored view rotation: collect seed + copy ids while
  // expanding (instead of re-scanning and parsing every expanded atom id later).
  const viewRotLattices = (mol.cofLattices ?? []).filter(l => l.viewRot);
  const latticeIndexBySeedId = new Map<string, number>();
  const latticeIds: string[][] = viewRotLattices.map(l => {
    const ids: string[] = [];
    for (const id of l.atomIds) {
      if (atomById.has(id)) ids.push(id);
    }
    return ids;
  });
  viewRotLattices.forEach((l, i) => {
    for (const id of l.atomIds) latticeIndexBySeedId.set(id, i);
  });

  for (const arr of arrays) {
    if (arr.dendrimer) {
      expandDendrimerArray(arr, mol, atomById, extraAtoms, extraBonds);
      continue;
    }
    const seed = arr.seedAtomIds.filter(id => atomById.has(id));
    if (seed.length === 0) continue;
    const sc = selectionCentroid(mol.atoms, seed);
    if (!sc) continue;
    const seedSet = new Set(seed);
    const seedBonds = mol.bonds.filter(
      b => seedSet.has(b.fromAtomId) && seedSet.has(b.toAtomId),
    );

    arr.sites.forEach((site, siteIndex) => {
      const idMap = new Map<string, string>();
      const dz = site.dz ?? 0;
      for (const sid of seed) {
        const src = atomById.get(sid);
        if (!src) continue;
        const nid = instanceAtomId(arr.id, siteIndex, sid);
        idMap.set(sid, nid);
        let x = src.x + site.dx;
        let y = src.y + site.dy;
        if (Math.abs(site.rot) > 1e-7) {
          const p = rotPoint(x, y, sc.cx + site.dx, sc.cy + site.dy, site.rot);
          x = p.x;
          y = p.y;
        }
        extraAtoms.push({ ...src, id: nid, x, y });
        if (latticeIndexBySeedId.size) {
          const li = latticeIndexBySeedId.get(sid);
          if (li != null) latticeIds[li]!.push(nid);
        }
        const sp = seedPose?.[sid];
        if (sp || Math.abs(dz) > 1e-6) {
          extraPose ??= { ...(seedPose ?? {}) };
          extraPose[nid] = {
            x: (sp?.x ?? src.x) + site.dx,
            y: (sp?.y ?? src.y) + site.dy,
            z: (sp?.z ?? 0) + dz,
          };
        }
      }
      for (const b of seedBonds) {
        const from = idMap.get(b.fromAtomId);
        const to = idMap.get(b.toAtomId);
        if (!from || !to) continue;
        extraBonds.push({
          ...b,
          id: instanceBondId(arr.id, siteIndex, b.id),
          fromAtomId: from,
          toAtomId: to,
        });
      }
    });
  }

  let next: Molecule = {
    ...mol,
    atoms: [...mol.atoms, ...extraAtoms],
    bonds: [...mol.bonds, ...extraBonds],
  };
  if (extraPose) {
    next = {
      ...next,
      perspective3D: {
        positions: extraPose,
        depthShading: mol.perspective3D?.depthShading !== false,
        depthFade: mol.perspective3D?.depthFade,
        depthWedges: mol.perspective3D?.depthWedges === true,
      },
    };
    viewRotLattices.forEach((lat, i) => {
      const ids = latticeIds[i]!;
      if (ids.length && lat.viewRot) {
        next = rotate3DPose(next, lat.viewRot.x, lat.viewRot.y, ids);
      }
    });
  }
  if (!options?.keepArrays) delete next.instanceArrays;
  return next;
}

/** Expand copies for draw/hit but keep `instanceArrays` so the parent stays identifiable. */
export function materializeInstanceArraysForDisplay(mol: Molecule): Molecule {
  if (!mol.instanceArrays?.length) return mol;
  return expandInstanceArrays(mol, { keepArrays: true });
}

export function attachInstanceArray(
  mol: Molecule,
  seedAtomIds: string[],
  sites: InstanceArraySite[],
  label?: string,
  circular?: InstanceArray['circular'],
  linear?: InstanceArray['linear'],
): { molecule: Molecule; instanceArray: InstanceArray } {
  const arr: InstanceArray = {
    id: newId(),
    seedAtomIds: [...seedAtomIds],
    sites,
    label,
    ...(circular ? { circular } : {}),
    ...(linear ? { linear } : {}),
  };
  const prev = mol.instanceArrays ?? [];
  return {
    molecule: { ...mol, instanceArrays: [...prev, arr] },
    instanceArray: arr,
  };
}

/** Upsert sites on the array whose seed overlaps `seedAtomIds` (keeps the array id). */
export function upsertInstanceArray(
  mol: Molecule,
  seedAtomIds: string[],
  sites: InstanceArraySite[],
  label?: string,
  circular?: InstanceArray['circular'],
  linear?: InstanceArray['linear'],
): { molecule: Molecule; instanceArray: InstanceArray } {
  const existing = mol.instanceArrays?.find(a =>
    a.seedAtomIds.some(id => seedAtomIds.includes(id)),
  );
  if (!existing) {
    return attachInstanceArray(mol, seedAtomIds, sites, label, circular, linear);
  }
  const arr: InstanceArray = {
    ...existing,
    seedAtomIds: existing.seedAtomIds,
    sites,
    label: label ?? existing.label,
  };
  if (linear) {
    arr.linear = linear;
    delete arr.circular;
  } else if (circular) {
    arr.circular = circular;
    delete arr.linear;
  }
  const others = (mol.instanceArrays ?? []).filter(a => a.id !== arr.id);
  return {
    molecule: { ...mol, instanceArrays: [...others, arr] },
    instanceArray: arr,
  };
}

/**
 * Like `upsertInstanceArray`, but the seed list is *replaced* by `seedAtomIds`
 * (the array id is kept). Used by lattice growth where the seed sheet gains or
 * loses atoms while its depth copies must keep their `ia:` identity.
 */
export function upsertInstanceArraySeeds(
  mol: Molecule,
  previousSeedAtomIds: readonly string[],
  seedAtomIds: string[],
  sites: InstanceArraySite[],
  label?: string,
): { molecule: Molecule; instanceArray: InstanceArray } {
  const probe = new Set([...previousSeedAtomIds, ...seedAtomIds]);
  const existing = mol.instanceArrays?.find(a => a.seedAtomIds.some(id => probe.has(id)));
  if (!existing) return attachInstanceArray(mol, seedAtomIds, sites, label);
  const arr: InstanceArray = {
    ...existing,
    seedAtomIds: [...seedAtomIds],
    sites,
    label: label ?? existing.label,
  };
  const others = (mol.instanceArrays ?? []).filter(a => a.id !== arr.id);
  return {
    molecule: { ...mol, instanceArrays: [...others, arr] },
    instanceArray: arr,
  };
}

export function upsertDendrimerInstanceArray(
  mol: Molecule,
  seedAtomIds: string[],
  sites: InstanceArraySite[],
  dendrimer: NonNullable<InstanceArray['dendrimer']>,
): { molecule: Molecule; instanceArray: InstanceArray } {
  const coreSet = new Set(dendrimer.coreAtomIds);
  const incoming = seedAtomIds.filter(id => !coreSet.has(id));
  const incomingSet = new Set(incoming);
  const existing = mol.instanceArrays?.find(
    a =>
      Boolean(a.dendrimer) &&
      (a.dendrimer!.coreAtomIds.some(id => coreSet.has(id)) ||
        a.seedAtomIds.some(id => incomingSet.has(id))),
  );
  const mergedSeed = [
    ...new Set([
      ...(existing?.seedAtomIds ?? []).filter(id => !coreSet.has(id)),
      ...incoming,
    ]),
  ];
  let dend = dendrimer;
  if (existing?.dendrimer && mergedSeed.length > 0 && seedAtomIds.length === 0) {
    const locked = existing.dendrimer.seedAttachmentAtomId;
    const rotated = rotateIdsTo(dendrimer.attachmentAtomIds, locked);
    dend = {
      ...dendrimer,
      attachmentAtomIds: rotated,
      seedAttachmentAtomId: rotated.includes(locked) ? locked : dendrimer.seedAttachmentAtomId,
    };
  }
  const arr: InstanceArray = {
    id: existing?.id ?? newId(),
    seedAtomIds: mergedSeed,
    sites,
    label: existing?.label ?? 'Dendrimer',
    dendrimer: dend,
  };
  const others = (mol.instanceArrays ?? []).filter(a => a.id !== arr.id);
  return {
    molecule: { ...mol, instanceArrays: [...others, arr] },
    instanceArray: arr,
  };
}

function wrapPi(delta: number): number {
  let d = delta;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function rotateIdsTo(ids: string[], first: string): string[] {
  const i = ids.indexOf(first);
  if (i <= 0) return ids;
  return [...ids.slice(i), ...ids.slice(0, i)];
}

/** Append newly drawn atoms to a live dendrimer parent branch. */
export function growDendrimerSeed(mol: Molecule, candidateAtomIds: string[]): Molecule {
  const arr = mol.instanceArrays?.find(a => a.dendrimer);
  if (!arr?.dendrimer || candidateAtomIds.length === 0) return mol;
  const d = arr.dendrimer;
  const core = new Set(d.coreAtomIds);
  const seed = new Set(arr.seedAtomIds);
  const attachments = new Set(d.attachmentAtomIds);
  const half = Math.PI / Math.max(2, d.foldCount);

  // Index once: every growth query below is O(candidates × degree), not O(candidates × bonds).
  const atomById = new Map<string, Atom>();
  for (const a of mol.atoms) atomById.set(a.id, a);
  const candidateSet = new Set(candidateAtomIds);
  const nbrs = new Map<string, string[]>();
  for (const b of mol.bonds) {
    if (candidateSet.has(b.fromAtomId)) {
      let l = nbrs.get(b.fromAtomId);
      if (!l) nbrs.set(b.fromAtomId, (l = []));
      l.push(b.toAtomId);
    }
    if (candidateSet.has(b.toAtomId)) {
      let l = nbrs.get(b.toAtomId);
      if (!l) nbrs.set(b.toAtomId, (l = []));
      l.push(b.fromAtomId);
    }
  }

  const bondedToCoreOrSeed = (id: string) =>
    (nbrs.get(id) ?? []).some(
      other => seed.has(other) || core.has(other) || attachments.has(other),
    );

  const nearestAttachment = (atom: Atom): { id: string; delta: number } | null => {
    let best: { id: string; delta: number } | null = null;
    for (const aid of d.attachmentAtomIds) {
      const a = atomById.get(aid);
      if (!a) continue;
      const delta = wrapPi(
        Math.atan2(atom.y - d.cy, atom.x - d.cx) - Math.atan2(a.y - d.cy, a.x - d.cx),
      );
      if (!best || Math.abs(delta) < Math.abs(best.delta)) best = { id: aid, delta };
    }
    return best;
  };

  let coreR = 0;
  for (const id of d.coreAtomIds) {
    const a = atomById.get(id);
    if (!a) continue;
    coreR = Math.max(coreR, Math.hypot(a.x - d.cx, a.y - d.cy));
  }

  const candidates = candidateAtomIds.filter(id => {
    if (core.has(id) || seed.has(id)) return false;
    const atom = atomById.get(id);
    if (!atom) return false;
    // A second ring drawn on the core must not become the seed (that rotates
    // the core). Branch atoms sit outside the core radius.
    if (coreR > 0 && Math.hypot(atom.x - d.cx, atom.y - d.cy) <= coreR * 0.92) {
      return false;
    }
    return true;
  });
  const accepted = new Set<string>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const id of candidates) {
      if (accepted.has(id)) continue;
      if (bondedToCoreOrSeed(id) || (nbrs.get(id) ?? []).some(other => accepted.has(other))) {
        accepted.add(id);
        grew = true;
        continue;
      }
      // Free-drawn first branch: accept atoms that sit in any fold wedge, then
      // lock that fold as the parent (see inferredAtt below).
      if (seed.size === 0 && accepted.size === 0) {
        const atom = atomById.get(id);
        const near = atom ? nearestAttachment(atom) : null;
        if (near && Math.abs(near.delta) <= half + 1e-6) {
          accepted.add(id);
          grew = true;
        }
      }
    }
  }
  const add = candidates.filter(id => accepted.has(id));
  if (add.length === 0) return mol;

  let inferredAtt = d.seedAttachmentAtomId;
  for (const id of add) {
    const coreNbr = (nbrs.get(id) ?? []).find(other => core.has(other));
    if (coreNbr) {
      inferredAtt = coreNbr;
      break;
    }
  }
  if (inferredAtt === d.seedAttachmentAtomId && seed.size === 0) {
    const first = atomById.get(add[0]!);
    const near = first ? nearestAttachment(first) : null;
    if (near) inferredAtt = near.id;
  }

  const attachmentAtomIds = rotateIdsTo(d.attachmentAtomIds, inferredAtt);
  return {
    ...mol,
    instanceArrays: (mol.instanceArrays ?? []).map(a =>
      a.id === arr.id
        ? {
            ...a,
            seedAtomIds: [...a.seedAtomIds.filter(id => !core.has(id)), ...add],
            dendrimer: {
              ...d,
              attachmentAtomIds,
              seedAttachmentAtomId: inferredAtt,
            },
          }
        : a,
    ),
  };
}

/** True when creating this many additional copies should use InstanceArray. */
export const shouldUseInstanceArray = (additionalSites: number): boolean =>
  additionalSites >= INSTANCE_ARRAY_THRESHOLD;

export const hasInstanceArrays = (mol: Molecule): boolean =>
  (mol.instanceArrays?.length ?? 0) > 0;

/** Arrays whose seed / core / virtual copies intersect `atomIds` (one pass over the ids). */
const arraysTouchedBy = (mol: Molecule, atomIds: string[]): InstanceArray[] => {
  const arrays = mol.instanceArrays ?? [];
  if (arrays.length === 0 || atomIds.length === 0) return [];
  const sel = new Set(atomIds);
  const touchedArrayIds = new Set<string>();
  for (const id of atomIds) {
    const p = parseInstanceAtomId(id);
    if (p) touchedArrayIds.add(p.arrayId);
  }
  return arrays.filter(
    a =>
      touchedArrayIds.has(a.id) ||
      a.seedAtomIds.some(id => sel.has(id)) ||
      a.dendrimer?.coreAtomIds.some(id => sel.has(id)),
  );
};

export function instanceArrayIdsForAtomIds(mol: Molecule, atomIds: string[]): string[] {
  return arraysTouchedBy(mol, atomIds).map(a => a.id);
}

/** Seed + virtual copy ids for every InstanceArray touched by `atomIds`. */
export function expandAtomIdsToInstanceArrays(mol: Molecule, atomIds: string[]): string[] {
  const hit = arraysTouchedBy(mol, atomIds);
  if (hit.length === 0) return [];
  const out = new Set<string>(atomIds);
  for (const arr of hit) {
    if (arr.dendrimer) {
      // Parent stays individually selectable; copies follow the parent and
      // are not added to the selection.
      const core = new Set(arr.dendrimer.coreAtomIds);
      for (const id of core) out.add(id);
      for (const id of arr.seedAtomIds) {
        if (!core.has(id)) out.add(id);
      }
      for (const id of atomIds) {
        if (id.startsWith(`ia:${arr.id}:`)) out.delete(id);
      }
      continue;
    }
    for (const id of arr.seedAtomIds) out.add(id);
    for (const id of virtualAtomIdsForArray(arr)) out.add(id);
  }
  return [...out];
}

/** Keep dendrimer rotation origin on the live core centroid. */
export function syncDendrimerCoreCenters(mol: Molecule): Molecule {
  if (!mol.instanceArrays?.some(a => a.dendrimer)) return mol;
  return {
    ...mol,
    instanceArrays: mol.instanceArrays.map(arr => {
      if (!arr.dendrimer) return arr;
      const sc = selectionCentroid(mol.atoms, arr.dendrimer.coreAtomIds);
      return sc ? { ...arr, dendrimer: { ...arr.dendrimer, cx: sc.cx, cy: sc.cy } } : arr;
    }),
  };
}

export function rotateInstanceArrayPlacements(
  mol: Molecule,
  arrayIds: ReadonlySet<string>,
  deltaRad: number,
): Molecule {
  if (!mol.instanceArrays?.length || arrayIds.size === 0 || Math.abs(deltaRad) < 1e-7) {
    return mol;
  }
  const c = Math.cos(deltaRad);
  const s = Math.sin(deltaRad);
  return {
    ...mol,
    instanceArrays: mol.instanceArrays.map(arr => {
      if (!arrayIds.has(arr.id)) return arr;
      if (arr.dendrimer) {
        const sc = selectionCentroid(mol.atoms, arr.dendrimer.coreAtomIds);
        return sc
          ? { ...arr, dendrimer: { ...arr.dendrimer, cx: sc.cx, cy: sc.cy } }
          : arr;
      }
      return {
        ...arr,
        sites: arr.sites.map(site => ({
          dx: c * site.dx - s * site.dy,
          dy: s * site.dx + c * site.dy,
          rot: site.rot + deltaRad,
        })),
      };
    }),
  };
}

export function scaleInstanceArrayPlacements(
  mol: Molecule,
  arrayIds: ReadonlySet<string>,
  factor: number,
): Molecule {
  if (!mol.instanceArrays?.length || arrayIds.size === 0 || !Number.isFinite(factor)) {
    return mol;
  }
  const f = Math.max(0.05, Math.min(20, factor));
  if (Math.abs(f - 1) < 1e-7) return mol;
  return {
    ...mol,
    instanceArrays: mol.instanceArrays.map(arr => {
      if (!arrayIds.has(arr.id)) return arr;
      if (arr.dendrimer) {
        const sc = selectionCentroid(mol.atoms, arr.dendrimer.coreAtomIds);
        return sc
          ? { ...arr, dendrimer: { ...arr.dendrimer, cx: sc.cx, cy: sc.cy } }
          : arr;
      }
      return {
        ...arr,
        sites: arr.sites.map(site => ({
          ...site,
          dx: site.dx * f,
          dy: site.dy * f,
        })),
      };
    }),
  };
}

export function pruneEmptyInstanceArrays(mol: Molecule): Molecule {
  if (!mol.instanceArrays?.length) return mol;
  const atomSet = new Set(mol.atoms.map(a => a.id));
  const kept = mol.instanceArrays.filter(
    a =>
      a.seedAtomIds.some(id => atomSet.has(id)) ||
      a.dendrimer?.coreAtomIds.some(id => atomSet.has(id)),
  );
  if (kept.length === mol.instanceArrays.length) return mol;
  const next: Molecule = { ...mol };
  if (kept.length === 0) delete next.instanceArrays;
  else next.instanceArrays = kept;
  return next;
}

const remapAtomId = (mol: Molecule, id: string): string => {
  const p = parseInstanceAtomId(id);
  return p && isValidInstanceAtomId(mol, id) ? p.seedAtomId : id;
};

const remapBondId = (mol: Molecule, id: string): string => {
  const p = parseInstanceBondId(id);
  return p && isValidInstanceBondId(mol, id) ? p.seedBondId : id;
};

/** Map virtual `ia:` ids in a command payload onto the parent seed. */
export function remapInstanceIdsInCommandInput(mol: Molecule, input: unknown): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  if (!hasInstanceArrays(mol)) return input;
  const src = input as Record<string, unknown>;
  const next: Record<string, unknown> = { ...src };
  let changed = false;
  for (const key of ['atomId', 'fromAtomId', 'toAtomId']) {
    if (typeof next[key] === 'string') {
      const v = remapAtomId(mol, next[key] as string);
      if (v !== next[key]) {
        next[key] = v;
        changed = true;
      }
    }
  }
  for (const key of ['atomIds', 'selectedAtomIds', 'replaceAtomIds']) {
    if (Array.isArray(next[key])) {
      const v = [...new Set((next[key] as string[]).map(id => remapAtomId(mol, id)))];
      next[key] = v;
      changed = true;
    }
  }
  if (typeof next.bondId === 'string') {
    const v = remapBondId(mol, next.bondId);
    if (v !== next.bondId) {
      next.bondId = v;
      changed = true;
    }
  }
  for (const key of ['bondIds', 'selectedBondIds']) {
    if (Array.isArray(next[key])) {
      const v = [...new Set((next[key] as string[]).map(id => remapBondId(mol, id)))];
      next[key] = v;
      changed = true;
    }
  }
  return changed ? next : input;
}
