/**
 * Unified MDL V2000 molfile reader/writer for the native engine.
 *
 * Consolidates the three previously-duplicated parsers (core/io/molblock.ts,
 * the worker bounds/shift helpers, and bondLengthCorrection's line parsing).
 *
 * Coordinate convention matches the app: canvas pixels with Y flipped
 * (molfile Å × MOLBLOCK_SCALE, screen-down = molfile-up). Handles both
 * fixed-width and whitespace-tokenized (PubChem/OEChem) atom lines, plus
 * `M CHG` and `M ISO` property blocks.
 */
import type { Atom, Bond, Molecule } from '@moldraw/domain';
import { findMolfileCountsLineIndex } from '@moldraw/core/io/molblockHeader';
import { makeIdFactory } from '../ids';
import { MOLBLOCK_SCALE } from '../types';
import { normalizeElementSymbol } from '../data/periodicTable';

const pad = (s: string | number, n: number): string => String(s).padStart(n, ' ');
const fixed = (v: number, width = 10): string => v.toFixed(4).padStart(width, ' ');

export interface ToMolblockOpts {
  title?: string;
}

export const moleculeToMolblockV2000 = (mol: Molecule, opts: ToMolblockOpts = {}): string => {
  const title = opts.title ?? 'MolDraw';
  let out = `${title}\n  MolDrawEngine\n\n`;
  out += `${pad(mol.atoms.length, 3)}${pad(mol.bonds.length, 3)}  0  0  0  0  0  0  0  0999 V2000\n`;

  const idToIndex = new Map<string, number>();
  mol.atoms.forEach((a, i) => {
    idToIndex.set(a.id, i + 1);
    const x = fixed(a.x / MOLBLOCK_SCALE);
    const y = fixed(-a.y / MOLBLOCK_SCALE);
    const z = fixed(0);
    const symbol = normalizeElementSymbol(a.element).padEnd(3, ' ');
    out += `${x}${y}${z} ${symbol} 0  0  0  0  0  0  0  0  0  0  0  0\n`;
  });

  mol.bonds.forEach(b => {
    const from = pad(idToIndex.get(b.fromAtomId) ?? 0, 3);
    const to = pad(idToIndex.get(b.toAtomId) ?? 0, 3);
    const order = pad(b.aromatic ? 4 : b.order, 3);
    const stereo =
      b.stereo === 'wedge' ? '  1' : b.stereo === 'dash' ? '  6' : b.stereo === 'wavy' ? '  4' : '  0';
    out += `${from}${to}${order}${stereo}  0  0  0\n`;
  });

  mol.atoms.forEach((a, i) => {
    if (a.charge && a.charge !== 0) {
      out += `M  CHG  1 ${pad(i + 1, 3)} ${pad(a.charge, 3)}\n`;
    }
  });
  mol.atoms.forEach((a, i) => {
    if (a.isotope && a.isotope > 0) {
      out += `M  ISO  1 ${pad(i + 1, 3)} ${pad(Math.trunc(a.isotope), 3)}\n`;
    }
  });

  out += 'M  END\n';
  return out;
};

export const parseMolblockV2000 = (molblock: string): Molecule => {
  const lines = molblock.split(/\r?\n/);
  const countsIdx = findMolfileCountsLineIndex(lines);
  if (countsIdx < 0) return { atoms: [], bonds: [] };
  const countsLine = lines[countsIdx]!;
  const numAtoms = parseInt(countsLine.substring(0, 3).trim() || '0', 10);
  const numBonds = parseInt(countsLine.substring(3, 6).trim() || '0', 10);
  if (!Number.isFinite(numAtoms) || numAtoms <= 0) return { atoms: [], bonds: [] };
  const atomStart = countsIdx + 1;

  const ids = makeIdFactory();
  const atoms: Atom[] = [];
  const bonds: Bond[] = [];
  const atomIds: string[] = [];

  for (let i = 0; i < numAtoms; i++) {
    const line = lines[atomStart + i];
    if (!line) continue;
    let x: number;
    let y: number;
    let element: string;
    let mdlStereoCare: number | undefined;

    const parts = line.trim().split(/\s+/);
    if (parts.length >= 4 && /^[A-Za-z*]{1,3}$/.test(parts[3])) {
      // Whitespace-tokenized (PubChem/OEChem)
      x = parseFloat(parts[0]) * MOLBLOCK_SCALE;
      y = -parseFloat(parts[1]) * MOLBLOCK_SCALE;
      element = parts[3];
      if (parts.length > 6) {
        const sc = parseInt(parts[6], 10);
        if (Number.isFinite(sc) && sc >= 0 && sc <= 3) mdlStereoCare = sc;
      }
    } else {
      x = parseFloat(line.substring(0, 10).trim()) * MOLBLOCK_SCALE;
      y = -parseFloat(line.substring(10, 20).trim()) * MOLBLOCK_SCALE;
      element = line.substring(31, 34).trim();
    }
    if (!Number.isFinite(x)) x = 0;
    if (!Number.isFinite(y)) y = 0;

    const id = ids.atom(i + 1);
    atomIds.push(id);
    atoms.push({
      id,
      element: normalizeElementSymbol(element) || 'C',
      x,
      y,
      charge: 0,
      ...(mdlStereoCare !== undefined ? { mdlStereoCare } : {}),
    });
  }

  for (let i = 0; i < numBonds; i++) {
    const line = lines[atomStart + numAtoms + i];
    if (!line) continue;
    const fromIdx = parseInt(line.substring(0, 3).trim(), 10) - 1;
    const toIdx = parseInt(line.substring(3, 6).trim(), 10) - 1;
    let order = parseInt(line.substring(6, 9).trim() || '1', 10);
    const stereoCode = parseInt(line.substring(9, 12).trim() || '0', 10);
    if (!atomIds[fromIdx] || !atomIds[toIdx]) continue;

    let aromatic = false;
    if (order === 4) {
      aromatic = true;
      order = 1;
    }
    let stereo: 'wedge' | 'dash' | 'wavy' | undefined;
    if (!aromatic) {
      if (stereoCode === 1) stereo = 'wedge';
      else if (stereoCode === 6) stereo = 'dash';
      else if (stereoCode === 4 || stereoCode === 9) stereo = 'wavy';
    }

    bonds.push({
      id: ids.bond(i + 1),
      fromAtomId: atomIds[fromIdx],
      toAtomId: atomIds[toIdx],
      order: Number.isFinite(order) && order > 0 ? order : 1,
      ...(aromatic ? { aromatic: true } : {}),
      stereo,
    });
  }

  for (let i = atomStart + numAtoms + numBonds; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    if (line.startsWith('M  END')) break;
    if (line.startsWith('M  CHG') || line.startsWith('M  ISO')) {
      const isChg = line.startsWith('M  CHG');
      const toks = line.substring(6).trim().split(/\s+/);
      const n = parseInt(toks[0], 10);
      for (let j = 0; j < n; j++) {
        const atomIdx = parseInt(toks[1 + j * 2], 10) - 1;
        const value = parseInt(toks[2 + j * 2], 10);
        if (!atoms[atomIdx] || !Number.isFinite(value)) continue;
        if (isChg) atoms[atomIdx].charge = value;
        else if (value > 0) atoms[atomIdx].isotope = value;
      }
    }
  }

  return { atoms, bonds };
};
