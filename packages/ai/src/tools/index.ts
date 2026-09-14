import type { ZodType } from 'zod';
import {
  ASYNC_CONTEXT_COMMAND_IDS,
  CMD,
  commandMeta,
  listCommands,
  type MoleculeCommand,
} from '@moldraw/core';
import type { AiExecutionContext } from '../types';
import type { RegisteredAiTool } from './types';
import { toolFail, toolOk, toToolErrorCode } from './types';
import { FACADE_TOOLS } from './facade';
import { batchTool } from './meta/batch';
import { listToolsTool } from './meta/listTools';

import { statsTool } from './read/stats';
import { exportMolblockTool } from './read/exportMolblock';
import { getStructureTool } from './read/getStructure';
import { getCanvasStateTool } from './read/getCanvasState';
import { findRingsTool } from './read/findRings';
import { getSelectionTool } from './read/getSelection';
import { listAnnotationsTool } from './read/listAnnotations';
import { listGlasswareTool } from './read/listGlassware';
import { exportSmilesTool } from './read/exportSmiles';
import { renderTool } from './read/render';
import { findSubstructureTool } from './read/findSubstructure';

import { cleanupTool } from './async/cleanup';
import { importSmilesTool } from './async/importSmiles';
import { aromatizeTool } from './async/aromatize';
import { explicitHydrogensTool } from './async/explicitHydrogens';
import { checkStructureTool } from './async/checkStructure';
import { automapTool } from './async/automap';
import { cipStereoTool } from './async/cipStereo';

import { undoTool, redoTool } from './meta/undoRedo';
import { setSelectionTool } from './meta/setSelection';

import { colorRingsTool } from './recipes/colorRings';
import { colorSelectionTool } from './recipes/colorSelection';
import { colorByElementTool } from './recipes/colorByElement';
import { colorByBondOrderTool } from './recipes/colorByBondOrder';
import { applyDisplayStyleTool } from './recipes/applyDisplayStyle';
import { placeTemplateTool } from './recipes/placeTemplate';
import { placeGlasswareTool } from './recipes/placeGlassware';
import { buildLabManualTool } from './recipes/buildLabManual';
import { moveFragmentTool } from './recipes/moveFragment';
import { rotateFragmentTool } from './recipes/rotateFragment';
import { alignFragmentsTool } from './recipes/alignFragments';
import { distributeFragmentsTool } from './recipes/distributeFragments';
import { circularArrayTool } from './recipes/circularArray';
import { duplicateFragmentTool } from './recipes/duplicateFragment';
import { deleteFragmentTool } from './recipes/deleteFragment';
import { paintRingsTool } from './recipes/paintRings';
import { rotatePerspectiveTool } from './recipes/rotatePerspective';
import { buildReactionSchemeTool } from './recipes/buildReactionScheme';
import { placeMoleculesTool } from './recipes/placeMolecules';
import { placeResonanceFormsTool } from './recipes/placeResonanceForms';
import { replaceFragmentTool } from './recipes/replaceFragment';

function enrichImportCommandInput(rawInput: unknown, ctx: AiExecutionContext): unknown {
  if (!rawInput || typeof rawInput !== 'object') return rawInput;
  const input = { ...(rawInput as Record<string, unknown>) };
  if (input.bondLengthPx == null && ctx.bondLengthPx != null) {
    input.bondLengthPx = ctx.bondLengthPx;
  }
  if (input.placement === 'viewport_center' || input.placement == null) {
    if (input.viewport == null && ctx.viewport) input.viewport = ctx.viewport;
    if (input.windowWidth == null && ctx.windowWidth != null) {
      input.windowWidth = ctx.windowWidth;
    }
    if (input.windowHeight == null && ctx.windowHeight != null) {
      input.windowHeight = ctx.windowHeight;
    }
    if (input.gridSlot == null && ctx.nextGridSlot) {
      input.gridSlot = ctx.nextGridSlot();
    }
    if (input.gridOrigin == null && ctx.nextGridOrigin) {
      input.gridOrigin = ctx.nextGridOrigin();
    }
    if (input.placement == null) input.placement = 'viewport_center';
  }
  return input;
}

function commandToTool(cmd: MoleculeCommand<unknown, unknown>): RegisteredAiTool {
  const meta = commandMeta(cmd);
  return {
    id: `command.${cmd.id}`,
    category: 'mutate',
    description: cmd.description,
    inputSchema: cmd.inputSchema as ZodType<unknown>,
    visibility: meta.visibility,
    destructive: meta.destructive,
    idempotent: meta.idempotent,
    tags: meta.tags,
    handler: (input, ctx) => {
      if (!ctx.applyCommand) {
        return toolFail(
          'NO_DISPATCHER',
          `Command ${cmd.id} requires ctx.applyCommand. Mutating tools cannot run in a read-only context.`,
        );
      }
      const enriched =
        cmd.id === CMD.ImportMolblock || cmd.id === CMD.ReplaceFromMolblock
          ? enrichImportCommandInput(input, ctx)
          : input;
      const r = ctx.applyCommand(cmd.id, enriched);
      if (!r.ok) {
        return toolFail(
          toToolErrorCode(r.error?.code),
          r.error?.message ?? `Command ${cmd.id} failed`,
          r.error?.details,
        );
      }
      return toolOk({ extra: r.extra });
    },
  };
}

/** Hand-authored read / async / meta / recipe tools. */
export const HAND_AUTHORED_TOOLS: readonly RegisteredAiTool[] = [
  statsTool,
  exportMolblockTool,
  getStructureTool,
  getCanvasStateTool,
  findRingsTool,
  getSelectionTool,
  listAnnotationsTool,
  listGlasswareTool,
  exportSmilesTool,
  renderTool,
  findSubstructureTool,
  cleanupTool,
  importSmilesTool,
  aromatizeTool,
  explicitHydrogensTool,
  checkStructureTool,
  automapTool,
  cipStereoTool,
  undoTool,
  redoTool,
  setSelectionTool,
  batchTool,
  listToolsTool,
  ...FACADE_TOOLS,
  colorRingsTool,
  colorSelectionTool,
  colorByElementTool,
  colorByBondOrderTool,
  applyDisplayStyleTool,
  placeTemplateTool,
  placeMoleculesTool,
  placeResonanceFormsTool,
  placeGlasswareTool,
  buildLabManualTool,
  moveFragmentTool,
  rotateFragmentTool,
  alignFragmentsTool,
  distributeFragmentsTool,
  circularArrayTool,
  duplicateFragmentTool,
  deleteFragmentTool,
  replaceFragmentTool,
  paintRingsTool,
  rotatePerspectiveTool,
  buildReactionSchemeTool,
];

/** Auto-generated `command.*` tools from core registry (excludes async-context ids). */
export const COMMAND_TOOLS: readonly RegisteredAiTool[] = listCommands()
  .filter(cmd => !ASYNC_CONTEXT_COMMAND_IDS.has(cmd.id))
  .map(commandToTool);

export const ALL_AI_TOOLS: readonly RegisteredAiTool[] = [
  ...HAND_AUTHORED_TOOLS,
  ...COMMAND_TOOLS,
];
