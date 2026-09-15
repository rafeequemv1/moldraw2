/**
 * Batch SMILES / spreadsheet → 3D (local engine worker) → .xyz export.
 * Lives under `app/advanced` with parsing helpers in `./batchExport/`.
 */
import React, { forwardRef, useCallback, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { Eye, FileSpreadsheet, Loader2, Download, FlaskConical, Table, Wand2, X } from 'lucide-react';
import type { BatchPipelineResult, BatchTableRow } from './batchExport/types';
import {
  loadBatchSheetFromBrowser,
  molblock3dToXyz,
  parseSpreadsheetText,
  pubchemMolblockFromSmiles,
  resolveCompoundNameFromPubChem,
  rowsToBatchState,
  saveBatchSheetToBrowser,
} from './batchExport';

export type BatchAppendRowInput = { id: string; name: string; smiles: string };

export type BatchStructuresHandle = {
  /** Append data rows to the sheet (e.g. from PubChem search), then pad with empty rows. */
  appendRows: (rows: BatchAppendRowInput[]) => void;
};

export type BatchStructuresPanelProps = {
  /** SMILES → 2D (PubChem optional) → 3D via local engine worker; returns both molblocks. */
  runBatchPipeline: (
    smiles: string,
    includeHydrogens: boolean,
    preferPubChem2d: boolean,
    preferPubChem3d: boolean,
  ) => Promise<BatchPipelineResult>;
  /** Optional: place 2D structure on canvas (same as PubChem import). */
  onImportMolblockToCanvas?: (molblock2d: string, displayName: string) => void | Promise<void>;
  /** Place many prepared 2D molblocks as a labeled viewport grid. */
  onImportMolblocksToCanvas?: (
    items: Array<{ molblock: string; displayName: string }>,
  ) => void | Promise<void>;
  /**
   * Replace or extend the paste textarea and re-parse into the grid (keeps sheet and input in sync).
   * Parent clears via `onPendingBulkTextConsumed` after apply.
   */
  pendingBulkText?: { nonce: number; text: string; append: boolean } | null;
  onPendingBulkTextConsumed?: () => void;
  /** Return false to cancel a file download (e.g. show signup). */
  onBeforeDownload?: () => boolean;
};

const PAD_EMPTY_ROWS = 8;

function initRowsFromBrowser(): BatchTableRow[] {
  const stored = loadBatchSheetFromBrowser();
  if (!stored?.length) return makeBlankRows(PAD_EMPTY_ROWS);
  const stamp = Date.now();
  return [
    ...stored.map((r, i) => ({
      key: `saved-${stamp}-${i}`,
      id: r.id,
      name: r.name,
      smiles: r.smiles,
      selected: r.selected,
      status: r.status,
      message: r.message,
      molblock2d: r.molblock2d,
      molblock3d: r.molblock3d,
    })),
    ...makeBlankRows(PAD_EMPTY_ROWS),
  ];
}

/** Resolve SMILES from row or PubChem by name (rate-limited in resolver). */
async function resolveSmilesForRow(
  row: BatchTableRow,
): Promise<{ smiles: string; id: string } | null> {
  const existing = row.smiles.trim();
  if (existing) return { smiles: existing, id: row.id };
  if (!row.name.trim()) return null;
  const hit = await resolveCompoundNameFromPubChem(row.name);
  if (!hit) return null;
  const id =
    !row.id.trim() || /^name-\d+$/i.test(row.id.trim()) ? `CID-${hit.cid}` : row.id;
  return { smiles: hit.smiles, id };
}

function newKey(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function makeBlankRow(): BatchTableRow {
  return {
    key: newKey('blank'),
    id: '',
    name: '',
    smiles: '',
    selected: false,
    status: 'idle',
  };
}

function makeBlankRows(n: number): BatchTableRow[] {
  return Array.from({ length: n }, () => makeBlankRow());
}

function isRowEmpty(r: BatchTableRow) {
  return !r.id.trim() && !r.name.trim() && !r.smiles.trim();
}

/** Drop consecutive empty rows from the end (keeps at least one blank row if sheet was only blanks). */
function trimTrailingEmpty(rows: BatchTableRow[]): BatchTableRow[] {
  const out = [...rows];
  while (out.length > 1 && isRowEmpty(out[out.length - 1]!)) {
    out.pop();
  }
  return out;
}

function sanitizeFilename(s: string): string {
  const t = (s || 'structure').replace(/[/\\:*?"<>|#\s]+/g, '_').trim();
  return t.slice(0, 80) || 'structure';
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function molblock3dToSdf(molblock3d: string): string {
  const trimmed = molblock3d.trimEnd();
  return `${trimmed.endsWith('$$$$') ? trimmed : `${trimmed}\n$$$$`}\n`;
}

function csvEscapeField(s: string): string {
  const v = String(s ?? '');
  if (/[",\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

const cellInputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  border: 'none',
  outline: 'none',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontSize: 11,
  padding: '6px 8px',
  background: 'transparent',
};

const sheetBorder = 'var(--chrome-border)';
const headerBg = 'var(--chrome-bg)';

type CsvExportColumn = 'id' | 'name' | 'smiles' | 'status' | 'message';
type PreviewFormat = 'xyz' | 'sdf';

const CSV_COLUMN_LABELS: Record<CsvExportColumn, string> = {
  id: 'ID',
  name: 'Name',
  smiles: 'SMILES',
  status: 'Status',
  message: 'Message',
};

function rowDedupeKey(r: { id: string; name: string; smiles: string }): string {
  const smi = r.smiles.trim().toLowerCase();
  if (smi) return `smi:${smi}`;
  const id = r.id.trim();
  if (id && !/^name-\d+$/i.test(id)) return `id:${id.toLowerCase()}`;
  const name = r.name.trim().toLowerCase();
  if (name) return `name:${name}`;
  return '';
}

function filterNewRows(
  existing: BatchTableRow[],
  incoming: Omit<BatchTableRow, 'key' | 'selected' | 'status'>[],
): Omit<BatchTableRow, 'key' | 'selected' | 'status'>[] {
  const seen = new Set(
    existing.filter(r => !isRowEmpty(r)).map(r => rowDedupeKey(r)).filter(Boolean),
  );
  return incoming.filter(r => {
    const k = rowDedupeKey(r);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export const BatchStructuresPanel = forwardRef<BatchStructuresHandle, BatchStructuresPanelProps>(
  function BatchStructuresPanel(
    {
      runBatchPipeline,
      onImportMolblockToCanvas,
      onImportMolblocksToCanvas,
      pendingBulkText = null,
      onPendingBulkTextConsumed,
      onBeforeDownload,
    },
    ref,
  ) {
    const [pasteText, setPasteText] = useState('');
    const [rows, setRows] = useState<BatchTableRow[]>(initRowsFromBrowser);
    const [parseWarnings, setParseWarnings] = useState<string[]>([]);
    const [includeH, setIncludeH] = useState(true);
    const [preferPubChem2d, setPreferPubChem2d] = useState(true);
    const [preferPubChem3d, setPreferPubChem3d] = useState(true);
    const [busy, setBusy] = useState(false);
    const [batchPhase, setBatchPhase] = useState<'pubchem' | 'convert' | null>(null);
    const [preview, setPreview] = useState<{ row: BatchTableRow; format: PreviewFormat } | null>(null);
    const [csvExportColumns, setCsvExportColumns] = useState<Record<CsvExportColumn, boolean>>({
      id: true,
      name: true,
      smiles: true,
      status: true,
      message: false,
    });
    const fileRef = useRef<HTMLInputElement>(null);
    const processedBulkTextNonceRef = useRef(0);
    const rowsRef = useRef(rows);
    rowsRef.current = rows;

    const commitRows = useCallback((updater: (prev: BatchTableRow[]) => BatchTableRow[]) => {
      setRows(prev => {
        const next = updater(prev);
        rowsRef.current = next;
        saveBatchSheetToBrowser(next);
        return next;
      });
    }, []);

    const updateRow = useCallback(
      (key: string, patch: Partial<BatchTableRow>) => {
        commitRows(prev => prev.map(r => (r.key === key ? { ...r, ...patch } : r)));
      },
      [commitRows],
    );

    const appendRowsImpl = useCallback(
      (incoming: BatchAppendRowInput[]) => {
        if (incoming.length === 0) return;
        commitRows(prev => {
          const base = trimTrailingEmpty(prev);
          const unique = filterNewRows(base, incoming);
          if (unique.length === 0) return prev;
          const stamp = Date.now();
          const appended: BatchTableRow[] = unique.map((r, i) => ({
            key: `pubchem-${stamp}-${i}`,
            id: r.id || `row-${i + 1}`,
            name: r.name || r.id,
            smiles: r.smiles.trim(),
            selected: true,
            status: 'idle' as const,
          }));
          return [...base, ...appended, ...makeBlankRows(PAD_EMPTY_ROWS)];
        });
      },
      [commitRows],
    );

    useImperativeHandle(
      ref,
      () => ({
        appendRows: (incoming: BatchAppendRowInput[]) => appendRowsImpl(incoming),
      }),
      [appendRowsImpl],
    );

    const ingestParsedText = useCallback(
      (text: string, mode: 'replace' | 'append') => {
        const { rows: parsed, warnings } = parseSpreadsheetText(text);
        setParseWarnings(warnings);
        if (parsed.length === 0) return;
        if (mode === 'append') {
          commitRows(prev => {
            const base = trimTrailingEmpty(prev);
            const unique = filterNewRows(base, parsed);
            if (unique.length === 0) return prev;
            return [...base, ...rowsToBatchState(unique), ...makeBlankRows(PAD_EMPTY_ROWS)];
          });
        } else {
          commitRows(() => [...rowsToBatchState(parsed), ...makeBlankRows(PAD_EMPTY_ROWS)]);
        }
      },
      [commitRows],
    );

    const loadParsed = useCallback(
      (text: string) => ingestParsedText(text, 'replace'),
      [ingestParsedText],
    );

    useLayoutEffect(() => {
      if (!pendingBulkText?.text.trim()) return;
      if (pendingBulkText.nonce <= processedBulkTextNonceRef.current) return;
      processedBulkTextNonceRef.current = pendingBulkText.nonce;
      const incoming = pendingBulkText.text.trim();
      setPasteText(prev =>
        pendingBulkText.append && prev.trim() ? `${prev.trim()}\n${incoming}` : incoming,
      );
      queueMicrotask(() => {
        ingestParsedText(incoming, pendingBulkText.append ? 'append' : 'replace');
        onPendingBulkTextConsumed?.();
      });
    }, [pendingBulkText, ingestParsedText, onPendingBulkTextConsumed]);

    const onPickFile = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => {
          const t = typeof reader.result === 'string' ? reader.result : '';
          setPasteText(t);
          loadParsed(t);
        };
        reader.readAsText(f);
        e.target.value = '';
      },
      [loadParsed],
    );

    const toggleRow = useCallback(
      (key: string) => {
        commitRows(prev => prev.map(r => (r.key === key ? { ...r, selected: !r.selected } : r)));
      },
      [commitRows],
    );

    const selectAll = useCallback(
      (v: boolean) => {
        commitRows(prev => prev.map(r => ({ ...r, selected: v })));
      },
      [commitRows],
    );

    const run3dForSmiles = useCallback(
      async (rowKey: string, smiles: string) => {
        commitRows(prev =>
          prev.map(r =>
            r.key === rowKey ? { ...r, status: 'running', message: '3D in browser (local engine)…' } : r,
          ),
        );
        try {
          const out = await runBatchPipeline(smiles, includeH, preferPubChem2d, preferPubChem3d);
          commitRows(prev =>
            prev.map(r =>
              r.key === rowKey
                ? {
                    ...r,
                    smiles,
                    status: 'ok',
                    message: out.source,
                    molblock2d: out.molblock2d,
                    molblock3d: out.molblock3d,
                  }
                : r,
            ),
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          commitRows(prev =>
            prev.map(r => (r.key === rowKey ? { ...r, status: 'error', message: msg } : r)),
          );
        }
      },
      [runBatchPipeline, includeH, preferPubChem2d, preferPubChem3d, commitRows],
    );

    /** Phase 1: PubChem name → SMILES for one row; persists to browser storage. */
    const fetchSmilesForRowKey = useCallback(
      async (rowKey: string): Promise<string | null> => {
        const row = rowsRef.current.find(r => r.key === rowKey);
        if (!row) return null;
        if (row.smiles.trim()) return row.smiles.trim();
        if (!row.name.trim()) return null;

        commitRows(prev =>
          prev.map(r =>
            r.key === rowKey
              ? { ...r, status: 'running', message: 'PubChem lookup (queued)…' }
              : r,
          ),
        );
        try {
          const resolved = await resolveSmilesForRow(row);
          if (!resolved) {
            commitRows(prev =>
              prev.map(r =>
                r.key === rowKey
                  ? { ...r, status: 'error', message: 'No PubChem compound match for this name' }
                  : r,
              ),
            );
            return null;
          }
          commitRows(prev =>
            prev.map(r =>
              r.key === rowKey
                ? {
                    ...r,
                    smiles: resolved.smiles,
                    id: resolved.id,
                    status: 'idle',
                    message: 'SMILES saved',
                  }
                : r,
            ),
          );
          return resolved.smiles;
        } catch {
          commitRows(prev =>
            prev.map(r =>
              r.key === rowKey ? { ...r, status: 'error', message: 'PubChem lookup failed' } : r,
            ),
          );
          return null;
        }
      },
      [commitRows],
    );

    const fetchSmilesSelected = useCallback(async () => {
      const keys = rowsRef.current
        .filter(r => r.selected && !r.smiles.trim() && r.name.trim())
        .map(r => r.key);
      if (keys.length === 0) return;
      setBusy(true);
      setBatchPhase('pubchem');
      try {
        for (const key of keys) {
          await fetchSmilesForRowKey(key);
        }
      } finally {
        setBusy(false);
        setBatchPhase(null);
      }
    }, [fetchSmilesForRowKey]);

    const convertOne = useCallback(
      async (row: BatchTableRow) => {
        setBusy(true);
        try {
          const smiles = (await fetchSmilesForRowKey(row.key)) ?? row.smiles.trim();
          if (!smiles) return;
          await run3dForSmiles(row.key, smiles);
        } finally {
          setBusy(false);
        }
      },
      [fetchSmilesForRowKey, run3dForSmiles],
    );

    const downloadOne = useCallback((row: BatchTableRow) => {
      if (onBeforeDownload && onBeforeDownload() === false) return;
      if (!row.molblock3d?.trim()) return;
      const xyz = molblock3dToXyz(row.molblock3d, row.name || row.id);
      if (!xyz) return;
      downloadText(`${sanitizeFilename(row.id || row.name)}.xyz`, xyz);
    }, [onBeforeDownload]);

    const downloadSdfOne = useCallback((row: BatchTableRow) => {
      if (onBeforeDownload && onBeforeDownload() === false) return;
      if (!row.molblock3d?.trim()) return;
      downloadText(`${sanitizeFilename(row.id || row.name)}.sdf`, molblock3dToSdf(row.molblock3d));
    }, [onBeforeDownload]);

    /** Phase 2 only: 3D / .xyz for selected rows that already have SMILES. */
    const convertSelected = useCallback(async () => {
      const toRun = rowsRef.current.filter(r => r.selected && r.smiles.trim());
      if (toRun.length === 0) return;
      setBusy(true);
      setBatchPhase('convert');
      try {
        for (const r of toRun) {
          await run3dForSmiles(r.key, r.smiles.trim());
        }
      } finally {
        setBusy(false);
        setBatchPhase(null);
      }
    }, [run3dForSmiles]);

    /** Phase 1 then 2: fetch all SMILES from PubChem (sequential, rate-limited), then convert each to 3D. */
    const fetchAndConvertSelected = useCallback(async () => {
      const selected = rowsRef.current.filter(
        r => r.selected && (r.smiles.trim() || r.name.trim()),
      );
      if (selected.length === 0) return;
      setBusy(true);
      try {
        setBatchPhase('pubchem');
        const ready: { key: string; smiles: string }[] = [];
        for (const row of selected) {
          let smi = row.smiles.trim();
          if (!smi) {
            smi = (await fetchSmilesForRowKey(row.key)) ?? '';
          }
          if (smi) ready.push({ key: row.key, smiles: smi });
        }
        setBatchPhase('convert');
        for (const { key, smiles } of ready) {
          await run3dForSmiles(key, smiles);
        }
      } finally {
        setBusy(false);
        setBatchPhase(null);
      }
    }, [fetchSmilesForRowKey, run3dForSmiles]);

    const downloadSelected = useCallback(() => {
      const sel = rows.filter(r => r.selected && r.molblock3d && r.status === 'ok');
      for (const r of sel) {
        downloadOne(r);
      }
    }, [rows, downloadOne]);

    const downloadSelectedSdf = useCallback(() => {
      const sel = rows.filter(r => r.selected && r.molblock3d && r.status === 'ok');
      for (const r of sel) {
        downloadSdfOne(r);
      }
    }, [rows, downloadSdfOne]);


    const addSelectedToCanvas = useCallback(async () => {
      if (!onImportMolblocksToCanvas && !onImportMolblockToCanvas) return;
      const items = rows
        .filter(r => r.selected && r.molblock2d?.trim())
        .map(r => ({
          molblock: r.molblock2d!,
          displayName: (r.name || r.id || 'structure').trim(),
        }));
      if (items.length === 0) {
        window.alert('Select rows that already have a 2D structure (run Convert first).');
        return;
      }
      if (onImportMolblocksToCanvas) {
        await onImportMolblocksToCanvas(items);
      } else if (onImportMolblockToCanvas) {
        for (const item of items) {
          await onImportMolblockToCanvas(item.molblock, item.displayName);
        }
      }
    }, [onImportMolblockToCanvas, onImportMolblocksToCanvas, rows]);

    const activeCsvColumns = (Object.keys(csvExportColumns) as CsvExportColumn[]).filter(
      c => csvExportColumns[c],
    );

    const cellForCsvColumn = (r: BatchTableRow, col: CsvExportColumn): string => {
      switch (col) {
        case 'id':
          return r.id;
        case 'name':
          return r.name;
        case 'smiles':
          return r.smiles.trim();
        case 'status':
          return r.status;
        case 'message':
          return r.message ?? '';
        default:
          return '';
      }
    };

    const downloadSheetCsv = useCallback(() => {
      if (onBeforeDownload && onBeforeDownload() === false) return;
      if (activeCsvColumns.length === 0) return;
      const dataRows = rows.filter(r => !isRowEmpty(r));
      if (dataRows.length === 0) return;
      const header = activeCsvColumns.map(c => csvEscapeField(CSV_COLUMN_LABELS[c])).join(',');
      const lines = dataRows.map(r =>
        activeCsvColumns.map(c => csvEscapeField(cellForCsvColumn(r, c))).join(','),
      );
      downloadText('batch-export.csv', [header, ...lines].join('\r\n'));
    }, [rows, activeCsvColumns, csvExportColumns, onBeforeDownload]);

    const toggleCsvColumn = (col: CsvExportColumn) => {
      setCsvExportColumns(prev => {
        const next = { ...prev, [col]: !prev[col] };
        if (!(Object.values(next) as boolean[]).some(Boolean)) {
          return prev;
        }
        return next;
      });
    };

    const headerCsvToggle = (col: CsvExportColumn) => (
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          marginTop: 4,
          fontSize: 9,
          fontWeight: 500,
          color: 'var(--text-muted)',
          cursor: 'pointer',
          userSelect: 'none',
        }}
        title="Include in CSV export"
        onClick={e => e.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={csvExportColumns[col]}
          onChange={() => toggleCsvColumn(col)}
          style={{ width: 11, height: 11, margin: 0 }}
        />
        CSV
      </label>
    );

    const tryPubChemOnly = useCallback(async () => {
      const keys = rowsRef.current
        .filter(r => r.selected && (r.smiles.trim() || r.name.trim()))
        .map(r => r.key);
      if (keys.length === 0) return;
      setBusy(true);
      setBatchPhase('pubchem');
      try {
        for (const key of keys) {
          let smi = rowsRef.current.find(r => r.key === key)?.smiles.trim() ?? '';
          if (!smi) {
            smi = (await fetchSmilesForRowKey(key)) ?? '';
          }
          if (!smi) continue;
          commitRows(prev =>
            prev.map(x => (x.key === key ? { ...x, status: 'running', message: 'PubChem 2D SDF…' } : x)),
          );
          try {
            const mb = await pubchemMolblockFromSmiles(smi);
            if (mb) {
              commitRows(prev =>
                prev.map(x =>
                  x.key === key ? { ...x, status: 'idle', message: 'PubChem 2D OK', molblock2d: mb } : x,
                ),
              );
            } else {
              commitRows(prev =>
                prev.map(x =>
                  x.key === key ? { ...x, status: 'error', message: 'PubChem: not found' } : x,
                ),
              );
            }
          } catch {
            commitRows(prev =>
              prev.map(x =>
                x.key === key ? { ...x, status: 'error', message: 'PubChem network error' } : x,
              ),
            );
          }
        }
      } finally {
        setBusy(false);
        setBatchPhase(null);
      }
    }, [fetchSmilesForRowKey, commitRows]);

    const selectedNeedSmiles = rows.filter(
      r => r.selected && !r.smiles.trim() && r.name.trim(),
    ).length;
    const selectedHasSmiles = rows.filter(r => r.selected && r.smiles.trim()).length;
    const selectedCanFetchAndConvert = rows.filter(
      r => r.selected && (r.smiles.trim() || r.name.trim()),
    ).length;
    const selectedReadyForDownload = rows.filter(r => r.selected && r.molblock3d && r.status === 'ok').length;
    const previewText =
      preview?.row.molblock3d?.trim() ?
        preview.format === 'xyz'
          ? molblock3dToXyz(preview.row.molblock3d, preview.row.name || preview.row.id)
          : molblock3dToSdf(preview.row.molblock3d)
      : '';

    return (
      <div
        className="md-batch-panel"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          padding: '0 16px 12px',
          minHeight: 0,
          flex: 1,
          height: '100%',
        }}
      >
        <p className="md-batch-panel__hint">
          Workflow: <strong>1)</strong> PubChem fetches SMILES one compound at a time (rate-limited, saved in this
          browser), <strong>2)</strong> the local engine builds 3D, <strong>3)</strong> download .xyz. Use{' '}
          <strong>Fetch SMILES → 3D</strong> for both steps, or run them separately.
          {busy && batchPhase === 'pubchem' && (
            <span style={{ display: 'block', marginTop: 4, color: 'var(--text-main)', fontWeight: 600 }}>
              Step 1/2: querying PubChem (sequential)…
            </span>
          )}
          {busy && batchPhase === 'convert' && (
            <span style={{ display: 'block', marginTop: 4, color: 'var(--text-main)', fontWeight: 600 }}>
              Step 2/2: building 3D in browser…
            </span>
          )}
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <input ref={fileRef} type="file" accept=".csv,.txt,text/csv" style={{ display: 'none' }} onChange={onPickFile} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 12px',
              borderRadius: 8,
              border: `1px solid ${sheetBorder}`,
              background: 'var(--chrome-bg-elevated)',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text-main)',
            }}
          >
            <FileSpreadsheet size={14} /> Choose CSV
          </button>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-main)' }}>
            <input type="checkbox" checked={includeH} onChange={() => setIncludeH(v => !v)} />
            Include H in 3D
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-main)' }}>
            <input type="checkbox" checked={preferPubChem2d} onChange={() => setPreferPubChem2d(v => !v)} />
            Prefer PubChem 2D SDF
          </label>
          <label
            title="When available, use PubChem's precomputed 3D SDF instead of generating 3D locally."
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-main)' }}
          >
            <input type="checkbox" checked={preferPubChem3d} onChange={() => setPreferPubChem3d(v => !v)} />
            Prefer PubChem 3D SDF
          </label>
        </div>

        <textarea
          value={pasteText}
          onChange={e => setPasteText(e.target.value)}
          placeholder={'id,smiles\nmol-001,CCO\nmol-002,c1ccccc1'}
          rows={3}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            fontFamily: 'ui-monospace, monospace',
            fontSize: 11,
            borderRadius: 4,
            border: `1px solid ${sheetBorder}`,
            padding: 8,
            resize: 'vertical',
            flexShrink: 0,
          }}
        />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => loadParsed(pasteText)}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: 'none',
              background: 'var(--text-main)',
              color: 'var(--chrome-bg-elevated)',
              fontWeight: 600,
              fontSize: 12,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Table size={14} /> Parse table
          </button>
          {(onImportMolblocksToCanvas || onImportMolblockToCanvas) && (
            <button
              type="button"
              className="md-import-btn md-import-btn--primary"
              disabled={!rows.some(r => r.selected && r.molblock2d)}
              onClick={() => void addSelectedToCanvas()}
              title="Place selected 2D structures on the canvas as a labeled grid"
            >
              <FlaskConical size={14} /> Add selected to canvas
            </button>
          )}
          <button
            type="button"
            disabled={!rows.some(r => !isRowEmpty(r)) || activeCsvColumns.length === 0}
            onClick={downloadSheetCsv}
            title="Export checked columns (see CSV toggles in table headers)"
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: `1px solid ${sheetBorder}`,
              background: 'var(--chrome-bg-elevated)',
              fontWeight: 600,
              fontSize: 12,
              cursor:
                !rows.some(r => !isRowEmpty(r)) || activeCsvColumns.length === 0
                  ? 'not-allowed'
                  : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              color: 'var(--text-main)',
            }}
          >
            <Download size={14} /> Download CSV
          </button>
          <button
            type="button"
            disabled={busy || rows.length === 0}
            onClick={() => selectAll(true)}
            style={{
              fontSize: 11,
              padding: '6px 10px',
              borderRadius: 6,
              border: `1px solid ${sheetBorder}`,
              background: 'var(--chrome-bg-elevated)',
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            Select all
          </button>
          <button
            type="button"
            disabled={busy || rows.length === 0}
            onClick={() => selectAll(false)}
            style={{
              fontSize: 11,
              padding: '6px 10px',
              borderRadius: 6,
              border: `1px solid ${sheetBorder}`,
              background: 'var(--chrome-bg-elevated)',
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            Select none
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={tryPubChemOnly}
            style={{
              fontSize: 11,
              padding: '6px 10px',
              borderRadius: 6,
              border: `1px solid ${sheetBorder}`,
              background: 'var(--chrome-bg)',
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            Check PubChem 2D (selected)
          </button>
          <button
            type="button"
            disabled={busy || selectedNeedSmiles === 0}
            onClick={() => void fetchSmilesSelected()}
            style={{
              fontSize: 11,
              padding: '6px 10px',
              borderRadius: 6,
              border: `1px solid ${sheetBorder}`,
              background: busy || selectedNeedSmiles === 0 ? 'var(--chrome-hover)' : 'var(--chrome-active)',
              cursor: busy || selectedNeedSmiles === 0 ? 'not-allowed' : 'pointer',
              color: busy || selectedNeedSmiles === 0 ? 'var(--text-muted)' : 'var(--primary)',
              fontWeight: 600,
            }}
          >
            Fetch SMILES (PubChem)
          </button>
          <button
            type="button"
            disabled={busy || selectedHasSmiles === 0}
            onClick={() => void convertSelected()}
            style={{
              fontSize: 11,
              padding: '6px 10px',
              borderRadius: 6,
              border: `1px solid ${sheetBorder}`,
              background: busy || selectedHasSmiles === 0 ? 'var(--chrome-hover)' : 'var(--chrome-bg-elevated)',
              cursor: busy || selectedHasSmiles === 0 ? 'not-allowed' : 'pointer',
              fontWeight: 600,
            }}
          >
            Convert to 3D only
          </button>
          <button
            type="button"
            disabled={busy || selectedCanFetchAndConvert === 0}
            onClick={() => void fetchAndConvertSelected()}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: 'none',
              background: busy || selectedCanFetchAndConvert === 0 ? 'var(--chrome-border-strong)' : 'var(--text-main)',
              color: 'var(--chrome-bg-elevated)',
              fontWeight: 600,
              fontSize: 12,
              cursor: busy || selectedCanFetchAndConvert === 0 ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {busy ? <Loader2 size={14} className="batch-spin" /> : <Wand2 size={14} />}
            Fetch SMILES → 3D (selected)
          </button>
          <button
            type="button"
            disabled={busy || selectedReadyForDownload === 0}
            onClick={downloadSelected}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: 'none',
              background: busy || selectedReadyForDownload === 0 ? 'var(--chrome-border)' : 'var(--primary)',
              color: busy || selectedReadyForDownload === 0 ? 'var(--text-muted)' : 'var(--chrome-bg-elevated)',
              fontWeight: 600,
              fontSize: 12,
              cursor: busy || selectedReadyForDownload === 0 ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Download size={14} />
            Download .xyz (selected)
          </button>
          <button
            type="button"
            disabled={busy || selectedReadyForDownload === 0}
            onClick={downloadSelectedSdf}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: 'none',
              background: busy || selectedReadyForDownload === 0 ? 'var(--chrome-border)' : 'var(--primary)',
              color: busy || selectedReadyForDownload === 0 ? 'var(--text-muted)' : 'var(--chrome-bg-elevated)',
              fontWeight: 600,
              fontSize: 12,
              cursor: busy || selectedReadyForDownload === 0 ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Download size={14} />
            Download .sdf (selected)
          </button>
        </div>

        {parseWarnings.length > 0 && (
          <div
            style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              background: 'var(--chrome-hover)',
              border: '1px solid var(--chrome-border-strong)',
              borderRadius: 8,
              padding: 8,
              flexShrink: 0,
            }}
          >
            {parseWarnings.map((w, i) => (
              <div key={i}>{w}</div>
            ))}
          </div>
        )}

        <div
          style={{
            flex: 1,
            minHeight: 120,
            border: `1px solid ${sheetBorder}`,
            borderRadius: 4,
            overflow: 'auto',
            background: 'var(--chrome-bg-elevated)',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, tableLayout: 'fixed' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              <tr style={{ background: headerBg, textAlign: 'left', boxShadow: '0 1px 0 ' + sheetBorder }}>
                <th style={{ padding: 0, width: 36, borderBottom: `1px solid ${sheetBorder}`, borderRight: `1px solid ${sheetBorder}` }} />
                <th
                  style={{
                    padding: '8px 10px',
                    width: '12%',
                    fontWeight: 600,
                    color: 'var(--text-main)',
                    borderBottom: `1px solid ${sheetBorder}`,
                    borderRight: `1px solid ${sheetBorder}`,
                    verticalAlign: 'bottom',
                  }}
                >
                  ID
                  {headerCsvToggle('id')}
                </th>
                <th
                  style={{
                    padding: '8px 10px',
                    width: '16%',
                    fontWeight: 600,
                    color: 'var(--text-main)',
                    borderBottom: `1px solid ${sheetBorder}`,
                    borderRight: `1px solid ${sheetBorder}`,
                    verticalAlign: 'bottom',
                  }}
                >
                  Name
                  {headerCsvToggle('name')}
                </th>
                <th
                  style={{
                    padding: '8px 10px',
                    width: '28%',
                    fontWeight: 600,
                    color: 'var(--text-main)',
                    borderBottom: `1px solid ${sheetBorder}`,
                    borderRight: `1px solid ${sheetBorder}`,
                    verticalAlign: 'bottom',
                  }}
                >
                  SMILES
                  {headerCsvToggle('smiles')}
                </th>
                <th
                  style={{
                    padding: '8px 10px',
                    width: '16%',
                    fontWeight: 600,
                    color: 'var(--text-main)',
                    borderBottom: `1px solid ${sheetBorder}`,
                    borderRight: `1px solid ${sheetBorder}`,
                    verticalAlign: 'bottom',
                  }}
                >
                  Status
                  {headerCsvToggle('status')}
                  {headerCsvToggle('message')}
                </th>
                <th
                  style={{
                    padding: '8px 10px',
                    width: '18%',
                    fontWeight: 600,
                    color: 'var(--text-main)',
                    borderBottom: `1px solid ${sheetBorder}`,
                    verticalAlign: 'bottom',
                  }}
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, rowIdx) => (
                <tr
                  key={r.key}
                  style={{
                    background: rowIdx % 2 === 0 ? 'var(--chrome-bg-elevated)' : 'var(--chrome-bg)',
                  }}
                >
                  <td
                    style={{
                      padding: 4,
                      borderBottom: `1px solid ${sheetBorder}`,
                      borderRight: `1px solid ${sheetBorder}`,
                      textAlign: 'center',
                      verticalAlign: 'middle',
                    }}
                  >
                    <input type="checkbox" checked={r.selected} onChange={() => toggleRow(r.key)} />
                  </td>
                  <td style={{ padding: 0, borderBottom: `1px solid ${sheetBorder}`, borderRight: `1px solid ${sheetBorder}` }}>
                    <input
                      value={r.id}
                      onChange={e => updateRow(r.key, { id: e.target.value })}
                      style={cellInputStyle}
                      placeholder="id"
                      aria-label="Row id"
                    />
                  </td>
                  <td style={{ padding: 0, borderBottom: `1px solid ${sheetBorder}`, borderRight: `1px solid ${sheetBorder}` }}>
                    <input
                      value={r.name}
                      onChange={e => updateRow(r.key, { name: e.target.value })}
                      style={cellInputStyle}
                      placeholder="name"
                      aria-label="Row name"
                    />
                  </td>
                  <td style={{ padding: 0, borderBottom: `1px solid ${sheetBorder}`, borderRight: `1px solid ${sheetBorder}` }}>
                    <input
                      value={r.smiles}
                      onChange={e => updateRow(r.key, { smiles: e.target.value })}
                      style={cellInputStyle}
                      placeholder="SMILES"
                      aria-label="Row SMILES"
                    />
                  </td>
                  <td
                    style={{
                      padding: '6px 8px',
                      borderBottom: `1px solid ${sheetBorder}`,
                      borderRight: `1px solid ${sheetBorder}`,
                      verticalAlign: 'middle',
                      wordBreak: 'break-word',
                    }}
                  >
                    {r.status === 'running' && (
                      <span style={{ color: 'var(--chrome-accent)' }}>
                        <Loader2 size={12} className="batch-spin" style={{ verticalAlign: 'middle' }} />{' '}
                        {r.message ?? ''}
                      </span>
                    )}
                    {r.status === 'ok' && (
                      <span style={{ color: 'var(--primary)' }}>
                        OK {r.message ? `(${r.message})` : ''}
                      </span>
                    )}
                    {r.status === 'error' && <span style={{ color: 'var(--md-danger-soft)' }}>{r.message}</span>}
                    {r.status === 'idle' && <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  </td>
                  <td
                    style={{
                      padding: '6px 8px',
                      borderBottom: `1px solid ${sheetBorder}`,
                      verticalAlign: 'middle',
                    }}
                  >
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        disabled={busy || (!r.smiles.trim() && !r.name.trim())}
                        onClick={() => void convertOne(r)}
                        style={{
                          fontSize: 10,
                          padding: '4px 8px',
                          borderRadius: 4,
                          border: `1px solid ${sheetBorder}`,
                          cursor: busy || (!r.smiles.trim() && !r.name.trim()) ? 'not-allowed' : 'pointer',
                          background: 'var(--chrome-bg-elevated)',
                        }}
                      >
                        Convert
                      </button>
                      <button
                        type="button"
                        disabled={!r.molblock3d || r.status !== 'ok'}
                        onClick={() => setPreview({ row: r, format: 'xyz' })}
                        title={r.molblock3d && r.status === 'ok' ? 'View .xyz text' : 'Convert to 3D first'}
                        style={{
                          fontSize: 10,
                          padding: '4px 8px',
                          borderRadius: 4,
                          border: '1px solid var(--chrome-border-strong)',
                          background: 'var(--chrome-hover)',
                          color: 'var(--text-main)',
                          fontWeight: 600,
                          cursor: !r.molblock3d || r.status !== 'ok' ? 'not-allowed' : 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <Eye size={12} />
                        View XYZ
                      </button>
                      <button
                        type="button"
                        disabled={!r.molblock3d || r.status !== 'ok'}
                        onClick={() => setPreview({ row: r, format: 'sdf' })}
                        title={r.molblock3d && r.status === 'ok' ? 'View .sdf text' : 'Convert to 3D first'}
                        style={{
                          fontSize: 10,
                          padding: '4px 8px',
                          borderRadius: 4,
                          border: '1px solid var(--chrome-border-strong)',
                          background: 'var(--chrome-hover)',
                          color: 'var(--primary)',
                          fontWeight: 600,
                          cursor: !r.molblock3d || r.status !== 'ok' ? 'not-allowed' : 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <Eye size={12} />
                        View SDF
                      </button>
                      <button
                        type="button"
                        disabled={!r.molblock3d || r.status !== 'ok'}
                        onClick={() => downloadOne(r)}
                        title={
                          r.molblock3d && r.status === 'ok'
                            ? `Download ${sanitizeFilename(r.id || r.name)}.xyz`
                            : 'Convert to 3D first'
                        }
                        style={{
                          fontSize: 10,
                          padding: '4px 8px',
                          borderRadius: 4,
                          border: '1px solid var(--chrome-border-strong)',
                          background: 'var(--chrome-hover)',
                          color: 'var(--primary)',
                          fontWeight: 600,
                          cursor: !r.molblock3d || r.status !== 'ok' ? 'not-allowed' : 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <Download size={12} />
                        .xyz
                      </button>
                      <button
                        type="button"
                        disabled={!r.molblock3d || r.status !== 'ok'}
                        onClick={() => downloadSdfOne(r)}
                        title={
                          r.molblock3d && r.status === 'ok'
                            ? `Download ${sanitizeFilename(r.id || r.name)}.sdf`
                            : 'Convert to 3D first'
                        }
                        style={{
                          fontSize: 10,
                          padding: '4px 8px',
                          borderRadius: 4,
                          border: '1px solid var(--chrome-border-strong)',
                          background: 'var(--chrome-hover)',
                          color: 'var(--primary)',
                          fontWeight: 600,
                          cursor: !r.molblock3d || r.status !== 'ok' ? 'not-allowed' : 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <Download size={12} />
                        .sdf
                      </button>
                      {onImportMolblockToCanvas && r.molblock2d && (
                        <button
                          type="button"
                          className="md-batch-chip"
                          onClick={() => onImportMolblockToCanvas(r.molblock2d!, r.name || r.id)}
                          title="Add 2D structure to canvas (grid + name)"
                        >
                          <FlaskConical size={12} style={{ verticalAlign: 'middle' }} />
                          Canvas
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {preview && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="batch-structure-preview-title"
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 3000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(15, 23, 42, 0.45)',
              padding: 16,
            }}
            onClick={() => setPreview(null)}
          >
            <div
              style={{
                width: 'min(92vw, 720px)',
                maxHeight: 'min(80vh, 560px)',
                background: 'var(--chrome-bg-elevated)',
                borderRadius: 10,
                boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
              onClick={e => e.stopPropagation()}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  borderBottom: `1px solid ${sheetBorder}`,
                }}
              >
                <h3 id="batch-structure-preview-title" style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>
                  {preview.row.name || preview.row.id || 'Structure'} — {preview.format.toUpperCase()}
                </h3>
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    padding: 4,
                  }}
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>
              <pre
                style={{
                  flex: 1,
                  margin: 0,
                  padding: 12,
                  overflow: 'auto',
                  fontSize: 11,
                  fontFamily: 'ui-monospace, monospace',
                  lineHeight: 1.45,
                  background: 'var(--chrome-bg)',
                  minHeight: 120,
                }}
              >
                {previewText || `(No ${preview.format.toUpperCase()} content — convert to 3D first.)`}
              </pre>
              <div
                style={{
                  padding: '10px 16px',
                  borderTop: `1px solid ${sheetBorder}`,
                  display: 'flex',
                  gap: 8,
                  justifyContent: 'flex-end',
                }}
              >
                <button
                  type="button"
                  disabled={!previewText}
                  onClick={() => {
                    if (onBeforeDownload && onBeforeDownload() === false) return;
                    if (previewText) {
                      downloadText(
                        `${sanitizeFilename(preview.row.id || preview.row.name)}.${preview.format}`,
                        previewText,
                      );
                    }
                  }}
                  style={{
                    fontSize: 12,
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--chrome-border-strong)',
                    background: 'var(--chrome-hover)',
                    color: 'var(--primary)',
                    fontWeight: 600,
                    cursor: previewText ? 'pointer' : 'not-allowed',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Download size={14} />
                  Download .{preview.format}
                </button>
              </div>
            </div>
          </div>
        )}

        <style>{`
        @keyframes batch-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .batch-spin { animation: batch-spin 1s linear infinite; }
      `}</style>
      </div>
    );
  },
);
