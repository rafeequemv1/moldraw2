/** Standard atomic weights for organic sketcher MW calculation. */
export const ATOMIC_MASS: Record<string, number> = {
  H: 1.008, B: 10.811, C: 12.011, N: 14.007, O: 15.999, F: 18.998,
  Na: 22.990, Mg: 24.305, Si: 28.086, P: 30.974, S: 32.06, Cl: 35.45,
  K: 39.098, Ca: 40.078, Se: 78.971, Br: 79.904, I: 126.904,
};

export type ElementPaletteEntry = { sym: string; color: string } | 'divider';

/** Main organic palette (order + colors match common sketchers). */
export const ELEMENT_PALETTE: ElementPaletteEntry[] = [
  { sym: 'H', color: '#0f172a' },
  { sym: 'C', color: '#0f172a' },
  { sym: 'N', color: '#2563eb' },
  { sym: 'O', color: '#dc2626' },
  { sym: 'S', color: '#ca8a04' },
  'divider',
  { sym: 'P', color: '#ea580c' },
  { sym: 'F', color: '#65a30d' },
  { sym: 'Cl', color: '#15803d' },
  { sym: 'Br', color: '#92400e' },
  { sym: 'I', color: '#7c3aed' },
];
