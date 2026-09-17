export interface Point {
  x: number;
  y: number;
}

export interface Atom {
  id: string;
  element: string; // 'C', 'N', 'O', etc.
  x: number;
  y: number;
  charge: number;
  /**
   * Partial charge mark for teaching diagrams: `+1` = δ+, `-1` = δ−.
   * Display-only; not written to molfile. Independent of formal `charge`.
   */
  deltaCharge?: number;
  /**
   * Formal-charge mark position as upright-local vector from the atom center
   * (orbits on a small ring). Omit for the default free-side seat. Display-only.
   */
  chargeOffset?: { x: number; y: number };
  /**
   * δ± mark position as upright-local vector from the atom center.
   * Omit for the default free-side seat. Display-only.
   */
  deltaChargeOffset?: { x: number; y: number };
  /**
   * Formal ±1 mark style: plain cross/bar (default) or circled ⊕/⊖ (carbocation/carbanion).
   * Display-only; cleared when |charge| ≠ 1.
   */
  chargeMarkStyle?: 'plain' | 'circled';
  /** Explicit lone pair count (visual + validation). */
  lonePairs?: number;
  /**
   * Preferred screen-upright side for lone-pair dots (teaching diagrams).
   * Default when omitted: above. Not written to molfile.
   */
  lonePairSide?: 'above' | 'below';
  /**
   * Unpaired electrons for free-radical display. `1` = single free radical (doublet).
   * `0` / undefined = none. Not written to classic V2000 molfiles yet.
   */
  radical?: number;
  /** Custom stroke / label color (hex), e.g. #2563eb */
  color?: string;
  /**
   * Opaque highlighter fill behind the atom (hex). Display-only — does not
   * change label/bond color. Not written to molfile.
   */
  highlight?: string;
  /**
   * Per-atom label font size in points (overrides document Settings font size).
   * Display-only; not written to molfile.
   */
  labelFontSizePt?: number;
  /**
   * Per-atom display opacity (0–1). Multiplies perspective depth fade when present.
   * Display-only; not written to molfile.
   */
  opacity?: number;
  /** Optional mass number for isotope labels / molfile M ISO, e.g. 13 for 13C. */
  isotope?: number;
  /** User-typed functional group label (ASCII), e.g. CH3 — display-only v1; molfile still uses `element`. */
  alias?: string;
  /**
   * Force drawing the element symbol (e.g. show "C" on a skeletal carbon for teaching).
   * Display-only; not written to molfile. Heteroatoms already label by default.
   */
  showElementLabel?: boolean;
  /**
   * V2000 atom stereo parity / care (molfile field after charge): 0 none, 1 odd, 2 even, 3 either.
   * Set when parsing molfiles; used to keep stereochem-relevant H during import. Not written by `moleculeToMolblock`.
   */
  mdlStereoCare?: number;
  /**
   * Tetrahedral chirality for the 3D engine, independent of 2D depiction. Sign
   * (+1/-1) of the scalar triple product of the first three neighbors (atom ids
   * sorted ascending) relative to this center. Populated from SMILES `@`/`@@`.
   */
  chiralParity?: number;
  /**
   * Atom-atom mapping number for reactions (reactant ↔ product). From molfile
   * V2000 mapping column / Indigo automap. 0 or undefined = unmapped.
   */
  atomMap?: number;
}

export interface Bond {
  id: string;
  fromAtomId: string;
  toAtomId: string;
  order: number; // 1 (single), 2 (double), 3 (triple)
  /**
   * From molfile bond type 4; exported back as aromatic. Complete aromatic rings
   * draw a solid inner circle; isolated aromatic bonds draw solid + dashed inner.
   */
  aromatic?: boolean;
  /**
   * Stereo depiction from fromAtomId toward toAtomId:
   * wedge (up), dash (down), wavy (unknown), either (wedge/hash unknown),
   * cis_trans (unspecified E/Z on a double).
   */
  stereo?: 'wedge' | 'dash' | 'wavy' | 'either' | 'cis_trans';
  /**
   * Coordination / dative bond (ChemDraw-style). Drawn as a dashed or arrow bond;
   * does not consume full covalent valency on the acceptor (typically a metal).
   * Order is usually 1. Not written to classic V2000 molfiles (type 9 optional).
   */
  dative?: boolean;
  /**
   * Dotted single bond for hydrogen bonds / weak interactions (display-only).
   * Does not consume covalent valency. Not written to classic V2000 molfiles.
   */
  dotted?: boolean;
  /**
   * Query-only bond type (molfile 5–8). Does not consume covalent valency.
   * `any` = type 8, `single_double` = 5, `single_aromatic` = 6, `double_aromatic` = 7.
   */
  queryType?: 'any' | 'single_double' | 'single_aromatic' | 'double_aromatic';
  /**
   * Chair / perspective foreground: extra-thick single bond. Display-only;
   * not written to molfile (use Settings / per-bond thickness for export-less look).
   */
  bold?: boolean;
  /**
   * UI-only: when cycling bond order by clicking (1↔2↔3), remembers whether the
   * bond reached double from below (`up`) or from triple (`down`) so the next
   * click steps 2→3 vs 2→1 (ChemDraw-style bounce: …→triple→double→single→…).
   * Not written to molfiles.
   */
  orderCycleRamp?: 'up' | 'down';
  /** Custom stroke color (hex). Independent of endpoint atom label colors. */
  color?: string;
  /**
   * Opaque highlighter fill along the bond (hex). Display-only — does not
   * change the bond stroke color. Not written to molfile.
   */
  highlight?: string;
  /**
   * Per-bond stroke thickness in world px (overrides document Settings bond thickness).
   * Display-only; not written to molfile.
   */
  thicknessPx?: number;
  /**
   * Per-bond stroke opacity (0–1). Combined with endpoint atom opacities when drawing.
   * Display-only; not written to molfile.
   */
  opacity?: number;
  /**
   * Double-bond (E/Z) geometry for the 3D engine, independent of 2D depiction.
   * `ref1` is a neighbor id on `fromAtomId`, `ref2` a neighbor id on `toAtomId`;
   * `sameSide` true = cis (Z-like), false = trans (E-like). From SMILES `/`,`\`.
   */
  cisTransRef?: { ref1: string; ref2: string; sameSide: boolean };
}

/** 3D coordinates for one atom in a canvas perspective pose (world / canvas units). */
export interface Atom3DPose {
  x: number;
  y: number;
  z: number;
}

/**
 * Optional ChemDraw-style Structure Perspective pose.
 * Document atoms stay 2D (`Atom.x`/`y`); this overlay drives projection + depth shading.
 * Cleared by Flatten; not written to molfile until Flatten updates `x`/`y`.
 */
export interface PerspectivePose {
  /** Atom id → 3D coordinates. */
  positions: Record<string, Atom3DPose>;
  /** Depth shading (near opaque, far faded). Default true when omitted. */
  depthShading?: boolean;
  /**
   * Fade strength when `depthShading` is on: `0` = no fade, `1` = full ChemDraw-like fade
   * (far ≈ 5% opacity), up to `1.5` for extra far fade. Default `1` when omitted.
   */
  depthFade?: number;
  /**
   * Optional depth cue: plain singles use normal width toward the viewer and
   * get pointier farther away. Display-only; not stereo. Default false when omitted.
   */
  depthWedges?: boolean;
}

export interface Stroke {
  id: string;
  points: Point[];
  color: string;
  thickness: number;
  /**
   * Optional stylus pressure per point (0..1, same length as `points`).
   * Present only for pen-drawn strokes; renderers vary the line width with
   * it (0.5 ≙ nominal `thickness`). Absent → constant width.
   */
  pressures?: number[];
}

/** Geometric annotation shapes (toolbar Shape menu). */
export const CANVAS_SHAPE_KIND_ORDER = [
  'rectangle',
  'line',
  'circle',
  'triangle',
  'star',
] as const;

/**
 * Lab glassware (toolbar Glassware menu).
 * Add a new vessel here (+ draw path + optional `GLASSWARE_META` aliases) —
 * Zod, MCP `list_glassware` / `place_glassware`, and chat pick it up automatically.
 */
export const GLASSWARE_SHAPE_KIND_ORDER = [
  'conical_flask',
  'beaker',
  'test_tube',
  'round_bottom_flask',
  'condenser',
  'separatory_funnel',
  'filter_funnel',
  'dropping_funnel',
  'three_neck_rbf',
  'buchner_flask',
  'claisen_adapter',
  'distillation_head',
  'receiving_flask',
  'dean_stark_trap',
  'graduated_cylinder',
  'volumetric_flask',
  'chromatography_column',
  'tlc_chamber',
  'allihn_condenser',
  'dimroth_condenser',
  'soxhlet',
  'hirsch_funnel',
  'schlenk_flask',
  'gas_bubbler',
  'thermometer_adapter',
  'straight_adapter',
  'vacuum_adapter',
  'bent_adapter',
  'vacuum_tubing',
  'coolant_tubing',
  'stopper',
  'septum',
  'keck_clip',
  'buchner_funnel',
  'sintered_funnel',
  'syringe',
  'cannula',
  'nmr_tube',
  'drying_tube',
  'heating_mantle',
  'oil_bath',
  'ice_bath',
  'dry_ice_bath',
  'chiller',
  'lab_jack',
  'retort_stand',
  'three_prong_clamp',
  'stir_bar',
  'pasteur_pipette',
  'spatula',
  'powder_funnel',
  'two_neck_rbf',
  'vigreux_column',
  'cow_receiver',
  'cold_finger',
  'cold_trap',
  'vacuum_pump',
  'gas_inlet_adapter',
  'balloon',
  'reducing_adapter',
  'rotovap_bump_trap',
  'rotovap_flask',
  'hotplate_stirrer',
  'dewar_flask',
  'thermometer',
  'watch_glass',
  'burette',
  'evaporating_dish',
  'filter_adapter',
  'pressure_tube',
  'desiccator',
  'pear_shaped_flask',
  'bunsen_burner',
  'alcohol_lamp',
  'sand_bath',
  'steam_bath',
  'water_bath',
  'heat_gun',
  'heating_block',
  'overhead_stirrer',
  'four_neck_rbf',
  'rotovap_body',
  'aspirator',
  'vacuum_gauge',
  'gas_cylinder',
  'fume_hood',
  'weighing_boat',
  'forceps',
  'mortar_pestle',
  'crystallizing_dish',
  'petri_dish',
  'hickman_head',
  'jacketed_reactor',
  'schlenk_tube',
  'gas_dispersion_tube',
  'ring_clamp',
  'analytical_balance',
  'stemless_funnel',
  'metal_joint_clip',
  'glovebox',
  'schlenk_manifold',
  'filter_cannula',
  'transfer_needle',
  'pressure_reactor',
  'microwave_reactor',
  'syringe_pump',
  'flow_reactor',
  'flash_system',
  'lyophilizer',
  'centrifuge',
  'photoreactor',
  'electrochemical_cell',
  'vacuum_sublimator',
  'kugelrohr',
  'solvent_purification_system',
  'tube_furnace',
  'muffle_furnace',
  'quartz_tube',
  'quartz_boat',
  'crucible',
  'tongs',
  'young_stopcock',
  'spin_coater',
  'biosafety_cabinet',
  'incubator_shaker',
] as const;

/** Glassware that supports liquid fill color / level. */
export const LIQUID_GLASSWARE_KIND_ORDER = [
  'conical_flask',
  'beaker',
  'test_tube',
  'round_bottom_flask',
  'separatory_funnel',
  'dropping_funnel',
  'three_neck_rbf',
  'buchner_flask',
  'receiving_flask',
  'dean_stark_trap',
  'graduated_cylinder',
  'volumetric_flask',
  'chromatography_column',
  'tlc_chamber',
  'soxhlet',
  'schlenk_flask',
  'gas_bubbler',
  'syringe',
  'nmr_tube',
  'two_neck_rbf',
  'cow_receiver',
  'rotovap_flask',
  'oil_bath',
  'ice_bath',
  'dry_ice_bath',
  'dewar_flask',
  'burette',
  'evaporating_dish',
  'pressure_tube',
  'pear_shaped_flask',
  'sand_bath',
  'water_bath',
  'steam_bath',
  'four_neck_rbf',
  'crystallizing_dish',
  'petri_dish',
  'jacketed_reactor',
  'schlenk_tube',
  'pressure_reactor',
  'electrochemical_cell',
  'flow_reactor',
  'crucible',
] as const;

/** Annotative shapes drawn on the canvas; not part of molfile chemistry. */
export type CanvasShapeKind =
  | (typeof CANVAS_SHAPE_KIND_ORDER)[number]
  | (typeof GLASSWARE_SHAPE_KIND_ORDER)[number];

/** All canvas shape kinds (geometry + glassware) — Zod / AI schemas derive from this. */
export const ALL_CANVAS_SHAPE_KINDS = [
  ...CANVAS_SHAPE_KIND_ORDER,
  ...GLASSWARE_SHAPE_KIND_ORDER,
] as const;

const GLASSWARE_KIND_SET = new Set<string>(GLASSWARE_SHAPE_KIND_ORDER);
const LIQUID_GLASSWARE_KINDS = new Set<string>(LIQUID_GLASSWARE_KIND_ORDER);

/** Any lab glassware annotation (black outline; empty glass transparent). */
export const isLabGlasswareShape = (kind: CanvasShapeKind): boolean =>
  GLASSWARE_KIND_SET.has(kind);

/** Glassware that supports liquid fill color / level. */
export const isLiquidGlasswareShape = (kind: CanvasShapeKind): boolean =>
  LIQUID_GLASSWARE_KINDS.has(kind);

export interface CanvasShape {
  id: string;
  kind: CanvasShapeKind;
  /** For `line`: segment endpoints. For other kinds: axis-aligned bounding box (min/max corners). */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  strokeWidth: number;
  /** Rotation about the shape center, radians (default 0). */
  rotationRad?: number;
  /**
   * Interior fill (CSS). For lab glassware this is the liquid color.
   * For other closed shapes, optional solid fill under the outline.
   */
  fillColor?: string;
  /** Lab glassware: liquid level 0 (empty) … 1 (full body). */
  fillLevel?: number;
}

/** Default lab-glassware liquid (matches lab-icon light blue). */
export const CONICAL_FLASK_DEFAULT_FILL = '#8ecae6';
export const CONICAL_FLASK_DEFAULT_LEVEL = 0.35;
export const BEAKER_DEFAULT_FILL = CONICAL_FLASK_DEFAULT_FILL;
export const BEAKER_DEFAULT_LEVEL = CONICAL_FLASK_DEFAULT_LEVEL;

/** Atomic-orbital annotation (ChemDraw-style teaching graphic). */
export const CANVAS_ORBITAL_KINDS = ['s', 'p', 'd_xy', 'dz2'] as const;
export type CanvasOrbitalKind = (typeof CANVAS_ORBITAL_KINDS)[number];

export interface CanvasOrbital {
  id: string;
  kind: CanvasOrbitalKind;
  /** World center (used when not attached, or as fallback). */
  x: number;
  y: number;
  /** Axis rotation, radians. */
  rotationRad: number;
  /** Lobe length / sphere radius in world units. */
  size: number;
  /** When set, the orbital follows this atom. */
  atomId?: string;
  color?: string;
}

/** Raster image annotation pasted or inserted onto the drawing canvas. */
export interface CanvasImage {
  id: string;
  dataUrl: string;
  mimeType: string;
  /** Top-left of the unrotated image box (world). */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Rotation about the image center, radians (default 0). */
  rotationRad?: number;
  name?: string;
}

/** Visual / semantic style for on-canvas arrows (ChemDraw-like palette). */
export type ReactionArrowKind =
  | 'straight'
  | 'curved'
  | 's_curve'
  /** Multi-bend polyline — flowchart-style 90° turns (orthogonal). */
  | 'path'
  /**
   * Row-wrap snake for multi-row schemes: exit right → down into gutter →
   * across → down into the next-row molecule (avoids overlapping structures).
   */
  | 'row_wrap'
  /**
   * Circumferential circular arc for closed pathways (Krebs / TCA).
   * `cx`/`cy` store the cycle center; shaft is the arc from (x1,y1) → (x2,y2).
   */
  | 'cycle_arc'
  | 'retrosynthetic'
  | 'equilibrium'
  | 'half_equilibrium'
  /** Curved electron-flow arrow with fish-hook tail (mechanisms / teaching). */
  | 'electron_flow'
  | 'resonance';

export const ARROW_HEAD_STYLES = ['filled', 'open', 'pair', 'single', 'none'] as const;
export type ArrowHeadStyle = (typeof ARROW_HEAD_STYLES)[number];

export const ARROW_TAIL_STYLES = ['none', 'bar', 'reverse', 'circle'] as const;
export type ArrowTailStyle = (typeof ARROW_TAIL_STYLES)[number];

/** Default head size for newly drawn electron-flow arrows (slightly smaller than 1). */
export const ELECTRON_FLOW_DEFAULT_HEAD_SCALE = 0.72;

export const resolveArrowHeadKind = (
  style?: ArrowHeadStyle,
): 'filled' | 'open' | 'single' | 'none' => {
  if (style === 'filled' || style === 'single' || style === 'none') return style;
  return 'open';
};

/** Toolbar / cycle order (must include every `ReactionArrowKind`). */
export const REACTION_ARROW_KIND_ORDER: readonly ReactionArrowKind[] = [
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
] as const;

/**
 * Chemistry anchor for electron-flow (and similar) arrows.
 * When set on `fromAnchor` / `toAnchor`, canvas/core resolve world endpoints
 * from live atom/bond geometry; stored x1/y1/x2/y2 are fallbacks.
 */
export type ArrowAnchor =
  | { type: 'atom'; atomId: string; offsetDeg?: number; offsetPx?: number }
  | { type: 'bond'; bondId: string; t?: number }
  | { type: 'lone_pair'; atomId: string; slot?: number };

/**
 * Reaction arrow on canvas. Tail is (x1,y1), head is (x2,y2).
 * Curved / S-curve / electron_flow use optional control points; when omitted,
 * controls are derived from the chord for drawing and hit-testing.
 * `kind: 'resonance'` is a solid straight double-headed ↔ (ChemDraw-style).
 * For full-molecule SMILES `react>>prod`, see `reactionArrowParticipatesInSmilesSplit`
 * in `reactionArrowSmiles.ts` — decorative kinds are skipped when picking the
 * partition arrow.
 */
export interface ReactionArrow {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind?: ReactionArrowKind;
  /**
   * Quadratic control (curved, electron_flow), or cycle center for
   * `kind: 'cycle_arc'`.
   */
  cx?: number;
  cy?: number;
  /** Cubic controls (s_curve) — drag independently for editable S-turns. */
  c1x?: number;
  c1y?: number;
  c2x?: number;
  c2y?: number;
  /**
   * Polyline vertices for `kind: 'path'` / `row_wrap` (≥2). First = tail, last = head.
   * Path arrows use flowchart-style **orthogonal** (90°) segments; when set,
   * `x1,y1` / `x2,y2` mirror first/last for labels and SMILES split.
   */
  pathPoints?: Array<{ x: number; y: number }>;
  /**
   * Legacy: second head for curved resonance. Ignored for `kind: 'resonance'`
   * (always drawn as solid straight ↔).
   */
  doubleHead?: boolean;
  /** Optional chemistry anchors; when resolvable, override free endpoints at draw time. */
  fromAnchor?: ArrowAnchor;
  toAnchor?: ArrowAnchor;
  /**
   * Arrow head: `filled` triangle, `open`/`pair` angular 2e head, `single` fish-hook,
   * `none`. New mechanism arrows store `pair` (open) with a reduced `headScale`.
   */
  headStyle?: ArrowHeadStyle;
  /** Tail decoration at the start of the shaft. */
  tailStyle?: ArrowTailStyle;
  /**
   * Quadratic bend for electron_flow as a signed fraction of chord length
   * (default ~0.28; sign picks side when `bulgeSide` is omitted). Canvas may
   * auto-pick side away from the skeleton.
   */
  curveAmount?: number;
  /**
   * Explicit bulge side for curved / electron_flow arcs (+1 / −1 relative to
   * the chord’s left-hand normal). When set, overrides auto-centroid side and
   * the sign of `curveAmount` for side selection.
   */
  bulgeSide?: 1 | -1;
  color?: string;
  strokeWidth?: number;
  /** Scales arrowhead relative to default (1 = legacy; new electron-flow uses ~0.72). */
  headScale?: number;
  /** Reagents / conditions drawn above the arrow shaft (multi-line: newline). */
  reagentAbove?: string;
  /** Reagents / conditions drawn below the arrow shaft (multi-line: newline). */
  reagentBelow?: string;
  /**
   * Shared canvas px for both reagent lines when per-slot sizes are omitted.
   * Default applied in renderer if omitted (`DEFAULT_REAGENT_FONT_SIZE`).
   */
  reagentFontSize?: number;
  /** Canvas px for text above the shaft; falls back to `reagentFontSize` then default. */
  reagentAboveFontSize?: number;
  /** Canvas px for text below the shaft; falls back to `reagentFontSize` then default. */
  reagentBelowFontSize?: number;
  /** Fill color for reagent text (hex). */
  reagentColor?: string;
  reagentFontWeight?: 'normal' | 'bold';
  /**
   * plain — raw text;
   * auto — unicode subscripts when input looks like chemistry (`H2SO4`, `\ce{...}`);
   * latex — canvas uses simplified unicode; rich preview via KaTeX in the editor when needed.
   */
  reagentFormat?: 'plain' | 'auto' | 'latex';
  /**
   * When set with `multiStepGroupId`, this arrow is part of a sequential synthesis / multi-step route.
   * `stepIndex` is 0-based order within the group (left-to-right in typical layouts).
   */
  multiStepGroupId?: string;
  stepIndex?: number;
}

/** Patch for `updateReactionArrow` — `null` clears chemistry anchors. */
export type ReactionArrowUpdatePatch = Partial<
  Omit<ReactionArrow, 'id' | 'fromAnchor' | 'toAnchor'>
> & {
  fromAnchor?: ReactionArrow['fromAnchor'] | null;
  toAnchor?: ReactionArrow['toAnchor'] | null;
};

/** Optional title for a multi-step reaction group (`ReactionArrow.multiStepGroupId`). */
export interface ReactionMultiStepGroupMeta {
  title?: string;
}

/** Free-floating label on the canvas (not part of SMILES / molfile). */
export interface CanvasText {
  id: string;
  x: number;
  y: number;
  text: string;
  fontSize: number;
  color: string;
  fontFamily?: string;
  /** World-space box size; defaults to measured text bounds when omitted. */
  boxWidth?: number;
  boxHeight?: number;
  /** Rotation about the box center (radians). */
  rotationRad?: number;
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  textDecoration?: 'none' | 'underline';
  /** Whole-box script style (PowerPoint-like). */
  textScript?: 'normal' | 'super' | 'sub';
}

/**
 * ChemDraw-style polymer structural repeating unit (SRU) brackets.
 * Expand-to-n / molfile S-group I/O are deferred — this is canvas markup only.
 */
export interface SruBracket {
  id: string;
  /** Atoms in the structural repeating unit. */
  atomIds: string[];
  /** Axis-aligned bracket box (world). Left/right brackets drawn on x1/x2. */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Subscript / repeat label (default `"n"`). */
  subscript: string;
  color?: string;
}

/** Folder-like group in the Objects panel outline. */
export interface ObjectOutlineCollection {
  id: string;
  name: string;
  collapsed?: boolean;
}

/**
 * Objects-panel outline: collections (folders), display names, parent links, and order.
 * Keys match canvas visibility keys (`mol:…`, `arrow:…`, …) or `collection:<id>`.
 */
export interface ObjectOutline {
  collections: ObjectOutlineCollection[];
  /** Global display order (root collections/items + nested items interleaved by parent). */
  order: string[];
  /** Object key → collection id (collections themselves are never parented). */
  parent?: Record<string, string>;
  /** Optional display names for object keys and `collection:<id>`. */
  names?: Record<string, string>;
}

export interface Molecule {
  atoms: Atom[];
  bonds: Bond[];
  /** Drag-drawn annotation shapes (rectangle, circle, …). */
  canvasShapes?: CanvasShape[];
  strokes?: Stroke[];
  /** Reaction arrows on canvas; first arrow can split full-molecule SMILES as `reactants>>products`. */
  reactionArrows?: ReactionArrow[];
  /** Free text annotations on the canvas. */
  canvasTexts?: CanvasText[];
  /** Raster image annotations. */
  canvasImages?: CanvasImage[];
  /** Atomic-orbital teaching annotations (s / p / d). */
  orbitals?: CanvasOrbital[];
  /** Polymer SRU brackets around a repeat unit (canvas markup). */
  sruBrackets?: SruBracket[];
  /** Per-cycle interior tint (canvas). Key = `ringSignature(atomIds)` from `domain/rings`. */
  ringFills?: Record<string, { color: string; opacity?: number }>;
  /**
   * Locked 2D ring depictions (chair / boat). Key = `ringSignature(atomIds)`.
   * Cleanup must not rebuild these into flat regular polygons.
   */
  ringConformations?: Record<string, 'chair' | 'boat'>;
  /** @deprecated Migrated into `ringFills` by `normalizeMoleculeRingFills`. */
  ringFill?: { enabled: boolean; color: string; opacity?: number };
  /** Titles for multi-step reaction groups keyed by `ReactionArrow.multiStepGroupId`. */
  reactionMultiStepGroups?: Record<string, ReactionMultiStepGroupMeta>;
  /**
   * Canvas 3D perspective pose (ChemDraw 3D Clean Up / Structure Perspective).
   * Display-only until Flatten; exporters should ignore this field.
   */
  perspective3D?: PerspectivePose;
  /** Objects panel folders / rename / order (undoable; not written to molfile). */
  objectOutline?: ObjectOutline;
  /**
   * Stable connected-component ids for the Objects panel (`mol:<fragmentId>` keys).
   * Maps atomId → fragmentId; reconciled when the graph changes.
   */
  fragmentByAtomId?: Record<string, string>;
  /**
   * Instance-style arrays (COF / circular): one seed fragment + placement transforms.
   * Expanded to atoms for export, cleanup, 3D, or break-apart. Not written to molfile.
   */
  instanceArrays?: InstanceArray[];
  /**
   * Programmatic COF lattices (packing sliders). Not written to molfile.
   */
  cofLattices?: CofLattice[];
  /**
   * 2D structure look (Default skeletal vs Simple ball-and-stick).
   * Display-only; not written to molfile. Shared by canvas / MCP via
   * `molecule.setStructureTheme`.
   */
  structureThemeId?: string;
  structureDrawMode?: 'skeletal' | 'ball-stick';
}

/** One generated COF sheet — preset + hexagonal packing, rebuilt when H/V/D change. */
export interface CofLattice {
  id: string;
  presetId: string;
  cols: number;
  rows: number;
  /** Stacked layers along the packing c-axis (1 = single 2D sheet). */
  layers?: number;
  cx: number;
  cy: number;
  bondLengthPx: number;
  atomIds: string[];
  /**
   * True when `atomIds` are a real in-plane sheet (shared nodes merged).
   * False during live H/V pore instancing. Depth layers stay instanced either way.
   */
  inPlaneBaked?: boolean;
  /**
   * Display orbit applied after crystal-frame z-stack (radians, X then Y).
   * Lets layered / future 3D nets show depth without a separate tool switch.
   */
  viewRot?: { x: number; y: number };
}

/** One placement of an InstanceArray seed (relative to seed centroid). */
export interface InstanceArraySite {
  dx: number;
  dy: number;
  /** Rotation in radians about the placed centroid. */
  rot: number;
  /**
   * Optional crystal-frame depth (canvas px). Used by layered / 3D COF packing;
   * copied into `perspective3D` when instances are materialized.
   */
  dz?: number;
}

/**
 * Document-level instancing: shared chemistry (seed atoms) + many placements.
 * Site (0,0,0) is implied for the seed; `sites` lists additional copies.
 */
export interface InstanceArray {
  id: string;
  seedAtomIds: string[];
  sites: InstanceArraySite[];
  label?: string;
  /** Last circular-array slider values (restore UI while the array is live). */
  circular?: {
    count: number;
    radius: number;
    spacingDeg?: number;
    rotate: boolean;
  };
  /** Linear array: copies along +X at a fixed center-to-center spacing. */
  linear?: {
    count: number;
    spacingPx: number;
    rotate: boolean;
  };
  /**
   * Radial / dendrimer instancing: shared core (not copied) + one parent branch
   * rotated about (cx, cy). Copies reattach to `attachmentAtomIds[i]`.
   */
  dendrimer?: {
    foldCount: number;
    cx: number;
    cy: number;
    coreAtomIds: string[];
    /** Angular order around the core; index 0 is the parent attachment. */
    attachmentAtomIds: string[];
    seedAttachmentAtomId: string;
  };
}
