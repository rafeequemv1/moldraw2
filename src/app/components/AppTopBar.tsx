/**
 * Top header bar: brand, File, search, Home/Draw tabs, clipboard, export.
 * Home and Draw are exclusive ribbons on the tools row; Color opens a left panel with style options.
 *
 * Stateless — every interaction is driven by callbacks from `App.tsx`.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  Wand2,
  SlidersHorizontal,
  Box,
  Triangle,
  Layers2,
  SquareDashed,
  List,
  Undo2,
  Redo2,
  Settings,
  Home,
  RotateCw,
  Pencil,
  Trash2,
  Grid3x3,
  X,
  Search,
} from 'lucide-react';
import { FileMenu } from './FileMenu';
import { ExportMenu } from './ExportMenu';
import { CharlaHelpButton } from './CharlaHelpButton';
import { HeaderInlineSearch, HeaderPromoLinks, HeaderSiteNav } from './HeaderSiteNav';
import { MobileBottomSheet } from './MobileBottomSheet';
import { InstallWindowsLink } from './InstallWindowsLink';
import { ThemeToggleButton } from './ThemeToggleButton';
import { MolDrawLogoMark } from './MolDrawLogoMark';
import { AromatizeIcon, DearomatizeIcon } from '../toolIcons';
import type { UiThemeId } from '../theme';
import { useI18n } from '../i18n';
import { useChromeOverlay } from '../chromeDismiss';
import { TopBarColorMenu } from './TopBarColorMenu';
import { TopBarSelectMenu, type SelectToolId } from './TopBarSelectMenu';
import type { CanvasShape, CanvasText, Molecule, ReactionArrow } from '@moldraw/domain';
import type { ColorApplyFlags } from '@moldraw/core/color/selectionColor';
import type { ColorTargetPrefs } from '../settings/types';
import type { CopyAsFormat, DownloadFormat } from '../types';
import type { QuickSelectActionId, QuickSelectOptions } from '../selection/quickSelect';

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
  /** Show the C label on selected skeletal carbons. */
  onAddExplicitCarbon?: () => void;
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
  onOpenMyProjects?: () => void;
  onOpenLibrary?: () => void;
  onCopySmiles?: () => void;
  onCopySvg?: () => void;
  onPaste?: () => void;
  onCopyAs?: (format: CopyAsFormat) => void;
  smilesCopied?: boolean;
  svgCopied?: boolean;
  svgCopyError?: boolean;
  onRequestFeature?: () => void;
  onSignIn?: () => void;
  onSignUp?: () => void;
  onSignOut?: () => void;
  signedIn?: boolean;
  authDisplayName?: string;
  onOpenUpdates?: () => void;
  hasUnreadUpdates?: boolean;
  uiTheme?: UiThemeId;
  onChangeUiTheme?: (theme: UiThemeId) => void;
  showGrid?: boolean;
  onToggleGrid?: () => void;
  /** Pencil / shape / image flyout beside the left tool rail. */
  drawToolsOpen?: boolean;
  onToggleDrawTools?: () => void;
  /** Restore the default (Cleanup / Format / View) tools row. */
  onGoHome?: () => void;

  /** Download (2D formats) */
  onSaveAs: (format: DownloadFormat) => void;
  /** New drawing (clears the current canvas into a fresh tab). */
  onNewProject?: () => void;
  /** File → Save Moldraw (.moldraw, entire canvas). */
  onSave?: () => void;

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

  /** Theme + grid block for the Color left panel. */
  documentStyleThemePanel?: ReactNode;
  /** Atoms/bonds block for the Color left panel (below color). */
  documentStyleRestPanel?: ReactNode;
}

export function AppTopBar(props: AppTopBarProps) {
  const { t } = useI18n();
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
    documentStyleThemePanel,
    documentStyleRestPanel,
    arrowRow,
    pencilRow,
    contextRow,
    expandTopRows: _expandTopRows = false,
    onClearAll,
    onAddExplicitHydrogen,
    onAddExplicitCarbon,
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
    onOpenMyProjects,
    onOpenLibrary,
    onCopySmiles,
    onCopySvg,
    onPaste,
    onCopyAs,
    smilesCopied = false,
    svgCopied = false,
    svgCopyError = false,
    onRequestFeature,
    onSignIn,
    onSignUp,
    onSignOut,
    signedIn = false,
    authDisplayName = '',
    onOpenUpdates,
    hasUnreadUpdates = false,
    uiTheme = 'light',
    onChangeUiTheme,
    showGrid = false,
    onToggleGrid,
    drawToolsOpen = false,
    onToggleDrawTools,
    onGoHome,
    onSaveAs,
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
  useChromeOverlay(searchSheetOpen, () => setSearchSheetOpen(false), 'modal');
  const searchWasLoading = useRef(false);
  const hasStyleSelection =
    selectedAtomCount > 0 ||
    selectedBondIds.length > 0 ||
    Boolean(selectedStrokeId) ||
    Boolean(selectedCanvasShapeId) ||
    Boolean(selectedCanvasText) ||
    Boolean(selectedReactionArrow) ||
    Boolean(ringPaintActive);
  const showExplicitH = selectedAtomCount > 0;
  const showFormatCluster = hasStyleSelection || showExplicitH || perspectiveActive;
  const explicitAtomButtons = (
    <>
      {onAddExplicitHydrogen ? (
        <button
          type="button"
          className={`action-btn icon-only${activeTool === 'add_explicit_h' ? ' active' : ''}`}
          onClick={onAddExplicitHydrogen}
          title={t('topBar.addExplicitHFullTitle')}
          aria-label={t('topBar.addExplicitH')}
          aria-pressed={activeTool === 'add_explicit_h'}
        >
          <span className="hydrogen-toggle-glyph" aria-hidden>
            H+
          </span>
        </button>
      ) : null}
      {onAddExplicitCarbon ? (
        <button
          type="button"
          className={`action-btn icon-only${activeTool === 'add_explicit_c' ? ' active' : ''}`}
          onClick={onAddExplicitCarbon}
          title={t('topBar.addExplicitCFullTitle')}
          aria-label={t('topBar.addExplicitC')}
          aria-pressed={activeTool === 'add_explicit_c'}
        >
          <span className="hydrogen-toggle-glyph" aria-hidden>
            C+
          </span>
        </button>
      ) : null}
    </>
  );
  const aromatizeDisabled = molecule.atoms.length === 0;
  const aromatizeButtons =
    onAromatize || onDearomatize ? (
      <>
        {onAromatize ? (
          <button
            type="button"
            className="action-btn icon-only"
            title={t('topBar.aromatizeTitle')}
            aria-label={t('topBar.aromatize')}
            disabled={aromatizeDisabled}
            onClick={onAromatize}
          >
            <AromatizeIcon />
          </button>
        ) : null}
        {onDearomatize ? (
          <button
            type="button"
            className="action-btn icon-only"
            title={t('topBar.dearomatizeTitle')}
            aria-label={t('topBar.dearomatize')}
            disabled={aromatizeDisabled}
            onClick={onDearomatize}
          >
            <DearomatizeIcon />
          </button>
        ) : null}
      </>
    ) : null;

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

  useEffect(() => {
    if (!searchSheetOpen) {
      searchWasLoading.current = false;
      return;
    }
    if (quickSearchLoading) {
      searchWasLoading.current = true;
      return;
    }
    if (searchWasLoading.current && !quickSearchError) {
      setSearchSheetOpen(false);
    }
    searchWasLoading.current = false;
  }, [quickSearchLoading, quickSearchError, searchSheetOpen]);

  const ribbonMode: 'draw' | 'home' = !isCompact && drawToolsOpen ? 'draw' : 'home';

  const selectMenu = (
    <TopBarSelectMenu
      activeTool={activeTool}
      molecule={molecule}
      selectedAtomIds={selectedAtomIds}
      onSelectTool={onSelectTool}
      onQuickSelect={onQuickSelect}
      shortcutOverrides={shortcutOverrides}
      iconOnly={isCompact}
    />
  );

  const fileMenu = (
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
  );

  return (
    <header
      ref={headerRef}
      className={`app-top-bar app-top-bar--rows-2${isCompact ? ' app-top-bar--compact' : ''}${!isCompact ? ' app-top-bar--has-site-row' : ''}`}
    >
      <div className="app-top-bar__main">
        <div className="app-top-bar__left">
          <div className="app-top-bar__brand-cluster">
            <button
              type="button"
              className="app-top-bar__brand app-top-bar__brand-btn app-top-bar__brand--inline"
              onClick={() => onOpenMyProjects?.()}
              title={t('topBar.myDesignsTitle')}
            >
              <MolDrawLogoMark size={24} />
              <span className="app-top-bar__brand-name">MolDraw</span>
            </button>
            {isCompact ? fileMenu : null}
            {isCompact ? (
              <button
                type="button"
                className={`app-top-bar__search-launch${searchSheetOpen ? ' is-open' : ''}`}
                onClick={() => setSearchSheetOpen(true)}
                title={t('search.aria')}
                aria-label={t('search.aria')}
                aria-expanded={searchSheetOpen}
                aria-haspopup="dialog"
              >
                <Search size={18} strokeWidth={2} aria-hidden />
              </button>
            ) : null}
          </div>
          {isCompact ? null : (
            <HeaderInlineSearch
              quickSearch={quickSearch}
              setQuickSearch={setQuickSearch}
              quickSearchLoading={quickSearchLoading}
              quickSearchError={quickSearchError}
              setQuickSearchError={setQuickSearchError}
              onQuickSearch={onQuickSearch}
              searchPlaceholder={t('search.placeholder')}
              searchAriaLabel={t('search.aria')}
            />
          )}
          {onGoHome && !isCompact ? (
            <button
              type="button"
              className={`app-top-bar__designs-btn app-top-bar__style-tab${ribbonMode === 'home' ? ' app-top-bar__designs-btn--active app-top-bar__style-tab--on' : ' app-top-bar__style-tab--nudge'}`}
              onClick={onGoHome}
              title={t('topBar.homeTitle')}
              aria-label={t('topBar.home')}
              aria-pressed={ribbonMode === 'home'}
            >
              <Home size={14} strokeWidth={2} aria-hidden />
              {t('topBar.home')}
            </button>
          ) : null}
          {onToggleDrawTools && !isCompact ? (
            <button
              type="button"
              className={`app-top-bar__designs-btn app-top-bar__style-tab${drawToolsOpen ? ' app-top-bar__designs-btn--active app-top-bar__style-tab--on' : ''}`}
              onClick={onToggleDrawTools}
              title={drawToolsOpen ? t('topBar.hideDrawTitle') : t('topBar.drawTitle')}
              aria-label={drawToolsOpen ? t('topBar.hideDraw') : t('topBar.draw')}
              aria-pressed={drawToolsOpen}
            >
              <Pencil size={14} strokeWidth={2} aria-hidden />
              {t('topBar.draw')}
              {drawToolsOpen ? <X size={11} strokeWidth={2.4} aria-hidden /> : null}
            </button>
          ) : null}
          {isCompact ? (
            <>
              <button
                type="button"
                className="app-top-bar__delete-btn"
                onClick={onClearAll}
                title={t('topBar.fullClearTitle')}
                aria-label={t('topBar.clearCanvas')}
              >
                <Trash2 size={18} strokeWidth={2} aria-hidden />
              </button>
              {explicitAtomButtons}
            </>
          ) : null}
        </div>
        <div className="app-top-bar__fill" aria-hidden />
        <div className="app-top-bar__right">
          {onToggleGrid && !isCompact ? (
            <button
              type="button"
              className={`tb-btn tb-btn-theme-toggle tb-btn-grid-toggle${showGrid ? ' is-on' : ''}`}
              title={showGrid ? t('topBar.gridOnTitle') : t('topBar.gridOffTitle')}
              aria-label={showGrid ? t('topBar.gridOnTitle') : t('topBar.gridOffTitle')}
              aria-pressed={showGrid}
              onClick={onToggleGrid}
            >
              <Grid3x3 size={14} strokeWidth={2} aria-hidden />
            </button>
          ) : null}
          {onChangeUiTheme && !isCompact ? (
            <ThemeToggleButton theme={uiTheme} onChangeTheme={onChangeUiTheme} />
          ) : null}
          {!isCompact ? <InstallWindowsLink /> : null}
          {!isCompact ? (
            <button
              type="button"
              className={`app-top-bar__designs-btn${showInfoPanel ? ' app-top-bar__designs-btn--active' : ''}`}
              title={showInfoPanel ? t('topBar.infoCloseTitle') : t('topBar.infoOpenTitle')}
              aria-label={t('topBar.selectionInfo')}
              aria-pressed={showInfoPanel}
              onClick={onToggleInfoPanel}
            >
              <span className="app-top-bar__info-symbol" aria-hidden>
                ⌬
              </span>
              {t('topBar.info')}
            </button>
          ) : null}
          {isMobile && onToggleLandscapeView ? (
            <button
              type="button"
              className={`app-top-bar__rotate-btn${landscapeView ? ' is-active' : ''}`}
              onClick={onToggleLandscapeView}
              aria-label={landscapeView ? t('topBar.rotatePortrait') : t('topBar.rotateLandscape')}
              title={landscapeView ? t('topBar.portraitView') : t('topBar.landscapeView')}
            >
              <RotateCw size={14} strokeWidth={2.2} aria-hidden />
            </button>
          ) : null}
          {isCompact ? (
            <HeaderSiteNav
              compactLayout
              onOpenMyDesigns={() => onOpenLibrary?.()}
              onCopySmiles={() => onCopySmiles?.()}
              onCopySvg={() => onCopySvg?.()}
              onPaste={() => onPaste?.()}
              onCopyAs={onCopyAs}
              smilesCopied={Boolean(smilesCopied)}
              svgCopied={Boolean(svgCopied)}
              svgCopyError={Boolean(svgCopyError)}
              onRequestFeature={() => onRequestFeature?.()}
              onSignIn={() => onSignIn?.()}
              onSignUp={() => onSignUp?.()}
              onSignOut={() => onSignOut?.()}
              signedIn={Boolean(signedIn)}
              authDisplayName={authDisplayName ?? ''}
              onOpenAdvancedSearch={onOpenAdvancedSearch}
              onOpenShortcuts={onOpenShortcuts}
              downloadMenu={
                <ExportMenu
                  open={exportOpen}
                  preferSheet
                  onToggle={() => setExportOpen(v => !v)}
                  onSaveAs={format => {
                    setExportOpen(false);
                    onSaveAs(format);
                  }}
                />
              }
            />
          ) : null}
          {!isCompact ? (
            <HeaderPromoLinks
              onOpenUpdates={() => onOpenUpdates?.()}
              hasUnreadUpdates={Boolean(hasUnreadUpdates)}
              onOpenAdvancedSearch={onOpenAdvancedSearch}
              onOpenShortcuts={onOpenShortcuts}
              signedIn={Boolean(signedIn)}
              authDisplayName={authDisplayName ?? ''}
              onSignOut={() => onSignOut?.()}
              onSignIn={() => onSignIn?.()}
              onSignUp={() => onSignUp?.()}
            />
          ) : null}
          {isCompact ? null : <CharlaHelpButton compact={isCompact} />}
        </div>
      </div>

      {!isCompact ? (
        <div className="app-top-bar__site-row">
          <HeaderSiteNav
            fileMenu={fileMenu}
            selectMenu={selectMenu}
            onOpenMyDesigns={() => onOpenLibrary?.()}
            onCopySmiles={() => onCopySmiles?.()}
            onCopySvg={() => onCopySvg?.()}
            onPaste={() => onPaste?.()}
            smilesCopied={Boolean(smilesCopied)}
            svgCopied={Boolean(svgCopied)}
            svgCopyError={Boolean(svgCopyError)}
            onRequestFeature={() => onRequestFeature?.()}
            onSignIn={() => onSignIn?.()}
            onSignUp={() => onSignUp?.()}
            onSignOut={() => onSignOut?.()}
            signedIn={Boolean(signedIn)}
            authDisplayName={authDisplayName ?? ''}
            downloadMenu={
              <ExportMenu
                open={exportOpen}
                preferSheet={false}
                onToggle={() => setExportOpen(v => !v)}
                onSaveAs={format => {
                  setExportOpen(false);
                  onSaveAs(format);
                }}
              />
            }
          />
        </div>
      ) : null}

      <div
        className={`app-top-bar__tools-row${ribbonMode !== 'home' ? ' app-top-bar__tools-row--focus' : ''}`}
        role="toolbar"
        aria-label={ribbonMode === 'draw' ? t('topBar.toolbarDrawTools') : t('topBar.toolbarHomeExtras')}
      >
        <ToolCluster label={isCompact ? t('topBar.clusterArrange') : t('topBar.clusterPanels')}>
          {isCompact ? (
            <>
              {selectMenu}
              {contextRow}
            </>
          ) : onToggleObjectsPanel ? (
            <button
              type="button"
              className={`action-btn icon-only${showObjectsPanel ? ' active' : ''}`}
              onClick={onToggleObjectsPanel}
              title={t('topBar.objectsListTitle')}
              aria-label={t('topBar.objectsList')}
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
              title={showChatPanel ? t('topBar.hideAiChat') : t('topBar.showAiChat')}
              aria-label={t('topBar.aiChatAria')}
              aria-pressed={showChatPanel}
            >
              <span className="app-top-bar__ai-label">{t('topBar.ai')}</span>
            </button>
          ) : null}
          <button
            type="button"
            className={`action-btn icon-only app-top-bar__3d-toggle${show3DViewer ? ' active' : ''}`}
            title={show3DViewer ? t('topBar.hide3dPanel') : t('topBar.show3dPanel')}
            aria-label={t('topBar.view3dAria')}
            aria-pressed={show3DViewer}
            onClick={onToggle3DViewer}
          >
            <span className="app-top-bar__3d-label">{t('topBar.threeD')}</span>
          </button>
          {isCompact ? (
            <button
              type="button"
              className={`action-btn icon-only${showInfoPanel ? ' active' : ''}`}
              title={showInfoPanel ? t('topBar.infoCloseTitle') : t('topBar.infoCompactTitle')}
              aria-label={t('topBar.selectionInfo')}
              aria-pressed={showInfoPanel}
              onClick={onToggleInfoPanel}
            >
              <span className="app-top-bar__info-symbol" aria-hidden>
                ⌬
              </span>
            </button>
          ) : null}
          {onUndo ? (
            <button
              type="button"
              className="action-btn icon-only app-top-bar__history-btn"
              onClick={onUndo}
              disabled={!canUndo}
              title={t('topBar.undoTitle')}
              aria-label={t('topBar.undo')}
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
              title={t('topBar.redoTitle')}
              aria-label={t('topBar.redo')}
            >
              <Redo2 size={16} strokeWidth={2} aria-hidden />
            </button>
          ) : null}
        </ToolCluster>

        {ribbonMode === 'draw' ? (
          <>
            <ToolCluster label={t('topBar.clusterDraw')} className="app-top-bar__tools-cluster--draw">
              {drawRow}
            </ToolCluster>
            {pencilRow ? <ToolCluster label={t('topBar.clusterPen')}>{pencilRow}</ToolCluster> : null}
          </>
        ) : (
          <>
        <ToolCluster label={t('topBar.clusterCleanup')}>
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
            aria-label={t('topBar.cleanupStructure')}
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
            aria-label={t('topBar.cleanUp3d')}
          >
            <Box size={18} strokeWidth={2} />
          </button>
          {isCompact ? aromatizeButtons : null}
          {perspectiveActive ? (
            <>
              <button
                type="button"
                className="action-btn icon-only"
                title={t('topBar.flattenTitle')}
                disabled={perspectiveBusy || !onFlatten3DPose}
                onClick={onFlatten3DPose}
                aria-label={t('topBar.flatten3d')}
              >
                <Layers2 size={18} strokeWidth={2} />
              </button>
              <button
                type="button"
                className="action-btn icon-only"
                title={t('topBar.exit3dTitle')}
                disabled={perspectiveBusy || !onClear3DPose}
                onClick={onClear3DPose}
                aria-label={t('topBar.exit3d')}
              >
                <SquareDashed size={18} strokeWidth={2} />
              </button>
            </>
          ) : null}
        </ToolCluster>

        {ribbonMode === 'home' && (documentStyleThemePanel || documentStyleRestPanel || showFormatCluster) ? (
        <ToolCluster label={t('topBar.clusterFormat')}>
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
            documentStyleThemePanel={documentStyleThemePanel}
            documentStyleRestPanel={documentStyleRestPanel}
            isCompact={isCompact}
          />
          {perspectiveActive && (
            <>
              <label className="app-top-bar__depth-fade" aria-label={t('topBar.depthFadeLabel')}>
                <span className="app-top-bar__depth-fade-label">{t('topBar.fade')}</span>
                <input
                  type="range"
                  className="chrome-range"
                  min={0}
                  max={150}
                  step={1}
                  value={Math.round(Math.min(1.5, Math.max(0, depthFade)) * 100)}
                  disabled={!depthShadingOn || !onDepthFadeChange}
                  onChange={e => onDepthFadeChange?.(Number(e.target.value) / 100)}
                  aria-label={t('topBar.depthFadeAria')}
                />
              </label>
              <button
                type="button"
                className={`action-btn icon-only ${depthWedgesOn ? 'active' : ''}`}
                title={t('topBar.depthTaperTitle')}
                disabled={!onToggleDepthWedges}
                onClick={onToggleDepthWedges}
              >
                <Triangle size={18} strokeWidth={2} fill={depthWedgesOn ? 'currentColor' : 'none'} />
              </button>
            </>
          )}
        </ToolCluster>
        ) : null}

        {!isCompact ? (
        <ToolCluster label={t('topBar.clusterView')}>
          {(!toolsRow || ribbonMode !== 'home') && onOpenSettings ? (
            <button
              type="button"
              className="action-btn icon-only"
              onClick={onOpenSettings}
              title={t('topBar.settings')}
              aria-label={t('topBar.settings')}
            >
              <Settings size={16} strokeWidth={1.7} aria-hidden />
            </button>
          ) : null}
        </ToolCluster>
        ) : null}

        {toolsRow ? (
          <ToolCluster label={t('topBar.clusterAnnotate')}>
            {toolsRow}
            {onOpenSettings ? (
              <button
                type="button"
                className="action-btn icon-only"
                onClick={onOpenSettings}
                title={t('topBar.settings')}
                aria-label={t('topBar.settings')}
              >
                <Settings size={16} strokeWidth={1.7} aria-hidden />
              </button>
            ) : null}
            <button
              type="button"
              className="action-btn icon-only app-top-bar__clear-icon"
              onClick={onClearAll}
              title={t('topBar.clearCanvas')}
              aria-label={t('topBar.clearCanvas')}
            >
              <Trash2 size={16} strokeWidth={2} aria-hidden />
            </button>
            {explicitAtomButtons}
          </ToolCluster>
        ) : null}
        {arrowRow ? <ToolCluster label={t('topBar.clusterArrow')}>{arrowRow}</ToolCluster> : null}
        {pencilRow ? <ToolCluster label={t('topBar.clusterPen')}>{pencilRow}</ToolCluster> : null}
          </>
        )}
        {ribbonMode !== 'home' && !isCompact ? (
          <ToolCluster label={t('topBar.clusterCanvas')}>
            <button
              type="button"
              className="action-btn icon-only app-top-bar__clear-icon"
              onClick={onClearAll}
              title={t('topBar.clearCanvas')}
              aria-label={t('topBar.clearCanvas')}
            >
              <Trash2 size={16} strokeWidth={2} aria-hidden />
            </button>
            {explicitAtomButtons}
          </ToolCluster>
        ) : null}
        {!isCompact && ribbonMode === 'home' ? (
        <ToolCluster label={t('topBar.clusterArrange')}>
          {contextRow}
          {aromatizeButtons}
          <a
            className="app-top-bar__select-trigger app-top-bar__tools-link"
            href="/tools/"
            target="_blank"
            rel="noopener noreferrer"
            title={t('nav.toolsTitle')}
            aria-label={t('nav.tools')}
          >
            {t('nav.tools')}
          </a>
        </ToolCluster>
        ) : null}
      </div>
      {isCompact ? (
        <MobileBottomSheet
          open={searchSheetOpen}
          onClose={() => setSearchSheetOpen(false)}
          title={t('topBar.search')}
          size="auto"
          className="mobile-sheet--search"
          ariaLabel={t('search.aria')}
          closeOnBackdrop={false}
        >
          <div className="mobile-sheet-search">
            <HeaderInlineSearch
              quickSearch={quickSearch}
              setQuickSearch={setQuickSearch}
              quickSearchLoading={quickSearchLoading}
              quickSearchError={quickSearchError}
              setQuickSearchError={setQuickSearchError}
              onQuickSearch={onQuickSearch}
              searchPlaceholder={t('topBar.searchNameOrCas')}
              searchAriaLabel={t('search.aria')}
              autoFocus={searchSheetOpen}
            />
            {quickSearchError ? (
              <p className="mobile-sheet-search__error" role="status">
                {quickSearchError}
              </p>
            ) : null}
            <div className="mobile-sheet-search__actions">
              <button
                type="button"
                className="mobile-sheet-search__go md-btn md-btn--primary"
                onClick={onQuickSearch}
                disabled={quickSearchLoading || !quickSearch.trim()}
              >
                {t('topBar.search')}
              </button>
              <button
                type="button"
                className="mobile-sheet-list__btn mobile-sheet-search__advanced"
                onClick={() => {
                  setSearchSheetOpen(false);
                  onOpenAdvancedSearch();
                }}
                title={t('nav.pubchemSearchTitle')}
              >
                <SlidersHorizontal size={16} strokeWidth={2} aria-hidden />
                {t('nav.pubchemSearch')}
              </button>
            </div>
          </div>
        </MobileBottomSheet>
      ) : null}
    </header>
  );
}
