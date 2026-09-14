import cof1Mol from './cof1MolRaw';
import { normalizeMolBondLines } from './normalizeMolBondLines';

/** COF-1 hexagonal pore — from CIF 05000N2(1), one 2D layer (V2000 molblock). */
export const COF1_HEX_PORE_MOLBLOCK = normalizeMolBondLines(cof1Mol);
