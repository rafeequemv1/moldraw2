import type { Bond, Molecule } from '@moldraw/domain';

const ELEMENT_TO_ATOMIC_NUM: Record<string, number> = {
  H: 1,
  B: 5,
  C: 6,
  N: 7,
  O: 8,
  F: 9,
  P: 15,
  S: 16,
  Cl: 17,
  Br: 35,
  I: 53,
};

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const bondDisplay = (bond: Bond): string => {
  if (bond.stereo === 'wedge') return ' Display="WedgeBegin"';
  if (bond.stereo === 'dash') return ' Display="WedgedHashBegin"';
  if (bond.stereo === 'wavy') return ' Display="Wavy"';
  return '';
};

/**
 * Best-effort ChemDraw XML export for the structural graph. Binary CDX is not
 * practical to generate in-browser, but ChemDraw can open CDXML directly.
 */
export function moleculeToCdxml(molecule: Molecule): string {
  const atomIds = new Set(molecule.atoms.map(atom => atom.id));
  const bonds = molecule.bonds.filter(
    bond => atomIds.has(bond.fromAtomId) && atomIds.has(bond.toAtomId),
  );
  const atomNodeIds = new Map<string, string>();
  molecule.atoms.forEach((atom, index) => atomNodeIds.set(atom.id, String(index + 1)));

  const atomLines = molecule.atoms.map(atom => {
    const nodeId = atomNodeIds.get(atom.id)!;
    const element = ELEMENT_TO_ATOMIC_NUM[atom.element] ?? 6;
    const attrs = [
      `id="${nodeId}"`,
      `p="${atom.x.toFixed(2)} ${(-atom.y).toFixed(2)}"`,
      `Element="${element}"`,
    ];
    if (atom.charge) attrs.push(`Charge="${atom.charge}"`);
    if (atom.isotope) attrs.push(`Isotope="${atom.isotope}"`);
    if (atom.alias?.trim()) attrs.push(`AtomLabel="${escapeXml(atom.alias.trim())}"`);
    return `      <n ${attrs.join(' ')} />`;
  });

  const bondLines = bonds.map((bond, index) => {
    const begin = atomNodeIds.get(bond.fromAtomId)!;
    const end = atomNodeIds.get(bond.toAtomId)!;
    const order = bond.aromatic ? '1.5' : String(Math.max(1, Math.min(3, bond.order)));
    return `      <b id="b${index + 1}" B="${begin}" E="${end}" Order="${order}"${bondDisplay(bond)} />`;
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<CDXML BondLength="30" LabelFont="3" CaptionFont="3">',
    '  <page id="1">',
    '    <fragment id="f1">',
    ...atomLines,
    ...bondLines,
    '    </fragment>',
    '  </page>',
    '</CDXML>',
    '',
  ].join('\n');
}
