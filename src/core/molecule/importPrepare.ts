/**
 * Pure molblock → placed atoms/bonds for import commands (no RDKit enrich).
 */
import { parseMolblock } from '../io/molblock';
import type { Atom, Bond } from '@moldraw/domain';
import {
  placeImportedMolecule,
  stripExplicitHydrogens,
  type ImportPlacementMode,
} from './importPlacement';

export type ImportPlacementKind = 'origin' | 'viewport_center';

export interface PrepareImportFromMolblockOptions {
  molblock: string;
  bondLengthPx: number;
  placement?: ImportPlacementKind;
  viewport?: { x: number; y: number; zoom: number };
  windowWidth?: number;
  windowHeight?: number;
  gridSlot?: { col: number; row: number };
}

export type PrepareImportResult =
  | { ok: true; atoms: Atom[]; bonds: Bond[] }
  | { ok: false; error: string };

export const prepareImportFromMolblock = (
  opts: PrepareImportFromMolblockOptions,
): PrepareImportResult => {
  let raw;
  try {
    raw = parseMolblock(opts.molblock);
  } catch {
    return { ok: false, error: 'Failed to parse molblock' };
  }
  if (raw.atoms.length === 0) return { ok: false, error: 'Empty molblock' };

  const parsed = stripExplicitHydrogens(raw);
  if (parsed.atoms.length === 0) {
    return { ok: false, error: 'No heavy atoms after stripping hydrogens' };
  }

  const placement = opts.placement ?? 'origin';
  const mode: ImportPlacementMode =
    placement === 'viewport_center' ? 'viewport_grid' : 'world_origin';

  const placed = placeImportedMolecule({
    parsed,
    slot: opts.gridSlot ?? { col: 0, row: 0 },
    viewport: opts.viewport ?? { x: 0, y: 0, zoom: 1 },
    windowWidth: opts.windowWidth ?? 1200,
    windowHeight: opts.windowHeight ?? 800,
    mode,
    bondLengthPx: opts.bondLengthPx,
  });

  return { ok: true, atoms: placed.atoms, bonds: placed.bonds };
};
