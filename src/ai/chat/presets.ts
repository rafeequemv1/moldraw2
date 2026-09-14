/** Quick-send prompts shown as pills in the chat panel. */
export interface ChatPresetPill {
  id: string;
  label: string;
  prompt: string;
}

export const CHAT_PRESET_PILLS: readonly ChatPresetPill[] = [
  {
    id: 'stats',
    label: 'Count atoms',
    prompt: 'How many atoms, bonds, and reaction arrows are in the current structure?',
  },
  {
    id: 'benzene',
    label: 'Benzene ring',
    prompt:
      'Add a benzene ring at center x=300, y=280 using molecule.addRing with numSides=6, isAromatic=true, angleOffset=0.',
  },
  {
    id: 'cyclohexane',
    label: 'Chair cyclohexane',
    prompt:
      'Add a chair cyclohexane ring at center x=420, y=280 with bondLengthPx=45 using molecule.addChairRing.',
  },
  {
    id: 'ethanol',
    label: 'Ethanol chain',
    prompt:
      'Add a 2-carbon chain (ethanol skeleton) through points (200,280) and (245,280) with placementElement C using molecule.addChain.',
  },
  {
    id: 'arrow',
    label: 'Reaction arrow',
    prompt:
      'Add a straight reaction arrow from (150, 200) to (350, 200) with a new unique id, default styling.',
  },
  {
    id: 'label',
    label: 'Text label',
    prompt:
      'Add canvas text "Product" at x=320, y=180 with fontSize 22, color #0f172a, id generated, fontWeight normal.',
  },
  {
    id: 'clear',
    label: 'Clear canvas',
    prompt: 'Clear the entire canvas using molecule.clearAll with an empty object {}.',
  },
  {
    id: 'mechanism-demo',
    label: 'Mechanism demo',
    prompt:
      'Insert the multi-step mechanism demo (carbonyl addition + enolate resonance with anchored arrows) using command.molecule.insertDemoMechanism with {}.',
  },
  {
    id: 'aspirin',
    label: 'Import aspirin',
    prompt:
      'Import aspirin using command.molecule.importSmiles with smiles "CC(=O)Oc1ccccc1C(=O)O" and mode merge.',
  },
  {
    id: 'cleanup',
    label: 'Cleanup structure',
    prompt: 'Run command.molecule.cleanup with an empty object {} to tidy the current layout.',
  },
] as const;
