import type { SketchGraph } from '../recognize/types';

export interface MergeSketchPayload {
  atoms: { tempId: string; element: string; x: number; y: number; charge?: number; alias?: string }[];
  bonds: {
    fromTempId: string;
    toTempId: string;
    order: 1 | 2 | 3;
    stereo?: 'wedge' | 'dash' | 'wavy';
    aromatic?: boolean;
  }[];
  snap: { tempId: string; existingAtomId: string }[];
}

export function toMergeSketch(graph: SketchGraph): MergeSketchPayload {
  return {
    atoms: graph.atoms.map(a => ({
      tempId: a.tempId,
      element: a.element,
      x: a.x,
      y: a.y,
      ...(a.charge ? { charge: a.charge } : {}),
      ...(a.alias ? { alias: a.alias } : {}),
    })),
    bonds: graph.bonds.map(b => ({
      fromTempId: b.fromTempId,
      toTempId: b.toTempId,
      order: b.order,
      ...(b.stereo ? { stereo: b.stereo } : {}),
      ...(b.aromatic ? { aromatic: true } : {}),
    })),
    snap: graph.atoms
      .filter(a => a.snappedTo)
      .map(a => ({ tempId: a.tempId, existingAtomId: a.snappedTo! })),
  };
}
