/**
 * Global 3Dmol view effects (outline / AO). Used by Toon-ish display mode.
 */

type MolViewerWithViewStyle = {
  setViewStyle?: (params: {
    style?: string;
    color?: string | number;
    width?: number;
    maxpixels?: number;
  }) => void;
};

/** Enable or clear the black silhouette outline (no-op if API missing). */
export const applyOutlineViewStyle = (
  viewer: MolViewerWithViewStyle,
  enabled: boolean,
): void => {
  if (typeof viewer.setViewStyle !== 'function') return;
  if (enabled) {
    viewer.setViewStyle({
      style: 'outline',
      color: 'black',
      width: 0.08,
      maxpixels: 3,
    });
  } else {
    viewer.setViewStyle({ style: 'none' });
  }
};
