import {
  PLACE_FRAGMENT_TOOL_ID,
  previewFragmentPlacement,
} from '@moldraw/core';
import { bondEndPoints } from '../geometry';
import { drawBonds } from './drawBonds';
import { drawAtomLabels } from './drawAtomDecorations';
import type { RenderContext } from './types';
import type { Molecule } from '@moldraw/domain';

function buildValencyMap(mol: Molecule): Map<string, number> {
  const valencyMap = new Map<string, number>();
  for (const b of mol.bonds) {
    valencyMap.set(b.fromAtomId, (valencyMap.get(b.fromAtomId) || 0) + b.order);
    valencyMap.set(b.toAtomId, (valencyMap.get(b.toAtomId) || 0) + b.order);
  }
  return valencyMap;
}

function resolveSnapTargetAtomId(R: RenderContext): string | null {
  return R.hoverAtomId ?? R.hoveredAtomCircleId;
}

export const drawFragmentPlacementGhost = (ctx: CanvasRenderingContext2D, R: RenderContext): void => {
  const session = R.fragmentPlacement;
  if (R.activeTool !== PLACE_FRAGMENT_TOOL_ID || !session || !R.mouseWorldPos) return;

  const hoverSnapId = resolveSnapTargetAtomId(R);
  const bondLen = R.displayPrefs.bondLengthPx;
  const snapRad = R.displayPrefs.bondAngleSnapRad;

  const { placed, snapTargetAtomId, canAttach } = previewFragmentPlacement(
    R.molecule,
    session.fragment,
    session.connectionAtomId,
    R.mouseWorldPos.x,
    R.mouseWorldPos.y,
    hoverSnapId,
    bondLen,
    snapRad,
    session.kind === 'functional_group',
  );

  const snapAtom = snapTargetAtomId
    ? R.molecule.atoms.find(a => a.id === snapTargetAtomId)
    : null;

  const valencyMap = buildValencyMap(placed);
  const atomById = new Map(placed.atoms.map(a => [a.id, a]));
  const ghostR = {
    displayPrefs: R.displayPrefs,
    renderedMolecule: placed,
    molecule: placed,
    atomById,
    ringCenterByBondId: new Map(),
    ringAtomIdsByBondId: new Map(),
    selectedAtomIds: [] as string[],
    selectedBondIds: [] as string[],
    labelCounterRad: 0,
    valencyMap,
    showHydrogens: false,
    condensedGroupLabels: R.condensedGroupLabels,
    colorAtomLabels: R.colorAtomLabels,
    applyAtomColorsToBonds: R.applyAtomColorsToBonds,
    structureTheme: R.structureTheme,
    omitAtomAliasBodyId: null,
    atomOpacityById: new Map<string, number>(),
    applyLabelUpright: (_atomId: string, draw: () => void) => {
      draw();
    },
  } as RenderContext;

  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.setLineDash([4 / R.viewport.zoom, 4 / R.viewport.zoom]);
  drawBonds(ctx, ghostR);
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.7;
  drawAtomLabels(ctx, ghostR);
  ctx.restore();

  if (snapAtom && session.connectionAtomId) {
    const conn = placed.atoms.find(a => a.id === session.connectionAtomId);
    if (conn) {
      const bondTrimCtx = {
        ctx,
        displayPrefs: R.displayPrefs,
        labelRadForAtom: () => 0,
        condensedGroupLabels: R.condensedGroupLabels,
        molecule: { ...R.molecule, atoms: [...R.molecule.atoms, ...placed.atoms], bonds: [] },
        valencyMap: buildValencyMap(R.molecule),
      };
      const T = bondEndPoints(snapAtom, conn, bondTrimCtx);
      ctx.save();
      ctx.strokeStyle = canAttach ? '#2dd4bf' : '#ca8a04';
      ctx.lineWidth = Math.max(1.2, R.displayPrefs.bondThicknessPx * 1.1);
      ctx.setLineDash([6 / R.viewport.zoom, 4 / R.viewport.zoom]);
      ctx.beginPath();
      ctx.moveTo(T.ax, T.ay);
      ctx.lineTo(T.bx, T.by);
      ctx.stroke();
      ctx.restore();
    }
  }
};

/** Whether the hovered atom is a valid snap target for the current ghost position. */
export function isFragmentPlacementSnapValid(R: RenderContext): boolean {
  const session = R.fragmentPlacement;
  if (R.activeTool !== PLACE_FRAGMENT_TOOL_ID || !session || !R.mouseWorldPos) return false;

  const hoverSnapId = R.hoverAtomId ?? R.hoveredAtomCircleId;
  if (!hoverSnapId) return false;

  return previewFragmentPlacement(
    R.molecule,
    session.fragment,
    session.connectionAtomId,
    R.mouseWorldPos.x,
    R.mouseWorldPos.y,
    hoverSnapId,
    R.displayPrefs.bondLengthPx,
    R.displayPrefs.bondAngleSnapRad,
    session.kind === 'functional_group',
  ).canAttach;
}
