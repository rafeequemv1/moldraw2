import * as $3Dmol from '3dmol';
import type { ViewerSurfaceSettings } from './types';

type MolViewer = {
  removeAllSurfaces: () => void;
  addSurface: (
    stype: string | number,
    style?: object,
    atomsel?: object,
    allsel?: object,
  ) => unknown;
  mapAtomProperties?: (fn: (atom: Record<string, unknown>) => void) => void;
  render: () => void;
};

const surfaceTypeValue = (
  kind: NonNullable<ViewerSurfaceSettings['kind']>,
): string | number => {
  const enumMap = ($3Dmol as unknown as { SurfaceType?: Record<string, number> })
    .SurfaceType;
  if (enumMap && typeof enumMap[kind] === 'number') return enumMap[kind];
  return kind;
};

const buildSurfaceStyle = (
  settings: ViewerSurfaceSettings,
): Record<string, unknown> | null => {
  const opacity = Math.min(1, Math.max(0.05, settings.opacity));
  const base: Record<string, unknown> = { opacity };
  const api = $3Dmol as unknown as {
    VolumeData: new (data: string, format: string) => unknown;
    Gradient?: { RWB: new (min: number, max: number) => unknown };
  };

  switch (settings.colorMode) {
    case 'solid':
      return { ...base, color: settings.solidColor };
    case 'element':
      return { ...base, colorscheme: 'default' };
    case 'partialCharge': {
      const scheme = api.Gradient?.RWB
        ? new api.Gradient.RWB(-0.5, 0.5)
        : undefined;
      return {
        ...base,
        map: scheme
          ? { prop: 'partialCharge', scheme }
          : { prop: 'partialCharge' },
      };
    }
    case 'volumetric': {
      if (!settings.cubeText?.trim()) return null;
      try {
        const voldata = new api.VolumeData(settings.cubeText, 'cube');
        const volscheme = api.Gradient?.RWB
          ? new api.Gradient.RWB(-0.1, 0.1)
          : undefined;
        return {
          ...base,
          voldata,
          ...(volscheme ? { volscheme } : { volformat: 'cube' }),
        };
      } catch (err) {
        console.warn('[viewer3d] cube volumetric style failed', err);
        return { ...base, color: settings.solidColor };
      }
    }
    default:
      return { ...base, colorscheme: 'default' };
  }
};

export type ApplyViewerSurfaceOptions = {
  viewer: MolViewer;
  settings: ViewerSurfaceSettings;
  /** Hide hydrogens from surface calculation when false. */
  showHydrogens: boolean;
};

/**
 * Replace any existing surfaces with the current settings (or clear them).
 * Returns true when a surface add was kicked off.
 */
export const applyViewerSurface = ({
  viewer,
  settings,
  showHydrogens,
}: ApplyViewerSurfaceOptions): boolean => {
  try {
    viewer.removeAllSurfaces();
  } catch {
    /* viewer may not be ready */
  }

  if (!settings.kind) {
    viewer.render();
    return false;
  }

  if (settings.colorMode === 'volumetric' && !settings.cubeText?.trim()) {
    viewer.render();
    return false;
  }

  if (settings.colorMode === 'partialCharge') {
    const applyPartialCharges = (
      $3Dmol as unknown as {
        applyPartialCharges?: (
          atom: Record<string, unknown>,
          keepExisting?: boolean,
        ) => void;
      }
    ).applyPartialCharges;
    if (typeof viewer.mapAtomProperties === 'function' && applyPartialCharges) {
      try {
        viewer.mapAtomProperties(atom => applyPartialCharges(atom, false));
      } catch (err) {
        console.warn('[viewer3d] mapAtomProperties(partialCharge) failed', err);
      }
    }
  }

  const style = buildSurfaceStyle(settings);
  if (!style) {
    viewer.render();
    return false;
  }

  // Exclude hydrogens from both display and calculation when H are hidden.
  const sel = showHydrogens ? {} : { invert: true, elem: 'H' };

  try {
    const result = viewer.addSurface(
      surfaceTypeValue(settings.kind),
      style,
      sel,
      sel,
    );
    // Promise-style API: re-render when done.
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      void (result as Promise<unknown>).then(() => {
        try {
          viewer.render();
        } catch {
          /* ignore */
        }
      });
    } else {
      viewer.render();
    }
    return true;
  } catch (err) {
    console.warn('[viewer3d] addSurface failed', err);
    viewer.render();
    return false;
  }
};
