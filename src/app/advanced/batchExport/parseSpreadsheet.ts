import type { BatchTableRow } from './types';

function normHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, '_');
}

/** Split a CSV line respecting quoted fields (minimal RFC-style). */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && c === ',') {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += c;
  }
  out.push(cur.trim());
  return out;
}

export type ParsedTable = { rows: Omit<BatchTableRow, 'key' | 'selected' | 'status'>[]; warnings: string[] };

/**
 * Parse CSV or tab-separated text (e.g. pasted from Excel).
 * Expected columns (case-insensitive): `id` or `compound_id`, optional `name`, `smiles`.
 * If only two columns are present, they are treated as id, smiles.
 */
export function parseSpreadsheetText(text: string): ParsedTable {
  const warnings: string[] = [];
  const rawLines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);
  if (rawLines.length === 0) return { rows: [], warnings: ['No rows found.'] };

  const delim = rawLines[0].includes('\t') && !rawLines[0].includes(',') ? '\t' : ',';
  const splitLine = (line: string) =>
    delim === '\t' ? line.split('\t').map(c => c.trim()) : splitCsvLine(line);

  const headerCells = splitLine(rawLines[0]).map(normHeader);

  /** One compound name per line (SMILES filled later or via PubChem). */
  if (rawLines.length >= 2 && headerCells.length === 1) {
    const h0 = headerCells[0];
    if (h0 === 'compound_name') {
      const rows: ParsedTable['rows'] = [];
      for (let i = 1; i < rawLines.length; i++) {
        const name = rawLines[i]!.trim();
        if (!name) continue;
        rows.push({ id: `name-${i}`, name, smiles: '', message: undefined });
      }
      if (rows.length === 0) return { rows: [], warnings: ['No compound names after header.'] };
      return { rows, warnings: [] };
    }
  }
  const hasHeader =
    headerCells.some(h => h === 'smiles' || h === 'smi') ||
    (headerCells.length >= 2 &&
      (headerCells[0] === 'id' || headerCells[0].includes('compound')) &&
      headerCells[1] !== '');

  let idIdx = -1;
  let nameIdx = -1;
  let smilesIdx = -1;

  if (hasHeader) {
    headerCells.forEach((h, i) => {
      if (h === 'smiles' || h === 'smi' || h === 'canonical_smiles') smilesIdx = i;
      else if (h === 'name') nameIdx = i;
      else if (h === 'id' || h === 'compound_id' || h === 'cid') idIdx = i;
    });
    if (smilesIdx < 0) {
      if (headerCells.length >= 2) {
        idIdx = 0;
        smilesIdx = 1;
        warnings.push('No SMILES column header found; using first column as ID and second as SMILES.');
      } else warnings.push('Could not detect SMILES column.');
    }
    if (idIdx < 0 && smilesIdx >= 0) {
      idIdx = headerCells.findIndex((_, i) => i !== smilesIdx && i !== nameIdx);
      if (idIdx < 0) idIdx = 0;
    }
  }

  const dataLines = hasHeader ? rawLines.slice(1) : rawLines;
  const rows: ParsedTable['rows'] = [];

  for (const line of dataLines) {
    const cells = splitLine(line);
    if (cells.every(c => !c)) continue;

    let id: string;
    let name: string;
    let smiles: string;

    if (hasHeader && smilesIdx >= 0) {
      smiles = cells[smilesIdx] ?? '';
      id = (idIdx >= 0 ? cells[idIdx] : cells[0]) ?? 'compound';
      name = (nameIdx >= 0 ? cells[nameIdx] : '') ?? '';
    } else if (cells.length >= 2) {
      id = cells[0] || 'compound';
      name = '';
      smiles = cells[1] ?? '';
    } else {
      warnings.push(`Skipped line (need at least id + SMILES): ${line.slice(0, 80)}`);
      continue;
    }

    if (!smiles) {
      warnings.push(`Skipped row with empty SMILES for id "${id}".`);
      continue;
    }

    rows.push({ id: id || 'compound', name: name || id, smiles, message: undefined });
  }

  if (rows.length === 0 && warnings.length === 0) warnings.push('No valid data rows.');
  return { rows, warnings };
}

export function rowsToBatchState(parsed: ParsedTable['rows']): BatchTableRow[] {
  return parsed.map((r, i) => ({
    ...r,
    key: `row-${i}-${r.id}-${Math.random().toString(36).slice(2, 7)}`,
    selected: true,
    status: 'idle' as const,
  }));
}
