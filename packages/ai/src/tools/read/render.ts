/**
 * `molecule.render` — headless SVG picture of the canvas for AI agents.
 *
 * Imports the deep `@moldraw/canvas/export/…` path on purpose: the canvas
 * package root re-exports React components, which must not be pulled into
 * the Node (MCP / HTTP) bundle. The headless renderer only depends on the
 * pure paint pipeline + `SvgExportContext`.
 */
import { buildCanvasStateSnapshot } from '@moldraw/core';
import {
  defaultHeadlessDisplayPrefs,
  renderMoleculeSvgHeadless,
  type RenderMoleculeSvgHeadlessResult,
} from '@moldraw/canvas/export/renderMoleculeSvgHeadless';
import { renderInputSchema } from '../../schemas/tools';
import type { RegisteredAiTool } from '../types';
import { toolFail, toolOk } from '../types';

export type RenderToolFormat = 'svg' | 'png';

export type RenderToolOutput = {
  /** Format actually produced (may be `'svg'` when PNG was requested but unavailable). */
  format: RenderToolFormat;
  width: number;
  height: number;
  svg?: string;
  /** Base64 PNG bytes (only when a rasteriser is available in the host runtime). */
  pngBase64?: string;
  /** Unpadded world-space bounds of what was drawn. */
  bounds: RenderMoleculeSvgHeadlessResult['bounds'];
  /** World units → output px. */
  scale: number;
  /** Set when the output differs from the request (e.g. PNG unavailable, images skipped). */
  note?: string;
};

/**
 * PNG needs a vector rasteriser (resvg / node-canvas / skia). None ships with
 * this repo and adding one is out of scope, so PNG requests degrade to SVG.
 */
const PNG_UNAVAILABLE_NOTE =
  'PNG rasterisation is not available in this runtime (no pure-JS rasteriser is installed); returned SVG instead.';

export const renderTool: RegisteredAiTool = {
  id: 'molecule.render',
  category: 'read',
  description:
    'Render the current canvas (or one molecule) to SVG/PNG so you can visually verify what was drawn. Read-only. Returns the SVG document text plus pixel size and world bounds; scope with moleculeIndex (from get_canvas_state) or atomIds (from get_structure).',
  inputSchema: renderInputSchema,
  handler: (input, ctx) => {
    const {
      format = 'svg',
      width = 800,
      background = 'white',
      moleculeIndex,
      atomIds,
    } = (input ?? {}) as {
      format?: RenderToolFormat;
      width?: number;
      background?: 'white' | 'transparent';
      moleculeIndex?: number;
      atomIds?: string[];
    };

    const mol = ctx.getMolecule();

    let scopeIds: Set<string> | null = null;
    if (moleculeIndex != null) {
      const snap = buildCanvasStateSnapshot(mol, {
        includeCoords: false,
        includeSmiles: false,
        includeAnnotations: false,
      });
      const frag = snap.molecules[moleculeIndex];
      if (!frag) {
        return toolFail(
          'EXECUTION',
          `No molecule at index ${moleculeIndex} (count=${snap.molecules.length}).`,
        );
      }
      scopeIds = new Set(frag.atomIds);
    }
    if (atomIds && atomIds.length > 0) {
      const requested = new Set(atomIds);
      scopeIds = scopeIds
        ? new Set([...scopeIds].filter(id => requested.has(id)))
        : requested;
      if (scopeIds.size === 0) {
        return toolFail('EXECUTION', 'atomIds do not intersect the requested molecule.');
      }
    }

    let result: RenderMoleculeSvgHeadlessResult | null;
    try {
      result = renderMoleculeSvgHeadless({
        molecule: mol,
        width,
        background,
        atomIds: scopeIds ? [...scopeIds] : undefined,
        displayPrefs: defaultHeadlessDisplayPrefs(ctx.bondLengthPx),
      });
    } catch (err) {
      return toolFail(
        'EXECUTION',
        `Render failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (!result) {
      return toolFail(
        'EXECUTION',
        scopeIds
          ? 'Nothing to render in the requested scope (no matching atoms).'
          : 'Canvas is empty — nothing to render.',
      );
    }

    const notes: string[] = [];
    if (format === 'png') notes.push(PNG_UNAVAILABLE_NOTE);
    if (result.skippedImageCount > 0) {
      notes.push(
        `${result.skippedImageCount} canvas image(s) drawn as placeholder rectangles (raster images need a DOM).`,
      );
    }

    const out: RenderToolOutput = {
      format: 'svg',
      width: result.width,
      height: result.height,
      svg: result.svg,
      bounds: result.bounds,
      scale: result.scale,
      ...(notes.length ? { note: notes.join(' ') } : {}),
    };
    return toolOk(out);
  },
};
