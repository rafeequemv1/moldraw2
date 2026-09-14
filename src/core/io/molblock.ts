import type { Atom, Bond, Molecule } from '@moldraw/domain';
import { findMolfileCountsLineIndex } from './molblockHeader';

/**
 * V2000 MOL block writer used for round-tripping molecules through the engine.
 * Coordinates are stored in Å (canvas px / 40); Y is flipped so screen-down maps to molfile-up.
 */
export const moleculeToMolblock = (mol: Molecule): string => {

  let molblock = "MolDraw\n  Moldraw\n\n";
  const numAtoms = mol.atoms.length.toString().padStart(3, ' ');
  const numBonds = mol.bonds.length.toString().padStart(3, ' ');
  molblock += `${numAtoms}${numBonds}  0  0  0  0  0  0  0  0999 V2000\n`;

  const idToIndex = new Map<string, number>();
  mol.atoms.forEach((a, i) => {
    idToIndex.set(a.id, i + 1);
    const x = (a.x / 40).toFixed(4).padStart(10, ' ');
    const y = (-a.y / 40).toFixed(4).padStart(10, ' ');
    const z = (0).toFixed(4).padStart(10, ' ');
    const symbol = a.element.padEnd(3, ' '); // `alias` is display-only in v1; symbol is heavy `element`.
    const map = a.atomMap && a.atomMap > 0 ? String(Math.trunc(a.atomMap)).padStart(3, ' ') : '  0';
    // V2000: massDiff charge stereo … aamap (cols 61–63) …
    molblock += `${x}${y}${z} ${symbol} 0  0  0  0  0  0  0  0  0${map}  0  0\n`;
  });

  mol.bonds.forEach(b => {
    const fromIdx = idToIndex.get(b.fromAtomId)!.toString().padStart(3, ' ');
    const toIdx = idToIndex.get(b.toAtomId)!.toString().padStart(3, ' ');
    const molOrder = b.aromatic ? 4 : b.order;
    const order = molOrder.toString().padStart(3, ' ');
    const stereo = b.stereo === 'wedge' ? '  1' : b.stereo === 'dash' ? '  6' : b.stereo === 'wavy' ? '  4' : '  0';
    molblock += `${fromIdx}${toIdx}${order}${stereo}  0  0  0\n`;
  });
  mol.atoms.forEach((a, i) => {
    if (a.charge !== 0) {
      const atomIdx = (i + 1).toString().padStart(3, ' ');
      const chg = a.charge.toString().padStart(3, ' ');
      molblock += `M  CHG  1 ${atomIdx} ${chg}\n`;
    }
  });
  mol.atoms.forEach((a, i) => {
    if (a.isotope && a.isotope > 0) {
      const atomIdx = (i + 1).toString().padStart(3, ' ');
      const isotope = Math.trunc(a.isotope).toString().padStart(3, ' ');
      molblock += `M  ISO  1 ${atomIdx} ${isotope}\n`;
    }
  });

  molblock += "M  END\n";
  return molblock;
};

/**
 * V2000 MOL block reader. Generates per-call ID prefixes so multiple parsed
 * molecules can coexist on the canvas without colliding.
 */
export const parseMolblock = (molblock: string): Molecule => {
  const lines = molblock.replace(/\r\n/g, '\n').split('\n');
  const countsIdx = findMolfileCountsLineIndex(lines);
  if (countsIdx < 0) return { atoms: [], bonds: [] };
  const countsLine = lines[countsIdx]!;
  const numAtoms = parseInt(countsLine.substring(0, 3).trim() || '0');
  const numBonds = parseInt(countsLine.substring(3, 6).trim() || '0');
  if (!Number.isFinite(numAtoms) || numAtoms <= 0) return { atoms: [], bonds: [] };

  const atoms: Atom[] = [];
  const bonds: Bond[] = [];
  const scale = 40;
  const atomStart = countsIdx + 1;

  // Use globally unique IDs so multiple parsed molecules can coexist on the canvas
  // without bond references from mol-N accidentally pointing to atoms in mol-M.
  const prefix = Math.random().toString(36).substr(2, 6);
  const atomIds: string[] = [];

  for (let i = 0; i < numAtoms; i++) {
    const line = lines[atomStart + i];
    if (!line) continue;

    let x: number;
    let y: number;
    let element: string;
    let mdlStereoCare: number | undefined;

    const trimmed = line.trim();
    const parts = trimmed.split(/\s+/);
    let atomMap: number | undefined;
    // PubChem / OEChem use spaced fields; token index 6 is atom stereo parity / care (0–3).
    // Atom-atom map is typically token 13 (after element + 9 ints).
    if (parts.length >= 4 && /^[A-Za-z*]{1,3}$/.test(parts[3])) {
      x = parseFloat(parts[0]) * scale;
      y = -parseFloat(parts[1]) * scale;
      element = parts[3];
      if (parts.length > 6) {
        const sc = parseInt(parts[6], 10);
        if (Number.isFinite(sc) && sc >= 0 && sc <= 3) {
          mdlStereoCare = sc;
        }
      }
      if (parts.length > 13) {
        const m = parseInt(parts[13], 10);
        if (Number.isFinite(m) && m > 0) atomMap = m;
      }
    } else {
      x = parseFloat(line.substring(0, 10).trim()) * scale;
      y = -parseFloat(line.substring(10, 20).trim()) * scale;
      element = line.substring(31, 34).trim();
      if (line.length >= 63) {
        const m = parseInt(line.substring(60, 63).trim() || '0', 10);
        if (Number.isFinite(m) && m > 0) atomMap = m;
      }
    }

    const id = `${prefix}_a${i + 1}`;
    atomIds.push(id);
    atoms.push({
      id,
      element,
      x,
      y,
      charge: 0,
      ...(mdlStereoCare !== undefined ? { mdlStereoCare } : {}),
      ...(atomMap !== undefined ? { atomMap } : {}),
    });
  }

  for (let i = 0; i < numBonds; i++) {
    const line = lines[atomStart + numAtoms + i];
    if (!line) continue;
    const fromIdx = parseInt(line.substring(0, 3).trim()) - 1;
    const toIdx   = parseInt(line.substring(3, 6).trim()) - 1;
    let order = parseInt(line.substring(6, 9).trim());
    const stereoCode = parseInt(line.substring(9, 12).trim() || '0');
    let stereo: 'wedge' | 'dash' | 'wavy' | undefined = undefined;

    let aromatic = false;
    if (order === 4) {
      aromatic = true;
      order = 1;
    }

    // Bond stereo: 1 up, 6 down, 4 either (single); 3 cis/trans (double); 9 unspecified either (some vendors).
    if (!aromatic) {
      if (stereoCode === 1) stereo = 'wedge';
      else if (stereoCode === 6) stereo = 'dash';
      else if (stereoCode === 4 || stereoCode === 9) stereo = 'wavy';
    }

    bonds.push({
      id: `${prefix}_b${i + 1}`,
      fromAtomId: atomIds[fromIdx],
      toAtomId:   atomIds[toIdx],
      order,
      ...(aromatic ? { aromatic: true } : {}),
      stereo,
    });
  }

  for (let i = atomStart + numAtoms + numBonds; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    if (line.startsWith('M  END')) break;
    if (line.startsWith('M  CHG')) {
      const parts = line.substring(6).trim().split(/\s+/);
      const numEntries = parseInt(parts[0]);
      for (let j = 0; j < numEntries; j++) {
        const atomIdx = parseInt(parts[1 + j * 2]) - 1;
        const charge = parseInt(parts[2 + j * 2]);
        if (atoms[atomIdx]) atoms[atomIdx].charge = charge;
      }
    }
    if (line.startsWith('M  ISO')) {
      const parts = line.substring(6).trim().split(/\s+/);
      const numEntries = parseInt(parts[0]);
      for (let j = 0; j < numEntries; j++) {
        const atomIdx = parseInt(parts[1 + j * 2]) - 1;
        const isotope = parseInt(parts[2 + j * 2]);
        if (atoms[atomIdx] && Number.isFinite(isotope) && isotope > 0) {
          atoms[atomIdx].isotope = isotope;
        }
      }
    }
  }

  return { atoms, bonds };
};
