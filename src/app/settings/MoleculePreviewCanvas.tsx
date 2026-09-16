import { useEffect, useRef, useState } from 'react';
import type { Molecule } from '@moldraw/domain';
import { resolveCanvasPreferences } from '@moldraw/core/canvasPreferences';
import { getMoleculeRevisionCache } from '@moldraw/canvas/geometry';
import { paintStructureLayers } from '@moldraw/canvas/render/paintStructure';
import type { RenderContext } from '@moldraw/canvas/render/types';
import { DEFAULT_STRUCTURE_THEME } from '@moldraw/canvas/render/types';
import type { AppSettings } from './types';
import { scaleMoleculeToBondLength } from './aspirinPreviewMolecule';
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

function useThemeTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const root = document.documentElement;
    const obs = new MutationObserver(() => setTick(n => n + 1));
    obs.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);
  return tick;
}

function buildPreviewRenderContext(
  mol: Molecule,
  settings: AppSettings,
  displayPrefs: ReturnType<typeof resolveCanvasPreferences>,
  structureTheme: RenderContext['structureTheme'],
  extras: {
    cipAtomLabels?: ReadonlyMap<string, string> | null;
    cipBondLabels?: ReadonlyMap<string, string> | null;
  },
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
    cipAtomLabels: extras.cipAtomLabels ?? null,
    cipBondLabels: extras.cipBondLabels ?? null,
      // Preview CIP badges are drawn in CSS pixels after fit (world 11px would vanish).
      showCipLabels: false,
    showHydrogens: settings.general.showImplicitHydrogens,
    condensedGroupLabels: settings.general.condensedGroupLabels === true,
    colorAtomLabels: settings.general.colorAtomLabels,
    applyAtomColorsToBonds: settings.general.applyAtomColorsToBonds,
    structureTheme: structureTheme ?? DEFAULT_STRUCTURE_THEME,
    structureDrawMode: settings.general.structureDrawMode ?? 'skeletal',
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

/** Half-pixel origin so 1px grid lines stay crisp. */
export const PREVIEW_GRID_ORIGIN = 0.5;
export const PREVIEW_GRID_STEP = 16;

function snapToPreviewGrid(value: number, step: number): number {
  return PREVIEW_GRID_ORIGIN + Math.round((value - PREVIEW_GRID_ORIGIN) / step) * step;
}

function drawCssGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  stroke: string,
  step: number,
  markIntersections: boolean,
): void {
  const o = PREVIEW_GRID_ORIGIN;
  ctx.save();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = o; x < width; x += step) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  for (let y = o; y < height; y += step) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();
  if (markIntersections) {
    ctx.fillStyle = 'rgba(100, 116, 139, 0.9)';
    for (let x = o; x < width; x += step) {
      for (let y = o; y < height; y += step) {
        ctx.beginPath();
        ctx.arc(x, y, 1.85, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

export function MoleculePreviewCanvas({
  settings,
  molecule,
  width,
  height = 80,
  showGrid = false,
  /** Place the molecule AABB center on a grid crossing, or in the middle of a cell. */
  gridAlign = null,
  cipAtomLabels = null,
  cipBondLabels = null,
}: {
  settings: AppSettings;
  molecule: Molecule;
  /** Logical CSS width. Omit to fill the parent. */
  width?: number;
  height?: number;
  showGrid?: boolean;
  gridAlign?: 'snapped' | 'free' | null;
  cipAtomLabels?: ReadonlyMap<string, string> | null;
  cipBondLabels?: ReadonlyMap<string, string> | null;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const themeTick = useThemeTick();
  const [fillW, setFillW] = useState(160);

  useEffect(() => {
    if (width != null) return;
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFillW(Math.max(72, Math.round(el.clientWidth))));
    ro.observe(el);
    setFillW(Math.max(72, Math.round(el.clientWidth) || 160));
    return () => ro.disconnect();
  }, [width]);

  const cssW = width ?? fillW;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || cssW < 8) return;
    const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width != null ? `${width}px` : '100%';
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, height);

    const theme = currentUiTheme();
    const structureTheme = structureInkForTheme(theme);
    const isDark = theme !== 'light';
    const bg =
      (typeof document !== 'undefined' &&
        getComputedStyle(document.documentElement).getPropertyValue('--chrome-input-bg').trim()) ||
      (isDark ? '#2a2a2a' : '#fafafa');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cssW, height);

    if (showGrid) {
      drawCssGrid(
        ctx,
        cssW,
        height,
        structureTheme.gridMinor || 'rgba(148, 163, 184, 0.45)',
        PREVIEW_GRID_STEP,
        gridAlign != null,
      );
    }

    try {
      const displayPrefs = resolveCanvasPreferences(settings);
      const gridBond = gridAlign != null ? PREVIEW_GRID_STEP * 2 : displayPrefs.bondLengthPx;
      const mol = scaleMoleculeToBondLength(molecule, gridBond);
      const bounds = moleculeBounds(mol);
      const labelPad = Math.max(
        (gridAlign != null ? gridBond : displayPrefs.bondLengthPx) * 0.55,
        settings.general.fontSizePt * 1.35,
        16,
      );
      const worldW = Math.max(1, bounds.maxX - bounds.minX + labelPad * 2);
      const worldH = Math.max(1, bounds.maxY - bounds.minY + labelPad * 2);
      const fitRaw = Math.min(cssW / worldW, height / worldH);
      // Keep 2-cell bonds so snapped atoms can sit on crossings.
      const fit = gridAlign != null ? Math.min(1, fitRaw) : fitRaw;
      const cx = (bounds.minX + bounds.maxX) / 2;
      const cy = (bounds.minY + bounds.maxY) / 2;

      let tx = cssW / 2;
      let ty = height / 2;
      if (gridAlign != null && mol.atoms.length > 0) {
        const anchor = mol.atoms.reduce((best, a) => {
          const d = (a.x - cx) ** 2 + (a.y - cy) ** 2;
          const bd = (best.x - cx) ** 2 + (best.y - cy) ** 2;
          return d < bd ? a : best;
        });
        const ax = tx + (anchor.x - cx) * fit;
        const ay = ty + (anchor.y - cy) * fit;
        const onX = snapToPreviewGrid(ax, PREVIEW_GRID_STEP);
        const onY = snapToPreviewGrid(ay, PREVIEW_GRID_STEP);
        if (gridAlign === 'snapped') {
          tx += onX - ax;
          ty += onY - ay;
        } else {
          tx += onX + PREVIEW_GRID_STEP * 0.5 - ax;
          ty += onY + PREVIEW_GRID_STEP * 0.5 - ay;
        }
      }

      ctx.save();
      ctx.translate(tx, ty);
      ctx.scale(fit, fit);
      ctx.translate(-cx, -cy);

      const R = buildPreviewRenderContext(mol, settings, displayPrefs, structureTheme, {
        cipAtomLabels,
        cipBondLabels,
      });
      paintStructureLayers(ctx, R);
      ctx.restore();

      if (settings.general.showCipLabels === true && cipAtomLabels && cipAtomLabels.size > 0) {
        ctx.save();
        ctx.font = 'bold 11px "Segoe UI", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const a of mol.atoms) {
          const cip = cipAtomLabels.get(a.id);
          if (!cip || a.element === 'H') continue;
          const sx = tx + (a.x - cx) * fit + 8;
          const sy = ty + (a.y - cy) * fit - 10;
          ctx.fillStyle = 'rgba(255,255,255,0.94)';
          ctx.beginPath();
          ctx.arc(sx, sy, 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#1d4ed8';
          ctx.fillText(cip, sx, sy);
        }
        ctx.restore();
      }
      if (settings.general.showCipLabels === true && cipBondLabels && cipBondLabels.size > 0) {
        ctx.save();
        ctx.font = 'bold 11px "Segoe UI", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const byId = new Map(mol.atoms.map(a => [a.id, a]));
        for (const b of mol.bonds) {
          const cip = cipBondLabels.get(b.id);
          if (!cip) continue;
          const from = byId.get(b.fromAtomId);
          const to = byId.get(b.toAtomId);
          if (!from || !to) continue;
          const mx = tx + ((from.x + to.x) / 2 - cx) * fit;
          const my = ty + ((from.y + to.y) / 2 - cy) * fit;
          ctx.fillStyle = 'rgba(255,255,255,0.94)';
          ctx.beginPath();
          ctx.arc(mx, my - 8, 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#7c3aed';
          ctx.fillText(cip, mx, my - 8);
        }
        ctx.restore();
      }
    } catch (err) {
      console.warn('Settings example preview failed:', err);
    }
  }, [
    settings,
    molecule,
    cssW,
    height,
    width,
    showGrid,
    gridAlign,
    cipAtomLabels,
    cipBondLabels,
    themeTick,
  ]);

  return (
    <div ref={wrapRef} style={{ width: width != null ? `${width}px` : '100%', minWidth: 0 }}>
      <canvas
        ref={canvasRef}
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
    </div>
  );
}
