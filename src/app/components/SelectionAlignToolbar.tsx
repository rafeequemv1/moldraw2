/**
 * Align / distribute controls. Generate (circular / linear / dendrimer / grid)
 * is a click-only dropdown; parameter sliders open in a closable left-docked
 * params panel (bottom sheet on compact). Graphene lives in the Library — its
 * params panel opens here whenever a graphene sheet is selected.
 */
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignHorizontalSpaceAround,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  ArrowRightFromLine,
  ChevronDown,
  Circle,
  GitFork,
  LayoutGrid,
  RotateCw,
  type LucideIcon,
} from 'lucide-react';
import { MobileBottomSheet } from './MobileBottomSheet';
import { LeftParamsPanel } from './LeftParamsPanel';
import {
  GRAPHENE_DEFAULT_PARAMS,
  grapheneAnchorFromAtoms,
  grapheneSheetAtomIds,
  grapheneSheetIdForSelection,
  recallGrapheneSheet,
  rememberGrapheneSheet,
} from '../graphene/grapheneSession';
import type { Molecule } from '@moldraw/domain';
import type { InfiniteCanvasHandle } from '@moldraw/canvas/InfiniteCanvas';
import { useChromeOverlay } from '../chromeDismiss';
import type { Viewport } from '@moldraw/canvas/geometry';
import { getSelectionAabb } from '@moldraw/canvas/geometry';
import {
  selectedDocumentFragmentBoxes,
  suggestCircleArrangeRadius,
} from '@moldraw/core/align/selectionArrange';
import {
  DENDRIMER_FOLDS_MAX,
  DENDRIMER_FOLDS_MIN,
  suggestDendrimerFolds,
  suggestLinearSpacing,
  virtualAtomIdsForArray,
} from '@moldraw/core';
import { useI18n } from '../i18n';

export type SelectionArrangeAction =
  | 'alignTop'
  | 'alignCenter'
  | 'alignBottom'
  | 'alignLeft'
  | 'alignCenterX'
  | 'alignRight'
  | 'distributeHorizontal'
  | 'distributeVertical'
  | 'arrange'
  | 'layoutGrid'
  | 'layoutCircle';

export type SelectionArrangeOptions = {
  radius?: number;
};

export type CircularArrayParams = {
  atomIds: string[];
  count: number;
  radius: number;
  spacingDeg?: number;
  rotate: boolean;
  replaceAtomIds?: string[];
  /** Slider scrub: rewrite instance sites without an undo step. */
  live?: boolean;
  /** Pointer-up: commit the scrub as one undo entry. */
  commitLive?: boolean;
};

export type DendrimerArrayParams = {
  atomIds: string[];
  foldCount: number;
  live?: boolean;
  commitLive?: boolean;
};

export type LinearArrayParams = {
  atomIds: string[];
  count: number;
  spacingPx: number;
  rotate: boolean;
  replaceAtomIds?: string[];
  live?: boolean;
  commitLive?: boolean;
};

export type GrapheneGenerateParams = {
  cols: number;
  rows: number;
  shape: 'rectangular' | 'circular';
  bondLengthPx: number;
  cx: number;
  cy: number;
  /** `rgo` = reduced graphene oxide (residual –OH / –COOH / epoxide groups). */
  oxidation?: 'none' | 'rgo';
  replaceAtomIds?: string[];
};

type GenerateMode = 'circular' | 'linear' | 'grid' | 'graphene' | 'dendrimer';

type LiveOverrides = {
  radius?: number;
  count?: number;
  spacingDeg?: number;
  useAutoSpacing?: boolean;
  rotate?: boolean;
  grapheneCols?: number;
  grapheneRows?: number;
  grapheneShape?: 'rectangular' | 'circular';
  grapheneOxidation?: 'none' | 'rgo';
  bondLength?: number;
  foldCount?: number;
  spacingPx?: number;
};

type GenerateSession = {
  seedAtomIds: string[];
  newAtomIds: string[];
  mode: GenerateMode;
  /** Pinned world center so live param tweaks do not drift the result. */
  anchorCx?: number;
  anchorCy?: number;
};

const ACTIONS: {
  id: SelectionArrangeAction;
  title: string;
  Icon: typeof AlignStartVertical;
}[] = [
  { id: 'alignLeft', title: 'Align left', Icon: AlignStartVertical },
  { id: 'alignCenterX', title: 'Align on vertical centres', Icon: AlignCenterVertical },
  { id: 'alignRight', title: 'Align right', Icon: AlignEndVertical },
  { id: 'alignTop', title: 'Align top', Icon: AlignStartHorizontal },
  { id: 'alignCenter', title: 'Align on horizontal centres', Icon: AlignCenterHorizontal },
  { id: 'alignBottom', title: 'Align bottom', Icon: AlignEndHorizontal },
  {
    id: 'distributeHorizontal',
    title: 'Distribute horizontally',
    Icon: AlignHorizontalDistributeCenter,
  },
  {
    id: 'distributeVertical',
    title: 'Distribute vertically',
    Icon: AlignVerticalDistributeCenter,
  },
  {
    id: 'arrange',
    title: 'Arrange',
    Icon: AlignHorizontalSpaceAround,
  },
];

const GENERATE_MODES: { id: GenerateMode; label: string; title?: string; Icon: LucideIcon }[] = [
  { id: 'circular', label: 'Circular', Icon: Circle },
  { id: 'linear', label: 'Linear array', Icon: ArrowRightFromLine },
  {
    id: 'dendrimer',
    label: 'Dendrimer',
    title: 'Select the core first (it is not copied). Then draw one branch — copies appear on the other folds.',
    Icon: GitFork,
  },
  { id: 'grid', label: 'Grid', Icon: LayoutGrid },
];

const SPACING_MIN = 20;
const SPACING_MAX = 400;
const RADIUS_MIN = 40;
const RADIUS_MAX = 800;
const COUNT_MIN = 2;
const COUNT_MAX = 36;
const COUNT_DEFAULT = 6;
const SPACING_DEG_MIN = 10;
const SPACING_DEG_MAX = 180;
const GRAPHENE_COLS_DEFAULT = 4;
const GRAPHENE_ROWS_DEFAULT = 3;
const GRAPHENE_SIZE_MAX = 12;
const BOND_LEN_MIN = 24;
const BOND_LEN_MAX = 64;
const BOND_LEN_DEFAULT = 40;
const LIVE_DEBOUNCE_MS = 90;

export interface SelectionAlignToolbarProps {
  visible: boolean;
  molecule: Molecule;
  selectionAtomIds: string[];
  viewport: Viewport;
  canvasRef: RefObject<InfiniteCanvasHandle | null>;
  onArrange: (action: SelectionArrangeAction, options?: SelectionArrangeOptions) => void;
  onCircularArray?: (params: CircularArrayParams) => string[] | void;
  onLinearArray?: (params: LinearArrayParams) => string[] | void;
  onDendrimerArray?: (params: DendrimerArrayParams) => string[] | void;
  onGenerateGraphene?: (params: GrapheneGenerateParams) => string[] | void;
  variant?: 'floating' | 'topbar';
  /** Compact: one Arrange control → bottom sheet (no topbar icon sprawl). */
  isCompact?: boolean;
}

export function SelectionAlignToolbar({
  visible,
  molecule,
  selectionAtomIds,
  viewport,
  canvasRef,
  onArrange,
  onCircularArray,
  onLinearArray,
  onDendrimerArray,
  onGenerateGraphene,
  variant = 'floating',
  isCompact = false,
}: SelectionAlignToolbarProps) {
  const { t } = useI18n();
  const [arrangeSheetOpen, setArrangeSheetOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);
  const boxes = useMemo(
    () => selectedDocumentFragmentBoxes(molecule, selectionAtomIds),
    [molecule, selectionAtomIds],
  );
  const fragmentCount = boxes.length;
  const canDistribute = fragmentCount >= 2;
  const canArray = selectionAtomIds.length > 0 && fragmentCount >= 1;
  const suggestedRadius = useMemo(() => {
    if (canDistribute) return Math.round(suggestCircleArrangeRadius(boxes));
    if (canArray) {
      const box = boxes[0]!;
      const dim = Math.max(box.maxX - box.minX, box.maxY - box.minY, 40);
      return Math.round(Math.max(RADIUS_MIN, Math.min(RADIUS_MAX, dim + 40)));
    }
    return 120;
  }, [boxes, canArray, canDistribute]);
  const suggestedLinearSpacing = useMemo(
    () => suggestLinearSpacing(molecule, selectionAtomIds),
    [molecule, selectionAtomIds],
  );
  const selectionKey = selectionAtomIds.slice().sort().join('|');
  const [circleRadius, setCircleRadius] = useState(suggestedRadius);
  const [arrayCount, setArrayCount] = useState(COUNT_DEFAULT);
  const [linearSpacing, setLinearSpacing] = useState(suggestedLinearSpacing);
  const [spacingDeg, setSpacingDeg] = useState(60);
  const [useAutoSpacing, setUseAutoSpacing] = useState(true);
  const [rotateCopies, setRotateCopies] = useState(true);
  const [dendrimerFolds, setDendrimerFolds] = useState(6);
  const [grapheneCols, setGrapheneCols] = useState(GRAPHENE_COLS_DEFAULT);
  const [grapheneRows, setGrapheneRows] = useState(GRAPHENE_ROWS_DEFAULT);
  const [grapheneShape, setGrapheneShape] = useState<'rectangular' | 'circular'>('rectangular');
  const [grapheneOxidation, setGrapheneOxidation] = useState<'none' | 'rgo'>('none');
  const [bondLength, setBondLength] = useState(BOND_LEN_DEFAULT);
  const [generateMode, setGenerateMode] = useState<GenerateMode>('circular');
  const [menuOpen, setMenuOpen] = useState(false);
  useChromeOverlay(menuOpen, () => setMenuOpen(false));
  const [generateActive, setGenerateActive] = useState(false);
  /** User closed the params panel; reopens on the next mode pick / selection change. */
  const [paramsDismissed, setParamsDismissed] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<GenerateSession | null>(null);
  const liveTimerRef = useRef<number | null>(null);
  const liveRafRef = useRef<number | null>(null);
  const pendingCircularRef = useRef<LiveOverrides | null>(null);
  const prevSelectionKeyRef = useRef(selectionKey);
  const skipLiveRef = useRef(false);

  useEffect(() => {
    if (prevSelectionKeyRef.current === selectionKey) return;
    const session = sessionRef.current;
    const stillInSession =
      session &&
      (session.mode === 'graphene'
        ? selectionAtomIds.length > 0 &&
          selectionAtomIds.every(id => session.newAtomIds.includes(id))
        : selectionAtomIds.length > 0 &&
          selectionAtomIds.every(
            id => session.seedAtomIds.includes(id) || session.newAtomIds.includes(id),
          ));
    prevSelectionKeyRef.current = selectionKey;
    if (!stillInSession) {
      // Graphene sheet (from the Library or an earlier session) selected → reopen its params panel.
      const grSheet = grapheneSheetIdForSelection(selectionAtomIds);
      if (grSheet) {
        const sheetIds = grapheneSheetAtomIds(molecule, grSheet);
        const remembered = recallGrapheneSheet(grSheet);
        const anchor =
          remembered
            ? { cx: remembered.cx, cy: remembered.cy }
            : grapheneAnchorFromAtoms(molecule, grSheet) ?? sheetCenter();
        sessionRef.current = {
          seedAtomIds: [],
          newAtomIds: sheetIds,
          mode: 'graphene',
          anchorCx: anchor.cx,
          anchorCy: anchor.cy,
        };
        skipLiveRef.current = true;
        const p = remembered ?? GRAPHENE_DEFAULT_PARAMS;
        setGrapheneCols(p.cols);
        setGrapheneRows(p.rows);
        setGrapheneShape(p.shape);
        setGrapheneOxidation(p.oxidation);
        setBondLength(p.bondLengthPx);
        setGenerateMode('graphene');
        setGenerateActive(true);
        setParamsDismissed(false);
        setMenuOpen(false);
        return;
      }
      const arr = molecule.instanceArrays?.find(
        a =>
          a.circular &&
          (a.seedAtomIds.some(id => selectionAtomIds.includes(id)) ||
            selectionAtomIds.some(id => id.startsWith(`ia:${a.id}:`))),
      );
      const dend = molecule.instanceArrays?.find(
        a =>
          a.dendrimer &&
          (a.seedAtomIds.some(id => selectionAtomIds.includes(id)) ||
            a.dendrimer.coreAtomIds.some(id => selectionAtomIds.includes(id)) ||
            selectionAtomIds.some(id => id.startsWith(`ia:${a.id}:`))),
      );
      if (dend?.dendrimer) {
        sessionRef.current = {
          seedAtomIds: [...dend.dendrimer.coreAtomIds],
          newAtomIds: [...dend.seedAtomIds, ...virtualAtomIdsForArray(dend)],
          mode: 'dendrimer',
        };
        skipLiveRef.current = true;
        setDendrimerFolds(dend.dendrimer.foldCount);
        setGenerateMode('dendrimer');
        setGenerateActive(true);
        setMenuOpen(false);
        return;
      }
      if (arr?.circular) {
        sessionRef.current = {
          seedAtomIds: arr.seedAtomIds,
          newAtomIds: virtualAtomIdsForArray(arr),
          mode: 'circular',
        };
        skipLiveRef.current = true;
        setCircleRadius(Math.round(arr.circular.radius));
        setArrayCount(arr.circular.count);
        setSpacingDeg(arr.circular.spacingDeg ?? Math.round(360 / arr.circular.count));
        setUseAutoSpacing(arr.circular.spacingDeg == null);
        setRotateCopies(arr.circular.rotate);
        setGenerateMode('circular');
        setGenerateActive(true);
        setMenuOpen(false);
        return;
      }
      const lin = molecule.instanceArrays?.find(
        a =>
          a.linear &&
          (a.seedAtomIds.some(id => selectionAtomIds.includes(id)) ||
            selectionAtomIds.some(id => id.startsWith(`ia:${a.id}:`))),
      );
      if (lin?.linear) {
        sessionRef.current = {
          seedAtomIds: lin.seedAtomIds,
          newAtomIds: virtualAtomIdsForArray(lin),
          mode: 'linear',
        };
        skipLiveRef.current = true;
        setArrayCount(lin.linear.count);
        setLinearSpacing(Math.round(lin.linear.spacingPx));
        setRotateCopies(lin.linear.rotate);
        setGenerateMode('linear');
        setGenerateActive(true);
        setMenuOpen(false);
        return;
      }
      sessionRef.current = null;
      skipLiveRef.current = true;
      setCircleRadius(suggestedRadius);
      setArrayCount(COUNT_DEFAULT);
      setSpacingDeg(60);
      setUseAutoSpacing(true);
      setRotateCopies(true);
      setDendrimerFolds(suggestDendrimerFolds(molecule, selectionAtomIds));
      setGrapheneCols(GRAPHENE_COLS_DEFAULT);
      setGrapheneRows(GRAPHENE_ROWS_DEFAULT);
      setGrapheneShape('rectangular');
      setGrapheneOxidation('none');
      setBondLength(BOND_LEN_DEFAULT);
      setLinearSpacing(suggestedLinearSpacing);
      setMenuOpen(false);
      setGenerateActive(false);
      setParamsDismissed(false);
    }
  }, [selectionKey, selectionAtomIds, suggestedRadius, molecule.instanceArrays]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const el = menuRef.current;
      if (el && !el.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  useLayoutEffect(() => {
    if (variant === 'topbar') {
      setAnchor(null);
      return;
    }
    if (!visible || selectionAtomIds.length === 0) {
      setAnchor(null);
      return;
    }
    const canvas = canvasRef.current?.getCanvas();
    const vp = canvasRef.current?.getViewport() ?? viewport;
    if (!canvas) return;
    const aabb = getSelectionAabb(molecule, selectionAtomIds);
    if (!aabb) {
      setAnchor(null);
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const cx = aabb.cx * vp.zoom + canvas.width / 2 + vp.x;
    const minY = aabb.minY * vp.zoom + canvas.height / 2 + vp.y;
    setAnchor({ left: rect.left + cx, top: rect.top + minY });
  }, [visible, molecule, selectionAtomIds, viewport, canvasRef, variant]);

  const sheetCenter = () => {
    if (selectionAtomIds.length > 0) {
      const aabb = getSelectionAabb(molecule, selectionAtomIds);
      if (aabb) return { cx: aabb.cx, cy: aabb.cy };
    }
    return { cx: 0, cy: 0 };
  };

  const seedAtomIds = () => {
    const session = sessionRef.current;
    if (session?.seedAtomIds.length) return session.seedAtomIds;
    return selectionAtomIds;
  };

  const applyLive = (
    mode: GenerateMode = generateMode,
    overrides?: LiveOverrides,
    flags?: { live?: boolean },
  ) => {
    const replaceAtomIds = sessionRef.current?.newAtomIds;

    if (mode === 'graphene') {
      if (!onGenerateGraphene) return;
      const session = sessionRef.current;
      const center =
        session?.mode === 'graphene' &&
        typeof session.anchorCx === 'number' &&
        typeof session.anchorCy === 'number'
          ? { cx: session.anchorCx, cy: session.anchorCy }
          : sheetCenter();
      const cols = Math.max(1, Math.min(GRAPHENE_SIZE_MAX, overrides?.grapheneCols ?? grapheneCols));
      const rows = Math.max(1, Math.min(GRAPHENE_SIZE_MAX, overrides?.grapheneRows ?? grapheneRows));
      const shape = overrides?.grapheneShape ?? grapheneShape;
      const oxidation = overrides?.grapheneOxidation ?? grapheneOxidation;
      const bondLengthPx = overrides?.bondLength ?? bondLength;
      setGrapheneCols(cols);
      setGrapheneRows(rows);
      setGrapheneShape(shape);
      setGrapheneOxidation(oxidation);
      const newIds = onGenerateGraphene({
        cols,
        rows,
        shape,
        bondLengthPx,
        oxidation,
        cx: center.cx,
        cy: center.cy,
        replaceAtomIds,
      });
      const ids = Array.isArray(newIds) ? newIds : [];
      rememberGrapheneSheet(ids, {
        cols,
        rows,
        shape,
        bondLengthPx,
        oxidation,
        cx: center.cx,
        cy: center.cy,
      });
      sessionRef.current = {
        seedAtomIds: [],
        newAtomIds: ids,
        mode: 'graphene',
        anchorCx: center.cx,
        anchorCy: center.cy,
      };
      return;
    }

    if (!canArray && mode !== 'grid') return;
    const seed = seedAtomIds();
    const prev = sessionRef.current;

    if (mode === 'grid') {
      if (!canDistribute) return;
      onArrange('layoutGrid');
      sessionRef.current = { seedAtomIds: seed, newAtomIds: [], mode: 'grid' };
      return;
    }

    if (mode === 'circular') {
      if (!onCircularArray || seed.length === 0) return;
      const r = Math.max(RADIUS_MIN, Math.min(RADIUS_MAX, overrides?.radius ?? circleRadius));
      const c = Math.max(COUNT_MIN, Math.min(COUNT_MAX, overrides?.count ?? arrayCount));
      setCircleRadius(r);
      setArrayCount(c);
      const rot = overrides?.rotate ?? rotateCopies;
      const auto = overrides?.useAutoSpacing ?? useAutoSpacing;
      const deg = overrides?.spacingDeg ?? spacingDeg;
      const newIds = onCircularArray({
        atomIds: seed,
        count: c,
        radius: r,
        ...(!auto ? { spacingDeg: deg } : {}),
        rotate: rot,
        replaceAtomIds,
        ...(flags?.live ? { live: true } : {}),
      });
      sessionRef.current = {
        seedAtomIds: seed,
        newAtomIds: Array.isArray(newIds) ? newIds : [],
        mode: 'circular',
        anchorCx: prev?.mode === 'circular' ? prev.anchorCx : undefined,
        anchorCy: prev?.mode === 'circular' ? prev.anchorCy : undefined,
      };
      return;
    }

    if (mode === 'linear') {
      if (!onLinearArray || seed.length === 0) return;
      const c = Math.max(COUNT_MIN, Math.min(COUNT_MAX, overrides?.count ?? arrayCount));
      const spacing = Math.max(
        SPACING_MIN,
        Math.min(SPACING_MAX, overrides?.spacingPx ?? linearSpacing),
      );
      setArrayCount(c);
      setLinearSpacing(spacing);
      const rot = overrides?.rotate ?? rotateCopies;
      const newIds = onLinearArray({
        atomIds: seed,
        count: c,
        spacingPx: spacing,
        rotate: rot,
        replaceAtomIds,
        ...(flags?.live ? { live: true } : {}),
      });
      sessionRef.current = {
        seedAtomIds: seed,
        newAtomIds: Array.isArray(newIds) ? newIds : [],
        mode: 'linear',
      };
      return;
    }

    if (mode === 'dendrimer') {
      if (!onDendrimerArray || seed.length === 0) return;
      const folds = Math.max(
        DENDRIMER_FOLDS_MIN,
        Math.min(DENDRIMER_FOLDS_MAX, overrides?.foldCount ?? dendrimerFolds),
      );
      setDendrimerFolds(folds);
      const newIds = onDendrimerArray({
        atomIds: seed,
        foldCount: folds,
        ...(flags?.live ? { live: true } : {}),
      });
      sessionRef.current = {
        seedAtomIds: seed,
        newAtomIds: Array.isArray(newIds) ? newIds : [],
        mode: 'dendrimer',
      };
    }
  };

  const scheduleLive = (mode: GenerateMode = generateMode, overrides?: LiveOverrides) => {
    if (skipLiveRef.current) {
      skipLiveRef.current = false;
      return;
    }
    if (!generateActive && !sessionRef.current) return;
    if (mode === 'circular' || mode === 'dendrimer' || mode === 'linear') {
      pendingCircularRef.current = { ...pendingCircularRef.current, ...overrides };
      if (liveRafRef.current != null) return;
      liveRafRef.current = window.requestAnimationFrame(() => {
        liveRafRef.current = null;
        const next = pendingCircularRef.current;
        pendingCircularRef.current = null;
        applyLive(mode, next ?? undefined, { live: true });
      });
      return;
    }
    if (liveTimerRef.current != null) window.clearTimeout(liveTimerRef.current);
    liveTimerRef.current = window.setTimeout(() => {
      liveTimerRef.current = null;
      applyLive(mode, overrides);
    }, LIVE_DEBOUNCE_MS);
  };

  const endCircularGesture = () => {
    if (liveRafRef.current != null) {
      window.cancelAnimationFrame(liveRafRef.current);
      liveRafRef.current = null;
    }
    const pending = pendingCircularRef.current;
    pendingCircularRef.current = null;
    if (pending) applyLive('circular', pending, { live: true });
    const seed = seedAtomIds();
    if (!onCircularArray || seed.length === 0) return;
    onCircularArray({
      atomIds: seed,
      count: arrayCount,
      radius: circleRadius,
      ...(!useAutoSpacing ? { spacingDeg } : {}),
      rotate: rotateCopies,
      commitLive: true,
    });
  };

  const endDendrimerGesture = () => {
    if (liveRafRef.current != null) {
      window.cancelAnimationFrame(liveRafRef.current);
      liveRafRef.current = null;
    }
    const pending = pendingCircularRef.current;
    pendingCircularRef.current = null;
    if (pending) applyLive('dendrimer', pending, { live: true });
    const seed = seedAtomIds();
    if (!onDendrimerArray || seed.length === 0) return;
    onDendrimerArray({
      atomIds: seed,
      foldCount: dendrimerFolds,
      commitLive: true,
    });
  };

  const endLinearGesture = () => {
    if (liveRafRef.current != null) {
      window.cancelAnimationFrame(liveRafRef.current);
      liveRafRef.current = null;
    }
    const pending = pendingCircularRef.current;
    pendingCircularRef.current = null;
    if (pending) applyLive('linear', pending, { live: true });
    const seed = seedAtomIds();
    if (!onLinearArray || seed.length === 0) return;
    onLinearArray({
      atomIds: seed,
      count: arrayCount,
      spacingPx: linearSpacing,
      rotate: rotateCopies,
      commitLive: true,
    });
  };

  useEffect(
    () => () => {
      if (liveTimerRef.current != null) window.clearTimeout(liveTimerRef.current);
      if (liveRafRef.current != null) window.cancelAnimationFrame(liveRafRef.current);
    },
    [],
  );

  if (!visible) return null;
  if (variant === 'floating' && !anchor) return null;

  const selectMode = (mode: GenerateMode) => {
    setGenerateMode(mode);
    setGenerateActive(true);
    setParamsDismissed(false);
    setMenuOpen(false);
    setArrangeSheetOpen(false);
    applyLive(mode);
  };

  const buttons = (canDistribute ? ACTIONS : []).map(({ id, title, Icon }, index) => {
    const sepBefore = index === 3 || index === 6 || index === 8;
    const tooltip = id === 'arrange' ? t('alignBar.arrangeTitle') : title;
    return (
      <span key={id} className="selection-align-toolbar__item">
        {sepBefore ? <span className="selection-align-toolbar__sep" aria-hidden /> : null}
        <button
          type="button"
          className="selection-align-toolbar__btn"
          title={tooltip}
          aria-label={tooltip}
          onClick={() => onArrange(id)}
        >
          <Icon size={16} strokeWidth={2} aria-hidden />
        </button>
      </span>
    );
  });

  const slider = (
    label: string,
    title: string,
    value: number,
    min: number,
    max: number,
    step: number,
    onChange: (n: number) => void,
    display?: string,
    gesture?: { onEnd?: () => void },
  ) => (
    <label className="selection-align-toolbar__slider" title={title}>
      <span className="selection-align-toolbar__slider-label">{label}</span>
      <input
        type="range"
        className="chrome-range selection-align-toolbar__range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={title}
        onChange={e => onChange(Number(e.target.value))}
        onPointerUp={gesture?.onEnd}
        onPointerCancel={gesture?.onEnd}
      />
      <span className="selection-align-toolbar__slider-value">{display ?? value}</span>
    </label>
  );

  const activeModeLabel =
    GENERATE_MODES.find(m => m.id === generateMode)?.label ?? 'Generate';
  const showTopParams = generateActive;

  const topBarParams =
    showTopParams && generateMode === 'circular' ? (
      <span className="selection-align-toolbar__pattern-top-params" aria-label="Circular options">
        {slider(
          'R',
          'Circle radius',
          circleRadius,
          RADIUS_MIN,
          RADIUS_MAX,
          10,
          n => {
            setCircleRadius(n);
            scheduleLive('circular', { radius: n });
          },
          undefined,
          { onEnd: endCircularGesture },
        )}
        {slider(
          'N',
          'Array count',
          arrayCount,
          COUNT_MIN,
          COUNT_MAX,
          1,
          n => {
            setArrayCount(n);
            scheduleLive('circular', { count: n });
          },
          undefined,
          { onEnd: endCircularGesture },
        )}
        {slider(
          '°',
          useAutoSpacing ? 'Angular spacing (auto — drag to set fixed °)' : 'Angular spacing degrees',
          useAutoSpacing ? Math.round(360 / arrayCount) : spacingDeg,
          SPACING_DEG_MIN,
          SPACING_DEG_MAX,
          5,
          n => {
            setUseAutoSpacing(false);
            setSpacingDeg(n);
            scheduleLive('circular', { spacingDeg: n, useAutoSpacing: false });
          },
          useAutoSpacing ? 'auto' : String(spacingDeg),
          { onEnd: endCircularGesture },
        )}
        <button
          type="button"
          className={
            rotateCopies
              ? 'selection-align-toolbar__btn selection-align-toolbar__btn--active'
              : 'selection-align-toolbar__btn'
          }
          title={rotateCopies ? 'Rotate copies (on)' : 'Keep copies upright'}
          aria-pressed={rotateCopies}
          onClick={() => {
            const next = !rotateCopies;
            setRotateCopies(next);
            scheduleLive('circular', { rotate: next });
          }}
        >
          <RotateCw size={14} strokeWidth={2} aria-hidden />
        </button>
      </span>
    ) : showTopParams && generateMode === 'linear' ? (
      <span className="selection-align-toolbar__pattern-top-params" aria-label="Linear array options">
        {slider(
          'N',
          'Array count',
          arrayCount,
          COUNT_MIN,
          COUNT_MAX,
          1,
          n => {
            setArrayCount(n);
            scheduleLive('linear', { count: n });
          },
          undefined,
          { onEnd: endLinearGesture },
        )}
        {slider(
          'Δ',
          'Center-to-center spacing',
          linearSpacing,
          SPACING_MIN,
          SPACING_MAX,
          4,
          n => {
            setLinearSpacing(n);
            scheduleLive('linear', { spacingPx: n });
          },
          undefined,
          { onEnd: endLinearGesture },
        )}
      </span>
    ) : showTopParams && generateMode === 'dendrimer' ? (
      <span className="selection-align-toolbar__pattern-top-params" aria-label="Dendrimer options">
        {slider(
          'N',
          'Fold count (radial copies of the parent branch)',
          dendrimerFolds,
          DENDRIMER_FOLDS_MIN,
          DENDRIMER_FOLDS_MAX,
          1,
          n => {
            setDendrimerFolds(n);
            scheduleLive('dendrimer', { foldCount: n });
          },
          undefined,
          { onEnd: endDendrimerGesture },
        )}
      </span>
    ) : showTopParams && generateMode === 'graphene' ? (
      <span className="selection-align-toolbar__pattern-top-params" aria-label="Graphene options">
        <button
          type="button"
          className={
            grapheneShape === 'rectangular'
              ? 'selection-align-toolbar__btn selection-align-toolbar__btn--active'
              : 'selection-align-toolbar__btn'
          }
          title="Rectangular HCP sheet"
          aria-pressed={grapheneShape === 'rectangular'}
          onClick={() => scheduleLive('graphene', { grapheneShape: 'rectangular' })}
        >
          Rect
        </button>
        <button
          type="button"
          className={
            grapheneShape === 'circular'
              ? 'selection-align-toolbar__btn selection-align-toolbar__btn--active'
              : 'selection-align-toolbar__btn'
          }
          title="Circular flake"
          aria-pressed={grapheneShape === 'circular'}
          onClick={() => scheduleLive('graphene', { grapheneShape: 'circular' })}
        >
          Circle
        </button>
        {slider(
          'W',
          grapheneShape === 'circular' ? 'Diameter (hexes)' : 'Columns',
          grapheneCols,
          1,
          GRAPHENE_SIZE_MAX,
          1,
          n => {
            setGrapheneCols(n);
            scheduleLive('graphene', { grapheneCols: n });
          },
        )}
        {grapheneShape === 'rectangular'
          ? slider('H', 'Rows', grapheneRows, 1, GRAPHENE_SIZE_MAX, 1, n => {
              setGrapheneRows(n);
              scheduleLive('graphene', { grapheneRows: n });
            })
          : null}
        {slider('a', 'C–C bond length', bondLength, BOND_LEN_MIN, BOND_LEN_MAX, 2, n => {
          setBondLength(n);
          scheduleLive('graphene', { bondLength: n });
        })}
        <label
          className="selection-align-toolbar__toggle"
          title="Reduced graphene oxide: sparse residual edge –OH / –COOH, basal –OH and epoxide (C–O–C) groups, C/O ≈ 10"
        >
          <input
            type="checkbox"
            className="selection-align-toolbar__toggle-input"
            checked={grapheneOxidation === 'rgo'}
            onChange={e => {
              const next = e.target.checked ? 'rgo' : 'none';
              setGrapheneOxidation(next);
              scheduleLive('graphene', { grapheneOxidation: next });
            }}
          />
          <span className="selection-align-toolbar__toggle-track" aria-hidden />
          <span className="selection-align-toolbar__toggle-label">Reduced graphene oxide (rGO)</span>
        </label>
      </span>
    ) : null;

  const paramsPanelTitle =
    generateMode === 'graphene'
      ? grapheneOxidation === 'rgo'
        ? 'Reduced graphene oxide'
        : 'Graphene'
      : `${activeModeLabel} options`;

  const paramsPanel =
    topBarParams && !paramsDismissed ? (
      <LeftParamsPanel
        title={paramsPanelTitle}
        onClose={() => setParamsDismissed(true)}
        className="left-params-panel--generate"
        slot={1}
      >
        {topBarParams}
      </LeftParamsPanel>
    ) : null;

  const generatePanel = (
    <>
      <div className="selection-align-toolbar__pattern app-top-bar__file-wrap" ref={menuRef}>
        {(canDistribute || canArray) && buttons.length > 0 ? (
          <span className="selection-align-toolbar__sep" aria-hidden />
        ) : null}
        <button
          type="button"
          className={`app-top-bar__file-btn app-top-bar__file-btn--icon ${menuOpen ? 'app-top-bar__file-btn--open' : ''}${generateActive ? ' app-top-bar__file-btn--active' : ''}`}
          title={
            generateActive
              ? `Generate — ${activeModeLabel}`
              : 'Generate — circular, linear, dendrimer, grid (graphene: Library)'
          }
          aria-label="Generate"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(v => !v)}
        >
          <svg
            width="18"
            height="16"
            viewBox="0 0 18 16"
            aria-hidden
            className="selection-align-toolbar__generate-icon"
          >
            <polygon
              points="4.5,1.2 7.4,2.9 7.4,6.3 4.5,8 1.6,6.3 1.6,2.9"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.15"
              strokeLinejoin="round"
            />
            <polygon
              points="13.5,1.2 16.4,2.9 16.4,6.3 13.5,8 10.6,6.3 10.6,2.9"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.15"
              strokeLinejoin="round"
            />
            <polygon
              points="9,7.2 11.9,8.9 11.9,12.3 9,14 6.1,12.3 6.1,8.9"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.15"
              strokeLinejoin="round"
            />
          </svg>
          <ChevronDown size={10} strokeWidth={2.5} aria-hidden />
        </button>
        {menuOpen ? (
          <div
            className="app-top-bar__file-menu selection-align-toolbar__pattern-menu"
            role="menu"
            aria-label="Generate modes"
          >
            {GENERATE_MODES.map(mode => {
              const Icon = mode.Icon;
              return (
                <button
                  key={mode.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={generateActive && generateMode === mode.id}
                  className={
                    generateActive && generateMode === mode.id
                      ? 'app-top-bar__file-menu-item selection-align-toolbar__pattern-item--on'
                      : 'app-top-bar__file-menu-item'
                  }
                  title={mode.title ?? mode.label}
                  onClick={() => selectMode(mode.id)}
                >
                  <Icon size={14} strokeWidth={2} aria-hidden />
                  <span className="app-top-bar__file-menu-label">{mode.label}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
      {paramsPanel}
    </>
  );

  const arrangeSheet = (
    <MobileBottomSheet
      open={arrangeSheetOpen}
      onClose={() => setArrangeSheetOpen(false)}
      title="Arrange"
      size="peek"
      dimBackdrop={false}
      className="mobile-sheet--arrange"
      ariaLabel="Arrange and generate"
    >
      <div className="mobile-sheet-arrange__section">
        {canDistribute ? (
        <>
        <span className="mobile-sheet-arrange__label">Align & distribute</span>
        <div className="mobile-sheet-arrange__grid">
          {ACTIONS.map(({ id, title, Icon }) => {
            const label = id === 'arrange' ? t('alignBar.arrange') : title.replace(/^Align /, '').replace(/^Distribute /, 'Dist. ');
            const tooltip = id === 'arrange' ? t('alignBar.arrangeTitle') : title;
            return (
              <button
                key={id}
                type="button"
                className="mobile-sheet-arrange__btn"
                title={tooltip}
                onClick={() => {
                  onArrange(id);
                  setArrangeSheetOpen(false);
                }}
              >
                <Icon size={18} strokeWidth={2} aria-hidden />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
        </>
        ) : null}
      </div>
      <div className="mobile-sheet-arrange__section">
        <span className="mobile-sheet-arrange__label">Generate</span>
        <div className="mobile-sheet-arrange__list">
          {GENERATE_MODES.map(mode => {
            const Icon = mode.Icon;
            return (
              <button
                key={mode.id}
                type="button"
                className={
                  generateActive && generateMode === mode.id
                    ? 'mobile-sheet-arrange__list-btn mobile-sheet-arrange__list-btn--on'
                    : 'mobile-sheet-arrange__list-btn'
                }
                title={mode.title}
                onClick={() => {
                  selectMode(mode.id);
                }}
              >
                <Icon size={16} strokeWidth={2} aria-hidden />
                <span className="mobile-sheet-arrange__list-title">{mode.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      {topBarParams && paramsDismissed ? (
        <div className="mobile-sheet-arrange__section">
          <button
            type="button"
            className="mobile-sheet-arrange__list-btn"
            onClick={() => {
              setParamsDismissed(false);
              setArrangeSheetOpen(false);
            }}
          >
            <span className="mobile-sheet-arrange__list-title">Show {paramsPanelTitle} sliders</span>
          </button>
        </div>
      ) : null}
    </MobileBottomSheet>
  );

  if (variant === 'topbar' && isCompact) {
    return (
      <>
        <div
          className="selection-align-toolbar selection-align-toolbar--topbar selection-align-toolbar--compact"
          role="toolbar"
          aria-label="Arrange"
          onPointerDown={e => e.stopPropagation()}
        >
          <button
            type="button"
            className={`app-top-bar__file-btn app-top-bar__file-btn--icon${generateActive || arrangeSheetOpen ? ' app-top-bar__file-btn--active' : ''}`}
            title="Arrange — align, distribute, generate"
            aria-label="Arrange"
            aria-haspopup="dialog"
            aria-expanded={arrangeSheetOpen}
            onClick={() => setArrangeSheetOpen(true)}
          >
            <LayoutGrid size={16} strokeWidth={2} aria-hidden />
            <span className="selection-align-toolbar__arrange-label">Arrange</span>
          </button>
        </div>
        {arrangeSheet}
        {arrangeSheetOpen ? null : paramsPanel}
      </>
    );
  }

  if (variant === 'topbar') {
    return (
      <div
        className="selection-align-toolbar selection-align-toolbar--topbar"
        role="toolbar"
        aria-label="Align and generate"
        onPointerDown={e => e.stopPropagation()}
      >
        {visible ? buttons : null}
        {generatePanel}
      </div>
    );
  }

  return (
    <div
      className="selection-align-toolbar"
      role="toolbar"
      aria-label="Align and generate"
      style={{ left: anchor!.left, top: anchor!.top }}
      onPointerDown={e => e.stopPropagation()}
    >
      {canDistribute || canArray ? buttons : null}
      {generatePanel}
    </div>
  );
}
