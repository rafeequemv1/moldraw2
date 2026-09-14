/** Atom representation modes for the 3Dmol viewer. */
export type ViewerDisplayMode =
  | 'ballStick'
  | 'spacefill'
  | 'stick'
  | 'line'
  | 'cross';

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
    title: 'Element-colored sticks with compact spheres',
  },
  {
    id: 'spacefill',
    label: 'Spacefill (CPK)',
    title: 'van der Waals spheres (CPK / spacefill)',
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
];
