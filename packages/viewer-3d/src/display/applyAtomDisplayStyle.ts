import type { ViewerDisplayMode } from './types';
import {
  HYDROGEN_COLOR,
  MOL3D_BALLSTICK_SPHERE_SCALE,
  MOL3D_BALLSTICK_STICK_RADIUS,
  SELECTED_SPHERE_SCALE,
  SELECTED_STICK_RADIUS,
  ballStickSphereRadius,
  crossMarkerRadius,
  molStickStyle,
  spacefillSphereRadius,
  toonishColorForElement,
  toonishSphereRadius,
  toonishStickRadius,
} from '../styleConstants';
import { drawStickCylinders, viewerSupportsCustomSticks } from './drawStickCylinders';

type MolViewer = {
  setStyle: (sel: object, style: object, add?: boolean) => void;
  addCylinder?: (spec: object) => unknown;
  addShape?: (spec: object) => unknown;
  removeAllShapes?: () => void;
  mapAtomProperties?: (fn: (atom: Record<string, unknown>) => void) => void;
};

type MolModel = {
  selectedAtoms?: (sel: object) => Array<{ elem?: string; serial?: number }>;
  setStyle?: (sel: object, style: object) => void;
  setClickable?: (
    sel: object,
    clickable: boolean,
    callback: (atom: { index?: number; serial?: number; elem?: string }) => void,
  ) => void;
};

const stickSpec = (spec: Record<string, unknown>): Record<string, unknown> =>
  molStickStyle(spec);

const styleForElement = (
  mode: ViewerDisplayMode,
  elem: string,
  customSticks: boolean,
): Record<string, unknown> => {
  const isH = elem === 'H';
  const hColor = isH ? { color: HYDROGEN_COLOR } : {};

  switch (mode) {
    case 'spacefill':
      return {
        sphere: {
          radius: spacefillSphereRadius(elem),
          ...hColor,
        },
      };
    case 'stick':
      if (customSticks) return { stick: { hidden: true } };
      return {
        stick: stickSpec({
          ...hColor,
        }),
      };
    case 'line':
      return {
        line: {
          linewidth: 2,
          ...hColor,
        },
      };
    case 'cross':
      return {
        cross: {
          radius: crossMarkerRadius(elem),
          linewidth: 1.5,
          ...hColor,
        },
      };
    case 'toonish': {
      const flat = toonishColorForElement(elem);
      const color = flat ? { color: flat } : hColor;
      return {
        ...(customSticks
          ? { stick: { hidden: true } }
          : {
              stick: stickSpec({
                radius: toonishStickRadius(elem),
                ...color,
              }),
            }),
        sphere: {
          radius: toonishSphereRadius(elem),
          ...color,
        },
      };
    }
    case 'ballStick':
    default:
      // Native 3Dmol ball-and-stick (sphere.scale × vdW + stick radius).
      // Custom cylinders hide sticks and were wiping spheres — do not use them here.
      return {
        stick: { radius: MOL3D_BALLSTICK_STICK_RADIUS, ...hColor },
        sphere: {
          scale: isH ? 0.22 : MOL3D_BALLSTICK_SPHERE_SCALE,
          ...hColor,
        },
      };
  }
};

const selectedOverlayStyle = (
  mode: ViewerDisplayMode,
  elem: string | undefined,
  customSticks: boolean,
): Record<string, unknown> => {
  const radius = elem
    ? mode === 'spacefill'
      ? spacefillSphereRadius(elem) * 1.05
      : mode === 'toonish'
        ? toonishSphereRadius(elem) * SELECTED_SPHERE_SCALE
        : ballStickSphereRadius(elem) * SELECTED_SPHERE_SCALE
    : 0.5;

  if (mode === 'line' || mode === 'cross') {
    return {
      [mode]: {
        color: '#2563eb',
        linewidth: 3,
        radius: mode === 'cross' ? 0.45 : undefined,
      },
      sphere: { radius: Math.min(radius, 0.55), color: '#1d4ed8' },
    };
  }

  if (mode === 'spacefill') {
    return { sphere: { radius, color: '#1d4ed8' } };
  }

  if (mode === 'stick') {
    if (customSticks) {
      return { stick: { hidden: true }, sphere: { radius: radius * 0.55, color: '#1d4ed8' } };
    }
    return {
      stick: stickSpec({ radius: SELECTED_STICK_RADIUS, color: '#2563eb' }),
      sphere: { radius: radius * 0.7, color: '#1d4ed8' },
    };
  }

  if (mode === 'toonish') {
    const stickR = elem
      ? toonishStickRadius(elem) * SELECTED_SPHERE_SCALE
      : SELECTED_STICK_RADIUS;
    return {
      ...(customSticks
        ? { stick: { hidden: true } }
        : { stick: stickSpec({ radius: stickR, color: '#2563eb' }) }),
      sphere: { radius, color: '#1d4ed8' },
    };
  }

  return {
    stick: { radius: MOL3D_BALLSTICK_STICK_RADIUS * 1.2, color: '#2563eb' },
    sphere: {
      scale: MOL3D_BALLSTICK_SPHERE_SCALE * 1.15,
      color: '#1d4ed8',
    },
  };
};

export type ApplyAtomDisplayStyleOptions = {
  viewer: MolViewer;
  models: MolModel[];
  mode: ViewerDisplayMode;
  showHydrogens: boolean;
  selectedAtomIndices?: number[];
  onAtomPick?: (pick: {
    atomIndex: number;
    modelIndex: number;
    element?: string;
  }) => void;
};

/**
 * Apply atom representation styles (and optional selection / pick handlers).
 * Caller is responsible for clearing / loading models beforehand.
 */
export const applyAtomDisplayStyle = ({
  viewer,
  models,
  mode,
  showHydrogens,
  selectedAtomIndices = [],
  onAtomPick,
}: ApplyAtomDisplayStyleOptions): void => {
  viewer.setStyle({}, {});
  const customSticks =
    viewerSupportsCustomSticks(viewer) && (mode === 'stick' || mode === 'toonish');

  if (mode === 'ballStick') {
    viewer.setStyle({}, {
      stick: { radius: MOL3D_BALLSTICK_STICK_RADIUS },
      sphere: { scale: MOL3D_BALLSTICK_SPHERE_SCALE },
    });
  }

  const usedElements = new Set<string>();
  models.forEach(m => {
    const atoms = m.selectedAtoms?.({}) ?? [];
    for (const a of atoms) {
      if (a?.elem) usedElements.add(a.elem);
    }
  });

  for (const elem of usedElements) {
    if (elem === 'H' && !showHydrogens) continue;
    viewer.setStyle({ elem }, styleForElement(mode, elem, customSticks));
  }

  // Per-atom pass: guarantees correct radius even if elem tags are inconsistent.
  models.forEach(m => {
    const atoms = m.selectedAtoms?.({}) ?? [];
    for (const a of atoms) {
      const elem = a.elem ?? 'C';
      if (elem === 'H' && !showHydrogens) continue;
      const serial = a.serial;
      if (serial == null || !Number.isFinite(serial)) continue;
      viewer.setStyle({ serial }, styleForElement(mode, elem, customSticks));
    }
  });

  if (!showHydrogens) {
    viewer.setStyle({ elem: 'H' }, {});
  }

  models.forEach((m, modelIndex) => {
    if (!m.setClickable || !onAtomPick) return;
    m.setClickable({}, true, atom => {
      const atomIndex = Number.isFinite(atom?.index)
        ? (atom.index as number)
        : Number.isFinite(atom?.serial)
          ? (atom.serial as number)
          : -1;
      onAtomPick({ atomIndex, modelIndex, element: atom?.elem });
    });
  });

  if (selectedAtomIndices.length > 0 && models[0]?.setStyle) {
    // Always highlight every mapped selection (including Select-menu “all atoms /
    // rings / heteroatoms”). Large sets used to be skipped to avoid a blue blob.
    for (const idx of selectedAtomIndices) {
      const picked = models[0].selectedAtoms?.({ serial: idx })?.[0];
      models[0].setStyle(
        { serial: idx },
        selectedOverlayStyle(mode, picked?.elem, customSticks),
      );
    }
  }

  if (customSticks) {
    viewer.setStyle({}, { stick: { hidden: true } }, true);
    drawStickCylinders({
      viewer,
      models,
      mode,
      showHydrogens,
      selectedAtomIndices,
    });
  }
};
