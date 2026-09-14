import { z } from 'zod';

/** No parameters — stats are derived from `AiExecutionContext.getMolecule()`. */
export const moleculeStatsInputSchema = z.object({});

export type MoleculeStatsInput = z.infer<typeof moleculeStatsInputSchema>;

export const moleculeStatsOutputSchema = z.object({
  moleculeCount: z.number().int().nonnegative(),
  atomCount: z.number().int().nonnegative(),
  bondCount: z.number().int().nonnegative(),
  strokeCount: z.number().int().nonnegative(),
  canvasTextCount: z.number().int().nonnegative(),
  reactionArrowCount: z.number().int().nonnegative(),
  empiricalFormula: z.string(),
  molecularWeight: z.number(),
});

export type MoleculeStatsOutput = z.infer<typeof moleculeStatsOutputSchema>;
