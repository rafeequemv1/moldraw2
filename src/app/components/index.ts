/**
 * Barrel export for top-level UI components composed by `App.tsx`.
 *
 * Each module is small, prop-driven, and unaware of where its data/handlers
 * come from — `App.tsx` is the single owner of state and side-effects.
 */
export { AppTopBar } from './AppTopBar';
export { FileMenu } from './FileMenu';
export { SpectroscopyMenu, SPECTROSCOPY_ITEMS } from './SpectroscopyMenu';
export { ChemistryMenu } from './ChemistryMenu';
export { TopBarSelectMenu } from './TopBarSelectMenu';
export type { SelectToolId } from './TopBarSelectMenu';
export { ExportMenu } from './ExportMenu';
export { KeyboardShortcutsModal } from './KeyboardShortcutsModal';
export { PencilOptionsBar } from './PencilOptionsBar';
export { TextStylePanel } from './TextStylePanel';
export { StyleToolbar } from './StyleToolbar';
export { ArrowPropertiesTopBar } from './ArrowPropertiesTopBar';
export { ArrowPropertiesPanel } from './ArrowPropertiesPanel';
export { InlineArrowReagentEditor } from './InlineArrowReagentEditor';
export { InlineAliasEditor } from './InlineAliasEditor';
export { InlineTextEditor } from './InlineTextEditor';
export { StereochemistryDialogs } from './StereochemistryDialogs';
export { MoleculeInfoPanel } from './MoleculeInfoPanel';
export type { InfoPanelData, PubChemImportContext } from './MoleculeInfoPanel';
export { SiteFooterHost } from './SiteFooterHost';
export { CanvasContextMenu } from './CanvasContextMenu';
export type { CanvasContextMenuState } from './CanvasContextMenu';
export { TouchQuickMenu } from './TouchQuickMenu';
export type { TouchQuickMenuItem } from './TouchQuickMenu';
export { buildTouchQuickMenuItems } from './touchQuickMenuItems';
export type { TouchQuickMenuActions, TouchQuickMenuModel } from './touchQuickMenuItems';
export { ConfirmDialog } from './ConfirmDialog';
export { UngroupConfirmModal } from './UngroupConfirmModal';
export { AtomPalette } from './AtomPalette';
export { PeriodicTableModal } from './PeriodicTableModal';
export { SelectionAlignToolbar } from './SelectionAlignToolbar';
export { TopBarStyleControls } from './TopBarStyleControls';
export type {
  CircularArrayParams,
  DendrimerArrayParams,
  GrapheneGenerateParams,
  LinearArrayParams,
  SelectionArrangeAction,
  SelectionArrangeOptions,
} from './SelectionAlignToolbar';
export { SelectionActionToolbar } from './SelectionActionToolbar';
export type {
  SelectionReflectAxis,
  SelectionActionTarget,
} from './SelectionActionToolbar';
export { CanvasSmilesBar } from './CanvasSmilesBar';
export { ToolbarRail, ToolbarTopStrip, ToolbarDrawStrip } from './ToolbarRail';
export { MobileBottomSheet } from './MobileBottomSheet';
export type { MobileBottomSheetProps } from './MobileBottomSheet';
export { ObjectsPanel } from './ObjectsPanel';
export { LocalSaveToast } from './LocalSaveToast';
export { DocumentTabBar } from './DocumentTabBar';
export { ProjectLibraryModal } from './ProjectLibraryModal';
export { EditableProjectTitle } from './EditableProjectTitle';
export { DesignLibraryGrid } from './DesignLibraryGrid';
export { WorkspaceSplit } from './WorkspaceSplit';
export { ViewerLinkHint } from './ViewerLinkHint';
export { Viewer3DErrorBoundary } from './Viewer3DErrorBoundary';
export { Viewer3DWorkspace } from './Viewer3DWorkspace';
export { HardwareAccelBanner } from './HardwareAccelBanner';
export { TemplateLibraryModal, type TemplateLibraryTab } from './TemplateLibraryModal';
export { AuthModal } from './AuthModal';
export { FeatureRequestModal } from './FeatureRequestModal';
export { UpdatesModal } from './UpdatesModal';
export { HeaderSiteNav } from './HeaderSiteNav';
export { ReactionLibraryModal } from './ReactionLibraryModal';
