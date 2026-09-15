import type { Atom, Bond, Molecule } from '@moldraw/domain';
import { CMD } from '@moldraw/core/commands/registry';
import { parseMolblock } from '@moldraw/core/io/molblock';
import { nativeSmilesTo2DMolblock } from '@moldraw/core/io/smilesToMolblock';
import { stripExplicitHydrogens, placeImportedMolecule } from '@moldraw/core/molecule/importPlacement';

type ApplyCommand = (commandId: string, input: unknown) => { ok: boolean };

const DUMMY_VIEWPORT = { x: 0, y: 0, zoom: 1 };

export function parseReactionSmilesParts(raw: string): {
  reactants: string[];
  agents: string[];
  products: string[];
} | null {
  const smiles = raw.trim();
  if (!smiles.includes('>')) return null;
  const parts = smiles.split('>');
  if (parts.length < 2) return null;

  const splitFrags = (chunk: string) =>
    chunk
      .split('.')
      .map(s => s.trim())
      .filter(Boolean);

  if (parts.length === 2) {
    return {
      reactants: splitFrags(parts[0] ?? ''),
      agents: [],
      products: splitFrags(parts[1] ?? ''),
    };
  }

  return {
    reactants: splitFrags(parts[0] ?? ''),
    agents: splitFrags(parts.slice(1, -1).join('.')),
    products: splitFrags(parts[parts.length - 1] ?? ''),
  };
}

/** Strip extra molfile fields so InsertDemoReaction's Zod atom/bond schemas pass. */
function commandAtom(a: Atom): Atom {
  const atom: Atom = {
    id: a.id,
    element: a.element,
    x: a.x,
    y: a.y,
    charge: Number.isFinite(a.charge) ? Math.trunc(a.charge) : 0,
  };
  if (a.alias) atom.alias = a.alias;
  if (a.lonePairs != null) atom.lonePairs = a.lonePairs;
  if (a.color) atom.color = a.color;
  if (a.isotope && a.isotope > 0) atom.isotope = a.isotope;
  if (a.labelFontSizePt != null) atom.labelFontSizePt = a.labelFontSizePt;
  return atom;
}

function commandBond(b: Bond): Bond {
  const rounded = Number.isFinite(b.order) ? Math.round(b.order) : 1;
  const bond: Bond = {
    id: b.id,
    fromAtomId: b.fromAtomId,
    toAtomId: b.toAtomId,
    order: Math.min(3, Math.max(1, rounded || 1)),
  };
  if (b.aromatic) bond.aromatic = true;
  if (b.stereo === 'wedge' || b.stereo === 'dash' || b.stereo === 'wavy') {
    bond.stereo = b.stereo;
  }
  if (b.dative) bond.dative = true;
  if (b.dotted) bond.dotted = true;
  if (b.color) bond.color = b.color;
  if (b.thicknessPx != null) bond.thicknessPx = b.thicknessPx;
  return bond;
}

function smilesToPlacedMol(smiles: string, bondLengthPx: number): Molecule | null {
  const molblock = nativeSmilesTo2DMolblock(smiles, bondLengthPx);
  if (!molblock?.trim()) return null;
  const parsed = stripExplicitHydrogens(parseMolblock(molblock));
  if (parsed.atoms.length === 0) return null;
  const placed = placeImportedMolecule({
    parsed,
    slot: { col: 0, row: 0 },
    viewport: DUMMY_VIEWPORT,
    windowWidth: 800,
    windowHeight: 600,
    mode: 'world_origin',
    bondLengthPx,
  });
  return {
    atoms: placed.atoms.map(commandAtom),
    bonds: placed.bonds.map(commandBond),
  };
}

function molBBox(atoms: Atom[]): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  midY: number;
} {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const a of atoms) {
    minX = Math.min(minX, a.x);
    maxX = Math.max(maxX, a.x);
    minY = Math.min(minY, a.y);
    maxY = Math.max(maxY, a.y);
  }
  return { minX, maxX, minY, maxY, midY: (minY + maxY) / 2 };
}

function translateMol(mol: Molecule, dx: number, dy: number): Molecule {
  return {
    atoms: mol.atoms.map(a => ({ ...a, x: a.x + dx, y: a.y + dy })),
    bonds: mol.bonds,
  };
}

function newAnnoId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Lay out a reaction SMILES (`A.B>>C` or `A>agent>C`) as separate compounds
 * plus a straight reaction arrow (and “+” labels between co-reactants / co-products).
 */
export function importReactionSchemeFromSmiles(opts: {
  smiles: string;
  applyCommand: ApplyCommand;
  bondLengthPx: number;
}): { ok: boolean; atomIds: string[]; arrowId: string | null } {
  const parts = parseReactionSmilesParts(opts.smiles);
  if (!parts) return { ok: false, atomIds: [], arrowId: null };

  const bondLen = Math.max(28, opts.bondLengthPx || 40);
  const plusGap = Math.max(36, bondLen * 0.95);
  const arrowGap = Math.max(44, bondLen * 1.15);
  const arrowLen = Math.max(88, bondLen * 2.4);

  const reactantMols = parts.reactants
    .map(s => smilesToPlacedMol(s, bondLen))
    .filter((m): m is Molecule => m != null);
  const productMols = parts.products
    .map(s => smilesToPlacedMol(s, bondLen))
    .filter((m): m is Molecule => m != null);

  if (reactantMols.length === 0 && productMols.length === 0) {
    return { ok: false, atomIds: [], arrowId: null };
  }

  type PlusMark = { x: number; y: number };
  const pluses: PlusMark[] = [];
  const placedReact: Molecule[] = [];
  const placedProd: Molecule[] = [];

  let cursorX = 0;
  let schemeMidY = 0;

  const placeGroup = (mols: Molecule[], into: Molecule[]) => {
    mols.forEach((mol, i) => {
      if (i > 0) {
        pluses.push({ x: cursorX + plusGap * 0.45, y: schemeMidY });
        cursorX += plusGap;
      }
      const box = molBBox(mol.atoms);
      const dx = cursorX - box.minX;
      const dy = schemeMidY - box.midY;
      const moved = translateMol(mol, dx, dy);
      into.push(moved);
      const next = molBBox(moved.atoms);
      cursorX = next.maxX;
    });
  };

  if (reactantMols.length > 0) {
    schemeMidY = molBBox(reactantMols[0]!.atoms).midY;
  } else if (productMols.length > 0) {
    schemeMidY = molBBox(productMols[0]!.atoms).midY;
  }

  placeGroup(reactantMols, placedReact);

  const arrowX1 = cursorX + arrowGap;
  const arrowX2 = arrowX1 + arrowLen;
  cursorX = arrowX2;

  if (productMols.length > 0) {
    cursorX += arrowGap;
    placeGroup(productMols, placedProd);
  }

  const reactAtoms: Atom[] = placedReact.flatMap(m => m.atoms);
  const reactBonds: Bond[] = placedReact.flatMap(m => m.bonds);
  const prodAtoms: Atom[] = placedProd.flatMap(m => m.atoms);
  const prodBonds: Bond[] = placedProd.flatMap(m => m.bonds);
  const allAtoms = [...reactAtoms, ...prodAtoms];
  if (allAtoms.length === 0) return { ok: false, atomIds: [], arrowId: null };

  const scheme = molBBox(allAtoms);
  const shiftX = -((scheme.minX + scheme.maxX) / 2);
  const shiftY = -scheme.midY;
  const shiftAtoms = (atoms: Atom[]) => atoms.map(a => ({ ...a, x: a.x + shiftX, y: a.y + shiftY }));
  const reactShifted = shiftAtoms(reactAtoms);
  const prodShifted = shiftAtoms(prodAtoms);
  const arrowY = schemeMidY + shiftY;
  const ax1 = arrowX1 + shiftX;
  const ax2 = arrowX2 + shiftX;
  const plusShifted = pluses.map(p => ({ x: p.x + shiftX, y: p.y + shiftY }));

  const agentText = parts.agents.join(', ');
  const arrowId = newAnnoId('rxn');
  const arrow = {
    id: arrowId,
    x1: ax1,
    y1: arrowY,
    x2: ax2,
    y2: arrowY,
    kind: 'straight' as const,
    reagentAbove: agentText || undefined,
    headScale: 1.25,
    strokeWidth: 2.2,
  };

  const atomIds = [...reactShifted, ...prodShifted].map(a => a.id);

  if (reactShifted.length > 0 && prodShifted.length > 0) {
    const result = opts.applyCommand(CMD.InsertDemoReaction, {
      reactAtoms: reactShifted,
      reactBonds,
      prodAtoms: prodShifted,
      prodBonds,
      arrow,
    });
    if (!result.ok) {
      const mergeR = opts.applyCommand(CMD.MergeImportedStructure, {
        atoms: reactShifted,
        bonds: reactBonds,
      });
      const mergeP = opts.applyCommand(CMD.MergeImportedStructure, {
        atoms: prodShifted,
        bonds: prodBonds,
      });
      if (!mergeR.ok && !mergeP.ok) return { ok: false, atomIds: [], arrowId: null };
      const arrowResult = opts.applyCommand(CMD.AddReactionArrow, { arrow });
      if (!arrowResult.ok) return { ok: false, atomIds, arrowId: null };
    }
  } else {
    const atoms = reactShifted.length > 0 ? reactShifted : prodShifted;
    const bonds = reactShifted.length > 0 ? reactBonds : prodBonds;
    const merge = opts.applyCommand(CMD.MergeImportedStructure, { atoms, bonds });
    if (!merge.ok) return { ok: false, atomIds: [], arrowId: null };
    const arrowResult = opts.applyCommand(CMD.AddReactionArrow, { arrow });
    if (!arrowResult.ok) return { ok: false, atomIds: atoms.map(a => a.id), arrowId: null };
  }

  for (const plus of plusShifted) {
    opts.applyCommand(CMD.AddCanvasText, {
      text: {
        id: newAnnoId('plus'),
        x: plus.x,
        y: plus.y,
        text: '+',
        fontSize: Math.max(18, bondLen * 0.55),
        color: '#0f172a',
        fontWeight: 'normal',
      },
    });
  }

  return {
    ok: true,
    atomIds: [...reactShifted, ...prodShifted].map(a => a.id),
    arrowId,
  };
}
