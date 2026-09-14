import { buildCanvasStateSnapshot } from '@moldraw/core';
import { getStructureInputSchema } from '../../schemas/tools';
import type { RegisteredAiTool } from '../types';
import { toolFail, toolOk } from '../types';

export const getStructureTool: RegisteredAiTool = {
  id: 'molecule.get_structure',
  category: 'read',
  description:
    'Return live atom and bond records with Moldraw ids (required before coloring, deleting, or editing atoms). Optional moleculeIndex scopes to one connected molecule from get_canvas_state.',
  inputSchema: getStructureInputSchema,
  handler: (input, ctx) => {
    const { maxAtoms = 500, moleculeIndex } = (input ?? {}) as {
      maxAtoms?: number;
      moleculeIndex?: number;
    };
    const mol = ctx.getMolecule();
    let atomIdsFilter: Set<string> | null = null;
    if (moleculeIndex != null) {
      const snap = buildCanvasStateSnapshot(mol, {
        includeCoords: false,
        includeSmiles: false,
        includeAnnotations: false,
      });
      const frag = snap.molecules[moleculeIndex];
      if (!frag) {
        return toolFail(
          'EXECUTION',
          `No molecule at index ${moleculeIndex} (count=${snap.molecules.length}).`,
        );
      }
      atomIdsFilter = new Set(frag.atomIds);
    }

    const sourceAtoms = atomIdsFilter
      ? mol.atoms.filter(a => atomIdsFilter!.has(a.id))
      : mol.atoms;
    const truncated = sourceAtoms.length > maxAtoms;
    const atoms = (truncated ? sourceAtoms.slice(0, maxAtoms) : sourceAtoms).map(a => ({
      id: a.id,
      element: a.element,
      x: Math.round(a.x * 10) / 10,
      y: Math.round(a.y * 10) / 10,
      charge: a.charge ?? 0,
      alias: a.alias ?? null,
      lonePairs: a.lonePairs ?? 0,
      color: a.color ?? null,
    }));
    const atomIdSet = new Set(atoms.map(a => a.id));
    const bonds = mol.bonds
      .filter(b => atomIdSet.has(b.fromAtomId) && atomIdSet.has(b.toAtomId))
      .map(b => ({
        id: b.id,
        fromAtomId: b.fromAtomId,
        toAtomId: b.toAtomId,
        order: b.order,
        stereo: b.stereo ?? null,
        dative: b.dative ?? false,
        color: b.color ?? null,
      }));
    return toolOk({
      moleculeIndex: moleculeIndex ?? null,
      atomCount: sourceAtoms.length,
      bondCount: bonds.length,
      truncated,
      atoms,
      bonds,
    });
  },
};
