import { useEffect, useRef } from 'react';
import type { Molecule } from '@moldraw/domain';
import { resolveCanvasPreferences } from '@moldraw/core/canvasPreferences';
import { getMoleculeRevisionCache } from '@moldraw/canvas/geometry';
import { drawBonds } from '@moldraw/canvas/render/drawBonds';
import { drawAtomLabels, drawImplicitHydrogenStubs } from '@moldraw/canvas/render/drawAtomDecorations';
import type { RenderContext } from '@moldraw/canvas/render/types';
import { DEFAULT_STRUCTURE_THEME } from '@moldraw/canvas/render/types';
import type { AppSettings } from './types';
import { createAspirinMolecule, scaleMoleculeToBondLength } from './aspirinPreviewMolecule';
import { structureInkForTheme, type UiThemeId } from '../theme';

const EMPTY_VIEWPORT = { x: 0, y: 0, zoom: 1 };

function moleculeBounds(mol: Molecule): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const a of mol.atoms) {
    minX = Math.min(minX, a.x);
    minY = Math.min(minY, a.y);
    maxX = Math.max(maxX, a.x);
    maxY = Math.max(maxY, a.y);
  }
  return { minX, minY, maxX, maxY };
}

function currentUiTheme(): UiThemeId {
  if (typeof document === 'undefined') return 'light';
  const t = document.documentElement.dataset.theme;
  if (t === 'elegant-dark' || t === 'ink-dark' || t === 'light') return t;
  return 'light';
}

function buildPreviewRenderContext(
  mol: Molecule,
  settings: AppSettings,
  displayPrefs: ReturnType<typeof resolveCanvasPreferences>,
  structureTheme: RenderContext['structureTheme'],
): RenderContext {
  const topology = getMoleculeRevisionCache(mol);
  return {
    molecule: mol,
    renderedMolecule: mol,
    valencyMap: topology.valencyMap,
    atomById: topology.atomById,
    bondById: topology.bondById,
    ringCenterByBondId: topology.ringCenterByBondId,
    ringAtomIdsByBondId: topology.ringAtomIdsByBondId,
    visibleAtomIds: null,
    visibleBondIds: null,
    lodSkipLabels: false,
    viewport: EMPTY_VIEWPORT,
    displayScale: 1,
    displayPrefs,
    activeTool: 'select',
    isRingTool: false,
    numSides: 6,
    isBenzene: false,
    isBoatTool: false,
    isChairTool: false,
    selectedAtomIds: [],
    selectedBondIds: [],
    selectedCanvasTextId: null,
    selectedReactionArrowId: null,
    selectedCanvasImageId: null,
    selectedCanvasShapeId: null,
    selectedCanvasOrbitalIds: [],
    selectedStrokeId: null,
    selectedSruBracketId: null,
    hoveredComponentIds: [],
    hoveredAtomCircleId: null,
    hoveredBondHighlightId: null,
    hoverAtomId: null,
    hoverBondId: null,
    hoverRingAtomIds: null,
    mouseWorldPos: null,
    errorAtomId: null,
    stereoWarningAtomIds: topology.stereoWarningAtomIds,
    cipAtomLabels: null,
    cipBondLabels: null,
    showCipLabels: false,
    showHydrogens: settings.general.showImplicitHydrogens,
    condensedGroupLabels: false,
    colorAtomLabels: settings.general.colorAtomLabels,
    applyAtomColorsToBonds: settings.general.applyAtomColorsToBonds,
    structureTheme: structureTheme ?? DEFAULT_STRUCTURE_THEME,
    omitAtomAliasBodyId: null,
    omitCanvasTextBodyId: null,
    activeColor: '#0f172a',
    activeThickness: 4,
    placementElement: 'C',
    drawingBond: null,
    drawingChain: null,
    drawingRing: null,
    drawingStroke: null,
    smartDrawSessionStrokes: [],
    drawingReactionArrow: null,
    drawingCanvasShape: null,
    dragAction: null,
    rotatePreviewDelta: 0,
    labelCounterRad: 0,
    hasRotateCommit: false,
    hasScaleCommit: false,
    applyLabelUpright: (_atomId, draw) => {
      draw();
    },
    offscreenCanvas: null,
    fragmentPlacement: null,
  };
}

/**
 * Aspirin thumbnail using the same draw pipeline and resolved prefs as the
 * canvas. Geometry is scaled to the preset bond length; the view is zoomed to
 * fit (like canvas zoom) so stroke/font ratios stay faithful.
 */
export function StylePresetPreview({
  settings,
  width = 220,
  height = 140,
}: {
  settings: AppSettings;
  width?: number;
  height?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const theme = currentUiTheme();
    const structureTheme = structureInkForTheme(theme);
    const isDark = theme !== 'light';
    const bg =
      (typeof document !== 'undefined' &&
        getComputedStyle(document.documentElement).getPropertyValue('--chrome-input-bg').trim()) ||
      (isDark ? '#2a2a2a' : '#fafafa');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    try {
      const displayPrefs = resolveCanvasPreferences(settings);
      const mol = scaleMoleculeToBondLength(createAspirinMolecule(), displayPrefs.bondLengthPx);
      const bounds = moleculeBounds(mol);
      const labelPad = Math.max(
        displayPrefs.bondLengthPx * 0.85,
        settings.general.fontSizePt * 2.2,
        28,
      );
      const worldW = Math.max(1, bounds.maxX - bounds.minX + labelPad * 2);
      const worldH = Math.max(1, bounds.maxY - bounds.minY + labelPad * 2);
      const fit = Math.min(width / worldW, height / worldH);
      const cx = (bounds.minX + bounds.maxX) / 2;
      const cy = (bounds.minY + bounds.maxY) / 2;

      ctx.save();
      ctx.translate(width / 2, height / 2);
      ctx.scale(fit, fit);
      ctx.translate(-cx, -cy);

      const R = buildPreviewRenderContext(mol, settings, displayPrefs, structureTheme);
      drawBonds(ctx, R);
      if (settings.general.showImplicitHydrogens) drawImplicitHydrogenStubs(ctx, R);
      drawAtomLabels(ctx, R);
      ctx.restore();
    } catch (err) {
      console.warn('Style preset preview failed:', err);
    }
  }, [settings, width, height]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      style={{
        display: 'block',
        width: '100%',
        height: `${height}px`,
        borderRadius: 'var(--radius-control)',
        border: '1px solid var(--chrome-border)',
        flexShrink: 0,
        background: 'var(--chrome-input-bg)',
      }}
    />
  );
}
