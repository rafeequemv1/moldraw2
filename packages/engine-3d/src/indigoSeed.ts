/**
 * Optional Indigo 2D layout seed for 3D embed when depiction coords are missing.
 * Never statically import engine-2d here — keeps the 3D worker graph Indigo-free.
 * App may register a seed after Indigo loads (product path); worker leaves this null.
 */
import type { Molecule } from '@moldraw/domain';

export type Indigo2DSeedFn = (mol: Molecule) => Molecule | null;

let seedFn: Indigo2DSeedFn | null = null;

export function registerIndigo2DSeedFor3D(fn: Indigo2DSeedFn | null): void {
  seedFn = fn;
}

export function tryIndigo2DSeed(mol: Molecule): Molecule | null {
  try {
    return seedFn?.(mol) ?? null;
  } catch {
    return null;
  }
}
