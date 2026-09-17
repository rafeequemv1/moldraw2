import {
  ALL_CANVAS_SHAPE_KINDS,
  CANVAS_ORBITAL_KINDS,
  canonicalElementSymbol,
  isKnownElementSymbol,
} from '@moldraw/domain';
import { z } from 'zod';

/**
 * Zod shapes for every command input. Kept separate from registry so the AI
 * layer can introspect them without pulling in handler closures.
 *
 * Units: all coordinates are canvas world pixels (y grows downward); the
 * default bond length is 40 px.
 */

/** Pseudo-atom symbols accepted alongside IUPAC element symbols. */
const PSEUDO_ATOM_SYMBOLS = new Set(['*', 'R', 'X', 'A', 'Q', 'D', 'T', 'LP']);

const isAllowedElement = (raw: string): boolean => {
  const sym = raw.trim();
  if (!sym) return false;
  if (isKnownElementSymbol(sym)) return true;
  if (PSEUDO_ATOM_SYMBOLS.has(sym.toUpperCase())) return true;
  return /^R\d{1,2}$/i.test(sym);
};

const normalizeElement = (raw: string): string => {
  const sym = raw.trim();
  if (isKnownElementSymbol(sym)) return canonicalElementSymbol(sym);
  if (/^R\d{1,2}$/i.test(sym)) return `R${sym.slice(1)}`;
  if (sym === '*') return sym;
  return sym.toUpperCase() === 'LP' ? 'LP' : sym.charAt(0).toUpperCase() + sym.slice(1).toLowerCase();
};

/**
 * Element symbol validated against the periodic table (case-insensitive, then
 * canonicalised: `cl` → `Cl`). Pseudo-atoms `*`, `R`, `R1`…`R99`, `X`, `A`, `Q`,
 * `D`, `T` are also accepted.
 */
export const elementSymbol = z
  .string()
  .min(1)
  .refine(isAllowedElement, {
    error: iss =>
      `Unknown element symbol "${String(iss.input)}". Use an IUPAC symbol such as C, N, O, Cl (case-insensitive) or a pseudo-atom (*, R, R1, X).`,
  })
  .transform(normalizeElement)
  .describe(
    'Element symbol (IUPAC, case-insensitive: C, N, O, Cl, Br, Si…) or pseudo-atom (*, R, R1, X, A, Q).',
  );

const point = z
  .object({
    x: z.number().describe('World x in canvas px.'),
    y: z.number().describe('World y in canvas px (y grows downward).'),
  })
  .describe('World point in canvas px.');

/** Shared, described id / delta primitives reused across many command inputs. */
const atomIdRef = z.string().describe('Atom id from molecule.get_structure or extra.newAtomIds.');
const bondIdRef = z.string().describe('Bond id from molecule.get_structure or extra.newBondIds.');
const dxPx = z.number().describe('Horizontal translation in canvas px (positive = right).');
const dyPx = z.number().describe('Vertical translation in canvas px (positive = down).');
const cxPx = z.number().describe('Pivot x in canvas px.');
const cyPx = z.number().describe('Pivot y in canvas px (y grows downward).');
const cssColor = z.string().describe('CSS colour (e.g. "#1f77b4" or "red").');
const rotationRad = z.number().describe('Rotation about the object centre in radians (positive = clockwise on screen).');

const coordsTableRow = z.object({
  index: z
    .number()
    .int()
    .positive()
    .describe('1-based row number; matches the Nth atom of atomIds when atomId is absent.')
    .optional(),
  element: z.string().describe('Element symbol; when set, the row only matches an atom of this element.').optional(),
  x: z.number().describe('New world x in canvas px.'),
  y: z.number().describe('New world y in canvas px (y grows downward).'),
  isotope: z.number().int().positive().describe('Mass number to set (e.g. 13 for 13C); omit to keep.').optional(),
  charge: z.number().int().describe('Formal charge to set (0 = neutral); omit to keep.').optional(),
  alias: z.string().describe('Abbreviation label to set (e.g. "OMe"); omit to keep.').optional(),
  atomId: z.string().describe('Explicit target atom id; takes priority over index matching.').optional(),
});

const atomFields = {
  id: z.string().describe('Stable atom id (unique within the document).'),
  element: elementSymbol,
  x: z.number().describe('World x in canvas px.'),
  y: z.number().describe('World y in canvas px (y grows downward).'),
  charge: z.number().int().describe('Formal charge (0 = neutral).'),
  alias: z.string().optional().describe('Abbreviation label drawn instead of the element (e.g. "OMe", "Ph", "Boc").'),
  lonePairs: z.number().int().nonnegative().optional().describe('Explicit lone-pair dots to draw.'),
  color: z.string().optional().describe('CSS colour for the atom label.'),
  isotope: z.number().int().positive().optional().describe('Mass number for an isotope label (e.g. 13 for 13C).'),
  labelFontSizePt: z.number().min(6).max(48).optional().describe('Per-atom label font size in points.'),
};

/** Full atom record as stored in the document (ids required — used by fragment / paste inputs). */
const atom = z.object(atomFields).describe('Atom record.');

/**
 * Atom to create: `id` may be omitted (the server generates one and returns it
 * in `extra.newAtomIds`); `charge` defaults to 0.
 */
const newAtom = z
  .object({
    ...atomFields,
    id: atomFields.id.optional().describe('Optional atom id; generated when omitted and returned in extra.newAtomIds.'),
    charge: z.number().int().default(0).describe('Formal charge (default 0).'),
  })
  .describe('Atom to create. Omit id to let the server generate one.');

const bondFields = {
  id: z.string().describe('Stable bond id (unique within the document).'),
  fromAtomId: z.string().describe('Id of the first atom (existing).'),
  toAtomId: z.string().describe('Id of the second atom (existing).'),
  order: z.number().int().min(1).max(3).describe('Bond order: 1 single, 2 double, 3 triple.'),
  aromatic: z.boolean().optional().describe('Render as aromatic (solid inner circle in rings).'),
  stereo: z
    .enum(['wedge', 'dash', 'wavy', 'either', 'cis_trans'])
    .optional()
    .describe(
      'Stereo depiction: wedge (up), dash (down), wavy (unknown), either (wedge/hash), cis_trans (unspecified E/Z).',
    ),
  dative: z.boolean().optional().describe('Dative / coordination arrow bond (from donor to acceptor).'),
  dotted: z.boolean().optional().describe('Dotted partial / hydrogen bond rendering.'),
  queryType: z
    .enum(['any', 'single_double', 'single_aromatic', 'double_aromatic'])
    .optional()
    .describe('Query-only bond (molfile 5–8): any, single/double, single/aromatic, double/aromatic.'),
  bold: z.boolean().optional().describe('Thick foreground single bond (display-only).'),
  orderCycleRamp: z.enum(['up', 'down']).optional().describe('Internal: direction of the bond-order cycle ramp.'),
  color: z.string().optional().describe('CSS colour for the bond.'),
  thicknessPx: z.number().min(0.5).max(14).optional().describe('Bond line thickness in px.'),
};

/** Full bond record as stored in the document (ids required — used by fragment / paste inputs). */
const bond = z.object(bondFields).describe('Bond record.');

/** Bond to create: `id` may be omitted (generated and returned in `extra.newBondIds`). */
const newBond = z
  .object({
    ...bondFields,
    id: bondFields.id.optional().describe('Optional bond id; generated when omitted and returned in extra.newBondIds.'),
  })
  .describe('Bond to create between two existing atoms. Omit id to let the server generate one.');

const atom3DPose = z.object({
  x: z.number().describe('3D x in canvas px (projected screen x).'),
  y: z.number().describe('3D y in canvas px (projected screen y, grows downward).'),
  z: z.number().describe('3D depth in canvas px (positive = toward the viewer).'),
});

const perspectivePose = z.object({
  positions: z
    .record(z.string(), atom3DPose)
    .describe('Map of atom id -> {x, y, z} 3D position in canvas px; every atom in the molecule should be present.'),
  depthShading: z.boolean().describe('True fades far atoms/bonds (near opaque, far faded); default true.').optional(),
  depthFade: z
    .number()
    .min(0)
    .max(1.5)
    .describe('Fade strength when depthShading is on: 0 none, 1 ChemDraw-like (far ~5% opacity), up to 1.5.')
    .optional(),
  depthWedges: z
    .boolean()
    .describe('True draws plain single bonds tapering toward the far end as a depth cue (display only).')
    .optional(),
});

const reactionArrowKind = z
  .enum([
    'straight',
    'curved',
    's_curve',
    'path',
    'row_wrap',
    'cycle_arc',
    'retrosynthetic',
    'equilibrium',
    'half_equilibrium',
    'electron_flow',
    'resonance',
  ])
  .describe(
    'Arrow style: curved uses cx/cy, s_curve c1/c2, path/row_wrap pathPoints, cycle_arc arcs about cx/cy, electron_flow = curly arrow.',
  );

const arrowAnchor = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('atom').describe('Anchor the arrow endpoint to an atom.'),
    atomId: atomIdRef,
    offsetDeg: z
      .number()
      .describe('Direction from the atom centre to the endpoint in degrees (0 = right, 90 = down); auto when omitted.')
      .optional(),
    offsetPx: z.number().describe('Distance from the atom centre to the endpoint in canvas px; auto when omitted.').optional(),
  }),
  z.object({
    type: z.literal('bond').describe('Anchor the arrow endpoint to a point along a bond.'),
    bondId: bondIdRef,
    t: z
      .number()
      .min(0)
      .max(1)
      .describe('Position along the bond, 0 = fromAtom end, 1 = toAtom end (default 0.5 = midpoint).')
      .optional(),
  }),
  z.object({
    type: z.literal('lone_pair').describe('Anchor the arrow endpoint to a lone pair on an atom.'),
    atomId: atomIdRef,
    slot: z
      .number()
      .int()
      .nonnegative()
      .describe('0-based index of the lone-pair slot around the atom; first drawn pair when omitted.')
      .optional(),
  }),
]);

const reactionArrow = z.object({
  id: z.string().describe('Stable arrow id (unique within the document).'),
  x1: z.number().describe('Tail x in canvas px (start of the arrow).'),
  y1: z.number().describe('Tail y in canvas px (y grows downward).'),
  x2: z.number().describe('Head x in canvas px (end of the arrow).'),
  y2: z.number().describe('Head y in canvas px (y grows downward).'),
  kind: reactionArrowKind.optional(),
  cx: z.number().describe('Quadratic control x (curved/electron_flow) or cycle centre x (cycle_arc), canvas px.').optional(),
  cy: z.number().describe('Quadratic control y (curved/electron_flow) or cycle centre y (cycle_arc), canvas px.').optional(),
  c1x: z.number().describe('First cubic control x for s_curve, canvas px.').optional(),
  c1y: z.number().describe('First cubic control y for s_curve, canvas px.').optional(),
  c2x: z.number().describe('Second cubic control x for s_curve, canvas px.').optional(),
  c2y: z.number().describe('Second cubic control y for s_curve, canvas px.').optional(),
  pathPoints: z
    .array(point)
    .min(2)
    .describe('Polyline vertices for kind path/row_wrap (>= 2, first = tail, last = head), canvas px.')
    .optional(),
  doubleHead: z
    .boolean()
    .describe('True draws a second head at the tail (legacy curved resonance); ignored for kind resonance.')
    .optional(),
  fromAnchor: arrowAnchor
    .describe('Optional chemistry anchor for the tail; overrides x1/y1 when resolvable.')
    .optional(),
  toAnchor: arrowAnchor.describe('Optional chemistry anchor for the head; overrides x2/y2 when resolvable.').optional(),
  headStyle: z
    .enum(['filled', 'open', 'pair', 'single', 'none'])
    .describe(
      'Arrow head: filled triangle, open/pair angular 2e, single fish-hook, none.',
    )
    .optional(),
  tailStyle: z
    .enum(['none', 'bar', 'reverse', 'circle'])
    .describe('Arrow tail: none, bar, reverse head, or circle.')
    .optional(),
  curveAmount: z
    .number()
    .describe('Bend of electron_flow/curved arcs as signed fraction of chord length (default ~0.28).')
    .optional(),
  bulgeSide: z
    .union([z.literal(1), z.literal(-1)])
    .describe('Side the arc bulges toward: 1 = left-hand normal of the chord, -1 = right-hand; auto when omitted.')
    .optional(),
  color: cssColor.describe('CSS colour of the arrow line and heads.').optional(),
  strokeWidth: z.number().positive().describe('Line width in canvas px (default ~2).').optional(),
  headScale: z.number().positive().describe('Arrowhead size multiplier (1 = default).').optional(),
  reagentAbove: z.string().describe('Reagent/condition text drawn above the shaft (newline for multi-line).').optional(),
  reagentBelow: z.string().describe('Reagent/condition text drawn below the shaft (newline for multi-line).').optional(),
  reagentFontSize: z.number().positive().describe('Shared reagent text font size in canvas px (fallback for both slots).').optional(),
  reagentAboveFontSize: z.number().positive().describe('Font size in canvas px for text above the shaft.').optional(),
  reagentBelowFontSize: z.number().positive().describe('Font size in canvas px for text below the shaft.').optional(),
  reagentColor: cssColor.describe('CSS colour for the reagent text.').optional(),
  reagentFontWeight: z.enum(['normal', 'bold']).describe('Reagent text weight: normal or bold.').optional(),
  reagentFormat: z
    .enum(['plain', 'auto', 'latex'])
    .describe('Reagent text formatting: plain raw text, auto (chemistry subscripts like H2SO4), latex (\\ce{} math).')
    .optional(),
  multiStepGroupId: z.string().describe('Group id linking arrows of one multi-step route.').optional(),
  stepIndex: z.number().int().nonnegative().describe('0-based order of this arrow within multiStepGroupId.').optional(),
});

const canvasText = z.object({
  id: z.string().describe('Stable text id (unique within the document).'),
  x: z.number().describe('Centre x of the text box in canvas px.'),
  y: z.number().describe('Centre y of the text box in canvas px (y grows downward).'),
  text: z.string().describe('Text content; use newline for multiple lines.'),
  fontSize: z.number().positive().describe('Font size in canvas px.'),
  color: cssColor.describe('CSS colour of the text.'),
  fontFamily: z.string().describe('CSS font family (e.g. "Arial"); default UI font when omitted.').optional(),
  boxWidth: z.number().positive().describe('Text box width in canvas px; measured from text when omitted.').optional(),
  boxHeight: z.number().positive().describe('Text box height in canvas px; measured from text when omitted.').optional(),
  rotationRad: rotationRad.describe('Rotation about the box centre in radians (default 0).').optional(),
  fontWeight: z.enum(['normal', 'bold']).describe('Font weight: normal or bold.').optional(),
  fontStyle: z.enum(['normal', 'italic']).describe('Font style: normal or italic.').optional(),
  textDecoration: z.enum(['none', 'underline']).describe('Underline the whole text: none or underline.').optional(),
  textScript: z
    .enum(['normal', 'super', 'sub'])
    .describe('Whole-box script style: normal, super (superscript), sub (subscript).')
    .optional(),
});

const sruBracket = z.object({
  id: z.string().describe('Stable bracket id (unique within the document).'),
  atomIds: z.array(atomIdRef).min(1).describe('Atom ids inside the structural repeating unit (>= 1).'),
  x1: z.number().describe('Left bracket x in canvas px.'),
  y1: z.number().describe('Top edge y in canvas px (y grows downward).'),
  x2: z.number().describe('Right bracket x in canvas px.'),
  y2: z.number().describe('Bottom edge y in canvas px.'),
  subscript: z.string().describe('Repeat label drawn at the lower-right bracket (e.g. "n").'),
  color: cssColor.describe('CSS colour of the bracket lines and label.').optional(),
});

const stroke = z
  .object({
    id: z.string().describe('Stable stroke id (unique within the document).'),
    points: z.array(point).min(2).describe('Freehand polyline vertices in canvas px (>= 2).'),
    color: cssColor.describe('CSS colour of the stroke.'),
    thickness: z.number().positive().describe('Nominal line width in canvas px.'),
    /** Stylus pressure per point (0..1); must match `points` length when present. */
    pressures: z
      .array(z.number().min(0).max(1).describe('Stylus pressure 0-1 for the matching point.'))
      .describe('Optional stylus pressure per point (0-1); must have one entry per point.')
      .optional(),
  })
  .refine(s => !s.pressures || s.pressures.length === s.points.length, {
    message: 'pressures must have one entry per point',
    path: ['pressures'],
  });

/** Keep in sync with `@moldraw/domain` `ALL_CANVAS_SHAPE_KINDS` (geometry + glassware). */
const canvasShapeKind = z.enum(
  ALL_CANVAS_SHAPE_KINDS as unknown as [string, ...string[]],
);

const canvasShape = z.object({
  id: z.string().describe('Stable shape id (unique within the document).'),
  kind: canvasShapeKind.describe(
    'Shape kind: geometry (line, rectangle, ellipse, ...) or lab glassware (round_bottom_flask, beaker, condenser, ...).',
  ),
  x1: z.number().describe('For line: start x; otherwise bounding-box min x, canvas px.'),
  y1: z.number().describe('For line: start y; otherwise bounding-box min y, canvas px (y grows downward).'),
  x2: z.number().describe('For line: end x; otherwise bounding-box max x, canvas px.'),
  y2: z.number().describe('For line: end y; otherwise bounding-box max y, canvas px.'),
  color: cssColor.describe('CSS colour of the outline stroke.'),
  strokeWidth: z.number().positive().describe('Outline width in canvas px.'),
  rotationRad: rotationRad.describe('Rotation about the shape centre in radians (default 0).').optional(),
  fillColor: cssColor.describe('CSS interior fill; for glassware this is the liquid colour. Omit for no fill.').optional(),
  fillLevel: z
    .number()
    .min(0)
    .max(1)
    .describe('Glassware liquid level 0-1 (0 = empty, 1 = full body); ignored for geometry shapes.')
    .optional(),
});

const canvasOrbital = z.object({
  id: z.string().describe('Stable orbital id (unique within the document).'),
  kind: z
    .enum(CANVAS_ORBITAL_KINDS)
    .describe('Atomic orbital shape: s (sphere), p (two lobes), d_xy (four lobes), dz2 (two lobes + torus).'),
  x: z.number().describe('Centre x in canvas px (used when not attached to an atom).'),
  y: z.number().describe('Centre y in canvas px (y grows downward).'),
  rotationRad: rotationRad.describe('Axis rotation in radians (0 = lobes along +x).'),
  size: z.number().positive().describe('Lobe length / sphere radius in canvas px.'),
  atomId: atomIdRef.describe('Optional atom id to follow; the orbital is drawn centred on that atom.').optional(),
  color: cssColor.describe('CSS colour of the orbital lobes.').optional(),
});

const canvasImage = z.object({
  id: z.string().describe('Stable image id (unique within the document).'),
  dataUrl: z.string().min(1).describe('Image content as a data: URL (base64), e.g. "data:image/png;base64,...".'),
  mimeType: z.string().min(1).describe('Image MIME type, e.g. "image/png" or "image/jpeg".'),
  x: z.number().describe('Top-left x of the unrotated image box in canvas px.'),
  y: z.number().describe('Top-left y of the unrotated image box in canvas px (y grows downward).'),
  width: z.number().positive().describe('Displayed width in canvas px.'),
  height: z.number().positive().describe('Displayed height in canvas px.'),
  rotationRad: rotationRad.describe('Rotation about the image centre in radians (default 0).').optional(),
  name: z.string().describe('Optional display name shown in the Objects panel.').optional(),
});

export const schemas = {
  // ─── Atoms ─────────────────────────────────────────────────────────────
  addAtom: z.object({ atom: newAtom }),
  updateAtomElement: z.object({ atomId: atomIdRef, element: elementSymbol }),
  updateAtomCharge: z.object({
    atomId: atomIdRef,
    delta: z.number().int().describe('Signed change to the formal charge (e.g. +1 or -1).'),
  }),
  setAtomCharge: z.object({
    atomId: atomIdRef,
    charge: z.number().int().describe('Absolute formal charge to set (0 clears the charge mark).'),
    markStyle: z
      .enum(['plain', 'circled'])
      .describe('Charge glyph style: plain (+/-) or circled (encircled sign); default plain.')
      .optional(),
  }),
  /** Partial charge mark: +1 = δ+, −1 = δ−, 0 clears. */
  setAtomDeltaCharge: z.object({
    atomId: atomIdRef,
    deltaCharge: z
      .number()
      .int()
      .min(-1)
      .max(1)
      .describe('Partial-charge mark: 1 = delta+, -1 = delta-, 0 clears the mark.'),
  }),
  setAtomChargeOffset: z.object({
    atomId: atomIdRef,
    offset: z
      .object({
        x: z.number().describe('Offset x from the atom centre in canvas px (clamped to 10-22 px radius).'),
        y: z.number().describe('Offset y from the atom centre in canvas px (y grows downward).'),
      })
      .nullable()
      .describe('Position of the formal-charge mark relative to the atom centre; null restores the default seat.'),
  }),
  setAtomDeltaChargeOffset: z.object({
    atomId: atomIdRef,
    offset: z
      .object({
        x: z.number().describe('Offset x from the atom centre in canvas px (clamped to 10-22 px radius).'),
        y: z.number().describe('Offset y from the atom centre in canvas px (y grows downward).'),
      })
      .nullable()
      .describe('Position of the delta+/delta- mark relative to the atom centre; null restores the default seat.'),
  }),
  updateAtomLonePairs: z.object({
    atomId: atomIdRef,
    delta: z.number().int().describe('Signed change to the number of drawn lone pairs (clamped to valency limit).'),
  }),
  setAtomLonePairSide: z.object({
    atomId: atomIdRef,
    side: z.enum(['above', 'below']).describe('Preferred side for lone-pair dots: above or below the atom label.'),
  }),
  setAtomRadical: z.object({
    atomId: atomIdRef,
    /** `1` = single free radical; `0` clears. */
    radical: z.number().int().min(0).max(1).describe('1 draws a single unpaired-electron dot; 0 clears it.'),
  }),
  /** Formal charge + unpaired electron in one undo step (•+ / •−). */
  setAtomRadicalIon: z.object({
    atomId: atomIdRef,
    /** Formal charge (`+1` / `−1` / `0` to clear with radical). */
    charge: z.number().int().describe('Formal charge of the radical ion (+1 / -1; 0 clears together with radical).'),
    /** `1` = unpaired electron; `0` clears. */
    radical: z.number().int().min(0).max(1).describe('1 draws the unpaired-electron dot; 0 clears it.'),
  }),
  setAtomIsotope: z.object({
    atomId: atomIdRef,
    isotope: z
      .number()
      .int()
      .positive()
      .describe('Mass number to show as a superscript (e.g. 13 for 13C); omit to clear.')
      .optional(),
  }),
  setAtomAlias: z.object({
    atomId: atomIdRef,
    alias: z.string().describe('Abbreviation label to show instead of the element (e.g. "OMe", "Ph"); "" clears.'),
  }),
  /** Force element symbol on atoms (teaching: show "C" on skeletal carbons). */
  setAtomsShowElementLabel: z.object({
    atomIds: z.array(atomIdRef).min(1).describe('Atom ids to affect (>= 1).'),
    show: z.boolean().describe('True forces the element symbol to be drawn (e.g. "C" on skeletal carbons); false hides.'),
  }),
  addExplicitHydrogens: z.object({
    atomIds: z.array(atomIdRef).min(1).describe('Heavy-atom ids that receive explicit H atoms (>= 1).'),
    bondLengthPx: z.number().positive().describe('Target bond length in canvas px (default 40).'),
    /** Max new H per atom; omit to convert all remaining implicit H. */
    maxPerAtom: z
      .number()
      .int()
      .positive()
      .describe('Maximum new H atoms per heavy atom; omit to convert all remaining implicit H.')
      .optional(),
    bondAngleSnapRad: z
      .number()
      .positive()
      .describe('Angle grid for new H bonds in radians (default pi/12 = 15 degrees).')
      .optional(),
  }),
  moveAtoms: z.object({
    atomIds: z.array(atomIdRef).min(1).describe('Atom ids to translate (>= 1).'),
    dx: dxPx,
    dy: dyPx,
  }),
  coordsTableRow,
  applyCoordsTable: z.object({
    atomIds: z.array(atomIdRef).min(1).describe('Target atom ids in table order; rows match by atomId, then index, then order.'),
    rows: z.array(coordsTableRow).min(1).describe('Coordinate rows (>= 1), one per atom, e.g. parsed from a copied coordinate table.'),
  }),
  rotateAtoms: z.object({
    atomIds: z.array(atomIdRef).min(1).describe('Atom ids to rotate (>= 1).'),
    cx: cxPx,
    cy: cyPx,
    deltaRad: z.number().describe('Rotation angle in radians (positive = clockwise on screen since y grows down).'),
  }),
  scaleAtoms: z.object({
    atomIds: z.array(atomIdRef).min(1).describe('Atom ids to scale (>= 1).'),
    cx: cxPx,
    cy: cyPx,
    factor: z.number().positive().describe('Horizontal scale factor about the pivot (1 = unchanged).'),
    factorY: z
      .number()
      .positive()
      .optional()
      .describe('Vertical scale factor; defaults to `factor` for uniform resize.'),
  }),
  reflectAtoms: z.object({
    atomIds: z.array(atomIdRef).min(1).describe('Atom ids to mirror (>= 1).'),
    cx: cxPx,
    cy: cyPx,
    /** `horizontal` = flip left↔right; `vertical` = flip top↔bottom. */
    axis: z
      .enum(['horizontal', 'vertical'])
      .describe('horizontal = flip left<->right about x = cx; vertical = flip top<->bottom about y = cy.'),
  }),
  alignSelectedFragments: z.object({
    atomIds: z.array(atomIdRef).min(2).describe('Atom ids spanning >= 2 separate molecules; whole molecules are aligned.'),
    mode: z
      .enum(['top', 'center', 'bottom', 'left', 'right', 'centerX'])
      .describe('Edge to align: top/center/bottom (vertical, center = y-centre) or left/right/centerX (horizontal).'),
  }),
  distributeSelectedFragments: z.object({
    atomIds: z.array(atomIdRef).min(2).describe('Atom ids spanning >= 2 separate molecules; whole molecules are moved.'),
    axis: z
      .enum(['horizontal', 'vertical', 'grid', 'circle', 'row'])
      .describe('horizontal/vertical = equal gaps along that axis; grid = rows x cols; circle = around a ring; row = neat left-to-right row (aligned centres, fixed gap).'),
    /** Circle layout: center-to-center radius in world units (auto if omitted). */
    radius: z.number().positive().describe('Circle layout only: ring radius in canvas px (auto when omitted).').optional(),
  }),
  circularArraySelection: z.object({
    atomIds: z.array(atomIdRef).min(1).describe('Atom ids of the source selection to replicate (>= 1).'),
    /** Total instances including the original (2–36). */
    count: z.number().int().min(2).max(36).describe('Total instances including the original (2-36).'),
    /** Center-to-centroid radius in world units. */
    radius: z.number().positive().describe('Distance from array centre to each copy centroid in canvas px.'),
    /**
     * Angle in degrees between consecutive instances.
     * Omit for equal spacing around a full circle (`360 / count`).
     */
    spacingDeg: z
      .number()
      .positive()
      .max(360)
      .describe('Angle between consecutive copies in degrees; omit for 360 / count.')
      .optional(),
    /** Rotate each copy by its polar angle (default true). */
    rotate: z.boolean().describe('True rotates each copy by its polar angle; false keeps orientation (default true).').default(true),
    /** Prior array copies to remove before re-applying (live Pattern preview). */
    replaceAtomIds: z
      .array(atomIdRef)
      .describe('Atom ids of previous array copies to delete before re-applying (live preview).')
      .optional(),
  }),
  linearArraySelection: z.object({
    atomIds: z.array(atomIdRef).min(1).describe('Atom ids of the source selection to replicate (>= 1).'),
    /** Total instances including the original (2–36). */
    count: z.number().int().min(2).max(36).describe('Total instances including the original (2-36).'),
    /** Center-to-center spacing along +X in world units. */
    spacingPx: z.number().positive().describe('Centre-to-centre spacing between copies along +x in canvas px.'),
    rotate: z.boolean().describe('True rotates copies along the array direction; false keeps orientation (default).').default(false),
    replaceAtomIds: z
      .array(atomIdRef)
      .describe('Atom ids of previous array copies to delete before re-applying (live preview).')
      .optional(),
  }),
  dendrimerArraySelection: z.object({
    atomIds: z.array(atomIdRef).min(1).describe('Atom ids of the branch selection to replicate radially (>= 1).'),
    /** Radial fold count (3–12). */
    foldCount: z.number().int().min(3).max(12).describe('Number of radial copies around the core (3-12).'),
    /** Optional explicit core atom ids (ring). Inferred from selection when omitted. */
    coreAtomIds: z
      .array(atomIdRef)
      .describe('Atom ids of the central core ring; inferred from the selection when omitted.')
      .optional(),
  }),
  groupSelection: z.object({
    atomIds: z.array(atomIdRef).min(1).describe('Atom ids whose molecules are grouped into one Objects collection (>= 1).'),
    name: z.string().describe('Display name for the new collection; auto-generated when omitted.').optional(),
  }),
  ungroupSelection: z.object({
    atomIds: z.array(atomIdRef).min(1).describe('Atom ids whose grouping / instance arrays are dissolved (>= 1).'),
  }),
  generateDendrimer: z.object({
    /** Catalog id from `packages/core/src/dendrimers/registry.ts` (e.g. `pamam-g2`). */
    presetId: z.string().min(1).describe('Dendrimer preset id from the catalog (e.g. "pamam-g2").'),
    bondLengthPx: z.number().positive().describe('Target bond length in canvas px (default 40).').default(40),
    cx: z.number().describe('Centre x of the generated structure in canvas px.'),
    cy: z.number().describe('Centre y of the generated structure in canvas px (y grows downward).'),
    replaceAtomIds: z
      .array(atomIdRef)
      .describe('Atom ids of a previous generation to delete before inserting (live preview).')
      .optional(),
  }),
  generatePolymer: z.object({
    /** Catalog id from `packages/core/src/polymers/registry.ts` (e.g. `peg`). */
    presetId: z.string().min(1).describe('Polymer preset id from the catalog (e.g. "peg").'),
    bondLengthPx: z.number().positive().describe('Target bond length in canvas px (default 40).').default(40),
    cx: z.number().describe('Centre x of the generated structure in canvas px.'),
    cy: z.number().describe('Centre y of the generated structure in canvas px (y grows downward).'),
    replaceAtomIds: z
      .array(atomIdRef)
      .describe('Atom ids of a previous generation to delete before inserting (live preview).')
      .optional(),
  }),
  generateCof: z.object({
    /** Catalog id from COF or MOF registries (e.g. `cof-1`, `cu-hhtp`). */
    presetId: z.string().min(1).describe('COF / MOF preset id from the catalog (e.g. "cof-1", "cu-hhtp").'),
    /** Pore columns (horizontal packing). */
    cols: z.number().int().min(1).max(12).describe('Number of pore columns packed horizontally (1-12).').default(1),
    /** Pore rows (vertical packing). */
    rows: z.number().int().min(1).max(12).describe('Number of pore rows packed vertically (1-12).').default(1),
    /** Stacked layers along c (depth). 1 = single 2D sheet. */
    layers: z.number().int().min(1).max(6).describe('Stacked sheets along the c axis (1-6); 1 = single 2D sheet.').default(1),
    bondLengthPx: z.number().positive().describe('Target bond length in canvas px (default 40).').default(40),
    cx: z.number().describe('Centre x of the generated lattice in canvas px.'),
    cy: z.number().describe('Centre y of the generated lattice in canvas px (y grows downward).'),
    replaceAtomIds: z
      .array(atomIdRef)
      .describe('Atom ids of a previous generation to delete before inserting (live preview).')
      .optional(),
    latticeId: z
      .string()
      .describe('Stable lattice id to reuse when regenerating; a new id is created and returned when omitted.')
      .optional(),
  }),
  generateGraphene: z.object({
    /** Hexagon columns (zigzag width). For circular, diameter in hex cells. */
    cols: z
      .number()
      .int()
      .min(1)
      .max(12)
      .describe('Hexagon columns (zigzag width, 1-12); for circular shape the diameter in hex cells.')
      .default(4),
    /** Hexagon rows (height). Ignored when shape is circular. */
    rows: z.number().int().min(1).max(12).describe('Hexagon rows (height, 1-12); ignored for circular shape.').default(3),
    /** Rectangular HCP sheet, or circular flake mask. */
    shape: z
      .enum(['rectangular', 'circular'])
      .describe('rectangular = cols x rows sheet; circular = round flake masked to cols diameter.')
      .default('rectangular'),
    bondLengthPx: z.number().positive().describe('Target bond length in canvas px (default 40).').default(40),
    cx: z.number().describe('Centre x of the generated sheet in canvas px.'),
    cy: z.number().describe('Centre y of the generated sheet in canvas px (y grows downward).'),
    oxidation: z
      .enum(['none', 'rgo'])
      .describe(
        'none = pristine graphene; rgo = reduced graphene oxide with sparse residual edge -OH/-COOH, basal -OH and epoxide groups.',
      )
      .default('none'),
    replaceAtomIds: z
      .array(atomIdRef)
      .describe('Atom ids of a previous generation to delete before inserting (live preview).')
      .optional(),
  }),
  deleteAtoms: z.object({
    atomIds: z.array(atomIdRef).min(1).describe('Atom ids to delete (>= 1); incident bonds are removed too.'),
  }),
  deleteBonds: z.object({ bondIds: z.array(bondIdRef).min(1).describe('Bond ids to delete (>= 1); atoms stay.') }),
  deleteSelection: z
    .object({
      atomIds: z.array(atomIdRef).describe('Atom ids to delete (default none).').default([]),
      bondIds: z.array(bondIdRef).describe('Bond ids to delete (default none).').default([]),
    })
    .refine(v => v.atomIds.length + v.bondIds.length > 0, {
      message: 'At least one atomId or bondId is required',
    }),
  duplicateAtoms: z.object({
    atomIds: z.array(atomIdRef).min(1).describe('Atom ids to copy (>= 1); bonds among them are copied too.'),
    dx: dxPx.describe('Horizontal offset of the copy in canvas px (positive = right).'),
    dy: dyPx.describe('Vertical offset of the copy in canvas px (positive = down).'),
  }),

  // ─── Bonds ─────────────────────────────────────────────────────────────
  addBond: z.object({
    bond: newBond,
    strict: z
      .boolean()
      .optional()
      .describe(
        'True refuses chemically undefined results (valency overflow, cumulated ring doubles, ring triples). Default false: apply and let the sketcher show an octet warning.',
      ),
  }),
  updateBond: z.object({
    bondId: bondIdRef,
    strict: z
      .boolean()
      .optional()
      .describe(
        'True refuses chemically undefined results (valency overflow, cumulated ring doubles, ring triples). Default false: apply and let the sketcher show an octet warning.',
      ),
    order: z.number().int().min(1).max(3).describe('New bond order: 1 single, 2 double, 3 triple; omit to keep.').optional(),
    /** Pass `null` to clear stereo (Zod strips `undefined`, so null is required to remove wedges). */
    stereo: z
      .enum(['wedge', 'dash', 'wavy', 'either', 'cis_trans'])
      .nullable()
      .describe(
        'Stereo mark: wedge (up), dash (down), wavy (unknown), either (wedge/hash), cis_trans (E/Z unspecified); null clears.',
      )
      .optional(),
    dative: z.boolean().describe('True renders a dative / coordination arrow bond; false makes it normal.').optional(),
    dotted: z.boolean().describe('True renders a dotted partial / hydrogen bond; false makes it solid.').optional(),
    aromatic: z.boolean().describe('True renders an aromatic bond (solid inner circle in rings); false clears.').optional(),
    queryType: z
      .enum(['any', 'single_double', 'single_aromatic', 'double_aromatic'])
      .nullable()
      .describe('Query bond type (molfile 5–8); null clears.')
      .optional(),
    bold: z.boolean().describe('True draws a thick foreground bond; false clears.').optional(),
    orderCycleRamp: z
      .enum(['up', 'down'])
      .nullable()
      .describe('Internal: direction of the bond-order cycle ramp (up or down); null clears.')
      .optional(),
  }),
  flipBondEndpoints: z.object({ bondId: bondIdRef.describe('Bond id whose from/to atoms are swapped (flips wedge direction).') }),
  invertStereoAtAtom: z.object({
    atomId: atomIdRef.describe('Stereocentre atom id; every wedge/dash bond on it flips up<->down.'),
  }),
  swapAtomPositions: z.object({
    atomIdA: atomIdRef.describe('First atom id; takes the canvas position of atomIdB.'),
    atomIdB: atomIdRef.describe('Second atom id; takes the canvas position of atomIdA.'),
  }),

  // ─── Rings / chains ────────────────────────────────────────────────────
  addRing: z.object({
    center: point.describe('Ring centre in canvas px.'),
    numSides: z.number().int().min(3).max(12).describe('Number of ring atoms (3-12; 6 = benzene/cyclohexane).'),
    isAromatic: z.boolean().describe('True adds alternating double bonds (benzene-style); false makes a saturated ring.'),
    isCyclopentadiene: z
      .boolean()
      .describe('True with numSides 5 and isAromatic gives a 1,3-diene pattern instead of full alternation.')
      .optional(),
    angleOffset: z.number().describe('Polar angle of the first ring vertex in radians (0 = right of centre).'),
    rootAtomId: atomIdRef
      .describe('Existing atom to build from: becomes the first ring vertex, or the attach point when attachedViaBond.')
      .optional(),
    attachedViaBond: z
      .boolean()
      .describe('True links the ring to rootAtomId by a new single bond instead of sharing that atom as a vertex.')
      .optional(),
    fusedBondId: bondIdRef
      .describe('Existing bond to fuse onto; its two atoms become the first two ring vertices.')
      .optional(),
    angleStep: z.number().describe('Angle between consecutive vertices in radians (default 2*pi / numSides).').optional(),
    radius: z.number().positive().describe('Circumradius in canvas px (default 40).').optional(),
  }),
  addBoatRing: z.object({
    center: point.describe('Ring centre in canvas px.'),
    bondLengthPx: z.number().positive().describe('Target bond length in canvas px (default 40).').optional(),
    rootAtomId: atomIdRef
      .describe('Existing atom to build from: becomes a ring vertex, or the attach point when attachedViaBond.')
      .optional(),
    attachedViaBond: z
      .boolean()
      .describe('True links the ring to rootAtomId by a new single bond instead of sharing that atom as a vertex.')
      .optional(),
    rotationRad: z
      .number()
      .describe('Rotation of the boat template in radians (0 = stock orientation).')
      .optional(),
  }),
  addChairRing: z.object({
    center: point.describe('Ring centre in canvas px.'),
    bondLengthPx: z.number().positive().describe('Target bond length in canvas px (default 40).'),
    rootAtomId: atomIdRef
      .describe('Existing atom to build from: becomes a ring vertex, or the attach point when attachedViaBond.')
      .optional(),
    attachedViaBond: z
      .boolean()
      .describe('True links the ring to rootAtomId by a new single bond instead of sharing that atom as a vertex.')
      .optional(),
    rotationRad: z
      .number()
      .describe('Rotation of the chair template in radians (0 = stock orientation).')
      .optional(),
  }),
  addChain: z.object({
    points: z.array(point).min(2).describe('Ordered vertex positions of the chain in canvas px (>= 2), one atom per point.'),
    placementElement: elementSymbol,
    startAtomId: atomIdRef.describe('Existing atom used as the first chain vertex instead of creating one at points[0].').optional(),
  }),

  // ─── Strokes / arrows / text ───────────────────────────────────────────
  addStroke: z.object({ stroke: stroke.describe('Freehand pen stroke to add.') }),
  translateStroke: z.object({
    id: z.string().describe('Stroke id from molecule.list_annotations.'),
    dx: dxPx,
    dy: dyPx,
  }),
  translateMarqueeSelection: z.object({
    atomIds: z.array(atomIdRef).describe('Atom ids to move (may be empty).'),
    arrowIds: z.array(z.string()).describe('Reaction arrow ids to move (may be empty).'),
    strokeIds: z.array(z.string()).describe('Freehand stroke ids to move (may be empty).'),
    textIds: z.array(z.string()).describe('Canvas text ids to move (may be empty).'),
    shapeIds: z.array(z.string()).describe('Canvas shape ids to move (may be empty).'),
    imageIds: z.array(z.string()).describe('Canvas image ids to move (may be empty).'),
    dx: dxPx,
    dy: dyPx,
  }),
  addReactionArrow: z.object({ arrow: reactionArrow.describe('Reaction arrow to add.') }),
  updateReactionArrow: z.object({
    id: z.string().describe('Reaction arrow id from molecule.list_annotations.'),
    x1: z.number().describe('New tail x in canvas px; omit to keep.').optional(),
    y1: z.number().describe('New tail y in canvas px; omit to keep.').optional(),
    x2: z.number().describe('New head x in canvas px; omit to keep.').optional(),
    y2: z.number().describe('New head y in canvas px; omit to keep.').optional(),
    kind: reactionArrowKind.optional(),
    cx: z.number().describe('Quadratic control x (curved/electron_flow) or cycle centre x (cycle_arc), canvas px.').optional(),
    cy: z.number().describe('Quadratic control y (curved/electron_flow) or cycle centre y (cycle_arc), canvas px.').optional(),
    c1x: z.number().describe('First cubic control x for s_curve, canvas px.').optional(),
    c1y: z.number().describe('First cubic control y for s_curve, canvas px.').optional(),
    c2x: z.number().describe('Second cubic control x for s_curve, canvas px.').optional(),
    c2y: z.number().describe('Second cubic control y for s_curve, canvas px.').optional(),
    pathPoints: z
      .array(point)
      .min(2)
      .describe('Polyline vertices for kind path/row_wrap (>= 2, first = tail, last = head), canvas px.')
      .optional(),
    doubleHead: z.boolean().describe('True draws a second head at the tail (legacy curved resonance).').optional(),
    fromAnchor: arrowAnchor
      .nullable()
      .describe('Chemistry anchor for the tail; null detaches and keeps free x1/y1.')
      .optional(),
    toAnchor: arrowAnchor
      .nullable()
      .describe('Chemistry anchor for the head; null detaches and keeps free x2/y2.')
      .optional(),
    headStyle: z
      .enum(['filled', 'open', 'pair', 'single', 'none'])
      .describe('Arrow head: filled, open/pair, single fish-hook, none.')
      .optional(),
    tailStyle: z
      .enum(['none', 'bar', 'reverse', 'circle'])
      .describe('Arrow tail: none, bar, reverse head, or circle.')
      .optional(),
    curveAmount: z
      .number()
      .describe('Bend of electron_flow/curved arcs as signed fraction of chord length (default ~0.28).')
      .optional(),
    bulgeSide: z
      .union([z.literal(1), z.literal(-1)])
      .describe('Side the arc bulges toward: 1 = left-hand normal of the chord, -1 = right-hand.')
      .optional(),
    color: cssColor.describe('CSS colour of the arrow line and heads.').optional(),
    strokeWidth: z.number().positive().describe('Line width in canvas px.').optional(),
    headScale: z.number().positive().describe('Arrowhead size multiplier (1 = default).').optional(),
    reagentAbove: z.string().describe('Reagent/condition text above the shaft (newline for multi-line).').optional(),
    reagentBelow: z.string().describe('Reagent/condition text below the shaft (newline for multi-line).').optional(),
    reagentFontSize: z.number().positive().describe('Shared reagent text font size in canvas px (fallback for both slots).').optional(),
    reagentAboveFontSize: z.number().positive().describe('Font size in canvas px for text above the shaft.').optional(),
    reagentBelowFontSize: z.number().positive().describe('Font size in canvas px for text below the shaft.').optional(),
    reagentColor: cssColor.describe('CSS colour for the reagent text.').optional(),
    reagentFontWeight: z.enum(['normal', 'bold']).describe('Reagent text weight: normal or bold.').optional(),
    reagentFormat: z
      .enum(['plain', 'auto', 'latex'])
      .describe('Reagent text formatting: plain raw text, auto (chemistry subscripts like H2SO4), latex (\\ce{} math).')
      .optional(),
  }),
  deleteReactionArrow: z.object({ id: z.string().describe('Reaction arrow id from molecule.list_annotations.') }),
  duplicateReactionArrow: z.object({
    id: z.string().describe('Reaction arrow id to copy.'),
    dx: dxPx.describe('Horizontal offset of the copy in canvas px (positive = right).'),
    dy: dyPx.describe('Vertical offset of the copy in canvas px (positive = down).'),
  }),

  addReactionMultiStep: z.object({
    groupId: z.string().min(1).describe('New multi-step group id stored on each arrow as multiStepGroupId.'),
    title: z.string().describe('Optional title for the route (shown in summaries).').optional(),
    startX: z.number().describe('Tail x of the first arrow in canvas px; arrows run left to right.'),
    startY: z.number().describe('Shared y of all arrows in canvas px (y grows downward).'),
    segmentLength: z.number().positive().describe('Default shaft length of each arrow in canvas px.'),
    gapBetweenSteps: z
      .number()
      .nonnegative()
      .describe('Gap between the head of one arrow and the tail of the next in canvas px (default 72).')
      .optional(),
    defaultKind: reactionArrowKind.describe('Arrow style used for steps without their own kind (default straight).').optional(),
    steps: z
      .array(
        z.object({
          reagentAbove: z.string().describe('Reagent/condition text above this arrow.').optional(),
          reagentBelow: z.string().describe('Reagent/condition text below this arrow.').optional(),
          kind: reactionArrowKind.describe('Arrow style for this step; falls back to defaultKind.').optional(),
          segmentLength: z.number().positive().describe('Shaft length override for this step in canvas px.').optional(),
        }),
      )
      .min(1)
      .describe('Ordered reaction steps (>= 1); one arrow is created per entry.'),
  }),

  addCanvasText: z.object({ text: canvasText.describe('Free-floating text label to add.') }),
  updateCanvasText: z.object({
    id: z.string().describe('Canvas text id from molecule.list_annotations.'),
    patch: canvasText.partial().describe('Fields to change; omitted fields keep their current value.'),
  }),
  deleteCanvasText: z.object({ id: z.string().describe('Canvas text id from molecule.list_annotations.') }),
  duplicateCanvasText: z.object({
    id: z.string().describe('Canvas text id to copy.'),
    dx: dxPx.describe('Horizontal offset of the copy in canvas px (positive = right).'),
    dy: dyPx.describe('Vertical offset of the copy in canvas px (positive = down).'),
  }),
  addSruBracket: z.object({ bracket: sruBracket.describe('Polymer repeating-unit bracket to add.') }),
  updateSruBracket: z.object({
    id: z.string().describe('SRU bracket id from molecule.list_annotations.'),
    patch: sruBracket.omit({ id: true }).partial().describe('Fields to change; omitted fields keep their current value.'),
  }),
  deleteSruBracket: z.object({ id: z.string().describe('SRU bracket id from molecule.list_annotations.') }),
  duplicateStroke: z.object({
    id: z.string().describe('Stroke id to copy.'),
    dx: dxPx.describe('Horizontal offset of the copy in canvas px (positive = right).'),
    dy: dyPx.describe('Vertical offset of the copy in canvas px (positive = down).'),
  }),
  addCanvasShape: z.object({ shape: canvasShape.describe('Geometry or glassware shape to add.') }),
  addCanvasOrbital: z.object({ orbital: canvasOrbital.describe('Atomic-orbital graphic to add.') }),
  deleteCanvasOrbital: z.object({ id: z.string().describe('Canvas orbital id from molecule.list_annotations.') }),
  updateCanvasOrbital: z.object({
    id: z.string().describe('Canvas orbital id from molecule.list_annotations.'),
    patch: canvasOrbital
      .partial()
      .omit({ id: true })
      .extend({
        atomId: atomIdRef
          .nullable()
          .describe('Atom id to attach the orbital to; null detaches it (stays at x/y).')
          .optional(),
      })
      .describe('Fields to change; omitted fields keep their current value.'),
  }),
  updateCanvasShape: z.object({
    id: z.string().describe('Canvas shape id from molecule.list_annotations.'),
    patch: canvasShape.partial().omit({ id: true }).describe('Fields to change; omitted fields keep their current value.'),
  }),
  /** Translate many shapes by the same delta (COF group move). */
  translateCanvasShapes: z.object({
    ids: z.array(z.string()).min(1).describe('Canvas shape ids to move together (>= 1).'),
    dx: dxPx,
    dy: dyPx,
  }),
  duplicateCanvasShape: z.object({
    id: z.string().describe('Canvas shape id to copy.'),
    dx: dxPx.describe('Horizontal offset of the copy in canvas px (positive = right).'),
    dy: dyPx.describe('Vertical offset of the copy in canvas px (positive = down).'),
  }),
  reflectCanvasShape: z.object({
    id: z.string().describe('Canvas shape id to mirror in place.'),
    axis: z
      .enum(['horizontal', 'vertical'])
      .describe('horizontal = flip left<->right about the shape centre; vertical = flip top<->bottom.'),
  }),
  addCanvasImage: z.object({ image: canvasImage.describe('Raster image to add.') }),
  updateCanvasImage: z.object({
    id: z.string().describe('Canvas image id from molecule.list_annotations.'),
    patch: z
      .object({
        x: z.number().describe('New top-left x in canvas px; omit to keep.').optional(),
        y: z.number().describe('New top-left y in canvas px; omit to keep.').optional(),
        width: z.number().positive().describe('New displayed width in canvas px; omit to keep.').optional(),
        height: z.number().positive().describe('New displayed height in canvas px; omit to keep.').optional(),
        rotationRad: rotationRad.describe('New rotation about the image centre in radians; omit to keep.').optional(),
        name: z.string().describe('New display name; omit to keep.').optional(),
      })
      .strict()
      .describe('Fields to change (unknown keys rejected); omitted fields keep their current value.'),
  }),
  deleteCanvasImage: z.object({ id: z.string().describe('Canvas image id from molecule.list_annotations.') }),
  duplicateCanvasImage: z.object({
    id: z.string().describe('Canvas image id to copy.'),
    dx: dxPx.describe('Horizontal offset of the copy in canvas px (positive = right).'),
    dy: dyPx.describe('Vertical offset of the copy in canvas px (positive = down).'),
  }),

  // ─── Whole-document ────────────────────────────────────────────────────
  clearAll: z.object({}),
  pasteFragment: z.object({
    atoms: z.array(atom).min(1).describe('Atom records of the fragment (>= 1) with ids unique within the fragment.'),
    bonds: z.array(bond).describe('Bond records of the fragment referencing the fragment atom ids.'),
    /** Translation applied to the fragment before insertion. */
    dx: dxPx.describe('Horizontal translation applied to the fragment before insertion, canvas px.'),
    dy: dyPx.describe('Vertical translation applied to the fragment before insertion, canvas px (positive = down).'),
    viewport: z
      .object({
        x: z.number().describe('Viewport pan x: screen px of world origin.'),
        y: z.number().describe('Viewport pan y: screen px of world origin.'),
        zoom: z.number().positive().describe('Viewport zoom factor (1 = 100%).'),
      })
      .describe('Current viewport used to keep the paste in view and avoid overlap.')
      .optional(),
    windowWidth: z.number().positive().describe('Visible canvas width in screen px.').optional(),
    windowHeight: z.number().positive().describe('Visible canvas height in screen px.').optional(),
    bondLengthPx: z.number().positive().describe('Target bond length in canvas px for overlap gap (default 40).').optional(),
  }),
  mergeSketch: z.object({
    atoms: z
      .array(
        z.object({
          tempId: z.string().min(1).describe('Temporary id unique within this sketch; bonds and snap refer to it.'),
          element: z.string().min(1).describe('Element symbol (e.g. C, N, O) or pseudo-atom for the new atom.'),
          x: z.number().describe('World x in canvas px.'),
          y: z.number().describe('World y in canvas px (y grows downward).'),
          charge: z.number().int().describe('Formal charge (default 0).').optional(),
          alias: z.string().min(1).describe('Abbreviation label to show instead of the element (e.g. "OMe").').optional(),
        }),
      )
      .min(1)
      .describe('Sketch atoms (>= 1) identified by tempId; real ids are generated on merge.'),
    bonds: z
      .array(
        z.object({
          fromTempId: z.string().min(1).describe('tempId of the first atom.'),
          toTempId: z.string().min(1).describe('tempId of the second atom.'),
          order: z.number().int().min(1).max(3).describe('Bond order: 1 single, 2 double, 3 triple.'),
          stereo: z
            .enum(['wedge', 'dash', 'wavy', 'either', 'cis_trans'])
            .describe('Stereo mark: wedge, dash, wavy, either (wedge/hash), cis_trans (unspecified E/Z).')
            .optional(),
          aromatic: z.boolean().describe('True renders the bond as aromatic (solid inner circle in rings).').optional(),
          queryType: z
            .enum(['any', 'single_double', 'single_aromatic', 'double_aromatic'])
            .optional(),
          dotted: z.boolean().optional(),
          dative: z.boolean().optional(),
          bold: z.boolean().optional(),
        }),
      )
      .describe('Sketch bonds between tempIds (may be empty).'),
    snap: z
      .array(
        z.object({
          tempId: z.string().min(1).describe('Sketch atom tempId that should merge onto an existing atom.'),
          existingAtomId: atomIdRef.describe('Existing atom id that absorbs the sketch atom (no new atom is created).'),
        }),
      )
      .describe('Optional tempId -> existing atom mappings that join the sketch to the current structure.')
      .optional(),
  }),

  erase: z.discriminatedUnion('type', [
    z.object({ type: z.literal('atom').describe('Erase an atom and its bonds.'), atomId: atomIdRef }),
    z.object({ type: z.literal('bond').describe('Erase a single bond.'), bondId: bondIdRef }),
    z.object({
      type: z.literal('stroke').describe('Erase a freehand stroke.'),
      strokeId: z.string().describe('Stroke id from molecule.list_annotations.'),
    }),
    z.object({
      type: z.literal('reactionArrow').describe('Erase a reaction arrow.'),
      id: z.string().describe('Reaction arrow id from molecule.list_annotations.'),
    }),
    z.object({
      type: z.literal('canvasText').describe('Erase a canvas text label.'),
      id: z.string().describe('Canvas text id from molecule.list_annotations.'),
    }),
    z.object({
      type: z.literal('canvasShape').describe('Erase a canvas shape / glassware.'),
      id: z.string().describe('Canvas shape id from molecule.list_annotations.'),
    }),
    z.object({
      type: z.literal('canvasImage').describe('Erase a canvas image.'),
      id: z.string().describe('Canvas image id from molecule.list_annotations.'),
    }),
    z.object({
      type: z.literal('sruBracket').describe('Erase a polymer SRU bracket.'),
      id: z.string().describe('SRU bracket id from molecule.list_annotations.'),
    }),
    z.object({
      type: z.literal('canvasOrbital').describe('Erase an orbital graphic.'),
      id: z.string().describe('Canvas orbital id from molecule.list_annotations.'),
    }),
  ]),

  deleteStroke: z.object({ id: z.string().describe('Stroke id from molecule.list_annotations.') }),
  deleteCanvasShape: z.object({ id: z.string().describe('Canvas shape id from molecule.list_annotations.') }),

  applyRingFill: z.object({
    ringAtomIds: z.array(atomIdRef).min(3).describe('Atom ids of one closed ring in cyclic order (>= 3).'),
    color: cssColor.describe('CSS fill colour for the ring interior.'),
    opacity: z.number().min(0).max(1).describe('Fill opacity 0-1 (0 transparent, 1 opaque).'),
  }),

  importPlacement: z
    .enum(['origin', 'viewport_center'])
    .describe('Where to place imports: origin = centroid at (0,0); viewport_center = staggered grid in the visible view.'),
  importViewport: z.object({
    x: z.number().describe('Viewport pan x: screen px of world origin (canvas top-left based).'),
    y: z.number().describe('Viewport pan y: screen px of world origin.'),
    zoom: z.number().positive().describe('Viewport zoom factor (1 = 100%).'),
  }),
  gridSlot: z.object({
    col: z.number().int().nonnegative().describe('0-based column in the import grid.'),
    row: z.number().int().nonnegative().describe('0-based row in the import grid.'),
  }),
  gridOrigin: z.object({
    x: z.number().describe('World x of import grid slot (0,0) centre in canvas px.'),
    y: z.number().describe('World y of import grid slot (0,0) centre in canvas px.'),
  }),

  importMolblock: z.object({
    molblock: z.string().min(1).describe('V2000 molblock text to import (multi-line, with header and M  END).'),
    mode: z.enum(['merge', 'replace']).describe('merge = add to the existing document; replace = clear it first.'),
    bondLengthPx: z.number().positive().describe('Target bond length in canvas px (default 40); the import is rescaled to it.'),
    placement: z
      .enum(['origin', 'viewport_center'])
      .describe('origin = centroid at (0,0) (default); viewport_center = staggered grid inside the visible view.')
      .optional(),
    keepAnnotations: z
      .boolean()
      .describe('replace mode: true keeps arrows, text, shapes and other annotations; false clears them too.')
      .optional(),
    viewport: z
      .object({
        x: z.number().describe('Viewport pan x: screen px of world origin.'),
        y: z.number().describe('Viewport pan y: screen px of world origin.'),
        zoom: z.number().positive().describe('Viewport zoom factor (1 = 100%).'),
      })
      .describe('Current viewport used for viewport_center placement (default x 0, y 0, zoom 1).')
      .optional(),
    windowWidth: z.number().positive().describe('Visible canvas width in screen px for viewport_center placement (default 1200).').optional(),
    windowHeight: z.number().positive().describe('Visible canvas height in screen px for viewport_center placement (default 800).').optional(),
    gridSlot: z
      .object({
        col: z.number().int().nonnegative().describe('0-based column in the import grid.'),
        row: z.number().int().nonnegative().describe('0-based row in the import grid.'),
      })
      .describe('Grid cell for this import when placing several molecules (default col 0, row 0).')
      .optional(),
    gridOrigin: z
      .object({
        x: z.number().describe('World x of grid slot (0,0) centre in canvas px.'),
        y: z.number().describe('World y of grid slot (0,0) centre in canvas px.'),
      })
      .describe('Stable world centre of grid slot (0,0); keeps multi-import layout when the viewport pans.')
      .optional(),
  }),

  replaceFromMolblock: z.object({
    molblock: z.string().min(1).describe('V2000 molblock text that replaces the current structure.'),
    bondLengthPx: z.number().positive().describe('Target bond length in canvas px (default 40); the import is rescaled to it.'),
    placement: z
      .enum(['origin', 'viewport_center'])
      .describe('origin = centroid at (0,0) (default); viewport_center = staggered grid inside the visible view.')
      .optional(),
    keepAnnotations: z
      .boolean()
      .describe('True keeps arrows, text, shapes and other annotations; false clears them too.')
      .optional(),
    viewport: z
      .object({
        x: z.number().describe('Viewport pan x: screen px of world origin.'),
        y: z.number().describe('Viewport pan y: screen px of world origin.'),
        zoom: z.number().positive().describe('Viewport zoom factor (1 = 100%).'),
      })
      .describe('Current viewport used for viewport_center placement (default x 0, y 0, zoom 1).')
      .optional(),
    windowWidth: z.number().positive().describe('Visible canvas width in screen px for viewport_center placement (default 1200).').optional(),
    windowHeight: z.number().positive().describe('Visible canvas height in screen px for viewport_center placement (default 800).').optional(),
    gridSlot: z
      .object({
        col: z.number().int().nonnegative().describe('0-based column in the import grid.'),
        row: z.number().int().nonnegative().describe('0-based row in the import grid.'),
      })
      .describe('Grid cell for this import when placing several molecules (default col 0, row 0).')
      .optional(),
    gridOrigin: z
      .object({
        x: z.number().describe('World x of grid slot (0,0) centre in canvas px.'),
        y: z.number().describe('World y of grid slot (0,0) centre in canvas px.'),
      })
      .describe('Stable world centre of grid slot (0,0); keeps multi-import layout when the viewport pans.')
      .optional(),
  }),

  cleanup: z.object({
    bondLengthPx: z.number().positive().describe('Target bond length in canvas px (default 40).').optional(),
  }),
  aromatize: z.object({
    mode: z
      .enum(['aromatize', 'dearomatize'])
      .describe('aromatize = mark aromatic rings; dearomatize = restore explicit Kekule double bonds.'),
    /** Result molblock; bond orders/aromatic flags are merged onto the live graph. */
    molBlock: z.string().min(1).describe('V2000 molblock returned by the (de)aromatize step; bond orders are merged onto the live graph.'),
    /** When set, only bonds fully inside this atom set are updated (current molecule / selection). */
    atomIds: z.array(z.string()).optional(),
  }),
  applyExplicitHydrogens: z.object({
    mode: z
      .enum(['fold', 'unfold', 'auto'])
      .describe('fold = remove explicit H atoms; unfold = add explicit H atoms; auto = toggle based on current state.'),
    /** Indigo convert_explicit_hydrogens result molblock. */
    molBlock: z.string().min(1).describe('V2000 molblock returned by Indigo convert_explicit_hydrogens for the requested mode.'),
  }),
  applyAtomMaps: z.object({
    /** Atom id → map number; ≤0 clears that atom's map. */
    mapsByAtomId: z
      .record(z.string(), z.number().describe('Reaction atom-map number (>= 1); 0 or negative clears the map.'))
      .describe('Map of atom id -> reaction atom-map number; values <= 0 clear that atom.'),
  }),
  clearAtomMaps: z.object({}),
  importSmiles: z.object({
    smiles: z
      .string()
      .min(1)
      .describe(
        'SMILES string OR common compound name / CAS (e.g. "c1ccccc1", "testosterone", "50-78-2"). Required.',
      ),
    mode: z
      .enum(['merge', 'replace'])
      .describe('merge = add to the existing document (default); replace = clear it first.')
      .optional(),
    placement: z
      .enum(['origin', 'viewport_center'])
      .describe('origin = centroid at (0,0); viewport_center = staggered grid inside the visible view.')
      .optional(),
  }),

  /** Merge already-placed atoms/bonds (CDXML / custom SMILES placement). */
  mergeImportedStructure: z.object({
    atoms: z.array(atom).min(1).describe('Already-positioned atom records to add (>= 1), canvas px coordinates.'),
    bonds: z.array(bond).describe('Bond records between the imported atoms (may be empty).'),
  }),
  replaceImportedStructure: z.object({
    atoms: z.array(atom).describe('Already-positioned atom records that replace the current structure.'),
    bonds: z.array(bond).describe('Bond records between the imported atoms (may be empty).'),
    keepAnnotations: z
      .boolean()
      .describe('True keeps arrows, text, shapes and other annotations; false clears them too.')
      .optional(),
  }),

  commitFragmentPlacement: z.object({
    fragmentAtoms: z.array(atom).min(1).describe('Atom records of the fragment / template to place (>= 1).'),
    fragmentBonds: z.array(bond).describe('Bond records of the fragment referencing fragmentAtoms ids.'),
    connectionAtomId: z
      .string()
      .nullable()
      .describe('Fragment atom id that bonds to the target when attaching; null for fragments with no attach point.'),
    placementKind: z
      .enum(['functional_group', 'template'])
      .describe('functional_group keeps library orientation on attach; template auto-rotates (default functional_group).')
      .optional(),
    commit: z
      .discriminatedUnion('type', [
        z.object({
          type: z.literal('attach').describe('Bond the fragment to an existing atom.'),
          targetAtomId: atomIdRef.describe('Existing atom id that receives the new bond from connectionAtomId.'),
        }),
        z.object({
          type: z.literal('free').describe('Drop the fragment at a free position.'),
          x: z.number().describe('Drop centre x in canvas px.'),
          y: z.number().describe('Drop centre y in canvas px (y grows downward).'),
        }),
      ])
      .describe('How to place the fragment: attach to an atom or drop free at x/y.'),
    bondLengthPx: z.number().positive().describe('Target bond length in canvas px (default 40).'),
    bondAngleSnapRad: z.number().describe('Angle grid for the new attach bond in radians (e.g. pi/12 = 15 degrees).'),
  }),

  commitAtomAlias: z.object({
    atomId: atomIdRef,
    alias: z.string().describe('Alias text typed by the user (e.g. "OMe", "NH3+", "BH4", "NaBH4", "COONa"); a trailing +/- sets formal charge.'),
  }),

  expandAlias: z.object({
    atomIds: z.array(atomIdRef).min(1).describe('Atom ids carrying an alias to expand into explicit atoms (>= 1).'),
  }),

  applyMarkupHighlight: z.object({
    /** `null` clears the highlighter fill. */
    color: cssColor.nullable().describe('CSS highlighter colour drawn behind the items; null clears the highlight.'),
    atomIds: z.array(atomIdRef).describe('Atom ids to highlight (may be empty).'),
    bondIds: z.array(bondIdRef).describe('Bond ids to highlight (may be empty).'),
  }),

  setStructureTheme: z.object({
    /** Theme id: `skeletal` (Default) or `simple` (ball-and-stick), or a plugin id. */
    themeId: z.string().min(1).describe('Theme id: "skeletal" (default line drawing), "simple" (ball-and-stick), or a plugin theme id.'),
    /** Omit to infer from `themeId` (`simple` → ball-stick, `skeletal` → skeletal). */
    drawMode: z
      .enum(['skeletal', 'ball-stick'])
      .describe('Render mode override: skeletal or ball-stick; inferred from themeId when omitted.')
      .optional(),
  }),

  applySelectionColor: z.object({
    color: cssColor.describe('CSS colour to apply (normalised to hex).'),
    flags: z
      .object({
        atomLabels: z.boolean().describe('True recolours the selected atom labels.'),
        bonds: z.boolean().describe('True recolours the selected bonds.'),
        ringFill: z.boolean().describe('True fills rings formed by the selected atoms with the colour.'),
        text: z.boolean().describe('True recolours the selected canvas text.'),
        arrowLine: z.boolean().describe('True recolours the selected reaction arrow line.'),
        arrowReagent: z.boolean().describe('True recolours the selected arrow reagent text.'),
        strokes: z.boolean().describe('True recolours the selected freehand stroke.'),
        canvasShapes: z.boolean().describe('True recolours the selected canvas shape outline.'),
      })
      .describe('Which kinds of selected items receive the colour.'),
    selectedAtomIds: z.array(atomIdRef).describe('Selected atom ids (may be empty).'),
    selectedBondIds: z.array(bondIdRef).describe('Selected bond ids; derived from selectedAtomIds when omitted.').optional(),
    selectedCanvasTextId: z.string().nullable().describe('Selected canvas text id, or null if none.'),
    selectedReactionArrowId: z.string().nullable().describe('Selected reaction arrow id, or null if none.'),
    selectedStrokeId: z.string().nullable().describe('Selected stroke id, or null if none.').optional(),
    selectedCanvasShapeId: z.string().nullable().describe('Selected canvas shape id, or null if none.').optional(),
    ringFillOpacity: z.number().min(0).max(1).describe('Opacity 0-1 used when flags.ringFill adds ring fills.'),
    clearRingFill: z.boolean().describe('True removes ring fills on rings formed by the selected atoms.').optional(),
    clearAllRingFills: z.boolean().describe('True removes every ring fill in the document.').optional(),
  }),

  clearSelectionColors: z.object({
    atomIds: z.array(atomIdRef).min(1).describe('Atom ids whose custom label/bond colours are reset (>= 1).'),
  }),

  applySelectionDisplayStyle: z.object({
    atomIds: z.array(atomIdRef).describe('Atom ids to style (may be empty).'),
    bondIds: z.array(bondIdRef).describe('Bond ids to style; derived from atomIds when omitted.').optional(),
    /** `null` clears per-atom override; omit to leave unchanged. */
    labelFontSizePt: z
      .number()
      .min(6)
      .max(48)
      .nullable()
      .describe('Per-atom label font size in points (6-48); null clears the override; omit to keep.')
      .optional(),
    /** `null` clears per-bond override; omit to leave unchanged. */
    bondThicknessPx: z
      .number()
      .min(0.5)
      .max(14)
      .nullable()
      .describe('Per-bond line thickness in canvas px (0.5-14); null clears the override; omit to keep.')
      .optional(),
    /** 0–1 opacity for selected atoms/bonds; `null` clears; omit to leave unchanged. */
    opacity: z
      .number()
      .min(0)
      .max(1)
      .nullable()
      .describe('Opacity 0-1 for the selected atoms/bonds; null clears the override; omit to keep.')
      .optional(),
  }),

  createObjectCollection: z.object({
    name: z.string().describe('Display name of the new collection (folder); auto-generated when omitted.').optional(),
    afterKey: z
      .string()
      .describe('Outline key (e.g. "mol:<id>", "shape:<id>", "collection:<id>") to insert after; appended when omitted.')
      .optional(),
  }),
  expandInstanceArrays: z.object({}).default({}),
  renameObjectOutline: z.object({
    key: z.string().min(1).describe('Outline key of the item, e.g. "mol:<id>", "arrow:<id>", "text:<id>", "collection:<id>".'),
    name: z.string().describe('New display name shown in the Objects panel.'),
  }),
  deleteObjectCollection: z.object({
    collectionId: z.string().min(1).describe('Collection id (the part after "collection:" in its outline key).'),
    /** When true, also delete annotation children (shapes, text, …). Mol fragments are only unparented. */
    deleteContents: z
      .boolean()
      .describe('True also deletes annotation children (shapes, text, ...); molecules are only unparented.')
      .optional(),
  }),
  setObjectOutlineParent: z.object({
    key: z.string().min(1).describe('Outline key of the item to move, e.g. "mol:<id>", "shape:<id>".'),
    collectionId: z.string().nullable().describe('Target collection id; null moves the item to the top level.'),
  }),
  setObjectCollectionCollapsed: z.object({
    collectionId: z.string().min(1).describe('Collection id to expand or collapse in the Objects panel.'),
    collapsed: z.boolean().describe('True collapses the collection; false expands it.'),
  }),
  reorderObjectOutline: z.object({
    orderedKeys: z.array(z.string()).describe('Complete new top-level order of outline keys (e.g. "mol:<id>", "collection:<id>").'),
  }),
  moveObjectOutline: z.object({
    key: z.string().min(1).describe('Outline key of the item to move one step, e.g. "mol:<id>", "text:<id>".'),
    direction: z.enum(['up', 'down']).describe('up = one position earlier in the list; down = one position later.'),
  }),
  placeObjectOutlineItem: z.object({
    key: z.string().min(1).describe('Outline key of the dragged item, e.g. "mol:<id>", "shape:<id>".'),
    targetKey: z.string().min(1).describe('Outline key to drop onto: a collection key nests inside; any other key inserts before it.'),
  }),

  applyCleanupResult: z.discriminatedUnion('mode', [
    z.object({
      mode: z.literal('local').describe('Apply the cleaned layout to a subset of atoms only.'),
      subsetAtomIds: z.array(atomIdRef).min(1).describe('Atom ids that were cleaned (>= 1), in molblock atom order.'),
      molBlock: z.string().min(1).describe('V2000 molblock with the cleaned coordinates for the subset.'),
    }),
    z.object({
      mode: z.literal('global').describe('Apply the cleaned layout to the whole structure.'),
      molBlock: z.string().min(1).describe('V2000 molblock with the cleaned coordinates for every atom.'),
    }),
  ]),

  insertDemoReaction: z.object({
    reactAtoms: z.array(atom).min(1).describe('Reactant atom records (>= 1), canvas px coordinates.'),
    reactBonds: z.array(bond).describe('Reactant bond records.'),
    prodAtoms: z.array(atom).min(1).describe('Product atom records (>= 1), canvas px coordinates.'),
    prodBonds: z.array(bond).describe('Product bond records.'),
    arrow: reactionArrow.describe('Reaction arrow placed between reactants and products.'),
  }),

  /** Replace canvas with multi-step mechanism + anchored electron-flow / ↔ demo. */
  insertDemoMechanism: z.object({}).default({}),

  // ─── Canvas 3D perspective (ChemDraw Clean Up / Perspective) ───────────
  apply3DPose: z.object({
    pose: perspectivePose.describe('3D pose to store: per-atom {x,y,z} positions plus depth-cue settings.'),
  }),
  clear3DPose: z.object({}).default({}),
  flatten3DPose: z.object({}).default({}),
  rotate3DPose: z.object({
    dAngleX: z.number().describe('Rotation about the horizontal screen axis in radians (tilts up/down).'),
    dAngleY: z.number().describe('Rotation about the vertical screen axis in radians (turns left/right).'),
  }),
  setPerspectiveDepthShading: z.object({
    depthShading: z.boolean().describe('True fades far atoms/bonds in the 3D pose; false draws everything opaque.'),
  }),
  setPerspectiveDepthFade: z.object({
    depthFade: z
      .number()
      .min(0)
      .max(1.5)
      .describe('Depth fade strength: 0 none, 1 ChemDraw-like (far ~5% opacity), up to 1.5.'),
  }),
  setPerspectiveDepthWedges: z.object({
    depthWedges: z.boolean().describe('True tapers plain single bonds toward the far end as a depth cue (display only).'),
  }),
} as const;
