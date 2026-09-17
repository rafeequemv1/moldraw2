/**
 * App chrome handlers for the 2D editor (keyboard, clipboard, clear-all, color,
 * inline text layout). Canvas draw/mutate defaults live in
 * `features/canvas/useDefaultCanvasCommands` via MoldrawCanvas.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from 'react';
import type {
  CanvasImage,
  CanvasShape,
  CanvasText,
  Molecule,
  ReactionArrowUpdatePatch,
} from '@moldraw/domain';
import { getSelectionAabb, offsetReactionArrowForDrag } from '@moldraw/canvas/geometry';
import { resetRingPickCycle } from '@moldraw/canvas/interaction';
import type { InfiniteCanvasHandle } from '@moldraw/canvas/InfiniteCanvas';
import { cipTagsById, type CipStereoTags } from '@moldraw/engine-2d';
import { CMD } from '@moldraw/core/commands/registry';
import type { CommandResult } from '@moldraw/core/commands';
import type { MoleculeEditor } from '@moldraw/core';
import { updateCanvasShape } from '@moldraw/core/molecule/mutations';
import { viewportWorldCenter } from '@moldraw/core/molecule/importPlacement';
import type { FragmentPlacementSession } from '@moldraw/core/molecule/fragmentPlacement';
import {
  applyQuickSelectAction,
  documentHasSelectableObjects,
  selectAllDocumentObjects,
  type QuickSelectActionId,
  type QuickSelectOptions,
} from '../selection/quickSelect';
import {
  type ColorApplyFlags,
} from '@moldraw/core/color/selectionColor';
import type { ColorTargetPrefs, GeneralSettings } from '../settings/types';
import type { CanvasContextMenuState } from '../components/CanvasContextMenu';
import type { InfoPanelData } from '../components/MoleculeInfoPanel';
import type { UseMoleculeClipboard } from './useMoleculeClipboard';

export interface UseMoleculeCanvasCommandsOptions {
  applyCommand: (commandId: string, input: unknown) => CommandResult;
  /** Live scrubbing (liquid level) without flooding the undo stack. */
  moleculeEditor: MoleculeEditor;
  molecule: Molecule;
  moleculeRef: MutableRefObject<Molecule>;

  selectedAtomIds: string[];
  setSelectedAtomIds: Dispatch<SetStateAction<string[]>>;
  selectedChargeAtomIds: string[];
  setSelectedChargeAtomIds: Dispatch<SetStateAction<string[]>>;
  selectedChargeMarkKind: 'formal' | 'delta' | null;
  setSelectedChargeMarkKind: Dispatch<SetStateAction<'formal' | 'delta' | null>>;
  selectedBondIds: string[];
  setSelectedBondIds: Dispatch<SetStateAction<string[]>>;
  selectedCanvasTextId: string | null;
  setSelectedCanvasTextId: Dispatch<SetStateAction<string | null>>;
  selectedReactionArrowId: string | null;
  setSelectedReactionArrowId: Dispatch<SetStateAction<string | null>>;
  selectedSruBracketId: string | null;
  setSelectedSruBracketId: Dispatch<SetStateAction<string | null>>;
  setSelectedCanvasImageId: Dispatch<SetStateAction<string | null>>;
  selectedCanvasText: CanvasText | null;
  colorEditStrokeId: string | null;
  colorEditCanvasShapeId: string | null;

  activeTool: string;
  activeToolRef: MutableRefObject<string>;
  setActiveTool: (tool: string) => void;
  handleToolbarSelect: (toolId: string) => void;
  setActivePlacementElement: (symbol: string) => void;

  clipboard: UseMoleculeClipboard;
  viewportInfoRef: MutableRefObject<{ x: number; y: number; zoom: number }>;
  viewportInfo: { x: number; y: number; zoom: number };
  canvasRef: RefObject<InfiniteCanvasHandle | null>;

  cipStereoTags: CipStereoTags | null;

  editingAtomAliasId: string | null;
  dismissAliasEditorOnDelete: () => void;
  cancelAtomAliasEdit: () => void;

  contextMenu: CanvasContextMenuState | null;
  setContextMenu: Dispatch<SetStateAction<CanvasContextMenuState | null>>;
  contextMenuRef: MutableRefObject<CanvasContextMenuState | null>;

  fragmentPlacement: FragmentPlacementSession | null;
  setFragmentPlacement: Dispatch<SetStateAction<FragmentPlacementSession | null>>;
  showTemplateLibrary: boolean;
  setShowTemplateLibrary: Dispatch<SetStateAction<boolean>>;
  setShowInfoPanel: Dispatch<SetStateAction<boolean>>;
  setInfoData: Dispatch<SetStateAction<InfoPanelData | null>>;

  resetAutoCleanup: () => void;

  appSettings: {
    colorTargets: ColorTargetPrefs;
  };
  updateAppSettingsGeneral: (patch: Partial<GeneralSettings>) => void;
}

export function useMoleculeCanvasCommands({
  applyCommand,
  moleculeEditor,
  molecule,
  moleculeRef,
  selectedAtomIds,
  setSelectedAtomIds,
  selectedChargeAtomIds,
  setSelectedChargeAtomIds,
  selectedChargeMarkKind,
  setSelectedChargeMarkKind,
  selectedBondIds,
  setSelectedBondIds,
  selectedCanvasTextId,
  setSelectedCanvasTextId,
  selectedReactionArrowId,
  setSelectedReactionArrowId,
  selectedSruBracketId,
  setSelectedSruBracketId,
  setSelectedCanvasImageId,
  selectedCanvasText,
  colorEditStrokeId,
  colorEditCanvasShapeId,
  activeTool,
  activeToolRef,
  setActiveTool,
  handleToolbarSelect,
  setActivePlacementElement,
  clipboard,
  viewportInfoRef,
  viewportInfo,
  canvasRef,
  cipStereoTags,
  editingAtomAliasId,
  dismissAliasEditorOnDelete,
  cancelAtomAliasEdit,
  contextMenu,
  setContextMenu,
  contextMenuRef,
  fragmentPlacement,
  setFragmentPlacement,
  showTemplateLibrary,
  setShowTemplateLibrary,
  setShowInfoPanel,
  setInfoData,
  resetAutoCleanup,
  appSettings,
  updateAppSettingsGeneral,
}: UseMoleculeCanvasCommandsOptions) {
  const [inlineEditorFocused, setInlineEditorFocused] = useState(false);
  const [inlineEditorPos, setInlineEditorPos] = useState<{
    left: number;
    top: number;
    zoom: number;
  } | null>(null);
  const inlineTextareaRef = useRef<HTMLTextAreaElement>(null);
  const lastInlineFocusId = useRef<string | null>(null);
  /** Label id that should receive the caret as soon as its editor is mounted. */
  const pendingInlineFocusId = useRef<string | null>(null);

  /**
   * Give the inline editor the caret if a focus request is parked for it.
   * Called from the selection effect and again from the editor's own mount
   * effect (`onMount`) so the request survives the editor being unmounted
   * while the canvas owns a move / resize / rotate.
   */
  const focusInlineEditorIfPending = useCallback(() => {
    const id = pendingInlineFocusId.current;
    const ta = inlineTextareaRef.current;
    if (!id || !ta) return;
    pendingInlineFocusId.current = null;
    requestAnimationFrame(() => {
      const el = inlineTextareaRef.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      // Fresh label: typing replaces the placeholder word.
      if (el.value === 'Text') el.select();
    });
  }, []);

  const handleDelete = useCallback(() => {
    if (editingAtomAliasId) {
      dismissAliasEditorOnDelete();
      return;
    }
    const menu = contextMenuRef.current;
    if (menu?.canvasImageId) {
      applyCommand(CMD.DeleteCanvasImage, { id: menu.canvasImageId });
      setContextMenu(null);
      return;
    }
    if (menu?.canvasShapeId) {
      applyCommand(CMD.DeleteCanvasShape, { id: menu.canvasShapeId });
      setContextMenu(null);
      return;
    }
    if (menu?.strokeId) {
      applyCommand(CMD.DeleteStroke, { id: menu.strokeId });
      setContextMenu(null);
      return;
    }
    if (menu?.canvasTextId) {
      applyCommand(CMD.DeleteCanvasText, { id: menu.canvasTextId });
      setSelectedCanvasTextId(null);
      setContextMenu(null);
      return;
    }
    if (menu?.sruBracketId) {
      applyCommand(CMD.DeleteSruBracket, { id: menu.sruBracketId });
      setSelectedSruBracketId(null);
      setContextMenu(null);
      return;
    }
    if (menu?.reactionArrowId) {
      applyCommand(CMD.DeleteReactionArrow, { id: menu.reactionArrowId });
      setSelectedReactionArrowId(null);
      setContextMenu(null);
      return;
    }
    if (selectedSruBracketId) {
      applyCommand(CMD.DeleteSruBracket, { id: selectedSruBracketId });
      setSelectedSruBracketId(null);
      return;
    }
    if (selectedCanvasTextId) {
      applyCommand(CMD.DeleteCanvasText, { id: selectedCanvasTextId });
      setSelectedCanvasTextId(null);
      return;
    }
    if (selectedReactionArrowId) {
      applyCommand(CMD.DeleteReactionArrow, { id: selectedReactionArrowId });
      setSelectedReactionArrowId(null);
      return;
    }
    if (colorEditCanvasShapeId) {
      // Erase expands Objects-collection siblings (COF) in one undo step.
      applyCommand(CMD.Erase, { type: 'canvasShape', id: colorEditCanvasShapeId });
      return;
    }
    const orbitalIds = moleculeEditor.getSelection().canvasOrbitalIds ?? [];
    if (orbitalIds.length > 0) {
      for (const id of orbitalIds) {
        applyCommand(CMD.Erase, { type: 'canvasOrbital', id });
      }
      moleculeEditor.setSelection({ canvasOrbitalIds: [] });
      return;
    }
    if (colorEditStrokeId) {
      applyCommand(CMD.DeleteStroke, { id: colorEditStrokeId });
      return;
    }
    const imageId = moleculeEditor.getSelection().canvasImageId;
    if (imageId) {
      applyCommand(CMD.DeleteCanvasImage, { id: imageId });
      setSelectedCanvasImageId(null);
      return;
    }
    if (selectedChargeAtomIds.length > 0) {
      for (const atomId of selectedChargeAtomIds) {
        if (selectedChargeMarkKind === 'delta') {
          applyCommand(CMD.SetAtomDeltaCharge, { atomId, deltaCharge: 0 });
        } else if (selectedChargeMarkKind === 'formal') {
          applyCommand(CMD.SetAtomCharge, { atomId, charge: 0 });
        } else {
          applyCommand(CMD.SetAtomCharge, { atomId, charge: 0 });
          applyCommand(CMD.SetAtomDeltaCharge, { atomId, deltaCharge: 0 });
        }
      }
      setSelectedChargeAtomIds([]);
      setSelectedChargeMarkKind(null);
      return;
    }
    if (selectedAtomIds.length === 0 && selectedBondIds.length === 0) return;
    applyCommand(CMD.DeleteSelection, {
      atomIds: selectedAtomIds,
      bondIds: selectedBondIds,
    });
    setSelectedAtomIds([]);
    setSelectedBondIds([]);
  }, [
    selectedChargeAtomIds,
    setSelectedChargeAtomIds,
    selectedChargeMarkKind,
    setSelectedChargeMarkKind,
    selectedAtomIds,
    selectedBondIds,
    selectedCanvasTextId,
    selectedReactionArrowId,
    selectedSruBracketId,
    colorEditCanvasShapeId,
    colorEditStrokeId,
    moleculeEditor,
    editingAtomAliasId,
    dismissAliasEditorOnDelete,
    applyCommand,
    contextMenuRef,
    setContextMenu,
    setSelectedAtomIds,
    setSelectedBondIds,
    setSelectedCanvasTextId,
    setSelectedReactionArrowId,
    setSelectedSruBracketId,
    setSelectedCanvasImageId,
  ]);

  const handleUpdateCanvasText = useCallback(
    (id: string, patch: Partial<CanvasText>) => {
      applyCommand(CMD.UpdateCanvasText, { id, patch });
    },
    [applyCommand],
  );

  /** Insert δ / arrows / etc. at the textarea caret (or append). */
  const handleInsertChemSymbol = useCallback(
    (symbol: string) => {
      const t = selectedCanvasText;
      if (!t || !symbol) return;
      const el = inlineTextareaRef.current;
      let nextText: string;
      let caret = t.text.length + symbol.length;
      if (el && document.activeElement === el) {
        const start = el.selectionStart ?? t.text.length;
        const end = el.selectionEnd ?? start;
        nextText = t.text.slice(0, start) + symbol + t.text.slice(end);
        caret = start + symbol.length;
      } else if (el) {
        const start = el.selectionStart ?? t.text.length;
        const end = el.selectionEnd ?? start;
        nextText = t.text.slice(0, start) + symbol + t.text.slice(end);
        caret = start + symbol.length;
      } else {
        nextText = `${t.text}${symbol}`;
      }
      applyCommand(CMD.UpdateCanvasText, { id: t.id, patch: { text: nextText } });
      requestAnimationFrame(() => {
        const ta = inlineTextareaRef.current;
        if (!ta) return;
        ta.focus({ preventScroll: true });
        ta.setSelectionRange(caret, caret);
      });
    },
    [applyCommand, selectedCanvasText],
  );

  const handleUpdateCanvasShape = useCallback(
    (id: string, patch: Partial<Omit<CanvasShape, 'id'>>) => {
      applyCommand(CMD.UpdateCanvasShape, { id, patch });
    },
    [applyCommand],
  );

  /** Baseline molecule at the start of a liquid-level scrub (one undo step on end). */
  const liquidScrubBaselineRef = useRef<Molecule | null>(null);

  const beginCanvasShapeLiquidScrub = useCallback(() => {
    liquidScrubBaselineRef.current = moleculeEditor.getMolecule();
  }, [moleculeEditor]);

  const scrubCanvasShapeLiquidLevel = useCallback(
    (id: string, fillLevel: number) => {
      const level = Math.max(0, Math.min(1, fillLevel));
      moleculeEditor.replacePresentWithoutHistory(prev =>
        updateCanvasShape(prev, id, { fillLevel: level }),
      );
    },
    [moleculeEditor],
  );

  const endCanvasShapeLiquidScrub = useCallback(
    (id: string, fillLevel: number) => {
      const level = Math.max(0, Math.min(1, fillLevel));
      moleculeEditor.replacePresentWithoutHistory(prev =>
        updateCanvasShape(prev, id, { fillLevel: level }),
      );
      const baseline = liquidScrubBaselineRef.current;
      liquidScrubBaselineRef.current = null;
      if (baseline) moleculeEditor.commitUndoFromBaseline(baseline);
    },
    [moleculeEditor],
  );

  const handleSelectPlacementElement = useCallback((symbol: string) => {
    setSelectedAtomIds([]);
    setSelectedCanvasTextId(null);
    setSelectedReactionArrowId(null);
    setSelectedSruBracketId(null);
    setContextMenu(null);
    setFragmentPlacement(null);
    setActiveTool('single_bond');
    setActivePlacementElement(symbol);
  }, [
    setSelectedAtomIds,
    setSelectedCanvasTextId,
    setSelectedReactionArrowId,
    setSelectedSruBracketId,
    setContextMenu,
    setFragmentPlacement,
    setActiveTool,
    setActivePlacementElement,
  ]);

  const canvasTextLayoutKey = selectedCanvasText
    ? `${selectedCanvasText.x}:${selectedCanvasText.y}:${selectedCanvasText.fontSize}:${selectedCanvasText.boxWidth ?? 0}:${selectedCanvasText.boxHeight ?? 0}:${selectedCanvasText.rotationRad ?? 0}:${selectedCanvasText.text.length}:${selectedCanvasText.textScript ?? ''}:${selectedCanvasText.fontWeight ?? ''}:${selectedCanvasText.fontStyle ?? ''}`
    : '';

  useLayoutEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- sync DOM overlay position to selected canvas text */
    if (!selectedCanvasTextId) {
      setInlineEditorPos(null);
      lastInlineFocusId.current = null;
      return;
    }
    const t = molecule.canvasTexts?.find(x => x.id === selectedCanvasTextId);
    if (!t) {
      setInlineEditorPos(null);
      return;
    }
    const canvas = canvasRef.current?.getCanvas();
    const vp = canvasRef.current?.getViewport();
    if (!canvas || !vp) return;
    // World → client in CSS pixels. The camera is centred on the *layout*
    // size of the canvas; `canvas.width` is the HiDPI backing store and would
    // shift the overlay by half the DPR surplus.
    const rect = canvas.getBoundingClientRect();
    const cssW = canvas.clientWidth || rect.width;
    const cssH = canvas.clientHeight || rect.height;
    const cx = t.x * vp.zoom + cssW / 2 + vp.x;
    const cy = t.y * vp.zoom + cssH / 2 + vp.y;
    setInlineEditorPos({ left: rect.left + cx, top: rect.top + cy, zoom: vp.zoom });
    if (lastInlineFocusId.current !== selectedCanvasTextId) {
      lastInlineFocusId.current = selectedCanvasTextId;
      // Newly selected label wants the caret. The editor may not be mounted
      // yet (a click seeds a zero-length move that hides it until pointerup),
      // so park the request and let the editor claim it on mount.
      pendingInlineFocusId.current = selectedCanvasTextId;
      focusInlineEditorIfPending();
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps -- molecule read for layout; position driven by canvasTextLayoutKey
  }, [selectedCanvasTextId, canvasTextLayoutKey, viewportInfo]);

  const handleUpdateReactionArrow = useCallback(
    (id: string, patch: ReactionArrowUpdatePatch) => {
      applyCommand(CMD.UpdateReactionArrow, { id, ...patch });
    },
    [applyCommand],
  );

  useEffect(() => {
    if (!selectedReactionArrowId || selectedAtomIds.length > 0) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.isContentEditable || el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA') return;
      const step = e.shiftKey ? 10 : 1;
      let dx = 0;
      let dy = 0;
      if (e.key === 'ArrowLeft') {
        dx = -step;
        e.preventDefault();
      } else if (e.key === 'ArrowRight') {
        dx = step;
        e.preventDefault();
      } else if (e.key === 'ArrowUp') {
        dy = -step;
        e.preventDefault();
      } else if (e.key === 'ArrowDown') {
        dy = step;
        e.preventDefault();
      } else return;
      const a = moleculeRef.current.reactionArrows?.find(x => x.id === selectedReactionArrowId);
      if (!a) return;
      applyCommand(CMD.UpdateReactionArrow, {
        id: selectedReactionArrowId,
        ...offsetReactionArrowForDrag(a, dx, dy),
      });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedReactionArrowId, selectedAtomIds.length, applyCommand, moleculeRef]);

  const handleClearAll = useCallback(() => {
    resetRingPickCycle();
    applyCommand(CMD.ClearAll, {});
    setSelectedAtomIds([]);
    setSelectedCanvasTextId(null);
    setSelectedReactionArrowId(null);
    setShowInfoPanel(false);
    setInfoData(null);
    resetAutoCleanup();
  }, [
    resetAutoCleanup,
    applyCommand,
    setSelectedAtomIds,
    setSelectedCanvasTextId,
    setSelectedReactionArrowId,
    setShowInfoPanel,
    setInfoData,
  ]);

  const handleEscape = useCallback(() => {
    if (fragmentPlacement) {
      setActiveTool(fragmentPlacement.restoreTool);
      setFragmentPlacement(null);
      return;
    }
    if (showTemplateLibrary) {
      setShowTemplateLibrary(false);
      return;
    }
    if (editingAtomAliasId) {
      cancelAtomAliasEdit();
      return;
    }
    if (selectedCanvasTextId) {
      setSelectedCanvasTextId(null);
      return;
    }
    if (selectedReactionArrowId) {
      setSelectedReactionArrowId(null);
      return;
    }
    if (selectedAtomIds.length > 0 || selectedBondIds.length > 0) {
      setSelectedAtomIds([]);
      setSelectedBondIds([]);
      return;
    }
    if (contextMenu) {
      setContextMenu(null);
      return;
    }
    if (activeTool !== 'select') setActiveTool('select');
  }, [
    activeTool,
    contextMenu,
    editingAtomAliasId,
    cancelAtomAliasEdit,
    selectedAtomIds.length,
    selectedBondIds.length,
    selectedCanvasTextId,
    selectedReactionArrowId,
    fragmentPlacement,
    showTemplateLibrary,
    setActiveTool,
    setFragmentPlacement,
    setShowTemplateLibrary,
    setSelectedCanvasTextId,
    setSelectedReactionArrowId,
    setSelectedAtomIds,
    setSelectedBondIds,
    setContextMenu,
  ]);

  const handleSelectAll = useCallback(() => {
    if (!documentHasSelectableObjects(molecule)) return;
    moleculeEditor.setSelection(selectAllDocumentObjects(molecule));
  }, [molecule, moleculeEditor]);

  const handleQuickSelect = useCallback(
    (action: QuickSelectActionId, options?: QuickSelectOptions) => {
      if (action === 'all_atoms') {
        if (documentHasSelectableObjects(molecule)) {
          moleculeEditor.setSelection(selectAllDocumentObjects(molecule));
        }
      } else if (action === 'deselect') {
        moleculeEditor.clearSelection();
      } else {
        let cipAtomIds = options?.cipAtomIds;
        if (action === 'stereo_cip' && cipStereoTags) {
          const mapped = cipTagsById(
            cipStereoTags,
            molecule.atoms.map(a => a.id),
            molecule.bonds.map(b => b.id),
          );
          cipAtomIds = new Set(
            [...mapped.atoms.entries()]
              .filter(([, tag]) => {
                const t = tag.toUpperCase();
                return t === 'R' || t === 'S' || t === 'OR' || t === 'AND';
              })
              .map(([id]) => id),
          );
        }
        const next = applyQuickSelectAction(molecule, action, selectedAtomIds, {
          ...options,
          cipAtomIds,
        });
        moleculeEditor.setSelection({
          atomIds: next.atomIds,
          bondIds: next.bondIds,
          reactionArrowIds: [],
          canvasTextIds: [],
          canvasShapeIds: [],
          canvasImageIds: [],
          strokeIds: [],
          canvasOrbitalIds: [],
          sruBracketId: null,
        });
      }
      const tool = activeToolRef.current;
      if (
        action !== 'deselect' &&
        tool !== 'select' &&
        tool !== 'lasso_select'
      ) {
        handleToolbarSelect('select');
      }
    },
    [
      molecule,
      moleculeEditor,
      selectedAtomIds,
      cipStereoTags,
      handleToolbarSelect,
      activeToolRef,
    ],
  );

  const handleCopySelection = useCallback(() => {
    // Bond-only selections (bond click) copy the bond's endpoint atoms.
    let ids = selectedAtomIds;
    if (ids.length === 0 && selectedBondIds.length > 0) {
      const bondSet = new Set(selectedBondIds);
      const endpoints = new Set<string>();
      for (const b of molecule.bonds) {
        if (!bondSet.has(b.id)) continue;
        endpoints.add(b.fromAtomId);
        endpoints.add(b.toAtomId);
      }
      ids = [...endpoints];
    }
    clipboard.copy(molecule, ids.length > 0 ? ids : molecule.atoms.map(a => a.id));
  }, [clipboard, molecule, selectedAtomIds, selectedBondIds]);

  const handlePasteSelection = useCallback((): boolean => {
    const vp = viewportInfoRef.current;
    const target = viewportWorldCenter(vp);
    const newIds = clipboard.paste(target.x, target.y, applyCommand, {
      viewport: vp,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
    });
    if (newIds.length > 0) {
      setSelectedAtomIds(newIds);
      setSelectedCanvasTextId(null);
      setSelectedReactionArrowId(null);
      const mol = moleculeEditor.getMolecule();
      const aabb = getSelectionAabb(mol, newIds);
      if (aabb) canvasRef.current?.ensureWorldRectVisible(aabb);
      return true;
    }
    return false;
  }, [
    applyCommand,
    canvasRef,
    clipboard,
    moleculeEditor,
    viewportInfoRef,
    setSelectedAtomIds,
    setSelectedCanvasTextId,
    setSelectedReactionArrowId,
  ]);

  const handleAddCanvasImage = useCallback(
    (image: CanvasImage) => {
      const result = applyCommand(CMD.AddCanvasImage, { image });
      if (!result.ok) {
        console.error('Failed to add canvas image:', result.error.message);
        return;
      }
      setSelectedAtomIds([]);
      setSelectedCanvasTextId(null);
      setSelectedReactionArrowId(null);
      setSelectedCanvasImageId(image.id);
    },
    [
      applyCommand,
      setSelectedAtomIds,
      setSelectedCanvasTextId,
      setSelectedReactionArrowId,
      setSelectedCanvasImageId,
    ],
  );

  const handleApplySelectionColor = useCallback(
    (
      color: string,
      flags: ColorApplyFlags,
      opts: { ringFillOpacity: number; clearRingFill?: boolean; clearAllRingFills?: boolean },
    ) => {
      // When only a shape is selected, never touch molecule structure colors.
      const shapeOnly =
        !!colorEditCanvasShapeId &&
        selectedAtomIds.length === 0 &&
        !selectedCanvasTextId &&
        !selectedReactionArrowId &&
        !colorEditStrokeId;
      const safeFlags: ColorApplyFlags = shapeOnly
        ? {
            atomLabels: false,
            bonds: false,
            ringFill: false,
            text: false,
            arrowLine: false,
            arrowReagent: false,
            strokes: false,
            canvasShapes: flags.canvasShapes,
          }
        : flags;
      applyCommand(CMD.ApplySelectionColor, {
        color,
        flags: safeFlags,
        selectedAtomIds,
        selectedBondIds,
        selectedCanvasTextId,
        selectedReactionArrowId,
        selectedStrokeId: colorEditStrokeId,
        selectedCanvasShapeId: colorEditCanvasShapeId,
        ringFillOpacity: opts.ringFillOpacity,
        clearRingFill: opts.clearRingFill,
        clearAllRingFills: opts.clearAllRingFills,
      });
    },
    [
      applyCommand,
      selectedAtomIds,
      selectedBondIds,
      selectedCanvasTextId,
      selectedReactionArrowId,
      colorEditStrokeId,
      colorEditCanvasShapeId,
    ],
  );

  const handleClearAtomColors = useCallback(() => {
    if (selectedAtomIds.length === 0) return;
    applyCommand(CMD.ClearSelectionColors, { atomIds: selectedAtomIds });
  }, [selectedAtomIds, applyCommand]);

  const handleColorTargetsChange = useCallback(
    (patch: Partial<ColorTargetPrefs>) => {
      updateAppSettingsGeneral({
        colorTargets: { ...appSettings.colorTargets, ...patch },
      });
    },
    [appSettings.colorTargets, updateAppSettingsGeneral],
  );

  const ringPaintActive = false;

  return {
    inlineEditorFocused,
    setInlineEditorFocused,
    inlineEditorPos,
    setInlineEditorPos,
    inlineTextareaRef,
    lastInlineFocusId,

    handleDelete,
    handleClearAll,
    handleEscape,
    handleSelectAll,
    handleQuickSelect,
    handleCopySelection,
    handlePasteSelection,
    handleSelectPlacementElement,

    handleUpdateCanvasText,
    handleInlineEditorMount: focusInlineEditorIfPending,
    handleInsertChemSymbol,
    handleUpdateCanvasShape,
    beginCanvasShapeLiquidScrub,
    scrubCanvasShapeLiquidLevel,
    endCanvasShapeLiquidScrub,
    handleUpdateReactionArrow,
    handleAddCanvasImage,

    handleApplySelectionColor,
    handleClearAtomColors,
    handleColorTargetsChange,
    ringPaintActive,
  };
}
