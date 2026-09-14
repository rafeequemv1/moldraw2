/**
 * Node-only file persist hook. Do not import from browser/canvas code.
 */
import { writeFileSync } from 'node:fs';
import type { Molecule } from '@moldraw/domain';

export function createJsonFilePersist(filePath: string): (molecule: Molecule) => void {
  return molecule => {
    writeFileSync(filePath, `${JSON.stringify(molecule, null, 2)}\n`, 'utf8');
  };
}
