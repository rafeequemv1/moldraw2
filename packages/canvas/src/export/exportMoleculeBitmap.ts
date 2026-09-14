/**
 * Clean offscreen export — structure + annotations only (no grid, selection
 * chrome, hover, or ghosts). PNG / JPEG / PDF rasterize this pipeline; SVG
 * replays it into vector paths via SvgExportContext.
 *
 * Indigo in this product is `binaryWasmNoRender` and has no SVG/PNG render API;
 * WYSIWYG export uses the same canvas draw pipeline as the editor.
 */
import {
  mergeDocumentAtomOpacity,
  projectPerspectiveForDisplay,
  type ResolvedCanvasPreferences,
} from '@moldraw/core';
import type { Molecule } from '@moldraw/domain';
import {
  getMoleculeRevisionCache,
  LONE_PAIR_DIST_PX,
  LONE_PAIR_DOT_R_PX,
  LONE_PAIR_DOT_SEP_PX,
  RADICAL_DIST_PX,
  RADICAL_DOT_R_PX,
  resolveOrbitalCenter,
  type Viewport,
} from '../geometry';
import type { RenderContext, StructureThemeColors } from '../render/types';
import { DEFAULT_STRUCTURE_THEME } from '../render/types';
import { estimateChargeMarkAabb, estimateDeltaChargeMarkAabb } from '../render/drawFormalCharge';
import { paintStructureLayers } from '../render';
import { SvgExportContext, asCanvasContext } from './svgExportContext';

export type ExportBackground = 'transparent' | 'white';

export type ExportBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type ExportMoleculeBitmapOptions = {
  molecule: Molecule;
  displayPrefs: ResolvedCanvasPreferences;
  /** Pixel scale relative to world units (1 world unit → `scale` CSS pixels). Default 2. */
  scale?: number;
  background?: ExportBackground;
  /** Extra world-space padding around bounds (covers labels / arrowheads). */
  padWorld?: number;
  showHydrogens?: boolean;
  condensedGroupLabels?: boolean;
  colorAtomLabels?: boolean;
  applyAtomColorsToBonds?: boolean;
  structureTheme?: StructureThemeColors;
  structureDrawMode?: 'skeletal' | 'ball-stick';
  showCipLabels?: boolean;
  cipAtomLabels?: ReadonlyMap<string, string> | null;
  cipBondLabels?: ReadonlyMap<string, string> | null;
};

const EMPTY_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 };

/** Light ink (dark UI) vanishes on a white/transparent download page. */
function isLightCssColor(color: string): boolean {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return false;
  let hex = m[1]!;
  if (hex.length === 3) {
    hex = hex[0]! + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 180;
}

function resolveExportStructureTheme(
  theme: StructureThemeColors | undefined,
  background: ExportBackground,
): StructureThemeColors {
  const t = theme ?? DEFAULT_STRUCTURE_THEME;
  if ((background === 'white' || background === 'transparent') && isLightCssColor(t.ink)) {
    return DEFAULT_STRUCTURE_THEME;
  }
  return t;
}

/** True when PNG / SVG / JPEG / PDF would paint at least one layer. */
export function moleculeHasExportableContent(mol: Molecule): boolean {
  return (
    mol.atoms.length > 0 ||
    (mol.reactionArrows?.length ?? 0) > 0 ||
    (mol.canvasTexts?.length ?? 0) > 0 ||
    (mol.canvasImages?.length ?? 0) > 0 ||
    (mol.canvasShapes?.length ?? 0) > 0 ||
    (mol.strokes?.length ?? 0) > 0 ||
    (mol.orbitals?.length ?? 0) > 0 ||
    (mol.sruBrackets?.length ?? 0) > 0
  );
}

/** Axis-aligned bounds of everything that should appear in an image export. */
export function computeExportBounds(mol: Molecule): ExportBounds | null {
  const boxes: ExportBounds[] = [];
  const lonePad = LONE_PAIR_DIST_PX + LONE_PAIR_DOT_SEP_PX + LONE_PAIR_DOT_R_PX + 2;
  const radicalPad = RADICAL_DIST_PX + RADICAL_DOT_R_PX + 2;

  if (mol.atoms.length > 0) {
    boxes.push({
      minX: Math.min(...mol.atoms.map(a => a.x)),
      minY: Math.min(...mol.atoms.map(a => a.y)),
      maxX: Math.max(...mol.atoms.map(a => a.x)),
      maxY: Math.max(...mol.atoms.map(a => a.y)),
    });
  }

  for (const atom of mol.atoms) {
    const chargeBox = estimateChargeMarkAabb(atom, mol, atom.charge ?? 0);
    if (chargeBox) boxes.push(chargeBox);
    const deltaBox = estimateDeltaChargeMarkAabb(atom, mol, atom.deltaCharge ?? 0);
    if (deltaBox) boxes.push(deltaBox);
    if ((atom.lonePairs ?? 0) > 0) {
      boxes.push({
        minX: atom.x - lonePad,
        minY: atom.y - lonePad,
        maxX: atom.x + lonePad,
        maxY: atom.y + lonePad,
      });
    }
    if ((atom.radical ?? 0) > 0) {
      boxes.push({
        minX: atom.x - radicalPad,
        minY: atom.y - radicalPad,
        maxX: atom.x + radicalPad,
        maxY: atom.y + radicalPad,
      });
    }
    if ((atom.atomMap ?? 0) > 0) {
      boxes.push({
        minX: atom.x - 20,
        minY: atom.y - 20,
        maxX: atom.x + 8,
        maxY: atom.y + 8,
      });
    }
  }

  for (const image of mol.canvasImages ?? []) {
    boxes.push({
      minX: image.x,
      minY: image.y,
      maxX: image.x + image.width,
      maxY: image.y + image.height,
    });
  }

  for (const shape of mol.canvasShapes ?? []) {
    const sw = Math.max(4, (shape.strokeWidth ?? 2) + 4);
    const x1 = Math.min(shape.x1, shape.x2);
    const y1 = Math.min(shape.y1, shape.y2);
    const x2 = Math.max(shape.x1, shape.x2);
    const y2 = Math.max(shape.y1, shape.y2);
    if (shape.rotationRad) {
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      const hw = (x2 - x1) / 2;
      const hh = (y2 - y1) / 2;
      const c = Math.cos(shape.rotationRad);
      const s = Math.sin(shape.rotationRad);
      const xs: number[] = [];
      const ys: number[] = [];
      for (const [dx, dy] of [
        [hw, hh],
        [hw, -hh],
        [-hw, hh],
        [-hw, -hh],
      ] as const) {
        xs.push(cx + dx * c - dy * s);
        ys.push(cy + dx * s + dy * c);
      }
      boxes.push({
        minX: Math.min(...xs) - sw,
        minY: Math.min(...ys) - sw,
        maxX: Math.max(...xs) + sw,
        maxY: Math.max(...ys) + sw,
      });
    } else {
      boxes.push({
        minX: x1 - sw,
        minY: y1 - sw,
        maxX: x2 + sw,
        maxY: y2 + sw,
      });
    }
  }

  for (const stroke of mol.strokes ?? []) {
    if (stroke.points.length === 0) continue;
    const sw = Math.max(2, (stroke.thickness ?? 4) / 2 + 2);
    boxes.push({
      minX: Math.min(...stroke.points.map(p => p.x)) - sw,
      minY: Math.min(...stroke.points.map(p => p.y)) - sw,
      maxX: Math.max(...stroke.points.map(p => p.x)) + sw,
      maxY: Math.max(...stroke.points.map(p => p.y)) + sw,
    });
  }

  for (const arrow of mol.reactionArrows ?? []) {
    const xs = [arrow.x1, arrow.x2];
    const ys = [arrow.y1, arrow.y2];
    if (arrow.cx != null) xs.push(arrow.cx);
    if (arrow.cy != null) ys.push(arrow.cy);
    if (arrow.c1x != null) xs.push(arrow.c1x);
    if (arrow.c1y != null) ys.push(arrow.c1y);
    if (arrow.c2x != null) xs.push(arrow.c2x);
    if (arrow.c2y != null) ys.push(arrow.c2y);
    if (arrow.pathPoints) {
      for (const p of arrow.pathPoints) {
        xs.push(p.x);
        ys.push(p.y);
      }
    }
    const headPad = Math.max(24, (arrow.strokeWidth ?? 2) * 8) * (arrow.headScale ?? 1);
    const aboveLines = (arrow.reagentAbove ?? '')
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean).length;
    const belowLines = (arrow.reagentBelow ?? '')
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean).length;
    const fs = arrow.reagentFontSize ?? 14;
    const lineGap = fs * 1.18;
    const baseOff = 18 + fs * 0.45;
    // Cover multi-line reagents above/below (plus horizontal extent of long lines).
    const textPadY =
      aboveLines || belowLines
        ? Math.max(
            28,
            baseOff + Math.max(aboveLines, belowLines) * lineGap + fs,
          )
        : 0;
    const longestReagent = Math.max(
      0,
      ...(arrow.reagentAbove ?? '')
        .split('\n')
        .map(s => s.trim().length),
      ...(arrow.reagentBelow ?? '')
        .split('\n')
        .map(s => s.trim().length),
    );
    const textPadX = longestReagent > 0 ? Math.max(28, longestReagent * fs * 0.35) : 0;
    const padX = Math.max(headPad, textPadX);
    const padY = Math.max(headPad, textPadY);
    boxes.push({
      minX: Math.min(...xs) - padX,
      minY: Math.min(...ys) - padY,
      maxX: Math.max(...xs) + padX,
      maxY: Math.max(...ys) + padY,
    });
  }

  for (const text of mol.canvasTexts ?? []) {
    const w = text.boxWidth ?? Math.max(24, text.text.length * text.fontSize * 0.6);
    const h = text.boxHeight ?? text.fontSize * 1.4;
    if (text.rotationRad) {
      const cx = text.x + w / 2;
      const cy = text.y + h / 2;
      const hw = w / 2;
      const hh = h / 2;
      const c = Math.cos(text.rotationRad);
      const s = Math.sin(text.rotationRad);
      const xs: number[] = [];
      const ys: number[] = [];
      for (const [dx, dy] of [
        [hw, hh],
        [hw, -hh],
        [-hw, hh],
        [-hw, -hh],
      ] as const) {
        xs.push(cx + dx * c - dy * s);
        ys.push(cy + dx * s + dy * c);
      }
      boxes.push({
        minX: Math.min(...xs),
        minY: Math.min(...ys),
        maxX: Math.max(...xs),
        maxY: Math.max(...ys),
      });
    } else {
      boxes.push({
        minX: text.x,
        minY: text.y,
        maxX: text.x + w,
        maxY: text.y + h,
      });
    }
  }

  for (const o of mol.orbitals ?? []) {
    const c = resolveOrbitalCenter(mol, o);
    const r = o.size * 1.15;
    boxes.push({
      minX: c.x - r,
      minY: c.y - r,
      maxX: c.x + r,
      maxY: c.y + r,
    });
  }

  for (const br of mol.sruBrackets ?? []) {
    const sub = br.subscript?.trim() ?? 'n';
    const subPad = Math.max(16, sub.length * 8);
    boxes.push({
      minX: Math.min(br.x1, br.x2) - 4,
      minY: Math.min(br.y1, br.y2) - 4,
      maxX: Math.max(br.x1, br.x2) + subPad,
      maxY: Math.max(br.y1, br.y2) + 4,
    });
  }

  if (boxes.length === 0) return null;
  return {
    minX: Math.min(...boxes.map(b => b.minX)),
    minY: Math.min(...boxes.map(b => b.minY)),
    maxX: Math.max(...boxes.map(b => b.maxX)),
    maxY: Math.max(...boxes.map(b => b.maxY)),
  };
}

/** Extra world padding so heteroatom / alias labels are not clipped at the edge. */
function labelAwarePadWorld(mol: Molecule, displayPrefs: ResolvedCanvasPreferences, basePad: number): number {
  let extra = 0;
  for (const atom of mol.atoms) {
    const alias = atom.alias?.trim();
    if (alias) {
      // Rough width estimate without a measuring context (export is offscreen).
      extra = Math.max(extra, alias.length * displayPrefs.bondLengthPx * 0.28);
    } else if (atom.element !== 'C' || (atom.charge ?? 0) !== 0 || atom.isotope) {
      extra = Math.max(extra, displayPrefs.bondLengthPx * 0.45);
    }
    if (
      (atom.lonePairs ?? 0) > 0 ||
      (atom.radical ?? 0) > 0 ||
      (atom.deltaCharge ?? 0) !== 0 ||
      (atom.atomMap ?? 0) > 0
    ) {
      extra = Math.max(extra, 32);
    }
  }
  return Math.max(basePad, extra + 16);
}

function buildExportRenderContext(
  molecule: Molecule,
  renderedMolecule: Molecule,
  opts: ExportMoleculeBitmapOptions,
  atomOpacityById: Map<string, number> | undefined,
): RenderContext {
  const topology = getMoleculeRevisionCache(renderedMolecule);

  return {
    molecule,
    renderedMolecule,
    atomOpacityById,
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
    displayPrefs: opts.displayPrefs,
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
    cipAtomLabels: opts.cipAtomLabels ?? null,
    cipBondLabels: opts.cipBondLabels ?? null,
    showCipLabels: opts.showCipLabels ?? false,
    showHydrogens: opts.showHydrogens ?? false,
    condensedGroupLabels: opts.condensedGroupLabels ?? false,
    colorAtomLabels: opts.colorAtomLabels ?? false,
    applyAtomColorsToBonds: opts.applyAtomColorsToBonds ?? false,
    structureTheme: resolveExportStructureTheme(opts.structureTheme, opts.background ?? 'transparent'),
    structureDrawMode: opts.structureDrawMode ?? 'skeletal',
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

/** Resolved export frame (world → output px). Shared by raster, SVG, and headless SVG. */
export type ExportFrame = {
  molecule: Molecule;
  projected: Molecule;
  opacityByAtomId: Map<string, number> | undefined;
  /** Unpadded world bounds of everything painted. */
  bounds: ExportBounds;
  /** World padding applied around `bounds`. */
  padWorld: number;
  minX: number;
  minY: number;
  finalW: number;
  finalH: number;
  finalScale: number;
  background: ExportBackground;
};

/**
 * Compute the output frame (bounds, padding, scale, pixel size) without painting.
 * Pure — safe to call in Node; used by `renderMoleculeSvgHeadless`.
 */
export function prepareExportFrame(opts: ExportMoleculeBitmapOptions): ExportFrame | null {
  const { molecule } = opts;
  const scale = Math.max(0.5, opts.scale ?? 2);
  const basePad = opts.padWorld ?? Math.max(48, opts.displayPrefs.bondLengthPx * 0.9);
  const background = opts.background ?? 'transparent';

  const { molecule: projected, opacityByAtomId: perspectiveOpacity } =
    projectPerspectiveForDisplay(molecule);
  const opacityByAtomId = mergeDocumentAtomOpacity(molecule, perspectiveOpacity);
  const bounds = computeExportBounds(projected);
  if (!bounds) return null;

  const padWorld = labelAwarePadWorld(projected, opts.displayPrefs, basePad);
  const minX = bounds.minX - padWorld;
  const minY = bounds.minY - padWorld;
  const maxX = bounds.maxX + padWorld;
  const maxY = bounds.maxY + padWorld;
  const worldW = Math.max(1, maxX - minX);
  const worldH = Math.max(1, maxY - minY);

  const outW = Math.max(1, Math.ceil(worldW * scale));
  const outH = Math.max(1, Math.ceil(worldH * scale));
  const maxSide = 8192;
  const fit = Math.min(1, maxSide / Math.max(outW, outH));
  return {
    molecule,
    projected,
    opacityByAtomId,
    bounds,
    padWorld,
    minX,
    minY,
    finalW: Math.max(1, Math.ceil(outW * fit)),
    finalH: Math.max(1, Math.ceil(outH * fit)),
    finalScale: scale * fit,
    background,
  };
}

/**
 * Paint background + structure layers into any 2D context (real canvas or
 * `SvgExportContext`). Does not touch the DOM itself.
 */
export function paintExportDocument(
  ctx: CanvasRenderingContext2D,
  opts: ExportMoleculeBitmapOptions,
  frame: ExportFrame,
): void {
  if (frame.background === 'white') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, frame.finalW, frame.finalH);
  } else {
    ctx.clearRect(0, 0, frame.finalW, frame.finalH);
  }

  ctx.save();
  ctx.scale(frame.finalScale, frame.finalScale);
  ctx.translate(-frame.minX, -frame.minY);

  const R = buildExportRenderContext(frame.molecule, frame.projected, opts, frame.opacityByAtomId);
  paintStructureLayers(ctx, R);

  ctx.restore();
}

/**
 * Rasterize the molecule to an offscreen canvas (clean export, no UI chrome).
 * Returns null when there is nothing to draw.
 */
export function exportMoleculeBitmap(opts: ExportMoleculeBitmapOptions): HTMLCanvasElement | null {
  const frame = prepareExportFrame(opts);
  if (!frame) return null;

  const canvas = document.createElement('canvas');
  canvas.width = frame.finalW;
  canvas.height = frame.finalH;
  const ctx = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
  if (!ctx) return null;

  paintExportDocument(ctx, opts, frame);
  return canvas;
}

/**
 * Vector SVG of the same WYSIWYG document used for PNG/PDF (paths, text, arrows).
 * Raster images on the canvas stay embedded; chemistry and annotations are vectors.
 */
export function exportMoleculeSvg(opts: ExportMoleculeBitmapOptions): string | null {
  const frame = prepareExportFrame(opts);
  if (!frame) return null;
  const svg = new SvgExportContext(frame.finalW, frame.finalH);
  paintExportDocument(asCanvasContext(svg), opts, frame);
  return svg.toSvgDocument();
}

/** Encode an offscreen canvas to a Blob (more reliable downloads than data URLs). */
export function canvasToBlob(
  canvas: HTMLCanvasElement,
  mime: 'image/png' | 'image/jpeg',
  quality = 0.95,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => {
        if (blob) resolve(blob);
        else reject(new Error(`Failed to encode ${mime}`));
      },
      mime,
      quality,
    );
  });
}

/** Wrap a PNG data URL in a minimal SVG document (raster-in-SVG for fidelity). */
export function bitmapCanvasToSvgDocument(canvas: HTMLCanvasElement, quality = 0.95): string {
  const dataUrl = canvas.toDataURL('image/png', quality);
  const esc = dataUrl.replace(/&/g, '&amp;');
  const w = canvas.width;
  const h = canvas.height;
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n` +
    `  <image width="${w}" height="${h}" xlink:href="${esc}" href="${esc}"/>\n` +
    `</svg>\n`
  );
}

/** Async SVG document from canvas (avoids huge sync data URLs when possible). */
export async function bitmapCanvasToSvgBlob(canvas: HTMLCanvasElement, quality = 0.95): Promise<Blob> {
  const png = await canvasToBlob(canvas, 'image/png', quality);
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read PNG for SVG'));
    reader.readAsDataURL(png);
  });
  const esc = dataUrl.replace(/&/g, '&amp;');
  const w = canvas.width;
  const h = canvas.height;
  const svg =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n` +
    `  <image width="${w}" height="${h}" xlink:href="${esc}" href="${esc}"/>\n` +
    `</svg>\n`;
  return new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
}
