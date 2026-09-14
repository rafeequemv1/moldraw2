import type { ZodType } from 'zod';
import { executeAiTool } from '../executor';
import { listAiToolsByCategory } from '../registry';
import type { RegisteredAiTool } from '../tools/types';
import type { AiExecutionContext } from '../types';
import { zodToOpenApiParameters } from '../zodToOpenApi';
import type { ChatFocusBounds, ChatMessage, LlmToolDefinition } from './types';
import {
  classifyChatIntent,
  toolIdsForIntent,
  type ChatIntent,
} from './intentRouter';

export { classifyChatIntent, userRequestsCanvasEdit, type ChatIntent } from './intentRouter';

/**
 * High-value `command.*` tools for in-app chat. Full registry stays available to MCP;
 * chat uses intent subsets so Gemini only sees relevant schemas.
 *
 * Formerly MCP-only / denied commands (lone pairs, stereo invert/flip/swap, SRU,
 * strokes, images, arrow edit, molblock/paste, 3D pose/flatten, perspective depth)
 * are allowlisted here and routed via intentRouter.
 */
const CHAT_COMMAND_ALLOWLIST = new Set([
  'command.molecule.addAtom',
  'command.molecule.addBond',
  'command.molecule.updateBond',
  'command.molecule.updateAtomElement',
  'command.molecule.updateAtomCharge',
  'command.molecule.updateAtomLonePairs',
  'command.molecule.setAtomAlias',
  'command.molecule.setAtomIsotope',
  'command.molecule.invertStereoAtAtom',
  'command.molecule.flipBondEndpoints',
  'command.molecule.swapAtomPositions',
  'command.molecule.addRing',
  'command.molecule.addBoatRing',
  'command.molecule.addChairRing',
  'command.molecule.addChain',
  'command.molecule.clearAll',
  'command.molecule.deleteAtoms',
  'command.molecule.deleteBonds',
  'command.molecule.deleteSelection',
  'command.molecule.moveAtoms',
  'command.molecule.rotateAtoms',
  'command.molecule.reflectAtoms',
  'command.molecule.duplicateAtoms',
  'command.molecule.addReactionArrow',
  'command.molecule.updateReactionArrow',
  'command.molecule.deleteReactionArrow',
  'command.molecule.addReactionMultiStep',
  'command.molecule.addCanvasText',
  'command.molecule.updateCanvasText',
  'command.molecule.deleteCanvasText',
  'command.molecule.addCanvasShape',
  'command.molecule.updateCanvasShape',
  'command.molecule.deleteCanvasShape',
  'command.molecule.addStroke',
  'command.molecule.deleteStroke',
  'command.molecule.addSruBracket',
  'command.molecule.updateSruBracket',
  'command.molecule.deleteSruBracket',
  'command.molecule.addCanvasImage',
  'command.molecule.updateCanvasImage',
  'command.molecule.deleteCanvasImage',
  'command.molecule.importMolblock',
  'command.molecule.pasteFragment',
  'command.molecule.apply3DPose',
  'command.molecule.clear3DPose',
  'command.molecule.flatten3DPose',
  'command.molecule.rotate3DPose',
  'command.molecule.setPerspectiveDepthShading',
  'command.molecule.setPerspectiveDepthFade',
  'command.molecule.setPerspectiveDepthWedges',
  'command.molecule.setStructureTheme',
  'command.molecule.applySelectionColor',
  'command.molecule.clearSelectionColors',
  'command.molecule.applySelectionDisplayStyle',
  'command.molecule.applyRingFill',
  'command.molecule.transaction',
]);

/** Internal worker-result plumbing — keep out of chat. */
const CHAT_TOOL_DENYLIST = new Set(['molecule.apply_cleanup_result']);

function slimDescription(description: string): string {
  const t = description.trim();
  if (t.length <= 140) return t;
  return `${t.slice(0, 139)}…`;
}

function runtimeTools(): readonly RegisteredAiTool[] {
  return listAiToolsByCategory();
}

function toLlmTool(tool: RegisteredAiTool): LlmToolDefinition {
  return {
    name: tool.id,
    description: slimDescription(tool.description),
    parameters: zodToOpenApiParameters(tool.inputSchema as ZodType),
  };
}

function isChatEligible(tool: RegisteredAiTool): boolean {
  if (CHAT_TOOL_DENYLIST.has(tool.id)) return false;
  if (!tool.id.startsWith('command.')) return true;
  if (tool.category === 'async' || tool.category === 'meta') return true;
  return CHAT_COMMAND_ALLOWLIST.has(tool.id);
}

/** Full registry (MCP / headless). */
export function buildLlmToolsFromRegistry(): LlmToolDefinition[] {
  return runtimeTools().map(toLlmTool);
}

/** Full curated chat catalog (fallback / MCP-style listing). */
export function buildLlmToolsForChat(): LlmToolDefinition[] {
  return runtimeTools().filter(isChatEligible).map(toLlmTool);
}

/**
 * Intent-scoped tools for one user turn — much smaller payload than the full catalog.
 */
export function buildLlmToolsForIntent(intent: ChatIntent): LlmToolDefinition[] {
  const want = new Set(toolIdsForIntent(intent));
  const selected = runtimeTools().filter(t => want.has(t.id) && isChatEligible(t));
  // If heuristics miss a registered id, fall back to a small general set.
  if (selected.length === 0) {
    return buildLlmToolsForIntent('general');
  }
  return selected.map(toLlmTool);
}

/** Convenience: classify text → tools. */
export function buildLlmToolsForUserText(text: string): LlmToolDefinition[] {
  return buildLlmToolsForIntent(classifyChatIntent(text));
}

function formatZodIssue(details: unknown): string | undefined {
  if (!details || typeof details !== 'object') return undefined;
  const flat = details as { fieldErrors?: Record<string, string[]>; formErrors?: string[] };
  const parts: string[] = [];
  if (flat.formErrors?.length) parts.push(...flat.formErrors.slice(0, 3));
  if (flat.fieldErrors) {
    for (const [field, errs] of Object.entries(flat.fieldErrors)) {
      if (errs?.length) parts.push(`${field}: ${errs[0]}`);
      if (parts.length >= 4) break;
    }
  }
  if (!parts.length && Array.isArray((details as { issues?: { message: string; path: unknown[] }[] }).issues)) {
    for (const issue of (details as { issues: { message: string; path: unknown[] }[] }).issues.slice(0, 4)) {
      const path = issue.path?.length ? issue.path.join('.') : 'input';
      parts.push(`${path}: ${issue.message}`);
    }
  }
  if (!parts.length) return undefined;
  const joined = parts.join('; ');
  return joined.length > 160 ? `${joined.slice(0, 159)}…` : joined;
}

/** Run a single tool call through the shared executor. */
export async function runToolCall(
  toolId: string,
  input: unknown,
  ctx: AiExecutionContext,
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const result = await executeAiTool(toolId, input, ctx);
  if (result.ok) {
    return { ok: true, data: result.data };
  }
  const detail = formatZodIssue(result.error.details);
  const shortBase = shortenToolErrorMessage(result.error.message);
  return {
    ok: false,
    error: detail ? `${shortBase} — ${detail}` : shortBase,
    data: result.error.details,
  };
}

function shortenToolErrorMessage(message: string): string {
  const m = message.trim();
  if (/invalid input/i.test(m)) return 'invalid input';
  if (m.length > 120) return `${m.slice(0, 119)}…`;
  return m;
}

/** Short label for chat UI when a tool runs. */
export function formatToolSummary(toolId: string, ok: boolean, error?: string): string {
  const action = ok ? 'Applied' : 'Failed';
  const name = toolId.startsWith('command.') ? toolId.slice('command.'.length) : toolId;
  if (!ok && error) {
    const short = error.length > 140 ? `${error.slice(0, 139)}…` : error;
    return `${action} ${name}: ${short}`;
  }
  return `${action} ${name}`;
}

/** Human-readable progress line while a tool is running. */
export function formatToolProgressLabel(toolId: string, args?: unknown): string {
  const id = toolId.startsWith('command.') ? toolId.slice('command.'.length) : toolId;
  const a =
    args && typeof args === 'object' && !Array.isArray(args)
      ? (args as Record<string, unknown>)
      : {};

  if (id === 'molecule.importSmiles' || id.endsWith('.importSmiles')) {
    const smiles =
      typeof a.smiles === 'string'
        ? a.smiles.trim()
        : typeof a.name === 'string'
          ? a.name.trim()
          : typeof a.SMILES === 'string'
            ? a.SMILES.trim()
            : '';
    if (smiles && looksLikeCompoundName(smiles)) {
      return `PubChem: looking up “${smiles.slice(0, 40)}${smiles.length > 40 ? '…' : ''}”`;
    }
    return smiles
      ? `Importing structure (${smiles.slice(0, 28)}${smiles.length > 28 ? '…' : ''})`
      : 'Importing structure…';
  }
  if (id === 'molecule.build_reaction_scheme') {
    const n = Array.isArray(a.compounds) ? a.compounds.length : 0;
    return n > 0 ? `Building ${n}-step reaction scheme…` : 'Building reaction scheme…';
  }
  if (id === 'molecule.cleanup' || id.endsWith('.cleanup')) return 'Cleaning up layout…';
  if (id === 'molecule.export_smiles' || id.endsWith('.exportSmiles')) return 'Exporting SMILES…';
  if (id === 'molecule.get_canvas_state') return 'Reading canvas…';
  if (id === 'molecule.render') return 'Rendering canvas preview…';
  if (id === 'molecule.stats') return 'Computing molecule stats…';
  if (id === 'molecule.replace_fragment') {
    const smiles = typeof a.smiles === 'string' ? a.smiles.trim() : '';
    const idx = typeof a.moleculeIndex === 'number' ? a.moleculeIndex : null;
    const where = idx != null ? `molecule ${idx}` : 'selected molecule';
    return smiles
      ? `Replacing ${where} with ${smiles.slice(0, 24)}${smiles.length > 24 ? '…' : ''}…`
      : `Replacing ${where}…`;
  }
  if (id === 'molecule.delete_fragment') return 'Deleting molecule…';
  if (id === 'molecule.place_molecules') {
    const n = Array.isArray(a.molecules) ? a.molecules.length : 0;
    return n > 0 ? `Placing ${n} molecules…` : 'Placing molecules…';
  }
  if (id === 'molecule.place_resonance_forms') {
    const n = Array.isArray(a.forms) ? a.forms.length : 0;
    return n > 0 ? `Drawing ${n} resonance forms…` : 'Drawing resonance forms…';
  }
  if (id === 'molecule.importMolblock' || id.endsWith('.importMolblock')) {
    return 'Importing molblock…';
  }
  if (id === 'molecule.pasteFragment' || id.endsWith('.pasteFragment')) {
    return 'Pasting fragment…';
  }
  if (id === 'molecule.flatten3DPose' || id.endsWith('.flatten3DPose')) {
    return 'Flattening 3D pose…';
  }
  if (id === 'molecule.apply3DPose' || id.endsWith('.apply3DPose')) {
    return 'Applying 3D pose…';
  }
  if (id === 'molecule.place_template') {
    const name = typeof a.name === 'string' ? a.name : '';
    return name ? `Placing template “${name}”…` : 'Placing template…';
  }
  if (id === 'molecule.color_by_element' || id === 'molecule.color_by_bond_order') {
    return 'Updating colors…';
  }
  if (id === 'molecule.color_selection' || id === 'molecule.color_rings' || id === 'molecule.paint_rings') {
    return 'Updating colors…';
  }
  if (id === 'molecule.apply_display_style' || id.endsWith('.applySelectionDisplayStyle')) {
    return 'Updating style…';
  }
  if (id === 'molecule.setStructureTheme' || id.endsWith('.setStructureTheme')) {
    return 'Updating structure theme…';
  }
  if (
    id === 'molecule.get_structure' ||
    id === 'molecule.get_selection' ||
    id === 'molecule.find_rings' ||
    id === 'molecule.find_substructure'
  ) {
    return 'Reading structure…';
  }
  if (id === 'molecule.set_selection' || id.endsWith('.applySelectionColor')) {
    return 'Updating canvas…';
  }
  // Never surface raw tool ids (molecule.*) in the chat UI.
  return 'Working on the canvas…';
}

/** Heuristic: common name / CAS vs SMILES string. */
function looksLikeCompoundName(q: string): boolean {
  const t = q.trim();
  if (/^\d{2,7}-\d{2}-\d$/.test(t)) return true;
  if (/[=#[\]()@\\/+]/.test(t)) return false;
  if (/\d/.test(t)) return false;
  return /^[A-Za-z][A-Za-z\s\-'.]{1,80}$/.test(t);
}

function asStringIds(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const ids = value.filter((x): x is string => typeof x === 'string' && x.length > 0);
  return ids.length ? ids : undefined;
}

function asFocusBounds(value: unknown): ChatFocusBounds | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const b = value as Record<string, unknown>;
  const { minX, maxX, minY, maxY } = b;
  if (
    typeof minX !== 'number' ||
    typeof maxX !== 'number' ||
    typeof minY !== 'number' ||
    typeof maxY !== 'number'
  ) {
    return undefined;
  }
  if (![minX, maxX, minY, maxY].every(Number.isFinite)) return undefined;
  return { minX, maxX, minY, maxY };
}

function focusLabelForTool(toolId: string, data: Record<string, unknown>): string {
  const id = toolId.startsWith('command.') ? toolId.slice('command.'.length) : toolId;
  if (id === 'molecule.build_reaction_scheme') {
    const n = typeof data.moleculeCount === 'number' ? data.moleculeCount : 0;
    return n > 0 ? `Reaction scheme (${n})` : 'Reaction scheme';
  }
  if (id === 'molecule.importSmiles' || id.endsWith('.importSmiles')) {
    return 'Imported structure';
  }
  if (id.endsWith('.importMolblock') || id.endsWith('.pasteFragment')) {
    return 'Added structure';
  }
  if (id.endsWith('.addRing') || id.endsWith('.addBoatRing') || id.endsWith('.addChairRing')) {
    return 'Ring on canvas';
  }
  if (id.endsWith('.addChain')) return 'Chain on canvas';
  if (id.endsWith('.addAtom')) return 'Atom on canvas';
  if (id === 'molecule.place_template') {
    const name = typeof data.name === 'string' ? data.name : typeof data.template === 'string' ? data.template : '';
    return name ? `Template “${name}”` : 'Template on canvas';
  }
  if (id.startsWith('molecule.') && (id.includes('fragment') || id.includes('move') || id.includes('rotate'))) {
    return 'Updated on canvas';
  }
  return 'Show on canvas';
}

/**
 * Pull focus targets from a tool result payload (before summarization wipes JSON).
 * Accepts either `runToolCall` shape `{ ok, data }` or nested `data.extra`.
 */
export function extractChatFocusTarget(
  toolResultJson: string,
  toolName?: string,
): Pick<ChatMessage, 'focusAtomIds' | 'focusBounds' | 'focusLabel'> | undefined {
  if (!toolName) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(toolResultJson);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== 'object') return undefined;
  const root = parsed as Record<string, unknown>;
  if (root.ok === false) return undefined;

  const data =
    root.data && typeof root.data === 'object'
      ? (root.data as Record<string, unknown>)
      : root;
  const extra =
    data.extra && typeof data.extra === 'object'
      ? (data.extra as Record<string, unknown>)
      : undefined;

  let focusAtomIds =
    asStringIds(data.newAtomIds) ??
    asStringIds(extra?.newAtomIds) ??
    asStringIds(data.atomIds);

  if (!focusAtomIds && Array.isArray(data.fragmentAtomIds)) {
    const flat: string[] = [];
    for (const group of data.fragmentAtomIds) {
      if (Array.isArray(group)) {
        for (const id of group) {
          if (typeof id === 'string' && id) flat.push(id);
        }
      }
    }
    if (flat.length) focusAtomIds = flat;
  }

  const focusBounds = asFocusBounds(data.bounds) ?? asFocusBounds(data.focusBounds);
  if (!focusAtomIds?.length && !focusBounds) return undefined;

  return {
    focusAtomIds,
    focusBounds,
    focusLabel: focusLabelForTool(toolName, data),
  };
}
