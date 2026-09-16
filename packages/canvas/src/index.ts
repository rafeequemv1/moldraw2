/**
 * @moldraw/canvas — embeddable 2D molecule canvas (React peer).
 */
export { MoldrawCanvas, type MoldrawCanvasProps } from './MoldrawCanvas';
export {
  InfiniteCanvas,
  type InfiniteCanvasHandle,
  type InfiniteCanvasProps,
  type SelectionDragPreview,
} from './InfiniteCanvas';
export {
  applyCanvasVisibility,
  annotationVisibilityKey,
  moleculeVisibilityKey,
  toggleHiddenId,
  type CanvasObjectKind,
  type HiddenCanvasIds,
} from './canvasVisibility';
export { getSelectionAabb, getMarqueeSelectionAabb } from './geometry';
export { useDefaultCanvasCommands } from './useDefaultCanvasCommands';
export {
  BOND_TOOLS,
  bondCommandPatchForStyleTool,
  isBondTool as isCanvasBondTool,
} from './interaction/bondToolStyles';
export type { BondToolId } from './interaction/bondToolStyles';
export {
  SMART_DRAW_TOOL_ID,
  SMART_DRAW_IDLE_MS,
  isSmartDrawTool,
} from './interaction/smartDrawSession';
export type { SmartDrawSessionResult, SmartDrawStroke } from './interaction/smartDrawSession';
export {
  exportMoleculeBitmap,
  exportMoleculeSvg,
  computeExportBounds,
  moleculeHasExportableContent,
  canvasToBlob,
  bitmapCanvasToSvgDocument,
  bitmapCanvasToSvgBlob,
  type ExportBackground,
  type ExportBounds,
  type ExportMoleculeBitmapOptions,
} from './export/exportMoleculeBitmap';
export {
  DEFAULT_STRUCTURE_THEME,
  type StructureThemeColors,
} from './render/types';
export {
  BUILTIN_STRUCTURE_THEMES,
  SKELETAL_THEME_ID,
  listStructureThemes,
  resolveStructureDrawMode,
  type CanvasStructureTheme,
  type StructureDrawMode,
} from './themes';
