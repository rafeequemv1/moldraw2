import { useMemo, useState } from 'react';
import type { FischerProjectionData, FischerToolProps } from './types';
import { buildFischerProjection } from './math/fischer';

const transformData = (
  src: FischerProjectionData,
  opts: { flipH: boolean; flipV: boolean; rotate180: boolean },
): FischerProjectionData => {
  const next: FischerProjectionData = {
    chainAtomIds: [...src.chainAtomIds],
    topLabel: src.topLabel,
    bottomLabel: src.bottomLabel,
    rows: src.rows.map(r => ({ ...r })),
  };

  if (opts.flipH) {
    next.rows = next.rows.map(r => ({ ...r, leftLabel: r.rightLabel, rightLabel: r.leftLabel }));
  }
  if (opts.flipV) {
    next.rows = [...next.rows].reverse();
    const prevTop = next.topLabel;
    next.topLabel = next.bottomLabel;
    next.bottomLabel = prevTop;
  }
  if (opts.rotate180) {
    next.rows = [...next.rows].reverse().map(r => ({ ...r, leftLabel: r.rightLabel, rightLabel: r.leftLabel }));
    const prevTop = next.topLabel;
    next.topLabel = next.bottomLabel;
    next.bottomLabel = prevTop;
  }
  return next;
};

export function FischerProjectionTool({ molecule, chainAtomIds, onClose }: FischerToolProps) {
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [rotate180, setRotate180] = useState(false);

  const built = useMemo(() => buildFischerProjection(molecule, chainAtomIds), [molecule, chainAtomIds]);
  const data = useMemo(
    () => (built.data ? transformData(built.data, { flipH, flipV, rotate180 }) : null),
    [built.data, flipH, flipV, rotate180],
  );

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
      onMouseDown={onClose}
    >
      <div
        style={{
          width: 460,
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
          <strong style={{ fontSize: 14, color: '#0f172a' }}>Fischer Projection</strong>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
        </div>
        {data ? (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <button type="button" className="menu-item" onClick={() => setFlipH(v => !v)}>Flip H</button>
              <button type="button" className="menu-item" onClick={() => setFlipV(v => !v)}>Flip V</button>
              <button type="button" className="menu-item" onClick={() => setRotate180(v => !v)}>Rotate 180deg</button>
              <button type="button" className="menu-item" onClick={() => { setFlipH(false); setFlipV(false); setRotate180(false); }}>
                Reset
              </button>
              <span style={{ fontSize: 12, color: '#64748b', alignSelf: 'center' }}>
                Chain length: {data.chainAtomIds.length}
              </span>
            </div>
            <svg
              width="420"
              height={Math.max(240, 84 + data.rows.length * 52)}
              viewBox={`0 0 420 ${Math.max(240, 84 + data.rows.length * 52)}`}
              style={{ width: '100%', height: 'auto', background: '#f8fafc', borderRadius: 10 }}
            >
              {(() => {
                const y0 = 52;
                const rowH = 52;
                const cx = 210;
                const lastY = y0 + rowH * (data.rows.length - 1);
                return (
                  <>
                    <line x1={cx} y1={y0 - 28} x2={cx} y2={lastY + 28} stroke="#0f172a" strokeWidth="2.2" />
                    <text x={cx} y={y0 - 34} fontSize="13" textAnchor="middle" fill="#0f172a">{data.topLabel}</text>
                    <text x={cx} y={lastY + 48} fontSize="13" textAnchor="middle" fill="#0f172a">{data.bottomLabel}</text>
                    {data.rows.map((row, i) => {
                      const y = y0 + i * rowH;
                      return (
                        <g key={row.atomId}>
                          <line x1={cx - 60} y1={y} x2={cx + 60} y2={y} stroke="#0f172a" strokeWidth="2.2" />
                          <circle cx={cx} cy={y} r="3.2" fill="#0f172a" />
                          <text x={cx - 72} y={y + 4} fontSize="13" textAnchor="end" fill="#0f172a">{row.leftLabel}</text>
                          <text x={cx + 72} y={y + 4} fontSize="13" textAnchor="start" fill="#0f172a">{row.rightLabel}</text>
                          <text x={cx} y={y - 9} fontSize="10.5" textAnchor="middle" fill="#64748b">{row.centerLabel}</text>
                        </g>
                      );
                    })}
                  </>
                );
              })()}
            </svg>
          </>
        ) : (
          <div style={{ fontSize: 13, color: '#64748b' }}>
            {built.error || 'Could not build Fischer projection for this selection.'}
          </div>
        )}
      </div>
    </div>
  );
}
