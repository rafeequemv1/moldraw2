/**
 * Inline functional-group / atom-alias editor state + commit path.
 * Extracted from App.tsx (fable report 02 — hooks-first path).
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import type { Molecule } from '@moldraw/domain';
import {
  ABBREVIATION_PALETTE,
  ABBREV_TEMPLATE_MAP,
  autocapitalizeAtomAliasDraft,
  condensedGroupLabelForAtom,
  detectExpandedAliasAtAtom,
  formatAliasWithCharge,
  getAbbrevCategory,
  normalizeAliasLabelCharacters,
} from '@moldraw/domain';
import { CMD } from '@moldraw/core/commands';
import type { CommandResult } from '@moldraw/core/commands';
import type { InfiniteCanvasHandle } from '@moldraw/canvas/InfiniteCanvas';
import type { AliasSuggestionItem } from '../types';

export interface UseAtomAliasEditorOptions {
  molecule: Molecule;
  applyCommand: (commandId: string, input: unknown) => CommandResult;
  canvasRef: RefObject<InfiniteCanvasHandle | null>;
  viewportInfo: { x: number; y: number; zoom: number };
  condensedGroupLabels: boolean;
  setSelectedAtomIds: (ids: string[]) => void;
  setSelectedBondIds: (ids: string[]) => void;
  setSelectedCanvasTextId: (id: string | null) => void;
  setSelectedReactionArrowId: (id: string | null) => void;
}

export function useAtomAliasEditor({
  molecule,
  applyCommand,
  canvasRef,
  viewportInfo,
  condensedGroupLabels,
  setSelectedAtomIds,
  setSelectedBondIds,
  setSelectedCanvasTextId,
  setSelectedReactionArrowId,
}: UseAtomAliasEditorOptions) {
  const [editingAtomAliasId, setEditingAtomAliasId] = useState<string | null>(null);
  const [editingAliasDraft, setEditingAliasDraft] = useState('');
  const [aliasSuggestIndex, setAliasSuggestIndex] = useState(0);
  const [activeAliasPreviewKey, setActiveAliasPreviewKey] = useState<string | null>(null);
  const [activeAliasPreviewPinned, setActiveAliasPreviewPinned] = useState(false);
  const [inlineAtomAliasFocused, setInlineAtomAliasFocused] = useState(false);
  const [inlineAtomAliasPos, setInlineAtomAliasPos] = useState<{
    left: number;
    top: number;
    zoom: number;
  } | null>(null);
  const [atomAliasError, setAtomAliasError] = useState<string | null>(null);
  const atomAliasInputRef = useRef<HTMLInputElement>(null);
  const lastAtomAliasFocusId = useRef<string | null>(null);
  const cancelAtomAliasCommitRef = useRef(false);

  const aliasSuggestions = useMemo<AliasSuggestionItem[]>(() => {
    const q = editingAliasDraft.trim().toLowerCase();
    const base = ABBREVIATION_PALETTE.filter(v => (q ? v.toLowerCase().includes(q) : true));
    const editingAtom = editingAtomAliasId
      ? molecule.atoms.find(a => a.id === editingAtomAliasId)
      : null;
    const bondOrder = editingAtom
      ? molecule.bonds
          .filter(b => b.fromAtomId === editingAtom.id || b.toAtomId === editingAtom.id)
          .reduce((s, b) => s + b.order, 0)
      : 0;
    const aromaticLike = editingAtom
      ? molecule.bonds.filter(
          b =>
            (b.fromAtomId === editingAtom.id || b.toAtomId === editingAtom.id) && b.order >= 2,
        ).length > 0
      : false;
    const rank = (abbr: string): number => {
      let s = 0;
      const u = abbr.toUpperCase();
      if (editingAtom?.element.toUpperCase() === 'O' && (u === 'OME' || u === 'OET' || u === 'OH')) {
        s += 10;
      }
      if (
        editingAtom?.element.toUpperCase() === 'N' &&
        (u === 'NME2' || u === 'NH2' || u === 'BOC' || u === 'CBZ' || u === 'FMOC')
      ) {
        s += 10;
      }
      if (
        editingAtom?.element.toUpperCase() === 'S' &&
        (u === 'SO3H' || u === 'SO2ME' || u === 'TS' || u === 'MS')
      ) {
        s += 10;
      }
      if (editingAtom?.element.toUpperCase() === 'C' && aromaticLike && (u === 'PH' || u === 'BN')) {
        s += 9;
      }
      if (
        editingAtom?.element.toUpperCase() === 'C' &&
        bondOrder <= 1 &&
        (u === 'R' ||
          u === 'R1' ||
          u === 'R2' ||
          u === 'ME' ||
          u === 'ET' ||
          u === 'IPR' ||
          u === 'TBU' ||
          abbr === '(CH2)n' ||
          abbr === '-(CH2)n-' ||
          abbr.toUpperCase() === 'CNH2N+1')
      ) {
        s += 8;
      }
      if (q && abbr.toLowerCase().startsWith(q)) s += 4;
      return s;
    };
    const ranked = [...base].sort((a, b) => rank(b) - rank(a) || a.localeCompare(b));
    const exact = q ? base.find(v => v.toLowerCase() === q) : null;
    const structured = ranked.slice(0, 10).map(value => {
      const k = value.trim().toUpperCase();
      const tpl = ABBREV_TEMPLATE_MAP[k];
      return {
        value,
        key: tpl?.key ?? k,
        category: tpl?.category ?? getAbbrevCategory(k),
        preview: tpl?.preview,
      } as AliasSuggestionItem;
    });
    if (q && !exact) {
      return [{ value: editingAliasDraft.trim(), custom: true }, ...structured].slice(0, 10);
    }
    return structured;
  }, [editingAliasDraft, editingAtomAliasId, molecule.atoms, molecule.bonds]);

  useEffect(() => {
    setAliasSuggestIndex(i => Math.max(0, Math.min(i, Math.max(0, aliasSuggestions.length - 1))));
  }, [aliasSuggestions.length]);

  const finishAtomAliasUi = useCallback(() => {
    setEditingAtomAliasId(null);
    setEditingAliasDraft('');
    setAliasSuggestIndex(0);
    setActiveAliasPreviewKey(null);
    setActiveAliasPreviewPinned(false);
    setAtomAliasError(null);
    setInlineAtomAliasPos(null);
    setInlineAtomAliasFocused(false);
    lastAtomAliasFocusId.current = null;
    setSelectedAtomIds([]);
    setSelectedBondIds([]);
  }, [setSelectedAtomIds, setSelectedBondIds]);

  /** ChemDraw-like: discard an unlabeled lone atom created by empty-canvas label place. */
  const removeOrphanLabelAtom = useCallback(
    (atomId: string) => {
      const atom = molecule.atoms.find(a => a.id === atomId);
      if (!atom) return;
      const hasBonds = molecule.bonds.some(
        b => b.fromAtomId === atomId || b.toAtomId === atomId,
      );
      if (hasBonds || atom.alias?.trim()) return;
      applyCommand(CMD.DeleteAtoms, { atomIds: [atomId] });
    },
    [applyCommand, molecule.atoms, molecule.bonds],
  );

  const cancelAtomAliasEdit = useCallback(() => {
    cancelAtomAliasCommitRef.current = true;
    const id = editingAtomAliasId;
    finishAtomAliasUi();
    if (id) removeOrphanLabelAtom(id);
  }, [editingAtomAliasId, finishAtomAliasUi, removeOrphanLabelAtom]);

  const commitAtomAlias = useCallback(
    (draftOverride?: string) => {
      if (cancelAtomAliasCommitRef.current) {
        cancelAtomAliasCommitRef.current = false;
        return;
      }
      if (!editingAtomAliasId) return;
      const id = editingAtomAliasId;
      const draft = (draftOverride ?? editingAliasDraft).trim();
      setAtomAliasError(null);
      if (!draft) {
        // Empty commit on a fresh empty-canvas place → remove the atom.
        const atom = molecule.atoms.find(a => a.id === id);
        const hasBonds = molecule.bonds.some(
          b => b.fromAtomId === id || b.toAtomId === id,
        );
        if (atom && !hasBonds && !atom.alias?.trim()) {
          applyCommand(CMD.DeleteAtoms, { atomIds: [id] });
          finishAtomAliasUi();
          return;
        }
      }
      const result = applyCommand(CMD.CommitAtomAlias, { atomId: id, alias: draft });
      if (!result.ok) {
        setAtomAliasError(result.error.message);
        requestAnimationFrame(() => atomAliasInputRef.current?.focus({ preventScroll: true }));
        return;
      }
      finishAtomAliasUi();
    },
    [
      editingAtomAliasId,
      editingAliasDraft,
      applyCommand,
      finishAtomAliasUi,
      molecule.atoms,
      molecule.bonds,
    ],
  );

  const handleRequestAtomAliasEdit = useCallback(
    (atomId: string, initialDraft?: string) => {
      setSelectedCanvasTextId(null);
      setSelectedReactionArrowId(null);
      setSelectedAtomIds([atomId]);
      const a = molecule.atoms.find(x => x.id === atomId);
      let draft = initialDraft !== undefined ? initialDraft : (a?.alias ?? '');
      if (initialDraft === undefined && !draft.trim() && a) {
        if (condensedGroupLabels) {
          let bondSum = 0;
          for (const b of molecule.bonds) {
            if (b.fromAtomId === atomId || b.toAtomId === atomId) bondSum += b.order;
          }
          const condensed = condensedGroupLabelForAtom(a, molecule, bondSum);
          if (condensed) draft = condensed;
        }
        if (!draft.trim()) {
          const expanded = detectExpandedAliasAtAtom(molecule, atomId);
          if (expanded) draft = expanded;
        }
        if (!draft.trim()) draft = a.element;
      }
      // Seed typed charge suffix so students can edit NH2+ / O- in the label.
      if (initialDraft === undefined && a && (a.charge ?? 0) !== 0) {
        draft = formatAliasWithCharge(draft || a.element, a.charge);
      }
      setEditingAtomAliasId(atomId);
      setEditingAliasDraft(draft);
      setAliasSuggestIndex(0);
      setActiveAliasPreviewKey(null);
      setActiveAliasPreviewPinned(false);
      setAtomAliasError(null);
      cancelAtomAliasCommitRef.current = false;
    },
    [
      molecule,
      condensedGroupLabels,
      setSelectedAtomIds,
      setSelectedCanvasTextId,
      setSelectedReactionArrowId,
    ],
  );

  const handleTypeAtomLabel = useCallback(
    (atomId: string, initialChar: string) => {
      if (editingAtomAliasId) return;
      handleRequestAtomAliasEdit(atomId, initialChar);
    },
    [editingAtomAliasId, handleRequestAtomAliasEdit],
  );

  const dismissAliasEditorOnDelete = useCallback(() => {
    cancelAtomAliasCommitRef.current = true;
    setEditingAtomAliasId(null);
    setEditingAliasDraft('');
    setAliasSuggestIndex(0);
    setAtomAliasError(null);
    setInlineAtomAliasPos(null);
    setInlineAtomAliasFocused(false);
    lastAtomAliasFocusId.current = null;
    setSelectedAtomIds([]);
    setSelectedBondIds([]);
  }, [setSelectedAtomIds, setSelectedBondIds]);

  useEffect(() => {
    if (!editingAtomAliasId) return;
    if (molecule.atoms.some(a => a.id === editingAtomAliasId)) return;
    // Empty-canvas place: atom may not be in React props until the next tick.
    const id = editingAtomAliasId;
    const t = window.setTimeout(() => {
      setEditingAtomAliasId(cur => {
        if (cur !== id) return cur;
        // Still missing after store→React sync window → drop the editor.
        return null;
      });
      setEditingAliasDraft('');
      setAliasSuggestIndex(0);
      setActiveAliasPreviewKey(null);
      setActiveAliasPreviewPinned(false);
      setInlineAtomAliasPos(null);
      setAtomAliasError(null);
    }, 50);
    return () => window.clearTimeout(t);
  }, [molecule.atoms, editingAtomAliasId]);

  const atomAliasLayoutKey = editingAtomAliasId
    ? (() => {
        const at = molecule.atoms.find(a => a.id === editingAtomAliasId);
        return at ? `${editingAtomAliasId}:${at.x}:${at.y}` : editingAtomAliasId;
      })()
    : '';

  useLayoutEffect(() => {
    if (!editingAtomAliasId) {
      setInlineAtomAliasPos(null);
      lastAtomAliasFocusId.current = null;
      return;
    }
    const at = molecule.atoms.find(a => a.id === editingAtomAliasId);
    if (!at) {
      setInlineAtomAliasPos(null);
      return;
    }
    const canvas = canvasRef.current?.getCanvas();
    const vp = canvasRef.current?.getViewport();
    if (!canvas || !vp) return;
    const rect = canvas.getBoundingClientRect();
    const cx = at.x * vp.zoom + canvas.width / 2 + vp.x;
    const cy = at.y * vp.zoom + canvas.height / 2 + vp.y;
    setInlineAtomAliasPos({ left: rect.left + cx, top: rect.top + cy, zoom: vp.zoom });
    if (lastAtomAliasFocusId.current !== editingAtomAliasId) {
      lastAtomAliasFocusId.current = editingAtomAliasId;
      requestAnimationFrame(() => {
        const input = atomAliasInputRef.current;
        if (!input) return;
        input.focus({ preventScroll: true });
        const len = input.value.length;
        try {
          input.setSelectionRange(len, len);
        } catch {
          /* ignore */
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- layout reads molecule; key drives updates
  }, [editingAtomAliasId, atomAliasLayoutKey, viewportInfo]);

  const setEditingAliasDraftNormalized = useCallback((next: string) => {
    setEditingAliasDraft(autocapitalizeAtomAliasDraft(normalizeAliasLabelCharacters(next)));
  }, []);

  return {
    editingAtomAliasId,
    editingAliasDraft,
    setEditingAliasDraft: setEditingAliasDraftNormalized,
    aliasSuggestions,
    aliasSuggestIndex,
    setAliasSuggestIndex,
    activeAliasPreviewKey,
    setActiveAliasPreviewKey,
    activeAliasPreviewPinned,
    setActiveAliasPreviewPinned,
    inlineAtomAliasFocused,
    setInlineAtomAliasFocused,
    inlineAtomAliasPos,
    atomAliasError,
    atomAliasInputRef,
    omitAtomAliasBodyId: editingAtomAliasId,
    handleRequestAtomAliasEdit,
    handleTypeAtomLabel,
    cancelAtomAliasEdit,
    commitAtomAlias,
    finishAtomAliasUi,
    dismissAliasEditorOnDelete,
    isAliasEditorOpen: Boolean(editingAtomAliasId),
  };
}

export type UseAtomAliasEditor = ReturnType<typeof useAtomAliasEditor>;
