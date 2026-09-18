/**
 * Global keyboard shortcuts. ChemDraw-style — every shortcut maps to a
 * dedicated callback so the host (App.tsx) controls the actual behaviour.
 *
 * Bindings come from {@link resolveShortcutBindings} (defaults + Settings overrides).
 *
 * Suppressed when focus is in an INPUT / TEXTAREA / contentEditable element so
 * typing in the inline atom-alias editor or text editor never triggers them
 * (except Undo/Redo which stay global).
 *
 * Type-to-rename: with one atom selected or hovered, pressing a letter opens the
 * inline alias editor (not rebindable — chemistry typing).
 */
import { useEffect, useRef } from 'react';
import {
  eventMatchesAction,
  resolveShortcutBindings,
  type ShortcutBindingsMap,
} from '../keyboard/shortcutBindings';

export interface KeyboardShortcutsOptions {
  activeTool: string;
  setActiveTool: (id: string) => void;
  onPickTool?: (id: string) => void;
  selectedAtomId: string | null;
  /** Atom under the pointer — type-to-label without clicking the Label tool. */
  hoverAtomIdRef?: { current: string | null };
  onEscape: () => void;
  /** Enter ends a Smart Draw stroke session (host-owned). */
  onCommitSmartDraw?: () => void;
  onDelete: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSelectAll: () => void;
  onCopy: () => void;
  onPaste: () => void;
  /** File → Save native .moldraw (entire canvas). Intercepts Ctrl/⌘+S even in text fields. */
  onSave?: () => void;
  /** Select-menu quick actions (rings, heteroatoms, invert, …). */
  onQuickSelect?: (
    action: import('../selection/quickSelect').QuickSelectActionId,
    options?: import('../selection/quickSelect').QuickSelectOptions,
  ) => void;
  onSetPlacementElement: (element: string) => void;
  onTypeAtomLabel: (atomId: string, initialChar: string) => void;
  /** Inline atom-label editor is open — never steal letters for tools/elements. */
  aliasEditorOpen?: boolean;
  /** Synchronous open flag (atom id) so keys before React re-render are not stolen. */
  aliasEditorOpenRef?: { current: string | null };
  /** Canvas text box is selected / inline editor is up. */
  canvasTextEditorOpen?: boolean;
  /** Sync flag so Space is not stolen as hand-pan before React re-renders. */
  canvasTextEditorOpenRef?: { current: boolean };
  onOpenShortcuts?: () => void;
  on3DCleanUp?: () => void;
  onTogglePerspective?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetZoom?: () => void;
  onFitView?: () => void;
  /** Persisted overrides from Settings → Shortcuts. */
  shortcutOverrides?: ShortcutBindingsMap | null;
}

const isTextInputTarget = (target: EventTarget | null): boolean => {
  if (!target) return false;
  const t = target as HTMLElement;
  if (t.isContentEditable) return true;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
};

export function useKeyboardShortcuts({
  activeTool,
  setActiveTool,
  onPickTool,
  selectedAtomId,
  hoverAtomIdRef,
  onEscape,
  onCommitSmartDraw,
  onDelete,
  onUndo,
  onRedo,
  onSelectAll,
  onCopy,
  onPaste,
  onSave,
  onQuickSelect,
  onSetPlacementElement,
  onTypeAtomLabel,
  aliasEditorOpen,
  aliasEditorOpenRef,
  canvasTextEditorOpen,
  canvasTextEditorOpenRef,
  onOpenShortcuts,
  on3DCleanUp,
  onTogglePerspective,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onFitView,
  shortcutOverrides,
}: KeyboardShortcutsOptions) {
  const cbRef = useRef({
    activeTool,
    setActiveTool,
    onPickTool,
    selectedAtomId,
    hoverAtomIdRef,
    onEscape,
    onCommitSmartDraw,
    onDelete,
    onUndo,
    onRedo,
    onSelectAll,
    onCopy,
    onPaste,
    onSave,
    onQuickSelect,
    onSetPlacementElement,
    onTypeAtomLabel,
    aliasEditorOpen,
    aliasEditorOpenRef,
    canvasTextEditorOpen,
    canvasTextEditorOpenRef,
    onOpenShortcuts,
    on3DCleanUp,
    onTogglePerspective,
    onZoomIn,
    onZoomOut,
    onResetZoom,
    onFitView,
    shortcutOverrides,
  });
  useEffect(() => {
    cbRef.current = {
      activeTool,
      setActiveTool,
      onPickTool,
      selectedAtomId,
      hoverAtomIdRef,
      onEscape,
      onCommitSmartDraw,
      onDelete,
      onUndo,
      onRedo,
      onSelectAll,
      onCopy,
      onPaste,
      onSave,
      onQuickSelect,
      onSetPlacementElement,
      onTypeAtomLabel,
      aliasEditorOpen,
      aliasEditorOpenRef,
      canvasTextEditorOpen,
      canvasTextEditorOpenRef,
      onOpenShortcuts,
      on3DCleanUp,
      onTogglePerspective,
      onZoomIn,
      onZoomOut,
      onResetZoom,
      onFitView,
      shortcutOverrides,
    };
  });

  const previousToolRef = useRef(activeTool);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const cb = cbRef.current;
      const bindings = resolveShortcutBindings(cb.shortcutOverrides);
      const match = (id: Parameters<typeof eventMatchesAction>[1]) =>
        eventMatchesAction(e, id, bindings);
      const editingCanvasText = Boolean(
        cb.canvasTextEditorOpenRef?.current || cb.canvasTextEditorOpen,
      );
      const inText = isTextInputTarget(e.target) || editingCanvasText;

      if (e.key === 'Escape' || (!inText && match('cancel'))) {
        if (e.key !== 'Escape') e.preventDefault();
        cb.onEscape();
        return;
      }

      if (
        !inText &&
        e.key === 'Enter' &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        cb.activeTool === 'smart_draw'
      ) {
        e.preventDefault();
        cb.onCommitSmartDraw?.();
        return;
      }

      // Undo / redo stay global (even in text fields).
      if (match('undo')) {
        e.preventDefault();
        cb.onUndo();
        return;
      }
      if (match('redo')) {
        e.preventDefault();
        cb.onRedo();
        return;
      }

      if (match('openShortcuts')) {
        if (inText) return;
        e.preventDefault();
        cb.onOpenShortcuts?.();
        return;
      }

      if (match('selectAll')) {
        if (inText) return;
        e.preventDefault();
        cb.onSelectAll();
        return;
      }
      if (match('copy')) {
        if (inText) return;
        cb.onCopy();
        return;
      }
      if (match('paste')) {
        if (inText) return;
        // Native `paste` is the only Ctrl+V path. Handling it here as well
        // imported Excel SMILES twice (keydown + paste, and often a cell bitmap).
        return;
      }
      // Save intercepts Ctrl/⌘+S globally so the browser does not "Save page".
      if (match('save')) {
        e.preventDefault();
        cb.onSave?.();
        return;
      }

      const quick = cb.onQuickSelect;
      if (quick && !inText) {
        const quickMatches: Array<{
          id: Parameters<typeof eventMatchesAction>[1];
          action: import('../selection/quickSelect').QuickSelectActionId;
          options?: import('../selection/quickSelect').QuickSelectOptions;
        }> = [
          { id: 'selectDeselect', action: 'deselect' },
          { id: 'selectInvert', action: 'invert' },
          { id: 'selectConnected', action: 'connected' },
          { id: 'selectGrow', action: 'grow' },
          { id: 'selectSameAs', action: 'same_as_selection' },
          { id: 'selectAllRings', action: 'all_rings' },
          { id: 'selectHeteroatoms', action: 'heteroatoms' },
          { id: 'selectChain', action: 'chain' },
          { id: 'selectLongestPath', action: 'longest_path' },
          { id: 'selectSideChains', action: 'side_chains' },
          { id: 'selectRing5', action: 'ring_size', options: { ringSize: 5 } },
          { id: 'selectRing6', action: 'ring_size', options: { ringSize: 6 } },
          { id: 'selectAromatic', action: 'aromatic' },
          { id: 'selectCharged', action: 'charged' },
          { id: 'selectStereoWedgeDash', action: 'stereo_wedge_dash' },
          { id: 'selectStereoCip', action: 'stereo_cip' },
          { id: 'selectAliases', action: 'aliases' },
          { id: 'selectBondsInSelection', action: 'bonds_in_selection' },
          { id: 'selectAllBonds', action: 'all_bonds' },
        ];
        for (const q of quickMatches) {
          if (match(q.id)) {
            e.preventDefault();
            quick(q.action, q.options);
            return;
          }
        }
      }

      if (match('cleanup3d')) {
        if (inText) return;
        e.preventDefault();
        cb.on3DCleanUp?.();
        return;
      }
      if (match('togglePerspective')) {
        if (inText) return;
        e.preventDefault();
        cb.onTogglePerspective?.();
        return;
      }
      if (match('zoomIn')) {
        if (inText) return;
        e.preventDefault();
        cb.onZoomIn?.();
        return;
      }
      if (match('zoomOut')) {
        if (inText) return;
        e.preventDefault();
        cb.onZoomOut?.();
        return;
      }
      if (match('resetZoom')) {
        if (inText) return;
        e.preventDefault();
        cb.onResetZoom?.();
        return;
      }
      if (match('fitView')) {
        if (inText) return;
        e.preventDefault();
        cb.onFitView?.();
        return;
      }

      if (inText) return;

      const isLabelChar = e.key.length === 1 && /^[A-Za-z0-9+\-()]$/.test(e.key);
      const mod = e.ctrlKey || e.metaKey;
      const editingId = cb.aliasEditorOpenRef?.current ?? null;
      const editorOpen = Boolean(editingId || cb.aliasEditorOpen);
      const labelAtomId = editingId ?? cb.selectedAtomId ?? cb.hoverAtomIdRef?.current ?? null;

      // Overlay may not have focus yet (rAF). Don't steal keys for tools/elements.
      // Use the ref so the first letters of COONa are not eaten as O/N shortcuts.
      if (editorOpen) {
        if (isLabelChar && !mod && !e.altKey && labelAtomId) {
          e.preventDefault();
          cb.onTypeAtomLabel(labelAtomId, e.key);
        }
        return;
      }

      if (match('delete')) {
        cb.onDelete();
        return;
      }

      if (match('tempSelect') && cb.activeTool !== 'hand') {
        e.preventDefault();
        previousToolRef.current = cb.activeTool;
        cb.setActiveTool('hand');
        return;
      }

      const pickTool = cb.onPickTool ?? cb.setActiveTool;
      if (match('toolHand')) {
        e.preventDefault();
        pickTool('hand');
        return;
      }
      if (match('toolSelect')) {
        e.preventDefault();
        pickTool('select');
        return;
      }
      if (match('toolLasso')) {
        e.preventDefault();
        pickTool('lasso_select');
        return;
      }
      if (match('toolErase')) {
        e.preventDefault();
        pickTool('erase');
        return;
      }
      if (match('toolSingleBond')) {
        e.preventDefault();
        pickTool('single_bond');
        return;
      }
      if (match('toolDoubleBond')) {
        e.preventDefault();
        pickTool('double_bond');
        return;
      }
      if (match('toolTripleBond')) {
        e.preventDefault();
        pickTool('triple_bond');
        return;
      }

      // Type-to-rename takes precedence over element/tool letter shortcuts.
      // Keep the typed case (`a` not `A`) so two-letter symbols like Na work.
      if (isLabelChar && /^[A-Za-z]$/.test(e.key) && !mod && labelAtomId) {
        e.preventDefault();
        cb.onTypeAtomLabel(labelAtomId, e.key);
        return;
      }

      if (match('toolBenzene')) {
        e.preventDefault();
        cb.setActiveTool('benzene');
        return;
      }

      const elementActions: [Parameters<typeof eventMatchesAction>[1], string][] = [
        ['elementCl', 'Cl'],
        ['elementBr', 'Br'],
        ['elementI', 'I'],
        ['elementC', 'C'],
        ['elementN', 'N'],
        ['elementO', 'O'],
        ['elementS', 'S'],
        ['elementP', 'P'],
        ['elementF', 'F'],
        ['elementH', 'H'],
      ];
      for (const [actionId, el] of elementActions) {
        if (match(actionId)) {
          e.preventDefault();
          cb.onSetPlacementElement(el);
          return;
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const cb = cbRef.current;
      const bindings = resolveShortcutBindings(cb.shortcutOverrides);
      const editingCanvasText = Boolean(
        cb.canvasTextEditorOpenRef?.current || cb.canvasTextEditorOpen,
      );
      if (isTextInputTarget(e.target) || editingCanvasText) return;
      if (eventMatchesAction(e, 'tempSelect', bindings) || e.code === 'Space') {
        e.preventDefault();
        cb.setActiveTool(previousToolRef.current);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);
}
