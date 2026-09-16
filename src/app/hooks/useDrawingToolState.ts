/**
 * Drawing-tool UI state (active tool, placement element, pencil, arrow/shape kinds).
 * Extracted from App.tsx (fable report 02 — hooks-first path).
 *
 * Fragment placement session stays in App — it needs the molecule worker.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import type { ArrowHeadStyle, ArrowTailStyle, CanvasShapeKind, ReactionArrowKind } from '@moldraw/domain';
import { ELECTRON_FLOW_DEFAULT_HEAD_SCALE } from '@moldraw/domain';
import { PLACE_FRAGMENT_TOOL_ID } from '@moldraw/core/molecule/fragmentPlacement';
import { TOOL_DEFS, type ShapeMenuValue, type ToolDef, type ToolGroup } from '../toolDefs';

export interface UseDrawingToolStateOptions {
  /** Open template library modal (toolbar). */
  onOpenTemplateLibrary?: () => void;
  /** Trigger image file picker (toolbar). */
  onPickImageFile?: () => void;
  /** Clear in-progress fragment placement when leaving place-fragment tool. */
  onLeaveFragmentPlacement?: () => void;
}

export function useDrawingToolState(options: UseDrawingToolStateOptions = {}) {
  const {
    onOpenTemplateLibrary,
    onPickImageFile,
    onLeaveFragmentPlacement,
  } = options;

  const [activeTool, setActiveTool] = useState('single_bond');
  const activeToolRef = useRef(activeTool);
  activeToolRef.current = activeTool;

  const [reactionArrowKind, setReactionArrowKind] = useState<ReactionArrowKind>('straight');
  const [reactionArrowHeadStyle, setReactionArrowHeadStyle] = useState<ArrowHeadStyle>('pair');
  const [reactionArrowTailStyle, setReactionArrowTailStyle] = useState<ArrowTailStyle>('none');
  const [reactionArrowHeadScale, setReactionArrowHeadScale] = useState(ELECTRON_FLOW_DEFAULT_HEAD_SCALE);
  const [sruBracketSubscript, setSruBracketSubscript] = useState<string>('n');
  const [canvasShapeKind, setCanvasShapeKind] = useState<CanvasShapeKind>('rectangle');
  const [shapeMenuValue, setShapeMenuValue] = useState<ShapeMenuValue>('rectangle');
  const [activeColor, setActiveColor] = useState('#0f172a');
  const [activeThickness, setActiveThickness] = useState(4);
  const [activePlacementElement, setActivePlacementElement] = useState('C');

  const handleShapeMenuValueChange = useCallback((value: ShapeMenuValue) => {
    setShapeMenuValue(value);
    setCanvasShapeKind(value);
  }, []);

  const groupedTools = useMemo(
    () =>
      ({
        select_edit: TOOL_DEFS.filter(t => t.group === 'select_edit'),
        bond_types: TOOL_DEFS.filter(t => t.group === 'bond_types'),
        rings: TOOL_DEFS.filter(t => t.group === 'rings'),
        stereo: TOOL_DEFS.filter(t => t.group === 'stereo'),
        annotate: TOOL_DEFS.filter(t => t.group === 'annotate'),
        templates: TOOL_DEFS.filter(t => t.group === 'templates'),
      }) as Record<ToolGroup, ToolDef[]>,
    [],
  );

  const handleToolbarSelect = useCallback(
    (toolId: string) => {
      if (toolId === 'template_library') {
        onOpenTemplateLibrary?.();
        return;
      }
      if (toolId === 'functional_groups' || toolId === 'ligands') {
        return;
      }
      if (toolId === 'image') {
        onPickImageFile?.();
        return;
      }
      if (activeToolRef.current === PLACE_FRAGMENT_TOOL_ID) {
        onLeaveFragmentPlacement?.();
      }
      setActiveTool(toolId);
    },
    [onLeaveFragmentPlacement, onOpenTemplateLibrary, onPickImageFile],
  );

  return {
    activeTool,
    setActiveTool,
    activeToolRef,
    reactionArrowKind,
    setReactionArrowKind,
    reactionArrowHeadStyle,
    setReactionArrowHeadStyle,
    reactionArrowTailStyle,
    setReactionArrowTailStyle,
    reactionArrowHeadScale,
    setReactionArrowHeadScale,
    sruBracketSubscript,
    setSruBracketSubscript,
    canvasShapeKind,
    setCanvasShapeKind,
    shapeMenuValue,
    handleShapeMenuValueChange,
    activeColor,
    setActiveColor,
    activeThickness,
    setActiveThickness,
    activePlacementElement,
    setActivePlacementElement,
    groupedTools,
    handleToolbarSelect,
  };
}

export type UseDrawingToolState = ReturnType<typeof useDrawingToolState>;
