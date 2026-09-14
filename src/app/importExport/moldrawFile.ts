import type { Molecule } from '@moldraw/domain';

export const MOLDRAW_FILE_VERSION = 1;

export type MoldrawFilePayload = {
  format: 'moldraw';
  version: typeof MOLDRAW_FILE_VERSION;
  name: string;
  savedAt: number;
  molecule: Molecule;
};

export function sanitizeDesignFilename(name: string): string {
  const trimmed = name.trim().replace(/[<>:"/\\|?*]+/g, '-').replace(/\s+/g, ' ');
  return trimmed.slice(0, 120) || 'design';
}

export function serializeMoldrawFile(name: string, molecule: Molecule): string {
  const payload: MoldrawFilePayload = {
    format: 'moldraw',
    version: MOLDRAW_FILE_VERSION,
    name: sanitizeDesignFilename(name),
    savedAt: Date.now(),
    molecule,
  };
  return JSON.stringify(payload, null, 2);
}

export function parseMoldrawFile(text: string): { name: string; molecule: Molecule } | null {
  try {
    const json = JSON.parse(text) as Partial<MoldrawFilePayload>;
    if (json.format !== 'moldraw' || !json.molecule) return null;
    const molecule = json.molecule;
    if (!Array.isArray(molecule.atoms) || !Array.isArray(molecule.bonds)) return null;
    return {
      name: sanitizeDesignFilename(String(json.name ?? 'Imported design')),
      molecule,
    };
  } catch {
    return null;
  }
}

/** True when molfile export would drop canvas extras (arrows, lone pairs, text, …). */
export function moleculeLosesDetailInMolfile(mol: Molecule): boolean {
  if ((mol.reactionArrows?.length ?? 0) > 0) return true;
  if ((mol.strokes?.length ?? 0) > 0) return true;
  if ((mol.canvasTexts?.length ?? 0) > 0) return true;
  if ((mol.canvasShapes?.length ?? 0) > 0) return true;
  if ((mol.canvasImages?.length ?? 0) > 0) return true;
  if ((mol.orbitals?.length ?? 0) > 0) return true;
  if ((mol.sruBrackets?.length ?? 0) > 0) return true;
  if ((mol.instanceArrays?.length ?? 0) > 0) return true;
  if ((mol.cofLattices?.length ?? 0) > 0) return true;
  if (mol.perspective3D) return true;
  if (mol.ringFills && Object.keys(mol.ringFills).length > 0) return true;
  if (
    mol.objectOutline &&
    (mol.objectOutline.collections.length > 0 || mol.objectOutline.order.length > 0)
  ) {
    return true;
  }
  return mol.atoms.some(
    a =>
      (a.lonePairs ?? 0) > 0 ||
      a.lonePairSide != null ||
      (a.radical ?? 0) > 0 ||
      a.deltaCharge != null ||
      Boolean(a.highlight) ||
      Boolean(a.alias?.trim()) ||
      a.showElementLabel === true ||
      a.chargeMarkStyle === 'circled',
  );
}
