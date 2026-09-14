/**
 * Lab glassware catalog for UI labels, AI/MCP place tools, and docs.
 *
 * Source of truth for *which* vessels exist: `GLASSWARE_SHAPE_KIND_ORDER` in `./types`.
 * Adding a kind there + optional metadata here makes it appear in MCP/chat automatically
 * (via `listGlasswareLibrary` / `resolveGlassware`).
 */
import {
  CONICAL_FLASK_DEFAULT_FILL,
  CONICAL_FLASK_DEFAULT_LEVEL,
  GLASSWARE_SHAPE_KIND_ORDER,
  isLiquidGlasswareShape,
  type CanvasShapeKind,
} from './types';

/** Toolbar / catalog sections for the glassware menu. */
export const GLASSWARE_CATEGORY_ORDER = [
  'vessels',
  'funnels',
  'condensers',
  'distillation',
  'adapters',
  'vacuum_gas',
  'heating_cooling',
  'stands_tools',
  'measuring',
] as const;

export type GlasswareCategoryId = (typeof GLASSWARE_CATEGORY_ORDER)[number];

export const GLASSWARE_CATEGORY_LABELS: Record<GlasswareCategoryId, string> = {
  vessels: 'Flasks & vessels',
  funnels: 'Funnels & filtration',
  condensers: 'Condensers & columns',
  distillation: 'Distillation & rotovap',
  adapters: 'Adapters & closures',
  vacuum_gas: 'Vacuum, gas & tubing',
  heating_cooling: 'Heating & cooling',
  stands_tools: 'Stands, clamps & tools',
  measuring: 'Measuring & analysis',
};

/**
 * Menu order within each category. Every `GLASSWARE_SHAPE_KIND_ORDER` kind
 * must appear exactly once (asserted in `listGlasswareLibraryByCategory`).
 */
export const GLASSWARE_KINDS_BY_CATEGORY: Record<
  GlasswareCategoryId,
  readonly CanvasShapeKind[]
> = {
  vessels: [
    'round_bottom_flask',
    'two_neck_rbf',
    'three_neck_rbf',
    'four_neck_rbf',
    'pear_shaped_flask',
    'conical_flask',
    'beaker',
    'test_tube',
    'schlenk_flask',
    'schlenk_tube',
    'jacketed_reactor',
    'pressure_reactor',
    'electrochemical_cell',
    'flow_reactor',
    'buchner_flask',
    'receiving_flask',
    'pressure_tube',
    'dewar_flask',
    'evaporating_dish',
    'crystallizing_dish',
    'petri_dish',
    'watch_glass',
    'desiccator',
    'crucible',
    'quartz_boat',
  ],
  funnels: [
    'separatory_funnel',
    'dropping_funnel',
    'filter_funnel',
    'stemless_funnel',
    'buchner_funnel',
    'hirsch_funnel',
    'sintered_funnel',
    'powder_funnel',
  ],
  condensers: [
    'condenser',
    'allihn_condenser',
    'dimroth_condenser',
    'vigreux_column',
    'cold_finger',
    'chromatography_column',
    'flash_system',
    'soxhlet',
  ],
  distillation: [
    'distillation_head',
    'hickman_head',
    'claisen_adapter',
    'dean_stark_trap',
    'cow_receiver',
    'cold_trap',
    'vacuum_sublimator',
    'kugelrohr',
    'rotovap_body',
    'rotovap_flask',
    'rotovap_bump_trap',
  ],
  adapters: [
    'straight_adapter',
    'bent_adapter',
    'reducing_adapter',
    'vacuum_adapter',
    'thermometer_adapter',
    'gas_inlet_adapter',
    'filter_adapter',
    'stopper',
    'septum',
    'young_stopcock',
    'keck_clip',
    'metal_joint_clip',
  ],
  vacuum_gas: [
    'schlenk_manifold',
    'solvent_purification_system',
    'vacuum_pump',
    'aspirator',
    'vacuum_gauge',
    'gas_cylinder',
    'lyophilizer',
    'vacuum_tubing',
    'coolant_tubing',
    'gas_bubbler',
    'gas_dispersion_tube',
    'balloon',
    'drying_tube',
  ],
  heating_cooling: [
    'heating_mantle',
    'hotplate_stirrer',
    'heating_block',
    'microwave_reactor',
    'photoreactor',
    'tube_furnace',
    'muffle_furnace',
    'oil_bath',
    'sand_bath',
    'water_bath',
    'steam_bath',
    'ice_bath',
    'dry_ice_bath',
    'chiller',
    'bunsen_burner',
    'alcohol_lamp',
    'heat_gun',
  ],
  stands_tools: [
    'retort_stand',
    'three_prong_clamp',
    'ring_clamp',
    'lab_jack',
    'fume_hood',
    'biosafety_cabinet',
    'glovebox',
    'centrifuge',
    'incubator_shaker',
    'spin_coater',
    'syringe_pump',
    'stir_bar',
    'overhead_stirrer',
    'syringe',
    'cannula',
    'filter_cannula',
    'transfer_needle',
    'pasteur_pipette',
    'spatula',
    'forceps',
    'tongs',
    'weighing_boat',
    'mortar_pestle',
    'quartz_tube',
  ],
  measuring: [
    'graduated_cylinder',
    'volumetric_flask',
    'burette',
    'thermometer',
    'nmr_tube',
    'tlc_chamber',
    'analytical_balance',
  ],
};

const GLASSWARE_KIND_CATEGORY = (() => {
  const map = new Map<string, GlasswareCategoryId>();
  for (const cat of GLASSWARE_CATEGORY_ORDER) {
    for (const kind of GLASSWARE_KINDS_BY_CATEGORY[cat]) {
      map.set(kind, cat);
    }
  }
  return map;
})();

export function getGlasswareCategory(kind: CanvasShapeKind): GlasswareCategoryId | null {
  return GLASSWARE_KIND_CATEGORY.get(kind) ?? null;
}

export type GlasswareLibraryEntry = {
  kind: CanvasShapeKind;
  /** Toolbar / catalog section. */
  category: GlasswareCategoryId;
  /** Human label (toolbar / AI). */
  label: string;
  /** Short blurb for MCP tool listings. */
  summary: string;
  /** Alternate names the AI may use (RBF, Erlenmeyer, …). */
  aliases: readonly string[];
  /** Default bounding-box size in world units. */
  defaultWidth: number;
  defaultHeight: number;
  supportsLiquid: boolean;
  defaultFillColor?: string;
  defaultFillLevel?: number;
};

export type GlasswareLibraryCategoryGroup = {
  id: GlasswareCategoryId;
  label: string;
  items: readonly GlasswareLibraryEntry[];
};

type GlasswareMeta = Omit<GlasswareLibraryEntry, 'kind' | 'supportsLiquid' | 'category'>;

/** Per-kind overrides. Missing kinds still list with humanized defaults. */
const GLASSWARE_META: Partial<Record<CanvasShapeKind, GlasswareMeta>> = {
  conical_flask: {
    label: 'Conical flask',
    summary: 'Erlenmeyer flask — common reaction / prep vessel',
    aliases: ['erlenmeyer', 'erlenmeyer flask', 'conical', 'flask'],
    defaultWidth: 90,
    defaultHeight: 130,
    defaultFillColor: CONICAL_FLASK_DEFAULT_FILL,
    defaultFillLevel: CONICAL_FLASK_DEFAULT_LEVEL,
  },
  beaker: {
    label: 'Beaker',
    summary: 'Cylindrical beaker for solutions / workup',
    aliases: ['lab beaker'],
    defaultWidth: 90,
    defaultHeight: 110,
    defaultFillColor: CONICAL_FLASK_DEFAULT_FILL,
    defaultFillLevel: CONICAL_FLASK_DEFAULT_LEVEL,
  },
  test_tube: {
    label: 'Test tube',
    summary: 'Narrow tube for small-scale tests',
    aliases: ['tube'],
    defaultWidth: 40,
    defaultHeight: 140,
    defaultFillColor: CONICAL_FLASK_DEFAULT_FILL,
    defaultFillLevel: CONICAL_FLASK_DEFAULT_LEVEL,
  },
  round_bottom_flask: {
    label: 'Round-bottom flask',
    summary: 'RBF — default organic prep vessel (neck + stopper)',
    aliases: ['rbf', 'round bottom', 'round-bottom', 'round bottom flask', 'rb flask'],
    defaultWidth: 100,
    defaultHeight: 140,
    defaultFillColor: CONICAL_FLASK_DEFAULT_FILL,
    defaultFillLevel: CONICAL_FLASK_DEFAULT_LEVEL,
  },
  condenser: {
    label: 'Condenser',
    summary: 'Liebig / straight condenser for reflux setups',
    aliases: ['liebig', 'liebig condenser', 'reflux condenser', 'straight condenser'],
    defaultWidth: 48,
    defaultHeight: 160,
  },
  separatory_funnel: {
    label: 'Separatory funnel',
    summary: 'Sep funnel for extraction / workup',
    aliases: ['sep funnel', 'separating funnel', 'separatory', 'extraction funnel'],
    defaultWidth: 80,
    defaultHeight: 160,
    defaultFillColor: CONICAL_FLASK_DEFAULT_FILL,
    defaultFillLevel: 0.45,
  },
  filter_funnel: {
    label: 'Filter funnel',
    summary: 'Simple conical funnel for gravity filtration',
    aliases: ['funnel', 'filtration funnel', 'conical funnel'],
    defaultWidth: 90,
    defaultHeight: 120,
  },
  dropping_funnel: {
    label: 'Dropping funnel',
    summary: 'Addition funnel with pressure-equalizing sidearm',
    aliases: [
      'addition funnel',
      'pe dropping funnel',
      'pressure equalizing funnel',
      'pressure-equalizing funnel',
      'dropping',
    ],
    defaultWidth: 70,
    defaultHeight: 170,
    defaultFillColor: CONICAL_FLASK_DEFAULT_FILL,
    defaultFillLevel: 0.4,
  },
  three_neck_rbf: {
    label: 'Three-neck RBF',
    summary: 'Three-neck round-bottom flask for multi-port setups',
    aliases: ['three neck', '3-neck', '3 neck rbf', 'three-neck flask', 'trineck'],
    defaultWidth: 120,
    defaultHeight: 140,
    defaultFillColor: CONICAL_FLASK_DEFAULT_FILL,
    defaultFillLevel: CONICAL_FLASK_DEFAULT_LEVEL,
  },
  buchner_flask: {
    label: 'Büchner flask',
    summary: 'Filter flask with vacuum sidearm',
    aliases: ['buchner flask', 'büchner flask', 'filter flask', 'sidearm flask', 'vacuum flask'],
    defaultWidth: 100,
    defaultHeight: 130,
    defaultFillColor: CONICAL_FLASK_DEFAULT_FILL,
    defaultFillLevel: 0.25,
  },
  claisen_adapter: {
    label: 'Claisen adapter',
    summary: 'Y-adapter for distillation / multi-neck joints',
    aliases: ['claisen', 'claisen distillation adapter', 'distillation adapter', 'y adapter'],
    defaultWidth: 90,
    defaultHeight: 110,
  },
  distillation_head: {
    label: 'Distillation head',
    summary: 'Still head with takeoff toward the condenser',
    aliases: ['still head', 'distilling head', 'takeoff adapter'],
    defaultWidth: 100,
    defaultHeight: 100,
  },
  receiving_flask: {
    label: 'Receiving flask',
    summary: 'Compact RBF for collecting distillate',
    aliases: ['receiver', 'receiver flask', 'collection flask', 'distillate flask'],
    defaultWidth: 80,
    defaultHeight: 100,
    defaultFillColor: CONICAL_FLASK_DEFAULT_FILL,
    defaultFillLevel: 0.2,
  },
  dean_stark_trap: {
    label: 'Dean–Stark trap',
    summary: 'Azeotropic water trap under a condenser',
    aliases: ['dean stark', 'dean-stark', 'dean stark trap', 'water trap'],
    defaultWidth: 70,
    defaultHeight: 150,
    defaultFillColor: CONICAL_FLASK_DEFAULT_FILL,
    defaultFillLevel: 0.35,
  },
  graduated_cylinder: {
    label: 'Graduated cylinder',
    summary: 'Measuring cylinder with volume tick marks',
    aliases: ['measuring cylinder', 'grad cylinder', 'cylinder'],
    defaultWidth: 50,
    defaultHeight: 160,
    defaultFillColor: CONICAL_FLASK_DEFAULT_FILL,
    defaultFillLevel: 0.45,
  },
  volumetric_flask: {
    label: 'Volumetric flask',
    summary: 'Pear flask with calibration mark for accurate volumes',
    aliases: ['vol flask', 'standard flask', 'volumetric'],
    defaultWidth: 80,
    defaultHeight: 150,
    defaultFillColor: CONICAL_FLASK_DEFAULT_FILL,
    defaultFillLevel: 0.55,
  },
  chromatography_column: {
    label: 'Chromatography column',
    summary: 'Flash / gravity column with stopcock',
    aliases: ['column', 'flash column', 'silica column', 'chromatography'],
    defaultWidth: 55,
    defaultHeight: 200,
    defaultFillColor: CONICAL_FLASK_DEFAULT_FILL,
    defaultFillLevel: 0.5,
  },
  tlc_chamber: {
    label: 'TLC chamber',
    summary: 'Covered jar with solvent and TLC plate',
    aliases: ['tlc', 'tlc tank', 'developing chamber', 'chromatography chamber'],
    defaultWidth: 90,
    defaultHeight: 120,
    defaultFillColor: CONICAL_FLASK_DEFAULT_FILL,
    defaultFillLevel: 0.15,
  },
  allihn_condenser: {
    label: 'Allihn condenser',
    summary: 'Bulb condenser for reflux',
    aliases: ['allihn', 'bulb condenser', 'reflux bulb condenser'],
    defaultWidth: 52,
    defaultHeight: 170,
  },
  dimroth_condenser: {
    label: 'Dimroth condenser',
    summary: 'Coil condenser for efficient cooling',
    aliases: ['dimroth', 'coil condenser', 'friedrichs condenser'],
    defaultWidth: 52,
    defaultHeight: 170,
  },
  soxhlet: {
    label: 'Soxhlet extractor',
    summary: 'Continuous extraction thimble body with siphon',
    aliases: ['soxhlet extractor', 'soxhlet apparatus'],
    defaultWidth: 90,
    defaultHeight: 170,
    defaultFillColor: CONICAL_FLASK_DEFAULT_FILL,
    defaultFillLevel: 0.35,
  },
  hirsch_funnel: {
    label: 'Hirsch funnel',
    summary: 'Small perforated funnel for micro filtration',
    aliases: ['hirsch', 'micro funnel'],
    defaultWidth: 85,
    defaultHeight: 100,
  },
  schlenk_flask: {
    label: 'Schlenk flask',
    summary: 'Air-free flask with sidearm stopcock',
    aliases: ['schlenk', 'schlenk tube', 'airfree flask'],
    defaultWidth: 100,
    defaultHeight: 130,
    defaultFillColor: CONICAL_FLASK_DEFAULT_FILL,
    defaultFillLevel: CONICAL_FLASK_DEFAULT_LEVEL,
  },
  gas_bubbler: {
    label: 'Gas bubbler',
    summary: 'Oil bubbler / gas inlet for inert atmosphere',
    aliases: ['bubbler', 'oil bubbler', 'gas inlet', 'mineral oil bubbler'],
    defaultWidth: 70,
    defaultHeight: 120,
    defaultFillColor: '#c4b896',
    defaultFillLevel: 0.4,
  },
  thermometer_adapter: {
    label: 'Thermometer adapter',
    summary: 'Joint adapter with thermometer stem',
    aliases: ['thermometer joint', 'temp adapter', 'thermowell adapter'],
    defaultWidth: 55,
    defaultHeight: 130,
  },
  straight_adapter: {
    label: 'Straight adapter',
    summary: 'Ground-glass neck-to-neck coupler',
    aliases: [
      'ground glass joint',
      'ground-glass joint',
      'straight joint',
      'joint adapter',
      'coupler',
    ],
    defaultWidth: 48,
    defaultHeight: 90,
  },
  vacuum_adapter: {
    label: 'Vacuum adapter',
    summary: 'Condenser end → receiver / vacuum takeoff',
    aliases: ['vacuum takeoff', 'distillation vacuum adapter', 'takeoff adapter vacuum'],
    defaultWidth: 70,
    defaultHeight: 100,
  },
  bent_adapter: {
    label: 'Bent adapter',
    summary: '105° distillation bend without a full still head',
    aliases: ['105 adapter', '105° adapter', 'bent takeoff', 'distillation bend'],
    defaultWidth: 100,
    defaultHeight: 90,
  },
  vacuum_tubing: {
    label: 'Vacuum tubing',
    summary: 'Rubber hose for sidearm ↔ pump / bubbler',
    aliases: ['rubber tubing', 'vacuum hose', 'rubber hose', 'tubing'],
    defaultWidth: 90,
    defaultHeight: 50,
  },
  coolant_tubing: {
    label: 'Coolant tubing',
    summary: 'Condenser water in/out loop with hose barbs',
    aliases: ['water tubing', 'coolant hose', 'hose barb', 'condenser tubing'],
    defaultWidth: 70,
    defaultHeight: 80,
  },
  stopper: {
    label: 'Stopper',
    summary: 'Cap unused necks on multi-neck flasks',
    aliases: ['glass stopper', 'joint stopper', 'flask stopper'],
    defaultWidth: 36,
    defaultHeight: 40,
  },
  septum: {
    label: 'Septum',
    summary: 'Rubber septum for needle / cannula access',
    aliases: ['rubber septum', 'serum stopper', 'septa'],
    defaultWidth: 40,
    defaultHeight: 36,
  },
  keck_clip: {
    label: 'Keck clip',
    summary: 'Plastic clip showing a secured ground-glass joint',
    aliases: ['keck', 'joint clip', 'plastic clip'],
    defaultWidth: 36,
    defaultHeight: 28,
  },
  buchner_funnel: {
    label: 'Büchner funnel',
    summary: 'Perforated funnel for vacuum filtration',
    aliases: ['buchner funnel', 'büchner', 'buchner', 'sinter funnel plate'],
    defaultWidth: 95,
    defaultHeight: 110,
  },
  sintered_funnel: {
    label: 'Sintered funnel',
    summary: 'Fritted glass filter funnel',
    aliases: ['fritted funnel', 'frit funnel', 'sintered glass funnel', 'filter frit'],
    defaultWidth: 90,
    defaultHeight: 110,
  },
  syringe: {
    label: 'Syringe',
    summary: 'Plastic/glass syringe for measured transfers',
    aliases: ['lab syringe', 'hypodermic syringe'],
    defaultWidth: 45,
    defaultHeight: 140,
    defaultFillColor: CONICAL_FLASK_DEFAULT_FILL,
    defaultFillLevel: 0.35,
  },
  cannula: {
    label: 'Cannula',
    summary: 'Transfer needle / tube for air-sensitive transfers',
    aliases: ['transfer cannula', 'double-ended needle', 'steel cannula'],
    defaultWidth: 100,
    defaultHeight: 36,
  },
  nmr_tube: {
    label: 'NMR tube',
    summary: 'Narrow NMR sample tube',
    aliases: ['nmr', 'nmr sample tube'],
    defaultWidth: 28,
    defaultHeight: 150,
    defaultFillColor: CONICAL_FLASK_DEFAULT_FILL,
    defaultFillLevel: 0.25,
  },
  drying_tube: {
    label: 'Drying tube',
    summary: 'CaCl₂ drying tube for moisture exclusion',
    aliases: ['cacl2 tube', 'calcium chloride tube', 'drierite tube', 'drying'],
    defaultWidth: 55,
    defaultHeight: 120,
  },
  heating_mantle: {
    label: 'Heating mantle',
    summary: 'Electric mantle to heat a round-bottom flask',
    aliases: ['mantle', 'heating jacket', 'flask heater'],
    defaultWidth: 120,
    defaultHeight: 80,
  },
  oil_bath: {
    label: 'Oil bath',
    summary: 'Heated oil bath for flask immersion',
    aliases: ['silicone oil bath', 'heat bath'],
    defaultWidth: 130,
    defaultHeight: 70,
    defaultFillColor: '#c4a35a',
    defaultFillLevel: 0.55,
  },
  ice_bath: {
    label: 'Ice bath',
    summary: 'Ice / water cooling bath',
    aliases: ['ice water bath', 'cooling bath'],
    defaultWidth: 130,
    defaultHeight: 70,
    defaultFillColor: '#a8d4e8',
    defaultFillLevel: 0.5,
  },
  dry_ice_bath: {
    label: 'Dry-ice bath',
    summary: 'Dry ice / acetone cryogenic bath',
    aliases: ['dry ice acetone', 'cryo bath', 'co2 bath'],
    defaultWidth: 130,
    defaultHeight: 75,
    defaultFillColor: '#d8e8f0',
    defaultFillLevel: 0.45,
  },
  chiller: {
    label: 'Chiller',
    summary: 'Recirculating chiller / cryostat',
    aliases: ['cryostat', 'recirculating chiller', 'cooler'],
    defaultWidth: 100,
    defaultHeight: 90,
  },
  lab_jack: {
    label: 'Lab jack',
    summary: 'Adjustable scissor jack support',
    aliases: ['scissors jack', 'labjack', 'jack stand'],
    defaultWidth: 90,
    defaultHeight: 70,
  },
  retort_stand: {
    label: 'Retort stand',
    summary: 'Base and rod for clamping apparatus',
    aliases: ['ring stand', 'lab stand', 'support stand'],
    defaultWidth: 70,
    defaultHeight: 200,
  },
  three_prong_clamp: {
    label: 'Three-prong clamp',
    summary: 'Clamp for securing flasks / condensers to a stand',
    aliases: ['clamp', 'flask clamp', 'utility clamp'],
    defaultWidth: 70,
    defaultHeight: 40,
  },
  stir_bar: {
    label: 'Stir bar',
    summary: 'Magnetic stir bar',
    aliases: ['magnetic stirrer bar', 'flea', 'spinbar'],
    defaultWidth: 50,
    defaultHeight: 18,
  },
  pasteur_pipette: {
    label: 'Pasteur pipette',
    summary: 'Glass dropper / Pasteur pipette',
    aliases: ['dropper', 'pipette', 'transfer pipette'],
    defaultWidth: 28,
    defaultHeight: 140,
  },
  spatula: {
    label: 'Spatula',
    summary: 'Lab spatula / scoopula for solids',
    aliases: ['scoopula', 'microspatula', 'lab spatula'],
    defaultWidth: 100,
    defaultHeight: 28,
  },
  powder_funnel: {
    label: 'Powder funnel',
    summary: 'Wide-stem funnel for solids',
    aliases: ['solids funnel', 'wide funnel'],
    defaultWidth: 90,
    defaultHeight: 100,
  },
  two_neck_rbf: {
    label: 'Two-neck RBF',
    summary: 'Two-neck round-bottom flask',
    aliases: ['two neck', '2-neck', '2 neck rbf', 'two-neck flask'],
    defaultWidth: 110,
    defaultHeight: 135,
    defaultFillColor: CONICAL_FLASK_DEFAULT_FILL,
    defaultFillLevel: CONICAL_FLASK_DEFAULT_LEVEL,
  },
  vigreux_column: {
    label: 'Vigreux column',
    summary: 'Indentation fractionating column',
    aliases: ['vigreux', 'fractionating column', 'fractionation column'],
    defaultWidth: 48,
    defaultHeight: 180,
  },
  cow_receiver: {
    label: 'Cow receiver',
    summary: 'Multi-fraction distillation receiver (cow / pig)',
    aliases: ['pig receiver', 'multi receiver', 'fraction collector adapter'],
    defaultWidth: 120,
    defaultHeight: 100,
    defaultFillColor: CONICAL_FLASK_DEFAULT_FILL,
    defaultFillLevel: 0.15,
  },
  cold_finger: {
    label: 'Cold finger',
    summary: 'Cold finger condenser for sublimation / reflux',
    aliases: ['coldfinger', 'sublimation finger'],
    defaultWidth: 55,
    defaultHeight: 140,
  },
  cold_trap: {
    label: 'Cold trap',
    summary: 'Vacuum cold trap',
    aliases: ['vacuum trap', 'solvent trap'],
    defaultWidth: 70,
    defaultHeight: 140,
  },
  vacuum_pump: {
    label: 'Vacuum pump',
    summary: 'Lab vacuum pump icon',
    aliases: ['pump', 'vac pump', 'diaphragm pump'],
    defaultWidth: 100,
    defaultHeight: 80,
  },
  gas_inlet_adapter: {
    label: 'Gas inlet adapter',
    summary: 'Joint adapter with hose barb for inert gas',
    aliases: ['gas adapter', 'inlet adapter', 'hose barb adapter'],
    defaultWidth: 60,
    defaultHeight: 100,
  },
  balloon: {
    label: 'Balloon',
    summary: 'Inert-gas balloon on a joint / needle',
    aliases: ['n2 balloon', 'argon balloon', 'gas balloon'],
    defaultWidth: 70,
    defaultHeight: 90,
  },
  reducing_adapter: {
    label: 'Reducing adapter',
    summary: 'Ground-glass reducing / enlarging joint adapter',
    aliases: ['enlarging adapter', 'joint reducer', '24/40 to 14/20'],
    defaultWidth: 50,
    defaultHeight: 90,
  },
  rotovap_bump_trap: {
    label: 'Rotovap bump trap',
    summary: 'Rotary evaporator bump / splash trap',
    aliases: ['bump trap', 'splash trap', 'rotovap trap'],
    defaultWidth: 70,
    defaultHeight: 100,
  },
  rotovap_flask: {
    label: 'Rotovap flask',
    summary: 'Pear-shaped evaporating flask for rotary evaporator',
    aliases: ['evaporating flask', 'roto flask'],
    defaultWidth: 95,
    defaultHeight: 110,
    defaultFillColor: CONICAL_FLASK_DEFAULT_FILL,
    defaultFillLevel: 0.3,
  },
  hotplate_stirrer: {
    label: 'Hotplate stirrer',
    summary: 'Magnetic stirrer hotplate with control knobs',
    aliases: ['hot plate', 'stirrer hotplate', 'mag stirrer', 'stir plate'],
    defaultWidth: 110,
    defaultHeight: 70,
  },
  dewar_flask: {
    label: 'Dewar flask',
    summary: 'Vacuum-insulated Dewar for cryogens',
    aliases: ['dewar', 'cryogen dewar', 'liquid nitrogen dewar'],
    defaultWidth: 90,
    defaultHeight: 130,
    defaultFillColor: '#cfe8f5',
    defaultFillLevel: 0.4,
  },
  thermometer: {
    label: 'Thermometer',
    summary: 'Laboratory thermometer with bulb and scale',
    aliases: ['temp probe', 'lab thermometer', 'mercury thermometer'],
    defaultWidth: 36,
    defaultHeight: 150,
  },
  watch_glass: {
    label: 'Watch glass',
    summary: 'Concave watch glass for covering or crystallizing',
    aliases: ['watchglass', 'cover glass'],
    defaultWidth: 100,
    defaultHeight: 40,
  },
  burette: {
    label: 'Burette',
    summary: 'Graduated burette with stopcock for titration',
    aliases: ['buret', 'titration burette'],
    defaultWidth: 40,
    defaultHeight: 200,
    defaultFillColor: CONICAL_FLASK_DEFAULT_FILL,
    defaultFillLevel: 0.55,
  },
  evaporating_dish: {
    label: 'Evaporating dish',
    summary: 'Shallow porcelain dish for evaporation',
    aliases: ['evap dish', 'crystallizing dish', 'porcelain dish'],
    defaultWidth: 110,
    defaultHeight: 55,
    defaultFillColor: CONICAL_FLASK_DEFAULT_FILL,
    defaultFillLevel: 0.35,
  },
  filter_adapter: {
    label: 'Filter adapter',
    summary: 'Neoprene / rubber adapter for Büchner funnel on flask',
    aliases: ['buchner adapter', 'neoprene adapter', 'filter flask adapter', 'rubber adapter'],
    defaultWidth: 70,
    defaultHeight: 50,
  },
  pressure_tube: {
    label: 'Pressure tube',
    summary: 'Thick-walled sealed tube for high-pressure reactions',
    aliases: ['sealed tube', 'ace pressure tube', 'heavy wall tube'],
    defaultWidth: 50,
    defaultHeight: 150,
    defaultFillColor: CONICAL_FLASK_DEFAULT_FILL,
    defaultFillLevel: 0.3,
  },
  desiccator: {
    label: 'Desiccator',
    summary: 'Glass desiccator with lid and desiccant plate',
    aliases: ['dessicator', 'vacuum desiccator'],
    defaultWidth: 120,
    defaultHeight: 110,
  },
  pear_shaped_flask: {
    label: 'Pear-shaped flask',
    summary: 'Pear / heart-shaped flask for small-scale work',
    aliases: ['pear flask', 'heart flask', 'pear shaped'],
    defaultWidth: 90,
    defaultHeight: 120,
    defaultFillColor: CONICAL_FLASK_DEFAULT_FILL,
    defaultFillLevel: CONICAL_FLASK_DEFAULT_LEVEL,
  },
  bunsen_burner: {
    label: 'Bunsen burner',
    summary: 'Gas Bunsen burner with barrel and base',
    aliases: ['bunsen', 'gas burner', 'teclu burner'],
    defaultWidth: 70,
    defaultHeight: 120,
  },
  alcohol_lamp: {
    label: 'Alcohol lamp',
    summary: 'Spirit / alcohol lamp with wick',
    aliases: ['spirit lamp', 'spirit burner', 'alcohol burner'],
    defaultWidth: 70,
    defaultHeight: 100,
  },
  sand_bath: {
    label: 'Sand bath',
    summary: 'Heated sand bath for flasks',
    aliases: ['sand heater', 'heated sand'],
    defaultWidth: 130,
    defaultHeight: 70,
    defaultFillColor: '#c2a36b',
    defaultFillLevel: 0.55,
  },
  steam_bath: {
    label: 'Steam bath',
    summary: 'Steam bath with concentric rings',
    aliases: ['steam heater', 'water steam bath'],
    defaultWidth: 120,
    defaultHeight: 75,
    defaultFillColor: '#b8d4e8',
    defaultFillLevel: 0.4,
  },
  water_bath: {
    label: 'Water bath',
    summary: 'Heated water bath for gentle warming',
    aliases: ['heated water bath', 'thermostatic bath'],
    defaultWidth: 130,
    defaultHeight: 70,
    defaultFillColor: '#8ecae6',
    defaultFillLevel: 0.5,
  },
  heat_gun: {
    label: 'Heat gun',
    summary: 'Laboratory heat gun for drying / warming',
    aliases: ['hot air gun', 'heatgun'],
    defaultWidth: 100,
    defaultHeight: 70,
  },
  heating_block: {
    label: 'Heating block',
    summary: 'Aluminum heating block with vial wells',
    aliases: ['al block', 'aluminium block', 'reaction block', 'vial block'],
    defaultWidth: 110,
    defaultHeight: 70,
  },
  overhead_stirrer: {
    label: 'Overhead stirrer',
    summary: 'Mechanical overhead stirrer with shaft and paddle',
    aliases: ['mechanical stirrer', 'overhead mixer', 'shaft stirrer'],
    defaultWidth: 80,
    defaultHeight: 160,
  },
  four_neck_rbf: {
    label: 'Four-neck RBF',
    summary: 'Four-neck round-bottom flask for multi-port / reactor setups',
    aliases: ['four neck', '4-neck', '4 neck rbf', 'four-neck flask', 'tetraneck'],
    defaultWidth: 130,
    defaultHeight: 145,
    defaultFillColor: CONICAL_FLASK_DEFAULT_FILL,
    defaultFillLevel: CONICAL_FLASK_DEFAULT_LEVEL,
  },
  rotovap_body: {
    label: 'Rotovap body',
    summary: 'Rotary evaporator motor / vapor duct / condenser unit',
    aliases: ['rotary evaporator', 'rotavap body', 'rotovap motor', 'rv body'],
    defaultWidth: 160,
    defaultHeight: 120,
  },
  aspirator: {
    label: 'Aspirator',
    summary: 'Water-jet aspirator / filter pump for vacuum filtration',
    aliases: ['water aspirator', 'water jet pump', 'filter pump', 'aspirator pump'],
    defaultWidth: 90,
    defaultHeight: 100,
  },
  vacuum_gauge: {
    label: 'Vacuum gauge',
    summary: 'Dial manometer / vacuum gauge',
    aliases: ['manometer', 'vacuum meter', 'pressure gauge'],
    defaultWidth: 70,
    defaultHeight: 80,
  },
  gas_cylinder: {
    label: 'Gas cylinder',
    summary: 'Compressed gas cylinder with regulator outlet',
    aliases: ['gas bottle', 'nitrogen cylinder', 'argon cylinder', 'n2 cylinder', 'regulator'],
    defaultWidth: 70,
    defaultHeight: 160,
  },
  fume_hood: {
    label: 'Fume hood',
    summary: 'Schematic fume cupboard / hood enclosure',
    aliases: ['fume cupboard', 'hood', 'lab hood', 'ventilated hood'],
    defaultWidth: 200,
    defaultHeight: 140,
  },
  weighing_boat: {
    label: 'Weighing boat',
    summary: 'Plastic / paper weighing boat for solids',
    aliases: ['weigh boat', 'weighing paper', 'weighing dish'],
    defaultWidth: 70,
    defaultHeight: 40,
  },
  forceps: {
    label: 'Forceps',
    summary: 'Lab forceps / tweezers',
    aliases: ['tweezers', 'tongs', 'lab forceps'],
    defaultWidth: 100,
    defaultHeight: 40,
  },
  mortar_pestle: {
    label: 'Mortar & pestle',
    summary: 'Mortar and pestle for grinding solids',
    aliases: ['mortar', 'pestle', 'mortar and pestle'],
    defaultWidth: 100,
    defaultHeight: 80,
  },
  crystallizing_dish: {
    label: 'Crystallizing dish',
    summary: 'Wide shallow dish for crystallization / evaporation',
    aliases: ['crystallisation dish', 'crystallizing', 'crystal dish'],
    defaultWidth: 110,
    defaultHeight: 55,
    defaultFillColor: CONICAL_FLASK_DEFAULT_FILL,
    defaultFillLevel: 0.35,
  },
  petri_dish: {
    label: 'Petri dish',
    summary: 'Shallow Petri dish with lid',
    aliases: ['petri', 'culture dish', 'agar plate'],
    defaultWidth: 100,
    defaultHeight: 45,
    defaultFillColor: CONICAL_FLASK_DEFAULT_FILL,
    defaultFillLevel: 0.25,
  },
  hickman_head: {
    label: 'Hickman head',
    summary: 'Microscale Hickman / short-path distillation head',
    aliases: ['hickman', 'hickman still', 'microscale head', 'short path head'],
    defaultWidth: 90,
    defaultHeight: 110,
  },
  jacketed_reactor: {
    label: 'Jacketed reactor',
    summary: 'Jacketed reaction vessel with coolant ports',
    aliases: ['jacketed flask', 'jacketed vessel', 'reactor', 'double wall reactor'],
    defaultWidth: 120,
    defaultHeight: 150,
    defaultFillColor: CONICAL_FLASK_DEFAULT_FILL,
    defaultFillLevel: 0.4,
  },
  schlenk_tube: {
    label: 'Schlenk tube',
    summary: 'Narrow Schlenk tube with sidearm stopcock',
    aliases: ['schlenk', 'airfree tube', 'vacuum tube'],
    defaultWidth: 55,
    defaultHeight: 150,
    defaultFillColor: CONICAL_FLASK_DEFAULT_FILL,
    defaultFillLevel: 0.3,
  },
  gas_dispersion_tube: {
    label: 'Gas dispersion tube',
    summary: 'Fritted gas dispersion / sparger tube',
    aliases: ['fritted tube', 'sparger', 'gas frit', 'dispersion tube', 'bubbler tube'],
    defaultWidth: 50,
    defaultHeight: 140,
  },
  ring_clamp: {
    label: 'Ring clamp',
    summary: 'Iron ring clamp for separatory funnel / flask support',
    aliases: ['iron ring', 'support ring', 'ring stand clamp', 'sep funnel ring'],
    defaultWidth: 90,
    defaultHeight: 50,
  },
  analytical_balance: {
    label: 'Analytical balance',
    summary: 'Schematic analytical / top-loading balance',
    aliases: ['balance', 'scale', 'weighing scale', 'lab balance'],
    defaultWidth: 120,
    defaultHeight: 90,
  },
  stemless_funnel: {
    label: 'Stemless funnel',
    summary: 'Stemless funnel for hot filtration',
    aliases: ['hot filtration funnel', 'fluted funnel', 'stemless filter funnel'],
    defaultWidth: 90,
    defaultHeight: 90,
  },
  metal_joint_clip: {
    label: 'Metal joint clip',
    summary: 'Stainless / metal ground-glass joint clip',
    aliases: ['joint clip', 'metal clip', 'stainless clip', 'ground glass clip'],
    defaultWidth: 50,
    defaultHeight: 40,
  },
  glovebox: {
    label: 'Glovebox',
    summary: 'Inert glovebox with main chamber and antechamber',
    aliases: ['glove box', 'dry box', 'inert atmosphere box', 'antechamber'],
    defaultWidth: 220,
    defaultHeight: 130,
  },
  schlenk_manifold: {
    label: 'Schlenk manifold',
    summary: 'Dual vacuum / inert-gas Schlenk line manifold',
    aliases: ['schlenk line', 'dual manifold', 'vacuum manifold', 'gas manifold', 'double manifold'],
    defaultWidth: 200,
    defaultHeight: 90,
  },
  filter_cannula: {
    label: 'Filter cannula',
    summary: 'Fritted filter cannula for air-free transfers',
    aliases: ['fritted cannula', 'filter needle', 'cannula filter'],
    defaultWidth: 120,
    defaultHeight: 40,
  },
  transfer_needle: {
    label: 'Transfer needle',
    summary: 'Stainless steel transfer / double-ended needle',
    aliases: ['stainless needle', 'double ended needle', 'transfer cannula', 'steel needle'],
    defaultWidth: 130,
    defaultHeight: 30,
  },
  pressure_reactor: {
    label: 'Pressure reactor',
    summary: 'Parr bomb / autoclave for high-pressure hydrogenation',
    aliases: ['parr', 'parr bomb', 'autoclave', 'pressure vessel', 'hydrogenation reactor'],
    defaultWidth: 110,
    defaultHeight: 130,
    defaultFillColor: CONICAL_FLASK_DEFAULT_FILL,
    defaultFillLevel: 0.35,
  },
  microwave_reactor: {
    label: 'Microwave reactor',
    summary: 'Schematic microwave synthesis reactor',
    aliases: ['microwave', 'mw reactor', 'biotage', 'cem discover'],
    defaultWidth: 120,
    defaultHeight: 100,
  },
  syringe_pump: {
    label: 'Syringe pump',
    summary: 'Syringe pump for slow addition / flow chemistry',
    aliases: ['infusion pump', 'syringe driver', 'pump'],
    defaultWidth: 130,
    defaultHeight: 70,
  },
  flow_reactor: {
    label: 'Flow reactor',
    summary: 'Microfluidic chip / tubular flow reactor',
    aliases: ['microreactor', 'flow chip', 'tubular reactor', 'chip reactor', 'flow chemistry'],
    defaultWidth: 140,
    defaultHeight: 80,
    defaultFillColor: CONICAL_FLASK_DEFAULT_FILL,
    defaultFillLevel: 0.3,
  },
  flash_system: {
    label: 'Flash / HPLC system',
    summary: 'Schematic flash chromatography or HPLC tower with collector',
    aliases: ['hplc', 'flash chromatography', 'biotage flash', 'prep hplc', 'combi flash'],
    defaultWidth: 100,
    defaultHeight: 160,
  },
  lyophilizer: {
    label: 'Lyophilizer',
    summary: 'Freeze-dryer / lyophilizer schematic',
    aliases: ['freeze dryer', 'freeze-dryer', 'lyoph', 'lyophilisation'],
    defaultWidth: 140,
    defaultHeight: 120,
  },
  centrifuge: {
    label: 'Centrifuge',
    summary: 'Benchtop centrifuge schematic',
    aliases: ['centrifugal', 'lab centrifuge', 'microcentrifuge'],
    defaultWidth: 110,
    defaultHeight: 90,
  },
  photoreactor: {
    label: 'Photoreactor',
    summary: 'UV lamp / photoreactor for photochemistry',
    aliases: ['uv lamp', 'photochem', 'light reactor', 'led photoreactor', 'hanovia'],
    defaultWidth: 90,
    defaultHeight: 140,
  },
  electrochemical_cell: {
    label: 'Electrochemical cell',
    summary: 'Undivided / H-cell for electrochemistry',
    aliases: ['h-cell', 'h cell', 'electrocatalysis cell', 'electrolysis cell', 'e-chem cell'],
    defaultWidth: 120,
    defaultHeight: 100,
    defaultFillColor: CONICAL_FLASK_DEFAULT_FILL,
    defaultFillLevel: 0.4,
  },
  vacuum_sublimator: {
    label: 'Vacuum sublimator',
    summary: 'Cold-finger vacuum sublimation apparatus',
    aliases: ['sublimator', 'sublimation apparatus', 'cold finger sublimator'],
    defaultWidth: 90,
    defaultHeight: 140,
  },
  kugelrohr: {
    label: 'Kugelrohr',
    summary: 'Bulb-to-bulb short-path Kugelrohr still',
    aliases: ['kugelrohr still', 'bulb to bulb', 'bulb-to-bulb', 'short path bulbs'],
    defaultWidth: 160,
    defaultHeight: 80,
  },
  solvent_purification_system: {
    label: 'Solvent purification system',
    summary: 'SPS / solvent drying columns schematic',
    aliases: ['sps', 'solvent system', 'grubs still', 'solvent columns', 'mbraun sps'],
    defaultWidth: 160,
    defaultHeight: 140,
  },
  tube_furnace: {
    label: 'Tube furnace',
    summary: 'Horizontal tube furnace for materials / CVD',
    aliases: ['furnace tube', 'horizontal furnace', 'cvd furnace'],
    defaultWidth: 180,
    defaultHeight: 80,
  },
  muffle_furnace: {
    label: 'Muffle furnace',
    summary: 'Box / muffle furnace for high-temperature calcination',
    aliases: ['box furnace', 'ash furnace', 'calcination furnace'],
    defaultWidth: 120,
    defaultHeight: 100,
  },
  quartz_tube: {
    label: 'Quartz tube',
    summary: 'Quartz process tube for tube furnaces',
    aliases: ['process tube', 'furnace tube quartz', 'fused silica tube'],
    defaultWidth: 160,
    defaultHeight: 40,
  },
  quartz_boat: {
    label: 'Quartz boat',
    summary: 'Quartz / ceramic sample boat',
    aliases: ['ceramic boat', 'sample boat', 'combustion boat'],
    defaultWidth: 90,
    defaultHeight: 35,
  },
  crucible: {
    label: 'Crucible',
    summary: 'Ceramic / porcelain crucible',
    aliases: ['porcelain crucible', 'ceramic crucible'],
    defaultWidth: 70,
    defaultHeight: 60,
    defaultFillColor: CONICAL_FLASK_DEFAULT_FILL,
    defaultFillLevel: 0.3,
  },
  tongs: {
    label: 'Crucible tongs',
    summary: 'Crucible / beaker tongs',
    aliases: ['crucible tongs', 'beaker tongs', 'lab tongs'],
    defaultWidth: 110,
    defaultHeight: 45,
  },
  young_stopcock: {
    label: 'Young stopcock',
    summary: 'Greaseless Young / J. Young PTFE stopcock',
    aliases: ['j young', 'j. young', 'greaseless stopcock', 'ptfe stopcock', 'young valve'],
    defaultWidth: 55,
    defaultHeight: 70,
  },
  spin_coater: {
    label: 'Spin coater',
    summary: 'Spin-coating chuck for thin films',
    aliases: ['spin coating', 'spincoater', 'wafer spinner'],
    defaultWidth: 100,
    defaultHeight: 80,
  },
  biosafety_cabinet: {
    label: 'Biosafety cabinet',
    summary: 'Biological safety cabinet schematic',
    aliases: ['bsc', 'laminar flow hood', 'biohood', 'tissue culture hood'],
    defaultWidth: 200,
    defaultHeight: 130,
  },
  incubator_shaker: {
    label: 'Incubator shaker',
    summary: 'Shaking incubator for culture flasks',
    aliases: ['shaker incubator', 'orbital shaker', 'incubator', 'culture shaker'],
    defaultWidth: 140,
    defaultHeight: 100,
  },
};

function humanizeKind(kind: string): string {
  return kind
    .split('_')
    .map(w => (w.length ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function entryForKind(kind: CanvasShapeKind): GlasswareLibraryEntry {
  const meta = GLASSWARE_META[kind];
  const supportsLiquid = isLiquidGlasswareShape(kind);
  const category = getGlasswareCategory(kind) ?? 'vessels';
  return {
    kind,
    category,
    label: meta?.label ?? humanizeKind(kind),
    summary: meta?.summary ?? `${humanizeKind(kind)} (lab glassware)`,
    aliases: meta?.aliases ?? [],
    defaultWidth: meta?.defaultWidth ?? 90,
    defaultHeight: meta?.defaultHeight ?? 130,
    supportsLiquid,
    defaultFillColor: supportsLiquid
      ? (meta?.defaultFillColor ?? CONICAL_FLASK_DEFAULT_FILL)
      : undefined,
    defaultFillLevel: supportsLiquid
      ? (meta?.defaultFillLevel ?? CONICAL_FLASK_DEFAULT_LEVEL)
      : undefined,
  };
}

/** Full catalog — order matches toolbar / `GLASSWARE_SHAPE_KIND_ORDER`. */
export function listGlasswareLibrary(): readonly GlasswareLibraryEntry[] {
  return GLASSWARE_SHAPE_KIND_ORDER.map(entryForKind);
}

/** Catalog grouped for the glassware toolbar menu (and AI listings). */
export function listGlasswareLibraryByCategory(): readonly GlasswareLibraryCategoryGroup[] {
  const known = new Set<string>(GLASSWARE_SHAPE_KIND_ORDER);
  const seen = new Set<string>();
  const groups: GlasswareLibraryCategoryGroup[] = [];

  for (const id of GLASSWARE_CATEGORY_ORDER) {
    const kinds = GLASSWARE_KINDS_BY_CATEGORY[id].filter(k => {
      if (!known.has(k)) return false;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    if (kinds.length === 0) continue;
    groups.push({
      id,
      label: GLASSWARE_CATEGORY_LABELS[id],
      items: kinds.map(entryForKind),
    });
  }

  // Keep the menu complete if a new kind is added before it is categorized.
  const orphanKinds = GLASSWARE_SHAPE_KIND_ORDER.filter(k => !seen.has(k));
  if (orphanKinds.length > 0) {
    const vessels = groups.find(g => g.id === 'vessels');
    if (vessels) {
      groups[groups.indexOf(vessels)] = {
        ...vessels,
        items: [...vessels.items, ...orphanKinds.map(entryForKind)],
      };
    } else {
      groups.push({
        id: 'vessels',
        label: GLASSWARE_CATEGORY_LABELS.vessels,
        items: orphanKinds.map(entryForKind),
      });
    }
  }

  return groups;
}

/** Comma-separated labels for tool descriptions (auto-updates with the catalog). */
export function glasswareLibrarySummary(): string {
  return listGlasswareLibrary()
    .map(e => `${e.label} (${e.kind})`)
    .join(', ');
}

export function getGlasswareEntry(kind: CanvasShapeKind): GlasswareLibraryEntry | null {
  if (!(GLASSWARE_SHAPE_KIND_ORDER as readonly string[]).includes(kind)) return null;
  return entryForKind(kind);
}

/**
 * Resolve a user/AI name to a catalog entry (kind id, label, or alias; fuzzy substring).
 */
export function resolveGlassware(name: string): GlasswareLibraryEntry | null {
  const q = name.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!q) return null;

  const catalog = listGlasswareLibrary();
  for (const e of catalog) {
    if (e.kind === q || e.label.toLowerCase() === q) return e;
    if (e.aliases.some(a => a.toLowerCase() === q)) return e;
  }

  const fuzzy = catalog.find(
    e =>
      e.kind.includes(q.replace(/\s/g, '_')) ||
      e.label.toLowerCase().includes(q) ||
      e.aliases.some(a => a.toLowerCase().includes(q) || q.includes(a.toLowerCase())),
  );
  return fuzzy ?? null;
}

/** Named multi-piece layouts built from the current library (kinds must exist). */
export type GlasswareSetupId =
  | 'reflux'
  | 'extraction'
  | 'filtration'
  | 'distillation'
  | 'addition_reflux'
  | 'vacuum_filtration'
  | 'dean_stark'
  | 'soxhlet_extraction'
  | 'column_chromatography'
  | 'tlc'
  | 'schlenk_line'
  | 'vacuum_distillation'
  | 'short_path'
  | 'inert_flask'
  | 'heated_reflux'
  | 'cooled_reaction'
  | 'dry_ice_reaction'
  | 'fractional_distillation'
  | 'vacuum_line'
  | 'inert_balloon'
  | 'rotovap'
  | 'clamped_flask'
  | 'aspirator_vacuum'
  | 'inert_gas_cylinder'
  | 'solvent_still'
  | 'sep_funnel_stand'
  | 'hot_filtration'
  | 'schlenk_manifold_line'
  | 'hydrogenation'
  | 'flow_setup'
  | 'glovebox_inert'
  | 'photoreactor_setup'
  | 'e_chem'
  | 'sublimation'
  | 'kugelrohr_distill'
  | 'tube_furnace_line'

/**
 * Piece in a named setup. Piece 0 is the root at the setup anchor.
 * Later pieces either attach via ports (`attachTo` + `fromPort`/`toPort`)
 * or use legacy `dx`/`dy` offsets from the setup anchor.
 */
export type GlasswareSetupPiece = {
  kind: CanvasShapeKind;
  /** Index of parent piece in this setup (port chain). */
  attachTo?: number;
  /** Port id on the parent piece. */
  fromPort?: string;
  /** Port id on this piece that mates with `fromPort`. */
  toPort?: string;
  /** Legacy absolute offset from setup anchor (used when ports omitted). */
  dx?: number;
  dy?: number;
  widthScale?: number;
  heightScale?: number;
  fillLevel?: number;
};

export type GlasswareSetup = {
  id: GlasswareSetupId;
  label: string;
  summary: string;
  pieces: readonly GlasswareSetupPiece[];
};

/** Stable id list for Zod / AI schemas (must match SETUPS below). */
export const GLASSWARE_SETUP_IDS = [
  'reflux',
  'extraction',
  'filtration',
  'distillation',
  'addition_reflux',
  'vacuum_filtration',
  'dean_stark',
  'soxhlet_extraction',
  'column_chromatography',
  'tlc',
  'schlenk_line',
  'vacuum_distillation',
  'short_path',
  'inert_flask',
  'heated_reflux',
  'cooled_reaction',
  'dry_ice_reaction',
  'fractional_distillation',
  'vacuum_line',
  'inert_balloon',
  'rotovap',
  'clamped_flask',
  'aspirator_vacuum',
  'inert_gas_cylinder',
  'solvent_still',
  'sep_funnel_stand',
  'hot_filtration',
  'schlenk_manifold_line',
  'hydrogenation',
  'flow_setup',
  'glovebox_inert',
  'photoreactor_setup',
  'e_chem',
  'sublimation',
  'kugelrohr_distill',
  'tube_furnace_line',
] as const satisfies readonly GlasswareSetupId[];

const SETUPS: readonly GlasswareSetup[] = [
  {
    id: 'reflux',
    label: 'Reflux setup',
    summary: 'Round-bottom flask under a vertical condenser',
    pieces: [
      { kind: 'round_bottom_flask', fillLevel: 0.4 },
      {
        kind: 'condenser',
        attachTo: 0,
        fromPort: 'neck_top',
        toPort: 'neck_bottom',
        widthScale: 0.85,
      },
    ],
  },
  {
    id: 'extraction',
    label: 'Extraction setup',
    summary: 'Separatory funnel with optional beaker catch',
    pieces: [
      { kind: 'separatory_funnel', fillLevel: 0.5 },
      {
        kind: 'beaker',
        attachTo: 0,
        fromPort: 'stem_bottom',
        toPort: 'rim_top',
        widthScale: 0.85,
        heightScale: 0.85,
        fillLevel: 0.2,
      },
    ],
  },
  {
    id: 'filtration',
    label: 'Filtration setup',
    summary: 'Filter funnel over a receiving conical flask',
    pieces: [
      { kind: 'conical_flask', fillLevel: 0.25 },
      {
        kind: 'filter_funnel',
        attachTo: 0,
        fromPort: 'neck_top',
        toPort: 'stem_bottom',
      },
    ],
  },
  {
    id: 'distillation',
    label: 'Distillation setup',
    summary: 'Three-neck RBF, distillation head, condenser, receiving flask',
    pieces: [
      { kind: 'three_neck_rbf', fillLevel: 0.4 },
      {
        kind: 'distillation_head',
        attachTo: 0,
        fromPort: 'neck_center',
        toPort: 'neck_bottom',
        widthScale: 0.9,
        heightScale: 0.85,
      },
      {
        kind: 'condenser',
        attachTo: 1,
        fromPort: 'takeoff',
        toPort: 'neck_top',
        widthScale: 0.9,
        heightScale: 0.85,
      },
      {
        kind: 'receiving_flask',
        attachTo: 2,
        fromPort: 'neck_bottom',
        toPort: 'neck_top',
        fillLevel: 0.15,
      },
    ],
  },
  {
    id: 'addition_reflux',
    label: 'Addition reflux',
    summary: 'Three-neck RBF with dropping funnel and condenser',
    pieces: [
      { kind: 'three_neck_rbf', fillLevel: 0.35 },
      {
        kind: 'dropping_funnel',
        attachTo: 0,
        fromPort: 'neck_left',
        toPort: 'stem_bottom',
        widthScale: 0.75,
        heightScale: 0.8,
        fillLevel: 0.45,
      },
      {
        kind: 'condenser',
        attachTo: 0,
        fromPort: 'neck_center',
        toPort: 'neck_bottom',
        widthScale: 0.75,
        heightScale: 0.85,
      },
      {
        kind: 'stopper',
        attachTo: 0,
        fromPort: 'neck_right',
        toPort: 'joint',
        widthScale: 0.65,
        heightScale: 0.65,
      },
    ],
  },
  {
    id: 'vacuum_filtration',
    label: 'Vacuum filtration',
    summary: 'Büchner funnel on a Büchner flask',
    pieces: [
      { kind: 'buchner_flask', fillLevel: 0.2 },
      {
        kind: 'buchner_funnel',
        attachTo: 0,
        fromPort: 'neck_top',
        toPort: 'stem_bottom',
        widthScale: 0.9,
        heightScale: 0.85,
      },
    ],
  },
  {
    id: 'dean_stark',
    label: 'Dean–Stark setup',
    summary: 'RBF with Dean–Stark trap and condenser',
    pieces: [
      { kind: 'round_bottom_flask', fillLevel: 0.4 },
      {
        kind: 'dean_stark_trap',
        attachTo: 0,
        fromPort: 'neck_top',
        toPort: 'neck_bottom',
        fillLevel: 0.3,
      },
      {
        kind: 'condenser',
        attachTo: 1,
        fromPort: 'neck_top',
        toPort: 'neck_bottom',
        widthScale: 0.8,
        heightScale: 0.85,
      },
    ],
  },
  {
    id: 'soxhlet_extraction',
    label: 'Soxhlet extraction',
    summary: 'Soxhlet extractor over RBF with condenser on top',
    pieces: [
      { kind: 'round_bottom_flask', fillLevel: 0.35 },
      {
        kind: 'soxhlet',
        attachTo: 0,
        fromPort: 'neck_top',
        toPort: 'neck_bottom',
        fillLevel: 0.3,
      },
      {
        kind: 'condenser',
        attachTo: 1,
        fromPort: 'neck_top',
        toPort: 'neck_bottom',
        widthScale: 0.85,
        heightScale: 0.8,
      },
    ],
  },
  {
    id: 'column_chromatography',
    label: 'Column chromatography',
    summary: 'Chromatography column with receiving beaker',
    pieces: [
      { kind: 'chromatography_column', fillLevel: 0.55 },
      {
        kind: 'beaker',
        attachTo: 0,
        fromPort: 'stem_bottom',
        toPort: 'rim_top',
        widthScale: 0.8,
        heightScale: 0.8,
        fillLevel: 0.15,
      },
    ],
  },
  {
    id: 'tlc',
    label: 'TLC develop',
    summary: 'TLC chamber with solvent',
    pieces: [{ kind: 'tlc_chamber', fillLevel: 0.15 }],
  },
  {
    id: 'schlenk_line',
    label: 'Schlenk line',
    summary: 'Schlenk flask connected to oil bubbler with vacuum tubing',
    pieces: [
      { kind: 'schlenk_flask', fillLevel: 0.3 },
      {
        kind: 'vacuum_tubing',
        attachTo: 0,
        fromPort: 'sidearm',
        toPort: 'hose_a',
      },
      {
        kind: 'gas_bubbler',
        attachTo: 1,
        fromPort: 'hose_b',
        toPort: 'inlet',
        fillLevel: 0.4,
      },
    ],
  },
  {
    id: 'vacuum_distillation',
    label: 'Vacuum distillation',
    summary: 'Still head, condenser, vacuum adapter, receiver, and vacuum tubing',
    pieces: [
      { kind: 'three_neck_rbf', fillLevel: 0.4 },
      {
        kind: 'distillation_head',
        attachTo: 0,
        fromPort: 'neck_center',
        toPort: 'neck_bottom',
      },
      {
        kind: 'condenser',
        attachTo: 1,
        fromPort: 'takeoff',
        toPort: 'neck_top',
        widthScale: 0.9,
        heightScale: 0.85,
      },
      {
        kind: 'vacuum_adapter',
        attachTo: 2,
        fromPort: 'neck_bottom',
        toPort: 'neck_top',
      },
      {
        kind: 'receiving_flask',
        attachTo: 3,
        fromPort: 'neck_bottom',
        toPort: 'neck_top',
        fillLevel: 0.15,
      },
      {
        kind: 'vacuum_tubing',
        attachTo: 3,
        fromPort: 'sidearm',
        toPort: 'hose_a',
      },
    ],
  },
  {
    id: 'short_path',
    label: 'Short-path distillation',
    summary: 'RBF with bent adapter into receiving flask',
    pieces: [
      { kind: 'round_bottom_flask', fillLevel: 0.4 },
      {
        kind: 'bent_adapter',
        attachTo: 0,
        fromPort: 'neck_top',
        toPort: 'neck_top',
      },
      {
        kind: 'receiving_flask',
        attachTo: 1,
        fromPort: 'takeoff',
        toPort: 'neck_top',
        fillLevel: 0.15,
      },
    ],
  },
  {
    id: 'inert_flask',
    label: 'Inert flask',
    summary: 'RBF capped with drying tube (CaCl₂) and septum',
    pieces: [
      { kind: 'three_neck_rbf', fillLevel: 0.3 },
      {
        kind: 'drying_tube',
        attachTo: 0,
        fromPort: 'neck_center',
        toPort: 'neck_bottom',
      },
      {
        kind: 'septum',
        attachTo: 0,
        fromPort: 'neck_left',
        toPort: 'joint',
      },
      {
        kind: 'stopper',
        attachTo: 0,
        fromPort: 'neck_right',
        toPort: 'joint',
      },
    ],
  },
  {
    id: 'heated_reflux',
    label: 'Heated reflux',
    summary: 'Heating mantle, RBF, condenser, and stir bar',
    pieces: [
      { kind: 'heating_mantle' },
      {
        kind: 'round_bottom_flask',
        attachTo: 0,
        fromPort: 'flask_seat',
        toPort: 'body_bottom',
        fillLevel: 0.4,
      },
      {
        kind: 'condenser',
        attachTo: 1,
        fromPort: 'neck_top',
        toPort: 'neck_bottom',
        widthScale: 0.85,
      },
      { kind: 'stir_bar', dx: 0, dy: 20, widthScale: 0.7, heightScale: 0.7 },
    ],
  },
  {
    id: 'cooled_reaction',
    label: 'Cooled reaction',
    summary: 'Ice bath with round-bottom flask',
    pieces: [
      { kind: 'ice_bath', fillLevel: 0.5 },
      {
        kind: 'round_bottom_flask',
        attachTo: 0,
        fromPort: 'flask_seat',
        toPort: 'body_bottom',
        fillLevel: 0.35,
        widthScale: 0.85,
        heightScale: 0.85,
      },
    ],
  },
  {
    id: 'dry_ice_reaction',
    label: 'Dry-ice reaction',
    summary: 'Dry-ice / acetone bath with RBF',
    pieces: [
      { kind: 'dry_ice_bath', fillLevel: 0.45 },
      {
        kind: 'round_bottom_flask',
        attachTo: 0,
        fromPort: 'flask_seat',
        toPort: 'body_bottom',
        fillLevel: 0.35,
        widthScale: 0.85,
        heightScale: 0.85,
      },
    ],
  },
  {
    id: 'fractional_distillation',
    label: 'Fractional distillation',
    summary: 'Two-neck RBF, Vigreux, still head, condenser, receiver',
    pieces: [
      { kind: 'two_neck_rbf', fillLevel: 0.4 },
      {
        kind: 'vigreux_column',
        attachTo: 0,
        fromPort: 'neck_center',
        toPort: 'neck_bottom',
      },
      {
        kind: 'distillation_head',
        attachTo: 1,
        fromPort: 'neck_top',
        toPort: 'neck_bottom',
        widthScale: 0.9,
        heightScale: 0.85,
      },
      {
        kind: 'condenser',
        attachTo: 2,
        fromPort: 'takeoff',
        toPort: 'neck_top',
        widthScale: 0.9,
        heightScale: 0.85,
      },
      {
        kind: 'receiving_flask',
        attachTo: 3,
        fromPort: 'neck_bottom',
        toPort: 'neck_top',
        fillLevel: 0.15,
      },
    ],
  },
  {
    id: 'vacuum_line',
    label: 'Vacuum line',
    summary: 'Cold trap connected to vacuum pump with tubing',
    pieces: [
      { kind: 'cold_trap' },
      {
        kind: 'vacuum_tubing',
        attachTo: 0,
        fromPort: 'hose_out',
        toPort: 'hose_a',
      },
      {
        kind: 'vacuum_pump',
        attachTo: 1,
        fromPort: 'hose_b',
        toPort: 'inlet',
      },
    ],
  },
  {
    id: 'inert_balloon',
    label: 'Inert balloon',
    summary: 'RBF with gas inlet adapter and N₂/Ar balloon',
    pieces: [
      { kind: 'round_bottom_flask', fillLevel: 0.3 },
      {
        kind: 'gas_inlet_adapter',
        attachTo: 0,
        fromPort: 'neck_top',
        toPort: 'neck_bottom',
      },
      {
        kind: 'balloon',
        attachTo: 1,
        fromPort: 'neck_top',
        toPort: 'neck_bottom',
      },
    ],
  },
  {
    id: 'rotovap',
    label: 'Rotary evaporator',
    summary: 'Rotovap: evaporating flask, bump trap, body/condenser, receiver',
    pieces: [
      { kind: 'rotovap_flask', fillLevel: 0.3 },
      {
        kind: 'rotovap_bump_trap',
        attachTo: 0,
        fromPort: 'neck_top',
        toPort: 'neck_bottom',
      },
      {
        kind: 'rotovap_body',
        attachTo: 1,
        fromPort: 'neck_top',
        toPort: 'vapor_in',
      },
      {
        kind: 'receiving_flask',
        attachTo: 2,
        fromPort: 'condenser_out',
        toPort: 'neck_top',
        fillLevel: 0.2,
      },
    ],
  },
  {
    id: 'clamped_flask',
    label: 'Clamped flask',
    summary: 'Retort stand with three-prong clamp holding an RBF',
    pieces: [
      { kind: 'retort_stand' },
      {
        kind: 'three_prong_clamp',
        attachTo: 0,
        fromPort: 'rod',
        toPort: 'boss',
      },
      {
        kind: 'round_bottom_flask',
        attachTo: 1,
        fromPort: 'grip',
        toPort: 'neck_top',
        fillLevel: 0.35,
        widthScale: 0.9,
        heightScale: 0.9,
      },
    ],
  },
  {
    id: 'aspirator_vacuum',
    label: 'Aspirator vacuum',
    summary: 'Water aspirator with vacuum tubing to a Büchner flask',
    pieces: [
      { kind: 'aspirator' },
      {
        kind: 'vacuum_tubing',
        attachTo: 0,
        fromPort: 'vacuum',
        toPort: 'hose_a',
      },
      {
        kind: 'buchner_flask',
        attachTo: 1,
        fromPort: 'hose_b',
        toPort: 'sidearm',
        fillLevel: 0.2,
      },
    ],
  },
  {
    id: 'inert_gas_cylinder',
    label: 'Inert gas cylinder',
    summary: 'Gas cylinder feeding a balloon / inlet adapter via tubing',
    pieces: [
      { kind: 'gas_cylinder' },
      {
        kind: 'vacuum_tubing',
        attachTo: 0,
        fromPort: 'outlet',
        toPort: 'hose_a',
      },
      {
        kind: 'balloon',
        attachTo: 1,
        fromPort: 'hose_b',
        toPort: 'neck_bottom',
      },
    ],
  },
  {
    id: 'solvent_still',
    label: 'Solvent still',
    summary: 'Distillation still: pot, head, condenser, receiver, drying tube',
    pieces: [
      { kind: 'round_bottom_flask', fillLevel: 0.45 },
      {
        kind: 'distillation_head',
        attachTo: 0,
        fromPort: 'neck_top',
        toPort: 'neck_bottom',
      },
      {
        kind: 'condenser',
        attachTo: 1,
        fromPort: 'takeoff',
        toPort: 'neck_top',
        widthScale: 0.9,
        heightScale: 0.85,
      },
      {
        kind: 'receiving_flask',
        attachTo: 2,
        fromPort: 'neck_bottom',
        toPort: 'neck_top',
        fillLevel: 0.15,
      },
      {
        kind: 'drying_tube',
        attachTo: 1,
        fromPort: 'neck_top',
        toPort: 'neck_bottom',
        widthScale: 0.7,
        heightScale: 0.7,
      },
    ],
  },
  {
    id: 'sep_funnel_stand',
    label: 'Separatory funnel stand',
    summary: 'Retort stand with ring clamp supporting a separatory funnel',
    pieces: [
      { kind: 'retort_stand' },
      {
        kind: 'ring_clamp',
        attachTo: 0,
        fromPort: 'rod',
        toPort: 'boss',
      },
      {
        kind: 'separatory_funnel',
        attachTo: 1,
        fromPort: 'ring',
        toPort: 'neck_top',
        fillLevel: 0.4,
        widthScale: 0.85,
        heightScale: 0.9,
      },
    ],
  },
  {
    id: 'hot_filtration',
    label: 'Hot filtration',
    summary: 'Stemless funnel over a receiving conical flask',
    pieces: [
      { kind: 'conical_flask', fillLevel: 0.15 },
      {
        kind: 'stemless_funnel',
        attachTo: 0,
        fromPort: 'neck_top',
        toPort: 'outlet_bottom',
      },
    ],
  },
  {
    id: 'schlenk_manifold_line',
    label: 'Schlenk manifold line',
    summary: 'Dual manifold with bubbler and Schlenk flask on a port',
    pieces: [
      { kind: 'schlenk_manifold' },
      {
        kind: 'gas_bubbler',
        attachTo: 0,
        fromPort: 'inert_line',
        toPort: 'inlet',
        widthScale: 0.7,
        heightScale: 0.7,
      },
      {
        kind: 'schlenk_flask',
        attachTo: 0,
        fromPort: 'port_b',
        toPort: 'neck_top',
        fillLevel: 0.3,
        widthScale: 0.85,
        heightScale: 0.85,
      },
    ],
  },
  {
    id: 'hydrogenation',
    label: 'Hydrogenation autoclave',
    summary: 'Pressure reactor with H₂ cylinder feed',
    pieces: [
      { kind: 'pressure_reactor', fillLevel: 0.3 },
      {
        kind: 'vacuum_tubing',
        attachTo: 0,
        fromPort: 'gas_inlet',
        toPort: 'hose_a',
      },
      {
        kind: 'gas_cylinder',
        attachTo: 1,
        fromPort: 'hose_b',
        toPort: 'outlet',
        widthScale: 0.85,
        heightScale: 0.85,
      },
    ],
  },
  {
    id: 'flow_setup',
    label: 'Flow chemistry setup',
    summary: 'Syringe pump feeding a flow reactor chip',
    pieces: [
      { kind: 'syringe_pump' },
      {
        kind: 'coolant_tubing',
        attachTo: 0,
        fromPort: 'syringe_tip',
        toPort: 'hose_a',
      },
      {
        kind: 'flow_reactor',
        attachTo: 1,
        fromPort: 'hose_b',
        toPort: 'inlet_a',
      },
    ],
  },
  {
    id: 'glovebox_inert',
    label: 'Glovebox workspace',
    summary: 'Glovebox chamber with Schlenk flask inside',
    pieces: [
      { kind: 'glovebox' },
      {
        kind: 'schlenk_flask',
        attachTo: 0,
        fromPort: 'chamber',
        toPort: 'neck_top',
        fillLevel: 0.3,
        widthScale: 0.55,
        heightScale: 0.55,
      },
    ],
  },
  {
    id: 'photoreactor_setup',
    label: 'Photoreactor setup',
    summary: 'Photoreactor with reaction flask seated under the lamp',
    pieces: [
      { kind: 'photoreactor' },
      {
        kind: 'round_bottom_flask',
        attachTo: 0,
        fromPort: 'vessel_seat',
        toPort: 'neck_top',
        fillLevel: 0.35,
        widthScale: 0.7,
        heightScale: 0.7,
      },
    ],
  },
  {
    id: 'e_chem',
    label: 'Electrochemistry setup',
    summary: 'Electrochemical H-cell ready for electrodes',
    pieces: [{ kind: 'electrochemical_cell', fillLevel: 0.4 }],
  },
  {
    id: 'sublimation',
    label: 'Vacuum sublimation',
    summary: 'Vacuum sublimator on a heating mantle',
    pieces: [
      { kind: 'heating_mantle' },
      {
        kind: 'vacuum_sublimator',
        attachTo: 0,
        fromPort: 'flask_seat',
        toPort: 'pot_bottom',
      },
    ],
  },
  {
    id: 'kugelrohr_distill',
    label: 'Kugelrohr distillation',
    summary: 'Kugelrohr bulb-to-bulb still',
    pieces: [{ kind: 'kugelrohr' }],
  },
  {
    id: 'tube_furnace_line',
    label: 'Tube furnace line',
    summary: 'Tube furnace with quartz process tube',
    pieces: [
      { kind: 'tube_furnace' },
      {
        kind: 'quartz_tube',
        attachTo: 0,
        fromPort: 'tube_left',
        toPort: 'end_a',
        widthScale: 1.05,
        heightScale: 0.75,
      },
    ],
  },
];

export function listGlasswareSetups(): readonly GlasswareSetup[] {
  // Drop setups that reference kinds not yet in the library (future-proof).
  const kinds = new Set<string>(GLASSWARE_SHAPE_KIND_ORDER);
  return SETUPS.filter(s => s.pieces.every(p => kinds.has(p.kind)));
}

export function resolveGlasswareSetup(name: string): GlasswareSetup | null {
  const q = name.trim().toLowerCase().replace(/\s+/g, '_');
  if (!q) return null;
  const setups = listGlasswareSetups();
  return (
    setups.find(s => s.id === q || s.label.toLowerCase() === q.replace(/_/g, ' ')) ??
    setups.find(
      s =>
        s.id.includes(q) ||
        q.includes(s.id) ||
        s.label.toLowerCase().includes(q.replace(/_/g, ' ')),
    ) ??
    null
  );
}
