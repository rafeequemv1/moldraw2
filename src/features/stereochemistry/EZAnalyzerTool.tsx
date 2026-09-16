import { useMemo } from 'react';
import type { Atom, Bond } from '@moldraw/domain';
import type { EZAnalyzerToolProps } from './types';

const Z: Record<string, number> = {
  H: 1, B: 5, C: 6, N: 7, O: 8, F: 9, P: 15, S: 16, Cl: 17, Br: 35, I: 53,
};

const pickPriority = (center: Atom, otherId: string, molAtoms: Atom[], molBonds: Bond[]) => {
  const ns = molBonds
    .flatMap(b => {
      if (b.fromAtomId === center.id && b.toAtomId !== otherId) return [b.toAtomId];
      if (b.toAtomId === center.id && b.fromAtomId !== otherId) return [b.fromAtomId];
      return [];
    })
    .map(id => molAtoms.find(a => a.id === id))
    .filter((a): a is Atom => Boolean(a))
    .sort((a, b) => (Z[b.element] || 0) - (Z[a.element] || 0));
  return ns[0] || null;
};

export function EZAnalyzerTool({ molecule, bondId, onClose }: EZAnalyzerToolProps) {
  const analysis = useMemo(() => {
    const bond = molecule.bonds.find(b => b.id === bondId);
    if (!bond || bond.order !== 2) return { error: 'Pick a double bond for E/Z analysis.' } as const;
    const a1 = molecule.atoms.find(a => a.id === bond.fromAtomId);
    const a2 = molecule.atoms.find(a => a.id === bond.toAtomId);
    if (!a1 || !a2) return { error: 'Bond atoms not found.' } as const;
    const p1 = pickPriority(a1, a2.id, molecule.atoms, molecule.bonds);
    const p2 = pickPriority(a2, a1.id, molecule.atoms, molecule.bonds);
    if (!p1 || !p2) return { error: 'Each alkene carbon needs one non-bond substituent.' } as const;
    const bx = a2.x - a1.x;
    const by = a2.y - a1.y;
    const s1 = Math.sign(bx * (p1.y - a1.y) - by * (p1.x - a1.x));
    const s2 = Math.sign(bx * (p2.y - a2.y) - by * (p2.x - a2.x));
    const ez = s1 === 0 || s2 === 0 ? 'Undetermined' : s1 === s2 ? 'Z' : 'E';
    return { a1, a2, p1, p2, ez } as const;
  }, [molecule, bondId]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.25)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 430, maxWidth: 'calc(100vw - 32px)', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 12px 30px rgba(0,0,0,0.2)', padding: 14 }} onMouseDown={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <strong style={{ fontSize: 14, color: '#0f172a' }}>E/Z Alkene Analyzer</strong>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
        </div>
        {'error' in analysis ? (
          <div style={{ fontSize: 13, color: '#64748b' }}>{analysis.error}</div>
        ) : (
          <>
            <div style={{ fontSize: 13, marginBottom: 8 }}>
              Result: <strong>{analysis.ez}</strong>
              <span style={{ color: '#64748b' }}> (priority by atomic number first-shell heuristic)</span>
            </div>
            <svg width="392" height="200" viewBox="0 0 392 200" style={{ width: '100%', height: 'auto', background: '#f8fafc', borderRadius: 10 }}>
              <defs>
                <marker id="arrowHeadEZ" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L7,3 z" fill="#dc2626" />
                </marker>
              </defs>
              <line x1="130" y1="100" x2="262" y2="100" stroke="#0f172a" strokeWidth="2.6" />
              <line x1="130" y1="95" x2="262" y2="95" stroke="#0f172a" strokeWidth="1.5" />
              <circle cx="130" cy="100" r="3" fill="#0f172a" />
              <circle cx="262" cy="100" r="3" fill="#0f172a" />
              <line x1="130" y1="100" x2="90" y2="55" stroke="#dc2626" strokeWidth="2" markerEnd="url(#arrowHeadEZ)" />
              <line x1="262" y1="100" x2="302" y2="55" stroke="#dc2626" strokeWidth="2" markerEnd="url(#arrowHeadEZ)" />
              <text x="86" y="48" fontSize="12" textAnchor="middle" fill="#0f172a">{analysis.p1.alias?.trim() || analysis.p1.element}</text>
              <text x="306" y="48" fontSize="12" textAnchor="middle" fill="#0f172a">{analysis.p2.alias?.trim() || analysis.p2.element}</text>
              <text x="196" y="170" fontSize="11" textAnchor="middle" fill="#64748b">Red arrows show highest-priority substituent on each alkene carbon.</text>
            </svg>
          </>
        )}
      </div>
    </div>
  );
}
