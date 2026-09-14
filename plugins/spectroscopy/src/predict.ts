import { z } from 'zod';
import type { PluginServices } from '@moldraw/plugin-sdk';
import type { SpectroscopyKind, SpectroscopyPrediction } from './types';

const AI_REQUIRED =
  'Spectroscopy requires AI. Add a Gemini API key in Settings → AI.';

const SpectrumSchema = z.object({
  kind: z.enum(['nmr', 'mass', 'uv']),
  title: z.string(),
  formula: z.string(),
  molecularWeight: z.number(),
  xLabel: z.string(),
  yLabel: z.string(),
  peaks: z.array(
    z.object({
      x: z.number(),
      y: z.number(),
      label: z.string().optional(),
    }),
  ),
  table: z.array(z.array(z.string())),
  notes: z.array(z.string()),
  disclaimer: z.string(),
});

const SYSTEM_PROMPT = `You are an expert computational chemist. Given a chemical structure (molblock and/or SMILES), predict realistic spectroscopic data.

Return JSON only matching the schema. Peaks should be chemically plausible for the structure.
Use relative intensity 0–100 for y values. Include a data table with column headers as the first row.
Disclaimer must state predictions are AI-generated estimates, not experimental data.`;

async function predictWithAi(
  services: PluginServices,
  kind: SpectroscopyKind,
  opts?: { nucleus?: '1H' | '13C' },
): Promise<SpectroscopyPrediction> {
  if (!services.ai.isAvailable()) {
    throw new Error(AI_REQUIRED);
  }

  const molblock = services.document.exportMolblock();
  const smiles = await services.document.exportSmiles();
  const selection = services.document.getSelection();
  const hasSelection = (selection.atomIds?.length ?? 0) > 0;

  const kindLabel =
    kind === 'nmr'
      ? `${opts?.nucleus ?? '1H'} NMR`
      : kind === 'mass'
        ? 'EI mass spectrometry'
        : 'UV-Vis absorption';

  const user = [
    `Predict ${kindLabel} for this structure.`,
    hasSelection ? 'Use the current atom selection as the fragment of interest.' : 'Use the full canvas structure.',
    '',
    'SMILES:',
    smiles || '(unavailable)',
    '',
    'Molblock:',
    molblock || '(empty)',
  ].join('\n');

  services.logger.info(`Requesting AI ${kindLabel} prediction`);

  const result = await services.ai.generateStructured({
    system: SYSTEM_PROMPT,
    user,
    schema: SpectrumSchema,
  });

  return { ...result, kind };
}

export function createSpectroscopyTools(services: PluginServices) {
  const runAndShow = async (
    kind: SpectroscopyKind,
    nucleus?: '1H' | '13C',
  ): Promise<SpectroscopyPrediction> => {
    const molblock = services.document.exportMolblock();
    if (!molblock.trim()) {
      throw new Error('No structure on canvas to predict spectroscopy for.');
    }
    const prediction = await predictWithAi(services, kind, { nucleus });
    services.ui.openModal('spectroscopy-result', { result: prediction });
    return prediction;
  };

  return {
    predictNmr: (nucleus: '1H' | '13C' = '1H') => runAndShow('nmr', nucleus),
    predictMass: () => runAndShow('mass'),
    predictUv: () => runAndShow('uv'),
    AI_REQUIRED,
  };
}

export function registerSpectroscopyAiTools(
  services: PluginServices,
  register: (tool: import('@moldraw/plugin-sdk').PluginAiToolContribution) => void,
): void {
  const { predictNmr, predictMass, predictUv, AI_REQUIRED } = createSpectroscopyTools(services);

  const guard = () => {
    if (!services.ai.isAvailable()) throw new Error(AI_REQUIRED);
  };

  register({
    id: 'molecule.predict_nmr',
    category: 'read',
    description:
      'Predict ¹H or ¹³C NMR spectrum via AI for the selection or whole canvas. Opens the spectrum viewer.',
    inputSchema: z
      .object({
        nucleus: z.enum(['1H', '13C']).optional().describe('NMR nucleus (default 1H).'),
      })
      .optional(),
    handler: async input => {
      guard();
      const nucleus = (input as { nucleus?: '1H' | '13C' } | undefined)?.nucleus ?? '1H';
      return predictNmr(nucleus);
    },
  });

  register({
    id: 'molecule.predict_mass_spectrum',
    category: 'read',
    description:
      'Predict EI mass spectrum via AI for the selection or whole canvas. Opens the spectrum viewer.',
    inputSchema: z.object({}).optional(),
    handler: async () => {
      guard();
      return predictMass();
    },
  });

  register({
    id: 'molecule.predict_uv',
    category: 'read',
    description:
      'Predict UV-Vis spectrum via AI for the selection or whole canvas. Opens the spectrum viewer.',
    inputSchema: z.object({}).optional(),
    handler: async () => {
      guard();
      return predictUv();
    },
  });
}

export { AI_REQUIRED as SPECTROSCOPY_AI_REQUIRED };
