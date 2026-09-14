/**
 * Indigo `automap` — atom-atom mapping on reactions (reactant ↔ product).
 *
 * Modes: discard | keep | alter | clear (Ketcher / Indigo).
 * Output is typically an RXN file; map numbers live in the V2000 atom-map column.
 */
import type { IndigoKetcher } from './types';
import { getIndigoOrNull, loadIndigo } from './loadIndigo';
import { makeIndigoOptions } from './options';

export type AutomapMode = 'discard' | 'keep' | 'alter' | 'clear';

export interface AutomapResult {
  /** Mapped RXN / molfile text from Indigo. */
  rxnfile: string;
  /**
   * Atom-map numbers in molecule order across all `$MOL` blocks
   * (reactants first, then products). 0 = unmapped.
   */
  maps: number[];
  /** Per `$MOL` block: map arrays in atom order. */
  mapsByComponent: number[][];
}

/** Read V2000 atom-atom mapping number (columns 61–63, or spaced token). */
export const readAtomMapFromAtomLine = (line: string): number => {
  if (line.length >= 63) {
    const fixed = parseInt(line.substring(60, 63).trim() || '0', 10);
    if (Number.isFinite(fixed) && fixed > 0) return fixed;
  }
  const parts = line.trim().split(/\s+/);
  // element at [3], then 9 ints, map at [13]
  if (parts.length > 13 && /^[A-Za-z*]{1,3}$/.test(parts[3]!)) {
    const m = parseInt(parts[13]!, 10);
    if (Number.isFinite(m) && m > 0) return m;
  }
  return 0;
};

/** Extract atom-map columns from each `$MOL` / V2000 block in an RXN or molfile. */
export const parseAtomMapsFromRxnOrMol = (text: string): {
  maps: number[];
  mapsByComponent: number[][];
} => {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const mapsByComponent: number[][] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (line.startsWith('$MOL') || (i === 0 && !text.includes('$RXN'))) {
      // Find counts line (V2000)
      let j = line.startsWith('$MOL') ? i + 1 : i;
      let countsIdx = -1;
      for (; j < Math.min(lines.length, i + 8); j++) {
        if ((lines[j] ?? '').includes('V2000') || (lines[j] ?? '').includes('V3000')) {
          countsIdx = j;
          break;
        }
      }
      if (countsIdx < 0) {
        i += 1;
        continue;
      }
      const counts = lines[countsIdx] ?? '';
      const numAtoms = parseInt(counts.substring(0, 3).trim() || '0', 10);
      const componentMaps: number[] = [];
      for (let a = 0; a < numAtoms; a++) {
        const atomLine = lines[countsIdx + 1 + a] ?? '';
        componentMaps.push(readAtomMapFromAtomLine(atomLine));
      }
      mapsByComponent.push(componentMaps);
      i = countsIdx + 1 + numAtoms;
      continue;
    }
    i += 1;
  }
  return {
    maps: mapsByComponent.flat(),
    mapsByComponent,
  };
};

export const indigoAutomap = (
  input: string,
  indigo: IndigoKetcher,
  mode: AutomapMode = 'discard',
): AutomapResult | null => {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const opts = makeIndigoOptions(indigo);
  try {
    const out = indigo.automap(trimmed, mode, 'rxnfile', opts);
    if (typeof out !== 'string' || !out.trim()) return null;
    const parsed = parseAtomMapsFromRxnOrMol(out);
    return { rxnfile: out, maps: parsed.maps, mapsByComponent: parsed.mapsByComponent };
  } catch (err) {
    console.warn('[indigo] automap failed', err);
    return null;
  }
};

export const tryIndigoAutomap = async (
  input: string,
  mode: AutomapMode = 'discard',
): Promise<AutomapResult | null> => {
  const indigo = getIndigoOrNull() ?? (await loadIndigo());
  if (!indigo) return null;
  return indigoAutomap(input, indigo, mode);
};

/** Build a minimal RXN from reactant + product molblocks (no agents). */
export const buildRxnFromMolblocks = (reactMolBlock: string, prodMolBlock: string): string => {
  const stripHeader = (mb: string) => {
    const t = mb.trim();
    return t.endsWith('\n') ? t : `${t}\n`;
  };
  return `$RXN

  Moldraw

  1  1
$MOL
${stripHeader(reactMolBlock)}$MOL
${stripHeader(prodMolBlock)}`;
};
