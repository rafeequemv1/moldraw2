import { z } from 'zod';

/**
 * Zod shapes for every command input. Kept separate from registry so the AI
 * layer can introspect them without pulling in handler closures.
 */

const point = z.object({ x: z.number(), y: z.number() });

const atom = z.object({
  id: z.string(),
  element: z.string().min(1),
  x: z.number(),
  y: z.number(),
  charge: z.number(),
  alias: z.string().optional(),
  lonePairs: z.number().int().nonnegative().optional(),
  color: z.string().optional(),
  isotope: z.number().int().positive().optional(),
});

const bond = z.object({
  id: z.string(),
  fromAtomId: z.string(),
  toAtomId: z.string(),
  order: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  aromatic: z.boolean().optional(),
  stereo: z.enum(['wedge', 'dash', 'wavy']).optional(),
  orderCycleRamp: z.enum(['up', 'down']).optional(),
});

const reactionArrowKind = z.enum([
  'straight',
  'curved',
  's_curve',
  'retrosynthetic',
  'equilibrium',
  'half_equilibrium',
  'electron_flow',
  'resonance',
]);

const reactionArrow = z.object({
  id: z.string(),
  x1: z.number(),
  y1: z.number(),
  x2: z.number(),
  y2: z.number(),
  kind: reactionArrowKind.optional(),
  cx: z.number().optional(),
  cy: z.number().optional(),
  c1x: z.number().optional(),
  c1y: z.number().optional(),
  c2x: z.number().optional(),
  c2y: z.number().optional(),
  doubleHead: z.boolean().optional(),
  color: z.string().optional(),
  strokeWidth: z.number().positive().optional(),
  headScale: z.number().positive().optional(),
  reagentAbove: z.string().optional(),
  reagentBelow: z.string().optional(),
  reagentFontSize: z.number().positive().optional(),
  reagentColor: z.string().optional(),
  reagentFontWeight: z.enum(['normal', 'bold']).optional(),
  reagentFormat: z.enum(['plain', 'auto', 'latex']).optional(),
  multiStepGroupId: z.string().optional(),
  stepIndex: z.number().int().nonnegative().optional(),
});

const canvasText = z.object({
  id: z.string(),
  x: z.number(),
  y: z.number(),
  text: z.string(),
  fontSize: z.number().positive(),
  color: z.string(),
  fontWeight: z.enum(['normal', 'bold']).optional(),
  fontStyle: z.enum(['normal', 'italic']).optional(),
  textDecoration: z.enum(['none', 'underline']).optional(),
});

const stroke = z.object({
  id: z.string(),
  points: z.array(point).min(2),
  color: z.string(),
  thickness: z.number().positive(),
});

const canvasShapeKind = z.enum(['rectangle', 'line', 'circle', 'triangle', 'star']);

const canvasShape = z.object({
  id: z.string(),
  kind: canvasShapeKind,
  x1: z.number(),
  y1: z.number(),
  x2: z.number(),
  y2: z.number(),
  color: z.string(),
  strokeWidth: z.number().positive(),
});

const canvasImage = z.object({
  id: z.string(),
  dataUrl: z.string().min(1),
  mimeType: z.string().min(1),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  name: z.string().optional(),
});

export const schemas = {
  // ─── Atoms ─────────────────────────────────────────────────────────────
  addAtom: z.object({ atom }),
  updateAtomElement: z.object({ atomId: z.string(), element: z.string().min(1) }),
  updateAtomCharge: z.object({ atomId: z.string(), delta: z.number().int() }),
  updateAtomLonePairs: z.object({ atomId: z.string(), delta: z.number().int() }),
  setAtomIsotope: z.object({ atomId: z.string(), isotope: z.number().int().positive().optional() }),
  setAtomAlias: z.object({ atomId: z.string(), alias: z.string() }),
  moveAtoms: z.object({
    atomIds: z.array(z.string()).min(1),
    dx: z.number(),
    dy: z.number(),
  }),
  rotateAtoms: z.object({
    atomIds: z.array(z.string()).min(1),
    cx: z.number(),
    cy: z.number(),
    deltaRad: z.number(),
  }),
  alignSelectedFragments: z.object({
    atomIds: z.array(z.string()).min(2),
    mode: z.enum(['top', 'center', 'bottom']),
  }),
  distributeSelectedFragments: z.object({
    atomIds: z.array(z.string()).min(3),
    axis: z.enum(['horizontal', 'vertical']),
  }),
  deleteAtoms: z.object({ atomIds: z.array(z.string()).min(1) }),
  deleteBonds: z.object({ bondIds: z.array(z.string()).min(1) }),
  deleteSelection: z
    .object({
      atomIds: z.array(z.string()).default([]),
      bondIds: z.array(z.string()).default([]),
    })
    .refine(v => v.atomIds.length + v.bondIds.length > 0, {
      message: 'At least one atomId or bondId is required',
    }),
  duplicateAtoms: z.object({
    atomIds: z.array(z.string()).min(1),
    dx: z.number(),
    dy: z.number(),
  }),

  // ─── Bonds ─────────────────────────────────────────────────────────────
  addBond: z.object({ bond }),
  updateBond: z.object({
    bondId: z.string(),
    order: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
    stereo: z.enum(['wedge', 'dash', 'wavy']).optional(),
    orderCycleRamp: z.enum(['up', 'down']).optional(),
  }),
  flipBondEndpoints: z.object({ bondId: z.string() }),
  invertStereoAtAtom: z.object({ atomId: z.string() }),
  swapAtomPositions: z.object({ atomIdA: z.string(), atomIdB: z.string() }),

  // ─── Rings / chains ────────────────────────────────────────────────────
  addRing: z.object({
    center: point,
    numSides: z.number().int().min(3).max(12),
    isAromatic: z.boolean(),
    isCyclopentadiene: z.boolean().optional(),
    angleOffset: z.number(),
    rootAtomId: z.string().optional(),
    attachedViaBond: z.boolean().optional(),
    fusedBondId: z.string().optional(),
    angleStep: z.number().optional(),
    radius: z.number().positive().optional(),
  }),
  addBoatRing: z.object({
    center: point,
    bondLengthPx: z.number().positive().optional(),
    rootAtomId: z.string().optional(),
    attachedViaBond: z.boolean().optional(),
  }),
  addChairRing: z.object({
    center: point,
    bondLengthPx: z.number().positive(),
    rootAtomId: z.string().optional(),
    attachedViaBond: z.boolean().optional(),
  }),
  addChain: z.object({
    points: z.array(point).min(2),
    placementElement: z.string().min(1),
    startAtomId: z.string().optional(),
  }),

  // ─── Strokes / arrows / text ───────────────────────────────────────────
  addStroke: z.object({ stroke }),
  addReactionArrow: z.object({ arrow: reactionArrow }),
  updateReactionArrow: z.object({
    id: z.string(),
    x1: z.number().optional(),
    y1: z.number().optional(),
    x2: z.number().optional(),
    y2: z.number().optional(),
    kind: reactionArrowKind.optional(),
    cx: z.number().optional(),
    cy: z.number().optional(),
    c1x: z.number().optional(),
    c1y: z.number().optional(),
    c2x: z.number().optional(),
    c2y: z.number().optional(),
    doubleHead: z.boolean().optional(),
    color: z.string().optional(),
    strokeWidth: z.number().positive().optional(),
    headScale: z.number().positive().optional(),
    reagentAbove: z.string().optional(),
    reagentBelow: z.string().optional(),
    reagentFontSize: z.number().positive().optional(),
    reagentColor: z.string().optional(),
    reagentFontWeight: z.enum(['normal', 'bold']).optional(),
    reagentFormat: z.enum(['plain', 'auto', 'latex']).optional(),
  }),
  deleteReactionArrow: z.object({ id: z.string() }),
  duplicateReactionArrow: z.object({
    id: z.string(),
    dx: z.number(),
    dy: z.number(),
  }),

  addReactionMultiStep: z.object({
    groupId: z.string().min(1),
    title: z.string().optional(),
    startX: z.number(),
    startY: z.number(),
    segmentLength: z.number().positive(),
    gapBetweenSteps: z.number().nonnegative().optional(),
    defaultKind: reactionArrowKind.optional(),
    steps: z
      .array(
        z.object({
          reagentAbove: z.string().optional(),
          reagentBelow: z.string().optional(),
          kind: reactionArrowKind.optional(),
          segmentLength: z.number().positive().optional(),
        }),
      )
      .min(1),
  }),

  addCanvasText: z.object({ text: canvasText }),
  updateCanvasText: z.object({ id: z.string(), patch: canvasText.partial() }),
  deleteCanvasText: z.object({ id: z.string() }),
  duplicateCanvasText: z.object({
    id: z.string(),
    dx: z.number(),
    dy: z.number(),
  }),
  duplicateStroke: z.object({
    id: z.string(),
    dx: z.number(),
    dy: z.number(),
  }),
  addCanvasShape: z.object({ shape: canvasShape }),
  duplicateCanvasShape: z.object({
    id: z.string(),
    dx: z.number(),
    dy: z.number(),
  }),
  addCanvasImage: z.object({ image: canvasImage }),
  deleteCanvasImage: z.object({ id: z.string() }),
  duplicateCanvasImage: z.object({
    id: z.string(),
    dx: z.number(),
    dy: z.number(),
  }),

  // ─── Whole-document ────────────────────────────────────────────────────
  clearAll: z.object({}),
  pasteFragment: z.object({
    atoms: z.array(atom).min(1),
    bonds: z.array(bond),
    /** Translation applied to the fragment before insertion. */
    dx: z.number(),
    dy: z.number(),
  }),

  erase: z.discriminatedUnion('type', [
    z.object({ type: z.literal('atom'), atomId: z.string() }),
    z.object({ type: z.literal('bond'), bondId: z.string() }),
    z.object({ type: z.literal('stroke'), strokeId: z.string() }),
    z.object({ type: z.literal('reactionArrow'), id: z.string() }),
    z.object({ type: z.literal('canvasText'), id: z.string() }),
    z.object({ type: z.literal('canvasShape'), id: z.string() }),
    z.object({ type: z.literal('canvasImage'), id: z.string() }),
  ]),

  deleteStroke: z.object({ id: z.string() }),
  deleteCanvasShape: z.object({ id: z.string() }),

  applyRingFill: z.object({
    ringAtomIds: z.array(z.string()).min(3),
    color: z.string(),
    opacity: z.number().min(0).max(1),
  }),

  importPlacement: z.enum(['origin', 'viewport_center']),
  importViewport: z.object({
    x: z.number(),
    y: z.number(),
    zoom: z.number().positive(),
  }),
  gridSlot: z.object({
    col: z.number().int().nonnegative(),
    row: z.number().int().nonnegative(),
  }),

  importMolblock: z.object({
    molblock: z.string().min(1),
    mode: z.enum(['merge', 'replace']),
    bondLengthPx: z.number().positive(),
    placement: z.enum(['origin', 'viewport_center']).optional(),
    keepAnnotations: z.boolean().optional(),
    viewport: z
      .object({
        x: z.number(),
        y: z.number(),
        zoom: z.number().positive(),
      })
      .optional(),
    windowWidth: z.number().positive().optional(),
    windowHeight: z.number().positive().optional(),
    gridSlot: z
      .object({
        col: z.number().int().nonnegative(),
        row: z.number().int().nonnegative(),
      })
      .optional(),
  }),

  replaceFromMolblock: z.object({
    molblock: z.string().min(1),
    bondLengthPx: z.number().positive(),
    placement: z.enum(['origin', 'viewport_center']).optional(),
    keepAnnotations: z.boolean().optional(),
    viewport: z
      .object({
        x: z.number(),
        y: z.number(),
        zoom: z.number().positive(),
      })
      .optional(),
    windowWidth: z.number().positive().optional(),
    windowHeight: z.number().positive().optional(),
    gridSlot: z
      .object({
        col: z.number().int().nonnegative(),
        row: z.number().int().nonnegative(),
      })
      .optional(),
  }),

  cleanup: z.object({
    bondLengthPx: z.number().positive().optional(),
  }),
  aromatize: z.object({
    mode: z.enum(['aromatize', 'dearomatize']),
    /** Indigo result molblock; bond orders/aromatic flags are merged onto the live graph. */
    molBlock: z.string().min(1),
  }),
  applyAtomMaps: z.object({
    /** Atom id → map number; ≤0 clears that atom's map. */
    mapsByAtomId: z.record(z.string(), z.number()),
  }),
  clearAtomMaps: z.object({}),
  importSmiles: z.object({
    smiles: z.string().min(1),
    mode: z.enum(['merge', 'replace']).optional(),
    placement: z.enum(['origin', 'viewport_center']).optional(),
  }),

  /** Merge already-placed atoms/bonds (CDXML / custom SMILES placement). */
  mergeImportedStructure: z.object({
    atoms: z.array(atom).min(1),
    bonds: z.array(bond),
  }),
  replaceImportedStructure: z.object({
    atoms: z.array(atom),
    bonds: z.array(bond),
    keepAnnotations: z.boolean().optional(),
  }),

  commitFragmentPlacement: z.object({
    fragmentAtoms: z.array(atom).min(1),
    fragmentBonds: z.array(bond),
    connectionAtomId: z.string().nullable(),
    commit: z.discriminatedUnion('type', [
      z.object({ type: z.literal('attach'), targetAtomId: z.string() }),
      z.object({ type: z.literal('free'), x: z.number(), y: z.number() }),
    ]),
    bondLengthPx: z.number().positive(),
    bondAngleSnapRad: z.number(),
  }),

  commitAtomAlias: z.object({
    atomId: z.string(),
    alias: z.string(),
  }),

  expandAlias: z.object({
    atomIds: z.array(z.string()).min(1),
  }),

  applySelectionColor: z.object({
    color: z.string(),
    flags: z.object({
      atomLabels: z.boolean(),
      bonds: z.boolean(),
      ringFill: z.boolean(),
      text: z.boolean(),
      arrowLine: z.boolean(),
      arrowReagent: z.boolean(),
      strokes: z.boolean(),
      canvasShapes: z.boolean(),
    }),
    selectedAtomIds: z.array(z.string()),
    selectedCanvasTextId: z.string().nullable(),
    selectedReactionArrowId: z.string().nullable(),
    selectedStrokeId: z.string().nullable().optional(),
    selectedCanvasShapeId: z.string().nullable().optional(),
    ringFillOpacity: z.number().min(0).max(1),
    clearRingFill: z.boolean().optional(),
    clearAllRingFills: z.boolean().optional(),
  }),

  clearSelectionColors: z.object({
    atomIds: z.array(z.string()).min(1),
  }),

  applyCleanupResult: z.discriminatedUnion('mode', [
    z.object({
      mode: z.literal('local'),
      subsetAtomIds: z.array(z.string()).min(1),
      molBlock: z.string().min(1),
    }),
    z.object({
      mode: z.literal('global'),
      molBlock: z.string().min(1),
    }),
  ]),

  insertDemoReaction: z.object({
    reactAtoms: z.array(atom).min(1),
    reactBonds: z.array(bond),
    prodAtoms: z.array(atom).min(1),
    prodBonds: z.array(bond),
    arrow: reactionArrow,
  }),
} as const;
