import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useMemo,
  lazy,
  Suspense,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import type { InfiniteCanvasHandle } from '@moldraw/canvas';
import { getMarqueeSelectionAabb, getSelectionAabb, toggleHiddenId } from '@moldraw/canvas';
import { loadAiSecrets, updateGeminiApiKey } from './ai/chat/secretsStorage';
import {
  COF_LAYERS_DEFAULT,
  COF_PACK_DEFAULT,
  createMoleculeStore,
  hasPerspectivePose,
  setStructureTheme,
  sruBracketBoxForAtoms,
} from '@moldraw/core';
import { resolveCanvasPreferences } from '@moldraw/core/canvasPreferences';
import { viewportWorldCenter } from '@moldraw/core/molecule/importPlacement';
import { CMD } from '@moldraw/core/commands/registry';
import {
  bondIdsTargetedBySelection,
  bondPatchForStyleTool,
  isBondStyleToolId,
} from './app/bondToolSelection';
import { useMoleculeEditor } from './app/hooks/useMoleculeEditor';
import { useDrawingToolState } from './app/hooks/useDrawingToolState';
import { useAtomAliasEditor } from './app/hooks/useAtomAliasEditor';
import { useArrowReagentEditor } from './app/hooks/useArrowReagentEditor';
import { useViewer3DSync } from './app/hooks/useViewer3DSync';
import { useCanvasPerspective } from './app/hooks/useCanvasPerspective';
import { useMoleculeEngineWorker } from './app/hooks/useMoleculeEngineWorker';
import { useMoleculeImportExport } from './app/hooks/useMoleculeImportExport';
import { downloadAllProjectsMoldraw, downloadProjectMoldrawFile } from './app/projects/downloadProjectFile';
import { useEngineMessageRouter } from './app/hooks/useEngineMessageRouter';
import { useMoleculeClipboard } from './app/hooks/useMoleculeClipboard';
import { useAutoCleanup } from './app/hooks/useAutoCleanup';
import { useAppLayout } from './app/hooks/useCompactViewport';
import { useKeyboardShortcuts } from './app/hooks/useKeyboardShortcuts';
import { useIndigoEngineActions } from './app/hooks/useIndigoEngineActions';
import { useFragmentPlacement } from './app/hooks/useFragmentPlacement';
import { useMoleculeCanvasCommands } from './app/hooks/useMoleculeCanvasCommands';
import { useAiExecutionContext } from './app/hooks/useAiExecutionContext';
import { useMoleculeInfoPanel } from './app/hooks/useMoleculeInfoPanel';
import { useCanvasContextMenu } from './app/hooks/useCanvasContextMenu';
import { useLocalSessionBridge } from './app/hooks/useLocalSessionBridge';
import { usePubChemBatchBridge } from './app/hooks/usePubChemBatchBridge';
import { useAppSettings } from './app/settings';
import {
  applyUiThemeToDocument,
  rememberLastDarkUiTheme,
  structureInkForTheme,
  viewer3dBackgroundForTheme,
} from './app/theme';
import {
  navigateToEditor,
  navigateToMy,
  parseAppRoute,
  EDITOR_BROWSER_TAB_TITLE,
  type AppDocRoute,
} from './features/documentation';
import {
  AppTopBar,
  AtomPalette,
  SelectionAlignToolbar,
  SelectionActionToolbar,
  Viewer3DErrorBoundary,
  Viewer3DWorkspace,
  CanvasContextMenu,
  type CanvasContextMenuState,
  TouchQuickMenu,
  buildTouchQuickMenuItems,
  UngroupConfirmModal,
  InlineAliasEditor,
  InlineTextEditor,
  KeyboardShortcutsModal,
  AuthModal,
  FeatureRequestModal,
  UpdatesModal,
  MoleculeInfoPanel,
  MoleculeStatusBar,
  SiteFooterHost,
  type PubChemImportContext,
  PencilOptionsBar,
  StereochemistryDialogs,
  StyleToolbar,
  TextStylePanel,
  ArrowPropertiesPanel,
  InlineArrowReagentEditor,
  TemplateLibraryModal,
  type TemplateLibraryTab,
  ToolbarRail,
  ToolbarTopStrip,
  ToolbarDrawStrip,
  ObjectsPanel,
  MobileBottomSheet,
  ViewerLinkHint,
  HardwareAccelBanner,
  WorkspaceSplit,
  LocalSaveToast,
  ProjectLibraryModal,
  DocumentTabBar,
} from './app/components';
import { CofsPackingBar } from './app/cofs';
import { rememberGrapheneSheet } from './app/graphene/grapheneSession';
import { useReactionLibraryInsert } from './app/hooks/useReactionLibraryInsert';
import { useProjectPersistence } from './app/projects/useProjectPersistence';
import { getProject, saveProjectRecord } from './app/projects/projectStorage';
import { readOpenTabsSession, writeOpenTabsSession } from './app/projects/tabSession';
import {
  mergeBondsForDocument,
  mergeDocumentStyle,
  mergeGeneralForDocument,
  type DocumentStyleByTabId,
  type DocumentStyleOverrides,
} from './app/settings/documentStyle';
import type { BondsSettings, GeneralSettings } from './app/settings/types';
import { I18nProvider, resolveUiLanguage } from './app/i18n';
import { PluginHostProvider } from './app/plugins';
import { useMolDrawAuth } from './app/auth/useMolDrawAuth';
import { hasUnreadMolDrawUpdates, markMolDrawUpdatesSeen } from './app/components/UpdatesModal';
import { CanvasWithResolvedTheme } from './app/components/StructureThemeControls';
import { dismissChromeOverlays } from './app/chromeDismiss';
import { nativeSmilesTo2DMolblock } from '@moldraw/core/io/smilesToMolblock';
import { STARTUP_PUBCHEM_CID } from './app/data/selectionSmi';
import { pubchemMolblockFromCid } from './app/advanced/batchExport';
import { importReactionSchemeFromSmiles } from './app/importExport/importReactionSmiles';
import { getAppSettingsPreset, type AppSettingsPresetId } from './app/settings';
import type { MoleculeWorkerResponse } from '@moldraw/core/moleculeWorker/messages';

const IMAGE_FILE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.svg';
const VIEWER3D_OPEN_KEY = 'moldraw.viewer3d.open';
const EXPORT_SIGNUP_NOTICE = 'Sign up to copy, download, and export files.';
const NEW_TAB_SIGNUP_NOTICE = 'Sign up to open more design tabs.';

function readViewer3DOpenPref(): boolean {
  try {
    const stored = localStorage.getItem(VIEWER3D_OPEN_KEY);
    if (stored === '1') return true;
    if (stored === '0') return false;
  } catch {
    /* ignore */
  }
  return typeof window === 'undefined' || window.innerWidth > 1024;
}

function writeViewer3DOpenPref(open: boolean): void {
  try {
    localStorage.setItem(VIEWER3D_OPEN_KEY, open ? '1' : '0');
  } catch {
    /* ignore */
  }
}

/** Lazy: 3dmol / OCL stay out of the initial critical path when the pane is off. */
const Molecule3DPanel = lazy(() =>
  import('@moldraw/viewer-3d').then(m => ({ default: m.Molecule3DPanel })),
);
const ChatPanel = lazy(() =>
  import('./app/components/ChatPanel').then(m => ({ default: m.ChatPanel })),
);
const PubChemSearch = lazy(() =>
  import('./features/pubchem/PubChemSearch').then(m => ({ default: m.PubChemSearch })),
);
const AppSettingsModal = lazy(() =>
  import('./app/settings/AppSettingsModal').then(m => ({ default: m.AppSettingsModal })),
);
const DocumentationPage = lazy(() =>
  import('./features/documentation/DocumentationPage').then(m => ({
    default: m.DocumentationPage,
  })),
);
const MyProjectsPage = lazy(() =>
  import('./app/components/MyProjectsPage').then(m => ({ default: m.MyProjectsPage })),
);
const AddonsPage = lazy(() =>
  import('./features/addons/AddonsPage').then(m => ({ default: m.AddonsPage })),
);
const PluginModals = lazy(() =>
  import('./app/plugins/PluginModals').then(m => ({ default: m.PluginModals })),
);

function RouteFallback() {
  return <div className="app-route-fallback" aria-busy="true">Loading…</div>;
}

function App() {
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);
  const enrichImportPendingRef = useRef<Map<string, { resolve: (mb: string) => void }>>(new Map());
  /** One-shot promises for batch SMILES / 3D pipeline (PubChem modal). */
  const batchWorkerWaitRef = useRef<Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>>(
    new Map(),
  );
  const aiWorkerPendingRef = useRef<
    Map<string, { resolve: (r: { ok: boolean; error?: string; data?: unknown }) => void }>
  >(new Map());
  /** @deprecated kept for call sites that still name cleanup */
  const aiCleanupPendingRef = aiWorkerPendingRef;

  // ── Modals / panels ───────────────────────────────────────────────────────
  const [showPubChem, setShowPubChem] = useState(false);
  const [showTemplateLibrary, setShowTemplateLibrary] = useState(false);
  const [templateLibraryTab, setTemplateLibraryTab] = useState<TemplateLibraryTab>('structures');
  const [insertingReactionId, setInsertingReactionId] = useState<string | null>(null);
  const [showRightFontPanel, setShowRightFontPanel] = useState(false);
  /** Formal-charge marks selected for Delete → clear charge (restores implicit H). */
  const [selectedChargeAtomIds, setSelectedChargeAtomIds] = useState<string[]>([]);
  const [selectedChargeMarkKind, setSelectedChargeMarkKind] = useState<
    'formal' | 'delta' | null
  >(null);
  /** Hide HTML text overlay while moving/resizing/rotating so canvas letters track the drag. */
  const [canvasTextTransforming, setCanvasTextTransforming] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showFeatureRequest, setShowFeatureRequest] = useState(false);
  const [showUpdatesModal, setShowUpdatesModal] = useState(false);
  const [hasUnreadUpdates, setHasUnreadUpdates] = useState(hasUnreadMolDrawUpdates);
  const auth = useMolDrawAuth();
  const requireExportSignup = useCallback((): boolean => {
    if (auth.signedIn) return true;
    auth.openAuthModal('signup', EXPORT_SIGNUP_NOTICE);
    return false;
  }, [auth.signedIn, auth.openAuthModal]);
  const requireNewTabSignup = useCallback((): boolean => {
    if (auth.signedIn) return true;
    auth.openAuthModal('signup', NEW_TAB_SIGNUP_NOTICE);
    return false;
  }, [auth.signedIn, auth.openAuthModal]);
  const [docRoute, setDocRoute] = useState<AppDocRoute>(() => parseAppRoute(window.location));
  const [showAppSettings, setShowAppSettings] = useState(false);
  const [showProjectLibrary, setShowProjectLibrary] = useState(false);
  const [showDrawTools, setShowDrawTools] = useState(false);
  const [smilesCopied, setSmilesCopied] = useState(false);
  const [svgCopied, setSvgCopied] = useState(false);
  const [svgCopyError, setSvgCopyError] = useState(false);

  useEffect(() => {
    const syncRoute = () => setDocRoute(parseAppRoute(window.location));
    window.addEventListener('popstate', syncRoute);
    return () => window.removeEventListener('popstate', syncRoute);
  }, []);

  useEffect(() => {
    if (docRoute.kind === 'addons') {
      document.title = 'MolDraw Addons | PowerPoint and Word (Coming Soon)';
      return;
    }
    if (docRoute.kind !== 'editor') return;
    document.title = EDITOR_BROWSER_TAB_TITLE;
  }, [docRoute.kind]);

  // ── Viewport / canvas refs ────────────────────────────────────────────────
  const [viewportInfo, setViewportInfo] = useState({ x: 0, y: 0, zoom: 1 });
  const viewportInfoRef = useRef({ x: 0, y: 0, zoom: 1 });
  /** Slot index for sequential molblock imports that should not overlap (quiet PubChem, batch→canvas). */
  const molblockGridSlotRef = useRef(0);
  /** World center of grid slot (0,0); locked for a batch so focus/pan cannot scatter imports. */
  const molblockGridOriginRef = useRef<{ x: number; y: number } | null>(null);
  const canvasRef = useRef<InfiniteCanvasHandle>(null);
  const hoverAtomIdRef = useRef<string | null>(null);
  /** Inline editors need React viewport updates; pan/zoom of the 2D canvas must not. */
  const viewportOverlayActiveRef = useRef(false);
  const handleViewportChange = useCallback((v: { x: number; y: number; zoom: number }) => {
    viewportInfoRef.current = v;
    if (!viewportOverlayActiveRef.current) return;
    setViewportInfo(prev =>
      prev.x === v.x && prev.y === v.y && prev.zoom === v.zoom ? prev : v,
    );
  }, []);

  useEffect(() => {
    if (showPubChem) {
      molblockGridSlotRef.current = 0;
      molblockGridOriginRef.current = null;
    }
  }, [showPubChem]);

  // ── Molecule editor store (history + selection) ───────────────────────────
  const bondLengthPxRef = useRef(40);
  const [editorStore] = useState(() => createMoleculeStore());
  const {
    molecule,
    applyCommand,
    undo: handleUndo,
    redo: handleRedo,
    canUndo,
    canRedo,
    selectedAtomIds,
    setSelectedAtomIds,
    selectedBondIds,
    setSelectedBondIds,
    setSelection,
    arrangeSelectionAtomIds,
    handleArrangeSelection,
    handleCircularArray,
    handleLinearArray,
    handleDendrimerArray,
    handleGenerateGraphene,
    handleGenerateCof,
    handleGenerateDendrimer,
    handleGeneratePolymer,
    handleReflectSelection,
    selectedCanvasTextId,
    setSelectedCanvasTextId,
    selectedCanvasText,
    colorEditStrokeId,
    setColorEditStrokeId,
    colorEditCanvasShapeId,
    setColorEditCanvasShapeId,
    selectedReactionArrowId,
    setSelectedReactionArrowId,
    selectedSruBracketId,
    setSelectedSruBracketId,
    selectedCanvasImageId,
    setSelectedCanvasImageId,
    selectedReactionArrow,
    selection,
  } = useMoleculeEditor(editorStore);
  const applyCommandRef = useRef(applyCommand);
  applyCommandRef.current = applyCommand;

  const {
    projectName,
    openTabs,
    activeTabId,
    projectMetas,
    folders,
    saveNotice,
    newProject,
    openProject,
    switchTab,
    closeTab,
    deleteProjects,
    duplicateProject,
    renameProject,
    createFolder,
    renameFolder,
    deleteFolder,
    moveProjectsToFolder,
    refreshMetas,
    initialHydrationDone,
  } = useProjectPersistence(editorStore);

  const handleOpenMyProjects = useCallback(() => {
    navigateToMy();
    setDocRoute({ kind: 'my' });
    void refreshMetas();
  }, [refreshMetas]);

  const handleBackToEditor = useCallback(() => {
    navigateToEditor();
    setDocRoute({ kind: 'editor' });
  }, []);

  const handleNewTab = useCallback(() => {
    if (!requireNewTabSignup()) return;
    setDocRoute({ kind: 'editor' });
    navigateToEditor(true);
    void newProject().catch(() => {
      /* newProject handles its own state; swallow to avoid unhandled rejection */
    });
  }, [newProject, requireNewTabSignup]);

  const importMolblockRef = useRef<
    (
      molblock: string,
      meta?: {
        compoundName?: string;
        iupacName?: string;
        useViewportGrid?: boolean;
        startFreshGrid?: boolean;
        placeBesideExisting?: boolean;
      },
    ) => Promise<string[]>
  >(async () => []);

  const {
    settings: appSettings,
    setSettings: setAppSettings,
    updateGeneral: updateAppSettingsGeneral,
    updateBonds: updateAppSettingsBonds,
    updateShortcutBindings: updateAppShortcutBindings,
    resetShortcutBindings: resetAppShortcutBindings,
    resetToDefaults: resetAppSettings,
    resolvedCanvasPreferences: globalCanvasPreferences,
  } = useAppSettings();

  const styleApplyGlobally = appSettings.general.styleApplyGlobally !== false;

  const [documentStyleByTabId, setDocumentStyleByTabId] = useState<DocumentStyleByTabId>(
    () => readOpenTabsSession()?.documentStyles ?? {},
  );

  const activeDocumentStyle = documentStyleByTabId[activeTabId];

  const effectiveGeneral = useMemo(
    () =>
      mergeGeneralForDocument(
        appSettings.general,
        styleApplyGlobally ? undefined : activeDocumentStyle,
        {
          structureThemeId: molecule.structureThemeId,
          structureDrawMode: molecule.structureDrawMode,
        },
      ),
    [
      activeDocumentStyle,
      appSettings.general,
      molecule.structureDrawMode,
      molecule.structureThemeId,
      styleApplyGlobally,
    ],
  );

  const effectiveBonds = useMemo(
    () => mergeBondsForDocument(appSettings.bonds, styleApplyGlobally ? undefined : activeDocumentStyle),
    [activeDocumentStyle, appSettings.bonds, styleApplyGlobally],
  );

  const resolvedCanvasPreferences = useMemo(() => {
    if (styleApplyGlobally) return globalCanvasPreferences;
    return resolveCanvasPreferences({
      general: {
        ...appSettings.general,
        fontFamily: effectiveGeneral.fontFamily,
        fontSizePt: effectiveGeneral.fontSizePt,
        subFontSizePt: effectiveGeneral.subFontSizePt,
        boldAtomLabels: effectiveGeneral.boldAtomLabels,
        showGrid: effectiveGeneral.showGrid,
      },
      bonds: effectiveBonds,
    });
  }, [
    appSettings.general,
    effectiveBonds,
    effectiveGeneral.boldAtomLabels,
    effectiveGeneral.fontFamily,
    effectiveGeneral.fontSizePt,
    effectiveGeneral.showGrid,
    effectiveGeneral.subFontSizePt,
    globalCanvasPreferences,
    styleApplyGlobally,
  ]);

  useEffect(() => {
    const prev = readOpenTabsSession();
    if (!prev?.tabs?.length) return;
    writeOpenTabsSession({ ...prev, documentStyles: documentStyleByTabId });
  }, [documentStyleByTabId]);

  useLayoutEffect(() => {
    applyUiThemeToDocument(appSettings.general.theme);
    rememberLastDarkUiTheme(appSettings.general.theme);
  }, [appSettings.general.theme]);

  const uiLanguage = resolveUiLanguage(appSettings.general.uiLanguage);

  useLayoutEffect(() => {
    document.documentElement.lang =
      uiLanguage === 'zh' ? 'zh-CN' : uiLanguage === 'ja' ? 'ja' : uiLanguage;
  }, [uiLanguage]);

  const structureTheme = structureInkForTheme(appSettings.general.theme);
  const viewer3dBackground = viewer3dBackgroundForTheme(appSettings.general.theme);

  // Keep settings sync available to async worker callbacks in the same render.
  // eslint-disable-next-line react-hooks/refs -- intentional settings→ref mirror
  bondLengthPxRef.current = resolvedCanvasPreferences.bondLengthPx;
  const preferIndigo2dRef = useRef(true);
  // eslint-disable-next-line react-hooks/refs -- intentional settings→ref mirror
  preferIndigo2dRef.current = appSettings.general.preferIndigo2d === true;

  const moleculeRef = useRef(molecule);
  const appliedBondLenRef = useRef(resolvedCanvasPreferences.bondLengthPx);
  const bondScaleTimerRef = useRef(0);
  /** SEO deep-links: `/?smiles=` (molecule pages) and `/?reaction=` (reaction guides). */
  const initialQueryRef = useRef(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      smiles: params.get('smiles')?.trim() || null,
      reaction: params.get('reaction')?.trim() || null,
    };
  });

  const scaleMoleculeToBondLength = useCallback(
    (nextPx: number) => {
      window.clearTimeout(bondScaleTimerRef.current);
      bondScaleTimerRef.current = window.setTimeout(() => {
        const from = appliedBondLenRef.current;
        appliedBondLenRef.current = nextPx;
        const mol = moleculeRef.current;
        if (mol.atoms.length < 2 || !(from > 0) || !(nextPx > 0)) return;
        const factor = nextPx / from;
        if (!Number.isFinite(factor) || Math.abs(factor - 1) < 0.008) return;
        if (factor < 0.25 || factor > 4) return;
        let sx = 0;
        let sy = 0;
        for (const a of mol.atoms) {
          sx += a.x;
          sy += a.y;
        }
        applyCommand(CMD.ScaleAtoms, {
          atomIds: mol.atoms.map(a => a.id),
          cx: sx / mol.atoms.length,
          cy: sy / mol.atoms.length,
          factor,
        });
      }, 160);
    },
    [applyCommand],
  );

  const updateAppSettingsBondsLive = useCallback(
    (patch: Partial<typeof appSettings.bonds>) => {
      updateAppSettingsBonds(patch);
      if (patch.bondLengthPx != null) scaleMoleculeToBondLength(patch.bondLengthPx);
    },
    [scaleMoleculeToBondLength, updateAppSettingsBonds],
  );

  const patchDocumentStyle = useCallback(
    (patch: DocumentStyleOverrides) => {
      setDocumentStyleByTabId(prev => ({
        ...prev,
        [activeTabId]: mergeDocumentStyle(prev[activeTabId], patch),
      }));
    },
    [activeTabId],
  );

  const applyThemeToAllOpenDesigns = useCallback(
    async (themeId: string, drawMode: 'skeletal' | 'ball-stick') => {
      applyCommand(CMD.SetStructureTheme, { themeId, drawMode });
      await Promise.all(
        openTabs.map(async tab => {
          if (tab.id === activeTabId) return;
          const saved = await getProject(tab.id);
          if (!saved?.molecule) return;
          const nextMol = setStructureTheme(saved.molecule, { themeId, drawMode });
          if (nextMol === saved.molecule) return;
          await saveProjectRecord({
            ...saved,
            molecule: nextMol,
            updatedAt: Date.now(),
          });
        }),
      );
    },
    [activeTabId, applyCommand, openTabs],
  );

  const handleStyleGeneralPatch = useCallback(
    (patch: Partial<GeneralSettings>) => {
      const themeId = patch.structureThemeId;
      const drawMode = patch.structureDrawMode;
      const hasTheme = themeId != null && drawMode != null;

      if (styleApplyGlobally) {
        updateAppSettingsGeneral(patch);
        if (hasTheme) void applyThemeToAllOpenDesigns(themeId, drawMode);
        return;
      }

      patchDocumentStyle({ general: patch });
      if (hasTheme) applyCommand(CMD.SetStructureTheme, { themeId, drawMode });
    },
    [
      applyCommand,
      applyThemeToAllOpenDesigns,
      patchDocumentStyle,
      styleApplyGlobally,
      updateAppSettingsGeneral,
    ],
  );

  const handleStyleBondsPatch = useCallback(
    (patch: Partial<BondsSettings>) => {
      if (styleApplyGlobally) {
        updateAppSettingsBondsLive(patch);
        return;
      }
      patchDocumentStyle({ bonds: patch });
      if (patch.bondLengthPx != null) scaleMoleculeToBondLength(patch.bondLengthPx);
    },
    [
      patchDocumentStyle,
      scaleMoleculeToBondLength,
      styleApplyGlobally,
      updateAppSettingsBondsLive,
    ],
  );

  const handleApplyGloballyChange = useCallback(
    (global: boolean) => {
      if (!global) {
        updateAppSettingsGeneral({ styleApplyGlobally: false });
        return;
      }

      const mergedGeneral = mergeGeneralForDocument(
        appSettings.general,
        documentStyleByTabId[activeTabId],
        {
          structureThemeId: molecule.structureThemeId,
          structureDrawMode: molecule.structureDrawMode,
        },
      );
      const mergedBonds = mergeBondsForDocument(
        appSettings.bonds,
        documentStyleByTabId[activeTabId],
      );

      updateAppSettingsGeneral({
        styleApplyGlobally: true,
        structureThemeId: mergedGeneral.structureThemeId,
        structureDrawMode: mergedGeneral.structureDrawMode,
        fontFamily: mergedGeneral.fontFamily,
        fontSizePt: mergedGeneral.fontSizePt,
        subFontSizePt: mergedGeneral.subFontSizePt,
        boldAtomLabels: mergedGeneral.boldAtomLabels,
      });
      updateAppSettingsBonds(mergedBonds);
      void applyThemeToAllOpenDesigns(
        mergedGeneral.structureThemeId,
        mergedGeneral.structureDrawMode,
      );
      setDocumentStyleByTabId(prev => {
        if (!prev[activeTabId]) return prev;
        const next = { ...prev };
        delete next[activeTabId];
        return next;
      });
    },
    [
      activeTabId,
      appSettings.bonds,
      appSettings.general,
      applyThemeToAllOpenDesigns,
      documentStyleByTabId,
      molecule.structureDrawMode,
      molecule.structureThemeId,
      updateAppSettingsBonds,
      updateAppSettingsGeneral,
    ],
  );

  const handleApplySettingsPreset = useCallback((presetId: AppSettingsPresetId) => {
    const preset = getAppSettingsPreset(presetId);
    setAppSettings(prev => ({
      ...(JSON.parse(JSON.stringify(preset.settings)) as typeof preset.settings),
      shortcuts: prev.shortcuts ?? { bindings: {} },
      lastPresetId: presetId,
    }));
  }, [setAppSettings]);

  // Mirror the latest molecule into a ref before paint so worker/async callbacks
  // never see a one-frame-stale stub.
  useLayoutEffect(() => {
    moleculeRef.current = molecule;
  }, [molecule]);

  const engineMsgRef = useRef<(msg: MoleculeWorkerResponse) => void>(() => {});
  const selectionSmiLoadedRef = useRef(false);
  const startupSeedCleanupRef = useRef(false);

  const importReactionQuery = useCallback((smiles: string) => {
    editorStore.resetMolecule();
    importReactionSchemeFromSmiles({
      smiles,
      applyCommand: applyCommandRef.current,
      bondLengthPx: bondLengthPxRef.current,
    });
  }, [editorStore]);

  // Native SMILES conversion does not need the engine worker; run even if onReady
  // is skipped because the canvas already has atoms from a prior session.
  useEffect(() => {
    const reaction = initialQueryRef.current().reaction;
    if (!reaction || selectionSmiLoadedRef.current) return;
    selectionSmiLoadedRef.current = true;
    importReactionQuery(reaction);
  }, [importReactionQuery]);

  const { workerRef, engineWorkerStatus, engineWorkerError, indigoLayoutReady } =
    useMoleculeEngineWorker({
      onMessage: msg => engineMsgRef.current(msg),
      onReady: client => {
        const query = initialQueryRef.current();
        if (query.reaction) {
          if (selectionSmiLoadedRef.current) return;
          selectionSmiLoadedRef.current = true;
          queueMicrotask(() => importReactionQuery(query.reaction!));
          return;
        }
        if (!query.smiles) return;
        if (selectionSmiLoadedRef.current || moleculeRef.current.atoms.length > 0) return;
        selectionSmiLoadedRef.current = true;
        const localMolblock = nativeSmilesTo2DMolblock(query.smiles);
        if (localMolblock?.trim()) {
          // Defer so useEngineMessageRouter has wired engineMsgRef.
          queueMicrotask(() => {
            engineMsgRef.current({
              type: 'SMILES_TO_MOLBLOCK_SUCCESS',
              id: 'import_smiles',
              payload: { molBlock: localMolblock },
            });
          });
          return;
        }
        client.post({
          type: 'SMILES_TO_MOLBLOCK',
          payload: {
            smiles: query.smiles,
            preferIndigo: preferIndigo2dRef.current,
          },
          id: 'import_smiles',
        });
      },
    });

  // Auto-cleanup BEFORE indigo's runLocalCleanup exists — bridge via ref.
  const runLocalCleanupRef = useRef<(ids: Set<string>) => void>(() => {});
  const autoCleanup = useAutoCleanup({
    onTrigger: ids => {
      // In 3D cleanup mode a 2D re-layout would only move the (hidden) document
      // coords under the pose overlay — the user re-cleans in 3D explicitly.
      if (hasPerspectivePose(editorStore.getMolecule())) return;
      runLocalCleanupRef.current(ids);
    },
    enabled: appSettings.general.autoLayoutAfterBondBurst,
  });
  const recordAutoCleanupBond = autoCleanup.recordBond;
  const resetAutoCleanup = autoCleanup.reset;

  // ── In-app fragment clipboard (Ctrl+C / Ctrl+V) ──────────────────────────
  const clipboard = useMoleculeClipboard();

  /** Desktop: 3D on by default. Phone/tablet: off so the 2D canvas has room. */
  const [show3DViewer, setShow3DViewerState] = useState(readViewer3DOpenPref);
  const setShow3DViewer = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
    setShow3DViewerState(prev => {
      const value = typeof next === 'function' ? next(prev) : next;
      writeViewer3DOpenPref(value);
      return value;
    });
  }, []);
  useEffect(() => {
    writeViewer3DOpenPref(show3DViewer);
  }, [show3DViewer]);

  const topBarRows3 = false;
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.add('app-top-rows-2');
    root.classList.remove('app-top-rows-3');
    return () => {
      root.classList.remove('app-top-rows-3', 'app-top-rows-2');
    };
  }, [topBarRows3]);

  const {
    worker3dRef,
    viewer3DMolblock,
    viewer3DShowHydrogens,
    setViewer3DShowHydrogens,
    viewer3DSource,
    viewer3DEnergy,
    viewer3DComputeStatus,
    viewer3DHeavyCount,
    viewer3DLinkHint,
    viewer3DAtomIndexTo2DId,
    stereoHints3D,
    stereoIssues3D,
    selected3DAtomIndices,
    handle3DAtomPick,
    handleRebuild3D,
    applyExternal3DPose,
    applyPerspectivePreviewMolblock,
  } = useViewer3DSync({
    molecule,
    selectedAtomIds,
    selectedBondIds,
    setSelectedAtomIds,
    batchWorkerWaitRef,
    enabled: show3DViewer,
  });

  const handleApplyOclConformer = useCallback(
    (mb: string) => {
      applyExternal3DPose(mb, 'OpenChemLib conformer');
    },
    [applyExternal3DPose],
  );
  const handleApplyMmff94 = useCallback(
    (payload: { molblock: string; energyKcal: number }) => {
      applyExternal3DPose(payload.molblock, 'MMFF94 minimized', payload.energyKcal);
    },
    [applyExternal3DPose],
  );

  // ── Drawing tools ─────────────────────────────────────────────────────────
  const clearFragmentPlacementRef = useRef(() => {});
  const {
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
  } = useDrawingToolState({
    onOpenTemplateLibrary: () => {
      setTemplateLibraryTab('structures');
      setShowTemplateLibrary(true);
    },
    onPickImageFile: () => imageFileInputRef.current?.click(),
    onLeaveFragmentPlacement: () => clearFragmentPlacementRef.current(),
  });

  const setShowInfoPanelRef = useRef<Dispatch<SetStateAction<boolean>>>(() => {});
  const showCipLabels = appSettings.general.showCipLabels === true;
  const indigo = useIndigoEngineActions({
    molecule,
    moleculeRef,
    workerRef,
    applyCommand,
    bondLengthPxRef,
    bondLengthPx: resolvedCanvasPreferences.bondLengthPx,
    selectedAtomIds,
    resetAutoCleanup,
    setShowInfoPanel: v => setShowInfoPanelRef.current(v),
    preferIndigo2d: appSettings.general.preferIndigo2d === true,
    showCipLabels,
  });
  // Bridge: auto-cleanup was registered before indigo exists.
  // eslint-disable-next-line react-hooks/refs -- intentional circular-dep bridge
  runLocalCleanupRef.current = indigo.runLocalCleanup;
  const {
    localCleanupRequestsRef,
    automapPendingRef,
    latestStereoRequestRef,
    clearCleanupWatchdog,
    cipStereoTags,
    setCipStereoTags,
    setStructureCheck,
    cipLabelMaps,
    handleCleanupStructure,
    handleAromatize,
    handleToggleExplicitHydrogens,
    handleCheckStructure,
    handleAutomap,
    handleInsertAutomapDemo,
  } = indigo;

  // Assigned below once the perspective hook exists (Clean Up branches on 3D mode).
  const cleanupStructureRef = useRef<() => void>(handleCleanupStructure);

  const handleInsertMechanismDemo = useCallback(() => {
    const result = applyCommand(CMD.InsertDemoMechanism, {});
    if (!result.ok) {
      alert(result.error?.message ?? 'Could not insert mechanism demo');
      return;
    }
    // Do not select every atom — selection glow looks like doubled labels / LPs.
    setSelection({ atomIds: [], bondIds: [] });
  }, [applyCommand, setSelection]);

  const fragment = useFragmentPlacement({
    workerRef: workerRef as MutableRefObject<{ post: (msg: unknown) => void } | null>,
    applyCommand,
    activeTool,
    activeToolRef,
    setActiveTool,
    runLocalCleanup: indigo.runLocalCleanup,
    bondLengthPx: appSettings.bonds.bondLengthPx,
    bondAngleSnapDeg: appSettings.bonds.bondAngleSnapDeg,
    setSelectedAtomIds,
    setShowTemplateLibrary,
    getMolecule: () => editorStore.getMolecule(),
  });
  // Bridge: drawing tools leave placement before fragment hook exists.
  // eslint-disable-next-line react-hooks/refs -- intentional circular-dep bridge
  clearFragmentPlacementRef.current = () => fragment.setFragmentPlacement(null);
  const {
    fragmentPlacement,
    setFragmentPlacement,
    placementRestoreToolRef,
    handleBeginAminoPlacement,
    handleBeginFunctionalGroupPlacement,
    handleBeginLigandPlacement,
    handleBeginStructure3DPlacement,
    handleCommitFragmentPlacement,
  } = fragment;

  // ── Inline atom-alias editor ─────────────────────────────────────────────
  const {
    editingAtomAliasId,
    editingAliasDraft,
    setEditingAliasDraft,
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
    omitAtomAliasBodyId,
    handleRequestAtomAliasEdit,
    handleTypeAtomLabel,
    cancelAtomAliasEdit,
    commitAtomAlias,
    dismissAliasEditorOnDelete,
    aliasEditorOpenRef,
  } = useAtomAliasEditor({
    molecule,
    applyCommand,
    canvasRef,
    viewportInfo,
    condensedGroupLabels: appSettings.general.condensedGroupLabels,
    setSelectedAtomIds,
    setSelectedBondIds,
    setSelectedCanvasTextId,
    setSelectedReactionArrowId,
  });

  const appLayout = useAppLayout(1024);
  const isCompactViewport = appLayout.isCompact;
  /**
   * Touch long-press first shows the radial quick menu; "More…" promotes that
   * specific menu instance to the full context menu. Keyed by object identity
   * so a new long-press always starts with the quick ring again.
   */
  const [fullMenuFor, setFullMenuFor] = useState<CanvasContextMenuState | null>(null);

  // ── Context menu / stereo dialogs / chat ──────────────────────────────────
  const [pubchemImport, setPubchemImport] = useState<PubChemImportContext | null>(null);
  const [showChatPanel, setShowChatPanel] = useState(false);
  const [showObjectsPanel, setShowObjectsPanel] = useState(false);
  const [hiddenObjectIds, setHiddenObjectIds] = useState<ReadonlySet<string>>(() => new Set());
  const [aiSecretsVersion, setAiSecretsVersion] = useState(0);
  const [pluginToast, setPluginToast] = useState<string | null>(null);
  const showPluginToast = useCallback(
    (message: string, _variant?: 'info' | 'success' | 'warning' | 'error') => {
      setPluginToast(message);
      window.setTimeout(() => setPluginToast(null), 5000);
    },
    [],
  );
  const [smilesBarHint, setSmilesBarHint] = useState('');

  // First empty editor visit: live PubChem SDF, then the same 2D cleanup as import.
  useEffect(() => {
    if (!initialHydrationDone || docRoute.kind !== 'editor') return;
    const query = initialQueryRef.current();
    if (query.smiles || query.reaction) return;
    if (moleculeRef.current.atoms.length > 0) {
      selectionSmiLoadedRef.current = true;
      return;
    }
    if (selectionSmiLoadedRef.current) return;
    let cancelled = false;
    selectionSmiLoadedRef.current = true;
    setSmilesBarHint('Loading structure from PubChem…');
    const timeout = window.setTimeout(() => {
      if (!cancelled && moleculeRef.current.atoms.length === 0) setSmilesBarHint('');
    }, 10000);
    void (async () => {
      try {
        const mb = await pubchemMolblockFromCid(STARTUP_PUBCHEM_CID);
        if (cancelled) return;
        if (!mb?.trim() || moleculeRef.current.atoms.length > 0) {
          setSmilesBarHint('');
          return;
        }
        setSmilesBarHint('Optimizing structure…');
        engineMsgRef.current({
          type: 'SMILES_TO_MOLBLOCK_SUCCESS',
          id: 'import_smiles',
          payload: { molBlock: mb },
        });
      } catch {
        if (!cancelled) setSmilesBarHint('');
      } finally {
        window.clearTimeout(timeout);
      }
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      // StrictMode remounts this effect; allow a real retry while the canvas is still empty.
      if (moleculeRef.current.atoms.length === 0) {
        selectionSmiLoadedRef.current = false;
      }
    };
  }, [docRoute.kind, initialHydrationDone]);

  const focusAtomsOnCanvas = useCallback(
    (atomIds: string[]) => {
      if (!atomIds.length) return;
      const mol = editorStore.getMolecule();
      const aabb = getSelectionAabb(mol, atomIds);
      if (!aabb) return;
      const pad = 28;
      // Defer one frame so canvas size / store commit are settled after AI tools.
      requestAnimationFrame(() => {
        canvasRef.current?.fitWorldRect({
          minX: aabb.minX - pad,
          maxX: aabb.maxX + pad,
          minY: aabb.minY - pad,
          maxY: aabb.maxY + pad,
        });
      });
      setSelectedAtomIds(atomIds);
      setSelectedBondIds([]);
    },
    [editorStore, setSelectedAtomIds, setSelectedBondIds],
  );

  /** Search / PubChem: pan into view without changing zoom (never fit/reset). */
  const revealAtomsInView = useCallback(
    (atomIds: string[]) => {
      if (!atomIds.length) return;
      const mol = editorStore.getMolecule();
      const aabb = getSelectionAabb(mol, atomIds);
      if (!aabb) return;
      requestAnimationFrame(() => {
        canvasRef.current?.ensureWorldRectVisible(aabb);
      });
    },
    [editorStore],
  );

  const localSessionBridge = useLocalSessionBridge({
    store: editorStore,
    enabled: appSettings.general.localSessionEnabled === true,
    url: appSettings.general.localSessionUrl ?? 'http://127.0.0.1:8787',
    focusAtoms: focusAtomsOnCanvas,
    onNotice: showPluginToast,
  });

  const zoomCanvasAtCenter = useCallback((scale: number) => {
    const handle = canvasRef.current;
    const canvas = handle?.getCanvas();
    if (!handle || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    handle.zoomAtClientPoint(scale, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }, []);

  const fitAllObjectsOnCanvas = useCallback(() => {
    const mol = editorStore.getMolecule();
    const aabb = getMarqueeSelectionAabb(mol, {
      atomIds: mol.atoms.map(a => a.id),
      reactionArrowIds: (mol.reactionArrows ?? []).map(a => a.id),
      strokeIds: (mol.strokes ?? []).map(s => s.id),
      canvasTextIds: (mol.canvasTexts ?? []).map(t => t.id),
      canvasShapeIds: (mol.canvasShapes ?? []).map(s => s.id),
      canvasImageIds: (mol.canvasImages ?? []).map(img => img.id),
    });
    if (!aabb) {
      canvasRef.current?.resetViewport();
      return;
    }
    canvasRef.current?.fitWorldRect(aabb);
  }, [editorStore]);

  const focusCanvasFromChat = useCallback(
    (target: {
      atomIds?: string[];
      bounds?: { minX: number; maxX: number; minY: number; maxY: number };
    }) => {
      if (target.atomIds?.length) {
        focusAtomsOnCanvas(target.atomIds);
        return;
      }
      const b = target.bounds;
      if (!b) return;
      const pad = 28;
      requestAnimationFrame(() => {
        canvasRef.current?.fitWorldRect({
          minX: b.minX - pad,
          maxX: b.maxX + pad,
          minY: b.minY - pad,
          maxY: b.maxY + pad,
        });
      });
    },
    [focusAtomsOnCanvas],
  );

  const {
    perspectiveActive,
    perspectiveBusy,
    depthFade,
    depthShadingOn,
    depthWedgesOn,
    handle3DCleanUp,
    handleClear3DPose,
    handleFlatten3DPose,
    handleToggleDepthShading,
    handleDepthFadeChange,
    handleToggleDepthWedges,
    handleRotate3DPoseCommit,
  } = useCanvasPerspective({
    molecule,
    getMolecule: () => editorStore.getMolecule(),
    selectedAtomIds,
    selectedBondIds,
    applyCommand,
    setActiveTool,
    bondLengthPx: resolvedCanvasPreferences.bondLengthPx,
    worker3dRef,
    setSmilesBarHint,
    onApply3DPoseToViewer: applyExternal3DPose,
    clearSelection: () => {
      setSelectedAtomIds([]);
      setSelectedBondIds([]);
    },
  });

  /**
   * Clean Up Structure: in 3D cleanup mode (a Structure Perspective pose is
   * active) this re-minimizes the structure in 3D and keeps the orientation;
   * otherwise it is the regular 2D cleanup.
   */
  const handleCleanupStructureSmart = useCallback(() => {
    if (hasPerspectivePose(editorStore.getMolecule())) {
      handle3DCleanUp();
      return;
    }
    handleCleanupStructure();
  }, [editorStore, handle3DCleanUp, handleCleanupStructure]);
  useEffect(() => {
    cleanupStructureRef.current = handleCleanupStructureSmart;
  }, [handleCleanupStructureSmart]);

  const handleToolbarSelectWithPerspective = useCallback(
    (toolId: string) => {
      // Keep the 3D perspective pose while drawing/editing — edits update the
      // pose in place (see moveAtoms / addAtom). Clear 3D pose still drops it.

      // Teaching: Add explicit H on selection (Warwick / ChemDraw-style), or
      // activate the click-to-add tool when nothing is selected.
      if (toolId === 'add_explicit_h') {
        const sel = editorStore.getSelection().atomIds.filter(id => {
          const a = editorStore.getMolecule().atoms.find(x => x.id === id);
          return a && a.element !== 'H';
        });
        if (sel.length > 0) {
          const before = editorStore.getMolecule();
          const result = editorStore.applyCommand(CMD.AddExplicitHydrogens, {
            atomIds: sel,
            bondLengthPx: resolvedCanvasPreferences.bondLengthPx,
            bondAngleSnapRad: resolvedCanvasPreferences.bondAngleSnapRad,
            maxPerAtom: 1,
          });
          if (!result.ok || editorStore.getMolecule() === before) {
            setSmilesBarHint(
              'No room for explicit H (saturated atom, or a group label that already includes H). Isolated CN becomes H–CN.',
            );
          } else {
            setSmilesBarHint('Added explicit H on selection.');
          }
          return;
        }
        setSmilesBarHint('Add explicit H: click a heavy atom (e.g. aldehyde carbonyl carbon).');
        handleToolbarSelect(toolId);
        return;
      }

      // Polymer tool: if a repeat unit is already selected, wrap it immediately.
      if (toolId === 'sru_bracket') {
        const sel = editorStore.getSelection().atomIds;
        if (sel.length < 2) {
          setSmilesBarHint(
            'Polymer (n): select ≥2 atoms then click, or drag a box over the repeat unit. Click n on the canvas to edit.',
          );
        }
        if (sel.length >= 2) {
          const mol = editorStore.getMolecule();
          const box = sruBracketBoxForAtoms(mol, sel);
          if (box) {
            const id = Math.random().toString(36).substr(2, 9);
            editorStore.applyCommand(CMD.AddSruBracket, {
              bracket: {
                id,
                atomIds: [...sel],
                ...box,
                subscript: sruBracketSubscript || 'n',
              },
            });
            editorStore.setSelection({
              atomIds: [...sel],
              bondIds: [],
              canvasTextId: null,
              reactionArrowId: null,
              canvasImageId: null,
              sruBracketId: id,
            });
          }
        }
      }

      // ChemDraw-style: with bonds selected, bond/stereo tools apply immediately,
      // then the chosen tool activates so the toolbar never appears "stuck".
      if (isBondStyleToolId(toolId)) {
        const mol = editorStore.getMolecule();
        const sel = editorStore.getSelection();
        const targets = bondIdsTargetedBySelection(mol, sel.atomIds, sel.bondIds);
        if (targets.length > 0) {
          const patch = bondPatchForStyleTool(toolId);
          let changed = 0;
          let blocked = 0;
          for (const bondId of targets) {
            const before = editorStore.getMolecule().bonds.find(b => b.id === bondId);
            const result = editorStore.applyCommand(CMD.UpdateBond, { bondId, ...patch });
            const after = editorStore.getMolecule().bonds.find(b => b.id === bondId);
            if (!result.ok) {
              blocked += 1;
              continue;
            }
            const orderOk =
              patch.order === undefined || after?.order === patch.order;
            const stereoOk =
              !('stereo' in patch) ||
              (patch.stereo == null
                ? after?.stereo == null
                : after?.stereo === patch.stereo);
            const dativeOk =
              patch.dative === undefined ||
              Boolean(after?.dative) === Boolean(patch.dative);
            if (before && after && orderOk && stereoOk && dativeOk) {
              changed += 1;
            } else {
              blocked += 1;
            }
          }
          if (changed === 0 && blocked > 0) {
            setSmilesBarHint(
              'Could not change bond — would break valency or ring double-bond rules.',
            );
          } else if (blocked > 0 && changed > 0) {
            setSmilesBarHint(
              `Updated ${changed} bond(s); ${blocked} blocked by chemistry rules.`,
            );
          } else if (changed > 0) {
            setSmilesBarHint('');
            // Clear selection so the next toolbar click switches tools normally.
            editorStore.setSelection({ atomIds: [], bondIds: [] });
          }
        }
      }

      handleToolbarSelect(toolId);
    },
    [
      handleToolbarSelect,
      editorStore,
      resolvedCanvasPreferences.bondLengthPx,
      resolvedCanvasPreferences.bondAngleSnapRad,
    ],
  );

  const handleGenerateCofAndOrbit = useCallback(
    (params: Parameters<typeof handleGenerateCof>[0]) => {
      const placed = handleGenerateCof(params);
      if ((params.layers ?? 1) > 1) setActiveTool('perspective');
      return placed;
    },
    [handleGenerateCof, setActiveTool],
  );

  const getGeminiApiKey = useCallback(() => {
    void aiSecretsVersion;
    return loadAiSecrets().geminiApiKey;
  }, [aiSecretsVersion]);

  const [newmanBondId, setNewmanBondId] = useState<string | null>(null);
  const [fischerChainAtomIds, setFischerChainAtomIds] = useState<string[] | null>(null);
  const [chairBoatRingAtomIds, setChairBoatRingAtomIds] = useState<string[] | null>(null);
  const [ezAnalyzerBondId, setEZAnalyzerBondId] = useState<string | null>(null);

  const pasteFromClipboardRef = useRef<() => void | Promise<void>>(async () => {});
  const pasteWithFallbackRef = useRef<(onFragmentPaste: () => boolean) => void | Promise<void>>(
    async () => {},
  );
  const saveMoldrawRef = useRef<() => void | Promise<void>>(async () => {});
  const {
    contextMenu,
    setContextMenu,
    contextMenuRef,
    contextAtomDetectedAlias,
    closeContextMenu,
    openSelectionContextMenu,
    handleCanvasContextMenu,
    handleContextCopySmiles,
    handleContextPasteSmiles,
    handleContextDuplicate,
    handleContextExpandAlias,
    handleContextCollapseToAlias,
    handleContextChangeAtomElement,
    handleContextSetAtomIsotope,
    handleContextCustomAtomIsotope,
    handleContextEditAtomAlias,
    handleContextClearAtomAlias,
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
  } = useCanvasContextMenu({
    molecule,
    applyCommand,
    selectedAtomIds,
    selectedBondIds,
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
    colorEditCanvasShapeId,
    handlePasteFromSystemClipboard: () => pasteFromClipboardRef.current(),
    bondLengthPx: resolvedCanvasPreferences.bondLengthPx,
  });

  const getSmartPasteTarget = useCallback(() => {
    const menu = contextMenuRef.current;
    if (menu) return { x: menu.worldX, y: menu.worldY };
    const vp = viewportInfoRef.current;
    const c = viewportWorldCenter(vp);
    return { x: c.x, y: c.y };
  }, [contextMenuRef]);

  const {
    showInfoPanel,
    setShowInfoPanel,
    closeInfoPanel,
    toggleInfoPanel,
    infoData,
    setInfoData,
    selectionMatchesPubchemImport,
    viewer3DMoleculeTitle,
  } = useMoleculeInfoPanel({
    molecule,
    selectedAtomIds,
    structureCheck: indigo.structureCheck,
    workerRef,
    pubchemImport,
  });
  // Bridge: indigo setShowInfoPanel was wired before info panel exists.
  // eslint-disable-next-line react-hooks/refs -- intentional circular-dep bridge
  setShowInfoPanelRef.current = setShowInfoPanel;

  const {
    inlineEditorFocused,
    setInlineEditorFocused,
    inlineEditorPos,
    inlineTextareaRef,
    handleDelete,
    handleClearAll,
    handleEscape,
    handleSelectAll,
    handleQuickSelect,
    handleCopySelection,
    handlePasteSelection,
    handleSelectPlacementElement,
    handleUpdateCanvasText,
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
  } = useMoleculeCanvasCommands({
    applyCommand,
    moleculeEditor: editorStore,
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
    cipStereoTags: indigo.cipStereoTags,
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
    appSettings: {
      colorTargets: appSettings.general.colorTargets,
    },
    updateAppSettingsGeneral,
  });

  // Touch long-press → radial quick menu (see TouchQuickMenu). Null when the
  // menu came from a mouse / pen right-click or targets an object type that is
  // better served by the full menu.
  const touchQuickMenu = useMemo(() => {
    if (!contextMenu || contextMenu.pointerType !== 'touch') return null;
    const actions = {
      copySmiles: () => {
        if (!requireExportSignup()) return;
        handleContextCopySmiles();
      },
      paste: () => void handleContextPasteSmiles(),
      duplicate: handleContextDuplicate,
      deleteSelection: () => {
        closeContextMenu();
        handleDelete();
      },
      selectAll: () => {
        closeContextMenu();
        handleSelectAll();
      },
      undo: () => {
        closeContextMenu();
        handleUndo();
      },
      redo: () => {
        closeContextMenu();
        handleRedo();
      },
      canUndo,
      canRedo,
      editAtomLabel: handleContextEditAtomAlias,
      updateAtomCharge: (atomId: string, delta: number) => {
        applyCommand(CMD.UpdateAtomCharge, { atomId, delta });
        closeContextMenu();
      },
      addExplicitHydrogen: handleContextAddExplicitHydrogen,
      selectConnectedFragment: handleContextSelectConnectedFragment,
      invertStereoAtAtom: handleContextInvertStereoAtAtom,
      deleteAtom: (atomId: string) => {
        applyCommand(CMD.DeleteAtoms, { atomIds: [atomId] });
        setSelectedAtomIds(ids => ids.filter(id => id !== atomId));
        closeContextMenu();
      },
      cycleBondOrder: (bondId: string) => {
        const b = molecule.bonds.find(x => x.id === bondId);
        if (b) applyCommand(CMD.UpdateBond, { bondId, order: (b.order % 3) + 1 });
        closeContextMenu();
      },
      cycleBondStereo: (bondId: string) => {
        const b = molecule.bonds.find(x => x.id === bondId);
        if (b) {
          const next = b.stereo === 'wedge' ? 'dash' : b.stereo === 'dash' ? null : 'wedge';
          applyCommand(CMD.UpdateBond, { bondId, stereo: next });
        }
        closeContextMenu();
      },
      deleteBond: (bondId: string) => {
        applyCommand(CMD.DeleteBonds, { bondIds: [bondId] });
        setSelectedBondIds(ids => ids.filter(id => id !== bondId));
        closeContextMenu();
      },
      launchNewman: (bondId: string) => {
        setNewmanBondId(bondId);
        closeContextMenu();
      },
      launchEZ: (bondId: string) => {
        setEZAnalyzerBondId(bondId);
        closeContextMenu();
      },
      groupSelection: handleContextGroupSelection,
      ungroupSelection: handleContextUngroupSelection,
    };
    return buildTouchQuickMenuItems(contextMenu, molecule, selectedAtomIds, actions);
  }, [
    contextMenu,
    molecule,
    selectedAtomIds,
    applyCommand,
    canUndo,
    canRedo,
    closeContextMenu,
    handleContextCopySmiles,
    handleContextPasteSmiles,
    handleContextDuplicate,
    handleDelete,
    handleSelectAll,
    handleUndo,
    handleRedo,
    handleContextEditAtomAlias,
    handleContextAddExplicitHydrogen,
    handleContextSelectConnectedFragment,
    handleContextInvertStereoAtAtom,
    handleContextGroupSelection,
    handleContextUngroupSelection,
    setSelectedAtomIds,
    setSelectedBondIds,
  ]);

  const {
    editingArrowReagent,
    arrowReagentDraft,
    setArrowReagentDraft,
    inlineArrowReagentPos,
    topBarReagentFocusSlot,
    handleRequestArrowReagentEdit,
    commitReagentEdit,
    cancelReagentEdit,
  } = useArrowReagentEditor({
    molecule,
    canvasRef,
    viewportInfo,
    onUpdateReactionArrow: handleUpdateReactionArrow,
    setSelectedReactionArrowId,
    setSelectedCanvasTextId,
  });

  useEffect(() => {
    viewportOverlayActiveRef.current = Boolean(
      editingAtomAliasId || selectedCanvasTextId || editingArrowReagent,
    );
  }, [editingAtomAliasId, selectedCanvasTextId, editingArrowReagent]);

  useKeyboardShortcuts({
    activeTool,
    setActiveTool,
    onPickTool: handleToolbarSelectWithPerspective,
    selectedAtomId: selectedAtomIds.length === 1 ? selectedAtomIds[0] : null,
    hoverAtomIdRef,
    onEscape: () => {
      canvasRef.current?.discardSmartDrawSession();
      handleEscape();
    },
    onCommitSmartDraw: () => canvasRef.current?.commitSmartDrawSession(),
    onDelete: handleDelete,
    onUndo: handleUndo,
    onRedo: handleRedo,
    onSelectAll: handleSelectAll,
    onCopy: handleCopySelection,
    onPaste: () => {
      void pasteWithFallbackRef.current(handlePasteSelection);
    },
    onSave: () => {
      void saveMoldrawRef.current();
    },
    onQuickSelect: handleQuickSelect,
    onSetPlacementElement: handleSelectPlacementElement,
    onTypeAtomLabel: handleTypeAtomLabel,
    aliasEditorOpen: Boolean(editingAtomAliasId),
    aliasEditorOpenRef,
    onOpenShortcuts: () => setShowShortcuts(true),
    on3DCleanUp: handle3DCleanUp,
    onTogglePerspective: () => {
      if (perspectiveActive) {
        handleToggleDepthShading();
      } else {
        setActiveTool('perspective');
      }
    },
    onZoomIn: () => zoomCanvasAtCenter(1.2),
    onZoomOut: () => zoomCanvasAtCenter(1 / 1.2),
    onResetZoom: () => canvasRef.current?.resetViewport(),
    onFitView: fitAllObjectsOnCanvas,
    shortcutOverrides: appSettings.shortcuts?.bindings,
  });

  const {
    openFileBusy,
    openFileError,
    setOpenFileError,
    quickSearch,
    setQuickSearch,
    quickSearchLoading,
    quickSearchError,
    setQuickSearchError,
    importMolblock,
    handleOpenMoleculeFile,
    handlePlaceOnCanvas,
    handleImageFile,
    handlePasteFromSystemClipboard,
    handlePasteWithFallback,
    handlePasteTextToCanvas,
    handleSaveAs,
    handleSaveMoldrawToDisk,
    handleDownload,
    handleCopyAs,
    handleQuickSearch,
    pendingSmilesDownloadName,
    pendingConvertDownloadRef,
    pendingConvertCopyLabelRef,
  } = useMoleculeImportExport({
    applyCommand,
    bondLengthPx: resolvedCanvasPreferences.bondLengthPx,
    imageExportScale: resolvedCanvasPreferences.imageExportScale,
    displayPrefs: resolvedCanvasPreferences,
    showHydrogens: appSettings.general.showImplicitHydrogens,
    condensedGroupLabels: appSettings.general.condensedGroupLabels,
    colorAtomLabels: appSettings.general.colorAtomLabels,
    applyAtomColorsToBonds: appSettings.general.applyAtomColorsToBonds,
    structureTheme,
    structureDrawMode:
      molecule.structureDrawMode ?? appSettings.general.structureDrawMode ?? 'skeletal',
    showCipLabels,
    cipAtomLabels: cipLabelMaps.atoms,
    cipBondLabels: cipLabelMaps.bonds,
    workerRef,
    batchWorkerWaitRef,
    viewportInfoRef,
    molecule,
    selectedAtomIds,
    molblockGridSlotRef,
    molblockGridOriginRef,
    getSmartPasteTarget,
    getPasteContextAtomId: () => contextMenuRef.current?.atomId ?? null,
    handleAddCanvasImage,
    setSelectedAtomIds,
    setSelectedCanvasTextId,
    setSelectedReactionArrowId,
    setPubchemImport,
    setContextMenu,
    setSmilesBarHint,
    resetAutoCleanup,
    runLocalCleanup: indigo.runLocalCleanup,
    onApplyExternal3DPose: applyExternal3DPose,
    preferIndigo2dRef,
    projectName,
    onLoadDesignFile: (mol, name) => {
      editorStore.resetMolecule(mol);
      void renameProject(name);
      resetAutoCleanup();
    },
    onFragmentPaste: handlePasteSelection,
    revealAtomsInView,
  });
  // Bridge: context menu paste / Ctrl+S were wired before import/export exists.
  /* eslint-disable react-hooks/refs -- intentional circular-dep bridge */
  pasteFromClipboardRef.current = handlePasteFromSystemClipboard;
  pasteWithFallbackRef.current = handlePasteWithFallback;
  saveMoldrawRef.current = () => {
    if (!requireExportSignup()) return;
    return handleSaveMoldrawToDisk();
  };
  /* eslint-enable react-hooks/refs */

  const gatedSaveAs = useCallback(
    (format: Parameters<typeof handleSaveAs>[0]) => {
      if (!requireExportSignup()) return;
      handleSaveAs(format);
    },
    [handleSaveAs, requireExportSignup],
  );
  const gatedDownload = useCallback(
    (format: Parameters<typeof handleDownload>[0]) => {
      if (!requireExportSignup()) return;
      handleDownload(format);
    },
    [handleDownload, requireExportSignup],
  );
  const gatedSaveMoldrawToDisk = useCallback(() => {
    if (!requireExportSignup()) return;
    void handleSaveMoldrawToDisk();
  }, [handleSaveMoldrawToDisk, requireExportSignup]);
  const gatedDownloadProject = useCallback(
    (id: string) => {
      if (!requireExportSignup()) return;
      void downloadProjectMoldrawFile(id);
    },
    [requireExportSignup],
  );
  const gatedDownloadAll = useCallback(
    (asZip: boolean) => {
      if (!requireExportSignup()) return;
      void downloadAllProjectsMoldraw({ asZip });
    },
    [requireExportSignup],
  );

  const gatedCopyAs = useCallback(
    (format: Parameters<typeof handleCopyAs>[0]) => {
      if (!requireExportSignup()) return;
      return handleCopyAs(format);
    },
    [handleCopyAs, requireExportSignup],
  );
  const gatedHeaderCopySmiles = useCallback(() => {
    if (!requireExportSignup()) return;
    handleCopyAs('smiles');
    setSmilesCopied(true);
    window.setTimeout(() => setSmilesCopied(false), 1800);
  }, [handleCopyAs, requireExportSignup]);
  const gatedHeaderCopySvg = useCallback(() => {
    if (!requireExportSignup()) return;
    setSvgCopyError(false);
    void Promise.resolve(handleCopyAs('svg')).then(ok => {
      if (ok === false) {
        setSvgCopyError(true);
        window.setTimeout(() => setSvgCopyError(false), 2200);
        return;
      }
      setSvgCopied(true);
      window.setTimeout(() => setSvgCopied(false), 1800);
    });
  }, [handleCopyAs, requireExportSignup]);
  const gatedContextCopySmiles = useCallback(() => {
    if (!requireExportSignup()) return;
    handleContextCopySmiles();
  }, [handleContextCopySmiles, requireExportSignup]);

  const handleHeaderPasteSmiles = useCallback(async () => {
    const paste = async (raw: string) => {
      const ok = await handlePasteTextToCanvas(raw, true);
      if (!ok) {
        setOpenFileError('Clipboard does not contain a SMILES string or structure.');
      }
    };
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (text) {
        await paste(text);
        return;
      }
    } catch {
      /* fall through to prompt */
    }
    const smiles = window.prompt('Paste or type a SMILES string:');
    if (smiles?.trim()) await paste(smiles.trim());
  }, [handlePasteTextToCanvas, setOpenFileError]);

  useEngineMessageRouter({
    engineMsgRef,
    importMolblockRef,
    importMolblock,
    applyCommand,
    enrichImportPendingRef,
    aiWorkerPendingRef,
    aiCleanupPendingRef,
    localCleanupRequestsRef,
    clearCleanupWatchdog,
    automapPendingRef,
    batchWorkerWaitRef,
    pendingConvertDownloadRef,
    pendingConvertCopyLabelRef,
    pendingSmilesDownloadName,
    latestStereoRequestRef,
    viewportInfoRef,
    contextMenuRef,
    bondLengthPxRef,
    placementRestoreToolRef,
    setCipStereoTags,
    setStructureCheck,
    setInfoData,
    setSmilesBarHint,
    setSelectedAtomIds,
    setSelectedReactionArrowId,
    setFragmentPlacement,
    setActiveTool,
    runLocalCleanupRef,
    onCleanupStructureRef: cleanupStructureRef,
    startupSeedCleanupRef,
    getMolecule: () => editorStore.getMolecule(),
  });


  const aiCtx = useAiExecutionContext({
    molecule,
    getMoleculeLive: () => editorStore.getMolecule(),
    applyCommand,
    bondLengthPx: resolvedCanvasPreferences.bondLengthPx,
    bondAngleSnapRad: resolvedCanvasPreferences.bondAngleSnapRad,
    viewportInfoRef,
    molblockGridSlotRef,
    molblockGridOriginRef,
    aiWorkerPendingRef,
    workerRef,
    batchWorkerWaitRef,
    importMolblockRef,
    resetAutoCleanup,
    preferIndigo2dRef,
    getSelection: () => editorStore.getSelection(),
    setSelection,
    undo: handleUndo,
    redo: handleRedo,
    canUndo: () => editorStore.canUndo(),
    canRedo: () => editorStore.canRedo(),
    startAutomap: handleAutomap,
    focusAtoms: focusAtomsOnCanvas,
  });

  const pluginExportSmiles = useCallback(async () => {
    const r = await aiCtx.exportSmiles?.();
    if (r && typeof r === 'object' && 'ok' in r && r.ok && r.data != null) {
      return String(r.data);
    }
    return '';
  }, [aiCtx]);

  const insertReactionTemplate = useReactionLibraryInsert({
    aiCtx,
    applyCommand,
    onInserted: atomIds => {
      setSelection({ atomIds, bondIds: [], canvasTextId: null, reactionArrowId: null, canvasImageId: null, colorEditCanvasShapeId: null });
      focusAtomsOnCanvas(atomIds);
    },
    onError: message => alert(message),
  });

  const handleInsertReactionTemplate = useCallback(
    async (reactionId: string) => {
      setInsertingReactionId(reactionId);
      try {
        await insertReactionTemplate(reactionId);
        setShowTemplateLibrary(false);
      } finally {
        setInsertingReactionId(null);
      }
    },
    [insertReactionTemplate],
  );

  const {
    handlePubChemImport,
    handlePubChemImportQuiet,
    requestTemplateSmilesMolblock,
    runBatchSmilesPipeline,
    handleBatchImportMolblockOnly,
    handleBatchImportMolblocksToCanvas,
  } = usePubChemBatchBridge({
    importMolblock,
    setShowPubChem,
    molblockGridSlotRef,
    molblockGridOriginRef,
    batchWorkerWaitRef,
    workerRef,
    worker3dRef,
    preferIndigo2dRef,
    revealAtomsInView,
  });

  if (docRoute.kind === 'docs') {
    return (
      <Suspense fallback={<RouteFallback />}>
        <DocumentationPage
          slug={docRoute.slug}
          onSlugChange={slug => setDocRoute({ kind: 'docs', slug })}
          onClose={() => {
            navigateToEditor(true);
            setDocRoute({ kind: 'editor' });
          }}
        />
      </Suspense>
    );
  }

  if (docRoute.kind === 'addons') {
    return (
      <Suspense fallback={<RouteFallback />}>
        <AddonsPage
          onClose={() => {
            navigateToEditor(true);
            setDocRoute({ kind: 'editor' });
          }}
        />
      </Suspense>
    );
  }

  if (docRoute.kind === 'my') {
    return (
      <Suspense fallback={<RouteFallback />}>
        <MyProjectsPage
        projects={projectMetas}
        folders={folders}
        onRefresh={refreshMetas}
        onOpenProject={id => {
          void openProject(id);
          setDocRoute({ kind: 'editor' });
        }}
        onNewProject={folderId => {
          newProject(folderId ?? null);
          setDocRoute({ kind: 'editor' });
        }}
        onDeleteProjects={deleteProjects}
        onDuplicateProject={async id => {
          await duplicateProject(id);
        }}
        onRenameProject={(id, name) => void renameProject(name, id)}
        onCreateFolder={async (name, parentId) => {
          await createFolder(name, parentId);
        }}
        onRenameFolder={renameFolder}
        onDeleteFolder={deleteFolder}
        onMoveProjectsToFolder={moveProjectsToFolder}
        onDownloadProject={gatedDownloadProject}
        onDownloadAll={gatedDownloadAll}
        onBackToEditor={handleBackToEditor}
      />
      </Suspense>
    );
  }

  return (
    <I18nProvider language={uiLanguage}>
    <PluginHostProvider
      getMolecule={() => editorStore.getMolecule()}
      getSelection={() => editorStore.getSelection()}
      applyCommand={(commandId, input) => editorStore.applyCommand(commandId, input)}
      exportSmiles={pluginExportSmiles}
      showToast={showPluginToast}
      getTheme={() =>
        appSettings.general.theme === 'elegant-dark' ||
        appSettings.general.theme === 'ink-dark'
          ? 'dark'
          : 'light'
      }
      aiSecretsVersion={aiSecretsVersion}
    >
    <>
      {engineWorkerStatus === 'error' ? (
        <div className="app-engine-banner" role="alert">
          <span>
            Structure engine worker failed to start ({engineWorkerError ?? 'unknown error'}). Drawing
            still works on the main thread, but Cleanup and SMILES import may be slower. Try a hard
            refresh (Ctrl+F5).
          </span>
          <button type="button" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      ) : null}

      <HardwareAccelBanner />

      <KeyboardShortcutsModal open={showShortcuts} onClose={() => setShowShortcuts(false)} />
      <AuthModal
        open={auth.showAuthModal}
        mode={auth.authMode}
        form={auth.authForm}
        error={auth.authError}
        notice={auth.authNotice}
        loading={auth.isAuthLoading}
        onClose={auth.closeAuthModal}
        onModeChange={mode => {
          auth.setAuthMode(mode);
        }}
        onChange={auth.updateAuthForm}
        onSubmit={auth.handleAuthSubmit}
      />
      <FeatureRequestModal
        key={auth.defaultFeatureEmail}
        open={showFeatureRequest}
        defaultEmail={auth.defaultFeatureEmail}
        onClose={() => setShowFeatureRequest(false)}
      />
      <UpdatesModal open={showUpdatesModal} onClose={() => setShowUpdatesModal(false)} />

      <Suspense fallback={null}>
        <PluginModals />
      </Suspense>

      {pluginToast ? (
        <div className="app-engine-banner" role="status">
          <span>{pluginToast}</span>
          <button type="button" onClick={() => setPluginToast(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      {saveNotice ? <LocalSaveToast message={saveNotice} /> : null}

      <ProjectLibraryModal
        open={showProjectLibrary}
        projects={projectMetas}
        folders={folders}
        onRefresh={refreshMetas}
        onClose={() => setShowProjectLibrary(false)}
        onOpenProject={id => {
          void openProject(id);
        }}
        onNewProject={folderId => {
          newProject(folderId ?? null);
          setShowProjectLibrary(false);
        }}
        onDeleteProjects={deleteProjects}
        onDuplicateProject={async id => {
          await duplicateProject(id);
        }}
        onRenameProject={(id, name) => void renameProject(name, id)}
        onCreateFolder={async (name, parentId) => {
          await createFolder(name, parentId);
        }}
        onRenameFolder={renameFolder}
        onDeleteFolder={deleteFolder}
        onMoveProjectsToFolder={moveProjectsToFolder}
        onDownloadProject={gatedDownloadProject}
        onDownloadAll={gatedDownloadAll}
      />

      {showAppSettings ? (
      <Suspense fallback={null}>
      <AppSettingsModal
        open={showAppSettings}
        onClose={() => setShowAppSettings(false)}
        settings={appSettings}
        updateGeneral={updateAppSettingsGeneral}
        updateBonds={updateAppSettingsBondsLive}
        updateShortcutBindings={updateAppShortcutBindings}
        resetShortcutBindings={resetAppShortcutBindings}
        resetToDefaults={() => {
          resetAppSettings();
          applyCommand(CMD.SetStructureTheme, { themeId: 'skeletal', drawMode: 'skeletal' });
        }}
        onApplyPreset={handleApplySettingsPreset}
        onAiSecretsChange={() => setAiSecretsVersion(v => v + 1)}
        onStructureThemeChange={(themeId, drawMode) => {
          applyCommand(CMD.SetStructureTheme, { themeId, drawMode });
        }}
        localSession={localSessionBridge}
      />
      </Suspense>
      ) : null}

      <div className="app-frame">
      <div className="app-shell">
      <WorkspaceSplit
        showChatPanel={showChatPanel}
        show3DViewer={show3DViewer}
        isCompact={isCompactViewport}
        isPhone={isCompactViewport}
        onCloseChat={() => setShowChatPanel(false)}
        onClose3D={() => setShow3DViewer(false)}
        topBar={
          <>
            <AppTopBar
            quickSearch={quickSearch}
            setQuickSearch={setQuickSearch}
            quickSearchLoading={quickSearchLoading}
            quickSearchError={quickSearchError}
            setQuickSearchError={setQuickSearchError}
            onQuickSearch={handleQuickSearch}
            onOpenAdvancedSearch={() => setShowPubChem(true)}
            activeTool={activeTool}
            onSelectTool={toolId => handleToolbarSelectWithPerspective(toolId)}
            onQuickSelect={handleQuickSelect}
            shortcutOverrides={appSettings.shortcuts?.bindings}
            openFileBusy={openFileBusy}
            openFileError={openFileError}
            onDismissOpenFileError={() => setOpenFileError(null)}
            onOpenMoleculeFile={handleOpenMoleculeFile}
            onPlaceFile={handlePlaceOnCanvas}
            onNewProject={handleNewTab}
            documentStyleThemePanel={
              <StyleToolbar
                layout="panel"
                panelSection="theme"
                general={effectiveGeneral}
                bonds={effectiveBonds}
                applyGlobally={styleApplyGlobally}
                onApplyGloballyChange={handleApplyGloballyChange}
                updateGeneral={handleStyleGeneralPatch}
                updateBonds={handleStyleBondsPatch}
              />
            }
            documentStyleRestPanel={
              <StyleToolbar
                layout="panel"
                panelSection="rest"
                general={effectiveGeneral}
                bonds={effectiveBonds}
                applyGlobally={styleApplyGlobally}
                onApplyGloballyChange={handleApplyGloballyChange}
                updateGeneral={handleStyleGeneralPatch}
                updateBonds={handleStyleBondsPatch}
                onResetToDefaults={() => {
                  resetAppSettings();
                  setDocumentStyleByTabId({});
                  void applyThemeToAllOpenDesigns('skeletal', 'skeletal');
                }}
              />
            }
            drawRow={
              showDrawTools && !isCompactViewport ? (
                <ToolbarDrawStrip
                  activeTool={activeTool}
                  onSelect={handleToolbarSelectWithPerspective}
                  reactionArrowKind={reactionArrowKind}
                  onReactionArrowKindChange={setReactionArrowKind}
                  reactionArrowHeadStyle={reactionArrowHeadStyle}
                  onReactionArrowHeadStyleChange={setReactionArrowHeadStyle}
                  sruBracketSubscript={sruBracketSubscript}
                  onSruBracketSubscriptChange={setSruBracketSubscript}
                  canvasShapeKind={canvasShapeKind}
                  onCanvasShapeKindChange={setCanvasShapeKind}
                  shapeMenuValue={shapeMenuValue}
                  onShapeMenuValueChange={handleShapeMenuValueChange}
                  onBeginFunctionalGroupPlacement={handleBeginFunctionalGroupPlacement}
                  onBeginLigandPlacement={handleBeginLigandPlacement}
                  requestFunctionalGroupMolblock={requestTemplateSmilesMolblock}
                />
              ) : null
            }
            toolsRow={
              !isCompactViewport && !showDrawTools ? (
                <ToolbarTopStrip
                  activeTool={activeTool}
                  onSelect={handleToolbarSelectWithPerspective}
                  reactionArrowKind={reactionArrowKind}
                  onReactionArrowKindChange={setReactionArrowKind}
                  reactionArrowHeadStyle={reactionArrowHeadStyle}
                  onReactionArrowHeadStyleChange={setReactionArrowHeadStyle}
                  sruBracketSubscript={sruBracketSubscript}
                  onSruBracketSubscriptChange={setSruBracketSubscript}
                  canvasShapeKind={canvasShapeKind}
                  onCanvasShapeKindChange={setCanvasShapeKind}
                  shapeMenuValue={shapeMenuValue}
                  onShapeMenuValueChange={handleShapeMenuValueChange}
                  onBeginFunctionalGroupPlacement={handleBeginFunctionalGroupPlacement}
                  onBeginLigandPlacement={handleBeginLigandPlacement}
                  requestFunctionalGroupMolblock={requestTemplateSmilesMolblock}
                />
              ) : null
            }
            arrowRow={null}
            pencilRow={
              activeTool === 'pencil' || activeTool === 'smart_draw' ? (
                <PencilOptionsBar
                  variant="topbar"
                  activeThickness={activeThickness}
                  onSelectThickness={setActiveThickness}
                />
              ) : null
            }
            contextRow={
              <>
                {selectedCanvasText ? (
                  <TextStylePanel
                    variant="topbar"
                    selectedCanvasText={selectedCanvasText}
                    onUpdate={handleUpdateCanvasText}
                    onInsertSymbol={handleInsertChemSymbol}
                    onClose={() => setSelectedCanvasTextId(null)}
                  />
                ) : null}
                {!selectedReactionArrow ? (
                  <CofsPackingBar
                    molecule={molecule}
                    selectedAtomIds={selectedAtomIds}
                    bondLengthPx={resolvedCanvasPreferences.bondLengthPx}
                    onGenerate={handleGenerateCofAndOrbit}
                  />
                ) : null}
                {!selectedReactionArrow ? (
                  <SelectionAlignToolbar
                    variant="topbar"
                    visible
                    isCompact={isCompactViewport}
                    molecule={molecule}
                    selectionAtomIds={arrangeSelectionAtomIds}
                    viewport={viewportInfo}
                    canvasRef={canvasRef}
                    onArrange={handleArrangeSelection}
                    onCircularArray={handleCircularArray}
                    onLinearArray={handleLinearArray}
                    onDendrimerArray={handleDendrimerArray}
                    onGenerateGraphene={handleGenerateGraphene}
                  />
                ) : null}
              </>
            }
            expandTopRows={false}
            isCompact={isCompactViewport}
            isMobile={appLayout.isMobile}
            landscapeView={appLayout.isPhoneLandscape}
            onToggleLandscapeView={appLayout.toggleLandscape}
            onClearAll={handleClearAll}
            onAddExplicitHydrogen={() => handleToolbarSelectWithPerspective('add_explicit_h')}
            indigoLayoutReady={indigoLayoutReady}
            preferIndigo2d={appSettings.general.preferIndigo2d === true}
            onCleanupStructure={handleCleanupStructureSmart}
            on3DCleanUp={handle3DCleanUp}
            onFlatten3DPose={handleFlatten3DPose}
            onClear3DPose={handleClear3DPose}
            perspectiveActive={perspectiveActive}
            perspectiveBusy={perspectiveBusy}
            depthFade={depthFade}
            depthShadingOn={depthShadingOn}
            onDepthFadeChange={handleDepthFadeChange}
            depthWedgesOn={depthWedgesOn}
            onToggleDepthWedges={handleToggleDepthWedges}
            onAromatize={() => handleAromatize('aromatize')}
            onDearomatize={() => handleAromatize('dearomatize')}
            onCheckStructure={handleCheckStructure}
            showCipLabels={showCipLabels}
            onToggleCipLabels={() =>
              updateAppSettingsGeneral({ showCipLabels: !showCipLabels })
            }
            onAutomap={handleAutomap}
            onInsertAutomapDemo={handleInsertAutomapDemo}
            onInsertMechanismDemo={handleInsertMechanismDemo}
            selectedAtomCount={selectedAtomIds.length}
            showInfoPanel={showInfoPanel}
            onToggleInfoPanel={toggleInfoPanel}
            showTextStylePanel={showRightFontPanel}
            onToggleTextStylePanel={() => setShowRightFontPanel(v => !v)}
            show3DViewer={show3DViewer}
            onToggle3DViewer={() => setShow3DViewer(v => !v)}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={handleUndo}
            onRedo={handleRedo}
            showChatPanel={showChatPanel}
            onToggleChatPanel={() => setShowChatPanel(v => !v)}
            showObjectsPanel={showObjectsPanel}
            onToggleObjectsPanel={() => setShowObjectsPanel(v => !v)}
            onOpenSettings={() => setShowAppSettings(true)}
            onOpenShortcuts={() => setShowShortcuts(true)}
            onOpenMyProjects={handleOpenMyProjects}
            onOpenLibrary={() => {
              void refreshMetas();
              setShowProjectLibrary(true);
            }}
            onCopySmiles={gatedHeaderCopySmiles}
            onCopySvg={gatedHeaderCopySvg}
            onPaste={() => void handleHeaderPasteSmiles()}
            onCopyAs={gatedCopyAs}
            smilesCopied={smilesCopied}
            svgCopied={svgCopied}
            svgCopyError={svgCopyError}
            onRequestFeature={() => setShowFeatureRequest(true)}
            onSignIn={() => auth.openAuthModal('signin')}
            onSignUp={() => auth.openAuthModal('signup')}
            onSignOut={() => void auth.handleSignOut()}
            signedIn={auth.signedIn}
            authDisplayName={auth.authDisplayName}
            onOpenUpdates={() => {
              setShowUpdatesModal(true);
              setHasUnreadUpdates(false);
              markMolDrawUpdatesSeen();
            }}
            hasUnreadUpdates={hasUnreadUpdates}
            uiTheme={appSettings.general.theme}
            onChangeUiTheme={theme => updateAppSettingsGeneral({ theme })}
            showGrid={appSettings.general.showGrid === true}
            onToggleGrid={() =>
              updateAppSettingsGeneral({ showGrid: appSettings.general.showGrid !== true })
            }
            onOpenTemplateLibrary={() => {
              setTemplateLibraryTab('structures');
              setShowTemplateLibrary(true);
              setShowDrawTools(false);
            }}
            drawToolsOpen={showDrawTools}
            onToggleDrawTools={() => {
              setShowDrawTools(v => !v);
            }}
            onGoHome={() => {
              setShowDrawTools(false);
            }}
            onSaveAs={gatedSaveAs}
            onSave={gatedSaveMoldrawToDisk}
            activeColor={activeColor}
            onActiveColorChange={setActiveColor}
            colorTargets={appSettings.general.colorTargets}
            onColorTargetsChange={handleColorTargetsChange}
            selectedStrokeId={colorEditStrokeId}
            selectedCanvasShapeId={colorEditCanvasShapeId}
            ringPaintActive={ringPaintActive}
            molecule={molecule}
            selectedAtomIds={selectedAtomIds}
            selectedBondIds={selectedBondIds}
            selectedCanvasText={selectedCanvasText}
            selectedReactionArrow={selectedReactionArrow}
            onApplyColor={handleApplySelectionColor}
            onClearAtomColors={handleClearAtomColors}
            onUpdateCanvasShape={handleUpdateCanvasShape}
            onBeginCanvasShapeLiquidScrub={beginCanvasShapeLiquidScrub}
            onScrubCanvasShapeLiquidLevel={scrubCanvasShapeLiquidLevel}
            onEndCanvasShapeLiquidScrub={endCanvasShapeLiquidScrub}
            documentFontSizePt={effectiveGeneral.fontSizePt}
            documentBondThicknessPx={effectiveBonds.bondThicknessPx}
            onApplySelectionFontSize={handleContextApplySelectionFontSize}
            onApplySelectionBondThickness={handleContextApplySelectionBondThickness}
            onApplySelectionOpacity={handleContextApplySelectionOpacity}
          />
          </>
        }
        paneChat={
          showChatPanel ? (
          <Suspense fallback={null}>
          <ChatPanel
            key={aiSecretsVersion}
            aiCtx={aiCtx}
            getApiKey={getGeminiApiKey}
            onOpenSettings={() => setShowAppSettings(true)}
            onFocusCanvas={focusCanvasFromChat}
            onSaveApiKey={key => {
              updateGeminiApiKey(key);
              setAiSecretsVersion(v => v + 1);
            }}
          />
          </Suspense>
          ) : null
        }
        pane2D={
          <div className="workspace-2d-with-overlay">
            {docRoute.kind === 'editor' ? (
              <div className="canvas-document-tabs">
                <DocumentTabBar
                  tabs={openTabs}
                  activeTabId={activeTabId}
                  onSelectTab={id => {
                    void switchTab(id);
                  }}
                  onCloseTab={id => {
                    void closeTab(id);
                  }}
                  onNewTab={handleNewTab}
                  onRenameTab={(id, name) => {
                    void renameProject(name, id);
                  }}
                />
              </div>
            ) : null}
            <CanvasWithResolvedTheme
              themeId={molecule.structureThemeId ?? appSettings.general.structureThemeId}
              storedDrawMode={
                molecule.structureDrawMode ?? appSettings.general.structureDrawMode
              }
              canvasRef={canvasRef}
              store={editorStore}
              onViewportChange={handleViewportChange}
              activeTool={activeTool}
              displayScale={1}
              displayPrefs={resolvedCanvasPreferences}
              hiddenObjectIds={hiddenObjectIds}
              selectedChargeAtomIds={selectedChargeAtomIds}
              setSelectedChargeAtomIds={setSelectedChargeAtomIds}
              selectedChargeMarkKind={selectedChargeMarkKind}
              setSelectedChargeMarkKind={setSelectedChargeMarkKind}
              onHoverAtomIdChange={id => {
                hoverAtomIdRef.current = id;
              }}
              showHydrogens={appSettings.general.showImplicitHydrogens}
              condensedGroupLabels={appSettings.general.condensedGroupLabels}
              colorAtomLabels={appSettings.general.colorAtomLabels}
              applyAtomColorsToBonds={appSettings.general.applyAtomColorsToBonds}
              structureTheme={structureTheme}
              onBondAdded={recordAutoCleanupBond}
              canvasTextFontFamily={effectiveGeneral.fontFamily}
              canvasTextFontSizePt={effectiveGeneral.fontSizePt}
              activeColor={activeColor}
              activeThickness={activeThickness}
              ringPaintActive={ringPaintActive}
              ringFillOpacity={appSettings.general.colorTargets.ringFillOpacity}
              omitCanvasTextBodyId={
                canvasTextTransforming
                  ? null
                  : inlineEditorFocused
                    ? selectedCanvasTextId
                    : null
              }
              onCanvasTextTransforming={setCanvasTextTransforming}
              reactionArrowKind={reactionArrowKind}
              reactionArrowHeadStyle={reactionArrowHeadStyle}
              reactionArrowTailStyle={reactionArrowTailStyle}
              reactionArrowHeadScale={reactionArrowHeadScale}
              canvasShapeKind={canvasShapeKind}
              sruBracketSubscript={sruBracketSubscript}
              placementElement={activePlacementElement}
              omitAtomAliasBodyId={omitAtomAliasBodyId}
              onRequestAtomAliasEdit={handleRequestAtomAliasEdit}
              onRequestArrowReagentEdit={handleRequestArrowReagentEdit}
              onContextMenu={handleCanvasContextMenu}
              onDismissChromeOverlays={dismissChromeOverlays}
              touchPanOnEmptyCanvas={appSettings.general.touchPanOnEmptyCanvas === true}
              touchLoupe={appSettings.general.touchLoupe !== false}
              pointerDebugHud={appSettings.general.pointerDebugHud === true}
              onUndoGesture={handleUndo}
              onRedoGesture={handleRedo}
              onEditSruBracketSubscript={handleContextEditSruBracketSubscript}
              fragmentPlacement={fragmentPlacement}
              onCommitFragmentPlacement={handleCommitFragmentPlacement}
              cipAtomLabels={cipLabelMaps.atoms}
              cipBondLabels={cipLabelMaps.bonds}
              showCipLabels={showCipLabels}
              onRotate3DPoseCommit={handleRotate3DPoseCommit}
              onPerspectivePosePreview={applyPerspectivePreviewMolblock}
            />
            <SelectionActionToolbar
              visible={
                selectedAtomIds.length > 0 ||
                selectedBondIds.length > 0 ||
                !!colorEditCanvasShapeId ||
                !!selectedCanvasTextId ||
                !!selectedReactionArrowId ||
                !!selectedCanvasImageId ||
                !!colorEditStrokeId
              }
              molecule={molecule}
              selectionAtomIds={
                arrangeSelectionAtomIds.length > 0
                  ? arrangeSelectionAtomIds
                  : selectedAtomIds
              }
              selectedBondIds={selectedBondIds}
              marqueeSelection={{
                atomIds:
                  arrangeSelectionAtomIds.length > 0
                    ? arrangeSelectionAtomIds
                    : selectedAtomIds,
                reactionArrowIds: selection.reactionArrowIds,
                strokeIds: selection.strokeIds,
                canvasTextIds: selection.canvasTextIds,
                canvasShapeIds: selection.canvasShapeIds,
                canvasImageIds: selection.canvasImageIds,
              }}
              annotationTarget={
                colorEditCanvasShapeId
                  ? { kind: 'shape', id: colorEditCanvasShapeId }
                  : selectedCanvasTextId
                    ? { kind: 'text', id: selectedCanvasTextId }
                    : selectedReactionArrowId
                      ? { kind: 'arrow', id: selectedReactionArrowId }
                      : selectedCanvasImageId
                        ? { kind: 'image', id: selectedCanvasImageId }
                        : colorEditStrokeId
                          ? { kind: 'stroke', id: colorEditStrokeId }
                          : { kind: 'atoms' }
              }
              viewport={viewportInfo}
              canvasRef={canvasRef}
              onReflect={handleReflectSelection}
              onDuplicate={handleContextDuplicate}
              onDelete={handleDelete}
              showContextMenuChip={isCompactViewport}
              contextMenuOpen={Boolean(contextMenu)}
              onOpenContextMenu={e => {
                e.stopPropagation();
                if (contextMenu) {
                  closeContextMenu();
                  return;
                }
                openSelectionContextMenu(
                  { clientX: e.clientX, clientY: e.clientY },
                  {
                    canvasImageId: selectedCanvasImageId,
                    strokeId: colorEditStrokeId,
                    sruBracketId: selectedSruBracketId,
                    canvasShapeId: colorEditCanvasShapeId,
                  },
                );
              }}
            />
            <AtomPalette
              activePlacementElement={activePlacementElement}
              onSelect={handleSelectPlacementElement}
              show3DViewer={show3DViewer}
              onToggle3DViewer={() => setShow3DViewer(v => !v)}
            />
            <ToolbarRail
              activeTool={activeTool}
              onSelect={handleToolbarSelectWithPerspective}
              isCompact={isCompactViewport}
              preferSheetMenus={isCompactViewport}
              groupedTools={groupedTools}
              reactionArrowKind={reactionArrowKind}
              onReactionArrowKindChange={setReactionArrowKind}
              reactionArrowHeadStyle={reactionArrowHeadStyle}
              onReactionArrowHeadStyleChange={setReactionArrowHeadStyle}
              sruBracketSubscript={sruBracketSubscript}
              onSruBracketSubscriptChange={setSruBracketSubscript}
              canvasShapeKind={canvasShapeKind}
              onCanvasShapeKindChange={setCanvasShapeKind}
              shapeMenuValue={shapeMenuValue}
              onShapeMenuValueChange={handleShapeMenuValueChange}
              onBeginFunctionalGroupPlacement={handleBeginFunctionalGroupPlacement}
              onBeginLigandPlacement={handleBeginLigandPlacement}
              requestFunctionalGroupMolblock={requestTemplateSmilesMolblock}
              onOpenSettings={isCompactViewport ? () => setShowAppSettings(true) : undefined}
              showObjectsPanel={showObjectsPanel}
              onToggleObjectsPanel={() => setShowObjectsPanel(v => !v)}
              showDrawTools={false}
            />
            <ArrowPropertiesPanel
              arrow={selectedReactionArrow}
              toolActive={activeTool === 'reaction_arrow'}
              toolKind={reactionArrowKind}
              defaultHeadStyle={reactionArrowHeadStyle}
              defaultTailStyle={reactionArrowTailStyle}
              defaultHeadScale={reactionArrowHeadScale}
              onUpdateArrow={handleUpdateReactionArrow}
              onChangeDefaults={patch => {
                if (patch.headStyle) setReactionArrowHeadStyle(patch.headStyle);
                if (patch.tailStyle) setReactionArrowTailStyle(patch.tailStyle);
                if (patch.headScale != null) setReactionArrowHeadScale(patch.headScale);
              }}
              focusSlot={topBarReagentFocusSlot}
            />
            {showObjectsPanel ? (
              (() => {
                const objectsPanel = (
                  <ObjectsPanel
                    molecule={molecule}
                    hiddenIds={hiddenObjectIds}
                    onToggleHidden={id => setHiddenObjectIds(prev => toggleHiddenId(prev, id))}
                    onCommand={(commandId, input) => {
                      applyCommand(commandId, input);
                    }}
                    onSelectMolecule={atomIds => {
                      setSelectedAtomIds(atomIds);
                      setSelectedBondIds([]);
                      setSelectedCanvasTextId(null);
                      setSelectedReactionArrowId(null);
                      setSelectedCanvasImageId(null);
                      setColorEditCanvasShapeId(null);
                      focusAtomsOnCanvas(atomIds);
                    }}
                    onSelectArrow={id => {
                      setSelectedReactionArrowId(id);
                      setSelectedAtomIds([]);
                      setSelectedBondIds([]);
                      setSelectedCanvasTextId(null);
                      setSelectedCanvasImageId(null);
                      setColorEditCanvasShapeId(null);
                    }}
                    onSelectText={id => {
                      setSelectedCanvasTextId(id);
                      setSelectedAtomIds([]);
                      setSelectedBondIds([]);
                      setSelectedReactionArrowId(null);
                      setSelectedCanvasImageId(null);
                      setColorEditCanvasShapeId(null);
                    }}
                    onSelectImage={id => {
                      setSelectedCanvasImageId(id);
                      setSelectedAtomIds([]);
                      setSelectedBondIds([]);
                      setSelectedCanvasTextId(null);
                      setSelectedReactionArrowId(null);
                      setColorEditCanvasShapeId(null);
                    }}
                    onSelectShape={id => {
                      setColorEditCanvasShapeId(id);
                      setSelectedAtomIds([]);
                      setSelectedBondIds([]);
                      setSelectedCanvasTextId(null);
                      setSelectedReactionArrowId(null);
                      setSelectedCanvasImageId(null);
                    }}
                    onClose={() => setShowObjectsPanel(false)}
                    variant={isCompactViewport ? 'sheet' : 'dock'}
                  />
                );
                return isCompactViewport ? (
                  <MobileBottomSheet
                    open
                    onClose={() => setShowObjectsPanel(false)}
                    title="Objects"
                    size="tall"
                    className="mobile-sheet--objects"
                  >
                    {objectsPanel}
                  </MobileBottomSheet>
                ) : (
                  objectsPanel
                );
              })()
            ) : null}
            <input
              ref={imageFileInputRef}
              type="file"
              accept={IMAGE_FILE_ACCEPT}
              style={{ display: 'none' }}
              onChange={e => {
                const file = e.currentTarget.files?.[0];
                e.currentTarget.value = '';
                if (file) void handleImageFile(file);
              }}
            />
          </div>
        }
        pane3D={
          show3DViewer ? (
            <Viewer3DErrorBoundary>
              <Viewer3DWorkspace
                backgroundColor={viewer3dBackground}
                structurePanel={
                  <Suspense
                    fallback={
                      <div className="viewer3d-panel viewer3d-panel--loading" aria-busy="true">
                        Loading 3D viewer…
                      </div>
                    }
                  >
                    <Molecule3DPanel
                      molblock={viewer3DMolblock}
                      moleculeTitle={viewer3DMoleculeTitle}
                      showHydrogens={viewer3DShowHydrogens}
                      onToggleHydrogens={setViewer3DShowHydrogens}
                      sourceLabel={viewer3DSource}
                      energyKcal={viewer3DEnergy}
                      computeStatus={viewer3DComputeStatus}
                      heavyAtomCount={viewer3DHeavyCount}
                      stereoHints={stereoHints3D}
                      stereoIssues={stereoIssues3D}
                      selectedAtomIndices={selected3DAtomIndices}
                      onAtomPick={handle3DAtomPick}
                      onRebuild3D={handleRebuild3D}
                      rebuildBusy={viewer3DComputeStatus === 'computing'}
                      onApplyOclConformer={handleApplyOclConformer}
                      onApplyMmff94={handleApplyMmff94}
                      onBeforeExport={requireExportSignup}
                      canExport={auth.signedIn}
                      backgroundColor={viewer3dBackground}
                      controlsAsSheet={isCompactViewport}
                    />
                  </Suspense>
                }
              />
            </Viewer3DErrorBoundary>
          ) : null
        }
      />
      </div>

      {isCompactViewport ? null : (
        <>
          <MoleculeStatusBar
            molecule={molecule}
            selectedAtomIds={selectedAtomIds}
            selectedCanvasShapeId={colorEditCanvasShapeId}
          />
          <SiteFooterHost />
        </>
      )}
      </div>

      {editingArrowReagent && inlineArrowReagentPos ? (
        <InlineArrowReagentEditor
          position={inlineArrowReagentPos}
          slot={editingArrowReagent.slot}
          draft={arrowReagentDraft}
          onDraftChange={setArrowReagentDraft}
          onCommit={commitReagentEdit}
          onCancel={cancelReagentEdit}
        />
      ) : null}

      {editingAtomAliasId && inlineAtomAliasPos && (
        <InlineAliasEditor
          ref={atomAliasInputRef}
          position={inlineAtomAliasPos}
          draft={editingAliasDraft}
          onDraftChange={setEditingAliasDraft}
          suggestions={aliasSuggestions}
          suggestIndex={aliasSuggestIndex}
          onSuggestIndexChange={setAliasSuggestIndex}
          focused={inlineAtomAliasFocused}
          onFocus={() => setInlineAtomAliasFocused(true)}
          onBlur={() => setInlineAtomAliasFocused(false)}
          activePreviewKey={activeAliasPreviewKey}
          setActivePreviewKey={setActiveAliasPreviewKey}
          activePreviewPinned={activeAliasPreviewPinned}
          setActivePreviewPinned={setActiveAliasPreviewPinned}
          error={atomAliasError}
          onCommit={commitAtomAlias}
          onCancel={cancelAtomAliasEdit}
        />
      )}

      {selectedCanvasText && inlineEditorPos && !canvasTextTransforming && (
        <InlineTextEditor
          ref={inlineTextareaRef}
          selectedCanvasText={selectedCanvasText}
          position={inlineEditorPos}
          onUpdate={handleUpdateCanvasText}
          onFocus={() => setInlineEditorFocused(true)}
          onBlur={() => setInlineEditorFocused(false)}
        />
      )}

      {showPubChem && (
        <Suspense fallback={null}>
        <PubChemSearch
          onImport={handlePubChemImport}
          onImportQuiet={handlePubChemImportQuiet}
          onClose={() => setShowPubChem(false)}
          batchPipeline={{
            runBatchPipeline: runBatchSmilesPipeline,
            onImportMolblockToCanvas: handleBatchImportMolblockOnly,
            onImportMolblocksToCanvas: handleBatchImportMolblocksToCanvas,
            onBeforeDownload: requireExportSignup,
          }}
        />
        </Suspense>
      )}

      <TemplateLibraryModal
        open={showTemplateLibrary}
        onClose={() => setShowTemplateLibrary(false)}
        initialTab={templateLibraryTab}
        onInsertAmino={handleBeginAminoPlacement}
        onInsertLigand={handleBeginLigandPlacement}
        onInsertStructure3D={handleBeginStructure3DPlacement}
        onInsertCof={id => {
          setShowTemplateLibrary(false);
          handleGenerateCofAndOrbit({
            presetId: id,
            cols: COF_PACK_DEFAULT,
            rows: COF_PACK_DEFAULT,
            layers: COF_LAYERS_DEFAULT,
            bondLengthPx: resolvedCanvasPreferences.bondLengthPx,
            cx: 0,
            cy: 0,
          });
        }}
        onInsertMof={id => {
          setShowTemplateLibrary(false);
          handleGenerateCofAndOrbit({
            presetId: id,
            cols: COF_PACK_DEFAULT,
            rows: COF_PACK_DEFAULT,
            layers: COF_LAYERS_DEFAULT,
            bondLengthPx: resolvedCanvasPreferences.bondLengthPx,
            cx: 0,
            cy: 0,
          });
        }}
        onInsertGraphene={opts => {
          setShowTemplateLibrary(false);
          const params = {
            cols: opts.cols,
            rows: opts.rows,
            shape: opts.shape,
            bondLengthPx: resolvedCanvasPreferences.bondLengthPx,
            oxidation: opts.oxidation,
            cx: 0,
            cy: 0,
          };
          const ids = handleGenerateGraphene(params);
          // The Arrange toolbar reopens the Graphene params panel for this sheet
          // (selection → sheet id) and grows it incrementally from these values.
          rememberGrapheneSheet(ids, params);
        }}
        onInsertDendrimer={id => {
          setShowTemplateLibrary(false);
          handleGenerateDendrimer({
            presetId: id,
            bondLengthPx: resolvedCanvasPreferences.bondLengthPx,
            cx: 0,
            cy: 0,
          });
        }}
        onInsertPolymer={id => {
          setShowTemplateLibrary(false);
          handleGeneratePolymer({
            presetId: id,
            bondLengthPx: resolvedCanvasPreferences.bondLengthPx,
            cx: 0,
            cy: 0,
          });
        }}
        onInsertReaction={handleInsertReactionTemplate}
        insertingReactionId={insertingReactionId}
        requestSmilesMolblock={requestTemplateSmilesMolblock}
      />

      <StereochemistryDialogs
        molecule={molecule}
        cipStereoTags={cipStereoTags}
        molblock3D={viewer3DMolblock}
        atomIndexTo2DId={viewer3DAtomIndexTo2DId}
        newmanBondId={newmanBondId}
        onCloseNewman={() => setNewmanBondId(null)}
        fischerChainAtomIds={fischerChainAtomIds}
        onCloseFischer={() => setFischerChainAtomIds(null)}
        chairBoatRingAtomIds={chairBoatRingAtomIds}
        onCloseChairBoat={() => setChairBoatRingAtomIds(null)}
        ezAnalyzerBondId={ezAnalyzerBondId}
        onCloseEZ={() => setEZAnalyzerBondId(null)}
      />

      {showInfoPanel && infoData && (
        <MoleculeInfoPanel
          data={infoData}
          pubchemImport={pubchemImport}
          selectionMatchesPubchemImport={selectionMatchesPubchemImport}
          onClose={closeInfoPanel}
          asSheet={isCompactViewport}
          onCopyText={text => {
            void navigator.clipboard.writeText(text);
          }}
        />
      )}

      {contextMenu && touchQuickMenu && fullMenuFor !== contextMenu && (
        <TouchQuickMenu
          key={`${contextMenu.x},${contextMenu.y}`}
          x={contextMenu.x}
          y={contextMenu.y}
          title={touchQuickMenu.title}
          items={touchQuickMenu.items}
          onMore={() => setFullMenuFor(contextMenu)}
          onDismiss={closeContextMenu}
        />
      )}

      {contextMenu && (!touchQuickMenu || fullMenuFor === contextMenu) && (
        <CanvasContextMenu
          key={`${contextMenu.x},${contextMenu.y},${contextMenu.atomId ?? ''},${contextMenu.bondId ?? ''}`}
          menu={contextMenu}
          molecule={molecule}
          selectedAtomIds={selectedAtomIds}
          selectedSruBracketId={selectedSruBracketId}
          detectedAliasAtCursor={contextAtomDetectedAlias}
          asSheet={isCompactViewport}
          onDismiss={closeContextMenu}
          onCopySmiles={gatedContextCopySmiles}
          onCopyAs={gatedCopyAs}
          onPasteSmiles={handleContextPasteSmiles}
          onHighlightColor={color => {
            const atomIds =
              selectedAtomIds.length > 0
                ? selectedAtomIds
                : contextMenu.atomId
                  ? [contextMenu.atomId]
                  : [];
            const bondIds =
              selectedBondIds.length > 0
                ? selectedBondIds
                : contextMenu.bondId
                  ? [contextMenu.bondId]
                  : [];
            if (atomIds.length === 0 && bondIds.length === 0) {
              closeContextMenu();
              return;
            }
            applyCommand(CMD.ApplyMarkupHighlight, {
              color,
              atomIds,
              bondIds,
            });
            closeContextMenu();
          }}
          onLaunchNewman={bondId => {
            setNewmanBondId(bondId);
            closeContextMenu();
          }}
          onLaunchEZ={bondId => {
            setEZAnalyzerBondId(bondId);
            closeContextMenu();
          }}
          onLaunchChairBoat={() => {
            setChairBoatRingAtomIds([...selectedAtomIds]);
            closeContextMenu();
          }}
          onLaunchFischer={() => {
            setFischerChainAtomIds([...selectedAtomIds]);
            closeContextMenu();
          }}
          onExpandAlias={handleContextExpandAlias}
          onCollapseToAlias={handleContextCollapseToAlias}
          onChangeAtomElement={handleContextChangeAtomElement}
          onSetAtomIsotope={handleContextSetAtomIsotope}
          onCustomAtomIsotope={handleContextCustomAtomIsotope}
          onEditAtomAlias={handleContextEditAtomAlias}
          onClearAtomAlias={handleContextClearAtomAlias}
          onSelectConnectedFragment={handleContextSelectConnectedFragment}
          onInvertStereoAtAtom={handleContextInvertStereoAtAtom}
          onSwapSelectedAtomPositions={handleContextSwapAtomPositions}
          onEditSruBracketSubscript={handleContextEditSruBracketSubscript}
          onDownload={gatedDownload}
          onAddExplicitHydrogen={handleContextAddExplicitHydrogen}
          onToggleAllExplicitHydrogens={() => {
            const unfolding = !molecule.atoms.some(a => a.element === 'H');
            handleToggleExplicitHydrogens({
              mode: unfolding ? 'unfold' : 'fold',
              cleanupAfter: unfolding,
            });
          }}
          hasExplicitHydrogens={molecule.atoms.some(a => a.element === 'H')}
          unfoldHydrogensDisabled={false}
          unfoldHydrogensTitle={
            molecule.atoms.some(a => a.element === 'H')
              ? 'Fold all explicit hydrogens'
              : 'Unfold all explicit hydrogens'
          }
          onToggleExplicitCarbonLabel={handleContextToggleExplicitCarbonLabel}
          onGroupSelection={handleContextGroupSelection}
          onUngroupSelection={handleContextUngroupSelection}
        />
      )}

      <UngroupConfirmModal
        open={ungroupConfirmOpen}
        onCancel={handleCancelUngroupConfirm}
        onConfirm={handleConfirmUngroup}
      />

      <ViewerLinkHint message={viewer3DLinkHint} />
    </>
    </PluginHostProvider>
    </I18nProvider>
  );
}

export default App;
