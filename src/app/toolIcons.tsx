/** SVG / lucide-icon glyphs for each tool id. Pure presentation. */
import type { ReactNode } from 'react';
import {
  MousePointer2,
  Hand,
  LassoSelect,
  Eraser,
  Pencil,
  Star,
  Shapes,
  Beaker,
  Library,
  Image as ImageIcon,
  Type,
} from 'lucide-react';
import { boatRingIconPoints } from '@moldraw/core/geometry/boatRing';
import { chairRingIconPoints } from '@moldraw/core/geometry/chairRing';

const stroke = {
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function IconSvg({ children }: { children: ReactNode }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
      {children}
    </svg>
  );
}

/** Regular n-gon vertices (cx,cy). `flatTop` = flat edge on top (even n); else vertex on top. */
function nGonVerts(
  sides: number,
  r: number,
  cx = 10,
  cy = 10,
  flatTop = false,
): Array<{ x: number; y: number }> {
  const start = flatTop ? Math.PI / sides - Math.PI / 2 : -Math.PI / 2;
  const verts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < sides; i++) {
    const a = start + (i * 2 * Math.PI) / sides;
    verts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return verts;
}

function vertsToPoints(verts: Array<{ x: number; y: number }>): string {
  return verts.map(v => `${v.x.toFixed(2)},${v.y.toFixed(2)}`).join(' ');
}

/** Short double-bond mark inset from an edge, biased toward ring center. */
function doubleBondAlongEdge(
  a: { x: number; y: number },
  b: { x: number; y: number },
  cx = 10,
  cy = 10,
  inset = 0.2,
  inward = 1.45,
): { x1: number; y1: number; x2: number; y2: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  let nx = -uy;
  let ny = ux;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  if (nx * (cx - mx) + ny * (cy - my) < 0) {
    nx = -nx;
    ny = -ny;
  }
  const ox = mx + nx * inward;
  const oy = my + ny * inward;
  const half = len * (0.5 - inset);
  return {
    x1: ox - ux * half,
    y1: oy - uy * half,
    x2: ox + ux * half,
    y2: oy + uy * half,
  };
}

/** Flat-top / point-top regular n-gon outline. */
function RegularNGon({
  sides,
  flatTop = false,
  r = 7.2,
}: {
  sides: number;
  flatTop?: boolean;
  r?: number;
}) {
  const verts = nGonVerts(sides, r, 10, 10, flatTop);
  return (
    <IconSvg>
      <polygon points={vertsToPoints(verts)} {...stroke} strokeWidth={1.55} />
    </IconSvg>
  );
}

/** Parallel bond lines at −30° (single / double / triple). */
function BondLines({ count }: { count: 1 | 2 | 3 }) {
  // Wider spacing between double / triple strokes for clarity.
  const gap = count === 1 ? 0 : count === 2 ? 3.25 : 2.6;
  const offsets =
    count === 1 ? [0] : count === 2 ? [-gap / 2, gap / 2] : [-gap, 0, gap];
  return (
    <IconSvg>
      <g transform="rotate(-30 10 10)">
        {offsets.map((dy, i) => (
          <line key={i} x1="2.4" y1={10 + dy} x2="17.6" y2={10 + dy} {...stroke} strokeWidth={1.85} />
        ))}
      </g>
    </IconSvg>
  );
}

/** Skeletal alkyl zigzag (ChemDraw-style): 120° vertices, first segment down-right. */
function chainZigzagPoints(bondLen = 4.55): string {
  const dx = bondLen * Math.cos(Math.PI / 6); // cos 30°
  const dy = bondLen * Math.sin(Math.PI / 6); // sin 30°
  const n = 4; // 4 bonds → 5 carbons
  const totalW = n * dx;
  let x = 10 - totalW / 2;
  let y = 10 - dy / 2;
  const pts: Array<{ x: number; y: number }> = [{ x, y }];
  for (let i = 0; i < n; i++) {
    // Odd segments go up so the chain starts descending (matches toolbar reference icon).
    const down = i % 2 === 0;
    x += dx;
    y += down ? dy : -dy;
    pts.push({ x, y });
  }
  return pts.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
}

export const renderToolIcon = (toolId: string) => {
  switch (toolId) {
    case 'hand':
      return <Hand size={18} strokeWidth={2} />;
    case 'select':
      return <MousePointer2 size={18} strokeWidth={2} />;
    case 'lasso_select':
      return <LassoSelect size={18} strokeWidth={2} />;
    case 'erase':
      return <Eraser size={18} strokeWidth={2} />;
    case 'single_bond':
      return <BondLines count={1} />;
    case 'double_bond':
      return <BondLines count={2} />;
    case 'triple_bond':
      return <BondLines count={3} />;
    case 'wedge_bond':
      // Solid stereo wedge: longer shaft, narrower tip→base (less thick)
      return (
        <IconSvg>
          <polygon
            points="0.8,10 19.2,5.6 19.2,14.4"
            fill="currentColor"
            transform="rotate(-28 10 10)"
          />
        </IconSvg>
      );
    case 'dash_bond':
      // Hashed stereo: tapering parallel hashes (slightly larger)
      return (
        <IconSvg>
          <g transform="rotate(-28 10 10)">
            {[
              [3.2, 9.45, 3.2, 10.55],
              [5.6, 8.95, 5.6, 11.05],
              [8.0, 8.35, 8.0, 11.65],
              [10.4, 7.7, 10.4, 12.3],
              [12.8, 7.0, 12.8, 13.0],
              [15.2, 6.3, 15.2, 13.7],
              [17.2, 5.7, 17.2, 14.3],
            ].map(([x1, y1, x2, y2], i) => (
              <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} {...stroke} strokeWidth={1.55} />
            ))}
          </g>
        </IconSvg>
      );
    case 'wavy_bond':
      return (
        <IconSvg>
          <path
            d="M3 11 C5 6.5, 7 15.5, 9 11 C11 6.5, 13 15.5, 15 11 C16.2 8.5, 17 10, 17 10"
            {...stroke}
            strokeWidth={1.65}
          />
        </IconSvg>
      );
    case 'dative_bond':
      // Dashed shaft + arrow head (coordination / dative)
      return (
        <IconSvg>
          <g transform="rotate(-30 10 10)">
            <line x1="3" y1="10" x2="12" y2="10" {...stroke} strokeWidth={1.5} strokeDasharray="2.2 1.8" />
            <polygon points="12,7.2 17.5,10 12,12.8" fill="currentColor" />
          </g>
        </IconSvg>
      );
    case 'dotted_bond':
      // Round dotted single bond (H-bond / weak interaction), same incline as other bonds
      return (
        <IconSvg>
          <g transform="rotate(-30 10 10)">
            <line
              x1="2.5"
              y1="10"
              x2="17.5"
              y2="10"
              {...stroke}
              strokeWidth={1.7}
              strokeDasharray="1.4 2.8"
              strokeLinecap="round"
            />
          </g>
        </IconSvg>
      );
    case 'perspective':
      return (
        <IconSvg>
          <path
            d="M4 13 L10 4 L16 13 L10 16 Z"
            {...stroke}
            strokeWidth={1.45}
            fill="none"
          />
          <circle cx="10" cy="10" r="1.3" fill="currentColor" />
        </IconSvg>
      );
    case 'chain': {
      // Skeletal zigzag, inclined like the bond tools.
      const pts = chainZigzagPoints(4.6);
      return (
        <IconSvg>
          <g transform="rotate(-18 10 10)">
            <polyline points={pts} {...stroke} strokeWidth={1.7} fill="none" />
          </g>
        </IconSvg>
      );
    }
    case 'charge_plus':
      return (
        <IconSvg>
          <path d="M10 5.8 V14.2 M5.8 10 H14.2" {...stroke} strokeWidth={1.9} />
        </IconSvg>
      );
    case 'charge_minus':
      return (
        <IconSvg>
          <path d="M5.8 10 H14.2" {...stroke} strokeWidth={1.9} />
        </IconSvg>
      );
    case 'oplus':
      return (
        <IconSvg>
          <circle cx="10" cy="10" r="7.4" {...stroke} strokeWidth={1.45} />
          <path d="M10 5.8 V14.2 M5.8 10 H14.2" {...stroke} strokeWidth={1.55} />
        </IconSvg>
      );
    case 'ominus':
      return (
        <IconSvg>
          <circle cx="10" cy="10" r="7.4" {...stroke} strokeWidth={1.45} />
          <path d="M6.4 10 H13.6" {...stroke} strokeWidth={1.55} />
        </IconSvg>
      );
    case 'radical_cation':
      return (
        <IconSvg>
          <circle cx="10" cy="10" r="7.4" {...stroke} strokeWidth={1.45} />
          <circle cx="6.2" cy="6.2" r="1.55" fill="currentColor" />
          <path d="M10 6.4 V13.6 M6.4 10 H13.6" {...stroke} strokeWidth={1.55} />
        </IconSvg>
      );
    case 'radical_anion':
      return (
        <IconSvg>
          <circle cx="10" cy="10" r="7.4" {...stroke} strokeWidth={1.45} />
          <circle cx="6.2" cy="6.2" r="1.55" fill="currentColor" />
          <path d="M6.4 10 H13.6" {...stroke} strokeWidth={1.55} />
        </IconSvg>
      );
    case 'add_explicit_h':
      // Carbon + explicit H (teaching: aldehyde H, etc.)
      return (
        <IconSvg>
          <text
            x="6.2"
            y="13.2"
            textAnchor="middle"
            fontSize="9.5"
            fontWeight="700"
            fontFamily="Arial, Helvetica, sans-serif"
            fill="currentColor"
          >
            C
          </text>
          <line x1="9.2" y1="10" x2="13.2" y2="5.6" {...stroke} strokeWidth={1.45} />
          <text
            x="15.2"
            y="6.2"
            textAnchor="middle"
            fontSize="8.5"
            fontWeight="700"
            fontFamily="Arial, Helvetica, sans-serif"
            fill="currentColor"
          >
            H
          </text>
        </IconSvg>
      );
    case 'lone_pair':
      // Two electron dots only (no atom circle)
      return (
        <IconSvg>
          <circle cx="6.2" cy="10" r="2.6" fill="currentColor" />
          <circle cx="13.8" cy="10" r="2.6" fill="currentColor" />
        </IconSvg>
      );
    case 'free_radical':
      // Single unpaired electron dot only (no atom circle)
      return (
        <IconSvg>
          <circle cx="10" cy="10" r="3.1" fill="currentColor" />
        </IconSvg>
      );
    case 'delta_plus':
      return (
        <IconSvg>
          <text
            x="10"
            y="13.5"
            textAnchor="middle"
            fontSize="11"
            fontWeight="700"
            fontFamily="Georgia, 'Times New Roman', serif"
            fill="currentColor"
          >
            δ+
          </text>
        </IconSvg>
      );
    case 'delta_minus':
      return (
        <IconSvg>
          <text
            x="10"
            y="13.5"
            textAnchor="middle"
            fontSize="11"
            fontWeight="700"
            fontFamily="Georgia, 'Times New Roman', serif"
            fill="currentColor"
          >
            δ−
          </text>
        </IconSvg>
      );
    case 'pencil':
      return <Pencil size={18} strokeWidth={2} />;
    case 'smart_draw':
      return (
        <span className="tool-icon-smart-draw" aria-hidden>
          <Pencil size={18} strokeWidth={2} />
          <Star size={8} strokeWidth={2} fill="currentColor" />
        </span>
      );
    case 'text':
      return <Type size={18} strokeWidth={2} />;
    case 'atom_label':
      return (
        <IconSvg>
          <text
            x="10"
            y="14.5"
            textAnchor="middle"
            fontSize="16"
            fontWeight="400"
            fontFamily="Arial, Helvetica, sans-serif"
            fill="currentColor"
          >
            A
          </text>
        </IconSvg>
      );
    case 'reaction_arrow':
      // Straight reaction arrow (not a generic UI chevron)
      return (
        <IconSvg>
          <line x1="2.5" y1="10" x2="14.5" y2="10" {...stroke} strokeWidth={1.7} />
          <polyline points="11.2,6.2 16.5,10 11.2,13.8" {...stroke} strokeWidth={1.7} />
        </IconSvg>
      );
    case 'shape':
      return <Shapes size={18} strokeWidth={2} />;
    case 'glassware':
      return <Beaker size={20} strokeWidth={2} aria-hidden />;
    case 'sru_bracket':
      // ChemDraw-style [ … ]ₙ polymer brackets
      return (
        <IconSvg>
          <polyline points="6,3.5 3.5,3.5 3.5,16.5 6,16.5" {...stroke} strokeWidth={1.7} />
          <polyline points="14,3.5 16.5,3.5 16.5,16.5 14,16.5" {...stroke} strokeWidth={1.7} />
          <text
            x="16.8"
            y="18.2"
            fontSize="7.5"
            fontWeight="700"
            fontFamily="Arial, Helvetica, sans-serif"
            fill="currentColor"
          >
            n
          </text>
        </IconSvg>
      );
    case 'image':
      return <ImageIcon size={18} strokeWidth={2} />;
    case 'benzene': {
      // Kekulé benzene: flat-top hexagon + three alternating double-bond marks
      const hex = nGonVerts(6, 7.35, 10, 10, true);
      const doubles = [0, 2, 4].map(i => doubleBondAlongEdge(hex[i], hex[(i + 1) % 6]));
      return (
        <IconSvg>
          <polygon points={vertsToPoints(hex)} {...stroke} strokeWidth={1.55} />
          {doubles.map((d, i) => (
            <line
              key={i}
              x1={d.x1}
              y1={d.y1}
              x2={d.x2}
              y2={d.y2}
              {...stroke}
              strokeWidth={1.45}
              strokeLinecap="butt"
            />
          ))}
        </IconSvg>
      );
    }
    case 'hexagon':
      return <RegularNGon sides={6} flatTop r={7.35} />;
    case 'cyclohexane':
      return (
        <IconSvg>
          <polygon points={chairRingIconPoints()} {...stroke} strokeWidth={1.45} />
        </IconSvg>
      );
    case 'boat_cyclohexane':
      return (
        <IconSvg>
          <polygon points={boatRingIconPoints()} {...stroke} strokeWidth={1.45} />
        </IconSvg>
      );
    case 'cyclopentane':
      return <RegularNGon sides={5} r={7.35} />;
    case 'cyclopentadiene': {
      const pent = nGonVerts(5, 7.35);
      // Two conjugated double bonds on adjacent sides
      const d0 = doubleBondAlongEdge(pent[0], pent[1], 10, 10, 0.18, 1.35);
      const d1 = doubleBondAlongEdge(pent[1], pent[2], 10, 10, 0.18, 1.35);
      return (
        <IconSvg>
          <polygon points={vertsToPoints(pent)} {...stroke} strokeWidth={1.55} />
          <line
            x1={d0.x1}
            y1={d0.y1}
            x2={d0.x2}
            y2={d0.y2}
            {...stroke}
            strokeWidth={1.4}
            strokeLinecap="butt"
          />
          <line
            x1={d1.x1}
            y1={d1.y1}
            x2={d1.x2}
            y2={d1.y2}
            {...stroke}
            strokeWidth={1.4}
            strokeLinecap="butt"
          />
        </IconSvg>
      );
    }
    case 'cycloheptane':
      return <RegularNGon sides={7} r={7.2} />;
    case 'cyclooctane':
      return <RegularNGon sides={8} flatTop r={7.1} />;
    case 'cyclobutane':
      return (
        <IconSvg>
          <rect x="4.2" y="4.2" width="11.6" height="11.6" {...stroke} strokeWidth={1.55} />
        </IconSvg>
      );
    case 'cyclopropane':
      return <RegularNGon sides={3} r={7.6} />;
    case 'template_library':
      return <Library size={18} strokeWidth={2} />;
    case 'ligands':
      return (
        <IconSvg>
          <text
            x="10"
            y="14.5"
            textAnchor="middle"
            fontSize="16"
            fontWeight="400"
            fontFamily="Arial, Helvetica, sans-serif"
            fill="currentColor"
          >
            L
          </text>
        </IconSvg>
      );
    case 'functional_groups':
      return (
        <IconSvg>
          <text
            x="10"
            y="14.5"
            textAnchor="middle"
            fontSize="16"
            fontWeight="400"
            fontFamily="Arial, Helvetica, sans-serif"
            fill="currentColor"
          >
            R
          </text>
        </IconSvg>
      );
    case 'stamp_delta':
    case 'stamp_delta_tri':
    case 'stamp_nu':
    case 'stamp_ts':
    case 'stamp_celsius': {
      const label =
        toolId === 'stamp_delta'
          ? 'Δ'
          : toolId === 'stamp_delta_tri'
            ? '△'
            : toolId === 'stamp_nu'
              ? 'ν'
              : toolId === 'stamp_ts'
                ? '‡'
                : '°C';
      return (
        <IconSvg>
          <text
            x="10"
            y="14"
            textAnchor="middle"
            fontSize={label.length > 2 ? 9 : 13}
            fontWeight="700"
            fontFamily="Arial, Helvetica, sans-serif"
            fill="currentColor"
          >
            {label}
          </text>
        </IconSvg>
      );
    }
    case 'orbital_s':
      return (
        <IconSvg>
          <defs>
            <radialGradient id="md-orb-s" cx="38%" cy="32%" r="68%">
              <stop offset="0%" stopColor="#f3f3f3" />
              <stop offset="100%" stopColor="currentColor" />
            </radialGradient>
          </defs>
          <circle cx="10" cy="10" r="6.4" fill="url(#md-orb-s)" stroke="currentColor" strokeWidth="1.2" />
        </IconSvg>
      );
    case 'orbital_p':
      return (
        <IconSvg>
          <ellipse cx="6.2" cy="13.6" rx="3.1" ry="4.6" transform="rotate(-45 6.2 13.6)" fill="currentColor" />
          <ellipse cx="13.8" cy="6.4" rx="3.1" ry="4.6" transform="rotate(-45 13.8 6.4)" fill="none" stroke="currentColor" strokeWidth="1.25" />
        </IconSvg>
      );
    case 'orbital_p2':
      return (
        <IconSvg>
          <ellipse cx="6.2" cy="6.4" rx="3.1" ry="4.6" transform="rotate(45 6.2 6.4)" fill="none" stroke="currentColor" strokeWidth="1.25" />
          <ellipse cx="13.8" cy="13.6" rx="3.1" ry="4.6" transform="rotate(45 13.8 13.6)" fill="currentColor" />
        </IconSvg>
      );
    case 'orbital_d':
      return (
        <IconSvg>
          <ellipse cx="6.4" cy="6.4" rx="2.4" ry="3.5" transform="rotate(-45 6.4 6.4)" fill="none" stroke="currentColor" strokeWidth="1.15" />
          <ellipse cx="13.6" cy="6.4" rx="2.4" ry="3.5" transform="rotate(45 13.6 6.4)" fill="currentColor" />
          <ellipse cx="6.4" cy="13.6" rx="2.4" ry="3.5" transform="rotate(45 6.4 13.6)" fill="currentColor" />
          <ellipse cx="13.6" cy="13.6" rx="2.4" ry="3.5" transform="rotate(-45 13.6 13.6)" fill="none" stroke="currentColor" strokeWidth="1.15" />
        </IconSvg>
      );
    case 'orbital_dz2':
      return (
        <IconSvg>
          <ellipse cx="6.4" cy="13.6" rx="2.6" ry="4.2" transform="rotate(-45 6.4 13.6)" fill="currentColor" />
          <ellipse cx="13.6" cy="6.4" rx="2.6" ry="4.2" transform="rotate(-45 13.6 6.4)" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <ellipse cx="10" cy="10" rx="4.6" ry="1.7" fill="none" stroke="currentColor" strokeWidth="1.15" />
        </IconSvg>
      );
    default:
      return null;
  }
};
