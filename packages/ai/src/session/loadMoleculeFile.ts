import { existsSync, readFileSync } from 'node:fs';
import type { Molecule } from '@moldraw/domain';
import { emptyMolecule } from './createMoldrawSession';

export function loadMoleculeFromPath(filePath: string | undefined): Molecule {
  if (!filePath || !existsSync(filePath)) return emptyMolecule();
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as Molecule;
  } catch {
    return emptyMolecule();
  }
}
