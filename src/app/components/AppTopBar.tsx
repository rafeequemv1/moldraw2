/**
 * Top header bar: brand, File, search, Home/Draw/Style tabs, clipboard, export.
 * Home, Draw, and Style are exclusive ribbons on the second row.
 *
 * Stateless — every interaction is driven by callbacks from `App.tsx`.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  Wand2,
  Search,
  NotebookPen,
  Box,
  Triangle,
  Layers2,
  SquareDashed,
  List,
  Undo2,
  Redo2,
  Settings,
  Library,
  Home,
  RotateCw,
  Pencil,
  Download,
  Trash2,
  X,
} from 'lucide-react';
import { FileMenu } from './FileMenu';
import { ExportMenu } from './ExportMenu';
import { ChemistryMenuWithPlugins } from './ChemistryMenuWithPlugins';
import { CanvasSmilesBar } from './CanvasSmilesBar';
import { MobileBottomSheet } from './MobileBottomSheet';
import { TopBarColorMenu } from './TopBarColorMenu';
import { TopBarSelectMenu, type SelectToolId } from './TopBarSelectMenu';
import type { CanvasShape, CanvasText, Molecule, ReactionArrow } from '@moldraw/domain';
import type { ColorApplyFlags } from '@moldraw/core/color/selectionColor';
import type { ColorTargetPrefs } from '../settings/types';
import type { CopyAsFormat, DownloadFormat } from '../types';
import type { QuickSelectActionId, QuickSelectOptions } from '../selection/quickSelect';
import { renderToolIcon } from '../toolIcons';

/** Compact tool cluster in the second header row (no section labels). */
function ToolCluster({
  label,
  children,
  className = '',
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`app-top-bar__tools-cluster${className ? ` ${className}` : ''}`}
      role="group"
      aria-label={label}
    >
      {children}
    </div>
  );
}

export interface AppTopBarProps {
  /** Quick search */
  quickSearch: string;
  setQuickSearch: (v: string) => void;
  quickSearchLoading: boolean;
  quickSearchError: string;
  setQuickSearchError: (v: string) => void;
  onQuickSearch: () => void;
  onOpenAdvancedSearch: () => void;

  /** Selection tools + quick selects */
  activeTool: string;
  onSelectTool: (toolId: SelectToolId) => void;
  onQuickSelect: (action: QuickSelectActionId, options?: QuickSelectOptions) => void;
  shortcutOverrides?: import('../keyboard/shortcutBindings').ShortcutBindingsMap | null;

  /** File */
  openFileBusy: boolean;
  openFileError: string | null;
  onDismissOpenFileError: () => void;
  onOpenMoleculeFile: (file: File) => void;
  onPlaceFile?: (file: File) => void;
  /** Second top row: annotate / other tools (after Cleanup). */
  toolsRow?: ReactNode;
  /** Draw tab — pencil, shape, image, glassware. */
  drawRow?: ReactNode;
  /** Style tab — font, bold, bond appearance. */
  styleRow?: ReactNode;
  /** Arrow properties when a reaction arrow is selected. */
  arrowRow?: ReactNode;
  /** Pencil stroke when the pen tool is active. */
  pencilRow?: ReactNode;
  /** Optional third row (text style, align). */
  contextRow?: ReactNode;
  /** When true, reserve a third top-bar row (3D open or contextual UI). */
  expandTopRows?: boolean;
  /** Phone/tablet: 2-row header; search / chemistry / copy open as sheets. */
  isCompact?: boolean;
  /** Phone/tablet (portrait or landscape) — show rotate-view control. */
  isMobile?: boolean;
  /** Landscape (physical or forced) desktop-like chrome. */
  landscapeView?: boolean;
  onToggleLandscapeView?: () => void;

  /** Editing actions */
  onClearAll: () => void;

  /** Add one bonded H on the current atom selection (whole-molecule unfold is in the context menu). */
  onAddExplicitHydrogen?: () => void;
  onCleanupStructure: () => void;
  /** ChemDraw-style 3D Clean Up → canvas perspective pose. */
  on3DCleanUp?: () => void;
  /** Flatten: project the 3D pose onto the 2D document and leave 3D mode. */
  onFlatten3DPose?: () => void;
  /** Exit 3D mode without touching document coordinates. */
  onClear3DPose?: () => void;
  perspectiveActive?: boolean;
  perspectiveBusy?: boolean;
  /** Depth-fade strength 0–1 (when shading on). */
  depthFade?: number;
  depthShadingOn?: boolean;
  onDepthFadeChange?: (fade: number) => void;
  /** Optional depth taper (near = normal width, far = pointier). */
  depthWedgesOn?: boolean;
  onToggleDepthWedges?: () => void;
  /** When true, Cleanup prefers Indigo WASM layout (coords-only merge). */
  indigoLayoutReady?: boolean;
  /**
   * Settings: when false, Cleanup / SMILES→2D force native layout (test toggle).
   * Indigo-only tools stay gated on indigoLayoutReady.
   */
  preferIndigo2d?: boolean;
  onAromatize?: () => void;
  onDearomatize?: () => void;
  onCheckStructure?: () => void;
  showCipLabels?: boolean;
  onToggleCipLabels?: () => void;
  /** Auto atom-atom mapping across a reaction arrow. */
  onAutomap?: () => void;
  /** Insert a default SN2-style teaching reaction for automap. */
  onInsertAutomapDemo?: () => void;
  /** Multi-step mechanism + enolate resonance demo (arrow placement QA). */
  onInsertMechanismDemo?: () => void;

  selectedAtomCount: number;
  showInfoPanel: boolean;
  onToggleInfoPanel: () => void;

  showTextStylePanel: boolean;
  onToggleTextStylePanel: () => void;

  show3DViewer: boolean;
  onToggle3DViewer: () => void;

  /** Undo / redo — shown next to the 3D panel toggle. */
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;

  /** AI chat dock (Panels group with 3D view). */
  showChatPanel?: boolean;
  onToggleChatPanel?: () => void;
  /** Objects list panel (molecules / arrows / annotations). */
  showObjectsPanel?: boolean;
  onToggleObjectsPanel?: () => void;
  /** App settings — pinned on the second toolbar row (desktop). */
  onOpenSettings?: () => void;

  /** Help */
  onOpenShortcuts: () => void;
  onOpenDocumentation: () => void;
  onOpenMyProjects?: () => void;
  onOpenLibrary?: () => void;
  /** Structure / COF / reaction template library. */
  onOpenTemplateLibrary?: () => void;
  /** Pencil / shape / image flyout beside the left tool rail. */
  drawToolsOpen?: boolean;
  onToggleDrawTools?: () => void;
  styleBarOpen?: boolean;
  onToggleStyleBar?: () => void;
  /** Restore the default (Cleanup / Format / View) tools row. */
  onGoHome?: () => void;

  /** Download (2D formats) */
  onSaveAs: (format: DownloadFormat) => void;
  /** New drawing (clears the current canvas into a fresh tab). */
  onNewProject?: () => void;
  /** File → Save Moldraw (.moldraw, entire canvas). */
  onSave?: () => void;

  /** Clipboard: Copy as… dropdown + Paste. */
  onCopyAs: (format: CopyAsFormat) => void;
  onPaste: () => void;
  copyDisabled?: boolean;
  pasteDisabled?: boolean;
  smilesStatusHint?: string;

  /** Color */
  activeColor: string;
  onActiveColorChange: (color: string) => void;
  colorTargets: ColorTargetPrefs;
  onColorTargetsChange: (patch: Partial<ColorTargetPrefs>) => void;
  selectedStrokeId?: string | null;
  selectedCanvasShapeId?: string | null;
  ringPaintActive?: boolean;
  molecule: Molecule;
  selectedAtomIds: string[];
  selectedBondIds?: string[];
  selectedCanvasText: CanvasText | null;
  selectedReactionArrow: ReactionArrow | null;
  onApplyColor: (
    color: string,
    flags: ColorApplyFlags,
    opts: { ringFillOpacity: number; clearRingFill?: boolean; clearAllRingFills?: boolean },
  ) => void;
  onClearAtomColors: () => void;
  onUpdateCanvasShape?: (id: string, patch: Partial<Omit<CanvasShape, 'id'>>) => void;
  onBeginCanvasShapeLiquidScrub?: () => void;
  onScrubCanvasShapeLiquidLevel?: (id: string, fillLevel: number) => void;
  onEndCanvasShapeLiquidScrub?: (id: string, fillLevel: number) => void;

  /** Selection font size / bond thickness / opacity (top header). */
  documentFontSizePt?: number;
  documentBondThicknessPx?: number;
  onApplySelectionFontSize?: (pt: number | null) => void;
  onApplySelectionBondThickness?: (px: number | null) => void;
  onApplySelectionOpacity?: (opacity: number | null) => void;
}

export function AppTopBar(props: AppTopBarProps) {
  const {
    quickSearch,
    setQuickSearch,
    quickSearchLoading,
    quickSearchError,
    setQuickSearchError,
    onQuickSearch,
    onOpenAdvancedSearch,
    activeTool,
    onSelectTool,
    onQuickSelect,
    shortcutOverrides = null,
    openFileBusy,
    openFileError,
    onDismissOpenFileError,
    onOpenMoleculeFile,
    onPlaceFile,
    onNewProject,
    onSave,
    toolsRow,
    drawRow,
    styleRow,
    arrowRow,
    pencilRow,
    contextRow,
    expandTopRows: _expandTopRows = false,
    onClearAll,
    onAddExplicitHydrogen,
    onCleanupStructure,
    on3DCleanUp,
    onFlatten3DPose,
    onClear3DPose,
    perspectiveActive = false,
    perspectiveBusy = false,
    depthFade = 1,
    depthShadingOn = true,
    onDepthFadeChange,
    depthWedgesOn = false,
    onToggleDepthWedges,
    indigoLayoutReady = false,
    preferIndigo2d = true,
    onAromatize,
    onDearomatize,
    onCheckStructure,
    showCipLabels = false,
    onToggleCipLabels,
    onAutomap,
    onInsertAutomapDemo,
    onInsertMechanismDemo,
    selectedAtomCount,
    showInfoPanel,
    onToggleInfoPanel,
    showTextStylePanel: _showTextStylePanel,
    onToggleTextStylePanel: _onToggleTextStylePanel,
    show3DViewer,
    onToggle3DViewer,
    canUndo = false,
    canRedo = false,
    onUndo,
    onRedo,
    showChatPanel = false,
    onToggleChatPanel,
    showObjectsPanel = false,
    onToggleObjectsPanel,
    onOpenSettings,
    isCompact = false,
    isMobile = false,
    landscapeView = false,
    onToggleLandscapeView,
    onOpenShortcuts,
    onOpenDocumentation,
    onOpenMyProjects,
    onOpenLibrary,
    onOpenTemplateLibrary,
    drawToolsOpen = false,
    onToggleDrawTools,
    styleBarOpen = false,
    onToggleStyleBar,
    onGoHome,
    onSaveAs,
    onCopyAs,
    onPaste,
    copyDisabled = false,
    pasteDisabled = false,
    smilesStatusHint = '',
    activeColor,
    onActiveColorChange,
    colorTargets,
    onColorTargetsChange,
    selectedStrokeId,
    selectedCanvasShapeId,
    ringPaintActive,
    molecule,
    selectedAtomIds,
    selectedBondIds = [],
    selectedCanvasText,
    selectedReactionArrow,
    onApplyColor,
    onClearAtomColors,
    onUpdateCanvasShape,
    onBeginCanvasShapeLiquidScrub,
    onScrubCanvasShapeLiquidLevel,
    onEndCanvasShapeLiquidScrub,
    documentFontSizePt = 20,
    documentBondThicknessPx = 2,
    onApplySelectionFontSize,
    onApplySelectionBondThickness,
    onApplySelectionOpacity,
  } = props;

  const headerRef = useRef<HTMLElement | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [searchSheetOpen, setSearchSheetOpen] = useState(false);
  const hasStyleSelection =
    selectedAtomCount > 0 ||
    selectedBondIds.length > 0 ||
    Boolean(selectedStrokeId) ||
    Boolean(selectedCanvasShapeId) ||
    Boolean(selectedCanvasText) ||
    Boolean(selectedReactionArrow) ||
    Boolean(ringPaintActive);
  const showExplicitH = selectedAtomCount > 0;
  const showFormula = selectedAtomCount > 0 || showInfoPanel;
  const showFormatCluster = hasStyleSelection || showExplicitH || perspectiveActive;

  // Keep workspace top offset in sync with content height (header is height:auto).
  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const apply = (heightPx?: number) => {
      const h = Math.ceil(heightPx && heightPx > 0 ? heightPx : el.offsetHeight);
      if (h > 0) {
        document.documentElement.style.setProperty('--app-top-bar-height', `${h}px`);
      }
    };
    apply();
    const ro = new ResizeObserver(entries => {
      const entry = entries[0];
      const box = entry?.borderBoxSize?.[0]?.blockSize ?? entry?.contentRect?.height;
      apply(typeof box === 'number' ? box : undefined);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty('--app-top-bar-height');
    };
  }, []);

  const searchFields = (
    <>
      <div
        className={`app-top-bar__search${quickSearchError ? ' app-top-bar__search--error' : ''}${isCompact ? ' app-top-bar__search--sheet' : ''}`}
      >
        {quickSearchLoading ? (
          <span className="app-top-bar__search-icon app-top-bar__search-icon--spin" aria-hidden>
            <Search size={16} color="#94a3b8" />
          </span>
        ) : (
          <Search size={16} color="#94a3b8" aria-hidden />
        )}
        <input
          className="app-top-bar__search-input"
          value={quickSearch}
          onChange={e => {
            setQuickSearch(e.target.value);
            setQuickSearchError('');
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              onQuickSearch();
              if (isCompact) setSearchSheetOpen(false);
            }
          }}
          placeholder="Name or CAS…"
          aria-label="Quick search by name or CAS"
          autoFocus={isCompact && searchSheetOpen}
        />
        {quickSearchError ? (
          <span className="app-top-bar__search-error">{quickSearchError}</span>
        ) : null}
      </div>
      <div className={isCompact ? 'mobile-sheet-search__actions' : undefined}>
        {isCompact ? (
          <>
            <button
              type="button"
              className="md-btn md-btn--ghost mobile-sheet-search__go"
              onClick={() => {
                onOpenAdvancedSearch();
                setSearchSheetOpen(false);
              }}
            >
              PubChem
            </button>
            <button
              type="button"
              className="md-btn md-btn--primary mobile-sheet-search__go"
              onClick={() => {
                onQuickSearch();
                setSearchSheetOpen(false);
              }}
            >
              Search
            </button>
          </>
        ) : null}
      </div>
    </>
  );

  const ribbonMode: 'style' | 'draw' | 'home' =
    !isCompact && styleBarOpen ? 'style' : !isCompact && drawToolsOpen ? 'draw' : 'home';

  const clipboardBar = (
    <CanvasSmilesBar
      onCopyAs={onCopyAs}
      onPaste={onPaste}
      copyDisabled={copyDisabled}
      pasteDisabled={pasteDisabled}
      statusHint={isCompact ? smilesStatusHint : ''}
      preferSheet={isCompact}
    />
  );

  return (
    <header
      ref={headerRef}
      className={`app-top-bar app-top-bar--rows-2${isCompact ? ' app-top-bar--compact' : ''}`}
    >
      <div className="app-top-bar__main">
        <div className="app-top-bar__left">
          <button
            type="button"
            className="app-top-bar__brand app-top-bar__brand-btn"
            onClick={() => onOpenMyProjects?.()}
            title="My designs — saved locally on this device"
          >
            MolDraw
            {!isCompact ? (
              <span className="app-top-bar__beta" title="Beta release">
                Beta
              </span>
            ) : null}
          </button>
          <FileMenu
            openFileBusy={openFileBusy}
            openFileError={openFileError}
            onDismissOpenError={onDismissOpenFileError}
            onOpenFile={onOpenMoleculeFile}
            onPlaceFile={onPlaceFile}
            onNewProject={onNewProject}
            onSave={onSave}
            onSaveAs={onSaveAs}
            shortcutOverrides={shortcutOverrides}
            preferSheet={isCompact}
          />
          {isCompact ? (
            <>
              <button
                type="button"
                className={`app-top-bar__clip-btn app-top-bar__clip-btn--icon${searchSheetOpen ? ' is-open' : ''}`}
                title="Search name or CAS"
                aria-label="Search"
                aria-haspopup="dialog"
                aria-expanded={searchSheetOpen}
                onClick={() => setSearchSheetOpen(true)}
              >
                <Search size={14} strokeWidth={2} aria-hidden />
              </button>
              <MobileBottomSheet
                open={searchSheetOpen}
                onClose={() => setSearchSheetOpen(false)}
                title="Search"
                size="auto"
                className="mobile-sheet--search"
              >
                <div className="mobile-sheet-search">{searchFields}</div>
              </MobileBottomSheet>
            </>
          ) : (
            <div className="app-top-bar__search-cluster">{searchFields}</div>
          )}
          {onGoHome && !isCompact ? (
            <button
              type="button"
              className={`app-top-bar__designs-btn app-top-bar__style-tab${ribbonMode === 'home' ? ' app-top-bar__designs-btn--active app-top-bar__style-tab--on' : ''}`}
              onClick={onGoHome}
              title="Home — cleanup, format, and drawing extras"
              aria-label="Home"
              aria-pressed={ribbonMode === 'home'}
            >
              <Home size={13} strokeWidth={2} aria-hidden />
              Home
            </button>
          ) : null}
          {onOpenLibrary ? (
            <button
              type="button"
              className="app-top-bar__designs-btn"
              onClick={onOpenLibrary}
              title="My designs — all saved files on this device"
              aria-label="My designs"
            >
              <Library size={13} strokeWidth={2} aria-hidden />
              {!isCompact ? 'My designs' : 'Designs'}
            </button>
          ) : null}
          {onToggleDrawTools && !isCompact ? (
            <button
              type="button"
              className={`app-top-bar__designs-btn app-top-bar__style-tab${drawToolsOpen ? ' app-top-bar__designs-btn--active app-top-bar__style-tab--on' : ''}`}
              onClick={onToggleDrawTools}
              title={drawToolsOpen ? 'Hide draw tools' : 'Draw — pencil, shape, image, glassware'}
              aria-label={drawToolsOpen ? 'Hide draw' : 'Draw'}
              aria-pressed={drawToolsOpen}
            >
              <Pencil size={13} strokeWidth={2} aria-hidden />
              Draw
              {drawToolsOpen ? <X size={11} strokeWidth={2.4} aria-hidden /> : null}
            </button>
          ) : null}
          {onToggleStyleBar && !isCompact ? (
            <button
              type="button"
              className={`app-top-bar__designs-btn app-top-bar__style-tab${styleBarOpen ? ' app-top-bar__designs-btn--active app-top-bar__style-tab--on' : ''}`}
              onClick={onToggleStyleBar}
              title={styleBarOpen ? 'Hide style' : 'Style'}
              aria-label={styleBarOpen ? 'Hide style' : 'Style'}
              aria-pressed={styleBarOpen}
            >
              <span className="app-top-bar__style-tab-icon" aria-hidden>
                {renderToolIcon('benzene')}
              </span>
              Style
              {styleBarOpen ? <X size={11} strokeWidth={2.4} aria-hidden /> : null}
            </button>
          ) : null}
          {onOpenTemplateLibrary && !isCompact ? (
            <button
              type="button"
              className="app-top-bar__designs-btn app-top-bar__style-tab"
              onClick={onOpenTemplateLibrary}
              title="Library — structures, COFs, reactions, templates"
              aria-label="Library"
            >
              <Library size={13} strokeWidth={2} aria-hidden />
              Library
            </button>
          ) : null}
          {isCompact ? clipboardBar : null}
          {isCompact ? (
            <button
              type="button"
              className="md-btn md-btn--danger-soft"
              onClick={onClearAll}
              title="Clear everything: structures, strokes, arrows, and canvas text"
              aria-label="Clear canvas"
            >
              Full clear
            </button>
          ) : null}
        </div>
        <div className="app-top-bar__fill" aria-hidden />
        <div className="app-top-bar__right">
          {!isCompact ? (
            <button
              type="button"
              className="app-top-bar__designs-btn"
              onClick={onOpenAdvancedSearch}
              title="PubChem search and batch SMILES"
              aria-label="PubChem"
            >
              <Download size={13} strokeWidth={2} aria-hidden />
              PubChem
            </button>
          ) : null}
          <ChemistryMenuWithPlugins
            indigoLayoutReady={indigoLayoutReady}
            onAromatize={onAromatize}
            onDearomatize={onDearomatize}
            onCheckStructure={onCheckStructure}
            showCipLabels={showCipLabels}
            onToggleCipLabels={onToggleCipLabels}
            onAutomap={onAutomap}
            onInsertAutomapDemo={onInsertAutomapDemo}
            onInsertMechanismDemo={onInsertMechanismDemo}
            preferSheet={isCompact}
          />
          {!isCompact ? (
            <button
              type="button"
              className="app-top-bar__docs-link"
              onClick={onOpenDocumentation}
            >
              Docs
            </button>
          ) : null}
          {isMobile && onToggleLandscapeView ? (
            <button
              type="button"
              className={`app-top-bar__rotate-btn${landscapeView ? ' is-active' : ''}`}
              onClick={onToggleLandscapeView}
              aria-label={landscapeView ? 'Rotate to portrait view' : 'Rotate to landscape view'}
              title={landscapeView ? 'Portrait view' : 'Landscape view'}
            >
              <RotateCw size={14} strokeWidth={2.2} aria-hidden />
            </button>
          ) : null}
          <button
            type="button"
            className="app-top-bar__help-btn"
            onClick={onOpenShortcuts}
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts"
          >
            ?
          </button>
          {!isCompact ? (
            <ExportMenu
              open={exportOpen}
              onToggle={() => setExportOpen(v => !v)}
              onSaveAs={format => {
                setExportOpen(false);
                onSaveAs(format);
              }}
            />
          ) : null}
        </div>
      </div>

      <div
        className={`app-top-bar__tools-row${ribbonMode !== 'home' ? ' app-top-bar__tools-row--focus' : ''}`}
        role="toolbar"
        aria-label={
          ribbonMode === 'style' ? 'Style' : ribbonMode === 'draw' ? 'Draw tools' : 'Cleanup and drawing extras'
        }
      >
        <ToolCluster label="Panels">
          {onToggleObjectsPanel ? (
            <button
              type="button"
              className={`action-btn icon-only${showObjectsPanel ? ' active' : ''}`}
              onClick={onToggleObjectsPanel}
              title="Objects list — molecules, arrows, text, shapes, images"
              aria-label="Objects list"
              aria-pressed={showObjectsPanel}
            >
              <List size={16} strokeWidth={2} aria-hidden />
            </button>
          ) : null}
          {onToggleChatPanel ? (
            <button
              type="button"
              className={`action-btn icon-only app-top-bar__ai-toggle${showChatPanel ? ' active' : ''}`}
              onClick={onToggleChatPanel}
              title={
                showChatPanel
                  ? 'Hide AI chat'
                  : 'Show AI chat (paste your Gemini API key in the panel)'
              }
              aria-label="AI chat"
              aria-pressed={showChatPanel}
            >
              <span className="app-top-bar__ai-label">AI</span>
            </button>
          ) : null}
          <button
            type="button"
            className={`action-btn icon-only app-top-bar__3d-toggle${show3DViewer ? ' active' : ''}`}
            title={show3DViewer ? 'Hide 3D panel' : 'Show 3D panel'}
            aria-label="3D view"
            aria-pressed={show3DViewer}
            onClick={onToggle3DViewer}
          >
            <span className="app-top-bar__3d-label">3D</span>
          </button>
          {onUndo ? (
            <button
              type="button"
              className="action-btn icon-only app-top-bar__history-btn"
              onClick={onUndo}
              disabled={!canUndo}
              title="Undo (Ctrl+Z)"
              aria-label="Undo"
            >
              <Undo2 size={16} strokeWidth={2} aria-hidden />
            </button>
          ) : null}
          {onRedo ? (
            <button
              type="button"
              className="action-btn icon-only app-top-bar__history-btn"
              onClick={onRedo}
              disabled={!canRedo}
              title="Redo (Ctrl+Y)"
              aria-label="Redo"
            >
              <Redo2 size={16} strokeWidth={2} aria-hidden />
            </button>
          ) : null}
        </ToolCluster>

        {ribbonMode === 'style' ? (
          <ToolCluster
            label="Style"
            className="app-top-bar__tools-cluster--with-style app-top-bar__tools-cluster--fill"
          >
            {styleRow}
          </ToolCluster>
        ) : ribbonMode === 'draw' ? (
          <>
            <ToolCluster label="Draw" className="app-top-bar__tools-cluster--draw">
              {drawRow}
            </ToolCluster>
            {pencilRow ? <ToolCluster label="Pen">{pencilRow}</ToolCluster> : null}
          </>
        ) : (
          <>
        <ToolCluster label="Cleanup">
          <button
            type="button"
            className="action-btn icon-only"
            title={
              perspectiveActive
                ? 'Clean Up Structure — 3D mode: re-minimize the structure in 3D (keeps orientation)'
                : !preferIndigo2d
                  ? 'Cleanup structure (native 2D only — Indigo preference off in Settings)'
                  : indigoLayoutReady
                    ? 'Cleanup structure (Indigo 2D when ready; native fallback always available)'
                    : 'Cleanup structure (native 2D now; Indigo WASM still loading…)'
            }
            aria-label="Cleanup structure"
            disabled={perspectiveActive && perspectiveBusy}
            onClick={onCleanupStructure}
          >
            <Wand2 size={18} strokeWidth={2} aria-hidden />
          </button>
          <button
            type="button"
            className={`action-btn icon-only ${perspectiveActive ? 'active' : ''}`}
            title={
              perspectiveActive
                ? '3D Clean Up (Shift+Ctrl+D) — re-minimize in 3D, orientation kept'
                : '3D Clean Up (Shift+Ctrl+D) — 2D tidy first, then embed and show Structure Perspective'
            }
            disabled={perspectiveBusy || !on3DCleanUp}
            onClick={on3DCleanUp}
            aria-label="3D Clean Up"
          >
            <Box size={18} strokeWidth={2} />
          </button>
          {perspectiveActive ? (
            <>
              <button
                type="button"
                className="action-btn icon-only"
                title="Flatten — write the projected 3D pose into the 2D drawing and leave 3D mode"
                disabled={perspectiveBusy || !onFlatten3DPose}
                onClick={onFlatten3DPose}
                aria-label="Flatten 3D pose"
              >
                <Layers2 size={18} strokeWidth={2} />
              </button>
              <button
                type="button"
                className="action-btn icon-only"
                title="Exit 3D — drop the pose and show the original 2D drawing"
                disabled={perspectiveBusy || !onClear3DPose}
                onClick={onClear3DPose}
                aria-label="Exit 3D mode"
              >
                <SquareDashed size={18} strokeWidth={2} />
              </button>
            </>
          ) : null}
        </ToolCluster>

        {showFormatCluster ? (
        <ToolCluster label="Format">
          {hasStyleSelection ? (
          <TopBarColorMenu
            activeColor={activeColor}
            onActiveColorChange={onActiveColorChange}
            colorTargets={colorTargets}
            onColorTargetsChange={onColorTargetsChange}
            selectedStrokeId={selectedStrokeId}
            selectedCanvasShapeId={selectedCanvasShapeId}
            ringPaintActive={ringPaintActive}
            molecule={molecule}
            selectedAtomIds={selectedAtomIds}
            selectedBondIds={selectedBondIds}
            selectedCanvasText={selectedCanvasText}
            selectedReactionArrow={selectedReactionArrow}
            onApplyColor={onApplyColor}
            onClearAtomColors={onClearAtomColors}
            onUpdateCanvasShape={onUpdateCanvasShape}
            onBeginCanvasShapeLiquidScrub={onBeginCanvasShapeLiquidScrub}
            onScrubCanvasShapeLiquidLevel={onScrubCanvasShapeLiquidLevel}
            onEndCanvasShapeLiquidScrub={onEndCanvasShapeLiquidScrub}
            documentFontSizePt={documentFontSizePt}
            documentBondThicknessPx={documentBondThicknessPx}
            onApplyFontSize={onApplySelectionFontSize}
            onApplyBondThickness={onApplySelectionBondThickness}
            onApplyOpacity={onApplySelectionOpacity}
          />
          ) : null}
          {showExplicitH && onAddExplicitHydrogen ? (
          <button
            type="button"
            className="action-btn icon-only"
            onClick={onAddExplicitHydrogen}
            title="Add explicit H to selected atom(s) — one bonded H per atom (isolated CN becomes H–CN)"
            aria-label="Add explicit H to selection"
          >
            <span className="hydrogen-toggle-glyph" aria-hidden>
              H+
            </span>
          </button>
          ) : null}
          {perspectiveActive && (
            <>
              <label className="app-top-bar__depth-fade" aria-label="Depth fade">
                <span className="app-top-bar__depth-fade-label">Fade</span>
                <input
                  type="range"
                  className="chrome-range"
                  min={0}
                  max={150}
                  step={1}
                  value={Math.round(Math.min(1.5, Math.max(0, depthFade)) * 100)}
                  disabled={!depthShadingOn || !onDepthFadeChange}
                  onChange={e => onDepthFadeChange?.(Number(e.target.value) / 100)}
                  aria-label="Depth fade strength"
                />
              </label>
              <button
                type="button"
                className={`action-btn icon-only ${depthWedgesOn ? 'active' : ''}`}
                title="Depth taper — near bonds normal width; farther ends get pointier (display-only)"
                disabled={!onToggleDepthWedges}
                onClick={onToggleDepthWedges}
              >
                <Triangle size={18} strokeWidth={2} fill={depthWedgesOn ? 'currentColor' : 'none'} />
              </button>
            </>
          )}
        </ToolCluster>
        ) : null}

        <ToolCluster label="View">
          {showFormula ? (
          <button
            type="button"
            className={`action-btn icon-only ${showInfoPanel ? 'active' : ''}`}
            title={showInfoPanel ? 'Close selection info' : 'Info for selected atoms (formula, mass, SMILES)'}
            onClick={onToggleInfoPanel}
          >
            <NotebookPen size={18} strokeWidth={2} />
          </button>
          ) : null}
          {(!toolsRow || ribbonMode !== 'home') && onOpenSettings ? (
            <button
              type="button"
              className="action-btn icon-only"
              onClick={onOpenSettings}
              title="Settings"
              aria-label="Settings"
            >
              <Settings size={16} strokeWidth={1.7} aria-hidden />
            </button>
          ) : null}
        </ToolCluster>

        {toolsRow ? (
          <ToolCluster label="Annotate">
            {toolsRow}
            {onOpenSettings ? (
              <button
                type="button"
                className="action-btn icon-only"
                onClick={onOpenSettings}
                title="Settings"
                aria-label="Settings"
              >
                <Settings size={16} strokeWidth={1.7} aria-hidden />
              </button>
            ) : null}
            <button
              type="button"
              className="action-btn icon-only app-top-bar__clear-icon"
              onClick={onClearAll}
              title="Clear canvas"
              aria-label="Clear canvas"
            >
              <Trash2 size={16} strokeWidth={2} aria-hidden />
            </button>
          </ToolCluster>
        ) : null}
        {arrowRow ? <ToolCluster label="Arrow">{arrowRow}</ToolCluster> : null}
        {pencilRow ? <ToolCluster label="Pen">{pencilRow}</ToolCluster> : null}
          </>
        )}
        {ribbonMode !== 'home' && !isCompact ? (
          <ToolCluster label="Canvas">
            <button
              type="button"
              className="action-btn icon-only app-top-bar__clear-icon"
              onClick={onClearAll}
              title="Clear canvas"
              aria-label="Clear canvas"
            >
              <Trash2 size={16} strokeWidth={2} aria-hidden />
            </button>
          </ToolCluster>
        ) : null}
        {(ribbonMode === 'home' || isCompact) ? (
        <ToolCluster label="Arrange">
          {contextRow}
          {ribbonMode === 'home' && !isCompact ? (
            <TopBarSelectMenu
              activeTool={activeTool}
              molecule={molecule}
              selectedAtomIds={selectedAtomIds}
              onSelectTool={onSelectTool}
              onQuickSelect={onQuickSelect}
              shortcutOverrides={shortcutOverrides}
            />
          ) : null}
          {ribbonMode === 'home' && !isCompact ? clipboardBar : null}
        </ToolCluster>
        ) : null}
      </div>
    </header>
  );
}
