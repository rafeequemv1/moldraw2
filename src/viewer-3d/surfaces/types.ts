/** 3Dmol surface kinds (ProteinSurface4.SurfaceType). */
export type ViewerSurfaceKind = 'VDW' | 'MS' | 'SAS' | 'SES';

export type ViewerSurfaceColorMode =
  | 'solid'
  | 'element'
  | 'partialCharge'
  | 'volumetric';

export type ViewerSurfaceSettings = {
  /** Off when null. */
  kind: ViewerSurfaceKind | null;
  opacity: number;
  colorMode: ViewerSurfaceColorMode;
  solidColor: string;
  /** Raw Gaussian cube text for volumetric coloring (optional). */
  cubeText: string | null;
  cubeName: string | null;
};

export const DEFAULT_SURFACE_SETTINGS: ViewerSurfaceSettings = {
  kind: null,
  opacity: 0.75,
  colorMode: 'element',
  solidColor: '#94a3b8',
  cubeText: null,
  cubeName: null,
};

export const SURFACE_KIND_OPTIONS: Array<{
  id: ViewerSurfaceKind;
  label: string;
  title: string;
}> = [
  {
    id: 'VDW',
    label: 'VDW',
    title: 'van der Waals surface',
  },
  {
    id: 'MS',
    label: 'MS',
    title: 'Molecular surface',
  },
  {
    id: 'SAS',
    label: 'SAS',
    title: 'Solvent-accessible surface',
  },
  {
    id: 'SES',
    label: 'SES',
    title: 'Solvent-excluded surface',
  },
];

export const SURFACE_COLOR_MODE_OPTIONS: Array<{
  id: ViewerSurfaceColorMode;
  label: string;
  title: string;
}> = [
  {
    id: 'solid',
    label: 'Solid color',
    title: 'Single color for the whole surface',
  },
  {
    id: 'element',
    label: 'Color by atom',
    title: 'Element / CPK colorscheme on the surface',
  },
  {
    id: 'partialCharge',
    label: 'Color by charge',
    title: 'Map partialCharge property with a red–white–blue gradient',
  },
  {
    id: 'volumetric',
    label: 'Volumetric',
    title: 'Color vertices from a Gaussian cube file',
  },
];
