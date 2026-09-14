import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  create3DmolViewer,
  disposeViewerHost,
  type Viewer3DExportViewer,
  type Viewer3DHandle,
} from '@moldraw/viewer-3d';
import {
  extractPdbTitle,
  fetchPdbById,
  parsePdbChains,
  readPdbFile,
} from './pdbUtils';
import { refreshProteinStyles } from './proteinStyles';
import { SequenceStrip } from './SequenceStrip';
import { SelectionStylePopup } from './SelectionStylePopup';
import { ProteinToolbar } from './ProteinToolbar';
import {
  styleForSelection,
  selectionKey,
  upsertStyledRegion,
} from './styleUtils';
import { DEFAULT_HELIX_LABEL, DEFAULT_HELIX_PDB } from './defaultPdb';
import {
  DEFAULT_GLOBAL_STYLE,
  DEFAULT_SELECTION_STYLE,
  type ProteinChain,
  type ProteinStyleSettings,
  type ResidueSelection,
  type StyledRegion,
} from './types';

const DEFAULT_PDB_ID = '1CRN';

export interface ProteinViewerTabProps {
  backgroundColor?: string;
}

export function ProteinViewerTab({ backgroundColor = '#f8fafc' }: ProteinViewerTabProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer3DHandle | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modelLoadedRef = useRef(false);
  const defaultLoadedRef = useRef(false);

  const [pdbText, setPdbText] = useState<string | null>(null);
  const [title, setTitle] = useState<string>('Loading…');
  const [chains, setChains] = useState<ProteinChain[]>([]);
  const [pdbIdInput, setPdbIdInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<ResidueSelection[]>([]);
  const [globalStyle, setGlobalStyle] = useState(DEFAULT_GLOBAL_STYLE);
  const [selectionStyle, setSelectionStyle] = useState(DEFAULT_SELECTION_STYLE);
  const [styledRegions, setStyledRegions] = useState<StyledRegion[]>([]);
  const [selectionPopupOpen, setSelectionPopupOpen] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  const applyStyles = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer || !modelLoadedRef.current) return;
    refreshProteinStyles(viewer, globalStyle, styledRegions);
  }, [globalStyle, styledRegions]);

  const loadPdb = useCallback((text: string, label?: string) => {
    setError(null);
    setPdbText(text);
    setChains(parsePdbChains(text));
    setSelection([]);
    setStyledRegions([]);
    setSelectionPopupOpen(false);
    setSelectionStyle(DEFAULT_SELECTION_STYLE);
    setTitle(label ?? extractPdbTitle(text) ?? 'Protein structure');
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      setLoading(true);
      try {
        loadPdb(await readPdbFile(file), file.name);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [loadPdb],
  );

  const handleFetchId = useCallback(async () => {
    if (!pdbIdInput.trim()) return;
    setLoading(true);
    setError(null);
    try {
      loadPdb(await fetchPdbById(pdbIdInput), `PDB ${pdbIdInput.trim().toUpperCase()}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [pdbIdInput, loadPdb]);

  // Load 1CRN by default; fall back to a bundled helix if RCSB is offline.
  useEffect(() => {
    if (defaultLoadedRef.current) return;
    defaultLoadedRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const text = await fetchPdbById(DEFAULT_PDB_ID);
        if (!cancelled) loadPdb(text, `PDB ${DEFAULT_PDB_ID}`);
      } catch {
        if (!cancelled) loadPdb(DEFAULT_HELIX_PDB, DEFAULT_HELIX_LABEL);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadPdb]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    setInitError(null);
    const viewer = create3DmolViewer(el, { backgroundColor });
    if (!viewer) {
      setInitError('WebGL is unavailable — cannot render 3D protein.');
      return;
    }
    viewerRef.current = viewer;
    return () => {
      viewerRef.current = null;
      modelLoadedRef.current = false;
      disposeViewerHost(el);
    };
  }, [backgroundColor]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (!pdbText) {
      viewer.clear();
      modelLoadedRef.current = false;
      viewer.render();
      return;
    }
    viewer.clear();
    viewer.addModel(pdbText, 'pdb');
    viewer.zoomTo();
    modelLoadedRef.current = true;
  }, [pdbText]);

  useEffect(() => {
    applyStyles();
  }, [applyStyles]);

  // Live-update region style while editing selection
  useEffect(() => {
    if (selection.length === 0) return;
    setStyledRegions(prev => upsertStyledRegion(prev, selection, selectionStyle));
  }, [selection, selectionStyle]);

  const handleSelectionChange = useCallback(
    (sel: ResidueSelection[]) => {
      setSelection(sel);
      if (sel.length > 0) {
        setSelectionStyle(styleForSelection(styledRegions, sel));
      }
    },
    [styledRegions],
  );

  const handleSelectionStyleChange = useCallback((next: ProteinStyleSettings) => {
    setSelectionStyle(next);
  }, []);

  const removeCurrentRegion = useCallback(() => {
    if (selection.length === 0) return;
    const key = selectionKey(selection);
    setStyledRegions(prev => prev.filter(r => selectionKey(r.residues) !== key));
    setSelectionStyle(DEFAULT_SELECTION_STYLE);
  }, [selection]);

  const getViewer = useCallback((): Viewer3DExportViewer | null => {
    const v = viewerRef.current;
    return v ? (v as unknown as Viewer3DExportViewer) : null;
  }, []);

  return (
    <div className="protein-viewer">
      <ProteinToolbar
        globalStyle={globalStyle}
        onGlobalStyleChange={setGlobalStyle}
        pdbText={pdbText}
        title={title}
        getViewer={getViewer}
        loading={loading}
        onOpenFile={() => fileInputRef.current?.click()}
        pdbIdInput={pdbIdInput}
        onPdbIdChange={setPdbIdInput}
        onFetchPdb={() => void handleFetchId()}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdb,.ent,.cif"
        className="protein-viewer__file-input"
        onChange={e => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void handleFile(file);
        }}
      />

      {error && <div className="protein-viewer__error">{error}</div>}

      <div
        className="protein-viewer__stage-wrap"
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          e.preventDefault();
          const file = e.dataTransfer.files?.[0];
          if (file) void handleFile(file);
        }}
      >
        <div ref={hostRef} className="protein-viewer__stage" />
        {initError && (
          <div className="protein-viewer__placeholder protein-viewer__error">{initError}</div>
        )}
        {loading && (
          <div className="protein-viewer__loading" aria-busy="true">
            Loading…
          </div>
        )}
      </div>

      <div className="protein-seq-wrap">
        <SequenceStrip
          chains={chains}
          selection={selection}
          onSelectionChange={handleSelectionChange}
          onSelectionComplete={() => setSelectionPopupOpen(true)}
        />
        <SelectionStylePopup
          open={selectionPopupOpen && selection.length > 0}
          count={selection.length}
          regionCount={styledRegions.length}
          style={selectionStyle}
          onStyleChange={handleSelectionStyleChange}
          onClose={() => setSelectionPopupOpen(false)}
          onClear={() => {
            setSelection([]);
            setSelectionPopupOpen(false);
          }}
          onRemoveRegion={removeCurrentRegion}
        />
      </div>
    </div>
  );
}
