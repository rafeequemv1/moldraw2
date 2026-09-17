import type { Atom, Bond, Molecule } from '@moldraw/domain';
import { buildV2000Molblock, type MolblockAtomRow, type MolblockBondRow } from './buildV2000Molblock';

const ATOMIC_NUM_TO_SYM: Record<number, string> = {
  1: 'H',
  5: 'B',
  6: 'C',
  7: 'N',
  8: 'O',
  9: 'F',
  15: 'P',
  16: 'S',
  17: 'Cl',
  35: 'Br',
  53: 'I',
};

/** Typical ChemDraw default bond length in page units (points). */
const DEFAULT_CD_BOND_LENGTH = 14.4;
/** Å per ChemDraw bond when writing V2000 (canvas uses Å×40 ≈ 60 px). */
const TARGET_BOND_ANGSTROM = 1.5;

const newId = () => Math.random().toString(36).slice(2, 9);

const readBondLengthPageUnits = (doc: Document): number => {
  const root = doc.documentElement;
  const fromRoot = parseFloat(root.getAttribute('BondLength') ?? '');
  if (Number.isFinite(fromRoot) && fromRoot > 0.5) return fromRoot;
  const page = doc.getElementsByTagName('page')[0];
  const fromPage = parseFloat(page?.getAttribute('BondLength') ?? '');
  if (Number.isFinite(fromPage) && fromPage > 0.5) return fromPage;
  return DEFAULT_CD_BOND_LENGTH;
};

type ParsedCdxml = {
  nodes: Array<{ element: string; x: number; y: number; charge?: number; isotope?: number }>;
  bonds: Array<{
    from: number;
    to: number;
    order: number;
    aromatic?: boolean;
    stereo?: 'wedge' | 'dash' | 'wavy';
  }>;
  bondLengthPage: number;
};

const parseCdxmlGraph = (xml: string): ParsedCdxml | null => {
  if (typeof DOMParser === 'undefined') return null;
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  // Browser DOMParser exposes parsererror; xmldom may not have querySelector.
  const errEls =
    typeof doc.getElementsByTagName === 'function'
      ? doc.getElementsByTagName('parsererror')
      : null;
  if (errEls && errEls.length > 0) return null;

  const nodes: ParsedCdxml['nodes'] = [];
  const idToIndex = new Map<string, number>();

  const nodeEls = doc.getElementsByTagName('n');
  for (let i = 0; i < nodeEls.length; i++) {
    const el = nodeEls[i]!;
    const id = el.getAttribute('id') ?? el.getAttribute('ID');
    if (!id) continue;
    const p = el.getAttribute('p') ?? el.getAttribute('P');
    if (!p) continue;
    const parts = p.trim().split(/\s+/).map(Number);
    if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) continue;

    let element = 'C';
    const elNum = parseInt(el.getAttribute('Element') ?? el.getAttribute('element') ?? '6', 10);
    if (Number.isFinite(elNum) && ATOMIC_NUM_TO_SYM[elNum]) {
      element = ATOMIC_NUM_TO_SYM[elNum]!;
    } else {
      const sym =
        el.getAttribute('Symbol') ??
        el.getAttribute('symbol') ??
        el.getAttribute('ElementSymbol');
      if (sym?.trim()) element = sym.trim();
    }

    idToIndex.set(id, nodes.length);
    const chargeRaw = parseInt(el.getAttribute('Charge') ?? el.getAttribute('charge') ?? '0', 10);
    const isotopeRaw = parseInt(el.getAttribute('Isotope') ?? el.getAttribute('isotope') ?? '0', 10);
    nodes.push({
      element,
      x: parts[0]!,
      y: parts[1]!,
      ...(Number.isFinite(chargeRaw) && chargeRaw !== 0 ? { charge: chargeRaw } : {}),
      ...(Number.isFinite(isotopeRaw) && isotopeRaw > 0 ? { isotope: isotopeRaw } : {}),
    });
  }

  if (nodes.length === 0) return null;

  const bonds: ParsedCdxml['bonds'] = [];
  const bondEls = doc.getElementsByTagName('b');
  for (let i = 0; i < bondEls.length; i++) {
    const el = bondEls[i]!;
    const b = el.getAttribute('B') ?? el.getAttribute('b');
    const e = el.getAttribute('E') ?? el.getAttribute('e');
    if (!b || !e) continue;
    const from = idToIndex.get(b);
    const to = idToIndex.get(e);
    if (from === undefined || to === undefined) continue;

    let order = parseInt(el.getAttribute('Order') ?? el.getAttribute('order') ?? '1', 10);
    if (!Number.isFinite(order) || order < 1) order = 1;
    if (order > 3) order = 3;
    const orderAttr = el.getAttribute('Order') ?? el.getAttribute('order') ?? '';
    const aromatic = orderAttr === '1.5' || orderAttr === '1,5';

    let stereo: 'wedge' | 'dash' | 'wavy' | undefined;
    const display = (el.getAttribute('Display') ?? el.getAttribute('display') ?? '').toLowerCase();
    // Check hash/dash before wedge: "WedgedHashBegin" contains both.
    if (display.includes('hash') || display.includes('dash')) stereo = 'dash';
    else if (display.includes('wedge')) stereo = 'wedge';
    else if (display.includes('wavy') || display.includes('either')) stereo = 'wavy';
    const reverseStereo = /end$/i.test(display) || display.includes('wedgeend') || display.includes('hashend');

    bonds.push({
      from: reverseStereo ? to : from,
      to: reverseStereo ? from : to,
      order: aromatic ? 1 : order,
      ...(aromatic ? { aromatic: true } : {}),
      ...(stereo ? { stereo } : {}),
    });
  }

  return { nodes, bonds, bondLengthPage: readBondLengthPageUnits(doc) };
};

export interface CdxmlToMoleculeOptions {
  /** Target average bond length in canvas px (from app settings). */
  bondLengthPx?: number;
}

/**
 * ChemDraw CDXML → native Molecule with accurate page coordinates.
 * Scales by document `BondLength` → `bondLengthPx` (not page bounding-box span).
 * Supports multi-fragment cover-art pages and >999 atoms.
 */
export function cdxmlToMolecule(
  xml: string,
  options: CdxmlToMoleculeOptions = {},
): Molecule | null {
  const parsed = parseCdxmlGraph(xml);
  if (!parsed) return null;

  const bondLengthPx = options.bondLengthPx && options.bondLengthPx > 0 ? options.bondLengthPx : 45;
  const pageToPx = bondLengthPx / parsed.bondLengthPage;

  const xs = parsed.nodes.map(n => n.x);
  const ys = parsed.nodes.map(n => n.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;

  const atoms: Atom[] = parsed.nodes.map(n => ({
    id: newId(),
    element: n.element,
    x: (n.x - cx) * pageToPx,
    y: -(n.y - cy) * pageToPx,
    charge: n.charge ?? 0,
    ...(n.isotope ? { isotope: n.isotope } : {}),
  }));

  const bonds: Bond[] = parsed.bonds.map(b => ({
    id: newId(),
    fromAtomId: atoms[b.from]!.id,
    toAtomId: atoms[b.to]!.id,
    order: b.order,
    ...(b.aromatic ? { aromatic: true as const } : {}),
    ...(b.stereo ? { stereo: b.stereo } : {}),
  }));

  return { atoms, bonds };
}

/**
 * ChemDraw CDXML → V2000 molblock (Å). Returns null if >999 atoms/bonds
 * (use {@link cdxmlToMolecule} instead).
 */
export function cdxmlToMolblock(xml: string): string | null {
  const parsed = parseCdxmlGraph(xml);
  if (!parsed) return null;
  if (parsed.nodes.length > 999 || parsed.bonds.length > 999) return null;

  const pageToAngstrom = TARGET_BOND_ANGSTROM / parsed.bondLengthPage;
  const xs = parsed.nodes.map(n => n.x);
  const ys = parsed.nodes.map(n => n.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;

  const atoms: MolblockAtomRow[] = parsed.nodes.map(n => ({
    element: n.element,
    x: (n.x - cx) * pageToAngstrom,
    y: -(n.y - cy) * pageToAngstrom,
    charge: n.charge,
    isotope: n.isotope,
  }));

  const bonds: MolblockBondRow[] = parsed.bonds.map(b => ({
    from: b.from,
    to: b.to,
    order: b.order,
    stereo: b.stereo,
    aromatic: b.aromatic,
  }));

  return buildV2000Molblock(atoms, bonds);
}
