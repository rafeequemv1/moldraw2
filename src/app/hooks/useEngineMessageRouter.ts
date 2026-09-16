import { useLayoutEffect } from 'react';
import type { Molecule } from '@moldraw/domain';
import { parseMolblock } from '@moldraw/core/io/molblock';
import { CMD } from '@moldraw/core/commands/registry';
import type { CommandResult } from '@moldraw/core/commands';
import type { MoleculeWorkerResponse } from '@moldraw/core/moleculeWorker/messages';
import type { CipStereoTags, StructureCheckResult } from '@moldraw/engine-2d';
import { saveBlobToDisk, writeBlobToHandle } from '../importExport/saveFileToDisk';
import { stripExplicitHydrogens, placeImportedMolecule } from '@moldraw/core/molecule/importPlacement';
import {
  PLACE_FRAGMENT_TOOL_ID,
  prepareFragmentFromSmilesMol,
  scaleFragmentToBondLength,
  type FragmentPlacementSession,
} from '@moldraw/core/molecule/fragmentPlacement';
import type { InfoPanelData } from '../components';

export type EnginePendingConvertDownload = {
  filename: string;
  mime: string;
  base64Binary?: boolean;
  fileHandle?: FileSystemFileHandle;
};

export type BatchWorkerWaitMap = Map<
  string,
  { resolve: (v: unknown) => void; reject: (e: Error) => void }
>;

export interface UseEngineMessageRouterOptions {
  engineMsgRef: React.MutableRefObject<(msg: MoleculeWorkerResponse) => void>;
  importMolblockRef: React.MutableRefObject<
    (
      molblock: string,
      meta?: {
        compoundName?: string;
        iupacName?: string;
        useViewportGrid?: boolean;
        startFreshGrid?: boolean;
        placeBesideExisting?: boolean;
      },
    ) => Promise<string[]>
  >;
  importMolblock: (
    molblock: string,
    meta?: {
      compoundName?: string;
      iupacName?: string;
      useViewportGrid?: boolean;
      startFreshGrid?: boolean;
      placeBesideExisting?: boolean;
    },
  ) => Promise<string[]>;

  applyCommand: (commandId: string, input: unknown) => CommandResult;

  enrichImportPendingRef: React.MutableRefObject<Map<string, { resolve: (mb: string) => void }>>;
  aiWorkerPendingRef: React.MutableRefObject<
    Map<string, { resolve: (r: { ok: boolean; error?: string; data?: unknown }) => void }>
  >;
  /** @deprecated alias — same as aiWorkerPendingRef */
  aiCleanupPendingRef?: React.MutableRefObject<
    Map<string, { resolve: (r: { ok: boolean; error?: string; data?: unknown }) => void }>
  >;
  localCleanupRequestsRef: React.MutableRefObject<Map<string, string[]>>;
  clearCleanupWatchdog?: () => void;
  automapPendingRef: React.MutableRefObject<{
    reactAtomIds: string[];
    prodAtomIds: string[];
  } | null>;
  batchWorkerWaitRef: React.MutableRefObject<BatchWorkerWaitMap>;
  pendingConvertDownloadRef: React.MutableRefObject<EnginePendingConvertDownload>;
  /** When non-null, CONVERT_SUCCESS for copy_* ids writes text to the clipboard. */
  pendingConvertCopyLabelRef: React.MutableRefObject<string | null>;
  pendingSmilesDownloadName: React.MutableRefObject<string>;
  latestStereoRequestRef: React.MutableRefObject<string>;
  viewportInfoRef: React.MutableRefObject<{ x: number; y: number; zoom: number }>;
  contextMenuRef: React.MutableRefObject<{ worldX: number; worldY: number } | null>;
  bondLengthPxRef: React.MutableRefObject<number>;
  placementRestoreToolRef: React.MutableRefObject<string>;

  setCipStereoTags: (tags: CipStereoTags | null) => void;
  setStructureCheck: (r: StructureCheckResult | null) => void;
  setInfoData: React.Dispatch<React.SetStateAction<InfoPanelData | null>>;
  setSmilesBarHint: (hint: string) => void;
  setSelectedAtomIds: (ids: string[]) => void;
  setSelectedReactionArrowId: (id: string | null) => void;
  setFragmentPlacement: React.Dispatch<React.SetStateAction<FragmentPlacementSession | null>>;
  setActiveTool: (tool: string) => void;
  /** Optional: tidy SMILES paste / startup seed after merge. */
  runLocalCleanupRef?: React.MutableRefObject<(seedAtomIds: Set<string>) => void>;
  /** After unfold-all hydrogens, run full-structure cleanup. */
  onCleanupStructureRef?: React.MutableRefObject<() => void>;
  /** Re-select all atoms after startup seed cleanup (selection boundary on first visit). */
  startupSeedCleanupRef?: React.MutableRefObject<boolean>;
  getMolecule?: () => Molecule;
}

export function useEngineMessageRouter(opts: UseEngineMessageRouterOptions): void {
  useLayoutEffect(() => {
    const {
      applyCommand,
      enrichImportPendingRef,
      aiWorkerPendingRef: aiWorkerPendingRefOpt,
      aiCleanupPendingRef,
      localCleanupRequestsRef,
      clearCleanupWatchdog,
      automapPendingRef,
      batchWorkerWaitRef,
      pendingConvertDownloadRef,
      pendingConvertCopyLabelRef,
      pendingSmilesDownloadName,
      latestStereoRequestRef,
      viewportInfoRef,
      contextMenuRef,
      bondLengthPxRef,
      placementRestoreToolRef,
      setCipStereoTags,
      setStructureCheck,
      setInfoData,
      setSmilesBarHint,
      setSelectedAtomIds,
      setSelectedReactionArrowId,
      setFragmentPlacement,
      setActiveTool,
      importMolblockRef,
      engineMsgRef,
      importMolblock,
      runLocalCleanupRef,
      onCleanupStructureRef,
      startupSeedCleanupRef,
      getMolecule,
    } = opts;

    const aiWorkerPendingRef = aiWorkerPendingRefOpt ?? aiCleanupPendingRef!;
    const resolveAiPending = (
      id: string,
      result: { ok: boolean; error?: string; data?: unknown },
    ): boolean => {
      const pending = aiWorkerPendingRef.current.get(id);
      if (!pending) return false;
      aiWorkerPendingRef.current.delete(id);
      pending.resolve(result);
      return true;
    };

    importMolblockRef.current = importMolblock;
    engineMsgRef.current = (msg: MoleculeWorkerResponse) => {
      if (msg.type === 'ENRICH_IMPORT_MOLBLOCK_SUCCESS') {
        const pending = enrichImportPendingRef.current.get(msg.id);
        if (pending) {
          enrichImportPendingRef.current.delete(msg.id);
          pending.resolve(msg.payload.molBlock);
        }
      } else if (msg.type === 'CLEANUP_SUCCESS') {
        clearCleanupWatchdog?.();
        if (msg.payload.source) {
          console.info(`[cleanup] source=${msg.payload.source}`);
        }
        // Local cleanup: a connected sub-fragment was sent for re-layout.
        // Splice the cleaned positions back in place, leaving every other
        // atom (and all bonds, charges, aliases, lone pairs, strokes,
        // arrows, canvas texts, ring fills) untouched.
        if (msg.id.startsWith('cleanup-local:')) {
          const subsetIds = localCleanupRequestsRef.current.get(msg.id);
          localCleanupRequestsRef.current.delete(msg.id);
          if (!subsetIds) return;
          const localResult = applyCommand(CMD.ApplyCleanupResult, {
            mode: 'local',
            subsetAtomIds: [...subsetIds],
            molBlock: msg.payload.molBlock,
          });
          if (!localResult.ok) {
            console.error('Local cleanup apply failed:', localResult.error);
            alert(localResult.error?.message ?? 'Could not apply cleanup result.');
          } else if (startupSeedCleanupRef?.current) {
            startupSeedCleanupRef.current = false;
            setSmilesBarHint?.('');
            const mol = getMolecule?.();
            if (mol && mol.atoms.length > 0) {
              setSelectedAtomIds(mol.atoms.map(a => a.id));
              setActiveTool('select');
            }
          }
          return;
        }
        const cleanupResult = applyCommand(CMD.ApplyCleanupResult, {
          mode: 'global',
          molBlock: msg.payload.molBlock,
        });
        if (!cleanupResult.ok) {
          console.error('Cleanup apply failed:', cleanupResult.error);
          alert(cleanupResult.error?.message ?? 'Could not apply cleanup result.');
        }
        resolveAiPending(msg.id, {
          ok: cleanupResult.ok,
          error: cleanupResult.ok ? undefined : cleanupResult.error?.message,
        });
      } else if (msg.type === 'CLEANUP_ERROR') {
        clearCleanupWatchdog?.();
        if (resolveAiPending(msg.id, { ok: false, error: msg.error ?? 'Cleanup failed' })) {
          return;
        }
        console.error('Cleanup Error:', msg.error);
        alert('Could not clean up structure. Ensure chemistry is valid.');
      } else if (msg.type === 'GET_STEREO_TAGS_SUCCESS') {
        if (msg.id.startsWith('ai-stereo:')) {
          resolveAiPending(msg.id, { ok: true, data: { tags: msg.payload?.tags ?? null } });
        }
        if (msg.id !== latestStereoRequestRef.current && !msg.id.startsWith('ai-stereo:')) return;
        if (!msg.id.startsWith('ai-stereo:')) {
          setCipStereoTags(msg.payload?.tags ?? null);
        } else {
          setCipStereoTags(msg.payload?.tags ?? null);
        }
      } else if (msg.type === 'GET_STEREO_TAGS_ERROR') {
        if (msg.id.startsWith('ai-stereo:')) {
          resolveAiPending(msg.id, { ok: false, error: msg.error ?? 'CIP stereo failed' });
          return;
        }
        if (msg.id !== latestStereoRequestRef.current) return;
        setCipStereoTags(null);
      } else if (msg.type === 'GET_SMILES_SUCCESS' && msg.id.startsWith('ai-smiles-export:')) {
        resolveAiPending(msg.id, { ok: true, data: { smiles: msg.payload.smiles } });
      } else if (msg.type === 'GET_SMILES_ERROR' && msg.id.startsWith('ai-smiles-export:')) {
        resolveAiPending(msg.id, { ok: false, error: msg.error ?? 'SMILES export failed' });
      } else if (msg.type === 'CONVERT_SUCCESS' && msg.id.startsWith('copy_')) {
        const label = pendingConvertCopyLabelRef.current ?? msg.payload.format;
        pendingConvertCopyLabelRef.current = null;
        void navigator.clipboard.writeText(msg.payload.output).then(
          () => {
            setSmilesBarHint(`Copied ${label}`);
            window.setTimeout(() => setSmilesBarHint(''), 2000);
          },
          err => {
            console.error('Clipboard error:', err);
            setSmilesBarHint('Copy failed');
            window.setTimeout(() => setSmilesBarHint(''), 2800);
          },
        );
      } else if (
        msg.type === 'CONVERT_SUCCESS' &&
        (msg.id === 'download_inchi' ||
          msg.id === 'download_smarts' ||
          msg.id === 'download_cml' ||
          msg.id === 'download_rxn' ||
          msg.id === 'download_cdx')
      ) {
        const meta = pendingConvertDownloadRef.current;
        const deliver = async (blob: Blob) => {
          if (meta.fileHandle) {
            try {
              await writeBlobToHandle(meta.fileHandle, blob);
              return;
            } catch {
              /* fall through to picker / download */
            }
          }
          await saveBlobToDisk({
            suggestedName: meta.filename,
            blob,
            mimeType: meta.mime,
            description: meta.filename,
            extensions: [`.${meta.filename.split('.').pop() || 'dat'}`],
          });
        };
        if (meta.base64Binary) {
          try {
            const bin = atob(msg.payload.output.replace(/\s+/g, ''));
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            void deliver(new Blob([bytes], { type: meta.mime }));
          } catch {
            alert('ChemDraw .cdx export failed (invalid base64 from Indigo).');
          }
        } else {
          void deliver(new Blob([msg.payload.output], { type: meta.mime }));
        }
      } else if (msg.type === 'CONVERT_SUCCESS' && msg.id === 'info_inchi') {
        setInfoData(prev =>
          prev ? { ...prev, inchi: msg.payload.output, inchiLoading: false } : null,
        );
      } else if (msg.type === 'CONVERT_ERROR' && msg.id === 'info_inchi') {
        setInfoData(prev => (prev ? { ...prev, inchiLoading: false } : null));
      } else if (msg.type === 'CONVERT_ERROR' && msg.id.startsWith('copy_')) {
        pendingConvertCopyLabelRef.current = null;
        setSmilesBarHint(msg.error || 'Copy failed');
        window.setTimeout(() => setSmilesBarHint(''), 3200);
      } else if (
        msg.type === 'CONVERT_ERROR' &&
        (msg.id === 'download_inchi' ||
          msg.id === 'download_smarts' ||
          msg.id === 'download_cml' ||
          msg.id === 'download_rxn' ||
          msg.id === 'download_cdx')
      ) {
        alert(msg.error || 'Export failed');
      } else if (msg.type === 'CHECK_STRUCTURE_SUCCESS') {
        setStructureCheck(msg.payload);
        if (msg.id.startsWith('ai-check:')) {
          resolveAiPending(msg.id, { ok: true, data: msg.payload });
        } else if (msg.payload.ok) {
          setSmilesBarHint('Structure check: no issues');
          window.setTimeout(() => setSmilesBarHint(''), 3200);
        } else {
          const n = msg.payload.issues.length;
          setSmilesBarHint(`Structure check: ${n} issue${n === 1 ? '' : 's'} (see Info)`);
          window.setTimeout(() => setSmilesBarHint(''), 3200);
        }
      } else if (msg.type === 'CHECK_STRUCTURE_ERROR') {
        if (msg.id.startsWith('ai-check:')) {
          resolveAiPending(msg.id, { ok: false, error: msg.error ?? 'Structure check failed' });
        } else {
          setStructureCheck(null);
          alert(msg.error || 'Structure check failed');
        }
      } else if (msg.type === 'AROMATIZE_SUCCESS') {
        const mode = msg.id.includes('dearomatize') ? 'dearomatize' : 'aromatize';
        const r = applyCommand(CMD.Aromatize, { mode, molBlock: msg.payload.molBlock });
        if (msg.id.startsWith('ai-aromatize:')) {
          resolveAiPending(msg.id, {
            ok: r.ok,
            error: r.ok ? undefined : r.error?.message,
            data: { mode },
          });
        }
      } else if (msg.type === 'AROMATIZE_ERROR') {
        if (msg.id.startsWith('ai-aromatize:')) {
          resolveAiPending(msg.id, { ok: false, error: msg.error ?? 'Aromatize/dearomatize failed' });
        } else {
          alert(msg.error || 'Aromatize/dearomatize failed');
        }
      } else if (msg.type === 'CONVERT_EXPLICIT_HYDROGENS_SUCCESS') {
        const result = applyCommand(CMD.ApplyExplicitHydrogens, {
          mode: msg.payload.mode,
          molBlock: msg.payload.molBlock,
        });
        if (msg.id.startsWith('ai-explicit-h:')) {
          resolveAiPending(msg.id, {
            ok: result.ok,
            error: result.ok ? undefined : result.error?.message,
            data: { mode: msg.payload.mode },
          });
        } else if (!result.ok) {
          alert(result.error?.message ?? 'Could not apply explicit-hydrogen convert.');
        } else if (msg.id === 'explicit-hydrogens-cleanup') {
          queueMicrotask(() => onCleanupStructureRef?.current?.());
        }
      } else if (msg.type === 'CONVERT_EXPLICIT_HYDROGENS_ERROR') {
        if (msg.id.startsWith('ai-explicit-h:')) {
          resolveAiPending(msg.id, {
            ok: false,
            error: msg.error || 'Explicit-hydrogen convert failed',
          });
        } else {
          alert(msg.error || 'Explicit-hydrogen convert failed');
        }
      } else if (msg.type === 'CALCULATE_PROPERTIES_SUCCESS' && msg.id === 'info_indigo') {
        setInfoData(prev =>
          prev
            ? {
                ...prev,
                indigo: {
                  loading: false,
                  formula: msg.payload.calculated?.grossFormula ?? null,
                  mw: msg.payload.calculated?.molecularWeight ?? null,
                  exactMass: msg.payload.calculated?.monoisotopicMass ?? null,
                  massComposition: msg.payload.calculated?.massComposition ?? null,
                  logP: msg.payload.druglike?.logP ?? null,
                  pKa: msg.payload.druglike?.pKa ?? null,
                  molarRefractivity: msg.payload.druglike?.molarRefractivity ?? null,
                },
              }
            : null,
        );
      } else if (msg.type === 'CALCULATE_PROPERTIES_ERROR' && msg.id === 'info_indigo') {
        setInfoData(prev =>
          prev ? { ...prev, indigo: { loading: false } } : null,
        );
      } else if (msg.type === 'AUTOMAP_SUCCESS') {
        const pending = automapPendingRef.current;
        automapPendingRef.current = null;
        if (!pending) return;
        // Prefer flat map list aligned to reactant atoms then product atoms
        // (Indigo may split disconnected reactants into multiple $MOL blocks).
        const flat = msg.payload.maps;
        const nReact = pending.reactAtomIds.length;
        const nProd = pending.prodAtomIds.length;
        let reactMaps = flat.slice(0, nReact);
        let prodMaps = flat.slice(nReact, nReact + nProd);
        const byComp = msg.payload.mapsByComponent;
        if (
          reactMaps.length !== nReact &&
          byComp.length >= 2
        ) {
          reactMaps = byComp.slice(0, -1).flat();
          prodMaps = byComp[byComp.length - 1] ?? [];
        }
        const mapsByAtomId: Record<string, number> = {};
        pending.reactAtomIds.forEach((id, i) => {
          const m = reactMaps[i] ?? 0;
          if (m > 0) mapsByAtomId[id] = m;
        });
        pending.prodAtomIds.forEach((id, i) => {
          const m = prodMaps[i] ?? 0;
          if (m > 0) mapsByAtomId[id] = m;
        });
        const clearIds = [...pending.reactAtomIds, ...pending.prodAtomIds];
        const clearPatch: Record<string, number> = {};
        for (const id of clearIds) clearPatch[id] = 0;
        applyCommand(CMD.ApplyAtomMaps, {
          mapsByAtomId: { ...clearPatch, ...mapsByAtomId },
        });
        const n = Object.keys(mapsByAtomId).length;
        setSmilesBarHint(n > 0 ? `Automap: ${n} atoms mapped` : 'Automap: no maps assigned');
        window.setTimeout(() => setSmilesBarHint(''), 3200);
        if (msg.id.startsWith('ai-automap:')) {
          resolveAiPending(msg.id, { ok: true, data: { mappedAtomCount: n } });
        }
      } else if (msg.type === 'AUTOMAP_ERROR') {
        automapPendingRef.current = null;
        if (msg.id.startsWith('ai-automap:')) {
          resolveAiPending(msg.id, {
            ok: false,
            error: msg.error || 'Automap failed — draw reactants, a reaction arrow, and products',
          });
        } else {
          alert(msg.error || 'Automap failed — draw reactants, a reaction arrow, and products');
        }
      } else if (msg.type === 'AUTOMAP_DEMO_SUCCESS') {
        const reactParsed = stripExplicitHydrogens(parseMolblock(msg.payload.reactMolBlock));
        const prodParsed = stripExplicitHydrogens(parseMolblock(msg.payload.prodMolBlock));
        if (reactParsed.atoms.length === 0 || prodParsed.atoms.length === 0) {
          alert('Demo reaction layout failed');
          return;
        }
        // Label methyl carbons so the scheme reads as CH₃–Br / CH₃–OH (not bare stubs).
        // Do this after stripExplicitHydrogens — indices from the worker may no longer match.
        const withMethylAliases = (mol: Molecule): Molecule => ({
          ...mol,
          atoms: mol.atoms.map(a =>
            a.element === 'C' ? { ...a, alias: 'CH3' } : a,
          ),
        });
        const reactLabeled = withMethylAliases(reactParsed);
        const prodLabeled = withMethylAliases(prodParsed);

        // Larger than default canvas bond length so the teaching scheme reads clearly.
        const bondLen = Math.max(bondLengthPxRef.current, 64);
        const GAP_BEFORE_ARROW = 90;
        const ARROW_LEN = 180;
        const GAP_AFTER_ARROW = 90;
        const REACT_SHIFT_X = -260;

        const reactPlaced = placeImportedMolecule({
          parsed: reactLabeled,
          slot: { col: 0, row: 0 },
          viewport: viewportInfoRef.current,
          windowWidth: window.innerWidth,
          windowHeight: window.innerHeight,
          mode: 'world_origin',
          bondLengthPx: bondLen,
        });
        const reactAtoms = reactPlaced.atoms.map(a => ({ ...a, x: a.x + REACT_SHIFT_X }));
        const reactMaxX = Math.max(...reactAtoms.map(a => a.x));
        const reactMinY = Math.min(...reactAtoms.map(a => a.y));
        const reactMaxY = Math.max(...reactAtoms.map(a => a.y));
        const reactMidY = (reactMinY + reactMaxY) / 2;

        const prodPlaced = placeImportedMolecule({
          parsed: prodLabeled,
          slot: { col: 0, row: 0 },
          viewport: viewportInfoRef.current,
          windowWidth: window.innerWidth,
          windowHeight: window.innerHeight,
          mode: 'world_origin',
          bondLengthPx: bondLen,
        });
        const prodMidY =
          prodPlaced.atoms.reduce((s, p) => s + p.y, 0) / Math.max(1, prodPlaced.atoms.length);
        const arrowX1 = reactMaxX + GAP_BEFORE_ARROW;
        const arrowX2 = arrowX1 + ARROW_LEN;
        const prodAtoms = prodPlaced.atoms.map(a => ({
          ...a,
          x: a.x - Math.min(...prodPlaced.atoms.map(p => p.x)) + arrowX2 + GAP_AFTER_ARROW,
          y: a.y + (reactMidY - prodMidY),
        }));
        const arrowId = `demo_arr_${Math.random().toString(36).slice(2, 8)}`;
        const newAtomIds = [...reactAtoms, ...prodAtoms].map(a => a.id);
        applyCommand(CMD.InsertDemoReaction, {
          reactAtoms,
          reactBonds: reactPlaced.bonds,
          prodAtoms,
          prodBonds: prodPlaced.bonds,
          arrow: {
            id: arrowId,
            x1: arrowX1,
            y1: reactMidY,
            x2: arrowX2,
            y2: reactMidY,
            kind: 'straight',
            reagentAbove: 'SN2 demo',
            reagentBelow: 'acetone',
            headScale: 1.35,
            strokeWidth: 2.5,
          },
        });
        setSelectedAtomIds(newAtomIds);
        setSelectedReactionArrowId(arrowId);
        setSmilesBarHint('Demo SN2: CH₃Br + OH⁻ → CH₃OH + Br⁻ — click Automap');
        window.setTimeout(() => setSmilesBarHint(''), 4500);
      } else if (msg.type === 'AUTOMAP_DEMO_ERROR') {
        alert(msg.error || 'Could not insert demo reaction');
      } else if (msg.type === 'GET_SMILES_SUCCESS' && (msg.id === 'copy_smiles' || msg.id === 'download_smiles')) {
        if (msg.id === 'copy_smiles') {
          navigator.clipboard.writeText(msg.payload.smiles).catch(err => console.error('Clipboard error:', err));
        } else {
          const blob = new Blob([msg.payload.smiles], { type: 'text/plain' });
          const meta = pendingConvertDownloadRef.current;
          const filename = pendingSmilesDownloadName.current;
          void (async () => {
            if (meta.fileHandle && filename) {
              try {
                await writeBlobToHandle(meta.fileHandle, blob);
                return;
              } catch {
                /* fall through */
              }
            }
            await saveBlobToDisk({
              suggestedName: filename || 'molecule.smi',
              blob,
              mimeType: 'text/plain',
              description: 'SMILES',
              extensions: ['.smi'],
            });
          })();
        }
      } else if (msg.type === 'GET_SMILES_SUCCESS' && msg.id === 'info_smiles') {
        const smiles: string = msg.payload.smiles;
        setInfoData(prev => prev ? { ...prev, smiles, smilesLoading: false } : null);
        // Fetch IUPAC name from PubChem asynchronously
        fetch(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/${encodeURIComponent(smiles)}/property/IUPACName/JSON`)
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            const iupac: string | undefined = data?.PropertyTable?.Properties?.[0]?.IUPACName;
            setInfoData(prev => prev ? { ...prev, iupacName: iupac, iupacLoading: false } : null);
          })
          .catch(() => setInfoData(prev => prev ? { ...prev, iupacLoading: false } : null));
      } else if (msg.type === 'SMILES_TO_MOLBLOCK_SUCCESS' && msg.id.startsWith('batch-')) {
        const w = batchWorkerWaitRef.current.get(msg.id);
        if (w) {
          batchWorkerWaitRef.current.delete(msg.id);
          w.resolve(msg.payload.molBlock);
        }
      } else if (msg.type === 'SMILES_TO_MOLBLOCK_ERROR' && msg.id.startsWith('batch-')) {
        const w = batchWorkerWaitRef.current.get(msg.id);
        if (w) {
          batchWorkerWaitRef.current.delete(msg.id);
          w.reject(new Error(msg.error));
        }
      } else if (
        msg.type === 'SMILES_TO_MOLBLOCK_SUCCESS' &&
        msg.id.startsWith('ai-smiles-') &&
        !msg.id.startsWith('ai-smiles-export:')
      ) {
        const w = batchWorkerWaitRef.current.get(msg.id);
        if (w) {
          batchWorkerWaitRef.current.delete(msg.id);
          w.resolve(msg.payload.molBlock);
        }
      } else if (
        msg.type === 'SMILES_TO_MOLBLOCK_ERROR' &&
        msg.id.startsWith('ai-smiles-') &&
        !msg.id.startsWith('ai-smiles-export:')
      ) {
        const w = batchWorkerWaitRef.current.get(msg.id);
        if (w) {
          batchWorkerWaitRef.current.delete(msg.id);
          w.reject(new Error(msg.error));
        }
      } else if (
        (msg.type === 'SMILES_TO_MOLBLOCK_SUCCESS' ||
          msg.type === 'TEXT_TO_MOLBLOCK_SUCCESS' ||
          msg.type === 'CHEMDRAW_TO_MOLBLOCK_SUCCESS') &&
        msg.id.startsWith('open-file:')
      ) {
        const w = batchWorkerWaitRef.current.get(msg.id);
        if (w) {
          batchWorkerWaitRef.current.delete(msg.id);
          w.resolve(msg.payload.molBlock);
        }
      } else if (
        (msg.type === 'SMILES_TO_MOLBLOCK_ERROR' ||
          msg.type === 'TEXT_TO_MOLBLOCK_ERROR' ||
          msg.type === 'CHEMDRAW_TO_MOLBLOCK_ERROR') &&
        msg.id.startsWith('open-file:')
      ) {
        const w = batchWorkerWaitRef.current.get(msg.id);
        if (w) {
          batchWorkerWaitRef.current.delete(msg.id);
          w.reject(new Error(msg.error));
        }
      } else if (
        msg.type === 'SMILES_TO_MOLBLOCK_SUCCESS' &&
        msg.id.startsWith('template-preview-')
      ) {
        const w = batchWorkerWaitRef.current.get(msg.id);
        if (w) {
          batchWorkerWaitRef.current.delete(msg.id);
          w.resolve(msg.payload.molBlock);
        }
      } else if (msg.type === 'SMILES_TO_MOLBLOCK_ERROR' && msg.id.startsWith('template-preview-')) {
        const w = batchWorkerWaitRef.current.get(msg.id);
        if (w) {
          batchWorkerWaitRef.current.delete(msg.id);
          w.reject(new Error(msg.error));
        }
      } else if (
        msg.type === 'SMILES_TO_MOLBLOCK_SUCCESS' &&
        msg.id.startsWith('placement-prep:')
      ) {
        try {
          const raw = parseMolblock(msg.payload.molBlock);
          // amino / 3D cages → free-place template; FG / ligand → attachable fragment
          const kind =
            msg.id.includes(':amino:') || msg.id.includes(':structure3d:')
              ? 'template'
              : 'functional_group';
          const { fragment, connectionAtomId } = prepareFragmentFromSmilesMol(raw, kind);
          if (fragment.atoms.length === 0) {
            console.warn('placement-prep: empty fragment for', msg.id);
            return;
          }
          const bondLen = bondLengthPxRef.current;
          setFragmentPlacement({
            fragment: scaleFragmentToBondLength(fragment, bondLen),
            connectionAtomId,
            restoreTool: placementRestoreToolRef.current,
            kind: kind === 'functional_group' ? 'functional_group' : 'template',
          });
          setActiveTool(PLACE_FRAGMENT_TOOL_ID);
        } catch (err) {
          console.warn('placement-prep failed:', err);
        }
      } else if (
        msg.type === 'SMILES_TO_MOLBLOCK_SUCCESS' &&
        (msg.id === 'paste_smiles' || msg.id === 'import_smiles')
      ) {
        const pastedMol = stripExplicitHydrogens(parseMolblock(msg.payload.molBlock));
        if (pastedMol.atoms.length === 0) return;

        const getAvgDist = (mol: Molecule) => {
          if (mol.bonds.length === 0) return 1.5;
          let sum = 0;
          for (const b of mol.bonds) {
            const a1 = mol.atoms.find(a => a.id === b.fromAtomId);
            const a2 = mol.atoms.find(a => a.id === b.toAtomId);
            if (a1 && a2) sum += Math.hypot(a1.x - a2.x, a1.y - a2.y);
          }
          return sum / mol.bonds.length;
        };
        const currentScale = getAvgDist(pastedMol);
        const bondLen = bondLengthPxRef.current || 40;
        const scaleRatio = currentScale === 0 ? 1 : bondLen / currentScale;

        let cx = 0;
        let cy = 0;
        if (pastedMol.atoms.length > 0) {
          cx = pastedMol.atoms.reduce((sum, a) => sum + a.x * scaleRatio, 0) / pastedMol.atoms.length;
          cy = pastedMol.atoms.reduce((sum, a) => sum + a.y * scaleRatio, 0) / pastedMol.atoms.length;
        }

        // Startup seed (`import_smiles`): pin centroid at world origin (canvas crosshairs).
        // Paste / context-menu paste keeps cursor or viewport targeting.
        let targetX = 0;
        let targetY = 0;
        if (msg.id !== 'import_smiles') {
          const vp = viewportInfoRef.current;
          targetX = contextMenuRef.current
            ? contextMenuRef.current.worldX
            : vp
              ? (window.innerWidth / 2 - vp.x) / vp.zoom
              : 0;
          targetY = contextMenuRef.current
            ? contextMenuRef.current.worldY
            : vp
              ? (window.innerHeight / 2 - vp.y) / vp.zoom
              : 0;
        }

        const dx = targetX - cx;
        const dy = targetY - cy;

        pastedMol.atoms.forEach(a => {
          a.x = a.x * scaleRatio + dx;
          a.y = a.y * scaleRatio + dy;
        });

        const mergeResult = applyCommand(CMD.MergeImportedStructure, {
          atoms: pastedMol.atoms,
          bonds: pastedMol.bonds,
        });
        if (!mergeResult.ok) {
          console.error('SMILES import apply failed:', mergeResult.error);
          return;
        }
        const newIds = pastedMol.atoms.map(a => a.id);
        setActiveTool('select');
        setSelectedAtomIds(newIds);
        // Tidy imported structures (including startup seed) with native cleanup.
        if (newIds.length > 0 && runLocalCleanupRef) {
          if (msg.id === 'import_smiles' && startupSeedCleanupRef) {
            startupSeedCleanupRef.current = true;
          }
          const seeds = new Set(newIds);
          queueMicrotask(() => runLocalCleanupRef.current(seeds));
        }
      }

    };
  });
}
