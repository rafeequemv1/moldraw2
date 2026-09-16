import { GLASSWARE_SETUP_IDS } from '@moldraw/domain';
import { z } from 'zod';

export const emptyInputSchema = z.object({});

const glasswareSetupEnum = z.enum(
  GLASSWARE_SETUP_IDS as unknown as [string, ...string[]],
);

export const getStructureInputSchema = z.object({
  /** Cap atom/bond rows returned (ids always preferred). Default 500. */
  maxAtoms: z
    .number()
    .int()
    .positive()
    .max(5000)
    .describe('Max atom/bond rows to return (1-5000, default 500); atom ids are always included.')
    .optional(),
  /** Limit to one connected molecule (left-to-right index from get_canvas_state). */
  moleculeIndex: z
    .number()
    .int()
    .nonnegative()
    .describe(
      'Restrict output to one connected molecule: 0-based left-to-right index from molecule.get_canvas_state.',
    )
    .optional(),
});

export const getCanvasStateInputSchema = z.object({
  /** Per-atom x/y in each molecule (default true). */
  includeCoords: z
    .boolean()
    .describe('true (default) includes per-atom x/y in canvas px (x right, y down) for each molecule.')
    .optional(),
  /** Native SMILES per fragment + document (default true). */
  includeSmiles: z
    .boolean()
    .describe('true (default) includes a SMILES string per connected molecule plus the whole document.')
    .optional(),
  /** Arrow/text/stroke/shape/image details (default true). */
  includeAnnotations: z
    .boolean()
    .describe('true (default) includes reaction arrows, texts, strokes, shapes and images with their ids.')
    .optional(),
  /** Cap coords rows per molecule; atomIds always retained. */
  maxAtomsPerMolecule: z
    .number()
    .int()
    .positive()
    .max(5000)
    .describe('Max coordinate rows returned per molecule (1-5000); atomIds lists are never truncated.')
    .optional(),
});

export const findRingsInputSchema = z.object({
  /** Only rings of this size (e.g. 6 for benzene-like). */
  size: z
    .number()
    .int()
    .min(3)
    .max(20)
    .describe('Only return rings with this many atoms (3-20, e.g. 6 for benzene). Omit for all rings.')
    .optional(),
});

export const getSelectionInputSchema = emptyInputSchema;

export const listAnnotationsInputSchema = emptyInputSchema;

export const exportSmilesInputSchema = emptyInputSchema;

/** Headless picture of the canvas so an agent can verify what it drew. */
export const renderInputSchema = z.object({
  format: z
    .enum(['svg', 'png'])
    .optional()
    .describe(
      "Output format. 'svg' (default) is always available. 'png' requires a rasteriser in the host runtime; when none is present the tool falls back to SVG and sets `note`.",
    ),
  width: z
    .number()
    .int()
    .min(64)
    .max(2000)
    .optional()
    .describe('Output width in px (64–2000, default 800). Height follows the drawing aspect ratio.'),
  background: z
    .enum(['white', 'transparent'])
    .optional()
    .describe("Background fill: 'white' (default) or 'transparent'."),
  moleculeIndex: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe(
      'Render only one connected molecule (left-to-right index from molecule.get_canvas_state). Omit to render the whole canvas.',
    ),
  atomIds: z
    .array(z.string())
    .min(1)
    .optional()
    .describe(
      'Render only these atoms (ids from molecule.get_structure) and the bonds between them. Combined with moleculeIndex the intersection is used.',
    ),
});

export const colorRingsInputSchema = z.object({
  color: z
    .string()
    .min(1)
    .describe('Ring fill color as hex (#3b82f6) or CSS name (blue, red). Default #3b82f6 (blue).')
    .default('#3b82f6'),
  opacity: z
    .number()
    .min(0)
    .max(1)
    .describe('Ring fill opacity 0-1 (0 = invisible, 1 = solid). Default 0.35.')
    .default(0.35),
  /** Only rings of this size. */
  size: z
    .number()
    .int()
    .min(3)
    .max(20)
    .describe('Only paint rings with this many atoms (3-20, e.g. 6). Omit to paint every ring.')
    .optional(),
  /** Also color atom labels / bonds of ring atoms. */
  colorAtoms: z
    .boolean()
    .describe('true also recolors the atom labels of ring atoms with `color`. Default false.')
    .optional(),
  colorBonds: z
    .boolean()
    .describe('true also recolors the bonds between ring atoms with `color`. Default false.')
    .optional(),
});

export const colorSelectionInputSchema = z.object({
  color: z
    .string()
    .min(1)
    .describe('Color to apply as hex (#2563eb) or CSS name (blue, red, green).'),
  atomLabels: z
    .boolean()
    .describe('true (default) recolors the labels of the selected atoms.')
    .optional(),
  bonds: z
    .boolean()
    .describe('true (default) recolors the selected bonds and bonds touching selected atoms.')
    .optional(),
  ringFill: z
    .boolean()
    .describe('true fills rings formed by the selected atoms with `color`. Default false.')
    .optional(),
  ringFillOpacity: z
    .number()
    .min(0)
    .max(1)
    .describe('Ring fill opacity 0-1 used when ringFill is true. Default 0.35.')
    .optional(),
});

export const colorByElementInputSchema = z.object({
  /** Element symbol, e.g. O, N, Cl. */
  element: z
    .string()
    .min(1)
    .max(2)
    .describe('Element symbol whose atoms to recolor, 1-2 letters (e.g. O, N, Cl).'),
  /**
   * Hex (#dc2626), a name (red/blue/…), or "default" for the element palette color.
   * Default: element palette (O → red).
   */
  color: z
    .string()
    .min(1)
    .describe(
      "Hex (#dc2626), CSS name (red), or 'default' for the element palette color (e.g. O -> red). Default: palette.",
    )
    .optional(),
  /** Also recolor bonds that touch those atoms. */
  colorBonds: z
    .boolean()
    .describe('true also recolors bonds attached to the matched atoms. Default false.')
    .optional(),
});

export const colorByBondOrderInputSchema = z.object({
  /**
   * Bond kind: double / single / triple / aromatic / dative / wedge / dash,
   * or numeric 1 / 2 / 3.
   */
  bondOrder: z
    .union([z.string().min(1), z.number().int().min(1).max(3)])
    .describe(
      "Which bonds to recolor: 'single'|'double'|'triple'|'aromatic'|'dative'|'wedge'|'dash', or number 1|2|3.",
    ),
  /** Hex (#2563eb) or name (blue/red/…). */
  color: z
    .string()
    .min(1)
    .describe('Color to apply to the matched bonds as hex (#2563eb) or CSS name (blue, red).'),
});

export const applyDisplayStyleInputSchema = z.object({
  /**
   * Atom label font size in pt (6–48). `null` clears per-atom override (Settings apply again).
   * Omit to leave font size unchanged.
   */
  labelFontSizePt: z
    .number()
    .min(6)
    .max(48)
    .nullable()
    .describe('Atom label font size in pt (6-48). null clears the per-atom override; omit to leave unchanged.')
    .optional(),
  /**
   * Bond stroke thickness in px (0.5–14). `null` clears per-bond override.
   * Omit to leave thickness unchanged.
   */
  bondThicknessPx: z
    .number()
    .min(0.5)
    .max(14)
    .nullable()
    .describe('Bond stroke thickness in canvas px (0.5-14). null clears the override; omit to leave unchanged.')
    .optional(),
  /**
   * Display opacity 0–1 for selected atoms and bonds (1 = opaque). `null` clears overrides.
   * Omit to leave opacity unchanged.
   */
  opacity: z
    .number()
    .min(0)
    .max(1)
    .nullable()
    .describe('Display opacity 0-1 for targeted atoms and bonds (1 = opaque). null clears; omit to leave unchanged.')
    .optional(),
  /** Explicit atom ids (from get_structure / get_selection). */
  atomIds: z
    .array(z.string())
    .describe('Atom ids to style (from molecule.get_structure or molecule.get_selection).')
    .optional(),
  /** Explicit bond ids; if omitted with atoms, thickness/opacity apply to bonds touching those atoms. */
  bondIds: z
    .array(z.string())
    .describe('Bond ids to style (from molecule.get_structure). If omitted, bonds touching atomIds are used.')
    .optional(),
  /** Style all atoms of this element (e.g. O). */
  element: z
    .string()
    .min(1)
    .max(2)
    .describe('Target every atom of this element symbol (1-2 letters, e.g. O, Cl) instead of atomIds.')
    .optional(),
  /** Style every atom/bond on the canvas. */
  all: z
    .boolean()
    .describe('true targets every atom and bond on the canvas, ignoring atomIds/bondIds/element.')
    .optional(),
  /** Fall back to UI selection when no ids/element/all (default true). */
  useSelection: z
    .boolean()
    .describe('true (default) falls back to the current UI selection when no atomIds/bondIds/element/all given.')
    .optional(),
});

export const aromatizeInputSchema = z.object({
  mode: z
    .enum(['aromatize', 'dearomatize'])
    .describe("'aromatize' (default) converts Kekule rings to aromatic bonds; 'dearomatize' restores Kekule form.")
    .default('aromatize'),
});

export const explicitHydrogensInputSchema = z.object({
  mode: z
    .enum(['fold', 'unfold', 'auto'])
    .describe(
      "'unfold' adds explicit H atoms, 'fold' removes them (implicit). 'auto' (default) folds if any explicit H exist, else unfolds.",
    )
    .default('auto'),
});

export const setSelectionInputSchema = z.object({
  atomIds: z
    .array(z.string())
    .describe('Atom ids to select (from molecule.get_structure); replaces the current atom selection.')
    .optional(),
  bondIds: z
    .array(z.string())
    .describe('Bond ids to select (from molecule.get_structure); replaces the current bond selection.')
    .optional(),
  canvasTextId: z
    .string()
    .nullable()
    .describe('Id of a canvas text to select (from molecule.list_annotations); null deselects text.')
    .optional(),
  reactionArrowId: z
    .string()
    .nullable()
    .describe('Id of a reaction arrow to select (from molecule.list_annotations); null deselects the arrow.')
    .optional(),
  canvasImageId: z
    .string()
    .nullable()
    .describe('Id of a canvas image to select (from molecule.list_annotations); null deselects the image.')
    .optional(),
  /** When true, clear all selection fields first. */
  clear: z
    .boolean()
    .describe('true deselects everything (atoms, bonds, text, arrows, images) and ignores the other fields.')
    .optional(),
});

export const placeTemplateInputSchema = z.object({
  /** Template id, label, amino-acid code/name, or FG name (e.g. Ph, COOH, Alanine). */
  name: z
    .string()
    .min(1)
    .describe('Template to place: functional-group label/id (Ph, COOH, Me), amino-acid code/name (Ala, Alanine), or ligand id.'),
  mode: z
    .enum(['merge', 'replace'])
    .describe("'merge' (default) adds the template beside existing content; 'replace' clears the canvas first.")
    .optional(),
});

export const listGlasswareInputSchema = emptyInputSchema;

/** One piece in a port-aware assembly (piece 0 is root; later pieces attach via ports). */
export const glasswareAssemblyPieceSchema = z.object({
  name: z
    .string()
    .min(1)
    .describe('Glassware kind id, label or alias (e.g. RBF, condenser, sep funnel); see molecule.list_glassware.'),
  /** Index of parent piece in this array (default: previous piece). */
  attachTo: z
    .number()
    .int()
    .nonnegative()
    .describe('0-based index of the parent piece in this pieces[] array. Default: previous piece. Ignored for piece 0.')
    .optional(),
  /** Port id on the parent (from molecule.list_glassware ports). */
  fromPort: z
    .string()
    .min(1)
    .describe('Port id on the parent piece to attach to (port ids per kind from molecule.list_glassware). Required after piece 0.')
    .optional(),
  /** Port id on this piece that mates with fromPort. */
  toPort: z
    .string()
    .min(1)
    .describe('Port id on this piece that mates with fromPort; the piece is positioned so both ports coincide.')
    .optional(),
  fillLevel: z
    .number()
    .min(0)
    .max(1)
    .describe('Liquid fill fraction 0-1 (0 = empty, 1 = full) for vessels that support liquid. Default ~0.35.')
    .optional(),
  width: z
    .number()
    .positive()
    .describe('Piece width in canvas px. Default: library default for that kind.')
    .optional(),
  height: z
    .number()
    .positive()
    .describe('Piece height in canvas px. Default: library default for that kind.')
    .optional(),
  fillColor: z
    .string()
    .describe('Liquid fill color as hex (#60a5fa) or CSS name. Default: library default for that kind.')
    .optional(),
});

/**
 * Place one vessel by name/alias, a named multi-piece setup, or a custom port chain.
 * Catalog / setups are driven by `@moldraw/domain` (auto-updates).
 */
export const placeGlasswareInputSchema = z
  .object({
    /** Kind id, label, or alias (e.g. RBF, erlenmeyer, condenser, sep funnel). */
    name: z
      .string()
      .min(1)
      .describe('Single vessel kind id, label or alias (e.g. RBF, erlenmeyer, condenser). Ignored when setup or pieces is given.')
      .optional(),
    /** Multi-piece apparatus built from the current library. */
    setup: glasswareSetupEnum
      .describe('Named multi-piece apparatus id from molecule.list_glassware setups (e.g. reflux). Takes precedence over pieces/name.')
      .optional(),
    /**
     * Custom pipeline: root at cx/cy, then attach pieces by ports
     * (call list_glassware for port ids). Ignored when `setup` is set.
     */
    pieces: z
      .array(glasswareAssemblyPieceSchema)
      .min(1)
      .describe('Custom assembly: piece 0 is centred at cx/cy, later pieces attach via attachTo/fromPort/toPort. Ignored when setup is set.')
      .optional(),
    /** Center X in world coords (default: viewport center). */
    cx: z
      .number()
      .describe('Center x of the vessel / root piece in canvas px (x right). Default: current viewport center.')
      .optional(),
    /** Center Y in world coords (default: viewport center). */
    cy: z
      .number()
      .describe('Center y of the vessel / root piece in canvas px (y down). Default: current viewport center.')
      .optional(),
    width: z
      .number()
      .positive()
      .describe('Width in canvas px for the single vessel (name mode only). Default: library default.')
      .optional(),
    height: z
      .number()
      .positive()
      .describe('Height in canvas px for the single vessel (name mode only). Default: library default.')
      .optional(),
    fillLevel: z
      .number()
      .min(0)
      .max(1)
      .describe('Liquid fill fraction 0-1 for the single vessel (name mode only). Default ~0.35.')
      .optional(),
    fillColor: z
      .string()
      .describe('Liquid fill color as hex or CSS name for the single vessel (name mode only). Default: library default.')
      .optional(),
    /** Caption under the piece / setup (via addCanvasText). */
    labelBelow: z
      .string()
      .describe('Caption text drawn centred below the vessel or assembly.')
      .optional(),
  })
  .refine(
    v => Boolean(v.name?.trim()) || Boolean(v.setup) || Boolean(v.pieces?.length),
    {
      message:
        'Provide name (single vessel), setup id, or pieces[] assembly from molecule.list_glassware',
    },
  );

const labManualStepSchema = z.object({
  /** Step caption under the apparatus column (e.g. "1. Reflux"). */
  label: z
    .string()
    .min(1)
    .describe('Step caption drawn under the apparatus column (e.g. "1. Reflux").'),
  /** Named setup from the glassware library. */
  setup: glasswareSetupEnum
    .describe('Named apparatus id from molecule.list_glassware setups (e.g. reflux). Preferred over pieces/glassware.')
    .optional(),
  /** Individual vessels by name/alias when not using setup. */
  glassware: z
    .array(z.string().min(1))
    .describe('Vessel kind names/aliases stacked vertically in this column when no setup or pieces given.')
    .optional(),
  /** Custom port-aware assembly for this step (preferred over glassware[] stack). */
  pieces: z
    .array(glasswareAssemblyPieceSchema)
    .min(1)
    .describe('Custom port-attached assembly for this step (same format as molecule.place_glassware pieces).')
    .optional(),
  /** Optional note under the label. */
  note: z
    .string()
    .describe('Short note drawn in smaller text under the step label (truncated if long).')
    .optional(),
});

/**
 * Lab-manual procedure diagram: columns of apparatus (+ optional reaction scheme).
 * Call only after the user confirms the proposed plan in chat.
 * Prefer chat UI diagramLayoutMode when layoutMode is omitted.
 */
export const buildLabManualInputSchema = z
  .object({
    clear: z
      .boolean()
      .describe('true clears the whole canvas before drawing. Default false (append beside existing content).')
      .optional(),
    title: z
      .string()
      .describe('Optional title text drawn above the diagram.')
      .optional(),
    /**
     * `glassware` = apparatus steps + step arrows only.
     * `scheme` = reaction structures only.
     * `both` = apparatus row on top, scheme band below (default).
     */
    layoutMode: z
      .enum(['glassware', 'scheme', 'both'])
      .describe("'glassware' = apparatus columns only; 'scheme' = reaction structures only; 'both' (default) = apparatus row above scheme band.")
      .optional(),
    steps: z
      .array(labManualStepSchema)
      .describe('Procedure steps drawn left-to-right as apparatus columns (max 4 per row). Empty -> default reflux/extraction/filtration.')
      .optional(),
    /** Chemistry band (SMILES only). Required for layoutMode scheme; optional for both. */
    compounds: z
      .array(
        z.object({
          smiles: z
            .string()
            .min(1)
            .describe('SMILES string of the structure (never a name); drawn locally without PubChem.'),
          labelBelow: z
            .string()
            .describe('Display name / label drawn under the structure (e.g. "phenol", "1a").')
            .optional(),
        }),
      )
      .min(2)
      .describe('Reaction scheme structures in order (>= 2). Required for layoutMode scheme; optional for both.')
      .optional(),
    arrows: z
      .array(
        z.object({
          reagentAbove: z
            .string()
            .describe('Reagent / condition text drawn above the arrow (e.g. "NaBH4, MeOH").')
            .optional(),
          reagentBelow: z
            .string()
            .describe('Reagent / condition text drawn below the arrow (e.g. "0 C, 2 h").')
            .optional(),
          kind: z
            .string()
            .describe("Arrow style: 'straight' (default), 'equilibrium', 'retrosynthetic', 'curved', 's_curve', 'path', 'row_wrap'.")
            .optional(),
        }),
      )
      .describe('Conditions between consecutive compounds; arrows[i] goes from compounds[i] to compounds[i+1].')
      .optional(),
  })
  .superRefine((v, ctx) => {
    const mode = v.layoutMode ?? 'both';
    if (mode === 'scheme') {
      if ((v.compounds?.length ?? 0) < 2) {
        ctx.addIssue({
          code: 'custom',
          message: 'layoutMode scheme requires compounds[] with ≥2 SMILES',
          path: ['compounds'],
        });
      }
      return;
    }
    // Empty steps are allowed — handler/chat inject default reflux→extraction→filtration.
    const steps = v.steps ?? [];
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i]!;
      if (
        !s.setup &&
        !(s.glassware && s.glassware.length > 0) &&
        !(s.pieces && s.pieces.length > 0)
      ) {
        ctx.addIssue({
          code: 'custom',
          message: 'Each step needs setup, pieces[], or glassware[]',
          path: ['steps', i],
        });
      }
    }
  });

export const cleanupInputPassthrough = z.object({
  bondLengthPx: z
    .number()
    .positive()
    .describe('Target bond length in canvas px after cleanup (default 40).')
    .optional(),
});

/** Shared fragment selector for gesture recipes (index / SMILES / ids / selection). */
export const fragmentSelectorSchema = z.object({
  moleculeIndex: z
    .number()
    .int()
    .nonnegative()
    .describe('Target one connected molecule: 0-based left-to-right index from molecule.get_canvas_state.')
    .optional(),
  /** Case-insensitive substring match on per-fragment SMILES. */
  smilesIncludes: z
    .string()
    .min(1)
    .describe('Selects the single fragment whose SMILES contains this substring (case-insensitive); errors if 0 or >1 match.')
    .optional(),
  atomIds: z
    .array(z.string())
    .min(1)
    .describe('Explicit atom ids to operate on (from molecule.get_structure); takes precedence over other selectors.')
    .optional(),
  /** Fall back to UI selection when no other selector is set (default true). */
  useSelection: z
    .boolean()
    .describe('true (default) falls back to the current UI selection when no moleculeIndex/smilesIncludes/atomIds given.')
    .optional(),
});

export const moveFragmentInputSchema = fragmentSelectorSchema.extend({
  dx: z.number().describe('Horizontal translation in canvas px (positive = right). Default bond length is 40 px.'),
  dy: z.number().describe('Vertical translation in canvas px (positive = down). Default bond length is 40 px.'),
});

export const rotateFragmentInputSchema = fragmentSelectorSchema.extend({
  degrees: z
    .number()
    .describe('Rotation angle in degrees (positive = clockwise on screen since y points down).'),
  cx: z
    .number()
    .describe('Pivot x in canvas px. Default: center of the fragment bounding box.')
    .optional(),
  cy: z
    .number()
    .describe('Pivot y in canvas px. Default: center of the fragment bounding box.')
    .optional(),
});

export const alignFragmentsInputSchema = z.object({
  moleculeIndexes: z
    .array(z.number().int().nonnegative())
    .min(2)
    .describe('Two or more 0-based molecule indexes (left-to-right from molecule.get_canvas_state) to align.')
    .optional(),
  atomIds: z
    .array(z.string())
    .min(2)
    .describe('Atom ids spanning >= 2 connected molecules (from molecule.get_structure); takes precedence over moleculeIndexes.')
    .optional(),
  useSelection: z
    .boolean()
    .describe('true (default) uses the current UI selection when neither moleculeIndexes nor atomIds is given.')
    .optional(),
  mode: z
    .enum(['top', 'center', 'bottom', 'left', 'right', 'centerX'])
    .describe("Alignment edge: 'top'|'center'|'bottom' align vertically (y); 'left'|'centerX'|'right' align horizontally (x)."),
});

export const distributeFragmentsInputSchema = z.object({
  moleculeIndexes: z
    .array(z.number().int().nonnegative())
    .min(2)
    .describe('Two or more 0-based molecule indexes (left-to-right from molecule.get_canvas_state) to distribute.')
    .optional(),
  atomIds: z
    .array(z.string())
    .min(2)
    .describe('Atom ids spanning >= 2 connected molecules (from molecule.get_structure); takes precedence over moleculeIndexes.')
    .optional(),
  useSelection: z
    .boolean()
    .describe('true (default) uses the current UI selection when neither moleculeIndexes nor atomIds is given.')
    .optional(),
  axis: z
    .enum(['horizontal', 'vertical', 'grid', 'circle', 'row'])
    .describe("'horizontal'/'vertical' equalize gaps along x/y; 'grid' rearranges into rows; 'circle' places on a ring; 'row' is a neat left-to-right row."),
  /** Circle layout: center-to-center radius in world units (auto if omitted). */
  radius: z
    .number()
    .positive()
    .describe("Circle radius in canvas px (center to fragment centroid); only for axis 'circle'. Auto if omitted.")
    .optional(),
});

export const circularArrayInputSchema = fragmentSelectorSchema.extend({
  /** Total instances including the original (2–36). */
  count: z
    .number()
    .int()
    .min(2)
    .max(36)
    .describe('Total number of copies around the circle including the original (2-36).'),
  /** Center-to-centroid radius in world units. */
  radius: z
    .number()
    .positive()
    .describe('Radius in canvas px from the array center to each copy centroid (default bond length is 40 px).'),
  /** Degrees between instances; omit for full-circle equal spacing. */
  spacingDeg: z
    .number()
    .positive()
    .max(360)
    .describe('Angular step between copies in degrees (<= 360). Omit for equal spacing over a full 360 circle.')
    .optional(),
  /** Rotate each copy by its polar angle (default true). */
  rotate: z
    .boolean()
    .describe('true (default) rotates each copy to follow its polar angle; false keeps every copy upright.')
    .optional(),
});

export const duplicateFragmentInputSchema = fragmentSelectorSchema.extend({
  dx: z.number().describe('Offset of the copy from the original in canvas px along x (positive = right).'),
  dy: z.number().describe('Offset of the copy from the original in canvas px along y (positive = down).'),
});

export const deleteFragmentInputSchema = fragmentSelectorSchema;

/** Replace one connected molecule with a new SMILES/name at the same position. */
export const replaceFragmentInputSchema = fragmentSelectorSchema.extend({
  /** Replacement SMILES or common name / CAS. */
  smiles: z
    .string()
    .min(1)
    .describe('Replacement structure as SMILES, or a common name / CAS number (resolved via PubChem when available).'),
  /** Optional caption under the new structure. */
  label: z
    .string()
    .describe('Caption text drawn under the replacement structure.')
    .optional(),
});

export const paintRingsInputSchema = colorRingsInputSchema.extend({
  /** Limit ring paint to one connected molecule (left-to-right index). */
  moleculeIndex: z
    .number()
    .int()
    .nonnegative()
    .describe('Only paint rings of this connected molecule: 0-based left-to-right index from molecule.get_canvas_state.')
    .optional(),
  smilesIncludes: z
    .string()
    .min(1)
    .describe('Only paint rings of the single fragment whose SMILES contains this substring (case-insensitive).')
    .optional(),
  atomIds: z
    .array(z.string())
    .min(1)
    .describe('Only paint rings within these atom ids (from molecule.get_structure).')
    .optional(),
});

export const rotatePerspectiveInputSchema = z.object({
  degreesX: z
    .number()
    .describe('Rotation step about the horizontal (x) axis in degrees for the canvas 3D perspective pose. Default 0.')
    .default(0),
  degreesY: z
    .number()
    .describe('Rotation step about the vertical (y) axis in degrees for the canvas 3D perspective pose. Default 0.')
    .default(0),
});

const reactionArrowKindSchema = z.enum([
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
]);

/**
 * One-shot multi-step scheme: import structures, align into rows, arrows with
 * reagents, optional labels under molecules. Prefer this over addReactionMultiStep alone.
 */
export const buildReactionSchemeInputSchema = z.object({
  /** Clear the canvas before building. Default false (append). Set true only when the user asks to replace/clear/start fresh. */
  clear: z
    .boolean()
    .describe('true clears the whole canvas before building. Default false (append beside existing content).')
    .optional(),
  /** Optional scheme title (stored on multi-step group meta). */
  title: z
    .string()
    .describe('Optional title text drawn above the scheme.')
    .optional(),
  /**
   * `row` (default) — left-to-right with wrap.
   * `cycle` — circular pathway (Krebs cycle etc.); closes with n arrows.
   * `branch` — one reactant → multiple products (orthogonal path arrows).
   */
  layout: z
    .enum(['row', 'cycle', 'branch'])
    .describe("'row' (default) left-to-right with wrapping; 'cycle' closed circular pathway; 'branch' one reactant -> several products.")
    .optional(),
  /** Max structures per row before wrapping (default 4). Ignored when layout is cycle/branch. */
  maxPerRow: z
    .number()
    .int()
    .min(2)
    .max(8)
    .describe("Max structures per row before wrapping (2-8, default 4). Only for layout 'row'.")
    .optional(),
  /**
   * Structures in reaction order. `smiles` MUST be a SMILES string (never a name) —
   * schemes are drawn locally without PubChem. Use labelBelow for the human name.
   */
  compounds: z
    .array(
      z.object({
        smiles: z
          .string()
          .min(1)
          .describe('SMILES string of the structure (e.g. Oc1ccccc1); never a chemical name - drawn locally without PubChem.'),
        /** Label drawn under the structure (e.g. name or "1a"). */
        labelBelow: z
          .string()
          .describe('Display name / label drawn under the structure (e.g. "phenol", "1a").')
          .optional(),
      }),
    )
    .min(2)
    .describe('Structures in reaction order (>= 2): reactant first, then intermediates/products.'),
  /**
   * Conditions between consecutive compounds.
   * Row: length should be compounds.length - 1.
   * Cycle: length should be compounds.length (last closes the loop).
   * Branch: length should be compounds.length - 1 (reactant → each product).
   * Missing entries get empty reagents. Cycle layouts default to "cycle_arc".
   * Prefer "path" for branch elbows; "row_wrap" for multi-row snakes (auto on row wraps);
   * "s_curve" for smooth curves.
   */
  arrows: z
    .array(
      z.object({
        reagentAbove: z
          .string()
          .describe('Reagent / condition text drawn above the arrow (e.g. "NaBH4, MeOH").')
          .optional(),
        reagentBelow: z
          .string()
          .describe('Reagent / condition text drawn below the arrow (e.g. "0 C, 2 h").')
          .optional(),
        kind: reactionArrowKindSchema
          .describe("Arrow style: 'straight' (default), 'equilibrium', 'retrosynthetic', 'curved', 's_curve', 'path' (elbow), 'row_wrap', 'cycle_arc'.")
          .optional(),
      }),
    )
    .describe('Conditions between consecutive compounds; arrows[i] connects compounds[i] -> compounds[i+1] (cycle: last closes loop).')
    .optional(),
});
