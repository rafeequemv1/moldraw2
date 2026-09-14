/** Atom representation modes for the 3Dmol viewer. */
export type ViewerDisplayMode =
  | 'ballStick'
  | 'spacefill'
  | 'stick'
  | 'line'
  | 'cross'
  | 'toonish';

export type ViewerDisplaySettings = {
  mode: ViewerDisplayMode;
  showHydrogens: boolean;
};

export const DEFAULT_DISPLAY_SETTINGS: ViewerDisplaySettings = {
  mode: 'ballStick',
  showHydrogens: true,
};

export const DISPLAY_MODE_OPTIONS: Array<{
  id: ViewerDisplayMode;
  label: string;
  title: string;
}> = [
  {
    id: 'ballStick',
    label: 'Ball & stick',
    title: '3Dmol ball-and-stick: CPK spheres (vdW scale) and element-colored sticks',
  },
  {
    id: 'spacefill',
    label: 'Spacefill (CPK)',
    title: 'van der Waals spheres (Bondi radii; H smaller than C)',
  },
  {
    id: 'stick',
    label: 'Stick',
    title: 'Bonds as cylinders only',
  },
  {
    id: 'line',
    label: 'Line',
    title: 'Wireframe bonds',
  },
  {
    id: 'cross',
    label: 'Cross',
    title: 'Crosses at atom centers',
  },
  {
    id: 'toonish',
    label: 'Toon-ish',
    title: 'Thicker sticks, flat CPK colors, and black outline (cartoon cheat; lighting stays Phong)',
  },
];
