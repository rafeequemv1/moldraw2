/**
 * Input profile: which kind of pointer is driving the canvas, and the
 * hit-test radii / thresholds that make sense for it.
 *
 * A mouse is precise (≈1 px), a pen tip ≈3 px, a fingertip ≈40 px. Every
 * tool used to pick with mouse-sized world-unit radii, which is why bond
 * drawing on a phone "did not work": the finger simply never landed inside a
 * 12–15 px target. Radii below are screen-motivated; `hitScaleForZoom`
 * keeps them from collapsing when the user zooms out.
 */

export type InputProfile = 'mouse' | 'touch' | 'pen';

export interface HitMetrics {
  /** Generic atom pick (select / label / charge). World units at zoom 1. */
  atomHitRadius: number;
  /** Centre-only attach pick for bond / ring / chain roots and bond ends. */
  atomAttachRadius: number;
  /** Bond shaft pick tolerance. */
  bondHitTolerance: number;
  /** Select-tool atom disk (same size as generic pick so vertices stay grabable). */
  selectAtomRadius: number;
  selectBondTolerance: number;
  /** Soft hover halo (atom / bond glow). */
  hoverAtomRadius: number;
  hoverBondRadius: number;
  /** Client-px movement below which a press counts as a tap, not a drag. */
  clickDragThresholdPx: number;
  /** Fraction of bond length used as bond-end release snap radius. */
  bondReleaseSnapFraction: number;
  /** Multiplier applied to the profile base radii for the current zoom. */
  zoomScale: number;
}

type BaseMetrics = Omit<HitMetrics, 'zoomScale'>;

const MOUSE_BASE: BaseMetrics = {
  atomHitRadius: 15,
  atomAttachRadius: 12,
  bondHitTolerance: 10,
  selectAtomRadius: 15,
  selectBondTolerance: 12,
  hoverAtomRadius: 34,
  hoverBondRadius: 12,
  clickDragThresholdPx: 5,
  bondReleaseSnapFraction: 0.28,
};

const PEN_BASE: BaseMetrics = {
  atomHitRadius: 18,
  atomAttachRadius: 14,
  bondHitTolerance: 12,
  selectAtomRadius: 18,
  selectBondTolerance: 14,
  hoverAtomRadius: 36,
  hoverBondRadius: 14,
  clickDragThresholdPx: 6,
  bondReleaseSnapFraction: 0.32,
};

const TOUCH_BASE: BaseMetrics = {
  atomHitRadius: 30,
  atomAttachRadius: 24,
  bondHitTolerance: 20,
  selectAtomRadius: 30,
  selectBondTolerance: 22,
  hoverAtomRadius: 44,
  hoverBondRadius: 22,
  clickDragThresholdPx: 12,
  bondReleaseSnapFraction: 0.45,
};

const BASE_BY_PROFILE: Record<InputProfile, BaseMetrics> = {
  mouse: MOUSE_BASE,
  pen: PEN_BASE,
  touch: TOUCH_BASE,
};

/** Below this zoom, hit radii stop shrinking on screen. */
const MIN_HIT_ZOOM = 0.35;

/** Map a PointerEvent `pointerType` to a profile (unknown → mouse). */
export const inputProfileOf = (pointerType: string | undefined | null): InputProfile => {
  if (pointerType === 'touch') return 'touch';
  if (pointerType === 'pen') return 'pen';
  return 'mouse';
};

/**
 * World-unit radii are multiplied by this so that, when zoomed out, targets
 * keep a constant on-screen size instead of collapsing. At zoom ≥ 1 the
 * classic world-constant behaviour is preserved (targets grow with zoom).
 */
export const hitScaleForZoom = (zoom: number): number => {
  const z = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  return 1 / Math.min(1, Math.max(MIN_HIT_ZOOM, z));
};

/** Hit metrics for a profile at the given viewport zoom. */
export const hitMetricsFor = (profile: InputProfile, zoom = 1): HitMetrics => {
  const base = BASE_BY_PROFILE[profile];
  const s = hitScaleForZoom(zoom);
  return {
    atomHitRadius: base.atomHitRadius * s,
    atomAttachRadius: base.atomAttachRadius * s,
    bondHitTolerance: base.bondHitTolerance * s,
    selectAtomRadius: base.selectAtomRadius * s,
    selectBondTolerance: base.selectBondTolerance * s,
    hoverAtomRadius: base.hoverAtomRadius * s,
    hoverBondRadius: base.hoverBondRadius * s,
    clickDragThresholdPx: base.clickDragThresholdPx,
    bondReleaseSnapFraction: base.bondReleaseSnapFraction,
    zoomScale: s,
  };
};

/** Mouse metrics at zoom 1 — the historical defaults. */
export const DEFAULT_HIT_METRICS: HitMetrics = hitMetricsFor('mouse', 1);
