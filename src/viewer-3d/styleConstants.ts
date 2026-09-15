import { vdwRadius } from '@moldraw/core/chemistry/atomicData';

/**
 * Ball-and-stick sphere size: carbon is slightly compact; every other element
 * scales by its Bondi vdW radius relative to carbon so proportions stay accurate.
 */
export const CARBON_VDW_A = vdwRadius('C');
export const CARBON_SPHERE_RADIUS = 0.48;
export const SELECTED_SPHERE_SCALE = 1.25;
export const STICK_RADIUS = 0.11;
export const SELECTED_STICK_RADIUS = 0.19;
/**
 * Whitish H on the light (#f8fafc) viewer background — pale enough to read as
 * hydrogen, slightly cooler than pure white so spheres stay visible.
 */
export const HYDROGEN_COLOR = '#e8eef5';

export const ballStickSphereRadius = (elem: string): number =>
  (vdwRadius(elem) / CARBON_VDW_A) * CARBON_SPHERE_RADIUS;

/** Full CPK / spacefill sphere radius in Å (Bondi vdW). */
export const spacefillSphereRadius = (elem: string): number => vdwRadius(elem);
