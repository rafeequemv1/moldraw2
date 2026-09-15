import { TOOL_DEFS, type ToolDef } from '../toolDefs';

export type ToolLocaleEntry = {
  label: string;
  title: string;
  shortLabel?: string;
};

export type ToolLocaleOverrides = Record<string, Partial<ToolLocaleEntry>>;

/** Build full tools table from TOOL_DEFS + per-language overrides. */
export function buildToolsLocale(overrides: ToolLocaleOverrides): Record<string, ToolLocaleEntry> {
  const out: Record<string, ToolLocaleEntry> = {};
  for (const tool of TOOL_DEFS) {
    const o = overrides[tool.id];
    const entry: ToolLocaleEntry = {
      label: o?.label ?? tool.label,
      title: o?.title ?? tool.title,
    };
    const short = o?.shortLabel ?? tool.shortLabel;
    if (short) entry.shortLabel = short;
    out[tool.id] = entry;
  }
  return out;
}

export function toolField(
  t: (key: string) => string,
  toolId: string,
  field: keyof ToolLocaleEntry,
  fallback: string,
): string {
  const key = `tools.${toolId}.${field}`;
  const translated = t(key);
  return translated === key ? fallback : translated;
}

export function localizeTool(tool: ToolDef, t: (key: string) => string): ToolDef {
  return {
    ...tool,
    label: toolField(t, tool.id, 'label', tool.label),
    title: toolField(t, tool.id, 'title', tool.title),
    shortLabel: tool.shortLabel
      ? toolField(t, tool.id, 'shortLabel', tool.shortLabel)
      : undefined,
  };
}
