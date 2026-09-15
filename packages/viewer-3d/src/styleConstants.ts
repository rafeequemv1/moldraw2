import { covalentRadius, vdwRadius } from '@moldraw/core';

/**
 * Ball-and-stick / stick radii scale from Bondi vdW (spacefill) and Cordero
 * covalent radii (ball-stick spheres + sticks) relative to carbon so H, O, N,
 * halogens, and metals stay proportionally correct in 3D.
 */
export const CARBON_VDW_A = vdwRadius('C');
export const CARBON_COVALENT_A = covalentRadius('C');
/** Ball-and-stick sphere for carbon (Å); other elements scale by covalent/C. */
export const CARBON_SPHERE_RADIUS = 0.55;
/** Classic 3Dmol ball-and-stick: sphere.scale × Bondi vdW (not custom cylinders). */
export const MOL3D_BALLSTICK_SPHERE_SCALE = 0.3;
export const MOL3D_BALLSTICK_STICK_RADIUS = 0.16;
export const SELECTED_SPHERE_SCALE = 1.25;
export const STICK_RADIUS = 0.11;
export const SELECTED_STICK_RADIUS = 0.19;
/** Thicker sticks for the Toon-ish display cheat. */
export const TOONISH_STICK_RADIUS = 0.18;
export const TOONISH_SELECTED_STICK_RADIUS = 0.24;
export const TOONISH_SPHERE_SCALE = 1.18;
/**
 * Whitish H on the light (#f8fafc) viewer background — pale enough to read as
 * hydrogen, slightly cooler than pure white so spheres stay visible.
 */
export const HYDROGEN_COLOR = '#e8eef5';

/**
 * Saturated Jmol/CPK-ish hex colors for Toon-ish mode (solid fills; outline
 * does the cartoon work — 3Dmol still uses Phong lighting).
 */
export const TOONISH_ELEMENT_COLORS: Record<string, string> = {
  H: '#e8eef5',
  C: '#333333',
  N: '#3050f8',
  O: '#ff0d0d',
  F: '#90e050',
  Cl: '#1ff01f',
  Br: '#a62929',
  I: '#940094',
  S: '#ffff30',
  P: '#ff8000',
  B: '#ffb5b5',
  Si: '#f0c8a0',
  Se: '#ffa100',
  Fe: '#e06633',
  Cu: '#c88033',
  Zn: '#7d80b0',
  Na: '#ab5cf2',
  K: '#8f40d4',
  Mg: '#8aff00',
  Ca: '#3dff00',
  Li: '#cc80ff',
  Al: '#bfa6a6',
};

/** Ball-and-stick sphere (Å) — covalent radii so H ≈ 41% of C (not 71% vdW). */
export const ballStickSphereRadius = (elem: string): number =>
  (covalentRadius(elem) / CARBON_COVALENT_A) * CARBON_SPHERE_RADIUS;

/** Stick cylinder radius (Å) scaled by covalent radius — H ≈ 0.045, C = 0.11. */
export const ballStickStickRadius = (elem: string): number =>
  (covalentRadius(elem) / CARBON_COVALENT_A) * STICK_RADIUS;

/** Jmol/CPK hex so custom stick cylinders match 3Dmol's default sphere colors. */
const JMOL_ELEMENT_COLORS: Record<string, string> = {
  H: HYDROGEN_COLOR,
  C: '#909090',
  N: '#3050f8',
  O: '#ff0d0d',
  F: '#90e050',
  Cl: '#1ff01f',
  Br: '#a62929',
  I: '#940094',
  S: '#ffff30',
  P: '#ff8000',
  B: '#ffb5b5',
  Si: '#daa520',
  Se: '#ffa100',
  Fe: '#e06633',
  Cu: '#c88033',
  Zn: '#7d80b0',
  Na: '#ab5cf2',
  K: '#8f40d4',
  Mg: '#8aff00',
  Ca: '#3dff00',
  Li: '#cc80ff',
  Al: '#bfa6a6',
};

export const jmolElementColor = (elem: string): string =>
  JMOL_ELEMENT_COLORS[elem] ?? '#909090';

/**
 * Fallback 3Dmol stick spec when `addCylinder` is unavailable.
 * Prefer `drawStickCylinders` — native doubles are gappy (offset 1.5×radius).
 */
export const molStickStyle = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  radius: STICK_RADIUS,
  singleBonds: false,
  doubleBondScaling: 0.82,
  tripleBondScaling: 0.55,
  ...extra,
});


export const toonishSphereRadius = (elem: string): number =>
  ballStickSphereRadius(elem) * TOONISH_SPHERE_SCALE;

export const toonishStickRadius = (elem: string): number =>
  (covalentRadius(elem) / CARBON_COVALENT_A) * TOONISH_STICK_RADIUS;

/** Cross / wireframe marker size (Å) scaled by vdW. */
export const crossMarkerRadius = (elem: string): number =>
  (vdwRadius(elem) / CARBON_VDW_A) * 0.35;

/** Full CPK / spacefill sphere radius in Å (Bondi vdW). */
export const spacefillSphereRadius = (elem: string): number => vdwRadius(elem);

export const toonishColorForElement = (elem: string): string | undefined =>
  TOONISH_ELEMENT_COLORS[elem];
