import type { ReactionTemplate } from '../types';

/**
 * Curated named reactions — local catalogue (Supabase sync later).
 * SMILES are layout-ready; labels carry common names for the canvas.
 */
export const NAMED_REACTIONS: readonly ReactionTemplate[] = [
  {
    id: 'sn2-methyl',
    name: 'SN2 — methyl bromide',
    label: 'SN2',
    categoryId: 'substitution',
    summary: 'Backside attack at saturated carbon; inversion of configuration.',
    mechanism:
      'Concerted bond-making and bond-breaking. Nucleophile attacks from the side opposite the leaving group (Walden inversion). Favored for primary substrates and good nucleophiles in polar aprotic solvents.',
    compounds: [
      { smiles: 'CBr', labelBelow: 'CH₃Br' },
      { smiles: 'CO', labelBelow: 'CH₃OH' },
    ],
    steps: [
      {
        label: 'Nucleophilic substitution',
        reagentBelow: 'NaOH, DMSO, rt',
        mechanism: 'HO⁻ displaces Br⁻ in one step via pentacoordinate transition state.',
      },
    ],
    tags: ['SN2', 'nucleophilic substitution'],
    aliases: ['bimolecular nucleophilic substitution'],
  },
  {
    id: 'sn1-tert-butyl',
    name: 'SN1 — tert-butyl chloride',
    label: 'SN1',
    categoryId: 'substitution',
    summary: 'Ionization to carbocation, then nucleophilic capture.',
    mechanism:
      'Rate-determining loss of leaving group gives a planar carbocation. Nucleophile attacks either face; racemization possible at the stereocenter.',
    compounds: [
      { smiles: 'CC(C)(C)Cl', labelBelow: 't-BuCl' },
      { smiles: 'CC(C)(C)O', labelBelow: 't-BuOH' },
    ],
    steps: [
      {
        label: 'Solvolysis',
        reagentBelow: 'H₂O, heat',
        mechanism: 'Cl⁻ leaves to form tert-butyl cation; water traps the cation.',
      },
    ],
    tags: ['SN1', 'carbocation'],
  },
  {
    id: 'e2-2-bromobutane',
    name: 'E2 — 2-bromobutane',
    label: 'E2',
    categoryId: 'elimination',
    summary: 'Anti-periplanar elimination gives alkene.',
    mechanism:
      'Base removes β-proton as C–LG bond breaks. Requires anti geometry. More substituted alkene often favored (Zaitsev).',
    compounds: [
      { smiles: 'CC(Br)CC', labelBelow: '2-bromobutane' },
      { smiles: 'C=CCC', labelBelow: '2-butene' },
    ],
    steps: [
      {
        label: 'β-Elimination',
        reagentBelow: 'KOt-Bu, t-BuOH, heat',
        mechanism: 'Concerted anti elimination of H and Br.',
      },
    ],
    tags: ['E2', 'elimination'],
  },
  {
    id: 'friedel-crafts-acylation',
    name: 'Friedel–Crafts acylation',
    label: 'F–C acylation',
    categoryId: 'aromatic',
    summary: 'Acyl cation equivalent acylates benzene ring.',
    mechanism:
      'Lewis acid activates acyl chloride toward electrophilic aromatic substitution. Acylium ion is the active electrophile; product is deactivating and meta-directing.',
    compounds: [
      { smiles: 'c1ccccc1', labelBelow: 'benzene' },
      { smiles: 'CC(=O)c1ccccc1', labelBelow: 'acetophenone' },
    ],
    steps: [
      {
        label: 'Electrophilic aromatic substitution',
        reagentAbove: 'CH₃COCl',
        reagentBelow: 'AlCl₃, CH₂Cl₂, 0 °C → rt',
        mechanism: 'Acylium ion attacks π cloud; rearomatization restores aromaticity.',
      },
    ],
    tags: ['aromatic', 'Lewis acid', 'EAS'],
  },
  {
    id: 'benzene-to-aniline',
    name: 'Benzene → aniline (2 steps)',
    label: 'Aniline route',
    categoryId: 'aromatic',
    summary: 'Electrophilic nitration of benzene, then reduction of the nitro group to aniline.',
    mechanism:
      'Classic aromatic sequence: nitronium ion nitrates benzene (EAS). Nitroarene is reduced with Sn/HCl or catalytic hydrogenation to give the primary amine. The amine is strongly activating and ortho/para-directing.',
    compounds: [
      { smiles: 'c1ccccc1', labelBelow: 'benzene' },
      { smiles: 'O=[N+]([O-])c1ccccc1', labelBelow: 'nitrobenzene' },
      { smiles: 'Nc1ccccc1', labelBelow: 'aniline' },
    ],
    steps: [
      {
        label: 'Nitration',
        reagentAbove: 'HNO₃',
        reagentBelow: 'H₂SO₄, 50–55 °C',
        mechanism: 'Nitronium ion (NO₂⁺) attacks benzene; rearomatization gives nitrobenzene.',
      },
      {
        label: 'Nitro reduction',
        reagentBelow: 'Sn, HCl (or H₂/Pd–C)',
        mechanism: 'Nitro group reduced through hydroxylamine/nitroso intermediates to aniline.',
      },
    ],
    tags: ['aromatic', 'EAS', 'nitration', 'multistep'],
  },
  {
    id: 'grignard-acetone',
    name: 'Grignard addition to acetone',
    label: 'Grignard',
    categoryId: 'addition',
    summary: 'Organometallic adds to carbonyl; workup gives tertiary alcohol.',
    mechanism:
      'Nucleophilic addition of carbanion equivalent to ketone. Protonation after aqueous workup gives alcohol. Grignard reagents are strong bases and nucleophiles.',
    compounds: [
      { smiles: 'CC(=O)C', labelBelow: 'acetone' },
      { smiles: 'CC(C)(C)O', labelBelow: 'tert-butanol' },
    ],
    steps: [
      {
        label: 'Nucleophilic addition',
        reagentAbove: 'CH₃MgBr',
        reagentBelow: 'Et₂O, then H₃O⁺',
        mechanism: 'Methyl anion equivalent adds to C=O; Mg salt hydrolyzes to alcohol.',
      },
    ],
    tags: ['Grignard', 'carbonyl addition'],
  },
  {
    id: 'diels-alder',
    name: 'Diels–Alder cycloaddition',
    label: 'Diels–Alder',
    categoryId: 'addition',
    summary: '[4+2] cycloaddition of diene and dienophile.',
    mechanism:
      'Concerted pericyclic reaction through aromatic transition state. Stereochemistry of dienophile is retained (cis → cis). Endo rule often applies for cyclic dienophiles.',
    compounds: [
      { smiles: 'C=CC=C', labelBelow: 'butadiene' },
      { smiles: 'C=C', labelBelow: 'ethene' },
      { smiles: 'C1=CCCCC1', labelBelow: 'cyclohexene' },
    ],
    steps: [
      {
        label: '[4+2] Cycloaddition',
        reagentBelow: 'heat or Lewis acid',
        mechanism: 'Suprafacial bond formation; no intermediates.',
        arrowKind: 'curved',
      },
      {
        label: 'Product',
        reagentBelow: '',
        mechanism: 'Cyclohexene ring formed in one step.',
      },
    ],
    tags: ['pericyclic', 'cycloaddition'],
  },
  {
    id: 'aldol-2-step',
    name: 'Aldol condensation (2 steps)',
    label: 'Aldol',
    categoryId: 'carbonyl',
    summary: 'Enolate addition then dehydration to α,β-unsaturated carbonyl.',
    mechanism:
      'Base generates enolate from aldehyde. Enolate adds to second carbonyl. β-hydroxy aldehyde dehydrates under heat to give conjugated enal.',
    layout: 'row',
    compounds: [
      { smiles: 'CC=O', labelBelow: 'acetaldehyde' },
      { smiles: 'CC(O)CC=O', labelBelow: 'aldol adduct' },
      { smiles: 'CC=CC=O', labelBelow: 'crotonaldehyde' },
    ],
    steps: [
      {
        label: 'Aldol addition',
        reagentBelow: 'NaOH, H₂O, 0 °C',
        mechanism: 'Enolate attacks aldehyde carbonyl.',
      },
      {
        label: 'Dehydration',
        reagentBelow: 'heat',
        mechanism: 'E1cb-style loss of water gives α,β-unsaturated aldehyde.',
      },
    ],
    tags: ['enolate', 'carbonyl'],
  },
  {
    id: 'wittig',
    name: 'Wittig olefination',
    label: 'Wittig',
    categoryId: 'carbonyl',
    summary: 'Phosphonium ylide converts carbonyl to alkene.',
    mechanism:
      'Ylide adds to carbonyl to give betaine/oxaphosphetane. Collapse expels Ph₃P=O and forms the alkene. Stereochemistry depends on ylide stability and conditions.',
    compounds: [
      { smiles: 'CC(=O)C', labelBelow: 'acetone' },
      { smiles: 'CC=C(C)C', labelBelow: '2-methyl-2-butene' },
    ],
    steps: [
      {
        label: 'Olefin formation',
        reagentAbove: 'Ph₃P=CH₂',
        reagentBelow: 'THF, rt',
        mechanism: 'Formal [2+2] cycloaddition–retro pathway via oxaphosphetane.',
      },
    ],
    tags: ['ylide', 'olefination'],
  },
  {
    id: 'nabh4-reduction',
    name: 'Sodium borohydride reduction',
    label: 'NaBH₄',
    categoryId: 'oxidation-reduction',
    summary: 'Mild hydride delivery reduces aldehydes/ketones to alcohols.',
    mechanism:
      'Hydride adds to carbonyl carbon. Protonation gives alcohol. NaBH₄ does not reduce esters/amides under standard conditions.',
    compounds: [
      { smiles: 'CC=O', labelBelow: 'acetaldehyde' },
      { smiles: 'CCO', labelBelow: 'ethanol' },
    ],
    steps: [
      {
        label: 'Hydride reduction',
        reagentBelow: 'NaBH₄, MeOH, 0 °C → rt',
        mechanism: 'H⁻ equivalent adds to electrophilic carbonyl carbon.',
      },
    ],
    tags: ['reduction', 'hydride'],
  },
  {
    id: 'pcc-oxidation',
    name: 'PCC oxidation',
    label: 'PCC',
    categoryId: 'oxidation-reduction',
    summary: 'Primary alcohol → aldehyde without over-oxidation.',
    mechanism:
      'Chromium(VI) reagent oxidizes alcohol through chromate ester. PCC stops at aldehyde in dichloromethane.',
    compounds: [
      { smiles: 'CCO', labelBelow: 'ethanol' },
      { smiles: 'CC=O', labelBelow: 'acetaldehyde' },
    ],
    steps: [
      {
        label: 'Alcohol oxidation',
        reagentBelow: 'PCC, CH₂Cl₂, rt',
        mechanism: 'Chromate ester formation and β-hydride elimination.',
      },
    ],
    tags: ['oxidation', 'chromium'],
  },
  {
    id: 'fischer-ester',
    name: 'Fischer esterification',
    label: 'Fischer ester',
    categoryId: 'carbonyl',
    summary: 'Acid-catalyzed equilibrium to ester.',
    mechanism:
      'Protonation activates carbonyl. Alcohol adds; water is eliminated after proton transfers. Excess reagent or removal of water drives equilibrium.',
    compounds: [
      { smiles: 'CCO', labelBelow: 'ethanol' },
      { smiles: 'CC(=O)OCC', labelBelow: 'ethyl acetate' },
    ],
    steps: [
      {
        label: 'Esterification',
        reagentAbove: 'CH₃COOH',
        reagentBelow: 'H₂SO₄ cat., reflux',
        mechanism: 'Tetrahedral intermediate; dehydration restores carbonyl.',
      },
    ],
    tags: ['ester', 'acid catalysis'],
  },
  {
    id: 'hydroboration',
    name: 'Hydroboration–oxidation',
    label: 'Hydroboration',
    categoryId: 'addition',
    summary: 'Anti-Markovnikov alcohol from alkene.',
    mechanism:
      'BH₃ adds with syn stereochemistry and regioselectivity for less hindered carbon. Oxidation with H₂O₂/NaOH replaces B with OH retaining syn addition geometry.',
    compounds: [
      { smiles: 'C=CC', labelBelow: 'propene' },
      { smiles: 'CCCO', labelBelow: '1-propanol' },
    ],
    steps: [
      {
        label: 'Hydroboration',
        reagentBelow: 'BH₃·THF',
        mechanism: 'Four-membered transition state; B on less substituted carbon.',
      },
      {
        label: 'Oxidation',
        reagentBelow: 'H₂O₂, NaOH, H₂O',
        mechanism: 'Hydroperoxide replaces boron with retention of configuration.',
      },
    ],
    tags: ['boron', 'anti-Markovnikov'],
  },
] as const;

export const REACTION_BY_ID: ReadonlyMap<string, ReactionTemplate> = new Map(
  NAMED_REACTIONS.map(r => [r.id, r]),
);

/** Build-reaction-scheme payload from a catalogue entry. */
export const reactionTemplateToSchemeInput = (
  template: ReactionTemplate,
): {
  title: string;
  layout?: ReactionTemplate['layout'];
  compounds: ReactionTemplate['compounds'];
  arrows: Array<{ reagentAbove?: string; reagentBelow?: string; kind?: string }>;
} => ({
  title: template.name,
  layout: template.layout,
  compounds: [...template.compounds],
  arrows: template.steps.map(step => ({
    reagentAbove: step.reagentAbove,
    reagentBelow: step.reagentBelow,
    kind: step.arrowKind,
  })),
});
