import type { Molecule, ReactionArrow, ReactionArrowKind } from './types';

export interface ReactionStepSummary {
  arrowId: string;
  stepIndex: number;
  reagentAbove?: string;
  reagentBelow?: string;
  kind?: ReactionArrowKind;
  /** Arrow endpoints (canvas px). */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface ReactionGroupSummary {
  groupId: string;
  title?: string;
  steps: ReactionStepSummary[];
}

/**
 * Group reaction arrows that declare `multiStepGroupId` + `stepIndex` for AI / export summaries.
 */
export const summarizeReactionMultiStepGroups = (mol: Molecule): ReactionGroupSummary[] => {
  const arrows = mol.reactionArrows ?? [];
  const byGroup = new Map<string, ReactionArrow[]>();
  for (const a of arrows) {
    if (!a.multiStepGroupId || a.stepIndex == null) continue;
    const list = byGroup.get(a.multiStepGroupId) ?? [];
    list.push(a);
    byGroup.set(a.multiStepGroupId, list);
  }
  const meta = mol.reactionMultiStepGroups ?? {};
  const out: ReactionGroupSummary[] = [];
  for (const [groupId, list] of byGroup) {
    const sorted = [...list].sort((a, b) => (a.stepIndex ?? 0) - (b.stepIndex ?? 0));
    out.push({
      groupId,
      title: meta[groupId]?.title,
      steps: sorted.map(a => ({
        arrowId: a.id,
        stepIndex: a.stepIndex ?? 0,
        reagentAbove: a.reagentAbove,
        reagentBelow: a.reagentBelow,
        kind: a.kind,
        x1: a.x1,
        y1: a.y1,
        x2: a.x2,
        y2: a.y2,
      })),
    });
  }
  out.sort((a, b) => a.groupId.localeCompare(b.groupId));
  return out;
};
