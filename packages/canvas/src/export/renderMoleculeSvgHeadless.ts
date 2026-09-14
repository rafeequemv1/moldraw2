/**
 * Headless (DOM-free) SVG render of a molecule document.
 *
 * Intended for Node consumers — MCP / HTTP AI tools — that need to *see* the
 * drawing. Composes the same paint pipeline the editor and the browser export
 * use (`paintExportDocument` → `paintStructureLayers`) with `SvgExportContext`,
 * so the picture cannot drift from what the canvas draws.
 *
 * Differences from the browser SVG export:
 * - Text metrics come from `headlessFontMetrics` when no `<canvas>` exists
 *   (feature-detected inside `SvgExportContext`; the browser path is unchanged).
 * - Canvas images (`Molecule.canvasImages`) need `new Image()`; in headless
 *   mode they are replaced by placeholder rectangles plus an SVG comment.
 * - Output size is width-driven (`width` px) instead of scale-driven.
 *
 * Import via the deep path `@moldraw/canvas/export/renderMoleculeSvgHeadless`
 * from Node code — the package root pulls in React components.
 */
import {
  resolveCanvasPreferences,
  type ResolveCanvasPreferencesInput,
  type ResolvedCanvasPreferences,
} from '@moldraw/core';
import type { CanvasShape, Molecule } from '@moldraw/domain';
import { resolveStructureDrawMode } from '../themes/types';
import {
  paintExportDocument,
  prepareExportFrame,
  type ExportBackground,
  type ExportBounds,
  type ExportMoleculeBitmapOptions,
} from './exportMoleculeBitmap';
import { SvgExportContext, asCanvasContext } from './svgExportContext';

export type RenderMoleculeSvgHeadlessOptions = {
  molecule: Molecule;
  /** Target output width in px (height follows the aspect ratio). Default 800. */
  width?: number;
  /** Hard cap on either output side in px. Default 4096. */
  maxSidePx?: number;
  /** Default `'white'` (agents usually preview on light backgrounds). */
  background?: ExportBackground;
  /**
   * Restrict the render to these atoms (bonds between them are kept; all
   * annotations — arrows, texts, shapes, images, strokes — are dropped).
   */
  atomIds?: readonly string[];
  /** Display preferences; defaults to `defaultHeadlessDisplayPrefs()`. */
  displayPrefs?: ResolvedCanvasPreferences;
  showHydrogens?: boolean;
  condensedGroupLabels?: boolean;
  colorAtomLabels?: boolean;
  applyAtomColorsToBonds?: boolean;
  showCipLabels?: boolean;
  cipAtomLabels?: ReadonlyMap<string, string> | null;
  cipBondLabels?: ReadonlyMap<string, string> | null;
};

export type RenderMoleculeSvgHeadlessResult = {
  svg: string;
  /** Output pixel size (matches the SVG `width` / `height` attributes). */
  width: number;
  height: number;
  /** Unpadded world-space bounds of the painted content. */
  bounds: ExportBounds;
  /** World units → output px. */
  scale: number;
  /** Canvas images replaced by placeholder rectangles. */
  skippedImageCount: number;
};

/** Mirrors the App's ChemDraw-style defaults (`src/app/settings/defaults.ts`). */
export const HEADLESS_DEFAULT_PREFERENCES_INPUT: ResolveCanvasPreferencesInput = {
  general: {
    showImplicitHydrogens: false,
    autoLayoutAfterBondBurst: true,
    fontFamily: 'Times New Roman',
    fontSizePt: 20,
    subFontSizePt: 16,
    reactionComponentMarginPt: 1.6,
    imageResolution: 'document',
    boldAtomLabels: false,
    snapToGrid: false,
    showGrid: false,
  },
  bonds: {
    bondLengthPx: 45,
    bondSpacingPercent: 35,
    bondThicknessPx: 2,
    stereoWedgeWidthPx: 10,
    hashSpacingPx: 3.5,
    bondAngleSnapDeg: 30,
  },
};

/** Resolved preferences for headless renders; `bondLengthPx` should match the session's. */
export function defaultHeadlessDisplayPrefs(bondLengthPx?: number): ResolvedCanvasPreferences {
  const input = HEADLESS_DEFAULT_PREFERENCES_INPUT;
  return resolveCanvasPreferences(
    bondLengthPx != null && Number.isFinite(bondLengthPx) && bondLengthPx > 0
      ? { ...input, bonds: { ...input.bonds, bondLengthPx } }
      : input,
  );
}

const PLACEHOLDER_STROKE = '#94a3b8';

/** Replace raster images with outline rectangles (no `Image` in Node). */
function imagesToPlaceholders(mol: Molecule): { molecule: Molecule; skipped: number } {
  const images = mol.canvasImages ?? [];
  if (images.length === 0) return { molecule: mol, skipped: 0 };
  const placeholders: CanvasShape[] = images.map(img => ({
    id: `headless-image-placeholder:${img.id}`,
    kind: 'rectangle',
    x1: img.x,
    y1: img.y,
    x2: img.x + img.width,
    y2: img.y + img.height,
    color: PLACEHOLDER_STROKE,
    strokeWidth: 1.5,
    rotationRad: img.rotationRad,
  }));
  return {
    molecule: {
      ...mol,
      canvasImages: [],
      canvasShapes: [...(mol.canvasShapes ?? []), ...placeholders],
    },
    skipped: images.length,
  };
}

/** Keep only the requested atoms and the bonds between them; drop annotations. */
function scopeToAtoms(mol: Molecule, atomIds: readonly string[]): Molecule {
  const keep = new Set(atomIds);
  return {
    ...mol,
    atoms: mol.atoms.filter(a => keep.has(a.id)),
    bonds: mol.bonds.filter(b => keep.has(b.fromAtomId) && keep.has(b.toAtomId)),
    reactionArrows: undefined,
    canvasTexts: undefined,
    canvasImages: undefined,
    canvasShapes: undefined,
    strokes: undefined,
    orbitals: undefined,
    sruBrackets: undefined,
  };
}

/**
 * Render to an SVG string without a DOM. Returns `null` when there is nothing
 * to draw (empty document or empty scope).
 */
export function renderMoleculeSvgHeadless(
  opts: RenderMoleculeSvgHeadlessOptions,
): RenderMoleculeSvgHeadlessResult | null {
  const targetWidth = Math.max(16, Math.floor(opts.width ?? 800));
  const maxSide = Math.max(targetWidth, Math.floor(opts.maxSidePx ?? 4096));
  const background = opts.background ?? 'white';

  let molecule = opts.atomIds ? scopeToAtoms(opts.molecule, opts.atomIds) : opts.molecule;
  const { molecule: withPlaceholders, skipped } = imagesToPlaceholders(molecule);
  molecule = withPlaceholders;

  const displayPrefs = opts.displayPrefs ?? defaultHeadlessDisplayPrefs();
  const structureDrawMode =
    molecule.structureDrawMode ?? resolveStructureDrawMode(molecule.structureThemeId);

  const base: ExportMoleculeBitmapOptions = {
    molecule,
    displayPrefs,
    background,
    showHydrogens: opts.showHydrogens,
    condensedGroupLabels: opts.condensedGroupLabels,
    colorAtomLabels: opts.colorAtomLabels,
    applyAtomColorsToBonds: opts.applyAtomColorsToBonds,
    structureDrawMode,
    showCipLabels: opts.showCipLabels,
    cipAtomLabels: opts.cipAtomLabels,
    cipBondLabels: opts.cipBondLabels,
  };

  // Pass 1 at scale 1 to learn the padded world size, then fit to the requested width.
  const probe = prepareExportFrame({ ...base, scale: 1 });
  if (!probe) return null;
  const worldW = Math.max(1, probe.bounds.maxX - probe.bounds.minX + 2 * probe.padWorld);
  const worldH = Math.max(1, probe.bounds.maxY - probe.bounds.minY + 2 * probe.padWorld);
  let scale = targetWidth / worldW;
  if (worldH * scale > maxSide) scale = maxSide / worldH;
  scale = Math.max(0.05, scale);

  const frame = prepareExportFrame({ ...base, scale });
  if (!frame) return null;

  const svg = new SvgExportContext(frame.finalW, frame.finalH);
  svg.comment('moldraw headless render');
  if (skipped > 0) {
    svg.comment(
      `${skipped} canvas image(s) skipped in headless mode; drawn as placeholder rectangles`,
    );
  }
  paintExportDocument(asCanvasContext(svg), base, frame);

  return {
    svg: svg.toSvgDocument(),
    width: frame.finalW,
    height: frame.finalH,
    bounds: frame.bounds,
    scale: frame.finalScale,
    skippedImageCount: skipped,
  };
}
