import type { PolymerBuilder, PolymerPresetInfo } from './types';
import {
  buildNylon66,
  buildP3ht,
  buildPani,
  buildPdms,
  buildPe,
  buildPedot,
  buildPeg,
  buildPet,
  buildPla,
  buildPmma,
  buildPnipam,
  buildPp,
  buildPs,
  buildPtfe,
  buildPvc,
  buildPvdf,
} from './presets/catalog';

export const POLYMER_PROGRAMMATIC_PRESETS: readonly PolymerPresetInfo[] = [
  {
    id: 'peg',
    label: 'PEG',
    name: 'Poly(ethylene glycol) / PEO',
    formula: '-[OCH₂CH₂]-ₙ',
    summary: 'Most-drawn polymer in papers — linkers, mPEG, drug delivery.',
  },
  {
    id: 'pe',
    label: 'PE',
    name: 'Polyethylene',
    formula: '-[CH₂CH₂]-ₙ',
    summary: 'Commodity default; teaching and packaging.',
  },
  {
    id: 'pp',
    label: 'PP',
    name: 'Polypropylene',
    formula: '-[CH₂CH(CH₃)]-ₙ',
    summary: 'Second commodity vinyl.',
  },
  {
    id: 'ps',
    label: 'PS',
    name: 'Polystyrene',
    formula: '-[CH₂CHPh]-ₙ',
    summary: 'Standard vinyl + aromatic; anionics later (PSS).',
  },
  {
    id: 'pvc',
    label: 'PVC',
    name: 'Poly(vinyl chloride)',
    formula: '-[CH₂CHCl]-ₙ',
    summary: 'Teaching / industrial staple.',
  },
  {
    id: 'ptfe',
    label: 'PTFE',
    name: 'Polytetrafluoroethylene (Teflon)',
    formula: '-[CF₂CF₂]-ₙ',
    summary: 'Teflon — everyone recognizes it.',
  },
  {
    id: 'pmma',
    label: 'PMMA',
    name: 'Poly(methyl methacrylate)',
    formula: '-[CH₂C(CH₃)(CO₂Me)]-ₙ',
    summary: 'Plexiglas; lithography / resists.',
  },
  {
    id: 'pet',
    label: 'PET',
    name: 'Poly(ethylene terephthalate)',
    formula: '-[OCH₂CH₂O₂C–C₆H₄–CO]-ₙ',
    summary: 'Bottles and fibers — first condensation polyester SRU.',
  },
  {
    id: 'nylon-66',
    label: 'Nylon-6,6',
    name: 'Poly(hexamethylene adipamide)',
    formula: '-[NH(CH₂)₆NHCO(CH₂)₄CO]-ₙ',
    summary: 'Polyamide everyone can name.',
  },
  {
    id: 'pla',
    label: 'PLA',
    name: 'Poly(lactic acid)',
    formula: '-[OCH(CH₃)CO]-ₙ',
    summary: 'Biopolymer / 3D-printing default.',
  },
  {
    id: 'pdms',
    label: 'PDMS',
    name: 'Poly(dimethylsiloxane)',
    formula: '-[Si(CH₃)₂O]-ₙ',
    summary: 'Soft lithography, microfluidics, silicone.',
  },
  {
    id: 'p3ht',
    label: 'P3HT',
    name: 'Poly(3-hexylthiophene)',
    formula: 'poly(3-hexylthiophene-2,5-diyl)',
    summary: 'OPV / OFET workhorse conjugated polymer.',
  },
  {
    id: 'pedot',
    label: 'PEDOT',
    name: 'Poly(3,4-ethylenedioxythiophene)',
    formula: 'PEDOT',
    summary: 'Transparent conductor; often drawn with PSS.',
  },
  {
    id: 'pani',
    label: 'PANI',
    name: 'Polyaniline (emeraldine SRU)',
    formula: '-[C₆H₄NH]-ₙ',
    summary: 'Oldest conducting polymer still drawn.',
  },
  {
    id: 'pnipam',
    label: 'PNIPAM',
    name: 'Poly(N-isopropylacrylamide)',
    formula: '-[CH₂CH(CONHiPr)]-ₙ',
    summary: 'LCST / smart-gel papers.',
  },
  {
    id: 'pvdf',
    label: 'PVDF',
    name: 'Poly(vinylidene fluoride)',
    formula: '-[CH₂CF₂]-ₙ',
    summary: 'Piezo / battery binder.',
  },
];

const BUILDERS: Record<string, PolymerBuilder> = {
  peg: buildPeg,
  pe: buildPe,
  pp: buildPp,
  ps: buildPs,
  pvc: buildPvc,
  ptfe: buildPtfe,
  pmma: buildPmma,
  pet: buildPet,
  'nylon-66': buildNylon66,
  pla: buildPla,
  pdms: buildPdms,
  p3ht: buildP3ht,
  pedot: buildPedot,
  pani: buildPani,
  pnipam: buildPnipam,
  pvdf: buildPvdf,
};

export const POLYMER_PRESET_INFO_BY_ID: ReadonlyMap<string, PolymerPresetInfo> = new Map(
  POLYMER_PROGRAMMATIC_PRESETS.map(p => [p.id, p]),
);

export function getPolymerBuilder(presetId: string): PolymerBuilder | undefined {
  return BUILDERS[presetId];
}

export function listPolymerPresets(): readonly PolymerPresetInfo[] {
  return POLYMER_PROGRAMMATIC_PRESETS;
}
