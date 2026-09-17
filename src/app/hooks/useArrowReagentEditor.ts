import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { Molecule, ReactionArrowUpdatePatch } from '@moldraw/domain';
import { reactionArrowSupportsReagentLabels, resolveReagentFontSize } from '@moldraw/domain';
import { reactionArrowReagentSlotPositions } from '@moldraw/canvas/geometry';
import type { InfiniteCanvasHandle } from '@moldraw/canvas/InfiniteCanvas';

export type ArrowReagentSlot = 'above' | 'below';

export interface UseArrowReagentEditorOptions {
  molecule: Molecule;
  canvasRef: RefObject<InfiniteCanvasHandle | null>;
  viewportInfo: unknown;
  onUpdateReactionArrow: (id: string, patch: ReactionArrowUpdatePatch) => void;
  setSelectedReactionArrowId: (id: string | null) => void;
  setSelectedCanvasTextId: (id: string | null) => void;
}

export function useArrowReagentEditor({
  molecule,
  canvasRef,
  viewportInfo,
  onUpdateReactionArrow,
  setSelectedReactionArrowId,
  setSelectedCanvasTextId,
}: UseArrowReagentEditorOptions) {
  const [editing, setEditing] = useState<{ arrowId: string; slot: ArrowReagentSlot } | null>(
    null,
  );
  const [draft, setDraft] = useState('');
  const [topBarFocusSlot, setTopBarFocusSlot] = useState<ArrowReagentSlot | null>(null);
  const cancelCommitRef = useRef(false);

  const handleRequestArrowReagentEdit = useCallback(
    (arrowId: string, slot: ArrowReagentSlot) => {
      const arrow = molecule.reactionArrows?.find(a => a.id === arrowId);
      if (!arrow || !reactionArrowSupportsReagentLabels(arrow.kind)) return;
      setSelectedCanvasTextId(null);
      setSelectedReactionArrowId(arrowId);
      cancelCommitRef.current = false;
      setEditing({ arrowId, slot });
      setDraft(slot === 'above' ? (arrow.reagentAbove ?? '') : (arrow.reagentBelow ?? ''));
      setTopBarFocusSlot(null);
    },
    [molecule.reactionArrows, setSelectedCanvasTextId, setSelectedReactionArrowId],
  );

  const finishEditing = useCallback(() => {
    setEditing(null);
    setDraft('');
    setTopBarFocusSlot(null);
    cancelCommitRef.current = false;
  }, []);

  const commitReagentEdit = useCallback(() => {
    if (cancelCommitRef.current) {
      cancelCommitRef.current = false;
      finishEditing();
      return;
    }
    if (!editing) return;
    const patch =
      editing.slot === 'above' ? { reagentAbove: draft } : { reagentBelow: draft };
    onUpdateReactionArrow(editing.arrowId, patch);
    finishEditing();
  }, [draft, editing, finishEditing, onUpdateReactionArrow]);

  const cancelReagentEdit = useCallback(() => {
    cancelCommitRef.current = true;
    finishEditing();
  }, [finishEditing]);

  const [inlinePos, setInlinePos] = useState<{
    left: number;
    top: number;
    zoom: number;
  } | null>(null);

  const layoutKey = editing
    ? (() => {
        const a = molecule.reactionArrows?.find(x => x.id === editing.arrowId);
        return a
          ? `${editing.arrowId}:${a.x1}:${a.y1}:${a.x2}:${a.y2}:${editing.slot}:${resolveReagentFontSize(a, editing.slot)}`
          : editing.arrowId;
      })()
    : '';

  useLayoutEffect(() => {
    if (!editing) {
      setInlinePos(null);
      return;
    }
    const arrow = molecule.reactionArrows?.find(a => a.id === editing.arrowId);
    if (!arrow) {
      setInlinePos(null);
      return;
    }
    const canvas = canvasRef.current?.getCanvas();
    const vp = canvasRef.current?.getViewport();
    if (!canvas || !vp) return;
    const slots = reactionArrowReagentSlotPositions(arrow);
    const p = slots[editing.slot];
    const rect = canvas.getBoundingClientRect();
    const cx = p.x * vp.zoom + canvas.width / 2 + vp.x;
    const cy = p.y * vp.zoom + canvas.height / 2 + vp.y;
    setInlinePos({ left: rect.left + cx, top: rect.top + cy, zoom: vp.zoom });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- layout reads molecule; key drives updates
  }, [editing, layoutKey, viewportInfo, molecule.reactionArrows, canvasRef]);

  const editingArrow = editing
    ? molecule.reactionArrows?.find(a => a.id === editing.arrowId)
    : undefined;
  const editingFontSize = editingArrow
    ? resolveReagentFontSize(editingArrow, editing.slot)
    : undefined;

  return {
    editingArrowReagent: editing,
    arrowReagentDraft: draft,
    setArrowReagentDraft: setDraft,
    inlineArrowReagentPos: inlinePos,
    arrowReagentFontSize: editingFontSize,
    topBarReagentFocusSlot: topBarFocusSlot,
    handleRequestArrowReagentEdit,
    commitReagentEdit,
    cancelReagentEdit,
    requestTopBarReagentFocus: setTopBarFocusSlot,
  };
}

export type UseArrowReagentEditor = ReturnType<typeof useArrowReagentEditor>;
