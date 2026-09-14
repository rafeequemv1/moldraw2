import { moleculeToMolblock } from '@moldraw/core';
import {
  exportMolblockInputSchema,
  exportMolblockOutputSchema,
} from '../../schemas/exportMolblock';
import type { RegisteredAiTool } from '../types';
import { toolFail, toolOk } from '../types';

export const exportMolblockTool: RegisteredAiTool = {
  id: 'molecule.export_molblock',
  category: 'read',
  description: 'Serialize the current molecule to a V2000 molblock string.',
  inputSchema: exportMolblockInputSchema,
  handler: (_input, ctx) => {
    try {
      const molblock = moleculeToMolblock(ctx.getMolecule());
      const out = exportMolblockOutputSchema.safeParse({ molblock });
      if (!out.success) {
        return toolFail('EXECUTION', 'Molblock output validation failed', out.error.flatten());
      }
      return toolOk(out.data);
    } catch (e) {
      return toolFail(
        'EXECUTION',
        e instanceof Error ? e.message : 'Failed to serialize molblock',
        e,
      );
    }
  },
};
