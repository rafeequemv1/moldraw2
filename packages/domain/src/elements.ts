/** Standard atomic weights for sketcher MW calculation. */
export const ATOMIC_MASS: Record<string, number> = {
  H: 1.008, He: 4.003, Li: 6.94, Be: 9.012, B: 10.811, C: 12.011, N: 14.007,
  O: 15.999, F: 18.998, Ne: 20.18, Na: 22.99, Mg: 24.305, Al: 26.982, Si: 28.086,
  P: 30.974, S: 32.06, Cl: 35.45, Ar: 39.948, K: 39.098, Ca: 40.078,
  Sc: 44.956, Ti: 47.867, V: 50.942, Cr: 51.996, Mn: 54.938, Fe: 55.845,
  Co: 58.933, Ni: 58.693, Cu: 63.546, Zn: 65.38, Ga: 69.723, Ge: 72.63,
  As: 74.922, Se: 78.971, Br: 79.904, Kr: 83.798, Rb: 85.468, Sr: 87.62,
  Y: 88.906, Zr: 91.224, Nb: 92.906, Mo: 95.95, Tc: 98, Ru: 101.07,
  Rh: 102.906, Pd: 106.42, Ag: 107.868, Cd: 112.414, In: 114.818, Sn: 118.71,
  Sb: 121.76, Te: 127.6, I: 126.904, Xe: 131.293, Cs: 132.905, Ba: 137.327,
  La: 138.905, Hf: 178.49, Ta: 180.948, W: 183.84, Re: 186.207, Os: 190.23,
  Ir: 192.217, Pt: 195.084, Au: 196.967, Hg: 200.592, Tl: 204.38, Pb: 207.2,
  Bi: 208.98, U: 238.029,
};

export type ElementPaletteEntry = { sym: string; color: string } | 'divider';

/** Label / palette colors by element symbol. */
export const ELEMENT_COLORS: Record<string, string> = {
  H: '#0f172a', C: '#0f172a', N: '#2563eb', O: '#dc2626', S: '#ca8a04',
  P: '#ea580c', F: '#65a30d', Cl: '#15803d', Br: '#92400e', I: '#7c3aed',
  B: '#f97316', Si: '#64748b', Se: '#a3e635',
  Li: '#c084fc', Na: '#a855f7', K: '#9333ea', Mg: '#94a3b8', Ca: '#78716c',
  Fe: '#b45309', Co: '#0369a1', Ni: '#0f766e', Cu: '#c2410c', Zn: '#64748b',
  Ru: '#57534e', Rh: '#78716c', Pd: '#525252', Ag: '#a3a3a3', Cd: '#71717a',
  Os: '#44403c', Ir: '#292524', Pt: '#71717a', Au: '#ca8a04', Hg: '#525252',
  Mn: '#a16207', Cr: '#1d4ed8', Mo: '#4338ca', W: '#312e81', Ti: '#6b7280',
  V: '#7c3aed', Al: '#64748b', Sn: '#78716c', Pb: '#57534e',
};

/** Compact floating palette: common organics, then P + halogens. */
export const QUICK_ELEMENT_PALETTE: ElementPaletteEntry[] = [
  { sym: 'H', color: ELEMENT_COLORS.H! },
  { sym: 'C', color: ELEMENT_COLORS.C! },
  { sym: 'N', color: ELEMENT_COLORS.N! },
  { sym: 'O', color: ELEMENT_COLORS.O! },
  { sym: 'S', color: ELEMENT_COLORS.S! },
  'divider',
  { sym: 'P', color: ELEMENT_COLORS.P! },
  { sym: 'F', color: ELEMENT_COLORS.F! },
  { sym: 'Cl', color: ELEMENT_COLORS.Cl! },
  { sym: 'Br', color: ELEMENT_COLORS.Br! },
  { sym: 'I', color: ELEMENT_COLORS.I! },
];

/**
 * @deprecated Prefer QUICK_ELEMENT_PALETTE + periodic table modal.
 * Kept as alias of the quick bar for older call sites.
 */
export const ELEMENT_PALETTE: ElementPaletteEntry[] = QUICK_ELEMENT_PALETTE;

/** One cell in the periodic-table grid (null = empty spacer). */
export type PeriodicTableCell =
  | { sym: string; z: number; color: string }
  | null;

/**
 * Standard periodic table layout (18 columns × 7 main rows + lanthanide/actinide notes omitted).
 * Row-major; `null` = blank.
 */
export const PERIODIC_TABLE_CELLS: readonly PeriodicTableCell[] = (() => {
  const cell = (sym: string, z: number): PeriodicTableCell => ({
    sym,
    z,
    color: ELEMENT_COLORS[sym] ?? '#334155',
  });
  // prettier-ignore
  return [
    cell('H',1), null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null, cell('He',2),
    cell('Li',3), cell('Be',4), null,null,null,null,null,null,null,null,null,null, cell('B',5), cell('C',6), cell('N',7), cell('O',8), cell('F',9), cell('Ne',10),
    cell('Na',11), cell('Mg',12), null,null,null,null,null,null,null,null,null,null, cell('Al',13), cell('Si',14), cell('P',15), cell('S',16), cell('Cl',17), cell('Ar',18),
    cell('K',19), cell('Ca',20), cell('Sc',21), cell('Ti',22), cell('V',23), cell('Cr',24), cell('Mn',25), cell('Fe',26), cell('Co',27), cell('Ni',28), cell('Cu',29), cell('Zn',30), cell('Ga',31), cell('Ge',32), cell('As',33), cell('Se',34), cell('Br',35), cell('Kr',36),
    cell('Rb',37), cell('Sr',38), cell('Y',39), cell('Zr',40), cell('Nb',41), cell('Mo',42), cell('Tc',43), cell('Ru',44), cell('Rh',45), cell('Pd',46), cell('Ag',47), cell('Cd',48), cell('In',49), cell('Sn',50), cell('Sb',51), cell('Te',52), cell('I',53), cell('Xe',54),
    cell('Cs',55), cell('Ba',56), cell('La',57), cell('Hf',72), cell('Ta',73), cell('W',74), cell('Re',75), cell('Os',76), cell('Ir',77), cell('Pt',78), cell('Au',79), cell('Hg',80), cell('Tl',81), cell('Pb',82), cell('Bi',83), null, null, null,
  ];
})();

export const PERIODIC_TABLE_COLUMNS = 18;
