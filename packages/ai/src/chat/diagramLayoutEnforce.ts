/**
 * Enforce chat Diagram toggle so "Both" / "Steps" always get glassware,
 * even when the model calls build_reaction_scheme alone.
 */

export type DiagramLayoutMode = 'glassware' | 'scheme' | 'both';

/** Default organic prep columns when the model omits steps. */
export const DEFAULT_LAB_MANUAL_STEPS = [
  {
    label: '1. Synthesis',
    setup: 'reflux',
    note: 'Reaction under reflux',
  },
  {
    label: '2. Workup',
    setup: 'extraction',
    note: 'Aqueous wash / extraction',
  },
  {
    label: '3. Isolation',
    setup: 'vacuum_filtration',
    note: 'Collect crude product',
  },
] as const;

function toolBaseName(name: string): string {
  const t = name.trim();
  if (t.endsWith('build_lab_manual') || t === 'molecule.build_lab_manual') {
    return 'molecule.build_lab_manual';
  }
  if (t.endsWith('build_reaction_scheme') || t === 'molecule.build_reaction_scheme') {
    return 'molecule.build_reaction_scheme';
  }
  return t;
}

function asRecord(args: unknown): Record<string, unknown> {
  if (args && typeof args === 'object' && !Array.isArray(args)) {
    return { ...(args as Record<string, unknown>) };
  }
  return {};
}

function hasSteps(args: Record<string, unknown>): boolean {
  return Array.isArray(args.steps) && args.steps.length > 0;
}

/**
 * Rewrite tool name/args so diagramLayoutMode is honored.
 * - both/glassware + build_reaction_scheme → build_lab_manual with default steps
 * - both/glassware + build_lab_manual without steps → inject default steps
 * - scheme mode forces layoutMode scheme
 */
export function enforceDiagramLayoutToolCall(
  name: string,
  args: unknown,
  diagramLayoutMode: DiagramLayoutMode,
): { name: string; args: unknown } {
  const base = toolBaseName(name);
  const a = asRecord(args);

  if (diagramLayoutMode === 'scheme') {
    if (base === 'molecule.build_lab_manual') {
      a.layoutMode = 'scheme';
      return { name: 'molecule.build_lab_manual', args: a };
    }
    return { name, args };
  }

  // glassware | both — must place apparatus
  if (base === 'molecule.build_reaction_scheme') {
    return {
      name: 'molecule.build_lab_manual',
      args: {
        // Preserve canvas unless the model explicitly requested a wipe.
        clear: a.clear === true,
        title: a.title,
        layoutMode: diagramLayoutMode,
        steps: [...DEFAULT_LAB_MANUAL_STEPS],
        compounds: a.compounds,
        arrows: a.arrows,
      },
    };
  }

  if (base === 'molecule.build_lab_manual') {
    a.layoutMode = diagramLayoutMode;
    if (!hasSteps(a)) {
      a.steps = [...DEFAULT_LAB_MANUAL_STEPS];
    }
    return { name: 'molecule.build_lab_manual', args: a };
  }

  return { name, args };
}
