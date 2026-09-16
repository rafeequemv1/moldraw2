import type { Atom, Bond, Molecule } from '@moldraw/domain';

function atom(id: string, element: string, x: number, y: number, extra?: Partial<Atom>): Atom {
  return { id, element, x, y, charge: 0, ...extra };
}

function bond(
  id: string,
  fromAtomId: string,
  toAtomId: string,
  order: number = 1,
  extra?: Partial<Bond>,
): Bond {
  return { id, fromAtomId, toAtomId, order, ...extra };
}

const COS60 = 0.5;
const SIN60 = Math.sqrt(3) / 2;
const COS30 = Math.sqrt(3) / 2;
const SIN30 = 0.5;

/** Ethanol CH₃CH₂OH — implicit-H stubs and grid illustrations. */
export function createEthanolMolecule(): Molecule {
  const L = 42;
  return {
    atoms: [
      atom('et_c1', 'C', 0, 0),
      atom('et_c2', 'C', L, 0),
      atom('et_o', 'O', L + L * COS60, L * SIN60),
    ],
    bonds: [bond('et_b12', 'et_c1', 'et_c2'), bond('et_b2o', 'et_c2', 'et_o')],
  };
}

/**
 * Ethanolamine HO–CH₂–CH₂–NH₂ — heteroatom color (N blue, O red)
 * and bold-label comparisons.
 */
export function createEthanolamineMolecule(): Molecule {
  const L = 40;
  const c1x = L;
  const c2x = L + L * COS60;
  const c2y = L * SIN60;
  return {
    atoms: [
      atom('ea_o', 'O', 0, 0),
      atom('ea_c1', 'C', c1x, 0),
      atom('ea_c2', 'C', c2x, c2y),
      atom('ea_n', 'N', c2x + L, c2y),
    ],
    bonds: [
      bond('ea_oc', 'ea_o', 'ea_c1'),
      bond('ea_cc', 'ea_c1', 'ea_c2'),
      bond('ea_cn', 'ea_c2', 'ea_n'),
    ],
  };
}

/** Acetic acid — condensed CH₃ / OH vs skeletal carboxyl. */
export function createAceticAcidMolecule(): Molecule {
  const L = 40;
  return {
    atoms: [
      atom('aa_me', 'C', -L, 0),
      atom('aa_c', 'C', 0, 0),
      atom('aa_o', 'O', L * COS60, -L * SIN60),
      atom('aa_oh', 'O', L * COS60, L * SIN60),
    ],
    bonds: [
      bond('aa_cc', 'aa_me', 'aa_c'),
      bond('aa_co', 'aa_c', 'aa_o', 2),
      bond('aa_coh', 'aa_c', 'aa_oh'),
    ],
  };
}

/**
 * (R)-looking 2-butanol — chiral C with wedge methyl, dash OH, and ethyl chain.
 * Implicit H is the fourth substituent (valid C₄H₁₀O).
 */
export function createChiralMolecule(): Molecule {
  const L = 38;
  const ch2x = -L * COS30;
  const ch2y = L * SIN30;
  return {
    atoms: [
      atom('ch_c', 'C', 0, 0),
      atom('ch_me', 'C', 0, -L),
      atom('ch_ch2', 'C', ch2x, ch2y),
      atom('ch_et', 'C', ch2x - L * COS30, ch2y - L * SIN30),
      atom('ch_o', 'O', L * COS30, L * SIN30),
    ],
    bonds: [
      bond('ch_wedge', 'ch_c', 'ch_me', 1, { stereo: 'wedge' }),
      bond('ch_c_ch2', 'ch_c', 'ch_ch2'),
      bond('ch_ethyl', 'ch_ch2', 'ch_et'),
      bond('ch_dash', 'ch_c', 'ch_o', 1, { stereo: 'dash' }),
    ],
  };
}

export const CHIRAL_CIP_ATOM_ID = 'ch_c';

/** Acetone — trigonal C=O for double-bond spacing. */
export function createAcetoneMolecule(): Molecule {
  const L = 40;
  return {
    atoms: [
      atom('ac_c0', 'C', 0, 0),
      atom('ac_o', 'O', 0, -L),
      atom('ac_c1', 'C', -L * COS30, L * SIN30),
      atom('ac_c2', 'C', L * COS30, L * SIN30),
    ],
    bonds: [
      bond('ac_co', 'ac_c0', 'ac_o', 2),
      bond('ac_c1', 'ac_c0', 'ac_c1'),
      bond('ac_c2', 'ac_c0', 'ac_c2'),
    ],
  };
}

/**
 * Butane zigzag whose chain tilt equals the bond-angle snap increment.
 * 30° tilt → 120° ACS bond angles; 15° tilt → 150° RSC-style angles.
 */
export function createAngleSnapMolecule(deg: number, bondLen: number): Molecule {
  const L = Number.isFinite(bondLen) && bondLen > 0 ? bondLen : 42;
  const tilt = (Math.max(5, Math.min(45, deg)) * Math.PI) / 180;
  const atoms: Atom[] = [];
  const bonds: Bond[] = [];
  let x = 0;
  let y = 0;
  atoms.push(atom('as_c0', 'C', x, y));
  for (let i = 1; i < 4; i++) {
    const a = i % 2 === 1 ? tilt : -tilt;
    x += L * Math.cos(a);
    y += L * Math.sin(a);
    atoms.push(atom(`as_c${i}`, 'C', x, y));
    bonds.push(bond(`as_b${i - 1}${i}`, `as_c${i - 1}`, `as_c${i}`));
  }
  return { atoms, bonds };
}
