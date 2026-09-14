import type { CanvasOrbital, CanvasOrbitalKind } from '@moldraw/domain';
import { pickCanvasOrbitalAt } from '../geometry/orbitals';
import { pickAtomAt } from './hitTest';
import type { InteractionContext } from './types';

export const ORBITAL_TOOL_IDS = [
  'orbital_p',
  'orbital_s',
  'orbital_p2',
  'orbital_d',
  'orbital_dz2',
] as const;

export function isOrbitalTool(toolId: string): boolean {
  return (ORBITAL_TOOL_IDS as readonly string[]).includes(toolId);
}

export function orbitalSpecForTool(
  toolId: string,
): { kind: CanvasOrbitalKind; rotationRad: number } | null {
  switch (toolId) {
    case 'orbital_s':
      return { kind: 's', rotationRad: 0 };
    case 'orbital_p':
      return { kind: 'p', rotationRad: -Math.PI / 4 };
    case 'orbital_p2':
      return { kind: 'p', rotationRad: Math.PI / 4 };
    case 'orbital_d':
      return { kind: 'd_xy', rotationRad: 0 };
    case 'orbital_dz2':
      return { kind: 'dz2', rotationRad: -Math.PI / 4 };
    default:
      return null;
  }
}

export function orbitalToolMouseDown(ctx: InteractionContext): boolean {
  const spec = orbitalSpecForTool(ctx.activeTool);
  if (!spec || ctx.e.button !== 0) return false;

  const hit = pickCanvasOrbitalAt(ctx.molecule, ctx.worldPos.x, ctx.worldPos.y, {
    includeCenter: true,
  });
  if (hit) {
    ctx.onEraseAt?.({ type: 'canvasOrbital', id: hit.id });
    return true;
  }

  const atom = pickAtomAt(ctx.molecule, ctx.worldPos, ctx.hit.atomHitRadius);
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `orb_${Math.random().toString(36).slice(2, 11)}`;
  const orbital: CanvasOrbital = {
    id,
    kind: spec.kind,
    x: atom?.x ?? ctx.worldPos.x,
    y: atom?.y ?? ctx.worldPos.y,
    rotationRad: spec.rotationRad,
    size: Math.max(22, ctx.bondLengthPx * 0.85),
    atomId: atom?.id,
    color: ctx.activeColor,
  };
  ctx.onAddCanvasOrbital?.(orbital);
  ctx.setSelectedCanvasOrbitalIds?.([id]);
  ctx.setSelectedAtomIds?.([]);
  ctx.setSelectedBondIds?.([]);
  return true;
}
