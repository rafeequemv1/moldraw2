import type { Atom, InstanceArraySite, Molecule } from '@moldraw/domain';
import { ringsFullyInSelection, uniqueRingPaths } from '@moldraw/domain';
import {
  upsertDendrimerInstanceArray,
  virtualAtomIdsForArray,
} from '../molecule/instanceArrays';

export const DENDRIMER_FOLDS_MIN = 3;
export const DENDRIMER_FOLDS_MAX = 12;

export type DendrimerArrayOptions = {
  foldCount: number;
  coreAtomIds?: string[];
  /** Explicit 1,3,5-style attachment carbons. Inferred evenly around the core when omitted. */
  attachmentAtomIds?: string[];
};

const clampFolds = (n: number) =>
  Math.max(DENDRIMER_FOLDS_MIN, Math.min(DENDRIMER_FOLDS_MAX, Math.round(n)));

const centroidOf = (
  mol: Molecule,
  atomIds: string[],
): { cx: number; cy: number } | null => {
  const set = new Set(atomIds);
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const a of mol.atoms) {
    if (!set.has(a.id)) continue;
    sx += a.x;
    sy += a.y;
    n += 1;
  }
  if (n === 0) return null;
  return { cx: sx / n, cy: sy / n };
};

const atomIndexOf = (mol: Molecule): Map<string, Atom> => {
  const m = new Map<string, Atom>();
  for (const a of mol.atoms) m.set(a.id, a);
  return m;
};

const angleOf = (atomById: Map<string, Atom>, atomId: string, cx: number, cy: number): number => {
  const a = atomById.get(atomId);
  if (!a) return 0;
  return Math.atan2(a.y - cy, a.x - cx);
};

const sortByAngle = (
  atomById: Map<string, Atom>,
  atomIds: string[],
  cx: number,
  cy: number,
): string[] => {
  const ang = new Map<string, number>();
  for (const id of atomIds) ang.set(id, angleOf(atomById, id, cx, cy));
  return [...atomIds].sort((a, b) => ang.get(a)! - ang.get(b)!);
};

const pickEvenly = (ids: string[], count: number): string[] => {
  if (ids.length === 0 || count <= 0) return [];
  if (ids.length <= count) return [...ids];
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(ids[Math.round((i * (ids.length - 1)) / Math.max(1, count - 1))]!);
  }
  return [...new Set(out)];
};

const inferCoreAtomIds = (
  mol: Molecule,
  atomById: Map<string, Atom>,
  atomIds: string[],
  explicit?: string[],
): string[] => {
  if (explicit && explicit.length >= 3) {
    return explicit.filter(id => atomById.has(id));
  }
  const inSel = ringsFullyInSelection(mol, atomIds);
  if (inSel.length > 0) {
    return [...inSel].sort((a, b) => a.length - b.length)[0]!;
  }
  const sel = new Set(atomIds);
  const touching = uniqueRingPaths(mol).filter(r => r.some(id => sel.has(id)));
  if (touching.length > 0) {
    return [...touching].sort((a, b) => a.length - b.length)[0]!;
  }
  return [...atomIds];
};

export const suggestDendrimerFolds = (mol: Molecule, atomIds: string[]): number => {
  const core = inferCoreAtomIds(mol, atomIndexOf(mol), atomIds);
  if (core.length >= DENDRIMER_FOLDS_MIN && core.length <= DENDRIMER_FOLDS_MAX) {
    return core.length;
  }
  return 6;
};

/**
 * Shared-core radial array: core stays once; the parent branch (selection minus
 * core) is instanced around the core. Empty branch is allowed so the user can
 * draw one arm after the guides appear.
 */
export const dendrimerArrayAtoms = (
  mol: Molecule,
  atomIds: string[],
  options: DendrimerArrayOptions,
): { molecule: Molecule; newAtomIds: string[]; allAtomIds: string[] } => {
  const foldCount = clampFolds(options.foldCount);
  const atomById = atomIndexOf(mol);
  const existing = mol.instanceArrays?.find(a => a.dendrimer);
  const lockedCore = existing?.dendrimer?.coreAtomIds?.filter(id => atomById.has(id));
  const coreAtomIds =
    lockedCore && lockedCore.length >= 3
      ? lockedCore
      : inferCoreAtomIds(mol, atomById, atomIds, options.coreAtomIds);
  if (coreAtomIds.length === 0) {
    return { molecule: mol, newAtomIds: [], allAtomIds: [...atomIds] };
  }
  const sc = centroidOf(mol, coreAtomIds);
  if (!sc) {
    return { molecule: mol, newAtomIds: [], allAtomIds: [...atomIds] };
  }

  const coreSet = new Set(coreAtomIds);
  const branchIds = atomIds.filter(id => !coreSet.has(id) && atomById.has(id));
  const branchSet = new Set(branchIds);

  const sortedCore = sortByAngle(atomById, coreAtomIds, sc.cx, sc.cy);
  const explicitAtt = (options.attachmentAtomIds ?? []).filter(
    id => coreSet.has(id) && atomById.has(id),
  );
  let attachments =
    explicitAtt.length >= 2
      ? sortByAngle(atomById, explicitAtt, sc.cx, sc.cy)
      : pickEvenly(sortedCore, foldCount);
  if (attachments.length === 0) attachments = [...sortedCore];

  // Attachment carbons that already carry a drawn branch (one bond pass).
  const attachmentSet = new Set(attachments);
  const attachedToBranch = new Set<string>();
  if (branchSet.size > 0) {
    for (const b of mol.bonds) {
      if (attachmentSet.has(b.fromAtomId) && branchSet.has(b.toAtomId)) {
        attachedToBranch.add(b.fromAtomId);
      } else if (attachmentSet.has(b.toAtomId) && branchSet.has(b.fromAtomId)) {
        attachedToBranch.add(b.toAtomId);
      }
    }
  }
  let seedAttachment = attachments.find(id => attachedToBranch.has(id)) ?? attachments[0]!;

  const attIdx = attachments.indexOf(seedAttachment);
  if (attIdx > 0) {
    attachments = [...attachments.slice(attIdx), ...attachments.slice(0, attIdx)];
    seedAttachment = attachments[0]!;
  }

  const step = (Math.PI * 2) / foldCount;
  const sites: InstanceArraySite[] = [];
  for (let i = 1; i < foldCount; i++) {
    sites.push({ dx: 0, dy: 0, rot: step * i });
  }

  const dendrimer = {
    foldCount,
    cx: sc.cx,
    cy: sc.cy,
    coreAtomIds,
    attachmentAtomIds: attachments,
    seedAttachmentAtomId: seedAttachment,
  };

  const attached = upsertDendrimerInstanceArray(mol, branchIds, sites, dendrimer);
  const parentIds = [
    ...coreAtomIds,
    ...attached.instanceArray.seedAtomIds.filter(id => !coreSet.has(id)),
  ];
  return {
    molecule: attached.molecule,
    newAtomIds: virtualAtomIdsForArray(attached.instanceArray),
    allAtomIds: parentIds,
  };
};
