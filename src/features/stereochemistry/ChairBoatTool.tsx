import { useMemo, useState } from 'react';
import { boatRingVertices } from '@moldraw/core/geometry/boatRing';
import { chairRingVertices } from '@moldraw/core/geometry/chairRing';
import type { Atom } from '@moldraw/domain';
import type { ChairBoatToolProps } from './types';

const center = (pts: { x: number; y: number }[]) => {
  const n = pts.length || 1;
  return { x: pts.reduce((s, p) => s + p.x, 0) / n, y: pts.reduce((s, p) => s + p.y, 0) / n };
};

export function ChairBoatTool({ molecule, ringAtomIds, onClose }: ChairBoatToolProps) {
  const [mode, setMode] = useState<'chair' | 'boat'>('chair');
  const [flip, setFlip] = useState(false);
  const [axial, setAxial] = useState(true);
  const [showBothChairConformers, setShowBothChairConformers] = useState(false);

  const data = useMemo(() => {
    if (ringAtomIds.length !== 6) return null;
    const ringAtoms = ringAtomIds.map(id => molecule.atoms.find(a => a.id === id)).filter((a): a is Atom => Boolean(a));
    if (ringAtoms.length !== 6) return null;
    const c2 = center(ringAtoms);
    const subs = ringAtoms.map((a, idx) => {
      const ext = molecule.bonds
        .map(b => {
          if (b.fromAtomId === a.id && !ringAtomIds.includes(b.toAtomId)) return b.toAtomId;
          if (b.toAtomId === a.id && !ringAtomIds.includes(b.fromAtomId)) return b.fromAtomId;
          return null;
        })
        .filter((id): id is string => Boolean(id))
        .map(id => molecule.atoms.find(x => x.id === id))
        .filter((x): x is Atom => Boolean(x));
      const label = ext[0]?.alias?.trim() || ext[0]?.element || 'H';
      const vx = a.x - c2.x;
      const vy = a.y - c2.y;
      const n = Math.hypot(vx, vy) || 1;
      return { idx, label, ux: vx / n, uy: vy / n };
    });
    return { subs };
  }, [molecule, ringAtomIds]);

  const ringPoints = useMemo(() => {
    const chairCenter = { x: 190, y: 105 };
    const chairA = chairRingVertices(chairCenter, 40);
    const chairB = chairRingVertices(chairCenter, 40).map(p => ({
      x: p.x,
      y: chairCenter.y - (p.y - chairCenter.y),
    }));
    // Match toolbar boat tool: peaks up, plain skeletal (no wedges / axial H).
    const boatCenter = { x: 190, y: 105 };
    const baseBoat = boatRingVertices(boatCenter, 40);
    if (mode === 'chair') return flip ? chairB : chairA;
    return !flip ? baseBoat : baseBoat.map(p => ({ x: 382 - p.x, y: p.y }));
  }, [mode, flip]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.25)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseDown={onClose}>
      <div style={{ width: 440, maxWidth: 'calc(100vw - 32px)', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 12px 30px rgba(0,0,0,0.2)', padding: 14 }} onMouseDown={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <strong style={{ fontSize: 14, color: '#0f172a' }}>Cyclohexane Chair/Boat</strong>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <button className="menu-item" onClick={() => setMode(v => (v === 'chair' ? 'boat' : 'chair'))}>{mode === 'chair' ? 'Switch to Boat' : 'Switch to Chair'}</button>
          <button className="menu-item" onClick={() => setFlip(v => !v)}>Ring Flip</button>
          <button className="menu-item" onClick={() => setAxial(v => !v)}>{axial ? 'Show Equatorial' : 'Show Axial'}</button>
          <button className="menu-item" onClick={() => setShowBothChairConformers(v => !v)}>{showBothChairConformers ? 'Single Conformer' : 'Both Chair Conformers'}</button>
        </div>
        <svg width="392" height="210" viewBox="0 0 392 210" style={{ width: '100%', height: 'auto', background: '#f8fafc', borderRadius: 10 }}>
          {(() => {
            const drawRing = (pts: { x: number; y: number }[], keyPrefix: string, flipMul: 1 | -1) => (
              <g key={keyPrefix}>
                {pts.map((p, i) => {
                  const n = pts[(i + 1) % pts.length];
                  return <line key={`${keyPrefix}-rb-${i}`} x1={p.x} y1={p.y} x2={n.x} y2={n.y} stroke="#0f172a" strokeWidth="2.1" />;
                })}
                {pts.map((p, i) => {
                  const s = data?.subs[i];
                  if (!s) return null;
                  const sign = ((i % 2 === 0) ? 1 : -1) * flipMul;
                  const dx = axial ? 0 : s.ux * 28;
                  const dy = axial ? sign * 28 : s.uy * 18;
                  return (
                    <g key={`${keyPrefix}-sub-${i}`}>
                      <circle cx={p.x} cy={p.y} r="2.2" fill="#0f172a" />
                      <line x1={p.x} y1={p.y} x2={p.x + dx} y2={p.y + dy} stroke={axial ? '#7c3aed' : '#0ea5e9'} strokeWidth="1.8" />
                      <text x={p.x + dx + (dx >= 0 ? 4 : -4)} y={p.y + dy - 2} fontSize="11" textAnchor={dx >= 0 ? 'start' : 'end'} fill="#0f172a">{s.label}</text>
                    </g>
                  );
                })}
              </g>
            );
            if (!showBothChairConformers || mode !== 'chair') {
              return drawRing(ringPoints, 'single', flip ? -1 : 1);
            }
            const leftBase: Array<{ x: number; y: number }> = [
              { x: 70, y: 105 }, { x: 128, y: 82 }, { x: 186, y: 105 }, { x: 248, y: 86 }, { x: 310, y: 108 }, { x: 248, y: 130 },
            ];
            const rightBase: Array<{ x: number; y: number }> = [
              { x: 70, y: 95 }, { x: 128, y: 118 }, { x: 186, y: 98 }, { x: 248, y: 120 }, { x: 310, y: 96 }, { x: 248, y: 74 },
            ];
            const left = leftBase.map(p => ({ x: p.x - 85, y: p.y }));
            const right = rightBase.map(p => ({ x: p.x + 85, y: p.y }));
            return (
              <>
                {drawRing(left, 'chair-a', 1)}
                {drawRing(right, 'chair-b', -1)}
              </>
            );
          })()}
          <text x="12" y="196" fontSize="11" fill="#64748b">
            {showBothChairConformers && mode === 'chair'
              ? (axial ? 'Both chair conformers (axial positions inverted)' : 'Both chair conformers (equatorial view)')
              : (axial ? 'Axial substituent view' : 'Equatorial substituent view')}
          </text>
        </svg>
      </div>
    </div>
  );
}
