/**
 * Canvas right-click context menu state and action handlers.
 * Extracted from App.tsx (hooks-first path).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Molecule } from '@moldraw/domain';
import { detectExpandedAliasAtAtom } from '@moldraw/domain';
import { moleculeToMolblock } from '@moldraw/core/io/molblock';
import { moleculeCoordsTableText, looksLikeCoordsTableText, parseMoleculeCoordsTable, resolveCoordsPasteAtomIds } from '@moldraw/core/io/moleculeCoordsTable';
import { readSystemClipboardPayload } from '../importExport/helpers';
import { collectConnectedComponent } from '@moldraw/core/io/localCleanup';
import { reactionSmilesSplit } from '@moldraw/core/molecule/partition';
import {
  pickAtomAtPoint,
  pickBondAtPoint,
  pickStrokeAtPoint,
} from '@moldraw/core/molecule/hitTest';
import {
  pickCanvasTextAt,
  pickReactionArrowAt,
  pickCanvasShapeAt,
  pickCanvasImageAt,
  pickSruBracketAt,
  getSelectionAabb,
} from '@moldraw/canvas/geometry';
import { documentFragmentBoxes } from '@moldraw/core/align/selectionArrange';
import { CMD } from '@moldraw/core/commands/registry';
import type { CommandResult } from '@moldraw/core/commands';
import type { MoleculeSelection } from '@moldraw/core/editor';
import type { MoleculeWorkerClient } from '@moldraw/core/moleculeWorker/client';
import type { InfiniteCanvasHandle } from '@moldraw/canvas/InfiniteCanvas';
import type { CanvasContextMenuState } from '../components';
import { TOUCH_OPEN_CLICK_GUARD_MS } from '../touchConstants';

/** Gap between selected AABB and duplicate AABB (world units ≈ default bond length). */
const DUPLICATE_GAP = 40;

/** Offset so the copy’s AABB sits fully clear of the source (to the right + slight down). */
const offsetClearingAtoms = (mol: Molecule, atomIds: string[]): { dx: number; dy: number } => {
  const box = getSelectionAabb(mol, atomIds);
  if (!box) return { dx: DUPLICATE_GAP, dy: DUPLICATE_GAP };
  return {
    dx: box.maxX - box.minX + DUPLICATE_GAP,
    dy: DUPLICATE_GAP * 0.5,
  };
};

export interface UseCanvasContextMenuOptions {
  molecule: Molecule;
  applyCommand: (commandId: string, input: unknown) => CommandResult;
  selectedAtomIds: string[];
  selectedBondIds?: string[];
  setSelectedAtomIds: React.Dispatch<React.SetStateAction<string[]>>;
  setSelection: (patch: Partial<MoleculeSelection>) => void;
  selectedCanvasTextId: string | null;
  setSelectedCanvasTextId: React.Dispatch<React.SetStateAction<string | null>>;
  selectedReactionArrowId: string | null;
  setSelectedReactionArrowId: React.Dispatch<React.SetStateAction<string | null>>;
  workerRef: React.MutableRefObject<MoleculeWorkerClient | null>;
  setSmilesBarHint: React.Dispatch<React.SetStateAction<string>>;
  handleRequestAtomAliasEdit: (atomId: string) => void;
  canvasRef: React.RefObject<InfiniteCanvasHandle | null>;
  setColorEditStrokeId: React.Dispatch<React.SetStateAction<string | null>>;
  setColorEditCanvasShapeId: React.Dispatch<React.SetStateAction<string | null>>;
  /** Currently selected glassware / canvas shape (Delete / Duplicate without context menu). */
  colorEditCanvasShapeId?: string | null;
  handlePasteFromSystemClipboard: () => void | Promise<void>;
  /** Bond length for placing explicit H (world px). */
  bondLengthPx?: number;
}

export function useCanvasContextMenu({
  molecule,
  applyCommand,
  selectedAtomIds,
  selectedBondIds = [],
  setSelectedAtomIds,
  setSelection,
  selectedCanvasTextId,
  setSelectedCanvasTextId,
  selectedReactionArrowId,
  setSelectedReactionArrowId,
  workerRef,
  setSmilesBarHint,
  handleRequestAtomAliasEdit,
  canvasRef,
  setColorEditStrokeId,
  setColorEditCanvasShapeId,
  colorEditCanvasShapeId = null,
  handlePasteFromSystemClipboard,
  bondLengthPx = 40,
}: UseCanvasContextMenuOptions) {
  const [contextMenu, setContextMenu] = useState<CanvasContextMenuState | null>(null);
  const contextMenuRef = useRef<CanvasContextMenuState | null>(null);
  const [ungroupConfirmOpen, setUngroupConfirmOpen] = useState(false);
  const ungroupAtomIdsRef = useRef<string[]>([]);

  const contextAtomDetectedAlias = useMemo(() => {
    if (!contextMenu?.atomId) return null;
    return detectExpandedAliasAtAtom(molecule, contextMenu.atomId);
  }, [contextMenu, molecule]);

  useEffect(() => {
    if (contextMenu) contextMenuRef.current = contextMenu;
  }, [contextMenu]);

  const contextMenuOpenedAtRef = useRef(0);

  useEffect(() => {
    const handleClick = () => {
      // Touch long-press: some browsers still fire the compat `click` when the
      // finger lifts a moment after the menu opened — don't let it dismiss us.
      const menu = contextMenuRef.current;
      if (
        (menu?.pointerType === 'touch' || menu?.pointerType === 'chip') &&
        performance.now() - contextMenuOpenedAtRef.current < TOUCH_OPEN_CLICK_GUARD_MS
      ) {
        return;
      }
      setContextMenu(null);
    };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  // ── Context-menu handlers (close menu before/after the action) ───────────
  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const resolveCoordsTargetAtomIds = useCallback(
    (contextAtomId?: string | null): string[] => {
      const seeds =
        selectedAtomIds.length > 0
          ? selectedAtomIds
          : contextAtomId
            ? [contextAtomId]
            : [];
      return resolveCoordsPasteAtomIds(molecule, seeds);
    },
    [molecule, selectedAtomIds],
  );

  const resolveContextMoleculeCopy = useCallback((): {
    mol: Molecule;
    atomIds: string[];
    multiOnCanvas: boolean;
  } | null => {
    const fragments = documentFragmentBoxes(molecule);
    const multiOnCanvas = fragments.length > 1;
    const atomIds = resolveCoordsTargetAtomIds(contextMenuRef.current?.atomId);
    if (atomIds.length > 0) {
      const set = new Set(atomIds);
      return {
        mol: {
          atoms: molecule.atoms.filter(a => set.has(a.id)),
          bonds: molecule.bonds.filter(
            b => set.has(b.fromAtomId) && set.has(b.toAtomId),
          ),
          perspective3D: molecule.perspective3D,
        },
        atomIds,
        multiOnCanvas,
      };
    }
    if (multiOnCanvas) return null;
    return {
      mol: molecule,
      atomIds: molecule.atoms.map(a => a.id),
      multiOnCanvas,
    };
  }, [molecule, resolveCoordsTargetAtomIds]);

  const handleContextCopySmiles = useCallback(() => {
    const resolved = resolveContextMoleculeCopy();
    if (!resolved) {
      setSmilesBarHint('Select a molecule to copy (canvas has more than one)');
      window.setTimeout(() => setSmilesBarHint(''), 2800);
      return;
    }
    const { mol: molToCopy, multiOnCanvas } = resolved;
    const hint = multiOnCanvas ? 'Copied selected molecule' : 'Copied SMILES';

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
      const molblock = moleculeToMolblock(molToCopy);
      workerRef.current?.post({ type: 'GET_SMILES', payload: { molBlock: molblock }, id: 'copy_smiles' });
    }
    setSmilesBarHint(hint);
    window.setTimeout(() => setSmilesBarHint(''), 2000);
  }, [resolveContextMoleculeCopy, selectedAtomIds.length, setSmilesBarHint, workerRef]);

  const handleContextCopyCoordsTable = useCallback(() => {
    const menu = contextMenuRef.current;
    let resolved = resolveContextMoleculeCopy();
    if (!resolved && menu?.atomId) {
      const expanded = collectConnectedComponent(molecule, [menu.atomId]);
      resolved = {
        mol: {
          atoms: molecule.atoms.filter(a => expanded.includes(a.id)),
          bonds: molecule.bonds.filter(
            b => expanded.includes(b.fromAtomId) && expanded.includes(b.toAtomId),
          ),
          perspective3D: molecule.perspective3D,
        },
        atomIds: expanded,
        multiOnCanvas: false,
      };
    }
    if (!resolved || resolved.atomIds.length === 0) {
      setSmilesBarHint('Select atoms to copy coordinates');
      window.setTimeout(() => setSmilesBarHint(''), 2800);
      closeContextMenu();
      return;
    }
    const text = moleculeCoordsTableText(resolved.mol, { atomIds: resolved.atomIds });
    if (!text) {
      closeContextMenu();
      return;
    }
    void navigator.clipboard.writeText(text).then(
      () => {
        setSmilesBarHint(`Copied coordinates (${resolved!.atomIds.length} atoms)`);
        window.setTimeout(() => setSmilesBarHint(''), 2000);
      },
      err => console.error('Clipboard error:', err),
    );
    closeContextMenu();
  }, [closeContextMenu, molecule, resolveContextMoleculeCopy, setSmilesBarHint]);

  const applyCoordsFromClipboardText = useCallback(
    (text: string, atomIds: string[]): boolean => {
      if (!looksLikeCoordsTableText(text)) return false;
      const parsed = parseMoleculeCoordsTable(text);
      if (!parsed.ok) {
        setSmilesBarHint(parsed.error);
        window.setTimeout(() => setSmilesBarHint(''), 3200);
        return true;
      }
      const result = applyCommand(CMD.ApplyCoordsTable, { atomIds, rows: parsed.rows });
      if (!result.ok) {
        setSmilesBarHint('Could not apply coordinates');
        window.setTimeout(() => setSmilesBarHint(''), 2800);
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
    [applyCommand, setSmilesBarHint],
  );

  const handleContextPasteCoordsTable = useCallback(() => {
    const atomIds = resolveCoordsTargetAtomIds(contextMenuRef.current?.atomId);
    if (atomIds.length === 0) {
      setSmilesBarHint('Select the structure (or right-click it) before pasting coordinates');
      window.setTimeout(() => setSmilesBarHint(''), 3200);
      closeContextMenu();
      return;
    }
    void readSystemClipboardPayload().then(
      ({ text }) => {
        if (!applyCoordsFromClipboardText(text, atomIds)) {
          setSmilesBarHint('Clipboard is not a coordinate table');
          window.setTimeout(() => setSmilesBarHint(''), 2800);
        }
        closeContextMenu();
      },
      err => {
        console.error('Clipboard read error:', err);
        setSmilesBarHint('Could not read clipboard');
        window.setTimeout(() => setSmilesBarHint(''), 2800);
        closeContextMenu();
      },
    );
  }, [applyCoordsFromClipboardText, closeContextMenu, resolveCoordsTargetAtomIds, setSmilesBarHint]);

  const handleContextPaste = useCallback(async () => {
    const atomIds = resolveCoordsTargetAtomIds(contextMenuRef.current?.atomId);
    if (atomIds.length > 0) {
      try {
        const { text } = await readSystemClipboardPayload();
        if (applyCoordsFromClipboardText(text, atomIds)) {
          closeContextMenu();
          return;
        }
      } catch {
        /* fall through to structure paste */
      }
    }
    closeContextMenu();
    await handlePasteFromSystemClipboard();
  }, [
    applyCoordsFromClipboardText,
    closeContextMenu,
    handlePasteFromSystemClipboard,
    resolveCoordsTargetAtomIds,
  ]);

  const handleContextPasteSmiles = handleContextPaste;

  const handleContextDuplicate = useCallback(() => {
    const menu = contextMenuRef.current;

    const selectOnlyNewAtoms = (newAtomIds: string[]) => {
      if (newAtomIds.length === 0) return;
      // Replace selection: keep only the duplicate (clear bonds / other objects).
      setSelection({
        atomIds: newAtomIds,
        bondIds: [],
        canvasTextId: null,
        reactionArrowId: null,
      });
    };

    const duplicateAtomIds = (atomIds: string[]) => {
      if (atomIds.length === 0) return;
      const { dx, dy } = offsetClearingAtoms(molecule, atomIds);
      const result = applyCommand(CMD.DuplicateAtoms, { atomIds, dx, dy });
      if (result.ok && result.extra && typeof result.extra === 'object' && 'newAtomIds' in result.extra) {
        selectOnlyNewAtoms((result.extra as { newAtomIds: string[] }).newAtomIds);
      }
    };

    if (menu?.canvasTextId) {
      const result = applyCommand(CMD.DuplicateCanvasText, {
        id: menu.canvasTextId,
        dx: DUPLICATE_GAP,
        dy: DUPLICATE_GAP,
      });
      if (result.ok && result.extra && typeof result.extra === 'object' && 'newId' in result.extra) {
        setSelection({
          atomIds: [],
          bondIds: [],
          canvasTextId: String((result.extra as { newId: string }).newId),
          reactionArrowId: null,
        });
      }
      closeContextMenu();
      return;
    }
    if (menu?.reactionArrowId) {
      const result = applyCommand(CMD.DuplicateReactionArrow, {
        id: menu.reactionArrowId,
        dx: DUPLICATE_GAP,
        dy: DUPLICATE_GAP,
      });
      if (result.ok && result.extra && typeof result.extra === 'object' && 'newId' in result.extra) {
        setSelection({
          atomIds: [],
          bondIds: [],
          canvasTextId: null,
          reactionArrowId: String((result.extra as { newId: string }).newId),
        });
      }
      closeContextMenu();
      return;
    }
    if (menu?.strokeId) {
      applyCommand(CMD.DuplicateStroke, { id: menu.strokeId, dx: DUPLICATE_GAP, dy: DUPLICATE_GAP });
      closeContextMenu();
      return;
    }

    const shapeId = menu?.canvasShapeId ?? colorEditCanvasShapeId;
    if (shapeId) {
      const result = applyCommand(CMD.DuplicateCanvasShape, {
        id: shapeId,
        dx: DUPLICATE_GAP,
        dy: DUPLICATE_GAP,
      });
      if (result.ok && result.extra && typeof result.extra === 'object' && 'newId' in result.extra) {
        setColorEditCanvasShapeId(String((result.extra as { newId: string }).newId));
      }
      closeContextMenu();
      return;
    }

    if (menu?.canvasImageId) {
      applyCommand(CMD.DuplicateCanvasImage, {
        id: menu.canvasImageId,
        dx: DUPLICATE_GAP,
        dy: DUPLICATE_GAP,
      });
      closeContextMenu();
      return;
    }

    // Prefer current selection when it includes the clicked atom/bond endpoints.
    if (selectedAtomIds.length > 0) {
      const seedOk =
        !menu?.atomId ||
        selectedAtomIds.includes(menu.atomId) ||
        (menu.bondId != null &&
          (() => {
            const b = molecule.bonds.find(x => x.id === menu.bondId);
            return !!b && selectedAtomIds.includes(b.fromAtomId) && selectedAtomIds.includes(b.toAtomId);
          })());
      if (seedOk) {
        duplicateAtomIds(selectedAtomIds);
        closeContextMenu();
        return;
      }
    }

    // Right-click target with no useful selection → duplicate connected fragment.
    if (menu?.atomId) {
      duplicateAtomIds(collectConnectedComponent(molecule, [menu.atomId]));
      closeContextMenu();
      return;
    }

    if (menu?.bondId) {
      const b = molecule.bonds.find(x => x.id === menu.bondId);
      if (b) {
        duplicateAtomIds(collectConnectedComponent(molecule, [b.fromAtomId, b.toAtomId]));
      }
      closeContextMenu();
      return;
    }

    if (selectedCanvasTextId) {
      const result = applyCommand(CMD.DuplicateCanvasText, {
        id: selectedCanvasTextId,
        dx: DUPLICATE_GAP,
        dy: DUPLICATE_GAP,
      });
      if (result.ok && result.extra && typeof result.extra === 'object' && 'newId' in result.extra) {
        setSelection({
          atomIds: [],
          bondIds: [],
          canvasTextId: String((result.extra as { newId: string }).newId),
          reactionArrowId: null,
        });
      }
      closeContextMenu();
      return;
    }

    if (selectedReactionArrowId) {
      const result = applyCommand(CMD.DuplicateReactionArrow, {
        id: selectedReactionArrowId,
        dx: DUPLICATE_GAP,
        dy: DUPLICATE_GAP,
      });
      if (result.ok && result.extra && typeof result.extra === 'object' && 'newId' in result.extra) {
        setSelection({
          atomIds: [],
          bondIds: [],
          canvasTextId: null,
          reactionArrowId: String((result.extra as { newId: string }).newId),
        });
      }
    }
    closeContextMenu();
  }, [
    molecule,
    selectedAtomIds,
    selectedCanvasTextId,
    selectedReactionArrowId,
    colorEditCanvasShapeId,
    applyCommand,
    setSelection,
    setColorEditCanvasShapeId,
    closeContextMenu,
  ]);

  const handleContextExpandAlias = useCallback(
    (atomId: string) => {
      // Stereo-aware expansion: keep the anchor atom and existing bonds intact,
      // so existing wedge/dash context on neighboring bonds is preserved.
      applyCommand(CMD.ExpandAlias, { atomIds: [atomId] });
      closeContextMenu();
    },
    [closeContextMenu, applyCommand],
  );

  const handleContextCollapseToAlias = useCallback(
    (atomId: string, alias: string) => {
      applyCommand(CMD.SetAtomAlias, { atomId, alias });
      closeContextMenu();
    },
    [closeContextMenu, applyCommand],
  );

  const handleContextChangeAtomElement = useCallback(
    (atomId: string, element: string) => {
      applyCommand(CMD.UpdateAtomElement, { atomId, element });
      closeContextMenu();
    },
    [closeContextMenu, applyCommand],
  );

  const handleContextUpdateAtomCharge = useCallback(
    (atomId: string, delta: number) => {
      applyCommand(CMD.UpdateAtomCharge, { atomId, delta });
      closeContextMenu();
    },
    [closeContextMenu, applyCommand],
  );

  const handleContextUpdateAtomLonePairs = useCallback(
    (atomId: string, delta: number) => {
      applyCommand(CMD.UpdateAtomLonePairs, { atomId, delta });
      closeContextMenu();
    },
    [closeContextMenu, applyCommand],
  );

  const handleContextSetAtomLonePairSide = useCallback(
    (atomId: string, side: 'above' | 'below') => {
      applyCommand(CMD.SetAtomLonePairSide, { atomId, side });
      closeContextMenu();
    },
    [closeContextMenu, applyCommand],
  );

  const handleContextSetAtomIsotope = useCallback(
    (atomId: string, isotope?: number) => {
      applyCommand(CMD.SetAtomIsotope, { atomId, isotope });
      closeContextMenu();
    },
    [closeContextMenu, applyCommand],
  );

  const handleContextCustomAtomIsotope = useCallback(
    (atomId: string) => {
      const atom = molecule.atoms.find(a => a.id === atomId);
      const value = window.prompt('Mass number (blank clears isotope)', atom?.isotope ? String(atom.isotope) : '');
      if (value === null) return;
      const trimmed = value.trim();
      const isotope = trimmed ? Number.parseInt(trimmed, 10) : undefined;
      if (isotope !== undefined && (!Number.isFinite(isotope) || isotope <= 0)) return;
      applyCommand(CMD.SetAtomIsotope, { atomId, isotope });
      closeContextMenu();
    },
    [closeContextMenu, molecule.atoms, applyCommand],
  );

  const handleContextEditAtomAlias = useCallback(
    (atomId: string) => {
      closeContextMenu();
      handleRequestAtomAliasEdit(atomId);
    },
    [closeContextMenu, handleRequestAtomAliasEdit],
  );

  const handleContextClearAtomAlias = useCallback(
    (atomId: string) => {
      applyCommand(CMD.SetAtomAlias, { atomId, alias: '' });
      closeContextMenu();
    },
    [closeContextMenu, applyCommand],
  );

  const handleContextDeleteAtom = useCallback(
    (atomId: string) => {
      applyCommand(CMD.DeleteAtoms, { atomIds: [atomId] });
      setSelectedAtomIds(ids => ids.filter(id => id !== atomId));
      closeContextMenu();
    },
    [closeContextMenu, applyCommand],
  );

  const handleContextSelectConnectedFragment = useCallback(
    (atomId: string) => {
      const ids = collectConnectedComponent(molecule, [atomId]);
      setSelectedAtomIds(ids);
      setSelectedCanvasTextId(null);
      setSelectedReactionArrowId(null);
      closeContextMenu();
    },
    [closeContextMenu, molecule],
  );

  const handleContextInvertStereoAtAtom = useCallback(
    (atomId: string) => {
      applyCommand(CMD.InvertStereoAtAtom, { atomId });
      closeContextMenu();
    },
    [applyCommand, closeContextMenu],
  );

  const handleContextSwapAtomPositions = useCallback(() => {
    if (selectedAtomIds.length !== 2) return;
    applyCommand(CMD.SwapAtomPositions, { atomIdA: selectedAtomIds[0], atomIdB: selectedAtomIds[1] });
    closeContextMenu();
  }, [applyCommand, closeContextMenu, selectedAtomIds]);

  const handleContextAddExplicitHydrogen = useCallback(() => {
    const menu = contextMenuRef.current;
    const atomIds =
      selectedAtomIds.length > 0
        ? selectedAtomIds
        : menu?.atomId
          ? [menu.atomId]
          : [];
    const heavy = atomIds.filter(id => {
      const a = molecule.atoms.find(x => x.id === id);
      return a && a.element !== 'H';
    });
    if (heavy.length === 0) return;
    applyCommand(CMD.AddExplicitHydrogens, {
      atomIds: heavy,
      bondLengthPx,
      maxPerAtom: 1,
    });
    closeContextMenu();
  }, [applyCommand, bondLengthPx, closeContextMenu, molecule.atoms, selectedAtomIds]);

  const handleContextToggleExplicitCarbonLabel = useCallback(() => {
    const menu = contextMenuRef.current;
    const fromSelection = selectedAtomIds.filter(id => {
      const a = molecule.atoms.find(x => x.id === id);
      return a?.element === 'C' && !a.alias?.trim();
    });
    const ids = new Set(fromSelection);
    if (menu?.atomId) {
      const a = molecule.atoms.find(x => x.id === menu.atomId);
      if (a?.element === 'C' && !a.alias?.trim()) ids.add(menu.atomId);
    }
    if (ids.size === 0) return;
    const atomIds = [...ids];
    const show = atomIds.some(id => !molecule.atoms.find(a => a.id === id)?.showElementLabel);
    applyCommand(CMD.SetAtomsShowElementLabel, { atomIds, show });
    closeContextMenu();
  }, [applyCommand, closeContextMenu, molecule.atoms, selectedAtomIds]);

  const handleContextGroupSelection = useCallback(() => {
    if (selectedAtomIds.length === 0) return;
    applyCommand(CMD.GroupSelection, { atomIds: selectedAtomIds, name: 'Group' });
    closeContextMenu();
  }, [applyCommand, closeContextMenu, selectedAtomIds]);

  const handleContextUngroupSelection = useCallback(() => {
    if (selectedAtomIds.length === 0) return;
    ungroupAtomIdsRef.current = [...selectedAtomIds];
    closeContextMenu();
    setUngroupConfirmOpen(true);
  }, [closeContextMenu, selectedAtomIds]);

  const handleCancelUngroupConfirm = useCallback(() => {
    setUngroupConfirmOpen(false);
    ungroupAtomIdsRef.current = [];
  }, []);

  const handleConfirmUngroup = useCallback(() => {
    const atomIds = ungroupAtomIdsRef.current;
    setUngroupConfirmOpen(false);
    ungroupAtomIdsRef.current = [];
    if (atomIds.length === 0) return;
    applyCommand(CMD.UngroupSelection, { atomIds });
  }, [applyCommand]);

  const resolveStyleAtomIds = useCallback((): string[] => {
    if (selectedAtomIds.length > 0) return selectedAtomIds;
    const menu = contextMenuRef.current;
    if (menu?.atomId) return [menu.atomId];
    if (menu?.bondId) {
      const b = molecule.bonds.find(x => x.id === menu.bondId);
      if (b) return [b.fromAtomId, b.toAtomId];
    }
    return [];
  }, [molecule.bonds, selectedAtomIds]);

  const handleContextApplySelectionFontSize = useCallback(
    (pt: number | null) => {
      const atomIds = resolveStyleAtomIds();
      if (atomIds.length === 0) return;
      applyCommand(CMD.ApplySelectionDisplayStyle, {
        atomIds,
        labelFontSizePt: pt,
      });
      closeContextMenu();
    },
    [applyCommand, closeContextMenu, resolveStyleAtomIds],
  );

  const handleContextApplySelectionBondThickness = useCallback(
    (px: number | null) => {
      const menu = contextMenuRef.current;
      const atomIds = selectedAtomIds.length > 0 ? selectedAtomIds : resolveStyleAtomIds();
      const bondIds =
        selectedBondIds.length > 0
          ? selectedBondIds
          : menu?.bondId && selectedAtomIds.length === 0
            ? [menu.bondId]
            : undefined;
      if (atomIds.length === 0 && (!bondIds || bondIds.length === 0)) return;
      applyCommand(CMD.ApplySelectionDisplayStyle, {
        atomIds,
        bondIds,
        bondThicknessPx: px,
      });
      closeContextMenu();
    },
    [
      applyCommand,
      closeContextMenu,
      resolveStyleAtomIds,
      selectedAtomIds,
      selectedBondIds,
    ],
  );

  const handleContextApplySelectionOpacity = useCallback(
    (opacity: number | null) => {
      const menu = contextMenuRef.current;
      const atomIds = selectedAtomIds.length > 0 ? selectedAtomIds : resolveStyleAtomIds();
      const bondIds =
        selectedBondIds.length > 0
          ? selectedBondIds
          : menu?.bondId && selectedAtomIds.length === 0
            ? [menu.bondId]
            : undefined;
      if (atomIds.length === 0 && (!bondIds || bondIds.length === 0)) return;
      applyCommand(CMD.ApplySelectionDisplayStyle, {
        atomIds,
        bondIds,
        opacity,
      });
      closeContextMenu();
    },
    [
      applyCommand,
      closeContextMenu,
      resolveStyleAtomIds,
      selectedAtomIds,
      selectedBondIds,
    ],
  );

  const handleContextEditSruBracketSubscript = useCallback(
    (id: string) => {
      const bracket = molecule.sruBrackets?.find(b => b.id === id);
      const value = window.prompt('Repeat subscript', bracket?.subscript ?? 'n');
      if (value === null) return;
      const subscript = value.trim() || 'n';
      applyCommand(CMD.UpdateSruBracket, { id, patch: { subscript } });
      closeContextMenu();
    },
    [applyCommand, closeContextMenu, molecule.sruBrackets],
  );

  const openSelectionContextMenu = useCallback(
    (
      screen: { clientX: number; clientY: number },
      extras?: {
        canvasImageId?: string | null;
        strokeId?: string | null;
        sruBracketId?: string | null;
        canvasShapeId?: string | null;
      },
    ) => {
      const atomIds =
        selectedAtomIds.length > 0 ? selectedAtomIds : molecule.atoms.map(a => a.id);
      const aabb = atomIds.length > 0 ? getSelectionAabb(molecule, atomIds) : null;
      const newMenu: CanvasContextMenuState = {
        x: screen.clientX,
        y: screen.clientY,
        worldX: aabb?.cx ?? 0,
        worldY: aabb?.cy ?? 0,
        atomId:
          selectedAtomIds.length === 1
            ? selectedAtomIds[0]
            : selectedAtomIds.length === 0 && molecule.atoms.length === 1
              ? molecule.atoms[0].id
              : undefined,
        bondId: selectedBondIds.length === 1 ? selectedBondIds[0] : undefined,
        canvasTextId: selectedCanvasTextId ?? undefined,
        reactionArrowId: selectedReactionArrowId ?? undefined,
        canvasShapeId: extras?.canvasShapeId ?? colorEditCanvasShapeId ?? undefined,
        canvasImageId: extras?.canvasImageId ?? undefined,
        strokeId: extras?.strokeId ?? undefined,
        sruBracketId: extras?.sruBracketId ?? undefined,
        pointerType: 'chip',
      };
      setContextMenu(newMenu);
      contextMenuRef.current = newMenu;
      contextMenuOpenedAtRef.current = performance.now();
    },
    [
      molecule,
      selectedAtomIds,
      selectedBondIds,
      selectedCanvasTextId,
      selectedReactionArrowId,
      colorEditCanvasShapeId,
    ],
  );

  const handleCanvasContextMenu = useCallback(
    (e: { clientX: number; clientY: number }, worldPos: { x: number; y: number }) => {
      const wx = worldPos.x;
      const wy = worldPos.y;
      const canvasCtx = canvasRef.current?.getCanvas()?.getContext('2d');

      let canvasTextId: string | undefined;
      let reactionArrowId: string | undefined;
      let strokeId: string | undefined;
      let canvasShapeId: string | undefined;
      let canvasImageId: string | undefined;
      let sruBracketId: string | undefined;

      if (canvasCtx && molecule.canvasTexts?.length) {
        const hitText = pickCanvasTextAt(canvasCtx, molecule.canvasTexts, wx, wy);
        if (hitText) canvasTextId = hitText.id;
      }

      if (!canvasTextId) {
        const hitArrow = pickReactionArrowAt(molecule.reactionArrows, wx, wy);
        if (hitArrow) reactionArrowId = hitArrow.id;
      }

      let atomId: string | undefined;
      let bondId: string | undefined;
      if (!canvasTextId && !reactionArrowId) {
        const hitAtom = pickAtomAtPoint(molecule, wx, wy);
        if (hitAtom) {
          atomId = hitAtom.id;
        } else {
          const hitBond = pickBondAtPoint(molecule, wx, wy);
          if (hitBond) bondId = hitBond.id;
        }
      }

      if (!canvasTextId && !reactionArrowId && !atomId && !bondId) {
        const hitSru = pickSruBracketAt(molecule.sruBrackets, wx, wy);
        if (hitSru) sruBracketId = hitSru.bracket.id;
      }

      if (!canvasTextId && !reactionArrowId && !atomId && !bondId && !sruBracketId) {
        const hitShape = pickCanvasShapeAt(molecule.canvasShapes, wx, wy);
        if (hitShape) canvasShapeId = hitShape.id;
      }

      if (!canvasTextId && !reactionArrowId && !atomId && !bondId && !sruBracketId && !canvasShapeId) {
        const hitImage = pickCanvasImageAt(molecule.canvasImages, wx, wy);
        if (hitImage) canvasImageId = hitImage.id;
      }

      if (
        !canvasTextId &&
        !reactionArrowId &&
        !atomId &&
        !bondId &&
        !sruBracketId &&
        !canvasShapeId &&
        !canvasImageId
      ) {
        const hitStroke = pickStrokeAtPoint(molecule, wx, wy);
        if (hitStroke) strokeId = hitStroke.id;
      }

      const newMenu: CanvasContextMenuState = {
        x: e.clientX,
        y: e.clientY,
        worldX: worldPos.x,
        worldY: worldPos.y,
        bondId,
        atomId,
        canvasTextId,
        reactionArrowId,
        strokeId,
        canvasShapeId,
        canvasImageId,
        sruBracketId,
        pointerType: (e as { pointerType?: string }).pointerType,
      };
      setContextMenu(newMenu);
      contextMenuRef.current = newMenu;
      contextMenuOpenedAtRef.current = performance.now();
      if (strokeId) {
        setColorEditStrokeId(strokeId);
        setColorEditCanvasShapeId(null);
      } else if (canvasShapeId) {
        setColorEditCanvasShapeId(canvasShapeId);
        setColorEditStrokeId(null);
      } else if (atomId || bondId || canvasTextId || reactionArrowId || canvasImageId || sruBracketId) {
        setColorEditStrokeId(null);
        setColorEditCanvasShapeId(null);
      }
    },
    [molecule],
  );

  return {
    contextMenu,
    setContextMenu,
    contextMenuRef,
    contextAtomDetectedAlias,
    closeContextMenu,
    openSelectionContextMenu,
    handleCanvasContextMenu,
    handleContextCopySmiles,
    handleContextCopyCoordsTable,
    handleContextPasteCoordsTable,
    handleContextPasteSmiles,
    handleContextDuplicate,
    handleContextExpandAlias,
    handleContextCollapseToAlias,
    handleContextChangeAtomElement,
    handleContextUpdateAtomCharge,
    handleContextUpdateAtomLonePairs,
    handleContextSetAtomLonePairSide,
    handleContextSetAtomIsotope,
    handleContextCustomAtomIsotope,
    handleContextEditAtomAlias,
    handleContextClearAtomAlias,
    handleContextDeleteAtom,
    handleContextSelectConnectedFragment,
    handleContextInvertStereoAtAtom,
    handleContextSwapAtomPositions,
    handleContextAddExplicitHydrogen,
    handleContextToggleExplicitCarbonLabel,
    handleContextGroupSelection,
    handleContextUngroupSelection,
    ungroupConfirmOpen,
    handleCancelUngroupConfirm,
    handleConfirmUngroup,
    handleContextApplySelectionFontSize,
    handleContextApplySelectionBondThickness,
    handleContextApplySelectionOpacity,
    handleContextEditSruBracketSubscript,
  };
}
