/**
 * Compute the zig-zag world-space points of a chain that runs from
 * `startPos` toward `currentPos`. Used by both the chain-tool ghost render
 * and the chain-add commit handler.
 *
 * ChemDraw-style: the chain axis follows the drag direction (any angle).
 * Segments alternate ±30° around that axis → 120° interior C–C–C angles.
 * `preferredFirstBondAngle` only picks the initial zigzag side when extending
 * from an existing atom — it never locks the chain to a fixed bearing.
 */
import type { Point } from './polygons';

/** Half of the zigzag amplitude: ±30° from the drag axis → 120° bond angles. */
const ZIGZAG_TURN = Math.PI / 6;

const snapDir = (rad: number, stepRad: number): number =>
  stepRad > 1e-9 ? Math.round(rad / stepRad) * stepRad : rad;

const absAngleDiff = (a: number, b: number): number => {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return Math.abs(d);
};

/**
 * Zig-zag chain along the drag bearing.
 * @param preferredFirstBondAngle optional hint for which zigzag side to start on
 *   when attaching to an existing atom (does not override drag direction).
 */
export const getChainPoints = (
  startPos: Point,
  currentPos: Point,
  bondLengthPx = 40,
  preferredFirstBondAngle?: number,
  angleSnapRad = Math.PI / 6,
): Point[] => {
  const BOND_LENGTH = bondLengthPx;
  const dx = currentPos.x - startPos.x;
  const dy = currentPos.y - startPos.y;
  const dist = Math.hypot(dx, dy);

  if (dist < 20) return [startPos];

  // Primary axis = drag direction (optionally soft-snapped). Never lock to a
  // fixed preferred angle — that made chains feel stuck in one direction.
  const dragAngle = Math.atan2(dy, dx);
  const axis = snapDir(dragAngle, angleSnapRad);

  const effectiveLen = BOND_LENGTH * Math.cos(ZIGZAG_TURN);
  const numBonds = Math.max(1, Math.round(dist / effectiveLen));

  // Pick zigzag side: prefer the side closer to preferredFirstBondAngle when
  // extending from an atom; otherwise start with +turn.
  let sign = 1;
  if (preferredFirstBondAngle !== undefined) {
    const plus = axis + ZIGZAG_TURN;
    const minus = axis - ZIGZAG_TURN;
    const towardPreferred = preferredFirstBondAngle;
    sign =
      absAngleDiff(plus, towardPreferred) <= absAngleDiff(minus, towardPreferred) ? 1 : -1;
  }

  const points: Point[] = [startPos];
  let currentPt = startPos;
  for (let i = 0; i < numBonds; i++) {
    const theta = axis + sign * ZIGZAG_TURN;
    const nextX = currentPt.x + BOND_LENGTH * Math.cos(theta);
    const nextY = currentPt.y + BOND_LENGTH * Math.sin(theta);
    points.push({ x: nextX, y: nextY });
    currentPt = { x: nextX, y: nextY };
    sign *= -1;
  }
  return points;
};
