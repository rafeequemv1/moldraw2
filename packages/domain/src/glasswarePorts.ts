/**
 * Named joint / hose / cap ports on lab glassware for AI/MCP port-aware placement.
 * Ports use normalized u,v in the unrotated AABB (origin top-left).
 */
import { GLASSWARE_SHAPE_KIND_ORDER, type CanvasShapeKind } from './types';

export type GlasswarePortDir = 'up' | 'down' | 'left' | 'right';
export type GlasswarePortRole = 'joint' | 'hose' | 'cap';

export type GlasswarePort = {
  id: string;
  /** 0–1 along width (left → right). */
  u: number;
  /** 0–1 along height (top → bottom). */
  v: number;
  /** Outward direction of the open end. */
  dir: GlasswarePortDir;
  role: GlasswarePortRole;
};

export type GlasswareBox = { x1: number; y1: number; x2: number; y2: number };

const p = (
  id: string,
  u: number,
  v: number,
  dir: GlasswarePortDir,
  role: GlasswarePortRole = 'joint',
): GlasswarePort => ({ id, u, v, dir, role });

/** Per-kind port tables. Missing kinds get a default neck_top / neck_bottom. */
const PORTS: Partial<Record<CanvasShapeKind, readonly GlasswarePort[]>> = {
  conical_flask: [p('neck_top', 0.5, 0.06, 'up')],
  beaker: [p('rim_top', 0.5, 0.08, 'up')],
  test_tube: [p('mouth_top', 0.5, 0.06, 'up')],
  round_bottom_flask: [
    p('neck_top', 0.5, 0.08, 'up'),
    p('body_bottom', 0.5, 0.94, 'down'),
  ],
  condenser: [
    p('neck_bottom', 0.5, 0.92, 'down'),
    p('neck_top', 0.5, 0.08, 'up'),
    p('hose_in', 0.85, 0.75, 'right', 'hose'),
    p('hose_out', 0.85, 0.25, 'right', 'hose'),
  ],
  allihn_condenser: [
    p('neck_bottom', 0.5, 0.92, 'down'),
    p('neck_top', 0.5, 0.08, 'up'),
    p('hose_in', 0.85, 0.75, 'right', 'hose'),
    p('hose_out', 0.85, 0.25, 'right', 'hose'),
  ],
  dimroth_condenser: [
    p('neck_bottom', 0.5, 0.92, 'down'),
    p('neck_top', 0.5, 0.08, 'up'),
    p('hose_in', 0.85, 0.75, 'right', 'hose'),
    p('hose_out', 0.85, 0.25, 'right', 'hose'),
  ],
  separatory_funnel: [p('neck_top', 0.5, 0.06, 'up'), p('stem_bottom', 0.5, 0.94, 'down')],
  filter_funnel: [p('rim_top', 0.5, 0.1, 'up'), p('stem_bottom', 0.5, 0.92, 'down')],
  dropping_funnel: [
    p('neck_top', 0.5, 0.06, 'up'),
    p('stem_bottom', 0.5, 0.94, 'down'),
    p('sidearm', 0.92, 0.35, 'right', 'hose'),
  ],
  three_neck_rbf: [
    p('neck_center', 0.5, 0.08, 'up'),
    // Match angled side-neck tips in drawThreeNeckRbfInBox
    p('neck_left', 0.17, 0.34, 'up'),
    p('neck_right', 0.83, 0.34, 'up'),
    p('body_bottom', 0.5, 0.94, 'down'),
  ],
  buchner_flask: [p('neck_top', 0.5, 0.08, 'up'), p('sidearm', 0.92, 0.4, 'right', 'hose')],
  claisen_adapter: [
    p('neck_bottom', 0.5, 0.9, 'down'),
    p('neck_top', 0.35, 0.1, 'up'),
    p('neck_side', 0.78, 0.35, 'up'),
  ],
  distillation_head: [
    p('neck_bottom', 0.25, 0.88, 'down'),
    p('neck_top', 0.25, 0.12, 'up'),
    p('takeoff', 0.88, 0.45, 'right'),
  ],
  receiving_flask: [p('neck_top', 0.5, 0.1, 'up')],
  dean_stark_trap: [
    p('neck_bottom', 0.35, 0.92, 'down'),
    p('neck_top', 0.35, 0.08, 'up'),
    p('side_return', 0.75, 0.55, 'left'),
  ],
  graduated_cylinder: [p('rim_top', 0.5, 0.06, 'up')],
  volumetric_flask: [p('neck_top', 0.5, 0.06, 'up')],
  chromatography_column: [p('top', 0.5, 0.06, 'up'), p('stem_bottom', 0.5, 0.94, 'down')],
  tlc_chamber: [p('lid_top', 0.5, 0.08, 'up')],
  soxhlet: [p('neck_bottom', 0.5, 0.92, 'down'), p('neck_top', 0.5, 0.08, 'up')],
  hirsch_funnel: [p('rim_top', 0.5, 0.1, 'up'), p('stem_bottom', 0.5, 0.92, 'down')],
  schlenk_flask: [p('neck_top', 0.5, 0.08, 'up'), p('sidearm', 0.9, 0.42, 'right', 'hose')],
  gas_bubbler: [p('inlet', 0.2, 0.15, 'up', 'hose'), p('outlet', 0.8, 0.15, 'up', 'hose')],
  thermometer_adapter: [p('neck_bottom', 0.5, 0.9, 'down'), p('stem_top', 0.5, 0.08, 'up')],
  straight_adapter: [p('neck_top', 0.5, 0.08, 'up'), p('neck_bottom', 0.5, 0.92, 'down')],
  vacuum_adapter: [
    p('neck_top', 0.45, 0.1, 'up'),
    p('neck_bottom', 0.45, 0.9, 'down'),
    p('sidearm', 0.92, 0.45, 'right', 'hose'),
  ],
  bent_adapter: [p('neck_top', 0.28, 0.1, 'up'), p('takeoff', 0.92, 0.7, 'right')],
  vacuum_tubing: [p('hose_a', 0.06, 0.5, 'left', 'hose'), p('hose_b', 0.94, 0.5, 'right', 'hose')],
  coolant_tubing: [p('hose_a', 0.2, 0.15, 'up', 'hose'), p('hose_b', 0.8, 0.15, 'up', 'hose')],
  // Joint near the taper tip so stoppers/septa seat on flask necks
  stopper: [p('joint', 0.5, 0.92, 'down', 'cap')],
  septum: [p('joint', 0.5, 0.92, 'down', 'cap')],
  keck_clip: [p('joint', 0.5, 0.5, 'down', 'cap')],
  buchner_funnel: [p('rim_top', 0.5, 0.1, 'up'), p('stem_bottom', 0.5, 0.92, 'down')],
  sintered_funnel: [p('rim_top', 0.5, 0.1, 'up'), p('stem_bottom', 0.5, 0.92, 'down')],
  syringe: [p('needle', 0.5, 0.94, 'down'), p('plunger_top', 0.5, 0.06, 'up')],
  cannula: [p('tip_a', 0.06, 0.5, 'left'), p('tip_b', 0.94, 0.5, 'right')],
  nmr_tube: [p('cap_top', 0.5, 0.04, 'up')],
  drying_tube: [p('neck_bottom', 0.5, 0.92, 'down'), p('vent_top', 0.5, 0.1, 'up')],
  heating_mantle: [p('flask_seat', 0.5, 0.2, 'up')],
  oil_bath: [p('flask_seat', 0.5, 0.25, 'up')],
  ice_bath: [p('flask_seat', 0.5, 0.25, 'up')],
  dry_ice_bath: [p('flask_seat', 0.5, 0.25, 'up')],
  chiller: [
    p('hose_in', 0.15, 0.35, 'left', 'hose'),
    p('hose_out', 0.85, 0.35, 'right', 'hose'),
  ],
  lab_jack: [p('platform_top', 0.5, 0.15, 'up')],
  retort_stand: [p('rod', 0.55, 0.35, 'right'), p('base', 0.5, 0.92, 'down')],
  three_prong_clamp: [p('grip', 0.75, 0.5, 'right'), p('boss', 0.15, 0.5, 'left')],
  stir_bar: [p('center', 0.5, 0.5, 'down')],
  pasteur_pipette: [p('tip', 0.5, 0.94, 'down'), p('bulb_top', 0.5, 0.06, 'up')],
  spatula: [p('blade', 0.9, 0.5, 'right'), p('handle', 0.1, 0.5, 'left')],
  powder_funnel: [p('rim_top', 0.5, 0.1, 'up'), p('stem_bottom', 0.5, 0.92, 'down')],
  two_neck_rbf: [
    p('neck_center', 0.5, 0.08, 'up'),
    p('neck_side', 0.78, 0.22, 'up'),
    p('body_bottom', 0.5, 0.94, 'down'),
  ],
  vigreux_column: [p('neck_top', 0.5, 0.06, 'up'), p('neck_bottom', 0.5, 0.94, 'down')],
  cow_receiver: [
    p('inlet', 0.5, 0.1, 'up'),
    p('outlet_a', 0.2, 0.85, 'down'),
    p('outlet_b', 0.5, 0.9, 'down'),
    p('outlet_c', 0.8, 0.85, 'down'),
  ],
  cold_finger: [p('neck_bottom', 0.5, 0.92, 'down'), p('coolant_top', 0.5, 0.08, 'up')],
  cold_trap: [
    p('hose_in', 0.2, 0.15, 'up', 'hose'),
    p('hose_out', 0.8, 0.15, 'up', 'hose'),
    p('body_bottom', 0.5, 0.92, 'down'),
  ],
  vacuum_pump: [p('inlet', 0.2, 0.4, 'left', 'hose')],
  gas_inlet_adapter: [
    p('neck_bottom', 0.5, 0.9, 'down'),
    p('neck_top', 0.5, 0.12, 'up'),
    p('hose', 0.85, 0.4, 'right', 'hose'),
  ],
  balloon: [p('neck_bottom', 0.5, 0.88, 'down')],
  reducing_adapter: [p('neck_top', 0.5, 0.08, 'up'), p('neck_bottom', 0.5, 0.92, 'down')],
  rotovap_bump_trap: [
    p('neck_top', 0.5, 0.08, 'up'),
    p('neck_bottom', 0.5, 0.9, 'down'),
  ],
  rotovap_flask: [p('neck_top', 0.5, 0.1, 'up'), p('body_bottom', 0.5, 0.92, 'down')],
  hotplate_stirrer: [p('platform_top', 0.5, 0.2, 'up')],
  dewar_flask: [p('mouth_top', 0.5, 0.08, 'up'), p('body_bottom', 0.5, 0.94, 'down')],
  thermometer: [p('bulb_bottom', 0.5, 0.94, 'down'), p('stem_top', 0.5, 0.06, 'up')],
  watch_glass: [p('center', 0.5, 0.55, 'up')],
  burette: [p('top', 0.5, 0.06, 'up'), p('tip_bottom', 0.5, 0.94, 'down')],
  evaporating_dish: [p('rim_top', 0.5, 0.25, 'up')],
  filter_adapter: [p('funnel_seat', 0.5, 0.15, 'up'), p('flask_seat', 0.5, 0.85, 'down')],
  pressure_tube: [p('cap_top', 0.5, 0.08, 'up'), p('body_bottom', 0.5, 0.94, 'down')],
  desiccator: [p('lid_top', 0.5, 0.1, 'up')],
  pear_shaped_flask: [p('neck_top', 0.5, 0.08, 'up'), p('body_bottom', 0.5, 0.94, 'down')],
  bunsen_burner: [p('flame_top', 0.5, 0.08, 'up'), p('base', 0.5, 0.94, 'down')],
  alcohol_lamp: [p('flame_top', 0.5, 0.1, 'up'), p('base', 0.5, 0.92, 'down')],
  sand_bath: [p('flask_seat', 0.5, 0.25, 'up')],
  steam_bath: [p('flask_seat', 0.5, 0.22, 'up')],
  water_bath: [p('flask_seat', 0.5, 0.25, 'up')],
  heat_gun: [p('nozzle', 0.92, 0.45, 'right')],
  heating_block: [p('well_top', 0.5, 0.2, 'up'), p('platform_top', 0.5, 0.2, 'up')],
  overhead_stirrer: [p('paddle_bottom', 0.5, 0.92, 'down'), p('motor_top', 0.5, 0.08, 'up')],
  four_neck_rbf: [
    p('neck_center', 0.5, 0.06, 'up'),
    p('neck_left', 0.14, 0.32, 'up'),
    p('neck_right', 0.86, 0.32, 'up'),
    p('neck_rear', 0.5, 0.22, 'up'),
    p('body_bottom', 0.5, 0.94, 'down'),
  ],
  rotovap_body: [
    p('vapor_in', 0.12, 0.55, 'left'),
    p('condenser_out', 0.88, 0.72, 'down'),
    p('coolant_in', 0.72, 0.2, 'up', 'hose'),
    p('coolant_out', 0.88, 0.35, 'right', 'hose'),
  ],
  aspirator: [
    p('water_in', 0.5, 0.08, 'up', 'hose'),
    p('water_out', 0.5, 0.92, 'down', 'hose'),
    p('vacuum', 0.92, 0.45, 'right', 'hose'),
  ],
  vacuum_gauge: [p('hose', 0.5, 0.92, 'down', 'hose')],
  gas_cylinder: [p('outlet', 0.85, 0.28, 'right', 'hose'), p('base', 0.5, 0.94, 'down')],
  fume_hood: [p('workspace', 0.5, 0.7, 'up'), p('sash_top', 0.5, 0.25, 'up')],
  weighing_boat: [p('center', 0.5, 0.55, 'up')],
  forceps: [p('tips', 0.92, 0.5, 'right'), p('handles', 0.08, 0.5, 'left')],
  mortar_pestle: [p('bowl', 0.4, 0.55, 'up')],
  crystallizing_dish: [p('rim_top', 0.5, 0.28, 'up')],
  petri_dish: [p('lid_top', 0.5, 0.2, 'up')],
  hickman_head: [
    p('neck_bottom', 0.5, 0.92, 'down'),
    p('well', 0.78, 0.55, 'down'),
    p('neck_top', 0.5, 0.08, 'up'),
  ],
  jacketed_reactor: [
    p('neck_top', 0.5, 0.08, 'up'),
    p('coolant_in', 0.12, 0.35, 'left', 'hose'),
    p('coolant_out', 0.12, 0.7, 'left', 'hose'),
    p('body_bottom', 0.5, 0.94, 'down'),
  ],
  schlenk_tube: [
    p('neck_top', 0.5, 0.06, 'up'),
    p('sidearm', 0.9, 0.28, 'right', 'hose'),
    p('body_bottom', 0.5, 0.94, 'down'),
  ],
  gas_dispersion_tube: [
    p('hose_top', 0.5, 0.06, 'up', 'hose'),
    p('frit_bottom', 0.5, 0.92, 'down'),
  ],
  ring_clamp: [p('ring', 0.55, 0.55, 'up'), p('boss', 0.12, 0.5, 'left')],
  analytical_balance: [p('pan', 0.5, 0.45, 'up')],
  stemless_funnel: [p('rim_top', 0.5, 0.12, 'up'), p('outlet_bottom', 0.5, 0.88, 'down')],
  metal_joint_clip: [p('joint', 0.5, 0.5, 'down', 'cap')],
  glovebox: [
    p('chamber', 0.38, 0.55, 'up'),
    p('antechamber', 0.82, 0.55, 'up'),
    p('gas_port', 0.12, 0.35, 'left', 'hose'),
  ],
  schlenk_manifold: [
    p('vacuum_line', 0.2, 0.35, 'up', 'hose'),
    p('inert_line', 0.2, 0.65, 'up', 'hose'),
    p('port_a', 0.45, 0.85, 'down'),
    p('port_b', 0.65, 0.85, 'down'),
    p('port_c', 0.85, 0.85, 'down'),
  ],
  filter_cannula: [p('tip_a', 0.06, 0.5, 'left'), p('tip_b', 0.94, 0.5, 'right')],
  transfer_needle: [p('tip_a', 0.06, 0.5, 'left'), p('tip_b', 0.94, 0.5, 'right')],
  pressure_reactor: [
    p('lid_top', 0.5, 0.08, 'up'),
    p('gas_inlet', 0.85, 0.25, 'right', 'hose'),
    p('body_bottom', 0.5, 0.94, 'down'),
  ],
  microwave_reactor: [p('cavity', 0.5, 0.45, 'up'), p('door', 0.5, 0.2, 'up')],
  syringe_pump: [p('syringe_tip', 0.92, 0.45, 'right'), p('drive', 0.15, 0.5, 'left')],
  flow_reactor: [
    p('inlet_a', 0.08, 0.35, 'left', 'hose'),
    p('inlet_b', 0.08, 0.65, 'left', 'hose'),
    p('outlet', 0.92, 0.5, 'right', 'hose'),
  ],
  flash_system: [
    p('column_top', 0.4, 0.08, 'up'),
    p('collector', 0.75, 0.85, 'down'),
    p('inlet', 0.4, 0.2, 'up', 'hose'),
  ],
  lyophilizer: [
    p('chamber', 0.35, 0.45, 'up'),
    p('vacuum', 0.85, 0.35, 'right', 'hose'),
    p('shelf', 0.35, 0.55, 'up'),
  ],
  centrifuge: [p('rotor', 0.5, 0.4, 'up'), p('lid', 0.5, 0.15, 'up')],
  photoreactor: [
    p('vessel_seat', 0.5, 0.55, 'up'),
    p('lamp_top', 0.5, 0.08, 'up'),
  ],
  electrochemical_cell: [
    p('anode', 0.25, 0.15, 'up'),
    p('cathode', 0.75, 0.15, 'up'),
    p('body_bottom', 0.5, 0.92, 'down'),
  ],
  vacuum_sublimator: [
    p('cold_finger', 0.5, 0.08, 'up'),
    p('vacuum', 0.85, 0.35, 'right', 'hose'),
    p('pot_bottom', 0.5, 0.92, 'down'),
  ],
  kugelrohr: [
    p('bulb_a', 0.2, 0.5, 'left'),
    p('bulb_b', 0.8, 0.5, 'right'),
    p('joint', 0.5, 0.35, 'up'),
  ],
  solvent_purification_system: [
    p('column_a', 0.25, 0.1, 'up'),
    p('column_b', 0.5, 0.1, 'up'),
    p('column_c', 0.75, 0.1, 'up'),
    p('outlet', 0.5, 0.92, 'down', 'hose'),
  ],
  tube_furnace: [
    p('tube_left', 0.08, 0.5, 'left'),
    p('tube_right', 0.92, 0.5, 'right'),
    p('center', 0.5, 0.5, 'up'),
  ],
  muffle_furnace: [p('chamber', 0.5, 0.45, 'up'), p('door', 0.5, 0.25, 'up')],
  quartz_tube: [p('end_a', 0.06, 0.5, 'left'), p('end_b', 0.94, 0.5, 'right')],
  quartz_boat: [p('seat', 0.5, 0.45, 'up')],
  crucible: [p('rim_top', 0.5, 0.2, 'up'), p('body_bottom', 0.5, 0.92, 'down')],
  tongs: [p('tips', 0.9, 0.5, 'right'), p('handles', 0.1, 0.5, 'left')],
  young_stopcock: [p('joint', 0.5, 0.85, 'down', 'cap'), p('stem_top', 0.5, 0.1, 'up')],
  spin_coater: [p('chuck', 0.5, 0.35, 'up'), p('base', 0.5, 0.9, 'down')],
  biosafety_cabinet: [p('workspace', 0.5, 0.7, 'up'), p('sash', 0.5, 0.3, 'up')],
  incubator_shaker: [p('platform', 0.5, 0.45, 'up'), p('door', 0.5, 0.15, 'up')],
};

const DEFAULT_PORTS: readonly GlasswarePort[] = [
  p('neck_top', 0.5, 0.08, 'up'),
  p('neck_bottom', 0.5, 0.92, 'down'),
];

export function listGlasswarePorts(kind: CanvasShapeKind): readonly GlasswarePort[] {
  return PORTS[kind] ?? DEFAULT_PORTS;
}

export function getGlasswarePort(
  kind: CanvasShapeKind,
  portId: string,
): GlasswarePort | null {
  const q = portId.trim().toLowerCase();
  const ports = listGlasswarePorts(kind);
  return ports.find(pt => pt.id === q) ?? null;
}

/** Compact port descriptors for list_glassware / MCP. */
export function listGlasswarePortSummaries(
  kind: CanvasShapeKind,
): readonly { id: string; role: GlasswarePortRole; dir: GlasswarePortDir }[] {
  return listGlasswarePorts(kind).map(({ id, role, dir }) => ({ id, role, dir }));
}

export function portsCompatible(a: GlasswarePort, b: GlasswarePort): boolean {
  if (a.role === 'hose' || b.role === 'hose') {
    return a.role === 'hose' && b.role === 'hose';
  }
  if (a.role === 'cap' || b.role === 'cap') {
    // Cap mates with a joint (or another open port that is not hose).
    const other = a.role === 'cap' ? b : a;
    return other.role === 'joint';
  }
  return a.role === 'joint' && b.role === 'joint';
}

export function portCompatibilityError(a: GlasswarePort, b: GlasswarePort): string | null {
  if (portsCompatible(a, b)) return null;
  return `Incompatible ports: ${a.id} (${a.role}) cannot connect to ${b.id} (${b.role}). Use joint↔joint, hose↔hose, or cap↔joint.`;
}

export function portWorldPoint(
  box: GlasswareBox,
  port: GlasswarePort,
  rotationRad = 0,
): { x: number; y: number } {
  const w = Math.max(box.x2 - box.x1, 1e-6);
  const h = Math.max(box.y2 - box.y1, 1e-6);
  const cx = (box.x1 + box.x2) / 2;
  const cy = (box.y1 + box.y2) / 2;
  const lx = box.x1 + port.u * w - cx;
  const ly = box.y1 + port.v * h - cy;
  if (Math.abs(rotationRad) < 1e-9) {
    return { x: cx + lx, y: cy + ly };
  }
  const c = Math.cos(rotationRad);
  const s = Math.sin(rotationRad);
  return { x: cx + lx * c - ly * s, y: cy + lx * s + ly * c };
}

/**
 * Place a new piece so `newPort` coincides with `anchorPort`.
 * Returns the center (cx, cy) of the new AABB.
 */
export function alignPorts(
  anchorBox: GlasswareBox,
  anchorPort: GlasswarePort,
  newW: number,
  newH: number,
  newPort: GlasswarePort,
): { cx: number; cy: number } {
  const anchorPt = portWorldPoint(anchorBox, anchorPort);
  // Local offset of newPort from the new piece center
  const localX = (newPort.u - 0.5) * newW;
  const localY = (newPort.v - 0.5) * newH;
  return {
    cx: anchorPt.x - localX,
    cy: anchorPt.y - localY,
  };
}

/** Ensure every catalog glassware kind has at least default ports (dev sanity). */
export function assertAllGlasswareHavePorts(): string[] {
  const missing: string[] = [];
  for (const kind of GLASSWARE_SHAPE_KIND_ORDER) {
    if (!PORTS[kind]?.length) missing.push(kind);
  }
  return missing;
}
