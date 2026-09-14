import type { ViewerDisplayMode } from './types';
import {
  HYDROGEN_COLOR,
  SELECTED_SPHERE_SCALE,
  SELECTED_STICK_RADIUS,
  STICK_RADIUS,
  ballStickSphereRadius,
  spacefillSphereRadius,
} from '../styleConstants';

type MolViewer = {
  setStyle: (sel: object, style: object) => void;
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

const styleForElement = (
  mode: ViewerDisplayMode,
  elem: string,
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
      return {
        stick: {
          radius: STICK_RADIUS,
          singleBonds: true,
          ...hColor,
        },
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
          radius: 0.35,
          linewidth: 1.5,
          ...hColor,
        },
      };
    case 'ballStick':
    default:
      return {
        stick: {
          radius: STICK_RADIUS,
          singleBonds: true,
          ...hColor,
        },
        sphere: {
          radius: ballStickSphereRadius(elem),
          ...hColor,
        },
      };
  }
};

const selectedOverlayStyle = (
  mode: ViewerDisplayMode,
  elem?: string,
): Record<string, unknown> => {
  const radius = elem
    ? mode === 'spacefill'
      ? spacefillSphereRadius(elem) * 1.05
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
    return {
      stick: { radius: SELECTED_STICK_RADIUS, color: '#2563eb', singleBonds: true },
      sphere: { radius: radius * 0.7, color: '#1d4ed8' },
    };
  }

  return {
    stick: { radius: SELECTED_STICK_RADIUS, color: '#2563eb', singleBonds: true },
    sphere: { radius, color: '#1d4ed8' },
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

  const usedElements = new Set<string>();
  models.forEach(m => {
    const atoms = m.selectedAtoms?.({}) ?? [];
    for (const a of atoms) {
      if (a?.elem) usedElements.add(a.elem);
    }
  });

  for (const elem of usedElements) {
    if (elem === 'H' && !showHydrogens) continue;
    viewer.setStyle({ elem }, styleForElement(mode, elem));
  }

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
        selectedOverlayStyle(mode, picked?.elem),
      );
    }
  }
};
