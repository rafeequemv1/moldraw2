/**
 * Offline layout benchmark runner — native generate2D + cleanupStructure gates.
 */
import type { Molecule } from '@moldraw/domain';
import { nativeEngine as engine } from '../nativeEngine';
import { cleanupStructure } from '../layout/cleanupStructure';
import { certifyLayout } from '../layout/certifyLayout';
import { generate2D } from '../layout/generate2d';
import {
  isChemDrawReady,
  measureLayoutQuality,
  passesHardGate,
  passesSoftGate,
} from '../layout/layoutQuality';
import {
  LAYOUT_BENCHMARK_CASES,
  type LayoutBenchmarkCase,
  type LayoutBenchmarkTier,
} from './layoutBenchmarkCases';

const BOND = 45;

export interface LayoutBenchmarkRow {
  name: string;
  tier: LayoutBenchmarkTier;
  status: 'PASS' | 'WARN' | 'FAIL' | 'SKIP';
  hardGate: boolean;
  softGate: boolean;
  chemDrawReady: boolean;
  overlaps: number;
  crossings: number;
  bondRatio: number;
  ms: number;
  note?: string;
}

export interface LayoutBenchmarkSummary {
  total: number;
  pass: number;
  warn: number;
  fail: number;
  skip: number;
  tierA: { total: number; hardPass: number; rate: number };
  tierB: { total: number; hardPass: number; softPass: number; hardRate: number; softRate: number };
  tierC: { total: number; softPass: number; softRate: number };
}

const layoutNative = (mol: Molecule, tier: LayoutBenchmarkTier): Molecule => {
  const bondOpts = { bondLengthPx: BOND, skipEnergyRefine: true };
  const seed = generate2D(mol, bondOpts);
  if (tier === 'A') {
    return certifyLayout(seed, { bondLengthPx: BOND, maxRestarts: 2, repairRounds: 3 }).molecule;
  }
  const maxRestarts = tier === 'B' ? 5 : 6;
  const cleaned = cleanupStructure(seed, { bondLengthPx: BOND, maxRestarts });
  return cleaned;
};

export const runLayoutBenchmarkCase = (c: LayoutBenchmarkCase): LayoutBenchmarkRow => {
  const t0 = Date.now();
  try {
    const parsed = engine.parseSmiles(c.smiles);
    if (parsed.atoms.length === 0) {
      return {
        name: c.name,
        tier: c.tier,
        status: 'SKIP',
        hardGate: false,
        softGate: false,
        chemDrawReady: false,
        overlaps: 0,
        crossings: 0,
        bondRatio: 1,
        ms: Date.now() - t0,
        note: 'empty parse',
      };
    }
    const laid = layoutNative(parsed, c.tier);
    const q = measureLayoutQuality(laid);
    const hardGate = passesHardGate(laid, c.tier === 'A' ? 'A' : 'default');
    const softGate = passesSoftGate(laid);
    const chemDrawReady = isChemDrawReady(laid);

    let status: LayoutBenchmarkRow['status'] = 'FAIL';
    if (c.tier === 'A') {
      status = hardGate ? 'PASS' : chemDrawReady ? 'WARN' : 'FAIL';
    } else if (c.tier === 'B') {
      status = hardGate ? 'PASS' : softGate ? 'WARN' : 'FAIL';
    } else {
      status = softGate ? 'PASS' : chemDrawReady ? 'WARN' : 'FAIL';
    }

    return {
      name: c.name,
      tier: c.tier,
      status,
      hardGate,
      softGate,
      chemDrawReady,
      overlaps: q.overlaps,
      crossings: q.crossings,
      bondRatio: q.bondRatio,
      ms: Date.now() - t0,
    };
  } catch (err) {
    return {
      name: c.name,
      tier: c.tier,
      status: 'FAIL',
      hardGate: false,
      softGate: false,
      chemDrawReady: false,
      overlaps: 0,
      crossings: 0,
      bondRatio: 1,
      ms: Date.now() - t0,
      note: String(err),
    };
  }
};

export const runLayoutBenchmark = (
  cases: LayoutBenchmarkCase[] = LAYOUT_BENCHMARK_CASES,
): { rows: LayoutBenchmarkRow[]; summary: LayoutBenchmarkSummary } => {
  const rows = cases.map(runLayoutBenchmarkCase);
  const tierA = rows.filter(r => r.tier === 'A');
  const tierB = rows.filter(r => r.tier === 'B');
  const tierC = rows.filter(r => r.tier === 'C');
  const countHard = (list: LayoutBenchmarkRow[]) => list.filter(r => r.hardGate).length;
  const countSoft = (list: LayoutBenchmarkRow[]) => list.filter(r => r.softGate).length;

  const summary: LayoutBenchmarkSummary = {
    total: rows.length,
    pass: rows.filter(r => r.status === 'PASS').length,
    warn: rows.filter(r => r.status === 'WARN').length,
    fail: rows.filter(r => r.status === 'FAIL').length,
    skip: rows.filter(r => r.status === 'SKIP').length,
    tierA: {
      total: tierA.length,
      hardPass: countHard(tierA),
      rate: tierA.length ? countHard(tierA) / tierA.length : 1,
    },
    tierB: {
      total: tierB.length,
      hardPass: countHard(tierB),
      softPass: countSoft(tierB),
      hardRate: tierB.length ? countHard(tierB) / tierB.length : 1,
      softRate: tierB.length ? countSoft(tierB) / tierB.length : 1,
    },
    tierC: {
      total: tierC.length,
      softPass: countSoft(tierC),
      softRate: tierC.length ? countSoft(tierC) / tierC.length : 1,
    },
  };
  return { rows, summary };
};

/** CI gate thresholds — baseline enforced; stretch targets in documentation/engine/2d-layout.md */
export const assertLayoutBenchmarkGates = (summary: LayoutBenchmarkSummary): string[] => {
  const errors: string[] = [];
  if (summary.tierA.rate < 0.95) {
    errors.push(`Tier A hard-gate pass rate ${(summary.tierA.rate * 100).toFixed(1)}% < 95%`);
  }
  // Baseline: ≥85% soft on fused (stretch target: 100% soft or 85% hard).
  if (summary.tierB.hardRate < 0.85 && summary.tierB.softRate < 0.85) {
    errors.push(
      `Tier B: hard ${(summary.tierB.hardRate * 100).toFixed(1)}% and soft ${(summary.tierB.softRate * 100).toFixed(1)}% both below 85% baseline`,
    );
  }
  // Baseline: ≥40% soft on polycyclic monsters (stretch target: 70%).
  if (summary.tierC.softRate < 0.4) {
    errors.push(`Tier C soft-gate pass rate ${(summary.tierC.softRate * 100).toFixed(1)}% < 40% baseline`);
  }
  return errors;
};
