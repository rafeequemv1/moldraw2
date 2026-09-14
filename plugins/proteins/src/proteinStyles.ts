import * as $3Dmol from '3dmol';
import type { Viewer3DHandle } from '@moldraw/viewer-3d';
import type {
  ProteinColorScheme,
  ProteinRepresentation,
  ProteinStyleSettings,
  ProteinSurfaceKind,
  StyledRegion,
} from './types';
import { buildResiSelection } from './pdbUtils';

const surfaceTypeValue = (kind: ProteinSurfaceKind): string | number => {
  const enumMap = ($3Dmol as unknown as { SurfaceType?: Record<string, number> }).SurfaceType;
  if (enumMap && typeof enumMap[kind] === 'number') return enumMap[kind];
  return kind;
};

function colorProps(
  colorScheme: ProteinColorScheme,
  customColor?: string,
): Record<string, unknown> {
  if (customColor != null && customColor !== '') {
    return { color: customColor };
  }
  return { colorscheme: colorScheme };
}

function representationStyle(
  rep: ProteinRepresentation,
  colorScheme: ProteinColorScheme,
  customColor?: string,
  opacity = 1,
): Record<string, unknown> {
  const color = colorProps(colorScheme, customColor);

  switch (rep) {
    case 'cartoon':
      return { cartoon: { ...color, opacity, ribbon: false } };
    case 'ribbon':
      return { cartoon: { ...color, opacity, ribbon: true, thickness: 0.35, width: 0.35 } };
    case 'stick':
      return { stick: { ...color, opacity, singleBonds: true } };
    case 'sphere':
      return { sphere: { ...color, opacity, scale: 0.3 } };
    case 'line':
      return { line: { ...color, opacity } };
    case 'cross':
      return { cross: { ...color, opacity } };
    case 'ballstick':
      return {
        stick: { ...color, opacity, singleBonds: true },
        sphere: { ...color, opacity, scale: 0.22 },
      };
    default:
      return { cartoon: { ...color, opacity, ribbon: false } };
  }
}

function addSurfaceAsync(
  viewer: Viewer3DHandle,
  kind: ProteinSurfaceKind,
  style: Record<string, unknown>,
  sel: Record<string, unknown>,
): void {
  try {
    const result = viewer.addSurface(surfaceTypeValue(kind), style, sel, sel);
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      void (result as Promise<unknown>).then(() => {
        try {
          viewer.render();
        } catch {
          /* ignore */
        }
      });
    }
  } catch (err) {
    console.warn('[proteins] addSurface failed', err);
  }
}

function applyRegionStyle(
  viewer: Viewer3DHandle,
  selection: Record<string, unknown>,
  style: ProteinStyleSettings,
): void {
  const repStyle = representationStyle(
    style.representation,
    style.colorScheme,
    style.customColor,
    style.opacity,
  );
  viewer.setStyle(selection, repStyle);

  if (style.surface.enabled) {
    addSurfaceAsync(
      viewer,
      style.surface.kind,
      {
        opacity: Math.min(1, Math.max(0.05, style.surface.opacity)),
        color: style.surface.color,
      },
      selection,
    );
  }
}

/** Full style refresh: global base + any number of per-region overlays. */
export function refreshProteinStyles(
  viewer: Viewer3DHandle,
  globalStyle: ProteinStyleSettings,
  regions: StyledRegion[],
): void {
  try {
    viewer.setStyle({}, {});
    viewer.removeAllSurfaces();
  } catch {
    /* viewer may not be ready */
  }

  const globalRep = representationStyle(
    globalStyle.representation,
    globalStyle.colorScheme,
    globalStyle.customColor,
    globalStyle.opacity,
  );
  viewer.setStyle({}, globalRep);

  if (globalStyle.surface.enabled) {
    addSurfaceAsync(
      viewer,
      globalStyle.surface.kind,
      {
        opacity: Math.min(1, Math.max(0.05, globalStyle.surface.opacity)),
        color: globalStyle.surface.color,
      },
      {},
    );
  }

  for (const region of regions) {
    const sel = buildResiSelection(region.residues);
    if (sel) applyRegionStyle(viewer, sel, region.style);
  }

  viewer.render();
}

export const REPRESENTATION_OPTIONS: { value: ProteinRepresentation; label: string }[] = [
  { value: 'cartoon', label: 'Cartoon' },
  { value: 'ribbon', label: 'Ribbon' },
  { value: 'stick', label: 'Stick' },
  { value: 'ballstick', label: 'Ball & stick' },
  { value: 'sphere', label: 'Sphere' },
  { value: 'line', label: 'Line' },
  { value: 'cross', label: 'Cross' },
];

export const COLOR_SCHEME_OPTIONS: { value: ProteinColorScheme; label: string }[] = [
  { value: 'chain', label: 'Chain' },
  { value: 'amino', label: 'Amino acid' },
  { value: 'shapely', label: 'Shapely' },
  { value: 'ss', label: 'Secondary structure' },
  { value: 'hydrophobicity', label: 'Hydrophobicity' },
  { value: 'bfactor', label: 'B-factor' },
  { value: 'spectrum', label: 'Spectrum' },
];

export const SURFACE_KIND_OPTIONS: { value: ProteinSurfaceKind; label: string }[] = [
  { value: 'SAS', label: 'SAS' },
  { value: 'SES', label: 'SES' },
  { value: 'VDW', label: 'VDW' },
  { value: 'MS', label: 'MS' },
];
