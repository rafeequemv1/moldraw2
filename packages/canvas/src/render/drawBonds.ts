/**
 * All bond strokes: single, double, triple, stereo (wedge, dash, wavy),
 * and dative/coordination bonds. Double bonds offset uses `% of bond length`.
 * Adjacent solid wedges merge into a continuous thick ribbon (chair front-edge).
 *
 * Complete aromatic rings (Aromatize / aromatic SMILES) draw a solid inner
 * circle; isolated aromatic bonds keep a solid + dashed inner companion.
 *
 * Under Structure Perspective, ring double (inner) lines are offset in the ring
 * plane then projected — a pure screen-perpendicular offset lifts off-plane when
 * the pose rotates.
 */
import type { PerspectivePose } from '@moldraw/domain';
import {
  bondEndPoints,
  bondStrokeColor,
  collectAromaticCircles,
  type AromaticCircle,
  type BondTrimContext,
} from '../geometry';
import type { RenderContext } from './types';
import { collectWedgeChains, drawContinuousWedgeRibbon } from './drawWedgeChains';

/**
 * Screen-space offset for a ring double's inner stroke, lying in the 3D ring
 * plane (orthographic: use x/y of the in-plane vector toward the ring centroid).
 */
const ringPlaneScreenOffset = (
  pose: PerspectivePose,
  fromId: string,
  toId: string,
  ringAtomIds: readonly string[],
  offsetPx: number,
): { nx: number; ny: number } | null => {
  const pa = pose.positions[fromId];
  const pb = pose.positions[toId];
  if (!pa || !pb) return null;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  let n = 0;
  for (const id of ringAtomIds) {
    const p = pose.positions[id];
    if (!p) continue;
    cx += p.x;
    cy += p.y;
    cz += p.z;
    n += 1;
  }
  if (n < 3) return null;
  cx /= n;
  cy /= n;
  cz /= n;
  const mx = (pa.x + pb.x) / 2;
  const my = (pa.y + pb.y) / 2;
  const mz = (pa.z + pb.z) / 2;
  const bx = pb.x - pa.x;
  const by = pb.y - pa.y;
  const bz = pb.z - pa.z;
  const b2 = bx * bx + by * by + bz * bz;
  if (b2 < 1e-12) return null;
  let vx = cx - mx;
  let vy = cy - my;
  let vz = cz - mz;
  const along = (vx * bx + vy * by + vz * bz) / b2;
  vx -= along * bx;
  vy -= along * by;
  vz -= along * bz;
  // Edge-on rings: in-plane offset is mostly along z → collapse inner to outer.
  const screenLen = Math.hypot(vx, vy);
  if (screenLen < 1e-4) return { nx: 0, ny: 0 };
  return { nx: (vx / screenLen) * offsetPx, ny: (vy / screenLen) * offsetPx };
};

/** Flip a double-bond offset toward adjacent heavy atoms (chain “inside”). */
const alignOffsetTowardNeighbors = (
  mol: { bonds: readonly { fromAtomId: string; toAtomId: string }[] },
  atomById: Map<string, { id: string; x: number; y: number; element: string }>,
  from: { id: string; x: number; y: number },
  to: { id: string; x: number; y: number },
  nx: number,
  ny: number,
): { nx: number; ny: number } => {
  let sx = 0;
  let sy = 0;
  for (const atom of [from, to]) {
    const otherId = atom.id === from.id ? to.id : from.id;
    for (const b of mol.bonds) {
      const nid =
        b.fromAtomId === atom.id ? b.toAtomId : b.toAtomId === atom.id ? b.fromAtomId : null;
      if (!nid || nid === otherId) continue;
      const nb = atomById.get(nid);
      if (!nb || nb.element === 'H') continue;
      sx += nb.x - atom.x;
      sy += nb.y - atom.y;
    }
  }
  if (sx * sx + sy * sy < 1e-8) return { nx, ny };
  if (nx * sx + ny * sy < 0) return { nx: -nx, ny: -ny };
  return { nx, ny };
};

type BondEnds = { ax: number; ay: number; bx: number; by: number };

const drawDashedCompanion = (
  ctx: CanvasRenderingContext2D,
  T: BondEnds,
  nx: number,
  ny: number,
  ux: number,
  uy: number,
  inset: number,
  dash: number[],
): void => {
  ctx.save();
  ctx.lineCap = 'butt';
  ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(T.ax + nx + ux * inset, T.ay + ny + uy * inset);
  ctx.lineTo(T.bx + nx - ux * inset, T.by + ny - uy * inset);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
};

const drawQueryAnyBond = (
  ctx: CanvasRenderingContext2D,
  T: BondEnds,
  dx: number,
  dy: number,
  len: number,
  thickness: number,
): void => {
  ctx.lineWidth = thickness;
  ctx.setLineDash([3.2, 2.4]);
  ctx.beginPath();
  ctx.moveTo(T.ax, T.ay);
  ctx.lineTo(T.bx, T.by);
  ctx.stroke();
  ctx.setLineDash([]);
  const mx = (T.ax + T.bx) / 2;
  const my = (T.ay + T.by) / 2;
  const nx = -dy / len;
  const ny = dx / len;
  const tick = Math.max(3.2, thickness * 2.4);
  ctx.lineWidth = Math.max(1.1, thickness);
  ctx.beginPath();
  ctx.moveTo(mx + nx * tick, my + ny * tick);
  ctx.lineTo(mx - nx * tick, my - ny * tick);
  ctx.stroke();
};

const drawEitherStereo = (
  ctx: CanvasRenderingContext2D,
  T: BondEnds,
  dx: number,
  dy: number,
  len: number,
  width: number,
  color: string,
): void => {
  const perpX = -dy / len;
  const perpY = dx / len;
  const endGap = 4;
  const tx = T.bx - (dx / len) * endGap;
  const ty = T.by - (dy / len) * endGap;
  const w = width / 2;
  ctx.beginPath();
  ctx.moveTo(T.ax, T.ay);
  ctx.lineTo(tx + perpX * w, ty + perpY * w);
  ctx.lineTo(tx, ty);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  const numDashes = Math.max(4, Math.min(12, Math.round(len / 4.5)));
  ctx.lineWidth = Math.max(1.1, width * 0.12);
  ctx.beginPath();
  for (let i = 1; i <= numDashes; i++) {
    const t = i / (numDashes + 0.5);
    const px = T.ax + dx * t;
    const py = T.ay + dy * t;
    const hw = t * w;
    ctx.moveTo(px, py);
    ctx.lineTo(px - perpX * hw, py - perpY * hw);
  }
  ctx.stroke();
};

const drawCisTransDouble = (
  ctx: CanvasRenderingContext2D,
  T: BondEnds,
  dx: number,
  dy: number,
  len: number,
  offset: number,
  thickness: number,
): void => {
  const nx = (-dy / len) * offset;
  const ny = (dx / len) * offset;
  const mx = (T.ax + T.bx) / 2;
  const my = (T.ay + T.by) / 2;
  ctx.lineWidth = thickness;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(T.ax + nx, T.ay + ny);
  ctx.lineTo(mx - nx, my - ny);
  ctx.lineTo(T.bx + nx, T.by + ny);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(T.ax - nx, T.ay - ny);
  ctx.lineTo(mx + nx, my + ny);
  ctx.lineTo(T.bx - nx, T.by - ny);
  ctx.stroke();
};

/**
 * Kekulé-style aromatic circle: continuous stroke, never dashed.
 * `setLineDash([])` is required so fragment-placement ghosts (which wrap
 * `drawBonds` in a dashed dash) cannot leak a dashed circle.
 */
const drawAromaticCircles = (
  ctx: CanvasRenderingContext2D,
  R: RenderContext,
  circles: AromaticCircle[],
  thickness: number,
): void => {
  if (circles.length === 0) return;
  const visibleAtoms = R.visibleAtomIds;
  const ink = R.structureTheme.ink;
  ctx.save();
  // Continuous stroke: empty dash (SVG omits stroke-dasharray).
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';
  ctx.lineWidth = thickness;
  for (const ring of circles) {
    if (visibleAtoms && !ring.atomIds.some(id => visibleAtoms.has(id))) continue;
    let opacity = 1;
    for (const id of ring.atomIds) {
      const op = R.atomOpacityById?.get(id) ?? 1;
      if (op < opacity) opacity = op;
    }
    ctx.globalAlpha = opacity;
    ctx.strokeStyle = ink;
    ctx.beginPath();
    ctx.arc(ring.center.x, ring.center.y, ring.radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
};

export const drawBonds = (ctx: CanvasRenderingContext2D, R: RenderContext): void => {
  const P = R.displayPrefs;
  const mol = R.renderedMolecule;
  const atomById = R.atomById;
  const visibleBondIds = R.visibleBondIds;

  const bondTrimCtx: BondTrimContext = {
    ctx,
    displayPrefs: P,
    labelRadForAtom: (atomId: string) =>
      R.selectedAtomIds.includes(atomId) && Math.abs(R.labelCounterRad) > 1e-5
        ? R.labelCounterRad
        : 0,
    condensedGroupLabels: R.condensedGroupLabels,
    molecule: mol,
    valencyMap: R.valencyMap,
  };

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const spacingFrac = P.bondSpacingFraction;
  const pose = mol.perspective3D;
  const depthWedges = pose?.depthWedges === true;

  // z-span for depth taper: normal width toward viewer, pointier farther away.
  let poseZMin = 0;
  let poseZSpan = 0;
  if (pose && depthWedges) {
    let zMin = Infinity;
    let zMax = -Infinity;
    for (const p of Object.values(pose.positions)) {
      if (p.z < zMin) zMin = p.z;
      if (p.z > zMax) zMax = p.z;
    }
    poseZMin = zMin;
    poseZSpan = Math.max(zMax - zMin, 1e-6);
  }
  /** Nearness 0 (far / away) → 1 (toward viewer). */
  const nearness = (z: number) => (z - poseZMin) / poseZSpan;

  const bondOpacityOf = (
    bond: (typeof mol.bonds)[number],
    from: { id: string },
    to: { id: string },
  ) => {
    const opFrom = R.atomOpacityById?.get(from.id) ?? 1;
    const opTo = R.atomOpacityById?.get(to.id) ?? 1;
    const bondOwn = bond.opacity != null ? Math.max(0, Math.min(1, bond.opacity)) : null;
    return bondOwn != null
      ? bondOwn
      : opFrom < 1 - 1e-6 && opTo < 1 - 1e-6
        ? Math.min(opFrom, opTo)
        : 1;
  };

  // Merge head-to-tail solid wedges into one ribbon (chair front edge).
  // Wedges that only share a common start atom stay separate triangles.
  const { chains: wedgeChains, chainedBondIds } = collectWedgeChains(mol.bonds, atomById, {
    visibleBondIds,
    colorFor: (bond, from, to) =>
      bondStrokeColor(bond, from, to, {
        applyAtomColorsToBonds: R.applyAtomColorsToBonds,
        defaultInk: R.structureTheme.ink,
      }),
    opacityFor: bondOpacityOf,
  });
  const halfW = Math.max(P.bondThicknessPx, P.stereoWedgeWidthPx * 0.5);
  for (const chain of wedgeChains) {
    const pts = chain.atomIds
      .map(id => atomById.get(id))
      .filter((a): a is NonNullable<typeof a> => Boolean(a))
      .map(a => ({ x: a.x, y: a.y }));
    if (pts.length >= 2) {
      drawContinuousWedgeRibbon(ctx, pts, halfW, chain.color, chain.opacity);
    }
  }

  const { circles: aromaticCircles, bondIds: aromaticCircleBondIds } = collectAromaticCircles(
    mol,
    atomById,
    R.ringAtomIdsByBondId ?? new Map(),
  );

  // Painter's algorithm: far bonds first when a 3D pose is active.
  const bondsSorted = pose
    ? [...mol.bonds].sort((a, b) => {
        const za =
          ((pose.positions[a.fromAtomId]?.z ?? 0) + (pose.positions[a.toAtomId]?.z ?? 0)) / 2;
        const zb =
          ((pose.positions[b.fromAtomId]?.z ?? 0) + (pose.positions[b.toAtomId]?.z ?? 0)) / 2;
        return za - zb;
      })
    : mol.bonds;

  bondsSorted.forEach(bond => {
    if (visibleBondIds && !visibleBondIds.has(bond.id)) return;
    const from = atomById.get(bond.fromAtomId);
    const to = atomById.get(bond.toAtomId);
    if (!from || !to) return;

    // Explicit H atoms are part of the graph — always draw their bonds.
    // `showHydrogens` only controls implicit-H stubs (see drawAtomDecorations).

    const bcol = bondStrokeColor(bond, from, to, {
      applyAtomColorsToBonds: R.applyAtomColorsToBonds,
      defaultInk: R.structureTheme.ink,
    });
    const opFrom = R.atomOpacityById?.get(from.id) ?? 1;
    const opTo = R.atomOpacityById?.get(to.id) ?? 1;
    // Prefer per-bond opacity. Only inherit atom fade when BOTH ends are faded
    // (keeps substituent bonds outside a transparent ring at full opacity).
    const bondOwn =
      bond.opacity != null ? Math.max(0, Math.min(1, bond.opacity)) : null;
    const bondOpacity =
      bondOwn != null
        ? bondOwn
        : opFrom < 1 - 1e-6 && opTo < 1 - 1e-6
          ? Math.min(opFrom, opTo)
          : 1;
    ctx.save();
    ctx.globalAlpha = bondOpacity;
    ctx.strokeStyle = bcol;

    const bondThickness =
      bond.thicknessPx != null
        ? Math.max(0.5, Math.min(14, bond.thicknessPx))
        : P.bondThicknessPx;
    const singleThickness = bondThickness;

    const normalizedOrder = bond.order === 4 ? 1 : bond.order;

    if (normalizedOrder === 1) {
      const T = bondEndPoints(from, to, bondTrimCtx);
      const dx = T.bx - T.ax;
      const dy = T.by - T.ay;
      const len = Math.hypot(dx, dy);

      // Dative / coordination: dashed shaft + angular arrow toward acceptor (toAtomId).
      if (bond.dative && !bond.stereo) {
        if (len >= 1e-6) {
          const ux = dx / len;
          const uy = dy / len;
          const head = Math.min(10, len * 0.28);
          const headW = head * 0.35;
          ctx.lineWidth = singleThickness;
          ctx.setLineDash([4, 3.5]);
          ctx.beginPath();
          ctx.moveTo(T.ax, T.ay);
          ctx.lineTo(T.bx, T.by);
          ctx.stroke();
          ctx.setLineDash([]);
          const nx = -uy;
          const ny = ux;
          ctx.beginPath();
          ctx.moveTo(T.bx, T.by);
          ctx.lineTo(T.bx - ux * head + nx * headW, T.by - uy * head + ny * headW);
          ctx.moveTo(T.bx, T.by);
          ctx.lineTo(T.bx - ux * head - nx * headW, T.by - uy * head - ny * headW);
          ctx.stroke();
        }
      } else if (bond.dotted && !bond.stereo) {
        // Hydrogen bond / weak interaction: round dotted single line.
        if (len >= 1e-6) {
          ctx.lineWidth = Math.max(0.75, singleThickness);
          ctx.setLineDash([1.6, 3.2]);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(T.ax, T.ay);
          ctx.lineTo(T.bx, T.by);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.lineCap = 'round';
        }
      } else if (bond.stereo === 'wedge') {
        // Adjacent wedges already drawn as a continuous ribbon.
        if (!chainedBondIds.has(bond.id) && len >= 1e-6) {
          const perpX = -dy / len;
          const perpY = dx / len;
          const endGap = 4;
          const tx = T.bx - (dx / len) * endGap;
          const ty = T.by - (dy / len) * endGap;
          const width = P.stereoWedgeWidthPx / 2;
          ctx.lineWidth = bondThickness;
          ctx.beginPath();
          ctx.moveTo(T.ax, T.ay);
          ctx.lineTo(tx + perpX * width, ty + perpY * width);
          ctx.lineTo(tx - perpX * width, ty - perpY * width);
          ctx.closePath();
          ctx.fillStyle = bcol;
          ctx.fill();
        }
      } else if (bond.stereo === 'dash') {
        if (len >= 1e-6) {
          const perpX = -dy / len;
          const perpY = dx / len;
          // Hashed wedge: crossbars widen toward the far end. Spacing follows Hash style.
          const spacing = Math.max(0.8, P.hashSpacingPx);
          const usable = Math.max(spacing, len * 0.82);
          const numDashes = Math.max(3, Math.min(28, Math.round(usable / spacing)));
          ctx.lineWidth = Math.max(bondThickness, 1.15);
          ctx.beginPath();
          for (let i = 1; i <= numDashes; i++) {
            const t = i / (numDashes + 0.65);
            const px = T.ax + dx * t;
            const py = T.ay + dy * t;
            const w = (i / numDashes) * (P.stereoWedgeWidthPx * 0.72);
            ctx.moveTo(px + perpX * w, py + perpY * w);
            ctx.lineTo(px - perpX * w, py - perpY * w);
          }
          ctx.stroke();
        }
      } else if (bond.stereo === 'wavy') {
        if (len >= 1e-6) {
          const nx = -dy / len;
          const ny = dx / len;
          const segments = 28;
          const amp = Math.max(2.4, Math.min(4.2, len * 0.06));
          const waves = Math.max(2.4, Math.min(5.2, len / 16));
          ctx.lineWidth = bondThickness;
          ctx.beginPath();
          ctx.moveTo(T.ax, T.ay);
          for (let i = 1; i <= segments; i++) {
            const t = i / segments;
            const bx = T.ax + dx * t;
            const by = T.ay + dy * t;
            const w = Math.sin(t * Math.PI * 2 * waves) * amp;
            ctx.lineTo(bx + nx * w, by + ny * w);
          }
          ctx.stroke();
        }
      } else if (bond.stereo === 'either' && len >= 1e-6) {
        drawEitherStereo(ctx, T, dx, dy, len, P.stereoWedgeWidthPx, bcol);
      } else if (bond.queryType && len >= 1e-6) {
        const ux = dx / len;
        const uy = dy / len;
        const offset = Math.max((len * spacingFrac) / 2, bondThickness * 3.25, 5.5);
        const nx = (-dy / len) * offset;
        const ny = (dx / len) * offset;
        const inset = Math.min(1.25, len * 0.02);
        ctx.lineWidth = singleThickness;
        if (bond.queryType === 'any') {
          drawQueryAnyBond(ctx, T, dx, dy, len, singleThickness);
        } else {
          ctx.beginPath();
          ctx.moveTo(T.ax, T.ay);
          ctx.lineTo(T.bx, T.by);
          ctx.stroke();
          if (bond.queryType === 'single_double') {
            drawDashedCompanion(ctx, T, nx, ny, ux, uy, inset, [5, 3.5]);
          } else if (bond.queryType === 'single_aromatic') {
            drawDashedCompanion(ctx, T, nx, ny, ux, uy, inset, [1.6, 2.8]);
          } else if (bond.queryType === 'double_aromatic') {
            drawDashedCompanion(ctx, T, nx, ny, ux, uy, inset, [3.2, 2.2]);
            drawDashedCompanion(ctx, T, -nx, -ny, ux, uy, inset, [1.6, 2.8]);
          }
        }
      } else if (bond.aromatic && len >= 1e-6) {
        ctx.lineWidth = singleThickness;
        ctx.beginPath();
        ctx.moveTo(T.ax, T.ay);
        ctx.lineTo(T.bx, T.by);
        ctx.stroke();
        // Complete rings get a solid inner circle (drawn after all bonds).
        // Isolated aromatic bonds keep the solid + dashed inner companion.
        if (!aromaticCircleBondIds.has(bond.id)) {
          const ux = dx / len;
          const uy = dy / len;
          const offset = Math.max((len * spacingFrac) / 2, bondThickness * 3.25, 6.5);
          let nx = (-dy / len) * offset;
          let ny = (dx / len) * offset;
          const ringCenter = R.ringCenterByBondId?.get(bond.id);
          if (ringCenter) {
            const mx = (T.ax + T.bx) / 2;
            const my = (T.ay + T.by) / 2;
            if (nx * (ringCenter.x - mx) + ny * (ringCenter.y - my) < 0) {
              nx = -nx;
              ny = -ny;
            }
          }
          const inset = Math.min(1.25, len * 0.02);
          drawDashedCompanion(ctx, T, nx, ny, ux, uy, inset, [3.4, 2.6]);
        }
      } else if (bond.bold && len >= 1e-6) {
        ctx.lineWidth = Math.max(singleThickness * 2.8, 5);
        ctx.lineCap = 'butt';
        ctx.beginPath();
        ctx.moveTo(T.ax, T.ay);
        ctx.lineTo(T.bx, T.by);
        ctx.stroke();
        ctx.lineCap = 'round';
      } else {
        // Depth taper: near end = normal bond half-width (parallel sides);
        // far end → point (0). Equal depth → constant-width “normal” line.
        let drewDepthTaper = false;
        if (depthWedges && pose && len >= 1e-6) {
          const zf = pose.positions[from.id]?.z;
          const zt = pose.positions[to.id]?.z;
          if (zf != null && zt != null) {
            const halfNormal = Math.max(0.55, bondThickness * 0.5);
            const wFrom = halfNormal * nearness(zf);
            const wTo = halfNormal * nearness(zt);
            const perpX = -dy / len;
            const perpY = dx / len;
            ctx.beginPath();
            ctx.moveTo(T.ax + perpX * wFrom, T.ay + perpY * wFrom);
            ctx.lineTo(T.bx + perpX * wTo, T.by + perpY * wTo);
            ctx.lineTo(T.bx - perpX * wTo, T.by - perpY * wTo);
            ctx.lineTo(T.ax - perpX * wFrom, T.ay + perpY * wFrom);
            ctx.closePath();
            ctx.fillStyle = bcol;
            ctx.fill();
            drewDepthTaper = true;
          }
        }
        if (!drewDepthTaper) {
          ctx.lineWidth = singleThickness;
          ctx.beginPath();
          ctx.moveTo(T.ax, T.ay);
          ctx.lineTo(T.bx, T.by);
          ctx.stroke();
        }
      }
      ctx.restore();
      return;
    }

    if (normalizedOrder === 2) {
      const T = bondEndPoints(from, to, bondTrimCtx);
      const dx = T.bx - T.ax;
      const dy = T.by - T.ay;
      const len = Math.hypot(dx, dy);
      if (len >= 1e-6 && bond.stereo === 'cis_trans') {
        const offset = Math.max((len * spacingFrac) / 2, bondThickness * 3.25, 6.5);
        drawCisTransDouble(ctx, T, dx, dy, len, offset, bondThickness);
        ctx.restore();
        return;
      }
      if (len >= 1e-6) {
        // Separation between the two lines; floor so short bonds (e.g. N=O) stay readable.
        const separation = Math.max(
          (len * spacingFrac) / 2,
          bondThickness * 3.25,
          6.5,
        );
        const offset = separation;
        let nx = (-dy / len) * offset;
        let ny = (dx / len) * offset;

        // Tiny inset + butt cap: inner line meets the carbons without a visible gap
        // and without round-cap blobs on the adjacent singles.
        const inset = Math.min(1.25, len * 0.02);
        const ux = dx / len;
        const uy = dy / len;

        ctx.lineWidth = bondThickness;

        const ringCenter = R.ringCenterByBondId?.get(bond.id);
        const ringAtomIds = R.ringAtomIdsByBondId?.get(bond.id);
        const inRing = Boolean(ringCenter || (pose && ringAtomIds));

        if (inRing) {
          // Prefer in-plane 3D offset so benzene doubles stay coplanar when rotating.
          const planeOff =
            pose && ringAtomIds
              ? ringPlaneScreenOffset(pose, from.id, to.id, ringAtomIds, offset)
              : null;
          if (planeOff) {
            nx = planeOff.nx;
            ny = planeOff.ny;
          } else if (ringCenter) {
            const mx = (T.ax + T.bx) / 2;
            const my = (T.ay + T.by) / 2;
            const vx = ringCenter.x - mx;
            const vy = ringCenter.y - my;
            if (nx * vx + ny * vy < 0) {
              nx = -nx;
              ny = -ny;
            }
          }
        } else {
          const aligned = alignOffsetTowardNeighbors(mol, atomById, from, to, nx, ny);
          nx = aligned.nx;
          ny = aligned.ny;
        }

        ctx.save();
        ctx.lineCap = 'butt';
        if (inRing) {
          // Outer stroke stays on the atom–atom edge (ring perimeter).
          // Inner stroke is offset toward the centroid so Kekulé rings read as complete.
          const innerInset = Math.min(2.4, len * 0.055);
          ctx.beginPath();
          ctx.moveTo(T.ax + ux * inset, T.ay + uy * inset);
          ctx.lineTo(T.bx - ux * inset, T.by - uy * inset);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(T.ax + nx + ux * innerInset, T.ay + ny + uy * innerInset);
          ctx.lineTo(T.bx + nx - ux * innerInset, T.by + ny - uy * innerInset);
          ctx.stroke();
        } else {
          // Chains: straddle the axis so both strokes meet the atoms symmetrically.
          const hx = nx / 2;
          const hy = ny / 2;
          ctx.beginPath();
          ctx.moveTo(T.ax - hx + ux * inset, T.ay - hy + uy * inset);
          ctx.lineTo(T.bx - hx - ux * inset, T.by - hy - uy * inset);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(T.ax + hx + ux * inset, T.ay + hy + uy * inset);
          ctx.lineTo(T.bx + hx - ux * inset, T.by + hy - uy * inset);
          ctx.stroke();
        }
        ctx.restore();
      }
      ctx.restore();
      return;
    }

    if (normalizedOrder === 3) {
      const T = bondEndPoints(from, to, bondTrimCtx);
      const dx = T.bx - T.ax;
      const dy = T.by - T.ay;
      const len = Math.hypot(dx, dy);
      if (len >= 1e-6) {
        const separation = Math.max(
          ((len * spacingFrac) / 2) * 1.15,
          bondThickness * 3.5,
          7,
        );
        const offset = separation;
        const nx = (-dy / len) * offset;
        const ny = (dx / len) * offset;
        const inset = Math.min(1.25, len * 0.02);
        const ux = dx / len;
        const uy = dy / len;

        ctx.lineWidth = bondThickness;

        ctx.beginPath();
        ctx.moveTo(T.ax, T.ay);
        ctx.lineTo(T.bx, T.by);
        ctx.stroke();

        ctx.save();
        ctx.lineCap = 'butt';
        ctx.beginPath();
        ctx.moveTo(T.ax + nx + ux * inset, T.ay + ny + uy * inset);
        ctx.lineTo(T.bx + nx - ux * inset, T.by + ny - uy * inset);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(T.ax - nx + ux * inset, T.ay - ny + uy * inset);
        ctx.lineTo(T.bx - nx - ux * inset, T.by - ny - uy * inset);
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.restore();
  });

  drawAromaticCircles(ctx, R, aromaticCircles, P.bondThicknessPx);

  ctx.strokeStyle = R.structureTheme.ink;
  ctx.globalAlpha = 1;
};
