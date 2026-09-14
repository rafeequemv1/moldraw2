import {
  AMINO_ACID_TEMPLATES,
  FUNCTIONAL_GROUP_TEMPLATES,
  LIGAND_TEMPLATES,
  STRUCTURE_3D_TEMPLATES,
} from '@moldraw/templates';
import { placeTemplateInputSchema } from '../../schemas/tools';
import type { RegisteredAiTool } from '../types';
import { toolFail, toolOk } from '../types';

function resolveTemplateSmiles(
  name: string,
): { id: string; label: string; smiles: string; molblock?: string } | null {
  const q = name.trim().toLowerCase();
  if (!q) return null;

  for (const fg of FUNCTIONAL_GROUP_TEMPLATES) {
    if (fg.id === q || fg.label.toLowerCase() === q) {
      return { id: fg.id, label: fg.label, smiles: fg.smiles.replace(/\[\*\]/g, '') };
    }
  }
  for (const aa of AMINO_ACID_TEMPLATES) {
    if (aa.code.toLowerCase() === q || aa.name.toLowerCase() === q) {
      return { id: aa.code, label: aa.name, smiles: aa.smiles };
    }
  }
  for (const lig of LIGAND_TEMPLATES) {
    if (
      lig.id.toLowerCase() === q ||
      lig.label.toLowerCase() === q ||
      lig.name.toLowerCase() === q
    ) {
      return { id: lig.id, label: lig.label, smiles: lig.smiles.replace(/\[\*\]/g, '') };
    }
  }
  for (const s of STRUCTURE_3D_TEMPLATES) {
    if (
      s.id.toLowerCase() === q ||
      s.label.toLowerCase() === q ||
      s.name.toLowerCase() === q
    ) {
      if (s.smiles) return { id: s.id, label: s.label, smiles: s.smiles, molblock: undefined };
      if (s.molblock) return { id: s.id, label: s.label, smiles: '', molblock: s.molblock };
    }
  }

  // Fuzzy: substring match on FG / AA
  const fgHit = FUNCTIONAL_GROUP_TEMPLATES.find(
    t => t.label.toLowerCase().includes(q) || t.id.includes(q),
  );
  if (fgHit) {
    return { id: fgHit.id, label: fgHit.label, smiles: fgHit.smiles.replace(/\[\*\]/g, '') };
  }
  const aaHit = AMINO_ACID_TEMPLATES.find(
    t => t.name.toLowerCase().includes(q) || t.code.toLowerCase() === q,
  );
  if (aaHit) return { id: aaHit.code, label: aaHit.name, smiles: aaHit.smiles };

  return null;
}

export const placeTemplateTool: RegisteredAiTool = {
  id: 'molecule.place_template',
  category: 'recipe',
  description:
    'Place a named template from the Moldraw library (functional groups like Ph/COOH, amino acids, ligands) by importing its SMILES.',
  inputSchema: placeTemplateInputSchema,
  handler: async (input, ctx) => {
    const { name, mode = 'merge' } = input as { name: string; mode?: 'merge' | 'replace' };
    const resolved = resolveTemplateSmiles(name);
    if (!resolved) {
      return toolFail(
        'EXECUTION',
        `Unknown template "${name}". Try FG labels (Ph, COOH, Me), amino-acid names/codes, or ligand ids.`,
      );
    }
    if (resolved.molblock) {
      if (ctx.importMolblock) {
        const r = await ctx.importMolblock(resolved.molblock, {
          mode,
          placement: 'viewport_center',
          useViewportGrid: true,
          compoundName: resolved.label,
        });
        if (!r.ok) return toolFail('EXECUTION', r.error ?? 'Template import failed');
        return toolOk({
          templateId: resolved.id,
          label: resolved.label,
          newAtomIds: r.newAtomIds,
        });
      }
      return toolFail('NO_DISPATCHER', 'Molblock template requires ctx.importMolblock.');
    }
    if (!ctx.importSmiles && !ctx.applyCommand) {
      return toolFail(
        'NO_DISPATCHER',
        'molecule.place_template requires ctx.importSmiles or ctx.applyCommand.',
      );
    }
    if (ctx.importSmiles) {
      const r = await ctx.importSmiles(resolved.smiles, {
        mode,
        placement: 'viewport_center',
        useViewportGrid: true,
        compoundName: resolved.label,
      });
      if (!r.ok) return toolFail('EXECUTION', r.error ?? 'Template import failed');
      return toolOk({
        templateId: resolved.id,
        label: resolved.label,
        smiles: resolved.smiles,
        newAtomIds: r.newAtomIds,
      });
    }
    const r = ctx.applyCommand!('molecule.importSmiles', {
      smiles: resolved.smiles,
      mode,
      placement: 'viewport_center',
    });
    if (!r.ok) {
      return toolFail('EXECUTION', r.error?.message ?? 'Template import failed');
    }
    const extra = (r.extra as { newAtomIds?: string[] } | undefined) ?? {};
    return toolOk({
      templateId: resolved.id,
      label: resolved.label,
      smiles: resolved.smiles,
      newAtomIds: extra.newAtomIds,
    });
  },
};
