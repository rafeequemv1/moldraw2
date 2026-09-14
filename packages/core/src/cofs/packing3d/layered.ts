/**
 * Layered (2D + stacking axis) packer — COF-1 / COF-5 today.
 * Swap in a `CofNetworkPacker` for true 3D nets later.
 */
import type { InstanceArraySite } from '@moldraw/domain';
import { honeycombPoreOffsets } from '../topologies/hexagonalHoneycomb';
import { squarePoreOffsets } from '../topologies/squareGrid';
import type {
  CofLayerStackMode,
  CofPackSite3D,
  CofSheet,
  CofStackingSpec,
  CofTopologyId,
} from './types';
import { interlayerPx } from './view';

const newId = () => Math.random().toString(36).slice(2, 11);

const planarPoreOffsets = (
  topology: CofTopologyId,
  cols: number,
  rows: number,
  nodeSpacing: number,
): Array<{ dx: number; dy: number }> =>
  topology === 'square-grid'
    ? squarePoreOffsets(cols, rows, nodeSpacing)
    : honeycombPoreOffsets(cols, rows, nodeSpacing);

const slipForLayer = (
  layer: number,
  mode: CofLayerStackMode,
  nodeSpacing: number,
  topology: CofTopologyId = 'hexagonal-honeycomb',
): { dx: number; dy: number } => {
  if (mode !== 'ab-slipped' || layer % 2 === 0) return { dx: 0, dy: 0 };
  if (topology === 'square-grid') return { dx: nodeSpacing / 2, dy: nodeSpacing / 2 };
  return { dx: nodeSpacing, dy: 0 };
};

/** In-plane pores × stacked layers, omitting the (0,0,0) seed. */
export function layeredPackSites(
  cols: number,
  rows: number,
  layers: number,
  nodeSpacing: number,
  bondLength: number,
  stacking: CofStackingSpec,
  topology: CofTopologyId = 'hexagonal-honeycomb',
): CofPackSite3D[] {
  const planar = planarPoreOffsets(topology, cols, rows, nodeSpacing);
  const c = interlayerPx(bondLength, stacking.interlayerBondRatio);
  const sites: CofPackSite3D[] = [];
  for (let k = 0; k < layers; k++) {
    const slip = slipForLayer(k, stacking.mode, nodeSpacing, topology);
    const dz = k * c;
    if (k === 0) {
      for (const p of planar) sites.push({ dx: p.dx, dy: p.dy, dz: 0 });
      continue;
    }
    sites.push({ dx: slip.dx, dy: slip.dy, dz });
    for (const p of planar) {
      sites.push({ dx: p.dx + slip.dx, dy: p.dy + slip.dy, dz });
    }
  }
  return sites;
}

/** Extra layers only — seed is already the full in-plane sheet. */
export function layerInstanceSites(
  layers: number,
  nodeSpacing: number,
  bondLength: number,
  stacking: CofStackingSpec,
  topology: CofTopologyId = 'hexagonal-honeycomb',
): InstanceArraySite[] {
  const c = interlayerPx(bondLength, stacking.interlayerBondRatio);
  const sites: InstanceArraySite[] = [];
  for (let k = 1; k < layers; k++) {
    const slip = slipForLayer(k, stacking.mode, nodeSpacing, topology);
    sites.push({ dx: slip.dx, dy: slip.dy, dz: k * c, rot: 0 });
  }
  return sites;
}

export function layeredInstanceSites(
  cols: number,
  rows: number,
  layers: number,
  nodeSpacing: number,
  bondLength: number,
  stacking: CofStackingSpec,
  topology: CofTopologyId = 'hexagonal-honeycomb',
): InstanceArraySite[] {
  return layeredPackSites(cols, rows, layers, nodeSpacing, bondLength, stacking, topology).map(s => ({
    dx: s.dx,
    dy: s.dy,
    dz: s.dz,
    rot: 0,
  }));
}

/** Duplicate a baked 2D sheet along c (real atoms, eclipsed or slipped). */
export function stackSheetLayers(
  sheet: CofSheet,
  layers: number,
  nodeSpacing: number,
  stacking: CofStackingSpec,
  topology: CofTopologyId = 'hexagonal-honeycomb',
): CofSheet & { layerOf: Map<string, number> } {
  if (layers <= 1) {
    return { ...sheet, layerOf: new Map(sheet.atomIds.map(id => [id, 0])) };
  }
  const atoms = [...sheet.atoms];
  const bonds = [...sheet.bonds];
  const atomIds = [...sheet.atomIds];
  const layerOf = new Map(sheet.atomIds.map(id => [id, 0]));

  for (let k = 1; k < layers; k++) {
    const slip = slipForLayer(k, stacking.mode, nodeSpacing, topology);
    const idMap = new Map<string, string>();
    for (const a of sheet.atoms) {
      const id = newId();
      idMap.set(a.id, id);
      atoms.push({ ...a, id, x: a.x + slip.dx, y: a.y + slip.dy });
      atomIds.push(id);
      layerOf.set(id, k);
    }
    for (const b of sheet.bonds) {
      const from = idMap.get(b.fromAtomId);
      const to = idMap.get(b.toAtomId);
      if (!from || !to) continue;
      bonds.push({ ...b, id: newId(), fromAtomId: from, toAtomId: to });
    }
  }

  return { atoms, bonds, atomIds, layerOf };
}

export function layerZ(
  layerIndex: number,
  bondLength: number,
  stacking: CofStackingSpec,
): number {
  return layerIndex * interlayerPx(bondLength, stacking.interlayerBondRatio);
}
