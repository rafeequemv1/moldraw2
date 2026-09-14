import { z } from 'zod';

export const exportMolblockInputSchema = z.object({});

export type ExportMolblockInput = z.infer<typeof exportMolblockInputSchema>;

export const exportMolblockOutputSchema = z.object({
  molblock: z.string(),
});

export type ExportMolblockOutput = z.infer<typeof exportMolblockOutputSchema>;
