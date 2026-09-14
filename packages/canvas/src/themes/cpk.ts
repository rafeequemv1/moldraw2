/** Jmol / classic CPK element colors for the Simple ball-and-stick theme. */
const CPK: Record<string, string> = {
  H: '#ffffff',
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
  Si: '#e6c8a0',
  Se: '#ffa100',
  Li: '#cc80ff',
  Na: '#ab5cf2',
  K: '#8f40d4',
  Mg: '#8aff00',
  Ca: '#3dff00',
  Fe: '#e06633',
  Co: '#f090a0',
  Ni: '#50d050',
  Cu: '#c88033',
  Zn: '#7d80b0',
};

const FALLBACK = '#c8c8c8';

export function cpkColorForElement(element: string): string {
  const key = element.trim();
  if (!key) return FALLBACK;
  return CPK[key] ?? CPK[key.charAt(0).toUpperCase() + key.slice(1).toLowerCase()] ?? FALLBACK;
}
