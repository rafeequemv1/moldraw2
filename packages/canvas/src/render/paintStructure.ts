import type { RenderContext } from './types';
import { drawAtomMaps } from './drawAtomMaps';
import {
  drawAtomLabels,
  drawDeltaCharges,
  drawFormalCharges,
  drawImplicitHydrogenStubs,
  drawLonePairs,
  drawSelectedChargeMarks,
} from './drawAtomDecorations';
import { drawCanvasImages } from './drawCanvasImages';
import { drawCanvasTexts } from './drawCanvasTexts';
import { drawCipLabels } from './drawCipLabels';
import { drawCommittedCanvasShapes } from './drawCanvasShapes';
import { drawCommittedStrokes } from './drawStrokes';
import { drawBonds } from './drawBonds';
import { drawReactionArrows } from './drawReactionArrows';
import { drawRingFills } from './drawRingFills';
import { drawCanvasOrbitals } from './drawOrbitals';
import { drawSruBrackets } from './drawSruBrackets';
import { drawMarkupHighlights } from './drawMarkupHighlights';
import { drawBallStickStructure } from '../themes';

/**
 * Committed chemistry + annotations (no grid, selection, hover, or ghosts).
 * Shared by the live canvas, PNG/JPEG/PDF raster export, and vector SVG export
 * so downloads cannot drift from what the editor paints.
 *
 * Do not draw octet / valence "+n" badges here. Those are editor-only overlay
 * chrome (`drawOverValentMarkers`, `showValenceWarnings`). Exports and copied
 * images call this function and must stay clean structures.
 */
export function paintStructureLayers(ctx: CanvasRenderingContext2D, R: RenderContext): void {
  drawCanvasImages(ctx, R);
  drawCanvasOrbitals(ctx, R);
  drawRingFills(ctx, R);
  drawMarkupHighlights(ctx, R);
  if ((R.structureDrawMode ?? 'skeletal') === 'ball-stick') {
    drawBallStickStructure(ctx, R);
  } else {
    drawBonds(ctx, R);
  }
  drawReactionArrows(ctx, R);
  drawCommittedStrokes(ctx, R);
  drawCommittedCanvasShapes(ctx, R);
  if ((R.structureDrawMode ?? 'skeletal') !== 'ball-stick') {
    drawImplicitHydrogenStubs(ctx, R);
    drawAtomLabels(ctx, R);
    drawLonePairs(ctx, R);
  }
  drawFormalCharges(ctx, R);
  drawDeltaCharges(ctx, R);
  drawSelectedChargeMarks(ctx, R);
  if ((R.structureDrawMode ?? 'skeletal') !== 'ball-stick') {
    drawCipLabels(ctx, R);
    drawAtomMaps(ctx, R);
  }
  drawCanvasTexts(ctx, R);
  drawSruBrackets(ctx, R);
}
