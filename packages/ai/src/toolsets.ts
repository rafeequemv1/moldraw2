/**
 * Toolsets + MCP annotations derived from tool metadata.
 *
 *  - `minimal`  — façades (`draw.*` / `edit.*`), read tools, undo/redo/batch/
 *                 list_tools and the async chemistry helpers. ≈ 30 tools, fits
 *                 clients with tool caps (Cursor ≈ 40). **Default for MCP.**
 *  - `core`     — minimal + core recipes + core `command.*` (everyday drawing).
 *  - `advanced` — core + niche commands (arrays, perspective, styling, glassware).
 *  - `full`     — everything, including canvas-tool plumbing (`internal`).
 *
 * Any known tool can still be *called* regardless of the active toolset; the
 * toolset only shapes `tools/list`, so agents are not flooded with 150+ entries.
 * `moldraw.list_tools` searches the full catalogue from any toolset.
 */
import type { CommandVisibility } from '@moldraw/core';
import type { RegisteredAiTool } from './tools/types';

export type Toolset = 'minimal' | 'core' | 'advanced' | 'full';

export const TOOLSETS: readonly Toolset[] = ['minimal', 'core', 'advanced', 'full'];

/** Toolset advertised by the stdio MCP server when none is configured. */
export const DEFAULT_MCP_TOOLSET: Toolset = 'minimal';

/** Categories that make up the `minimal` toolset (in addition to `core` visibility). */
const MINIMAL_CATEGORIES = new Set(['facade', 'read', 'meta', 'async']);

export function resolveToolset(raw: string | undefined | null, fallback: Toolset = DEFAULT_MCP_TOOLSET): Toolset {
  const v = (raw ?? '').trim().toLowerCase();
  return (TOOLSETS as readonly string[]).includes(v) ? (v as Toolset) : fallback;
}

/** Hand-authored tools without explicit `visibility` fall back by category / id. */
const ADVANCED_HAND_AUTHORED = new Set([
  'molecule.list_glassware',
  'molecule.color_rings',
  'molecule.color_selection',
  'molecule.color_by_element',
  'molecule.color_by_bond_order',
  'molecule.apply_display_style',
  'molecule.paint_rings',
  'molecule.place_glassware',
  'molecule.build_lab_manual',
  'molecule.circular_array',
  'molecule.rotate_perspective',
  'molecule.place_resonance_forms',
  'molecule.automap',
]);

export function toolVisibility(tool: RegisteredAiTool): CommandVisibility {
  if (tool.visibility) return tool.visibility;
  if (tool.id.startsWith('plugin.')) return 'advanced';
  if (ADVANCED_HAND_AUTHORED.has(tool.id)) return 'advanced';
  return 'core';
}

export function isToolInToolset(tool: RegisteredAiTool, toolset: Toolset): boolean {
  const v = toolVisibility(tool);
  if (toolset === 'full') return true;
  if (toolset === 'advanced') return v !== 'internal';
  if (toolset === 'core') return v === 'core';
  return v === 'core' && MINIMAL_CATEGORIES.has(tool.category) && !tool.id.startsWith('command.');
}

export function isReadOnlyTool(tool: RegisteredAiTool): boolean {
  return tool.category === 'read';
}

/** MCP `annotations` block (2025-03-26 spec). */
export function toolAnnotations(tool: RegisteredAiTool): {
  title: string;
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
} {
  const readOnly = isReadOnlyTool(tool);
  return {
    title: tool.title ?? tool.id,
    readOnlyHint: readOnly,
    destructiveHint: readOnly ? false : tool.destructive ?? false,
    idempotentHint: readOnly ? true : tool.idempotent ?? false,
    openWorldHint: false,
  };
}
