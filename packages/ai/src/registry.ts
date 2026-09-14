/**
 * Thin assembler — hand-authored tools live under `tools/`; mutating
 * `command.*` tools are auto-derived from `@moldraw/core` commands.
 */
import type { AiToolCategory, RegisteredAiTool } from './tools/types';
import { ALL_AI_TOOLS, HAND_AUTHORED_TOOLS } from './tools';
import { getRuntimePluginTools } from './runtimePluginTools';
import { isToolInToolset, type Toolset } from './toolsets';

/**
 * Stable, registry-known read-only / recipe tool ids (hand-authored).
 * Mutating tools are auto-registered as `command.<id>`.
 */
export const AI_TOOL_IDS = [
  'molecule.stats',
  'molecule.export_molblock',
  'molecule.get_structure',
  'molecule.get_canvas_state',
  'molecule.find_rings',
  'molecule.get_selection',
  'molecule.list_annotations',
  'molecule.list_glassware',
  'molecule.export_smiles',
  'molecule.render',
  'molecule.find_substructure',
  'molecule.color_rings',
  'molecule.color_selection',
  'molecule.color_by_element',
  'molecule.color_by_bond_order',
  'molecule.apply_display_style',
  'molecule.place_template',
  'molecule.place_molecules',
  'molecule.place_resonance_forms',
  'molecule.place_glassware',
  'molecule.build_lab_manual',
  'molecule.move_fragment',
  'molecule.rotate_fragment',
  'molecule.align_fragments',
  'molecule.distribute_fragments',
  'molecule.duplicate_fragment',
  'molecule.delete_fragment',
  'molecule.replace_fragment',
  'molecule.paint_rings',
  'molecule.rotate_perspective',
  'molecule.build_reaction_scheme',
  'molecule.aromatize',
  'molecule.explicit_hydrogens',
  'molecule.check_structure',
  'molecule.automap',
  'molecule.cip_stereo',
  'molecule.undo',
  'molecule.redo',
  'molecule.set_selection',
  'molecule.batch',
  'moldraw.list_tools',
  'draw.smiles',
  'draw.atom',
  'draw.bond',
  'draw.ring',
  'draw.chain',
  'draw.text',
  'draw.arrow',
  'edit.atom',
  'edit.bond',
  'edit.delete',
] as const;

export type AiToolId = (typeof AI_TOOL_IDS)[number];

export type { RegisteredAiTool, AiToolCategory };

export const AI_TOOL_REGISTRY: readonly RegisteredAiTool[] = ALL_AI_TOOLS;

const byId = new Map<string, RegisteredAiTool>(AI_TOOL_REGISTRY.map(t => [t.id, t]));

function runtimeById(): Map<string, RegisteredAiTool> {
  const merged = new Map(byId);
  for (const t of getRuntimePluginTools()) {
    merged.set(t.id, t);
  }
  return merged;
}

/**
 * Resolve Gemini/LLM short names to registry ids.
 * e.g. `build_reaction_scheme` → `molecule.build_reaction_scheme`,
 * `importSmiles` → `command.molecule.importSmiles`.
 */
export function resolveAiToolId(id: string): string | undefined {
  const raw = id.trim();
  if (!raw) return undefined;
  if (runtimeById().has(raw)) return raw;

  const stripped = raw
    .replace(/^command\./, '')
    .replace(/^molecule\./, '')
    .replace(/^command\.molecule\./, '');

  const candidates = [
    raw,
    `molecule.${stripped}`,
    `command.molecule.${stripped}`,
    `command.${stripped}`,
    stripped,
  ];
  for (const c of candidates) {
    if (runtimeById().has(c)) return c;
  }
  return undefined;
}

export const getRegisteredAiTool = (id: string): RegisteredAiTool | undefined => {
  const resolved = resolveAiToolId(id);
  return resolved ? runtimeById().get(resolved) : undefined;
};

export const listAiToolIds = (): readonly string[] => [
  ...AI_TOOL_REGISTRY.map(t => t.id),
  ...getRuntimePluginTools().map(t => t.id),
];

export function listAiToolsByCategory(category?: AiToolCategory): readonly RegisteredAiTool[] {
  const all = [...AI_TOOL_REGISTRY, ...getRuntimePluginTools()];
  if (!category) return all;
  return all.filter(t => t.category === category);
}

export function listHandAuthoredToolIds(): readonly string[] {
  return HAND_AUTHORED_TOOLS.map(t => t.id);
}

/** Tools visible in a toolset (`core` by default; see `toolsets.ts`). */
export function listAiToolsForToolset(toolset: Toolset = 'core'): readonly RegisteredAiTool[] {
  return listAiToolsByCategory().filter(t => isToolInToolset(t, toolset));
}
