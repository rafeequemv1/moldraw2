import { findCycles } from './assembleGraph';
import type { SketchGraph } from './types';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateSketchGraph(graph: SketchGraph): ValidationResult {
  const errors: string[] = [];
  const ids = new Set(graph.atoms.map(a => a.tempId));
  if (ids.size !== graph.atoms.length) errors.push('duplicate atom');

  const seenBonds = new Set<string>();
  for (const b of graph.bonds) {
    if (!ids.has(b.fromTempId) || !ids.has(b.toTempId)) errors.push('bond to nonexistent atom');
    if (b.fromTempId === b.toTempId) errors.push('self bond');
    if (b.order < 1 || b.order > 3) errors.push('invalid bond order');
    const key = [b.fromTempId, b.toTempId].sort().join('|');
    if (seenBonds.has(key)) errors.push('duplicate bond');
    seenBonds.add(key);
  }

  const snapped = new Map<string, string>();
  for (const a of graph.atoms) {
    if (!a.snappedTo) continue;
    if (snapped.has(a.snappedTo) && snapped.get(a.snappedTo) !== a.tempId) {
      errors.push('impossible duplicate atom');
    }
    snapped.set(a.snappedTo, a.tempId);
  }

  for (const a of graph.atoms) {
    if (a.charge && a.charge !== 0) {
      const bonded = graph.bonds.some(b => b.fromTempId === a.tempId || b.toTempId === a.tempId);
      if (!bonded && graph.atoms.length > 1) errors.push('isolated charge');
    }
  }

  const cycles = findCycles(graph);
  for (const c of cycles) {
    if (new Set(c).size !== c.length) errors.push('broken fused ring');
  }

  return { ok: errors.length === 0, errors };
}
