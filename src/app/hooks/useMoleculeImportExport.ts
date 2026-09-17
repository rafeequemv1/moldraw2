/**
 * File open / clipboard paste / download / quick PubChem search.
 *
 * Worker CONVERT downloads still complete in the engine `onMessage` router
 * via `pendingConvertDownloadRef` / `pendingSmilesDownloadName` returned here.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CanvasImage, Molecule } from '@moldraw/domain';
import type { CommandResult } from '@moldraw/core/commands';
import type { ResolvedCanvasPreferences } from '@moldraw/core';
import { CMD } from '@moldraw/core/commands/registry';
import { moleculeToMolblock } from '@moldraw/core/io/molblock';
import { moleculeToCdxml } from '@moldraw/core/io/cdxmlFromMolecule';
import { canvasToPdfBlob } from '@moldraw/core/io/pdfExport';
import {
  resolveMoleculeFileBlobToMolblock,
  resolveMoleculeFileToMolblock,
} from '@moldraw/core/io/resolveMoleculeFile';
import { cdxmlToMolecule } from '@moldraw/core/io/cdxmlToMolblock';
import { expandAliasesFor3D } from '@moldraw/core/expand/aliasesFor3D';
import { reactionSmilesSplit } from '@moldraw/core/molecule/partition';
import { buildRxnFromMolblocks } from '@moldraw/engine-2d';
import type { IndigoConvertFormat } from '@moldraw/engine-2d/indigo/types';
import type { MoleculeWorkerClient } from '@moldraw/core/moleculeWorker/client';
import {
  canvasToBlob,
  exportMoleculeBitmap,
  exportMoleculeSvg,
  moleculeHasExportableContent,
  type ExportBackground,
  type StructureThemeColors,
} from '@moldraw/canvas';
import { expandAtomIdsToConnectedFragments } from '@moldraw/canvas/geometry';
import { selectedDocumentFragmentBoxes } from '@moldraw/core/align/selectionArrange';
import type { CopyAsFormat, DownloadFormat } from '../types';
import { COPY_AS_FORMAT_ITEMS } from '../copyAsFormats';
import type { PubChemImportContext } from '../components';
import {
  defaultImportGridOrigin,
  importBesideGapPx,
  importGridCellSize,
  stripExplicitHydrogens,
  placeImportedMolecule,
} from '@moldraw/core/molecule/importPlacement';
import { pubchemMolblockFromSmilesOrName, pubchemMolblockFromCid, looksLikeCompoundName } from '../advanced/batchExport';
import { resolveCompoundNameFromPubChem, looksLikeSmiles } from '../advanced/batchExport/pubchemNameResolve';
import { nativeSmilesTo2DMolblock } from '@moldraw/core/io/smilesToMolblock';
import {
  looksLikeCoordsTableText,
  parseMoleculeCoordsTable,
  resolveCoordsPasteAtomIds,
} from '@moldraw/core/io/moleculeCoordsTable';
import { resetRingPickCycle } from '@moldraw/canvas/interaction';
import {
  canvasImageFromBlob,
  blobAsIllustration,
  isIllustrationFile,
  clipboardEventStructureText,
  looksLikeStructureClipboardText,
  readSystemClipboardPayload,
} from '../importExport/helpers';
import { writeStructurePictureToClipboard } from '../importExport/clipboardPicture';
import {
  moleculeLosesDetailInMolfile,
  parseMoldrawFile,
  sanitizeDesignFilename,
  serializeMoldrawFile,
} from '../importExport/moldrawFile';
import {
  canPickSaveLocation,
  FILE_SAVE_AS_TYPES,
  pickSaveLocation,
  saveBlobToDisk,
  saveTextFileToDisk,
  writeBlobToHandle,
} from '../importExport/saveFileToDisk';
import type { BatchWorkerWaitMap } from './useViewer3DSync';

/** Native folder picker first so the user gesture is not lost after a worker round-trip. */
async function pickConvertSaveTarget(opts: {
  suggestedName: string;
  description: string;
  mimeType: string;
  extensions: string[];
}): Promise<{ filename: string; fileHandle?: FileSystemFileHandle } | null> {
  if (!canPickSaveLocation()) return { filename: opts.suggestedName };
  const picked = await pickSaveLocation({
    suggestedName: opts.suggestedName,
    types: [
      {
        description: opts.description,
        mimeType: opts.mimeType,
        extensions: opts.extensions,
      },
    ],
  });
  if (!picked) return null;
  return { filename: picked.name, fileHandle: picked.handle };
}

export interface UseMoleculeImportExportOptions {
  applyCommand: (commandId: string, input: unknown) => CommandResult;
  bondLengthPx: number;
  imageExportScale: number;
  displayPrefs: ResolvedCanvasPreferences;
  showHydrogens: boolean;
  condensedGroupLabels: boolean;
  colorAtomLabels: boolean;
  applyAtomColorsToBonds: boolean;
  /** Live canvas ink — export remaps light (dark-UI) ink on white/transparent. */
  structureTheme?: StructureThemeColors;
  structureDrawMode?: 'skeletal' | 'ball-stick';
  showCipLabels: boolean;
  cipAtomLabels: ReadonlyMap<string, string> | null;
  cipBondLabels: ReadonlyMap<string, string> | null;
  workerRef: React.MutableRefObject<MoleculeWorkerClient | null>;
  batchWorkerWaitRef: React.MutableRefObject<BatchWorkerWaitMap>;
  viewportInfoRef: React.MutableRefObject<{ x: number; y: number; zoom: number }>;
  molecule: Molecule;
  selectedAtomIds: string[];
  molblockGridSlotRef: React.MutableRefObject<number>;
  /** Stable world center for grid slot (0,0); null until first grid import in a batch. */
  molblockGridOriginRef: React.MutableRefObject<{ x: number; y: number } | null>;
  getSmartPasteTarget: () => { x: number; y: number };
  getPasteContextAtomId?: () => string | null;
  handleAddCanvasImage: (image: CanvasImage) => void;
  setSelectedAtomIds: (ids: string[]) => void;
  setSelectedCanvasTextId: (id: string | null) => void;
  setSelectedReactionArrowId: (id: string | null) => void;
  setPubchemImport: (ctx: PubChemImportContext | null) => void;
  setContextMenu: (menu: null) => void;
  setSmilesBarHint: (hint: string) => void;
  resetAutoCleanup: () => void;
  /** 2D cleanup after import/open so layout + 3D stay consistent. */
  runLocalCleanup?: (seedAtomIds: Set<string>) => void;
  /** Seed 3D viewer when opening a file that already has 3D coords (e.g. XYZ). */
  onApplyExternal3DPose?: (molblock: string, sourceLabel: string) => void;
  /** Mirrored settings flag for SMILES→2D (default true). */
  preferIndigo2dRef?: React.MutableRefObject<boolean>;
  /**
   * Return false to cancel a download / save / copy-as export
   * (e.g. show signup first).
   */
  requireAuth?: () => boolean;
  /** Replace the open document from a native .moldraw file. */
  onLoadDesignFile?: (molecule: Molecule, name: string) => void;
  /** Current tab name — used for Save as ChemDraw filename. */
  projectName?: string;
  /** In-app fragment paste (Ctrl+C copy) when the OS clipboard is not a structure. */
  onFragmentPaste?: () => boolean;
  /** After search/PubChem import: pan to show new atoms without changing zoom. */
  revealAtomsInView?: (atomIds: string[]) => void;
}

export function useMoleculeImportExport({
  applyCommand,
  bondLengthPx,
  imageExportScale,
  displayPrefs,
  showHydrogens,
  condensedGroupLabels,
  colorAtomLabels,
  applyAtomColorsToBonds,
  structureTheme,
  structureDrawMode,
  showCipLabels,
  cipAtomLabels,
  cipBondLabels,
  workerRef,
  batchWorkerWaitRef,
  viewportInfoRef,
  molecule,
  selectedAtomIds,
  molblockGridSlotRef,
  molblockGridOriginRef,
  getSmartPasteTarget,
  getPasteContextAtomId,
  handleAddCanvasImage,
  setSelectedAtomIds,
  setSelectedCanvasTextId,
  setSelectedReactionArrowId,
  setPubchemImport,
  setContextMenu,
  setSmilesBarHint,
  resetAutoCleanup,
  runLocalCleanup,
  onApplyExternal3DPose,
  preferIndigo2dRef,
  onLoadDesignFile,
  projectName = 'design',
  onFragmentPaste,
  revealAtomsInView,
  requireAuth,
}: UseMoleculeImportExportOptions) {
  const [openFileBusy, setOpenFileBusy] = useState(false);
  const [openFileError, setOpenFileError] = useState<string | null>(null);
  const [quickSearch, setQuickSearch] = useState('');
  const [quickSearchLoading, setQuickSearchLoading] = useState(false);
  const [quickSearchError, setQuickSearchError] = useState('');

  const pendingSmilesDownloadName = useRef('molecule.smi');
  const pendingConvertDownloadRef = useRef<{
    filename: string;
    mime: string;
    base64Binary?: boolean;
    fileHandle?: FileSystemFileHandle;
  }>({ filename: 'molecule.inchi', mime: 'chemical/x-inchi' });
  /** When set, CONVERT_SUCCESS copies text to clipboard instead of downloading. */
  const pendingConvertCopyLabelRef = useRef<string | null>(null);
  const lastStructurePasteRef = useRef({ at: 0, text: '' });
  const onFragmentPasteRef = useRef(onFragmentPaste);
  onFragmentPasteRef.current = onFragmentPaste;

  const importMolblock = useCallback(
    async (
      molblock: string,
      meta?: {
        compoundName?: string;
        iupacName?: string;
        useViewportGrid?: boolean;
        /** New neat grid at slot 0. */
        startFreshGrid?: boolean;
        /** Park that grid to the right of existing content. */
        placeBesideExisting?: boolean;
        /** Override placement; search/PubChem use viewport_center like paste. */
        placement?: 'origin' | 'viewport_center';
      },
    ): Promise<string[]> => {
      const useGrid = Boolean(meta?.useViewportGrid);
      const placement = meta?.placement ?? (useGrid ? 'viewport_center' : 'origin');
      /**
       * Do NOT reset the grid from React `molecule` state when atoms.length===0:
       * during async AI batches the store already has atoms but React state lags,
       * which used to reset every import to slot (0,0) / a new viewport origin
       * (structures stacked or scattered). clearAll / startFreshGrid own resets.
       */
      if (useGrid && meta?.startFreshGrid) {
        molblockGridSlotRef.current = 0;
        if (meta.placeBesideExisting && molecule.atoms.length > 0) {
          let maxX = -Infinity;
          let minY = Infinity;
          let maxY = -Infinity;
          for (const a of molecule.atoms) {
            maxX = Math.max(maxX, a.x);
            minY = Math.min(minY, a.y);
            maxY = Math.max(maxY, a.y);
          }
          // Slot (0,0) center sits just right of existing content (short gap + half cell).
          const { cellW } = importGridCellSize(bondLengthPx);
          molblockGridOriginRef.current = {
            x: maxX + importBesideGapPx(bondLengthPx) + cellW / 2,
            y: (minY + maxY) / 2,
          };
        } else {
          molblockGridOriginRef.current = null;
        }
      }
      const slotIndex = molblockGridSlotRef.current;
      if (useGrid) molblockGridSlotRef.current += 1;
      const COLS = 3;
      const slot = { col: slotIndex % COLS, row: Math.floor(slotIndex / COLS) };

      if (useGrid && !molblockGridOriginRef.current) {
        molblockGridOriginRef.current = defaultImportGridOrigin({
          viewport: viewportInfoRef.current,
          windowWidth: window.innerWidth,
          windowHeight: window.innerHeight,
          bondLengthPx,
          cols: COLS,
        });
      }

      const result = applyCommand(CMD.ImportMolblock, {
        molblock,
        mode: 'merge',
        bondLengthPx,
        placement,
        viewport: viewportInfoRef.current,
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
        gridSlot: useGrid ? slot : { col: 0, row: 0 },
        ...(useGrid && molblockGridOriginRef.current
          ? { gridOrigin: molblockGridOriginRef.current }
          : {}),
      });
      if (!result.ok) return [];
      const newIds =
        (result.extra as { newAtomIds?: string[] } | undefined)?.newAtomIds ?? [];
      setSelectedAtomIds(newIds);
      setPubchemImport(
        meta?.compoundName
          ? { atomIds: newIds, compoundName: meta.compoundName, iupacName: meta.iupacName }
          : null,
      );

      const label = meta?.compoundName?.trim();
      if (label && newIds.length > 0) {
        const placed = result.next.atoms.filter(a => newIds.includes(a.id));
        if (placed.length > 0) {
          let minX = Infinity;
          let maxX = -Infinity;
          let maxY = -Infinity;
          for (const a of placed) {
            minX = Math.min(minX, a.x);
            maxX = Math.max(maxX, a.x);
            maxY = Math.max(maxY, a.y);
          }
          applyCommand(CMD.AddCanvasText, {
            text: {
              id: `import-label-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              x: (minX + maxX) / 2,
              y: maxY + 26,
              text: label,
              fontSize: 11,
              color: '#334155',
              fontWeight: 'normal',
            },
          });
        }
      }

      if (newIds.length > 0 && runLocalCleanup) {
        const seeds = new Set(newIds);
        queueMicrotask(() => runLocalCleanup(seeds));
      }

      if (newIds.length > 0) revealAtomsInView?.(newIds);

      return newIds;
    },
    [
      applyCommand,
      bondLengthPx,
      molblockGridSlotRef,
      molblockGridOriginRef,
      molecule.atoms.length,
      runLocalCleanup,
      revealAtomsInView,
      setPubchemImport,
      setSelectedAtomIds,
      viewportInfoRef,
    ],
  );

  const workerMolblockFromText = useCallback(
    (kind: 'smiles' | 'text', input: string): Promise<string> => {
      const client = workerRef.current;
      if (!client) return Promise.reject(new Error('Structure worker is not ready yet.'));
      const id = `open-file:${kind}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      return new Promise<string>((resolve, reject) => {
        batchWorkerWaitRef.current.set(id, {
          resolve: (v: unknown) => resolve(String(v)),
          reject,
        });
        client.post(
          kind === 'smiles'
            ? {
                type: 'SMILES_TO_MOLBLOCK',
                payload: {
                  smiles: input,
                  preferIndigo: preferIndigo2dRef?.current !== false,
                },
                id,
              }
            : { type: 'TEXT_TO_MOLBLOCK', payload: { text: input }, id },
        );
        window.setTimeout(() => {
          if (batchWorkerWaitRef.current.has(id)) {
            batchWorkerWaitRef.current.delete(id);
            reject(new Error('Structure conversion timed out'));
          }
        }, 20000);
      });
    },
    [batchWorkerWaitRef, workerRef, preferIndigo2dRef],
  );

  const workerChemDrawToMolblock = useCallback(
    (data: string, format: 'cdxml' | 'cdx'): Promise<string> => {
      const client = workerRef.current;
      if (!client) return Promise.reject(new Error('Structure worker is not ready yet.'));
      const id = `open-file:chemdraw:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      return new Promise<string>((resolve, reject) => {
        batchWorkerWaitRef.current.set(id, {
          resolve: (v: unknown) => resolve(String(v)),
          reject,
        });
        client.post({
          type: 'CHEMDRAW_TO_MOLBLOCK',
          payload: { data, format },
          id,
        });
        window.setTimeout(() => {
          if (batchWorkerWaitRef.current.has(id)) {
            batchWorkerWaitRef.current.delete(id);
            reject(new Error('ChemDraw conversion timed out — wait for Indigo to finish loading.'));
          }
        }, 45000);
      });
    },
    [batchWorkerWaitRef, workerRef],
  );

  const enrichMolblockForImport = useCallback(async (molblock: string): Promise<string> => molblock, []);

  const placeIllustrationOnCanvas = useCallback(
    async (file: File, hint: string) => {
      const blob = await blobAsIllustration(file);
      const image = await canvasImageFromBlob(blob, getSmartPasteTarget(), file.name);
      handleAddCanvasImage(image);
      setSmilesBarHint(hint);
    },
    [getSmartPasteTarget, handleAddCanvasImage, setSmilesBarHint],
  );

  const handleOpenMoleculeFile = useCallback(
    async (file: File, mode: 'replace' | 'place' = 'replace') => {
      setOpenFileBusy(true);
      setOpenFileError(null);
      try {
        const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
        const baseName = file.name.replace(/\.[^.]+$/, '') || 'structure';
        const place = mode === 'place';

        if (isIllustrationFile(file)) {
          await placeIllustrationOnCanvas(
            file,
            place ? `Placed ${file.name}` : `Opened ${file.name}`,
          );
          return;
        }

        if (ext === 'moldraw') {
          const text = await file.text();
          const parsed = parseMoldrawFile(text);
          if (!parsed) {
            setOpenFileError('Invalid Moldraw design file (.moldraw).');
            return;
          }
          if (place) {
            if (parsed.molecule.atoms.length === 0) {
              const images = parsed.molecule.canvasImages ?? [];
              if (images.length === 0) {
                setOpenFileError('Nothing to place in this Moldraw file.');
                return;
              }
              for (const img of images) {
                handleAddCanvasImage({
                  ...img,
                  id:
                    typeof crypto !== 'undefined' && 'randomUUID' in crypto
                      ? crypto.randomUUID()
                      : Math.random().toString(36).slice(2, 11),
                });
              }
              setSmilesBarHint(`Placed ${parsed.name}`);
              return;
            }
            const mb = moleculeToMolblock(parsed.molecule);
            const newIds = await importMolblock(mb, {
              compoundName: parsed.name,
              placement: 'viewport_center',
            });
            setSelectedAtomIds(newIds);
            setSelectedCanvasTextId(null);
            setSelectedReactionArrowId(null);
            setPubchemImport({ atomIds: newIds, compoundName: parsed.name });
            resetRingPickCycle();
            resetAutoCleanup();
            setSmilesBarHint(`Placed ${parsed.name}`);
            return;
          }
          onLoadDesignFile?.(parsed.molecule, parsed.name);
          const newIds = parsed.molecule.atoms.map(a => a.id);
          setSelectedAtomIds(newIds);
          setSelectedCanvasTextId(null);
          setSelectedReactionArrowId(null);
          setPubchemImport({ atomIds: newIds, compoundName: parsed.name });
          resetRingPickCycle();
          resetAutoCleanup();
          setSmilesBarHint(`Opened ${parsed.name}`);
          return;
        }

        if (ext === 'cdxml' || ext === 'xml') {
          const text = await file.text();
          if (/<CDXML|<cdxml/.test(text)) {
            const parsed = cdxmlToMolecule(text, { bondLengthPx });
            if (!parsed || parsed.atoms.length === 0) {
              setOpenFileError('Could not parse ChemDraw CDXML.');
              return;
            }
            if (place) {
              const mb = moleculeToMolblock(stripExplicitHydrogens(parsed));
              const newIds = await importMolblock(mb, {
                compoundName: baseName,
                placement: 'viewport_center',
              });
              setSelectedAtomIds(newIds);
              setSelectedCanvasTextId(null);
              setSelectedReactionArrowId(null);
              setPubchemImport({ atomIds: newIds, compoundName: baseName });
              resetRingPickCycle();
              resetAutoCleanup();
              setSmilesBarHint(`Placed ${baseName}`);
              return;
            }
            const placed = placeImportedMolecule({
              parsed: stripExplicitHydrogens(parsed),
              slot: { col: 0, row: 0 },
              viewport: viewportInfoRef.current,
              windowWidth: window.innerWidth,
              windowHeight: window.innerHeight,
              mode: 'viewport_grid',
              bondLengthPx,
            });
            applyCommand(CMD.ReplaceImportedStructure, {
              atoms: placed.atoms,
              bonds: placed.bonds,
              keepAnnotations: false,
            });
            const newIds = placed.atoms.map(a => a.id);
            setSelectedAtomIds(newIds);
            setSelectedCanvasTextId(null);
            setSelectedReactionArrowId(null);
            setPubchemImport({ atomIds: newIds, compoundName: baseName });
            resetRingPickCycle();
            resetAutoCleanup();
            if (runLocalCleanup && newIds.length > 0) {
              const seeds = new Set(newIds);
              queueMicrotask(() => runLocalCleanup(seeds));
            }
            return;
          }
        }

        const { molblock: rawMb } = await resolveMoleculeFileBlobToMolblock(file, {
          smilesToMolblock: s => workerMolblockFromText('smiles', s),
          textToMolblock: t => workerMolblockFromText('text', t),
          chemDrawToMolblock: workerChemDrawToMolblock,
        });
        const mb = await enrichMolblockForImport(rawMb);
        const isXyz = ext === 'xyz';

        if (place) {
          const newIds = await importMolblock(mb, {
            compoundName: baseName,
            placement: 'viewport_center',
          });
          setSelectedAtomIds(newIds);
          setSelectedCanvasTextId(null);
          setSelectedReactionArrowId(null);
          setPubchemImport({ atomIds: newIds, compoundName: baseName });
          resetRingPickCycle();
          resetAutoCleanup();
          setSmilesBarHint(`Placed ${baseName}`);
          return;
        }

        const result = applyCommand(CMD.ReplaceFromMolblock, {
          molblock: mb,
          bondLengthPx,
          placement: 'viewport_center',
          keepAnnotations: false,
          viewport: viewportInfoRef.current,
          windowWidth: window.innerWidth,
          windowHeight: window.innerHeight,
          gridSlot: { col: 0, row: 0 },
        });
        if (!result.ok) {
          setOpenFileError(result.error.message);
          return;
        }
        if (isXyz && mb.trim()) {
          onApplyExternal3DPose?.(mb, `XYZ · ${baseName}`);
          setSmilesBarHint('Opened XYZ — 3D coordinates loaded in the 3D pane');
        }
        const newIds =
          (result.extra as { newAtomIds?: string[] } | undefined)?.newAtomIds ?? [];
        setSelectedAtomIds(newIds);
        setSelectedCanvasTextId(null);
        setSelectedReactionArrowId(null);
        setPubchemImport({ atomIds: newIds, compoundName: baseName });
        resetRingPickCycle();
        resetAutoCleanup();
        // XYZ already carries 3D coords — skip 2D cleanup that would reshape the projection.
        if (!isXyz && runLocalCleanup && newIds.length > 0) {
          const seeds = new Set(newIds);
          queueMicrotask(() => runLocalCleanup(seeds));
        }
      } catch (err) {
        setOpenFileError(err instanceof Error ? err.message : String(err));
      } finally {
        setOpenFileBusy(false);
      }
    },
    [
      applyCommand,
      bondLengthPx,
      enrichMolblockForImport,
      handleAddCanvasImage,
      importMolblock,
      onApplyExternal3DPose,
      onLoadDesignFile,
      placeIllustrationOnCanvas,
      resetAutoCleanup,
      runLocalCleanup,
      setPubchemImport,
      setSelectedAtomIds,
      setSelectedCanvasTextId,
      setSelectedReactionArrowId,
      setSmilesBarHint,
      viewportInfoRef,
      workerChemDrawToMolblock,
      workerMolblockFromText,
    ],
  );

  const handlePlaceOnCanvas = useCallback(
    (file: File) => handleOpenMoleculeFile(file, 'place'),
    [handleOpenMoleculeFile],
  );

  const importClipboardMolblock = useCallback(
    async (molblock: string): Promise<string[]> => {
      const mb = await enrichMolblockForImport(molblock);
      const result = applyCommand(CMD.ImportMolblock, {
        molblock: mb,
        mode: 'merge',
        bondLengthPx,
        placement: 'viewport_center',
        viewport: viewportInfoRef.current,
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
        gridSlot: { col: 0, row: 0 },
      });
      if (!result.ok) throw new Error(result.error.message);
      const newIds =
        (result.extra as { newAtomIds?: string[] } | undefined)?.newAtomIds ?? [];
      setSelectedAtomIds(newIds);
      setSelectedCanvasTextId(null);
      setSelectedReactionArrowId(null);
      resetRingPickCycle();
      resetAutoCleanup();
      if (runLocalCleanup && newIds.length > 0) {
        const seeds = new Set(newIds);
        queueMicrotask(() => runLocalCleanup(seeds));
      }
      if (newIds.length > 0) revealAtomsInView?.(newIds);
      return newIds;
    },
    [
      applyCommand,
      bondLengthPx,
      enrichMolblockForImport,
      resetAutoCleanup,
      revealAtomsInView,
      runLocalCleanup,
      setSelectedAtomIds,
      setSelectedCanvasTextId,
      setSelectedReactionArrowId,
      viewportInfoRef,
    ],
  );

  const resolveCoordsPasteSeeds = useCallback((): string[] => {
    if (selectedAtomIds.length > 0) return selectedAtomIds;
    const contextAtomId = getPasteContextAtomId?.();
    return contextAtomId ? [contextAtomId] : [];
  }, [getPasteContextAtomId, selectedAtomIds]);

  const tryPasteCoordsTable = useCallback(
    async (text: string, showErrors = false): Promise<boolean> => {
      if (!looksLikeCoordsTableText(text)) return false;
      const parsed = parseMoleculeCoordsTable(text);
      if (!parsed.ok) {
        if (showErrors) setOpenFileError(parsed.error);
        return true;
      }
      const atomIds = resolveCoordsPasteAtomIds(molecule, resolveCoordsPasteSeeds());
      if (!atomIds.length) {
        if (showErrors) {
          setOpenFileError(
            'Select the structure (or right-click it) before pasting a coordinate table.',
          );
        }
        return true;
      }
      const result = applyCommand(CMD.ApplyCoordsTable, { atomIds, rows: parsed.rows });
      if (!result.ok) {
        if (showErrors) setOpenFileError('Could not apply coordinates');
        return true;
      }
      const extra = result.extra as { applied?: number; skipped?: number } | undefined;
      const applied = extra?.applied ?? parsed.rows.length;
      const skipped = extra?.skipped ?? 0;
      const suffix = skipped > 0 ? ` (${skipped} row${skipped === 1 ? '' : 's'} skipped)` : '';
      setSmilesBarHint(`Pasted coordinates for ${applied} atom${applied === 1 ? '' : 's'}${suffix}`);
      window.setTimeout(() => setSmilesBarHint(''), 2800);
      return true;
    },
    [applyCommand, molecule, resolveCoordsPasteSeeds, setSmilesBarHint],
  );

  const handlePasteTextToCanvas = useCallback(
    async (text: string, showErrors = false): Promise<boolean> => {
      const trimmed = text.trim();
      if (!trimmed || !looksLikeStructureClipboardText(trimmed)) return false;
      const now = Date.now();
      if (
        lastStructurePasteRef.current.text === trimmed &&
        now - lastStructurePasteRef.current.at < 700
      ) {
        return true;
      }
      lastStructurePasteRef.current = { at: now, text: trimmed };
      try {
        const { molblock, format } = await resolveMoleculeFileToMolblock(trimmed, 'clipboard.txt', {
          smilesToMolblock: s => workerMolblockFromText('smiles', s),
          textToMolblock: t => workerMolblockFromText('text', t),
          chemDrawToMolblock: workerChemDrawToMolblock,
          preferPubChem2D: false,
        });
        await importClipboardMolblock(molblock);
        if (format === 'smiles') {
          setSmilesBarHint('Pasted SMILES');
          window.setTimeout(() => setSmilesBarHint(''), 2500);
        }
        return true;
      } catch (err) {
        if (showErrors) setOpenFileError(err instanceof Error ? err.message : String(err));
        return false;
      }
    },
    [
      importClipboardMolblock,
      setSmilesBarHint,
      workerChemDrawToMolblock,
      workerMolblockFromText,
    ],
  );

  const handlePasteImageBlob = useCallback(
    async (blob: Blob, name = 'pasted-image') => {
      const image = await canvasImageFromBlob(blob, getSmartPasteTarget(), name);
      handleAddCanvasImage(image);
    },
    [getSmartPasteTarget, handleAddCanvasImage],
  );

  const handlePasteFromSystemClipboard = useCallback(async () => {
    try {
        const { text, imageBlob } = await readSystemClipboardPayload();
        if (await tryPasteCoordsTable(text, true)) return;
        if (looksLikeStructureClipboardText(text)) {
          setContextMenu(null);
          const ok = await handlePasteTextToCanvas(text, true);
          if (!ok) {
            setOpenFileError('Clipboard does not contain a SMILES string or structure.');
          }
          return;
        }
        if (imageBlob) {
          setContextMenu(null);
          await handlePasteImageBlob(imageBlob);
          return;
        }
        setContextMenu(null);
        setOpenFileError(
          looksLikeCoordsTableText(text)
            ? 'Select the structure (or right-click it) before pasting coordinates.'
            : 'Clipboard does not contain an image, molfile, CDXML, InChI, SMILES, or coordinate table.',
        );
    } catch (err) {
      setOpenFileError(err instanceof Error ? err.message : String(err));
    }
  }, [handlePasteImageBlob, handlePasteTextToCanvas, setContextMenu, tryPasteCoordsTable]);

  /** Ctrl+V / Edit → Paste: prefer system clipboard structures over in-app fragment copy. */
  const handlePasteWithFallback = useCallback(
    async (onFragmentPaste: () => boolean) => {
      try {
        const { text, imageBlob } = await readSystemClipboardPayload();
        const trimmed = text.trim();
        if (trimmed) {
          if (await tryPasteCoordsTable(trimmed, true)) return;
          if (looksLikeStructureClipboardText(trimmed)) {
            setContextMenu(null);
            const ok = await handlePasteTextToCanvas(trimmed, true);
            if (ok) return;
          }
        }
        if (imageBlob) {
          setContextMenu(null);
          await handlePasteImageBlob(imageBlob);
          return;
        }
        if (onFragmentPaste()) return;
        if (!trimmed) {
          setOpenFileError('Clipboard is empty.');
          return;
        }
        setOpenFileError(
          looksLikeCoordsTableText(trimmed)
            ? 'Select the structure (or right-click it) before pasting coordinates.'
            : 'Clipboard does not contain an image, molfile, CDXML, InChI, SMILES, or coordinate table.',
        );
      } catch (err) {
        setOpenFileError(err instanceof Error ? err.message : String(err));
      }
    },
    [handlePasteImageBlob, handlePasteTextToCanvas, setContextMenu, tryPasteCoordsTable],
  );

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null): boolean => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      return el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA';
    };

    const onPaste = (event: ClipboardEvent) => {
      if (isEditableTarget(event.target)) return;
      const clipboard = event.clipboardData;
      if (!clipboard) return;

      const text = clipboardEventStructureText(clipboard);
      if (looksLikeCoordsTableText(text)) {
        event.preventDefault();
        void tryPasteCoordsTable(text, true);
        return;
      }
      if (looksLikeStructureClipboardText(text)) {
        event.preventDefault();
        void handlePasteTextToCanvas(text, true);
        return;
      }

      const imageItem = Array.from(clipboard.items).find(
        item => item.kind === 'file' && item.type.startsWith('image/'),
      );
      if (imageItem) {
        const file = imageItem.getAsFile();
        if (file) {
          event.preventDefault();
          void handlePasteImageBlob(file, file.name || 'pasted-image');
          return;
        }
      }

      if (onFragmentPasteRef.current?.()) {
        event.preventDefault();
      }
    };

    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [handlePasteImageBlob, handlePasteTextToCanvas, tryPasteCoordsTable]);

  const handleImageFile = useCallback(
    async (file: File) => {
      if (!isIllustrationFile(file)) return;
      try {
        await placeIllustrationOnCanvas(file, `Placed ${file.name}`);
      } catch (err) {
        setOpenFileError(err instanceof Error ? err.message : String(err));
      }
    },
    [placeIllustrationOnCanvas],
  );

  /**
   * Chemical formats (MOL/SMILES/…) can export the atom selection only.
   * Visual formats (PNG/JPEG/SVG/PDF) always export the full canvas document so
   * reaction arrows, reagent labels, compound names, SRU brackets, etc. are kept
   * — selection after AI/scheme placement must not strip them.
   */
  const getMoleculeForExport = useCallback(
    (mode: 'structure' | 'visual' = 'structure'): Molecule => {
      if (mode === 'visual' || selectedAtomIds.length === 0) return molecule;
      const idSet = new Set(selectedAtomIds);
      return {
        atoms: molecule.atoms.filter(a => idSet.has(a.id)),
        bonds: molecule.bonds.filter(b => idSet.has(b.fromAtomId) && idSet.has(b.toAtomId)),
        perspective3D: molecule.perspective3D,
        ringFills: molecule.ringFills,
      };
    },
    [molecule, selectedAtomIds],
  );

  const handleDownload = useCallback(
    (format: DownloadFormat) => {
      if (requireAuth && requireAuth() === false) return;
      setContextMenu(null);

      const isVisualExport =
        format === 'png' ||
        format === 'png_white' ||
        format === 'jpeg' ||
        format === 'svg' ||
        format === 'pdf';
      const mol = getMoleculeForExport(isVisualExport ? 'visual' : 'structure');
      const baseName =
        !isVisualExport && selectedAtomIds.length > 0 ? 'selection' : 'molecule';

      if (format === 'smiles') {
        if (mol.atoms.length === 0) return;
        void (async () => {
          const target = await pickConvertSaveTarget({
            suggestedName: `${baseName}.smi`,
            description: 'SMILES',
            mimeType: 'text/plain',
            extensions: ['.smi'],
          });
          if (!target) return;
          pendingSmilesDownloadName.current = target.filename;
          pendingConvertDownloadRef.current = {
            filename: target.filename,
            mime: 'text/plain',
            fileHandle: target.fileHandle,
          };
          const split = selectedAtomIds.length === 0 ? reactionSmilesSplit(mol) : null;
          if (split) {
            workerRef.current?.post({
              type: 'GET_REACTION_SMILES',
              payload: {
                reactMolBlock: moleculeToMolblock(split.reactMol),
                prodMolBlock: moleculeToMolblock(split.prodMol),
              },
              id: 'download_smiles',
            });
          } else {
            workerRef.current?.post({
              type: 'GET_SMILES',
              payload: { molBlock: moleculeToMolblock(mol) },
              id: 'download_smiles',
            });
          }
        })();
        return;
      }

      if (format === 'mol') {
        if (mol.atoms.length === 0) return;
        const mb = moleculeToMolblock(mol);
        void saveBlobToDisk({
          suggestedName: `${baseName}.mol`,
          blob: new Blob([mb], { type: 'chemical/x-mdl-molfile' }),
          mimeType: 'chemical/x-mdl-molfile',
          description: 'MDL Molfile',
          extensions: ['.mol'],
        });
        return;
      }

      if (format === 'inchi') {
        if (mol.atoms.length === 0) return;
        void (async () => {
          const target = await pickConvertSaveTarget({
            suggestedName: `${baseName}.inchi`,
            description: 'InChI',
            mimeType: 'chemical/x-inchi',
            extensions: ['.inchi'],
          });
          if (!target) return;
          pendingConvertDownloadRef.current = {
            filename: target.filename,
            mime: 'chemical/x-inchi',
            fileHandle: target.fileHandle,
          };
          workerRef.current?.post({
            type: 'CONVERT',
            payload: { input: moleculeToMolblock(mol), outputFormat: 'inchi' },
            id: 'download_inchi',
          });
        })();
        return;
      }

      if (format === 'smarts' || format === 'cml' || format === 'cdx') {
        if (mol.atoms.length === 0) return;
        const outputFormat: IndigoConvertFormat =
          format === 'smarts' ? 'smarts' : format === 'cml' ? 'cml' : 'cdx';
        const ext = format === 'smarts' ? 'sma' : format;
        const mime =
          format === 'cml'
            ? 'chemical/x-cml;charset=utf-8'
            : format === 'cdx'
              ? 'chemical/x-cdx'
              : 'chemical/x-daylight-smarts;charset=utf-8';
        void (async () => {
          const target = await pickConvertSaveTarget({
            suggestedName: `${baseName}.${ext}`,
            description: format === 'cdx' ? 'ChemDraw CDX' : format.toUpperCase(),
            mimeType: mime,
            extensions: [`.${ext}`],
          });
          if (!target) return;
          pendingConvertDownloadRef.current = {
            filename: target.filename,
            mime,
            base64Binary: format === 'cdx',
            fileHandle: target.fileHandle,
          };
          workerRef.current?.post({
            type: 'CONVERT',
            payload: { input: moleculeToMolblock(mol), outputFormat },
            id: `download_${format}`,
          });
        })();
        return;
      }

      if (format === 'rxn') {
        if (mol.atoms.length === 0) return;
        const split = selectedAtomIds.length === 0 ? reactionSmilesSplit(mol) : null;
        const input = split
          ? buildRxnFromMolblocks(
              moleculeToMolblock(split.reactMol),
              moleculeToMolblock(split.prodMol),
            )
          : moleculeToMolblock(mol);
        void (async () => {
          const target = await pickConvertSaveTarget({
            suggestedName: `${baseName}.rxn`,
            description: 'MDL RXN',
            mimeType: 'chemical/x-mdl-rxnfile;charset=utf-8',
            extensions: ['.rxn'],
          });
          if (!target) return;
          pendingConvertDownloadRef.current = {
            filename: target.filename,
            mime: 'chemical/x-mdl-rxnfile;charset=utf-8',
            fileHandle: target.fileHandle,
          };
          workerRef.current?.post({
            type: 'CONVERT',
            payload: { input, outputFormat: 'rxnfile' },
            id: 'download_rxn',
          });
        })();
        return;
      }

      if (format === 'cdxml') {
        if (mol.atoms.length === 0) return;
        void saveBlobToDisk({
          suggestedName: `${baseName}.cdxml`,
          blob: new Blob([moleculeToCdxml(mol)], { type: 'chemical/x-cdxml;charset=utf-8' }),
          mimeType: 'chemical/x-cdxml',
          description: 'ChemDraw CDXML',
          extensions: ['.cdxml'],
        });
        return;
      }

      if (
        format !== 'png' &&
        format !== 'png_white' &&
        format !== 'jpeg' &&
        format !== 'svg' &&
        format !== 'pdf'
      ) {
        return;
      }

      if (!moleculeHasExportableContent(mol)) {
        alert('Nothing to export — draw a structure first.');
        return;
      }

      // Transparent: PNG + SVG. White: PNG white, JPEG, PDF (JPEG has no alpha).
      const background: ExportBackground =
        format === 'png' || format === 'svg' ? 'transparent' : 'white';
      // Transparent PNG + SVG stay 1× so Font size (e.g. 14px Arial) is preserved in the file.
      const scale = format === 'png' || format === 'svg' ? 1 : imageExportScale;

      void (async () => {
        try {
          const exportOpts = {
            molecule: mol,
            displayPrefs,
            scale,
            background,
            showHydrogens,
            condensedGroupLabels,
            colorAtomLabels,
            applyAtomColorsToBonds,
            structureTheme,
            structureDrawMode,
            showCipLabels,
            cipAtomLabels,
            cipBondLabels,
          };

          if (format === 'svg') {
            const svg = exportMoleculeSvg(exportOpts);
            if (!svg) {
              alert('Export failed — could not render the structure.');
              return;
            }
            await saveBlobToDisk({
              suggestedName: `${baseName}.svg`,
              blob: new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }),
              mimeType: 'image/svg+xml',
              description: 'SVG image',
              extensions: ['.svg'],
            });
            return;
          }

          const exp = exportMoleculeBitmap(exportOpts);
          if (!exp) {
            alert('Export failed — could not render the structure.');
            return;
          }

          if (format === 'pdf') {
            await saveBlobToDisk({
              suggestedName: `${baseName}.pdf`,
              blob: canvasToPdfBlob(exp, baseName),
              mimeType: 'application/pdf',
              description: 'PDF',
              extensions: ['.pdf'],
            });
            return;
          }

          if (format === 'jpeg') {
            await saveBlobToDisk({
              suggestedName: `${baseName}.jpg`,
              blob: await canvasToBlob(exp, 'image/jpeg', 0.95),
              mimeType: 'image/jpeg',
              description: 'JPEG image',
              extensions: ['.jpg', '.jpeg'],
            });
            return;
          }

          // png (transparent) or png_white
          await saveBlobToDisk({
            suggestedName: `${baseName}.png`,
            blob: await canvasToBlob(exp, 'image/png'),
            mimeType: 'image/png',
            description: 'PNG image',
            extensions: ['.png'],
          });
        } catch (err) {
          alert(err instanceof Error ? err.message : 'Image export failed');
        }
      })();
    },
    [
      applyAtomColorsToBonds,
      cipAtomLabels,
      cipBondLabels,
      colorAtomLabels,
      condensedGroupLabels,
      displayPrefs,
      getMoleculeForExport,
      imageExportScale,
      selectedAtomIds.length,
      setContextMenu,
      showCipLabels,
      showHydrogens,
      structureTheme,
      structureDrawMode,
      workerRef,
      requireAuth,
    ],
  );

  const handleSaveMolToDisk = useCallback(async () => {
    if (requireAuth && requireAuth() === false) return;
    setContextMenu(null);
    const mol = getMoleculeForExport('visual');
    if (mol.atoms.length === 0) {
      setSmilesBarHint('Add a structure before saving as Molfile');
      return;
    }
    const base = sanitizeDesignFilename(projectName);
    const saved = await saveTextFileToDisk({
      suggestedName: `${base}.mol`,
      contents: moleculeToMolblock(mol),
      mimeType: 'chemical/x-mdl-molfile;charset=utf-8',
      description: 'MDL Molfile',
      extensions: ['.mol'],
    });
    if (saved) {
      setSmilesBarHint(
        moleculeLosesDetailInMolfile(mol)
          ? `Saved ${base}.mol — structures only. Use File → Save for the full canvas (.moldraw).`
          : `Saved ${base}.mol — opens in ChemDraw, Moldraw, and other editors`,
      );
    }
  }, [getMoleculeForExport, projectName, requireAuth, setContextMenu, setSmilesBarHint]);

  const handleSaveChemDrawToDisk = useCallback(async () => {
    if (requireAuth && requireAuth() === false) return;
    setContextMenu(null);
    const mol = getMoleculeForExport('visual');
    if (mol.atoms.length === 0) {
      setSmilesBarHint('Add a structure before saving as ChemDraw');
      return;
    }
    const base = sanitizeDesignFilename(projectName);
    const saved = await saveTextFileToDisk({
      suggestedName: `${base}.cdxml`,
      contents: moleculeToCdxml(mol),
      mimeType: 'chemical/x-cdxml;charset=utf-8',
      description: 'ChemDraw CDXML',
      extensions: ['.cdxml'],
    });
    if (saved) setSmilesBarHint(`Saved ${base}.cdxml — opens in ChemDraw`);
  }, [getMoleculeForExport, projectName, requireAuth, setContextMenu, setSmilesBarHint]);

  const handleSaveMoldrawToDisk = useCallback(async () => {
    if (requireAuth && requireAuth() === false) return;
    setContextMenu(null);
    const base = sanitizeDesignFilename(projectName);
    const saved = await saveTextFileToDisk({
      suggestedName: `${base}.moldraw`,
      contents: serializeMoldrawFile(projectName, molecule),
      mimeType: 'application/json',
      description: 'Moldraw design (entire canvas)',
      extensions: ['.moldraw'],
    });
    if (saved) setSmilesBarHint(`Saved ${base}.moldraw — entire canvas`);
  }, [molecule, projectName, requireAuth, setContextMenu, setSmilesBarHint]);

  const handleSaveAsDialog = useCallback(async () => {
    if (requireAuth && requireAuth() === false) return;
    setContextMenu(null);
    const mol = getMoleculeForExport('visual');
    const base = sanitizeDesignFilename(projectName);

    const visualOpts = {
      molecule: mol,
      displayPrefs,
      scale: imageExportScale,
      background: 'white' as const,
      showHydrogens,
      condensedGroupLabels,
      colorAtomLabels,
      applyAtomColorsToBonds,
      structureTheme,
      structureDrawMode,
      showCipLabels,
      cipAtomLabels,
      cipBondLabels,
    };

    const blobForExt = async (ext: string): Promise<Blob | null> => {
      if (ext === '.mol') {
        if (mol.atoms.length === 0) return null;
        return new Blob([moleculeToMolblock(mol)], { type: 'chemical/x-mdl-molfile' });
      }
      if (ext === '.cdxml') {
        if (mol.atoms.length === 0) return null;
        return new Blob([moleculeToCdxml(mol)], { type: 'chemical/x-cdxml;charset=utf-8' });
      }
      if (ext === '.moldraw') {
        return new Blob([serializeMoldrawFile(projectName, molecule)], { type: 'application/json' });
      }
      if (ext === '.svg') {
        const svg = exportMoleculeSvg({ ...visualOpts, background: 'transparent', scale: 1 });
        return svg ? new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }) : null;
      }
      if (ext === '.png' || ext === '.pdf') {
        if (!moleculeHasExportableContent(mol)) return null;
        const exp = exportMoleculeBitmap(visualOpts);
        if (!exp) return null;
        if (ext === '.pdf') return canvasToPdfBlob(exp, base);
        return canvasToBlob(exp, 'image/png');
      }
      return null;
    };

    const hintForExt = (ext: string, name: string): string => {
      if (ext === '.moldraw') return `Saved ${name} — entire canvas`;
      if (ext === '.mol' && moleculeLosesDetailInMolfile(mol)) {
        return `Saved ${name} — structures only. Use File → Save for the full canvas (.moldraw).`;
      }
      return `Saved ${name}`;
    };

    if (canPickSaveLocation()) {
      const picked = await pickSaveLocation({
        suggestedName: `${base}.moldraw`,
        types: FILE_SAVE_AS_TYPES,
      });
      if (!picked) return;
      const ext = picked.ext || '.moldraw';
      const blob = await blobForExt(ext);
      if (!blob) {
        setSmilesBarHint('Add a structure before saving');
        return;
      }
      try {
        await writeBlobToHandle(picked.handle, blob);
        setSmilesBarHint(hintForExt(ext, picked.name));
      } catch (err) {
        setSmilesBarHint(err instanceof Error ? err.message : 'Save failed');
      }
      return;
    }

    const blob = await blobForExt('.moldraw');
    if (!blob) {
      setSmilesBarHint('Add a structure before saving');
      return;
    }
    const saved = await saveBlobToDisk({
      suggestedName: `${base}.moldraw`,
      blob,
      mimeType: 'application/json',
      description: 'Moldraw design (entire canvas)',
      extensions: ['.moldraw'],
    });
    if (saved) setSmilesBarHint(`Saved ${base}.moldraw — entire canvas`);
  }, [
    applyAtomColorsToBonds,
    cipAtomLabels,
    cipBondLabels,
    colorAtomLabels,
    condensedGroupLabels,
    displayPrefs,
    getMoleculeForExport,
    imageExportScale,
    molecule,
    projectName,
    setContextMenu,
    setSmilesBarHint,
    showCipLabels,
    showHydrogens,
    structureDrawMode,
    structureTheme,
    requireAuth,
  ]);

  const handleSaveAs = useCallback(
    (format: DownloadFormat) => {
      if (format === 'cdxml') {
        void handleSaveChemDrawToDisk();
        return;
      }
      handleDownload(format);
    },
    [handleDownload, handleSaveChemDrawToDisk],
  );

  /**
   * Resolve the molecule subset for “Copy as …”.
   * Selection expands to connected fragments; multi-molecule canvas without
   * selection prompts the user to pick one.
   */
  const resolveMoleculeForCopy = useCallback(
    (formatLabel: string): Molecule | null => {
      const fragments = selectedDocumentFragmentBoxes(
        molecule,
        molecule.atoms.map(a => a.id),
      );
      const multiOnCanvas = fragments.length > 1;

      if (selectedAtomIds.length > 0) {
        const expanded = expandAtomIdsToConnectedFragments(molecule, selectedAtomIds);
        return {
          atoms: molecule.atoms.filter(a => expanded.includes(a.id)),
          bonds: molecule.bonds.filter(
            b => expanded.includes(b.fromAtomId) && expanded.includes(b.toAtomId),
          ),
          perspective3D: molecule.perspective3D,
          ringFills: molecule.ringFills,
        };
      }

      if (multiOnCanvas) {
        setSmilesBarHint(`Select a molecule to ${formatLabel.toLowerCase()}`);
        window.setTimeout(() => setSmilesBarHint(''), 2800);
        return null;
      }

      return molecule;
    },
    [molecule, selectedAtomIds, setSmilesBarHint],
  );

  const writeClipboardText = useCallback(
    async (text: string, successHint: string) => {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          throw new Error('Clipboard API unavailable');
        }
        setSmilesBarHint(successHint);
        window.setTimeout(() => setSmilesBarHint(''), 2000);
      } catch (err) {
        setSmilesBarHint(err instanceof Error ? err.message : 'Copy failed');
        window.setTimeout(() => setSmilesBarHint(''), 2800);
      }
    },
    [setSmilesBarHint],
  );

  const postConvertCopy = useCallback(
    (
      mol: Molecule,
      outputFormat: IndigoConvertFormat,
      label: string,
      requestId: string,
      options?: Record<string, string>,
    ) => {
      pendingConvertCopyLabelRef.current = label;
      workerRef.current?.post({
        type: 'CONVERT',
        payload: {
          input: moleculeToMolblock(mol),
          outputFormat,
          options,
        },
        id: requestId,
      });
      setSmilesBarHint(`Copying ${label}…`);
    },
    [setSmilesBarHint, workerRef],
  );

  /**
   * ChemDraw-style Copy as … (text formats + structure picture).
   * Copy SVG writes PNG/HTML for Word/Sheets and image/svg+xml for chemistry tools —
   * never SVG markup as text/plain.
   * SMILES uses the same Indigo GET_SMILES path as the context-menu copy.
   */
  const handleCopyAs = useCallback(
    (format: CopyAsFormat) => {
      if (requireAuth && requireAuth() === false) return false;
      setContextMenu(null);
      const item = COPY_AS_FORMAT_ITEMS.find(f => f.key === format);
      if (item && !item.available) {
        setSmilesBarHint(item.unavailableReason ?? 'Format not available');
        window.setTimeout(() => setSmilesBarHint(''), 2800);
        return;
      }

      if (format === 'png' || format === 'svg') {
        const copyPicture = async (): Promise<boolean> => {
          const molToCopy = getMoleculeForExport('visual');
          if (!moleculeHasExportableContent(molToCopy)) {
            setSmilesBarHint('Nothing to copy');
            window.setTimeout(() => setSmilesBarHint(''), 2000);
            return false;
          }
          const visualOpts = {
            molecule: molToCopy,
            displayPrefs,
            background: 'transparent' as const,
            showHydrogens,
            condensedGroupLabels,
            colorAtomLabels,
            applyAtomColorsToBonds,
            structureTheme,
            structureDrawMode,
            showCipLabels,
            cipAtomLabels,
            cipBondLabels,
          };
          try {
            const svgText =
              format === 'svg' ? exportMoleculeSvg({ ...visualOpts, scale: 1 }) : null;
            if (format === 'svg' && !svgText) {
              setSmilesBarHint('SVG export failed');
              window.setTimeout(() => setSmilesBarHint(''), 2000);
              return false;
            }
            const pngScale = Math.max(2, imageExportScale);
            const pngCanvas = exportMoleculeBitmap({ ...visualOpts, scale: pngScale });
            if (!pngCanvas) {
              setSmilesBarHint(format === 'svg' ? 'SVG export failed' : 'PNG export failed');
              window.setTimeout(() => setSmilesBarHint(''), 2000);
              return false;
            }
            // Promise blob keeps the click user-activation for Safari ClipboardItem.
            const png = canvasToBlob(pngCanvas, 'image/png');
            await writeStructurePictureToClipboard({
              png,
              svgText: format === 'svg' ? svgText : null,
            });
            setSmilesBarHint(format === 'svg' ? 'Copied SVG' : 'Copied PNG');
            window.setTimeout(() => setSmilesBarHint(''), 2000);
            return true;
          } catch (err) {
            setSmilesBarHint(
              err instanceof Error ? err.message : format === 'svg' ? 'SVG copy failed' : 'PNG copy failed',
            );
            window.setTimeout(() => setSmilesBarHint(''), 2800);
            return false;
          }
        };
        if (format === 'svg') return copyPicture();
        void copyPicture();
        return;
      }

      const molToCopy = resolveMoleculeForCopy(item?.label ?? 'copy');
      if (!molToCopy) return;
      if (molToCopy.atoms.length === 0) {
        setSmilesBarHint('Nothing to copy');
        window.setTimeout(() => setSmilesBarHint(''), 2000);
        return;
      }

      if (format === 'smiles') {
        const split = selectedAtomIds.length === 0 ? reactionSmilesSplit(molToCopy) : null;
        if (split) {
          workerRef.current?.post({
            type: 'GET_REACTION_SMILES',
            payload: {
              reactMolBlock: moleculeToMolblock(split.reactMol),
              prodMolBlock: moleculeToMolblock(split.prodMol),
            },
            id: 'copy_smiles',
          });
        } else {
          workerRef.current?.post({
            type: 'GET_SMILES',
            payload: { molBlock: moleculeToMolblock(molToCopy) },
            id: 'copy_smiles',
          });
        }
        setSmilesBarHint('Copied SMILES');
        window.setTimeout(() => setSmilesBarHint(''), 2000);
        return;
      }

      if (format === 'cdxml') {
        void writeClipboardText(moleculeToCdxml(molToCopy), 'Copied CDXML');
        return;
      }

      if (format === 'mol_v2000') {
        void writeClipboardText(moleculeToMolblock(molToCopy), 'Copied MOL V2000');
        return;
      }

      if (format === 'mol_v3000') {
        postConvertCopy(molToCopy, 'molfile', 'MOL V3000', 'copy_mol_v3000', {
          'molfile-saving-mode': '3000',
        });
        return;
      }

      if (format === 'mol_v3000_expanded') {
        const expanded = expandAliasesFor3D(molToCopy);
        postConvertCopy(expanded, 'molfile', 'MOL V3000 (Expanded)', 'copy_mol_v3000_expanded', {
          'molfile-saving-mode': '3000',
        });
        return;
      }

      if (format === 'inchi') {
        postConvertCopy(molToCopy, 'inchi', 'InChI', 'copy_inchi');
        return;
      }

      if (format === 'inchi_key') {
        postConvertCopy(molToCopy, 'inchi-key', 'InChI Key', 'copy_inchi_key');
        return;
      }
    },
    [
      applyAtomColorsToBonds,
      cipAtomLabels,
      cipBondLabels,
      colorAtomLabels,
      condensedGroupLabels,
      displayPrefs,
      getMoleculeForExport,
      imageExportScale,
      postConvertCopy,
      requireAuth,
      resolveMoleculeForCopy,
      selectedAtomIds.length,
      setContextMenu,
      setSmilesBarHint,
      showCipLabels,
      showHydrogens,
      structureTheme,
      structureDrawMode,
      workerRef,
      writeClipboardText,
    ],
  );

  /** @deprecated Prefer handleCopyAs('svg') — kept for existing call sites. */
  const handleCopySvg = useCallback(() => {
    handleCopyAs('svg');
  }, [handleCopyAs]);

  const handleQuickSearch = useCallback(async () => {
    const term = quickSearch.trim();
    if (!term) return;
    setQuickSearchLoading(true);
    setQuickSearchError('');
    try {
      let molblock: string | null = null;
      let compoundName: string | undefined;

      if (looksLikeSmiles(term)) {
        molblock = nativeSmilesTo2DMolblock(term);
        if (!molblock) {
          try {
            molblock = await workerMolblockFromText('smiles', term);
          } catch {
            molblock = null;
          }
        }
      } else {
        molblock = await pubchemMolblockFromSmilesOrName(term);
        if (!molblock && looksLikeCompoundName(term)) {
          const resolved = await resolveCompoundNameFromPubChem(term);
          if (resolved) {
            compoundName = term;
            molblock =
              (await pubchemMolblockFromCid(resolved.cid)) ??
              nativeSmilesTo2DMolblock(resolved.smiles);
          }
        }
      }

      if (molblock) {
        const newIds = await importMolblock(molblock, {
          ...(compoundName ? { compoundName } : {}),
          placement: 'viewport_center',
        });
        revealAtomsInView?.(newIds);
        setQuickSearch('');
      } else {
        setQuickSearchError(looksLikeSmiles(term) ? 'Could not parse SMILES' : 'Not found on PubChem');
      }
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === 'AbortError';
      setQuickSearchError(
        aborted
          ? 'Search timed out'
          : looksLikeSmiles(term)
            ? 'Could not parse SMILES'
            : 'Could not reach PubChem',
      );
    } finally {
      setQuickSearchLoading(false);
    }
  }, [importMolblock, quickSearch, revealAtomsInView, workerMolblockFromText]);

  return {
    openFileBusy,
    openFileError,
    setOpenFileError,
    quickSearch,
    setQuickSearch,
    quickSearchLoading,
    quickSearchError,
    setQuickSearchError,
    importMolblock,
    handleOpenMoleculeFile,
    handlePlaceOnCanvas,
    handleImageFile,
    handlePasteFromSystemClipboard,
    handlePasteWithFallback,
    handlePasteTextToCanvas,
    handleDownload,
    handleSaveAs,
    handleSaveMolToDisk,
    handleSaveChemDrawToDisk,
    handleSaveMoldrawToDisk,
    handleSaveAsDialog,
    handleCopyAs,
    handleCopySvg,
    handleQuickSearch,
    getMoleculeForExport,
    pendingSmilesDownloadName,
    pendingConvertDownloadRef,
    pendingConvertCopyLabelRef,
    workerMolblockFromText,
    workerChemDrawToMolblock,
  };
}
