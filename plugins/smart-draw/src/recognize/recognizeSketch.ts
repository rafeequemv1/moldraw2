import { assembleGraph } from './assembleGraph';
import { detectGlyphs } from './detectGlyphs';
import { detectPrimitives } from './detectPrimitives';
import { estimateScale } from './estimateScale';
import { groupStrokes } from './groupStrokes';
import { applyGlyphClusters } from './resolveLabels';
import { resolveAmbiguities } from './resolveAmbiguities';
import { simplifyStroke } from './simplify';
import { snapToExisting } from './snap';
import { validateSketchGraph } from './validateSketchGraph';
import type { RecognizeInput, SketchGraph, Stroke } from './types';

export interface RecognizeResult {
  graph: SketchGraph;
  valid: boolean;
  errors: string[];
  rejectedStrokes: Stroke[];
}

export function recognizeSketch(input: RecognizeInput): RecognizeResult {
  const bondLengthPx = estimateScale(input.strokes, input.bondLengthPx);
  const simplified = input.strokes.map(s => simplifyStroke(s, bondLengthPx));
  const groups = groupStrokes(simplified, bondLengthPx);

  const merged: SketchGraph = {
    atoms: [],
    bonds: [],
    rejectedStrokes: [],
    confidence: 0,
    candidates: [],
  };
  const rejected: Stroke[] = [];

  for (const group of groups) {
    const glyphs = detectGlyphs(group, bondLengthPx);
    const prims = detectPrimitives(group, glyphs.used, bondLengthPx);
    const graph = assembleGraph(prims.primitives, bondLengthPx);
    const { graph: ambig, leftoverGlyphs } = resolveAmbiguities(
      graph,
      glyphs.glyphs,
      prims.primitives,
      bondLengthPx,
    );
    const resolved = applyGlyphClusters(ambig, leftoverGlyphs, bondLengthPx);
    resolved.candidates = [...glyphs.candidates, ...prims.candidates];

    const used = new Set<number>([
      ...glyphs.used,
      ...prims.primitives.map(p => p.strokeIndex),
    ]);
    group.forEach((s, i) => {
      if (!used.has(i)) rejected.push(s);
    });

    const idOffset = merged.atoms.length;
    const remap = (id: string) => {
      if (id.startsWith('g')) return `${id}_${idOffset}`;
      const n = Number(id.slice(1));
      return Number.isFinite(n) ? `t${n + idOffset}` : `${id}_${idOffset}`;
    };
    merged.atoms.push(
      ...resolved.atoms.map(a => ({ ...a, tempId: remap(a.tempId) })),
    );
    merged.bonds.push(
      ...resolved.bonds.map(b => ({
        ...b,
        fromTempId: remap(b.fromTempId),
        toTempId: remap(b.toTempId),
      })),
    );
    merged.candidates.push(...resolved.candidates);
  }

  const snapped = snapToExisting(merged, input.molecule.atoms, bondLengthPx);
  const scores = [
    ...snapped.atoms.map(a => a.confidence),
    ...snapped.bonds.map(b => b.confidence),
  ];
  snapped.confidence = scores.length ? scores.reduce((s, n) => s + n, 0) / scores.length : 0;
  snapped.rejectedStrokes = rejected;

  const validation = validateSketchGraph(snapped);
  return {
    graph: snapped,
    valid: validation.ok,
    errors: validation.errors,
    rejectedStrokes: rejected,
  };
}

export function shouldCommit(result: RecognizeResult): boolean {
  if (!result.valid) return false;
  const labeled = result.graph.atoms.some(
    a => a.element !== 'C' || (a.charge ?? 0) !== 0 || Boolean(a.alias),
  );
  return result.graph.bonds.length >= 1 || labeled;
}
