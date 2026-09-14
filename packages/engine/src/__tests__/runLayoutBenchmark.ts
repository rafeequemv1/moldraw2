/**
 * Offline native 2D layout benchmark — CI gate.
 * Run: npm run test:layout
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertLayoutBenchmarkGates,
  runLayoutBenchmark,
} from './layoutBenchmarkRunner';

const { rows, summary } = runLayoutBenchmark();

const reportPath = resolve(import.meta.dirname, 'layout-benchmark-report.json');
writeFileSync(
  reportPath,
  JSON.stringify({ generatedAt: new Date().toISOString(), summary, rows }, null, 2),
);

console.log('=== Native 2D layout benchmark ===\n');
console.log(
  `Total: ${summary.total}  PASS: ${summary.pass}  WARN: ${summary.warn}  FAIL: ${summary.fail}  SKIP: ${summary.skip}`,
);
console.log(
  `Tier A hard: ${summary.tierA.hardPass}/${summary.tierA.total} (${(summary.tierA.rate * 100).toFixed(1)}%)`,
);
console.log(
  `Tier B hard: ${summary.tierB.hardPass}/${summary.tierB.total} (${(summary.tierB.hardRate * 100).toFixed(1)}%)  soft: ${summary.tierB.softPass}/${summary.tierB.total}`,
);
console.log(
  `Tier C soft: ${summary.tierC.softPass}/${summary.tierC.total} (${(summary.tierC.softRate * 100).toFixed(1)}%)`,
);
console.log(`\nReport: ${reportPath}\n`);

const fails = rows.filter(r => r.status === 'FAIL');
if (fails.length > 0) {
  console.log('Failures:');
  for (const r of fails.slice(0, 20)) {
    console.log(
      `  ${r.name} [${r.tier}] overlaps=${r.overlaps} crossings=${r.crossings} ratio=${r.bondRatio.toFixed(2)}${r.note ? ` (${r.note})` : ''}`,
    );
  }
  if (fails.length > 20) console.log(`  ... and ${fails.length - 20} more`);
}

const gateErrors = assertLayoutBenchmarkGates(summary);
if (gateErrors.length > 0) {
  console.error('\nCI gate FAILED:');
  for (const e of gateErrors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log('\nCI gate PASSED.');
process.exit(0);
