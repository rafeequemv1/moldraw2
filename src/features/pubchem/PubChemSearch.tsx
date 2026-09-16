import React, { useState, useEffect, useRef, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { Search, X, Loader2, Download, Table2 } from 'lucide-react';
import { BatchStructuresPanel, type BatchAppendRowInput } from '../../app/advanced/BatchStructuresPanel';
import type { BatchPipelineResult } from '../../app/advanced/batchExport';
import {
  fetchCidsForPubChemTerm,
  fetchSmilesForCid,
  isCasNumber,
  looksLikeSmiles,
  resolveCompoundNameFromPubChem,
  smilesFromPubChemProperty,
} from '../../app/advanced/batchExport';
import { withPubChemThrottle } from '../../app/advanced/batchExport/pubchemRateLimit';
import { nativeSmilesTo2DMolblock } from '@moldraw/core/io/smilesToMolblock';
import { useChromeOverlay } from '../../app/chromeDismiss';

interface PubChemResult {
  cid: number;
  name: string;
  iupacName?: string;
  molecularFormula?: string;
  molecularWeight?: number;
  isomericSmiles?: string;
}

interface PubChemSearchProps {
  /** Raw SDF molblock, display name, optional IUPAC from PubChem properties */
  onImport: (molblock: string, name: string, iupacName?: string) => void | Promise<void>;
  /** Same as onImport but does not close the modal — used for bulk “Import selected”. */
  onImportQuiet?: (molblock: string, name: string, iupacName?: string) => void | Promise<void>;
  onClose: () => void;
  /** Optional: batch SMILES → 3D → .xyz (advanced workflow). */
  batchPipeline?: {
    runBatchPipeline: (
      smiles: string,
      includeHydrogens: boolean,
      preferPubChem2d: boolean,
      preferPubChem3d: boolean,
    ) => Promise<BatchPipelineResult>;
    onImportMolblockToCanvas?: (molblock: string, displayName: string) => void | Promise<void>;
    /** Place many 2D molblocks as a labeled viewport grid. */
    onImportMolblocksToCanvas?: (
      items: Array<{ molblock: string; displayName: string }>,
    ) => void | Promise<void>;
    onBeforeDownload?: () => boolean;
  };
}

const PUBCHEM_BASE = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug';
const SEARCH_MAX_RECORDS = 28;
const GRID_COLS = 7;
const BULK_LOAD_MAX_LINES = 80;

function tsvEscapeCell(s: string): string {
  return s.replace(/\r|\n/g, ' ').replace(/\t/g, ' ');
}

/** Tab-separated block with header `id`, `name`, `smiles` for the batch paste parser. */
function batchRowsToTsv(rows: BatchAppendRowInput[]): string {
  const header = 'id\tname\tsmiles';
  const lines = rows.map(
    r => `${tsvEscapeCell(r.id)}\t${tsvEscapeCell(r.name)}\t${tsvEscapeCell(r.smiles)}`,
  );
  return [header, ...lines].join('\n');
}

async function fetchMolblockForCid(cid: number): Promise<string> {
  const res = await fetch(`${PUBCHEM_BASE}/compound/cid/${cid}/SDF`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const sdfText = await res.text();
  const molblock = sdfText.split('$$$$')[0].trim();
  if (!molblock) throw new Error('Empty SDF response');
  return molblock;
}

/** Prefer PubChem precomputed 2D SDF (accurate depiction); local SMILES→2D as offline fallback. */
async function resolveMolblockForResult(result: PubChemResult): Promise<string> {
  try {
    return await fetchMolblockForCid(result.cid);
  } catch {
    /* fall through to local layout */
  }
  const cached = result.isomericSmiles?.trim();
  if (cached) {
    const local = nativeSmilesTo2DMolblock(cached);
    if (local) return local;
  }
  const smiles = (await fetchSmilesForCid(result.cid))?.trim();
  if (smiles) {
    const local = nativeSmilesTo2DMolblock(smiles);
    if (local) return local;
  }
  throw new Error('Could not resolve structure from PubChem');
}

export const PubChemSearch: React.FC<PubChemSearchProps> = ({
  onImport,
  onImportQuiet,
  onClose,
  batchPipeline,
}) => {
  const [tab, setTab] = useState<'search' | 'batch'>('search');
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [results, setResults] = useState<PubChemResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  /** Picked structures persist across new PubChem searches (shown below the grid). */
  const [pickedMolecules, setPickedMolecules] = useState<PubChemResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [importingCid, setImportingCid] = useState<number | null>(null);
  const [bulkImporting, setBulkImporting] = useState(false);
  const [addingToBatch, setAddingToBatch] = useState(false);
  const [bulkPaste, setBulkPaste] = useState('');
  const [bulkMode, setBulkMode] = useState<'names' | 'smiles'>('names');
  const [bulkWorking, setBulkWorking] = useState(false);
  /** Related-name chips (autocomplete): pick individually or all, then add to batch without searching each. */
  const [pickedRelatedNames, setPickedRelatedNames] = useState<string[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const batchBulkTextNonceRef = useRef(0);
  const [batchBulkTextRequest, setBatchBulkTextRequest] = useState<{
    nonce: number;
    text: string;
    append: boolean;
  } | null>(null);
  const suggestDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useChromeOverlay(true, onClose, 'modal');

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }
    if (isCasNumber(query.trim())) {
      setSuggestions([]);
      setLoadingSuggestions(false);
      return;
    }

    if (suggestDebounce.current) clearTimeout(suggestDebounce.current);
    setLoadingSuggestions(true);
    suggestDebounce.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://pubchem.ncbi.nlm.nih.gov/rest/autocomplete/compound/${encodeURIComponent(query)}/JSON?limit=24`
        );
        if (res.ok) {
          const data = await res.json();
          const terms: string[] = data?.dictionary_terms?.compound || [];
          setSuggestions(terms);
        }
      } catch {
        // ignore autocomplete errors silently
      } finally {
        setLoadingSuggestions(false);
      }
    }, 300);
  }, [query]);

  useEffect(() => {
    setPickedRelatedNames(prev => prev.filter(p => suggestions.includes(p)));
  }, [suggestions]);

  const doSearch = useCallback(async (term: string) => {
    if (!term.trim()) return;
    setLoading(true);
    setError(null);
    setResults([]);

    try {
      const cids = await fetchCidsForPubChemTerm(term, SEARCH_MAX_RECORDS);

      if (cids.length === 0) {
        setError(
          isCasNumber(term)
            ? `No compounds found for CAS number "${term}".`
            : looksLikeSmiles(term)
              ? `No PubChem match for SMILES "${term}". Check the string or try a compound name.`
              : `No compounds found for "${term}". Try a different name, CAS number, SMILES, or PubChem CID.`,
        );
        setLoading(false);
        return;
      }

      const propRes = await withPubChemThrottle(() =>
        fetch(
          `${PUBCHEM_BASE}/compound/cid/${cids.join(',')}/property/IUPACName,MolecularFormula,MolecularWeight,IsomericSMILES,CanonicalSMILES,SMILES,ConnectivitySMILES/JSON`,
        ),
      );
      if (!propRes.ok) {
        setError(`PubChem property lookup failed (HTTP ${propRes.status}). Try again in a moment.`);
        setLoading(false);
        return;
      }
      const propData = await propRes.json();
      const props: Record<number, Partial<PubChemResult>> = {};
      (propData?.PropertyTable?.Properties || []).forEach(
        (p: {
          CID: number;
          IUPACName?: string;
          MolecularFormula?: string;
          MolecularWeight?: number;
          IsomericSMILES?: string;
          CanonicalSMILES?: string;
          SMILES?: string;
          ConnectivitySMILES?: string;
        }) => {
          const smi = smilesFromPubChemProperty(p);
          props[p.CID] = {
            cid: p.CID,
            iupacName: p.IUPACName,
            molecularFormula: p.MolecularFormula,
            molecularWeight: p.MolecularWeight,
            isomericSmiles: smi,
          };
        },
      );

      const built: PubChemResult[] = cids.map((cid, i) => ({
        cid,
        name: i === 0 ? term : (props[cid]?.iupacName || `CID ${cid}`),
        ...props[cid],
      }));

      setResults(built);
      setSuggestions([]);
    } catch {
      setError('Network error. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') doSearch(query);
    if (e.key === 'Escape') onClose();
  };

  const runSuggestionSearch = (s: string) => {
    setQuery(s);
    setSuggestions([]);
    doSearch(s);
  };

  const clearBatchBulkTextRequest = useCallback(() => {
    setBatchBulkTextRequest(null);
  }, []);

  /** Switches to the batch tab and injects text into the paste area + table via parse. */
  const queueBulkTextInject = useCallback(
    (text: string, append: boolean) => {
      if (!batchPipeline || !text.trim()) return;
      batchBulkTextNonceRef.current += 1;
      const payload = { nonce: batchBulkTextNonceRef.current, text: text.trim(), append };
      flushSync(() => {
        setTab('batch');
        setBatchBulkTextRequest(payload);
      });
    },
    [batchPipeline],
  );

  const resolveNameToBatchRow = useCallback(
    async (name: string, _index: number): Promise<BatchAppendRowInput | null> => {
      const hit = await resolveCompoundNameFromPubChem(name);
      if (!hit) return null;
      return { id: `CID-${hit.cid}`, name: name.slice(0, 120), smiles: hit.smiles };
    },
    [],
  );

  const bulkAddToBatchTable = useCallback(async () => {
    if (!batchPipeline) return;
    const lines = bulkPaste
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean)
      .slice(0, BULK_LOAD_MAX_LINES);
    if (lines.length === 0) {
      alert(`Paste up to ${BULK_LOAD_MAX_LINES} lines (compound names or SMILES depending on mode).`);
      return;
    }
    setBulkWorking(true);
    try {
      const out: BatchAppendRowInput[] = [];
      if (bulkMode === 'smiles') {
        lines.forEach((smiles, i) => {
          out.push({
            id: `s${i + 1}`,
            name: `Line ${i + 1}`,
            smiles,
          });
        });
      } else {
        const unmatchedLines: string[] = [];
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]!;
          const row = await resolveNameToBatchRow(line, i);
          if (row) out.push(row);
          else unmatchedLines.push(line);
        }
        if (out.length === 0) {
          alert('No compounds resolved. Check spelling or try SMILES mode for structures PubChem does not name-match.');
          return;
        }
        if (unmatchedLines.length > 0) {
          window.alert(`Added ${out.length} row(s). ${unmatchedLines.length} line(s) had no PubChem match.`);
          console.warn('[bulk load] unmatched lines:', unmatchedLines);
        }
      }
      if (out.length === 0) return;
      queueBulkTextInject(batchRowsToTsv(out), true);
      if (bulkMode === 'smiles') setBulkPaste('');
    } catch (e) {
      console.error(e);
      alert('Bulk load failed. Check your connection or try fewer lines.');
    } finally {
      setBulkWorking(false);
    }
  }, [batchPipeline, bulkPaste, bulkMode, queueBulkTextInject, resolveNameToBatchRow]);

  const addSelectedToBatchTable = useCallback(async () => {
    if (!batchPipeline || pickedMolecules.length === 0) return;
    setAddingToBatch(true);
    try {
      const ordered = pickedMolecules;
      const toAppend: BatchAppendRowInput[] = [];
      for (const r of ordered) {
        let smiles = r.isomericSmiles?.trim();
        if (!smiles) {
          smiles = (await fetchSmilesForCid(r.cid))?.trim();
        }
        if (!smiles) continue;
        toAppend.push({
          id: `CID-${r.cid}`,
          name: r.name || `CID ${r.cid}`,
          smiles,
        });
        // fetchSmilesForCid is rate-limited (~3 req/s) via pubChemThrottle
      }
      if (toAppend.length === 0) {
        alert('No SMILES could be loaded for the selected compounds. Try again or pick other hits.');
        return;
      }
      queueBulkTextInject(batchRowsToTsv(toAppend), true);
    } catch (e) {
      console.error(e);
      alert('Could not add rows to the batch table.');
    } finally {
      setAddingToBatch(false);
    }
  }, [batchPipeline, pickedMolecules, fetchSmilesForCid, queueBulkTextInject]);

  const toggleRelatedNamePick = (name: string) => {
    setPickedRelatedNames(prev =>
      prev.includes(name) ? prev.filter(x => x !== name) : [...prev, name],
    );
  };

  const selectAllRelatedNames = () => {
    setPickedRelatedNames([...suggestions]);
  };

  /** Puts picked synonym strings into the batch paste box as a name-per-line list (resolve SMILES in-sheet). */
  const addPickedRelatedNamesToBatch = useCallback(() => {
    if (!batchPipeline || pickedRelatedNames.length === 0) return;
    const text = ['compound_name', ...pickedRelatedNames].join('\n');
    queueBulkTextInject(text, true);
    setPickedRelatedNames([]);
  }, [batchPipeline, pickedRelatedNames, queueBulkTextInject]);

  const togglePickMolecule = (r: PubChemResult) => {
    setPickedMolecules(prev => {
      if (prev.some(x => x.cid === r.cid)) {
        return prev.filter(x => x.cid !== r.cid);
      }
      return [...prev, { ...r }];
    });
  };

  const removePick = (cid: number) => {
    setPickedMolecules(prev => prev.filter(x => x.cid !== cid));
  };

  /** Union current hits into the basket (updates metadata when CID already picked). */
  const selectAllResults = () => {
    setPickedMolecules(prev => {
      const map = new Map<number, PubChemResult>();
      prev.forEach(p => map.set(p.cid, p));
      results.forEach(r => map.set(r.cid, r));
      return Array.from(map.values());
    });
  };

  const clearSelection = () => setPickedMolecules([]);

  const handleImport = async (result: PubChemResult) => {
    setImportingCid(result.cid);
    try {
      const molblock = await resolveMolblockForResult(result);
      await onImport(molblock, result.name, result.iupacName);
    } catch (err) {
      console.error('Import failed:', err);
      alert('Failed to import structure. Please try again.');
    } finally {
      setImportingCid(null);
    }
  };

  const handleImportSelected = async () => {
    if (!onImportQuiet || pickedMolecules.length === 0) return;
    setBulkImporting(true);
    try {
      const ordered = pickedMolecules;
      const molblocks = await Promise.all(ordered.map(r => resolveMolblockForResult(r)));
      for (let i = 0; i < ordered.length; i++) {
        const result = ordered[i]!;
        await onImportQuiet(molblocks[i]!, result.name, result.iupacName);
      }
      clearSelection();
    } catch (err) {
      console.error('Bulk import failed:', err);
      alert('Failed to import one or more structures. Please try again.');
    } finally {
      setBulkImporting(false);
    }
  };

  const selectedCount = pickedMolecules.length;
  const canBulkImport = Boolean(onImportQuiet) && selectedCount > 0 && !bulkImporting;

  return (
    <div className="md-import-overlay">
      <div className="md-import-modal">

        <div className="md-import-modal__header">
          <div className="md-import-modal__brand">
            <div className="md-import-modal__mark" aria-hidden>
              <Search size={14} color="currentColor" />
            </div>
            <div>
              <div className="md-import-modal__title">Import</div>
              <div className="md-import-modal__subtitle">
                PubChem search · batch SMILES → XYZ · add to canvas
              </div>
            </div>
          </div>
          <button type="button" className="md-import-modal__close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {batchPipeline && (
          <div className="md-import-modal__tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'search'}
              className={`md-import-modal__tab${tab === 'search' ? ' is-active' : ''}`}
              onClick={() => setTab('search')}
            >
              PubChem search
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'batch'}
              className={`md-import-modal__tab${tab === 'batch' ? ' is-active' : ''}`}
              onClick={() => setTab('batch')}
            >
              Batch SMILES → XYZ
            </button>
          </div>
        )}

        <div className="md-import-modal__body">

        {batchPipeline && (
          <div style={{
            flex: 1,
            minHeight: 0,
            display: tab === 'batch' ? 'flex' : 'none',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            <div style={{ flex: 1, minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <BatchStructuresPanel
                pendingBulkText={batchBulkTextRequest}
                onPendingBulkTextConsumed={clearBatchBulkTextRequest}
                runBatchPipeline={batchPipeline.runBatchPipeline}
                onImportMolblockToCanvas={batchPipeline.onImportMolblockToCanvas}
                onImportMolblocksToCanvas={batchPipeline.onImportMolblocksToCanvas}
                onBeforeDownload={batchPipeline.onBeforeDownload}
              />
            </div>
            <div style={{
              padding: '10px 20px', borderTop: '1px solid var(--chrome-hover)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              flexShrink: 0,
            }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                3D can use PubChem precomputed SDF when available, otherwise the same local engine worker as the 3D viewer.
                Convert builds 3D in the sheet; download when ready.
              </span>
            </div>
          </div>
        )}
        {(!batchPipeline || tab === 'search') && (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'row', overflow: 'hidden' }}>
            {/* Left: search & selection actions */}
            <div style={{
              width: 280,
              flexShrink: 0,
              borderRight: '1px solid var(--chrome-border)',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
              background: 'var(--chrome-bg)',
            }}>
              <div style={{ padding: '16px', borderBottom: '1px solid var(--chrome-hover)', flexShrink: 0 }}>
                <div style={{
                  display: 'flex', gap: '8px', alignItems: 'center',
                  background: 'var(--chrome-bg-elevated)', border: '1px solid var(--chrome-border)',
                  borderRadius: '8px', padding: '8px 12px',
                }}>
                  <Search size={16} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Name or CAS, e.g. aspirin or 50-78-2…"
                    style={{
                      flex: 1, border: 'none', background: 'none',
                      outline: 'none', fontSize: '13px', color: 'var(--text-main)',
                    }}
                  />
                  {loadingSuggestions && <Loader2 size={14} color="var(--text-muted)" style={{ animation: 'spin 1s linear infinite' }} />}
                  {query && (
                    <button type="button" onClick={() => { setQuery(''); setResults([]); setError(null); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}>
                      <X size={14} />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => doSearch(query)}
                  disabled={!query.trim() || loading}
                  style={{
                    marginTop: '10px', width: '100%',
                    padding: '9px 0', borderRadius: '8px',
                    background: query.trim() && !loading ? 'var(--text-main)' : 'var(--chrome-border)',
                    color: query.trim() && !loading ? 'white' : 'var(--text-muted)',
                    border: 'none', cursor: query.trim() && !loading ? 'pointer' : 'not-allowed',
                    fontWeight: 600, fontSize: '13px', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', gap: '6px',
                  }}
                >
                  {loading ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Searching…</> : <><Search size={14} /> Search</>}
                </button>
              </div>

              <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    disabled={results.length === 0}
                    onClick={selectAllResults}
                    style={{
                      padding: '6px 10px', fontSize: 12, fontWeight: 600,
                      borderRadius: 6, border: '1px solid var(--chrome-border)', background: 'var(--chrome-bg-elevated)',
                      cursor: results.length === 0 ? 'not-allowed' : 'pointer', color: results.length === 0 ? 'var(--text-muted)' : 'var(--text-main)',
                    }}
                  >
                    Select all
                  </button>
                </div>
                {onImportQuiet && (
                  <button
                    type="button"
                    disabled={!canBulkImport}
                    onClick={() => void handleImportSelected()}
                    title={selectedCount === 0 ? 'Select structures in the grid' : `Import ${selectedCount} to canvas`}
                    style={{
                      width: '100%', padding: '10px 12px', borderRadius: 8,
                      border: 'none', fontWeight: 700, fontSize: 13,
                      background: canBulkImport ? 'var(--text-main)' : 'var(--chrome-border)',
                      color: canBulkImport ? 'var(--chrome-bg-elevated)' : 'var(--text-muted)',
                      cursor: canBulkImport ? 'pointer' : 'not-allowed',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}
                  >
                    {bulkImporting ? (
                      <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Importing…</>
                    ) : (
                      <><Download size={16} /> Import selected ({selectedCount})</>
                    )}
                  </button>
                )}
                {batchPipeline && (
                  <button
                    type="button"
                    disabled={addingToBatch || selectedCount === 0}
                    onClick={() => void addSelectedToBatchTable()}
                    title="Append rows to the batch sheet (existing rows are kept). Then Convert → Download."
                    style={{
                      width: '100%', padding: '10px 12px', borderRadius: 8,
                      border: '1px solid var(--chrome-border-strong)', fontWeight: 700, fontSize: 13,
                      background: addingToBatch || selectedCount === 0 ? 'var(--chrome-hover)' : 'var(--chrome-hover)',
                      color: addingToBatch || selectedCount === 0 ? 'var(--text-muted)' : 'var(--primary)',
                      cursor: addingToBatch || selectedCount === 0 ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}
                  >
                    {addingToBatch ? (
                      <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Adding…</>
                    ) : (
                      <><Table2 size={16} /> Add selected to batch table</>
                    )}
                  </button>
                )}
                {batchPipeline && (
                  <div style={{ borderTop: '1px solid var(--chrome-border)', paddingTop: 10, marginTop: 4 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-main)', marginBottom: 6 }}>Bulk load to batch</div>
                    <div style={{ display: 'flex', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                      <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="bulkMode"
                          checked={bulkMode === 'names'}
                          onChange={() => setBulkMode('names')}
                        />
                        Names
                      </label>
                      <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="bulkMode"
                          checked={bulkMode === 'smiles'}
                          onChange={() => setBulkMode('smiles')}
                        />
                        SMILES
                      </label>
                    </div>
                    <textarea
                      value={bulkPaste}
                      onChange={e => setBulkPaste(e.target.value)}
                      placeholder={
                        bulkMode === 'names'
                          ? 'One compound name per line (max 80)…'
                          : 'One SMILES string per line (max 80)…'
                      }
                      rows={4}
                      disabled={bulkWorking}
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        fontSize: 11,
                        fontFamily: 'ui-monospace, monospace',
                        borderRadius: 6,
                        border: '1px solid var(--chrome-border)',
                        padding: 8,
                        resize: 'vertical',
                        marginBottom: 8,
                      }}
                    />
                    <button
                      type="button"
                      disabled={bulkWorking || !bulkPaste.trim()}
                      onClick={() => void bulkAddToBatchTable()}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: '1px solid var(--chrome-border-strong)',
                        background: bulkWorking || !bulkPaste.trim() ? 'var(--chrome-hover)' : 'var(--chrome-hover)',
                        color: bulkWorking || !bulkPaste.trim() ? 'var(--text-muted)' : 'var(--primary)',
                        fontWeight: 700,
                        fontSize: 12,
                        cursor: bulkWorking || !bulkPaste.trim() ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                      }}
                    >
                      {bulkWorking ? (
                        <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Resolving…</>
                      ) : (
                        <><Table2 size={14} /> Add list to batch table</>
                      )}
                    </button>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.35 }}>
                      Names: PubChem first match per line. SMILES: no lookup. Opens Batch tab when done.
                    </div>
                  </div>
                )}
                <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  Grid shows current hits; picks stay in Selected below across searches. Batch table keeps all rows when you search again and add more. Import adds one structure and closes.
                </div>
              </div>
            </div>

            {/* Right: related names (chips) + molecule grid */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              {suggestions.length > 0 && !loading && (
                <div
                  style={{
                    flexShrink: 0,
                    padding: '12px 16px 10px',
                    borderBottom: '1px solid var(--chrome-border)',
                    background: 'var(--chrome-bg)',
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, letterSpacing: '0.02em' }}>
                    Related names
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.35 }}>
                    Tick names to batch-resolve, or use Search on a single term. Use the magnifier to run a PubChem search for one name.
                  </div>
                  {batchPipeline && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10, alignItems: 'center' }}>
                      <button
                        type="button"
                        onClick={selectAllRelatedNames}
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          padding: '4px 8px',
                          borderRadius: 6,
                          border: '1px solid var(--chrome-border)',
                          background: 'var(--chrome-bg-elevated)',
                          cursor: 'pointer',
                          color: 'var(--text-main)',
                        }}
                      >
                        Select all related
                      </button>
                      <button
                        type="button"
                        disabled={pickedRelatedNames.length === 0}
                        onClick={addPickedRelatedNamesToBatch}
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '4px 10px',
                          borderRadius: 6,
                          border: 'none',
                          background: pickedRelatedNames.length === 0 ? 'var(--chrome-border)' : 'var(--chrome-hover)',
                          color: pickedRelatedNames.length === 0 ? 'var(--text-muted)' : 'var(--primary)',
                          cursor: pickedRelatedNames.length === 0 ? 'not-allowed' : 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <Table2 size={12} />
                        Add picked related to batch ({pickedRelatedNames.length})
                      </button>
                    </div>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    {suggestions.map(s => {
                      const picked = pickedRelatedNames.includes(s);
                      return (
                        <div
                          key={s}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            maxWidth: '100%',
                            padding: '2px 6px 2px 4px',
                            borderRadius: 9999,
                            border: picked ? '2px solid var(--chrome-accent)' : '1px solid var(--chrome-border-strong)',
                            background: picked ? 'var(--chrome-hover)' : 'var(--chrome-bg-elevated)',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={picked}
                            onChange={() => toggleRelatedNamePick(s)}
                            aria-label={`Select related name ${s}`}
                            style={{ width: 14, height: 14, cursor: 'pointer', flexShrink: 0 }}
                          />
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={() => toggleRelatedNamePick(s)}
                            onKeyDown={e => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                toggleRelatedNamePick(s);
                              }
                            }}
                            style={{
                              fontSize: 12,
                              fontWeight: 500,
                              color: 'var(--text-main)',
                              maxWidth: 140,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              cursor: 'pointer',
                            }}
                            title={s}
                          >
                            {s}
                          </span>
                          <button
                            type="button"
                            title={`Search PubChem: ${s}`}
                            onClick={e => {
                              e.stopPropagation();
                              runSuggestionSearch(s);
                            }}
                            style={{
                              flexShrink: 0,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: 26,
                              height: 26,
                              border: 'none',
                              borderRadius: '50%',
                              background: 'var(--chrome-hover)',
                              cursor: 'pointer',
                              color: 'var(--text-muted)',
                            }}
                          >
                            <Search size={12} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {error && (
                <div style={{ padding: '24px', textAlign: 'center', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <div style={{ fontSize: '28px', marginBottom: '8px' }}>🔬</div>
                  <div style={{ color: 'var(--md-danger-soft)', fontWeight: 600, marginBottom: '4px' }}>Not found</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{error}</div>
                </div>
              )}

              {!loading && !error && results.length === 0 && (
                <div style={{ padding: '24px', textAlign: 'center', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <div style={{ fontSize: '36px', marginBottom: '8px' }}>⚗️</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1.5 }}>
                    Type a name — related terms appear above as chips. Click Search or a chip to load structures here.
                  </div>
                </div>
              )}

              {loading && (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: 10 }}>
                  <Loader2 size={22} style={{ animation: 'spin 1s linear infinite' }} />
                  <span style={{ fontSize: 14 }}>Searching PubChem…</span>
                </div>
              )}

              {!loading && results.length > 0 && (
                <div style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: 'auto',
                  padding: '12px 16px 16px',
                }}>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))`,
                    gap: 8,
                  }}>
                    {results.map((result, idx) => {
                      const selected = pickedMolecules.some(m => m.cid === result.cid);
                      const busy = importingCid === result.cid;
                      const label = idx === 0 && query ? query : result.name;
                      return (
                        <div
                          key={result.cid}
                          role="button"
                          tabIndex={0}
                          onClick={() => togglePickMolecule(result)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              togglePickMolecule(result);
                            }
                          }}
                          style={{
                            position: 'relative',
                            borderRadius: 10,
                            border: selected ? '2px solid var(--chrome-accent)' : '1px solid var(--chrome-border)',
                            background: selected ? 'var(--chrome-hover)' : 'var(--chrome-bg-elevated)',
                            padding: '8px 6px 6px',
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            minWidth: 0,
                            transition: 'border-color 0.15s, background 0.15s',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            tabIndex={-1}
                            onClick={e => e.stopPropagation()}
                            onChange={() => togglePickMolecule(result)}
                            style={{ position: 'absolute', top: 6, left: 6, width: 14, height: 14, cursor: 'pointer', zIndex: 1 }}
                            aria-label={`Select ${result.name}`}
                          />
                          <div style={{
                            width: '100%', aspectRatio: '1', maxHeight: 72,
                            borderRadius: 6, overflow: 'hidden',
                            border: '1px solid var(--chrome-border)', background: 'var(--chrome-bg)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            marginTop: 4,
                          }}>
                            <img
                              src={`${PUBCHEM_BASE}/compound/cid/${result.cid}/PNG?record_type=2d&image_size=128x128`}
                              alt=""
                              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          </div>
                          <div style={{
                            marginTop: 6, fontSize: 10, fontWeight: 600, color: 'var(--text-main)',
                            textAlign: 'center', width: '100%', lineHeight: 1.2,
                            overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
                          }} title={label}>
                            {label}
                          </div>
                          <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>CID {result.cid}</div>
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              void handleImport(result);
                            }}
                            disabled={busy || bulkImporting}
                            title="Import this structure and close"
                            style={{
                              marginTop: 6, width: '100%', padding: '4px 0', borderRadius: 6,
                              border: 'none', fontSize: 10, fontWeight: 700,
                              background: busy ? 'var(--chrome-border)' : 'var(--text-main)',
                              color: busy ? 'var(--text-muted)' : 'var(--bg-color)',
                              cursor: busy ? 'not-allowed' : 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                            }}
                          >
                            {busy ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={11} />}
                            Import
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {pickedMolecules.length > 0 && (
                <div
                  style={{
                    flexShrink: 0,
                    borderTop: '1px solid var(--chrome-border)',
                    background: 'var(--chrome-hover)',
                    padding: '10px 16px 12px',
                    maxHeight: 140,
                    overflowY: 'auto',
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-main)', marginBottom: 8 }}>
                    Selected ({pickedMolecules.length}) — kept when you run a new search
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    {pickedMolecules.map(m => (
                      <div
                        key={m.cid}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '4px 6px 4px 10px',
                          borderRadius: 8,
                          border: '1px solid var(--chrome-border-strong)',
                          background: 'var(--chrome-bg-elevated)',
                          fontSize: 11,
                          maxWidth: '100%',
                        }}
                      >
                        <span
                          style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: 160,
                            fontWeight: 500,
                            color: 'var(--text-main)',
                          }}
                          title={`${m.name} (CID ${m.cid})`}
                        >
                          {m.name}
                        </span>
                        <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>CID {m.cid}</span>
                        <button
                          type="button"
                          onClick={() => removePick(m.cid)}
                          title="Remove from selection"
                          style={{
                            flexShrink: 0,
                            width: 22,
                            height: 22,
                            padding: 0,
                            border: 'none',
                            borderRadius: 4,
                            background: 'var(--chrome-hover)',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            fontSize: 14,
                            lineHeight: 1,
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{
                padding: '10px 16px', borderTop: '1px solid var(--chrome-hover)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                flexShrink: 0,
              }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Data:{' '}
                  <a href="https://pubchem.ncbi.nlm.nih.gov" target="_blank" rel="noopener noreferrer"
                    style={{ color: 'var(--text-main)', textDecoration: 'underline', textUnderlineOffset: 2 }}>
                    PubChem / NCBI
                  </a>
                </span>
                {results.length > 0 && (
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{results.length} hits (max {SEARCH_MAX_RECORDS})</span>
                )}
              </div>
            </div>
          </div>
        )}
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};
