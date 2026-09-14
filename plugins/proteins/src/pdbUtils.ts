import { AA3_TO_1, type ProteinChain, type ProteinResidue } from './types';

const RCSB_PDB_URL = (id: string) =>
  `https://files.rcsb.org/download/${id.toUpperCase()}.pdb`;

/** Fetch PDB text from RCSB by 4-char ID. */
export async function fetchPdbById(pdbId: string): Promise<string> {
  const id = pdbId.trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(id)) {
    throw new Error('PDB ID must be 4 alphanumeric characters (e.g. 1CRN).');
  }
  const res = await fetch(RCSB_PDB_URL(id));
  if (!res.ok) {
    throw new Error(`Could not fetch PDB ${id} (${res.status}).`);
  }
  const text = await res.text();
  if (!text.includes('ATOM') && !text.includes('HETATM')) {
    throw new Error(`PDB ${id} does not contain structure records.`);
  }
  return text;
}

/** Read a local PDB file. */
export async function readPdbFile(file: File): Promise<string> {
  const text = await file.text();
  if (!text.includes('ATOM') && !text.includes('HETATM')) {
    throw new Error('File does not look like a PDB structure.');
  }
  return text;
}

/** Extract title from HEADER or TITLE records. */
export function extractPdbTitle(pdbText: string): string | undefined {
  for (const line of pdbText.split('\n')) {
    if (line.startsWith('HEADER')) {
      const title = line.slice(10, 50).trim();
      if (title) return title;
    }
    if (line.startsWith('TITLE')) {
      const title = line.slice(10).trim();
      if (title) return title;
    }
  }
  return undefined;
}

/**
 * Parse protein chains and residues from ATOM records (CA atoms preferred).
 * Falls back to any ATOM per residue if CA is missing.
 */
export function parsePdbChains(pdbText: string): ProteinChain[] {
  const byChain = new Map<string, Map<number, ProteinResidue>>();

  for (const line of pdbText.split('\n')) {
    if (!line.startsWith('ATOM')) continue;
    const atomName = line.slice(12, 16).trim();
    if (atomName !== 'CA' && atomName !== 'N') continue;
    // Prefer CA — skip N if CA already recorded
    const chain = (line[21] ?? 'A').trim() || 'A';
    const resn = line.slice(17, 20).trim();
    const resi = parseInt(line.slice(22, 26).trim(), 10);
    if (!Number.isFinite(resi)) continue;

    const oneLetter = AA3_TO_1[resn] ?? 'X';
    const chainMap = byChain.get(chain) ?? new Map<number, ProteinResidue>();
    const existing = chainMap.get(resi);
    if (existing && atomName === 'N') continue;
    chainMap.set(resi, { chain, resi, resn, oneLetter });
    byChain.set(chain, chainMap);
  }

  const chains: ProteinChain[] = [];
  for (const [id, resMap] of [...byChain.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const residues = [...resMap.values()].sort((a, b) => a.resi - b.resi);
    chains.push({
      id,
      residues,
      sequence: residues.map(r => r.oneLetter).join(''),
    });
  }
  return chains;
}

/** Build 3Dmol residue selection from a list of {chain, resi}. */
export function buildResiSelection(
  selection: Array<{ chain: string; resi: number }>,
): Record<string, unknown> | null {
  if (selection.length === 0) return null;
  const byChain = new Map<string, number[]>();
  for (const s of selection) {
    const list = byChain.get(s.chain) ?? [];
    list.push(s.resi);
    byChain.set(s.chain, list);
  }
  if (byChain.size === 1) {
    const [chain, resis] = [...byChain.entries()][0]!;
    return { chain, resi: resis };
  }
  // Multi-chain: OR selection via resi list with chain filter per group
  // 3Dmol supports {or: [{chain, resi}, ...]}
  const or = [...byChain.entries()].map(([chain, resi]) => ({ chain, resi }));
  return { or };
}

interface PdbAtom {
  x: number;
  y: number;
  z: number;
  elem: string;
}

/** Minimal molblock (V2000) from PDB for mesh/SDF export helpers. */
export function pdbToMolblock(pdbText: string): string | null {
  const atoms: PdbAtom[] = [];
  for (const line of pdbText.split('\n')) {
    if (!line.startsWith('ATOM') && !line.startsWith('HETATM')) continue;
    const x = parseFloat(line.slice(30, 38));
    const y = parseFloat(line.slice(38, 46));
    const z = parseFloat(line.slice(46, 54));
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    let elem = line.slice(76, 78).trim();
    if (!elem) {
      const name = line.slice(12, 16).trim();
      elem = name.replace(/[0-9]/g, '').slice(0, 2);
      if (elem.length === 2) elem = elem[0]!.toUpperCase() + elem[1]!.toLowerCase();
      else elem = elem[0]?.toUpperCase() ?? 'C';
    }
    atoms.push({ x, y, z, elem: elem.toUpperCase() });
  }
  if (atoms.length === 0) return null;

  const n = atoms.length;
  const lines: string[] = [
    'Protein export',
    '  Moldraw',
    '',
    `${String(n).padStart(3)}  0  0  0  0  0  0  0  0999 V2000`,
  ];
  for (const a of atoms) {
    lines.push(
      `${a.x.toFixed(4).padStart(10)}${a.y.toFixed(4).padStart(10)}${a.z.toFixed(4).padStart(10)} ${a.elem.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`,
    );
  }
  lines.push('M  END');
  lines.push('$$$$\n');
  return lines.join('\n');
}
