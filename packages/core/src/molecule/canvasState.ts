/**
 * Agent-facing canvas snapshot: disconnected molecules with SMILES, coords, boxes.
 */
import type { Molecule } from '@moldraw/domain';
import { moleculeToSmiles } from '@moldraw/engine';
import { documentFragmentBoxes } from '../align/selectionArrange';
import { getMolecularData } from './properties';
import { reactionSmilesSplit, subsetMoleculeByAtomIds } from './partition';

export type CanvasMoleculeRole = 'reactant' | 'product' | 'other';

export interface CanvasStateAtom {
  id: string;
  element: string;
  x: number;
  y: number;
  charge: number;
  alias: string | null;
  color: string | null;
}

export interface CanvasStateMolecule {
  index: number;
  atomIds: string[];
  bondIds: string[];
  atomCount: number;
  bondCount: number;
  smiles?: string;
  bbox: { minX: number; minY: number; maxX: number; maxY: number; cx: number; cy: number };
  role?: CanvasMoleculeRole;
  atoms?: CanvasStateAtom[];
}

export interface CanvasStateAnnotations {
  reactionArrows: Array<{
    id: string;
    kind: string | null;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    cx: number | null;
    cy: number | null;
    fromAnchor: unknown;
    toAnchor: unknown;
    headStyle: string | null;
    curveAmount: number | null;
    reagentAbove: string | null;
    reagentBelow: string | null;
  }>;
  canvasTexts: Array<{ id: string; text: string; x: number; y: number }>;
  strokes: Array<{ id: string; pointCount: number }>;
  canvasShapes: Array<{
    id: string;
    kind: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }>;
  canvasImages: Array<{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotationRad: number;
  }>;
}

export interface CanvasStateSnapshot {
  summary: {
    moleculeCount: number;
    atomCount: number;
    bondCount: number;
    annotationCounts: {
      arrows: number;
      texts: number;
      strokes: number;
      shapes: number;
      images: number;
    };
    empiricalFormula: string;
    molecularWeight: number;
    documentSmiles?: string;
    reactionSmiles?: string | null;
  };
  molecules: CanvasStateMolecule[];
  annotations?: CanvasStateAnnotations;
}

export interface BuildCanvasStateOptions {
  includeCoords?: boolean;
  includeSmiles?: boolean;
  includeAnnotations?: boolean;
  maxAtomsPerMolecule?: number;
}

const formatEmpirical = (order: string[], counts: Record<string, number>): string =>
  order.map(el => `${el}${counts[el] > 1 ? counts[el] : ''}`).join('');

const round1 = (n: number): number => Math.round(n * 10) / 10;

function safeSmiles(mol: Molecule): string | undefined {
  try {
    if (mol.atoms.length === 0) return undefined;
    return moleculeToSmiles(mol);
  } catch {
    return undefined;
  }
}

/**
 * Build a left-to-right (then top-to-bottom) ordered multi-molecule canvas snapshot.
 */
export function buildCanvasStateSnapshot(
  mol: Molecule,
  opts: BuildCanvasStateOptions = {},
): CanvasStateSnapshot {
  const includeCoords = opts.includeCoords !== false;
  const includeSmiles = opts.includeSmiles !== false;
  const includeAnnotations = opts.includeAnnotations !== false;
  const maxAtomsPerMolecule = opts.maxAtomsPerMolecule;

  const boxes = documentFragmentBoxes(mol).slice().sort((a, b) => a.cx - b.cx || a.cy - b.cy);

  let reactantIds: Set<string> | null = null;
  let productIds: Set<string> | null = null;
  let reactionSmiles: string | null = null;
  const split = reactionSmilesSplit(mol);
  if (split) {
    reactantIds = new Set(split.reactMol.atoms.map(a => a.id));
    productIds = new Set(split.prodMol.atoms.map(a => a.id));
    const r = safeSmiles(split.reactMol);
    const p = safeSmiles(split.prodMol);
    if (r && p) reactionSmiles = `${r}>>${p}`;
  }

  const atomById = new Map(mol.atoms.map(a => [a.id, a]));
  const molecules: CanvasStateMolecule[] = boxes.map((box, index) => {
    const atomIdSet = new Set(box.atomIds);
    const bondIds = mol.bonds
      .filter(b => atomIdSet.has(b.fromAtomId) && atomIdSet.has(b.toAtomId))
      .map(b => b.id);

    let role: CanvasMoleculeRole | undefined;
    if (reactantIds && productIds) {
      const inReact = box.atomIds.some(id => reactantIds!.has(id));
      const inProd = box.atomIds.some(id => productIds!.has(id));
      if (inReact && !inProd) role = 'reactant';
      else if (inProd && !inReact) role = 'product';
      else role = 'other';
    }

    const entry: CanvasStateMolecule = {
      index,
      atomIds: box.atomIds,
      bondIds,
      atomCount: box.atomIds.length,
      bondCount: bondIds.length,
      bbox: {
        minX: round1(box.minX),
        minY: round1(box.minY),
        maxX: round1(box.maxX),
        maxY: round1(box.maxY),
        cx: round1(box.cx),
        cy: round1(box.cy),
      },
      role,
    };

    if (includeSmiles) {
      const sub = subsetMoleculeByAtomIds(mol, atomIdSet);
      entry.smiles = safeSmiles(sub);
    }

    if (includeCoords) {
      const ids =
        maxAtomsPerMolecule != null && box.atomIds.length > maxAtomsPerMolecule
          ? box.atomIds.slice(0, maxAtomsPerMolecule)
          : box.atomIds;
      entry.atoms = ids.map(id => {
        const a = atomById.get(id)!;
        return {
          id: a.id,
          element: a.element,
          x: round1(a.x),
          y: round1(a.y),
          charge: a.charge ?? 0,
          alias: a.alias ?? null,
          color: a.color ?? null,
        };
      });
    }

    return entry;
  });

  const { empirical, mw } = getMolecularData(mol);
  const documentSmiles = includeSmiles ? safeSmiles(mol) : undefined;

  const snapshot: CanvasStateSnapshot = {
    summary: {
      moleculeCount: molecules.length,
      atomCount: mol.atoms.length,
      bondCount: mol.bonds.length,
      annotationCounts: {
        arrows: mol.reactionArrows?.length ?? 0,
        texts: mol.canvasTexts?.length ?? 0,
        strokes: mol.strokes?.length ?? 0,
        shapes: mol.canvasShapes?.length ?? 0,
        images: mol.canvasImages?.length ?? 0,
      },
      empiricalFormula: formatEmpirical(empirical.order, empirical.counts),
      molecularWeight: Math.round(mw * 100) / 100,
      documentSmiles,
      reactionSmiles,
    },
    molecules,
  };

  if (includeAnnotations) {
    snapshot.annotations = {
      reactionArrows: (mol.reactionArrows ?? []).map(a => ({
        id: a.id,
        kind: a.kind ?? null,
        x1: round1(a.x1),
        y1: round1(a.y1),
        x2: round1(a.x2),
        y2: round1(a.y2),
        cx: a.cx != null ? round1(a.cx) : null,
        cy: a.cy != null ? round1(a.cy) : null,
        fromAnchor: a.fromAnchor ?? null,
        toAnchor: a.toAnchor ?? null,
        headStyle: a.headStyle ?? null,
        curveAmount: a.curveAmount ?? null,
        reagentAbove: a.reagentAbove ?? null,
        reagentBelow: a.reagentBelow ?? null,
      })),
      canvasTexts: (mol.canvasTexts ?? []).map(t => ({
        id: t.id,
        text: t.text,
        x: round1(t.x),
        y: round1(t.y),
      })),
      strokes: (mol.strokes ?? []).map(s => ({
        id: s.id,
        pointCount: s.points?.length ?? 0,
      })),
      canvasShapes: (mol.canvasShapes ?? []).map(s => ({
        id: s.id,
        kind: s.kind,
        x1: round1(s.x1),
        y1: round1(s.y1),
        x2: round1(s.x2),
        y2: round1(s.y2),
      })),
      canvasImages: (mol.canvasImages ?? []).map(img => ({
        id: img.id,
        x: round1(img.x),
        y: round1(img.y),
        width: img.width,
        height: img.height,
        rotationRad: img.rotationRad ?? 0,
      })),
    };
  }

  return snapshot;
}

/** Connected-component count (cheap). */
export function countDocumentMolecules(mol: Molecule): number {
  return documentFragmentBoxes(mol).length;
}
