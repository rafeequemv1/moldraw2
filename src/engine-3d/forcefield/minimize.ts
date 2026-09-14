/**
 * Nonlinear conjugate-gradient minimizer (Polak–Ribière⁺) with a backtracking
 * Armijo line search, operating on a flat coordinate array against the UFF
 * energy/gradient. Deterministic and dependency-free.
 */
import { uffEnergyAndGradient, type UffTopology } from './uff';

export interface MinimizeOptions {
  maxIterations?: number;
  /** Stop when the RMS gradient falls below this (kcal/mol/Å). */
  gradTolerance?: number;
  /**
   * Per-atom mask (length = nAtoms). When set, frozen atoms keep their
   * coordinates; only movable atoms are updated. Gradients on frozen atoms
   * are zeroed so the line search only moves the dirty region.
   */
  movableMask?: boolean[];
}

export interface MinimizeResult {
  energy: number;
  iterations: number;
  converged: boolean;
}

const dot = (a: Float64Array, b: Float64Array): number => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

const applyMovableMask = (grad: Float64Array, movableMask?: boolean[]): void => {
  if (!movableMask) return;
  for (let a = 0; a < movableMask.length; a++) {
    if (movableMask[a]) continue;
    const o = a * 3;
    grad[o] = 0;
    grad[o + 1] = 0;
    grad[o + 2] = 0;
  }
};

export const minimizeUff = (
  topo: UffTopology,
  coords: Float64Array,
  opts: MinimizeOptions = {},
): MinimizeResult => {
  const maxIter = opts.maxIterations ?? 500;
  const gtol = opts.gradTolerance ?? 1e-3;
  const N = coords.length;
  const movableMask = opts.movableMask;
  const dof =
    movableMask && movableMask.length * 3 === N
      ? Math.max(3, movableMask.filter(Boolean).length * 3)
      : N;

  const grad = new Float64Array(N);
  const dir = new Float64Array(N);
  const prevGrad = new Float64Array(N);
  const trial = new Float64Array(N);

  let energy = uffEnergyAndGradient(topo, coords, grad, movableMask);
  applyMovableMask(grad, movableMask);
  for (let i = 0; i < N; i++) dir[i] = -grad[i];

  let iterations = 0;
  let converged = false;

  for (let iter = 0; iter < maxIter; iter++) {
    iterations = iter + 1;

    const gnorm = Math.sqrt(dot(grad, grad) / dof);
    if (gnorm < gtol) {
      converged = true;
      break;
    }

    // Backtracking Armijo line search along `dir`.
    const slope = dot(grad, dir);
    if (slope >= 0) {
      // Not a descent direction — reset to steepest descent.
      for (let i = 0; i < N; i++) dir[i] = -grad[i];
    }
    const dirSlope = dot(grad, dir);
    // Cap the initial step so the largest atomic move is ~maxDisp (Å). This is
    // essential when gradients are large (bad initial contacts), otherwise the
    // first trial overshoots and every backtrack fails.
    let dmax = 0;
    for (let i = 0; i < N; i++) dmax = Math.max(dmax, Math.abs(dir[i]));
    const maxDisp = 0.1;
    let step = maxDisp / Math.max(dmax, 1e-9);
    const c1 = 1e-4;
    let accepted = false;
    for (let ls = 0; ls < 30; ls++) {
      for (let i = 0; i < N; i++) trial[i] = coords[i] + step * dir[i];
      // Frozen atoms stay put even if dir leaked.
      if (movableMask) {
        for (let a = 0; a < movableMask.length; a++) {
          if (movableMask[a]) continue;
          const o = a * 3;
          trial[o] = coords[o];
          trial[o + 1] = coords[o + 1];
          trial[o + 2] = coords[o + 2];
        }
      }
      const newEnergy = uffEnergyAndGradient(topo, trial, null, movableMask);
      if (newEnergy <= energy + c1 * step * dirSlope) {
        accepted = true;
        break;
      }
      step *= 0.5;
    }
    if (!accepted) {
      // Could not make progress; treat as converged (local minimum reached).
      converged = true;
      break;
    }

    coords.set(trial);
    prevGrad.set(grad);
    energy = uffEnergyAndGradient(topo, coords, grad, movableMask);
    applyMovableMask(grad, movableMask);

    // Polak–Ribière⁺ beta.
    let num = 0;
    let den = 0;
    for (let i = 0; i < N; i++) {
      num += grad[i] * (grad[i] - prevGrad[i]);
      den += prevGrad[i] * prevGrad[i];
    }
    const beta = den > 1e-12 ? Math.max(0, num / den) : 0;
    for (let i = 0; i < N; i++) dir[i] = -grad[i] + beta * dir[i];
  }

  return { energy, iterations, converged };
};
