import { useMemo, useState } from 'react';
import type { NewmanToolProps } from './types';
import {
  buildNewmanBasisFromMol3D,
  buildNewmanProjection,
  projectOntoBasis,
  type Mol3D,
  type NewmanBasis,
  type Vec3,
} from './math/newman';

const polar = (cx: number, cy: number, r: number, a: number) => ({
  x: cx + Math.cos(a) * r,
  y: cy + Math.sin(a) * r,
});

interface PlacedAtom {
  atomId: string;
  label: string;
  x: number;
  y: number;
  side: 'front' | 'back';
  isHydrogen: boolean;
  isImmediate: boolean;
}

interface PlacedBond {
  id: string;
  fromAtomId: string;
  toAtomId: string;
  order: number;
}

const parseMol3D = (
  molblock: string,
  atomIndexTo2DId?: Record<number, string>,
): { mol3d: Mol3D; hasZDimension: boolean } => {
  const mol3d: Mol3D = {
    atoms: new Map(),
    bonds: [],
    hydrogensByHeavy: new Map(),
  };
  const firstBlock = molblock.split('$$$$')[0]?.trim();
  if (!firstBlock) return { mol3d, hasZDimension: false };

  const lines = firstBlock.split(/\r?\n/);
  if (lines.length < 5) return { mol3d, hasZDimension: false };

  const counts = lines[3] ?? '';
  const atomCount = parseInt(counts.substring(0, 3).trim() || '0', 10);
  const bondCount = parseInt(counts.substring(3, 6).trim() || '0', 10);
  if (!Number.isFinite(atomCount) || atomCount <= 0) return { mol3d, hasZDimension: false };

  const idByIndex = new Map<number, string>();
  let synthetic = 0;
  let maxAbsZ = 0;

  for (let i = 0; i < atomCount; i++) {
    const line = lines[4 + i] ?? '';
    if (line.length < 31) continue;
    const x = parseFloat(line.substring(0, 10).trim());
    const y = parseFloat(line.substring(10, 20).trim());
    const z = parseFloat(line.substring(20, 30).trim());
    const element = (line.substring(31, 34).trim() || '').toUpperCase();
    if (![x, y, z].every(Number.isFinite)) continue;
    if (Math.abs(z) > maxAbsZ) maxAbsZ = Math.abs(z);
    const mappedId = atomIndexTo2DId?.[i];
    const id = mappedId ?? `__mol3d_h${++synthetic}`;
    idByIndex.set(i, id);
    const normalizedElement = element ? element.charAt(0) + element.slice(1).toLowerCase() : '';
    mol3d.atoms.set(id, {
      pos: { x, y, z },
      element: normalizedElement,
    });
  }

  const bondsStart = 4 + atomCount;
  const totalBonds = Number.isFinite(bondCount) && bondCount > 0 ? bondCount : 0;
  for (let i = 0; i < totalBonds; i++) {
    const line = lines[bondsStart + i] ?? '';
    if (line.length < 9) continue;
    const fromIdx = parseInt(line.substring(0, 3).trim() || '0', 10) - 1;
    const toIdx = parseInt(line.substring(3, 6).trim() || '0', 10) - 1;
    const order = parseInt(line.substring(6, 9).trim() || '0', 10) || 1;
    const fromId = idByIndex.get(fromIdx);
    const toId = idByIndex.get(toIdx);
    if (!fromId || !toId) continue;
    mol3d.bonds.push({ from: fromId, to: toId, order });
  }

  for (const bond of mol3d.bonds) {
    const fromAtom = mol3d.atoms.get(bond.from);
    const toAtom = mol3d.atoms.get(bond.to);
    if (!fromAtom || !toAtom) continue;
    const fromIsH = fromAtom.element.toUpperCase() === 'H';
    const toIsH = toAtom.element.toUpperCase() === 'H';
    if (fromIsH && !toIsH) {
      const list = mol3d.hydrogensByHeavy.get(bond.to) ?? [];
      list.push(bond.from);
      mol3d.hydrogensByHeavy.set(bond.to, list);
    } else if (toIsH && !fromIsH) {
      const list = mol3d.hydrogensByHeavy.get(bond.from) ?? [];
      list.push(bond.to);
      mol3d.hydrogensByHeavy.set(bond.from, list);
    }
  }

  return { mol3d, hasZDimension: maxAbsZ > 1e-3 };
};

interface LayoutResult {
  atoms: Map<string, PlacedAtom>;
  bonds: PlacedBond[];
  axisRadiusFront: number;
  axisRadiusBack: number;
}

const buildFullLayout = (
  mol3d: Mol3D,
  frontId: string,
  backId: string,
  basis: NewmanBasis,
  immediateFrontIds: Set<string>,
  immediateBackIds: Set<string>,
  view: { width: number; height: number; cx: number; cy: number },
): LayoutResult | null => {
  const projected = new Map<string, { x: number; y: number; axial: number }>();
  for (const [id, atom] of mol3d.atoms) {
    if (id === frontId || id === backId) continue;
    projected.set(id, projectOntoBasis(basis, atom.pos));
  }
  if (projected.size === 0) return null;

  const xs = [...projected.values()].map(p => p.x);
  const ys = [...projected.values()].map(p => p.y);
  const maxAbs = Math.max(1e-6, ...xs.map(Math.abs), ...ys.map(Math.abs));
  const radius = Math.min((view.width - 80) / 2, (view.height - 60) / 2, 150);
  const scale = (radius - 12) / maxAbs;

  const frontProj = projectOntoBasis(basis, mol3d.atoms.get(frontId)!.pos);
  const backProj = projectOntoBasis(basis, mol3d.atoms.get(backId)!.pos);
  const midAxial = (frontProj.axial + backProj.axial) / 2;

  const atoms = new Map<string, PlacedAtom>();
  for (const [id, p] of projected) {
    const atom = mol3d.atoms.get(id);
    if (!atom) continue;
    atoms.set(id, {
      atomId: id,
      label: atom.element || '?',
      x: view.cx + p.x * scale,
      y: view.cy + p.y * scale,
      side: p.axial >= midAxial ? 'back' : 'front',
      isHydrogen: atom.element.toUpperCase() === 'H',
      isImmediate: immediateFrontIds.has(id) || immediateBackIds.has(id),
    });
  }

  const bonds: PlacedBond[] = [];
  let bondCounter = 0;
  for (const bond of mol3d.bonds) {
    if (
      (bond.from === frontId && bond.to === backId) ||
      (bond.from === backId && bond.to === frontId)
    ) {
      continue;
    }
    if (atoms.has(bond.from) && atoms.has(bond.to)) {
      bonds.push({ id: `mb${bondCounter++}`, fromAtomId: bond.from, toAtomId: bond.to, order: bond.order });
    }
  }

  const frontImmediateRadii = [...immediateFrontIds]
    .map(id => atoms.get(id))
    .filter((a): a is PlacedAtom => Boolean(a))
    .map(a => Math.hypot(a.x - view.cx, a.y - view.cy));
  const backImmediateRadii = [...immediateBackIds]
    .map(id => atoms.get(id))
    .filter((a): a is PlacedAtom => Boolean(a))
    .map(a => Math.hypot(a.x - view.cx, a.y - view.cy));

  const avgFront = frontImmediateRadii.length
    ? frontImmediateRadii.reduce((s, r) => s + r, 0) / frontImmediateRadii.length
    : 60;
  const avgBack = backImmediateRadii.length
    ? backImmediateRadii.reduce((s, r) => s + r, 0) / backImmediateRadii.length
    : 60;
  const circleRadius = Math.max(40, Math.min(avgFront, avgBack) * 0.7);

  return {
    atoms,
    bonds,
    axisRadiusFront: circleRadius,
    axisRadiusBack: Math.max(circleRadius, Math.min(avgBack, radius) + 6),
  };
};

const renderBond = (
  bond: PlacedBond,
  atoms: Map<string, PlacedAtom>,
  color: string,
) => {
  const from = atoms.get(bond.fromAtomId);
  const to = atoms.get(bond.toAtomId);
  if (!from || !to) return null;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.5) return null;
  const ox = (-dy / len) * 3;
  const oy = (dx / len) * 3;
  const offsets = bond.order === 3 ? [-1, 0, 1] : bond.order === 2 ? [-0.5, 0.5] : [0];
  return (
    <g key={`${bond.id}-${bond.fromAtomId}-${bond.toAtomId}`}>
      {offsets.map(offset => (
        <line
          key={offset}
          x1={from.x + ox * offset}
          y1={from.y + oy * offset}
          x2={to.x + ox * offset}
          y2={to.y + oy * offset}
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      ))}
    </g>
  );
};

export function NewmanProjectionTool({
  molecule,
  bondId,
  bondIndex,
  cipStereoTags,
  molblock3D,
  atomIndexTo2DId,
  onClose,
}: NewmanToolProps) {
  const bond = molecule.bonds.find(b => b.id === bondId);
  const [invert, setInvert] = useState(false);
  const [showRest, setShowRest] = useState(false);

  const { mol3d, hasZDimension } = useMemo(
    () => parseMol3D(molblock3D ?? '', atomIndexTo2DId),
    [molblock3D, atomIndexTo2DId],
  );

  const ready = hasZDimension && bond
    ? mol3d.atoms.has(bond.fromAtomId) && mol3d.atoms.has(bond.toAtomId)
    : false;

  const frontId = invert ? bond?.toAtomId ?? '' : bond?.fromAtomId ?? '';
  const backId = invert ? bond?.fromAtomId ?? '' : bond?.toAtomId ?? '';

  const basis = useMemo<NewmanBasis | null>(() => {
    if (!ready || !frontId || !backId) return null;
    return buildNewmanBasisFromMol3D(molecule, frontId, backId, mol3d);
  }, [ready, frontId, backId, molecule, mol3d]);

  const data = useMemo(() => {
    if (!ready || !basis) return null;
    return buildNewmanProjection(molecule, frontId, backId, mol3d, { bondIndex, cipStereoTags, basis });
  }, [ready, basis, molecule, frontId, backId, mol3d, bondIndex, cipStereoTags]);

  const view = showRest
    ? { width: 600, height: 420, cx: 300, cy: 210 }
    : { width: 392, height: 250, cx: 196, cy: 125 };

  const layout = useMemo(() => {
    if (!data || !basis || !showRest) return null;
    return buildFullLayout(
      mol3d,
      data.frontAtomId,
      data.backAtomId,
      basis,
      new Set(data.frontHints.map(h => h.atomId)),
      new Set(data.backHints.map(h => h.atomId)),
      view,
    );
  }, [data, basis, showRest, mol3d, view]);

  const dialogWidth = showRest ? 620 : 420;

  let waitingMessage: string | null = null;
  if (!bond) {
    waitingMessage = 'Bond not found.';
  } else if (!hasZDimension) {
    waitingMessage = 'Generating 3D coordinates… open this again in a moment.';
  } else if (!ready) {
    waitingMessage = '3D coordinates not yet available for this bond.';
  } else if (!data) {
    waitingMessage = 'Could not build Newman projection from 3D structure.';
  }

  const computeImmediateAnchor = (atomId: string, fallbackRadius: number, fallbackAngle: number) => {
    if (!basis) return polar(view.cx, view.cy, fallbackRadius, fallbackAngle);
    const entry = mol3d.atoms.get(atomId);
    if (!entry) return polar(view.cx, view.cy, fallbackRadius, fallbackAngle);
    if (layout) {
      const placed = layout.atoms.get(atomId);
      if (placed) return { x: placed.x, y: placed.y };
    }
    const proj = projectOntoBasis(basis, entry.pos);
    const angle = Math.atan2(proj.y, proj.x);
    return polar(view.cx, view.cy, fallbackRadius, Number.isFinite(angle) ? angle : fallbackAngle);
  };

  const circleRadius = layout?.axisRadiusFront ?? 64;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,0.25)',
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: dialogWidth,
          maxWidth: 'calc(100vw - 32px)',
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: 12,
          boxShadow: '0 12px 30px rgba(0,0,0,0.2)',
          padding: 14,
        }}
        onMouseDown={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <strong style={{ fontSize: 14, color: '#0f172a' }}>Newman Projection</strong>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
        </div>
        {data ? (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setInvert(v => !v)}
                style={{
                  border: '1px solid #cbd5e1',
                  background: '#f8fafc',
                  borderRadius: 8,
                  padding: '6px 10px',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Swap front/back
              </button>
              <button
                type="button"
                onClick={() => setShowRest(v => !v)}
                style={{
                  border: '1px solid #cbd5e1',
                  background: showRest ? '#e0f2fe' : '#f8fafc',
                  borderRadius: 8,
                  padding: '6px 10px',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                {showRest ? 'Hide rest of molecule' : 'Show rest of molecule'}
              </button>
              <span style={{ fontSize: 12, color: '#475569', alignSelf: 'center' }}>
                Front: {data.frontElement} ({data.frontAtomId.slice(0, 4)}) · Back: {data.backElement} ({data.backAtomId.slice(0, 4)})
              </span>
              {data.cipParityHint ? (
                <span style={{ fontSize: 11, color: '#64748b', alignSelf: 'center' }}>{data.cipParityHint}</span>
              ) : null}
            </div>
            <svg
              width={view.width}
              height={view.height}
              viewBox={`0 0 ${view.width} ${view.height}`}
              style={{ width: '100%', height: 'auto', background: '#f8fafc', borderRadius: 10 }}
            >
              {layout
                ? layout.bonds.map(restBond => {
                    const from = layout.atoms.get(restBond.fromAtomId);
                    const to = layout.atoms.get(restBond.toAtomId);
                    if (!from || !to) return null;
                    const color = from.side === 'back' || to.side === 'back' ? '#64748b' : '#0f172a';
                    return renderBond(restBond, layout.atoms, color);
                  })
                : null}

              <circle cx={view.cx} cy={view.cy} r={circleRadius} fill="none" stroke="#0f172a" strokeWidth="1.9" />
              <circle cx={view.cx} cy={view.cy} r="6.5" fill="#0f172a" />

              {data.frontHints.map(h => {
                const atom = computeImmediateAnchor(h.atomId, circleRadius * 1.5, h.angleRad);
                return (
                  <g key={`f-${h.atomId}`}>
                    <line x1={view.cx} y1={view.cy} x2={atom.x} y2={atom.y} stroke="#0f172a" strokeWidth="2.1" />
                    <circle cx={atom.x} cy={atom.y} r="2.2" fill="#0f172a" />
                    <text x={atom.x} y={atom.y - 12} fontSize="12" textAnchor="middle" dominantBaseline="middle" fill="#0f172a">
                      {h.label}
                    </text>
                  </g>
                );
              })}
              {data.backHints.map(h => {
                const atom = computeImmediateAnchor(h.atomId, circleRadius * 1.65, h.angleRad);
                const lineAngle = Math.atan2(atom.y - view.cy, atom.x - view.cx);
                const p0 = polar(view.cx, view.cy, circleRadius, Number.isFinite(lineAngle) ? lineAngle : h.angleRad);
                return (
                  <g key={`b-${h.atomId}`}>
                    <line x1={p0.x} y1={p0.y} x2={atom.x} y2={atom.y} stroke="#475569" strokeWidth="1.8" />
                    <circle cx={atom.x} cy={atom.y} r="2" fill="#475569" />
                    <text x={atom.x} y={atom.y - 12} fontSize="12" textAnchor="middle" dominantBaseline="middle" fill="#475569">
                      {h.label}
                    </text>
                  </g>
                );
              })}

              {layout
                ? [...layout.atoms.values()]
                    .filter(a => !a.isImmediate)
                    .map(atom => (
                      <g key={`rest-${atom.atomId}`}>
                        <circle
                          cx={atom.x}
                          cy={atom.y}
                          r={atom.isHydrogen ? 1.6 : 2.2}
                          fill={atom.side === 'back' ? '#64748b' : '#0f172a'}
                        />
                        <text
                          x={atom.x}
                          y={atom.y - 10}
                          fontSize={atom.isHydrogen ? 9.5 : 11}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill={atom.side === 'back' ? '#64748b' : '#0f172a'}
                        >
                          {atom.label}
                        </text>
                      </g>
                    ))
                : null}
            </svg>
          </>
        ) : (
          <div style={{ fontSize: 13, color: '#64748b' }}>{waitingMessage ?? 'Could not build Newman projection.'}</div>
        )}
      </div>
    </div>
  );
}

export type { Vec3 };
