/**
 * 3D packing primitives for COFs.
 *
 * Layered 2D sheets (COF-1 / COF-5) use a stacking axis `c`.
 * Future 3D nets (dia, ctn, bor, …) register a `CofNetworkPacker` that
 * emits the same `{ dx, dy, dz }` sites from a unit cell — generate.ts
 * and the D slider stay unchanged.
 */
import type { Atom, Bond } from '@moldraw/domain';

/** Layered 2D nets today; add `dia` / `ctn` / … when 3D nets land. */
export type CofTopologyId = 'hexagonal-honeycomb' | 'square-grid';

export type CofDimensionality = 'layered' | 'network3d';

/** Named stacking for 2D layered COFs. */
export type CofLayerStackMode = 'aa-eclipsed' | 'ab-slipped';

export type CofStackingSpec = {
  mode: CofLayerStackMode;
  /**
   * Interlayer distance as a multiple of the canvas bond length.
   * Default ~3.4 Å / 1.4 Å (typical π-stack).
   */
  interlayerBondRatio?: number;
};

export type CofPackSite3D = {
  dx: number;
  dy: number;
  dz: number;
};

export type CofSheet = {
  atoms: Atom[];
  bonds: Bond[];
  atomIds: string[];
};

/**
 * Future 3D nets implement this instead of `layeredPackSites`.
 * `extent` is cells along a, b, c (mapped from H / V / D sliders).
 */
export type CofNetworkPacker = (args: {
  extent: { a: number; b: number; c: number };
  bondLength: number;
}) => CofPackSite3D[];
