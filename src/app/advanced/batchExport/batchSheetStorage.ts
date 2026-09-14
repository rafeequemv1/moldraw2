import type { BatchTableRow } from './types';

const STORAGE_KEY = 'moldraw-batch-sheet-v1';

export type StoredBatchRow = {
  id: string;
  name: string;
  smiles: string;
  selected: boolean;
  status: BatchTableRow['status'];
  message?: string;
  molblock2d?: string;
  molblock3d?: string;
};

function isRowEmpty(r: { id: string; name: string; smiles: string }) {
  return !r.id.trim() && !r.name.trim() && !r.smiles.trim();
}

export function batchRowsToStored(rows: BatchTableRow[]): StoredBatchRow[] {
  return rows
    .filter(r => !isRowEmpty(r))
    .map(({ key: _k, ...rest }) => rest);
}

export function storedToBatchRows(stored: StoredBatchRow[]): Omit<BatchTableRow, 'key'>[] {
  return stored.map(r => ({ ...r, key: '' }));
}

export function loadBatchSheetFromBrowser(): StoredBatchRow[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed as StoredBatchRow[];
  } catch {
    return null;
  }
}

export function saveBatchSheetToBrowser(rows: BatchTableRow[]): void {
  try {
    const data = batchRowsToStored(rows);
    if (data.length === 0) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // quota or private mode
  }
}
