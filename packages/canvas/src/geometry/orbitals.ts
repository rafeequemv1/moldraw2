import type { CanvasOrbital, Molecule } from '@moldraw/domain';

const ROTATE_HANDLE_GAP = 16;
const ROTATE_HANDLE_R = 9;

export function resolveOrbitalCenter(mol: Molecule, orbital: CanvasOrbital): { x: number; y: number } {
  if (orbital.atomId) {
    const atom = mol.atoms.find(a => a.id === orbital.atomId);
    if (atom) return { x: atom.x, y: atom.y };
  }
  return { x: orbital.x, y: orbital.y };
}

/** Hit the orbital body, but leave a small disk at the center for atom picks. */
export function pickCanvasOrbitalAt(
  mol: Molecule,
  x: number,
  y: number,
  opts?: { includeCenter?: boolean },
): CanvasOrbital | null {
  const list = mol.orbitals ?? [];
  for (let i = list.length - 1; i >= 0; i--) {
    const o = list[i]!;
    const c = resolveOrbitalCenter(mol, o);
    const d = Math.hypot(x - c.x, y - c.y);
    if (!opts?.includeCenter && d < 9) continue;
    if (d <= o.size * 1.08) return o;
  }
  return null;
}

export function orbitalSupportsRotation(orbital: CanvasOrbital): boolean {
  return orbital.kind !== 's';
}

export function getOrbitalRotateHandleWorld(
  orbital: CanvasOrbital,
  cx: number,
  cy: number,
): { x: number; y: number } {
  const dist = orbital.size + ROTATE_HANDLE_GAP;
  return {
    x: cx + Math.cos(orbital.rotationRad) * dist,
    y: cy + Math.sin(orbital.rotationRad) * dist,
  };
}

export function pickOrbitalRotateHandle(
  orbital: CanvasOrbital,
  cx: number,
  cy: number,
  x: number,
  y: number,
  zoom: number,
): boolean {
  if (!orbitalSupportsRotation(orbital)) return false;
  const h = getOrbitalRotateHandleWorld(orbital, cx, cy);
  const r = Math.max(ROTATE_HANDLE_R / 2, ROTATE_HANDLE_R / zoom);
  return Math.hypot(x - h.x, y - h.y) <= r;
}

export function canvasOrbitalRotatePatch(
  orig: CanvasOrbital,
  startPointerAngle: number,
  currentPointerAngle: number,
  snap = false,
): Pick<CanvasOrbital, 'rotationRad'> {
  let next = orig.rotationRad + (currentPointerAngle - startPointerAngle);
  if (snap) {
    const step = Math.PI / 12;
    next = Math.round(next / step) * step;
  }
  return { rotationRad: next };
}

export function canvasOrbitalWithDragPreview(
  orbital: CanvasOrbital,
  drag:
    | {
        type: 'move_canvas_orbital';
        orbitalId: string;
        startX: number;
        startY: number;
        currentX: number;
        currentY: number;
        origX: number;
        origY: number;
      }
    | {
        type: 'rotate_canvas_orbital';
        orbitalId: string;
        startPointerAngle: number;
        currentPointerAngle: number;
        origOrbital: CanvasOrbital;
      }
    | null
    | undefined,
): CanvasOrbital {
  if (!drag || drag.orbitalId !== orbital.id) return orbital;
  if (drag.type === 'move_canvas_orbital') {
    const { atomId: _drop, ...rest } = orbital;
    return {
      ...rest,
      x: drag.origX + (drag.currentX - drag.startX),
      y: drag.origY + (drag.currentY - drag.startY),
    };
  }
  return {
    ...drag.origOrbital,
    ...canvasOrbitalRotatePatch(
      drag.origOrbital,
      drag.startPointerAngle,
      drag.currentPointerAngle,
    ),
  };
}
