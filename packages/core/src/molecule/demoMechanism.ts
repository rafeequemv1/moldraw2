/**
 * Teaching demo: multi-step carbonyl addition + enolate resonance with
 * chemistry-anchored electron_flow arrows (and ↔) for QA of arrow placement.
 */
import type { Atom, Bond, CanvasText, Molecule, ReactionArrow } from '@moldraw/domain';
import { buildElectronFlowArrow } from './arrowAnchors';

const BL = 44;

const atom = (
  id: string,
  element: string,
  x: number,
  y: number,
  extra: Partial<Atom> = {},
): Atom => ({
  id,
  element,
  x,
  y,
  charge: 0,
  ...extra,
});

const bond = (
  id: string,
  fromAtomId: string,
  toAtomId: string,
  order: number,
): Bond => ({
  id,
  fromAtomId,
  toAtomId,
  order,
});

const text = (
  id: string,
  x: number,
  y: number,
  label: string,
  fontSize = 12,
): CanvasText => ({
  id,
  x,
  y,
  text: label,
  fontSize,
  color: '#475569',
  fontWeight: 'normal',
});

/**
 * Two rows:
 * 1) HO⁻ + acetone → tetrahedral alkoxide → hydrate
 * 2) Acetone enolate resonance (oxyanion ↔ carbanion)
 */
export const buildDemoMechanismMolecule = (): Molecule => {
  // Row 1 — acetone; HO⁻ parked further upper-right for clear Nu arc.
  const s1 = {
    meL: atom('mech_s1_meL', 'C', 80, 240),
    c: atom('mech_s1_c', 'C', 80 + BL, 210),
    meR: atom('mech_s1_meR', 'C', 80 + BL * 2, 240),
    o: atom('mech_s1_o', 'O', 80 + BL, 210 - BL, {
      lonePairs: 2,
      lonePairSide: 'above',
    }),
    oh: atom('mech_s1_oh', 'O', 80 + BL * 3.6, 210 - BL * 1.9, {
      charge: -1,
      lonePairs: 3,
      lonePairSide: 'above',
      alias: 'HO',
    }),
  };
  const s1Ids = Object.values(s1).map(a => a.id);
  const s1Bonds = [
    bond('mech_s1_b_meL', s1.meL.id, s1.c.id, 1),
    bond('mech_s1_b_meR', s1.c.id, s1.meR.id, 1),
    bond('mech_s1_b_co', s1.c.id, s1.o.id, 2),
  ];

  const s2x = 400;
  const s2 = {
    meL: atom('mech_s2_meL', 'C', s2x - 40, 245),
    c: atom('mech_s2_c', 'C', s2x, 210),
    meR: atom('mech_s2_meR', 'C', s2x, 210 + BL),
    oAlk: atom('mech_s2_oAlk', 'O', s2x, 210 - BL, {
      charge: -1,
      lonePairs: 3,
      lonePairSide: 'above',
    }),
    oh: atom('mech_s2_oh', 'O', s2x + 48, 245, {
      lonePairs: 2,
      lonePairSide: 'below',
      alias: 'OH',
    }),
  };
  const s2Bonds = [
    bond('mech_s2_b_meL', s2.meL.id, s2.c.id, 1),
    bond('mech_s2_b_meR', s2.c.id, s2.meR.id, 1),
    bond('mech_s2_b_oAlk', s2.c.id, s2.oAlk.id, 1),
    bond('mech_s2_b_oh', s2.c.id, s2.oh.id, 1),
  ];

  const s3x = 640;
  const s3 = {
    meL: atom('mech_s3_meL', 'C', s3x - 40, 245),
    c: atom('mech_s3_c', 'C', s3x, 210),
    meR: atom('mech_s3_meR', 'C', s3x, 210 + BL),
    ohA: atom('mech_s3_ohA', 'O', s3x, 210 - BL, {
      lonePairs: 2,
      lonePairSide: 'above',
      alias: 'OH',
    }),
    ohB: atom('mech_s3_ohB', 'O', s3x + 48, 245, {
      lonePairs: 2,
      lonePairSide: 'below',
      alias: 'OH',
    }),
  };
  const s3Bonds = [
    bond('mech_s3_b_meL', s3.meL.id, s3.c.id, 1),
    bond('mech_s3_b_meR', s3.c.id, s3.meR.id, 1),
    bond('mech_s3_b_ohA', s3.c.id, s3.ohA.id, 1),
    bond('mech_s3_b_ohB', s3.c.id, s3.ohB.id, 1),
  ];

  // Enolate panels: proper trigonal layout around the central carbon
  // (O straight up, CH2 down-left, CH3 down-right) so the skeleton reads cleanly.
  const enY = 455;
  const DX = BL * Math.cos(Math.PI / 6); // ~38
  const DY = BL * Math.sin(Math.PI / 6); // 22
  const enOcx = 134;
  const enO = {
    ch2: atom('mech_enO_ch2', 'C', enOcx - DX, enY + DY),
    c: atom('mech_enO_c', 'C', enOcx, enY),
    me: atom('mech_enO_me', 'C', enOcx + DX, enY + DY),
    o: atom('mech_enO_o', 'O', enOcx, enY - BL, {
      charge: -1,
      lonePairs: 3,
      lonePairSide: 'above',
    }),
  };
  const enOIds = Object.values(enO).map(a => a.id);
  const enOBonds = [
    bond('mech_enO_b_cc', enO.ch2.id, enO.c.id, 2),
    bond('mech_enO_b_me', enO.c.id, enO.me.id, 1),
    bond('mech_enO_b_co', enO.c.id, enO.o.id, 1),
  ];

  const enCcx = 424;
  const enC = {
    ch2: atom('mech_enC_ch2', 'C', enCcx - DX, enY + DY, {
      charge: -1,
      lonePairs: 1,
    }),
    c: atom('mech_enC_c', 'C', enCcx, enY),
    me: atom('mech_enC_me', 'C', enCcx + DX, enY + DY),
    o: atom('mech_enC_o', 'O', enCcx, enY - BL, {
      lonePairs: 2,
      lonePairSide: 'above',
    }),
  };
  const enCBonds = [
    bond('mech_enC_b_cc', enC.ch2.id, enC.c.id, 1),
    bond('mech_enC_b_me', enC.c.id, enC.me.id, 1),
    bond('mech_enC_b_co', enC.c.id, enC.o.id, 2),
  ];

  const atoms: Atom[] = [
    ...Object.values(s1),
    ...Object.values(s2),
    ...Object.values(s3),
    ...Object.values(enO),
    ...Object.values(enC),
  ];
  const bonds: Bond[] = [...s1Bonds, ...s2Bonds, ...s3Bonds, ...enOBonds, ...enCBonds];

  const draft: Molecule = {
    atoms,
    bonds,
    reactionArrows: [],
    canvasTexts: [],
    canvasShapes: [],
    strokes: [],
    canvasImages: [],
    sruBrackets: [],
  };

  // Nu: lone-pair tail → carbonyl C; bulge away from acetone skeleton.
  const efNu = buildElectronFlowArrow(draft, {
    id: 'mech_ef_nu',
    fromAnchor: { type: 'lone_pair', atomId: s1.oh.id, slot: 1 },
    toAnchor: { type: 'atom', atomId: s1.c.id, offsetPx: 16, offsetDeg: -25 },
    panelAtomIds: s1Ids,
    bulgeSide: 1,
    curveAmount: 0.34,
  });
  // π→O: bond mid → O above the lone pairs.
  const efPi = buildElectronFlowArrow(draft, {
    id: 'mech_ef_pi',
    fromAnchor: { type: 'bond', bondId: 'mech_s1_b_co', t: 0.42 },
    toAnchor: { type: 'atom', atomId: s1.o.id, offsetPx: 26, offsetDeg: -90 },
    panelAtomIds: s1Ids,
    bulgeSide: 1,
    curveAmount: 0.3,
  });

  // Enolate: O lone pair → C; arc on the open (right) side.
  const efEn1 = buildElectronFlowArrow(draft, {
    id: 'mech_ef_en1',
    fromAnchor: { type: 'lone_pair', atomId: enO.o.id, slot: 1 },
    toAnchor: { type: 'atom', atomId: enO.c.id, offsetPx: 16, offsetDeg: -25 },
    panelAtomIds: enOIds,
    bulgeSide: -1,
    curveAmount: 0.34,
  });
  // C=C π → CH2 terminus below the skeleton.
  const efEn2 = buildElectronFlowArrow(draft, {
    id: 'mech_ef_en2',
    fromAnchor: { type: 'bond', bondId: 'mech_enO_b_cc', t: 0.45 },
    toAnchor: { type: 'atom', atomId: enO.ch2.id, offsetPx: 16, offsetDeg: 155 },
    panelAtomIds: enOIds,
    bulgeSide: -1,
    curveAmount: 0.34,
  });

  const stepArrow1: ReactionArrow = {
    id: 'mech_step_1',
    x1: 290,
    y1: 210,
    x2: 365,
    y2: 210,
    kind: 'straight',
    reagentAbove: 'addition',
    strokeWidth: 2,
  };
  const stepArrow2: ReactionArrow = {
    id: 'mech_step_2',
    x1: 530,
    y1: 210,
    x2: 605,
    y2: 210,
    kind: 'straight',
    reagentAbove: 'H⁺',
    strokeWidth: 2,
  };
  const resonanceArrow: ReactionArrow = {
    id: 'mech_res_en',
    x1: 230,
    y1: enY - 6,
    x2: 340,
    y2: enY - 6,
    kind: 'resonance',
    strokeWidth: 2,
  };

  const canvasTexts: CanvasText[] = [
    text('mech_t_title', 380, 90, 'Mechanism demo — electron-flow & ↔ placement', 14),
    text('mech_t_s1', 140, 310, '1. Nu⁻ → carbonyl', 12),
    text('mech_t_s2', 400, 320, '2. Tetrahedral alkoxide', 12),
    text('mech_t_s3', 640, 320, '3. Hydrate', 12),
    text('mech_t_en', 280, 545, 'Enolate resonance (oxyanion ↔ carbanion)', 12),
    text('mech_t_enO', 125, 520, 'Oxyanion', 11),
    text('mech_t_enC', 420, 520, 'Carbanion', 11),
  ];

  const reactionArrows = [efNu, efPi, stepArrow1, stepArrow2, efEn1, efEn2, resonanceArrow].filter(
    (a): a is ReactionArrow => !!a,
  );

  return {
    ...draft,
    reactionArrows,
    canvasTexts,
  };
};
