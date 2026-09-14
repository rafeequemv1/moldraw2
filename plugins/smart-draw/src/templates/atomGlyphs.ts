import { normalizeUnistroke, type GlyphTemplate } from '../recognize/dollarOne';
import type { Point } from '../recognize/types';

const line = (x1: number, y1: number, x2: number, y2: number, n = 16): Point[] => {
  const pts: Point[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    pts.push({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t });
  }
  return pts;
};

const circle = (cx: number, cy: number, r: number, n = 48): Point[] => {
  const pts: Point[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    pts.push({ x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) });
  }
  return pts;
};

const concat = (...parts: Point[][]): Point[] => parts.flat();

const RAW: { name: string; points: Point[] }[] = [
  { name: 'O', points: circle(0, 0, 1) },
  {
    name: 'N',
    points: concat(line(0, 1, 0, 0), line(0, 0, 1, 1), line(1, 1, 1, 0)),
  },
  {
    name: 'S',
    points: Array.from({ length: 48 }, (_, i) => {
      const t = i / 47;
      return { x: Math.sin(t * Math.PI * 2) * 0.55, y: 1 - t * 2 };
    }),
  },
  {
    name: 'F',
    points: concat(line(0, 1, 0, 0), line(0, 1, 0.75, 1), line(0, 0.5, 0.5, 0.5)),
  },
  {
    name: 'P',
    points: concat(line(0, 0, 0, 1), line(0, 1, 0.55, 1), line(0.55, 1, 0.55, 0.5), line(0.55, 0.5, 0, 0.5)),
  },
  {
    name: 'H',
    points: concat(line(0, 0, 0, 1), line(0, 0.5, 1, 0.5), line(1, 1, 1, 0)),
  },
  { name: 'I', points: line(0.5, 0, 0.5, 1) },
  {
    name: '+',
    points: concat(line(0.5, 0, 0.5, 1), line(0, 0.5, 1, 0.5)),
  },
  { name: '-', points: line(0, 0.5, 1, 0.5) },
  {
    name: 'Cl',
    points: concat(
      Array.from({ length: 24 }, (_, i) => {
        const t = (i / 23) * Math.PI * 1.4 + 0.4;
        return { x: Math.cos(t) * 0.55, y: Math.sin(t) * 0.7 };
      }),
      line(0.85, 1, 0.85, 0),
    ),
  },
  {
    name: 'Br',
    points: concat(
      line(0, 0, 0, 1),
      line(0, 1, 0.45, 1),
      line(0.45, 1, 0.45, 0.55),
      line(0.45, 0.55, 0, 0.55),
      line(0.7, 0.55, 1, 0),
    ),
  },
  {
    name: 'C',
    points: Array.from({ length: 28 }, (_, i) => {
      const t = 0.45 + (i / 27) * 1.7;
      return { x: Math.cos(t) * 0.7, y: Math.sin(t) * 0.9 };
    }),
  },
  {
    name: 'B',
    points: concat(
      line(0, 0, 0, 1),
      line(0, 1, 0.5, 1),
      line(0.5, 1, 0.5, 0.5),
      line(0.5, 0.5, 0, 0.5),
      line(0, 0.5, 0.55, 0.5),
      line(0.55, 0.5, 0.55, 0),
      line(0.55, 0, 0, 0),
    ),
  },
  {
    name: 'R',
    points: concat(
      line(0, 0, 0, 1),
      line(0, 1, 0.5, 1),
      line(0.5, 1, 0.5, 0.5),
      line(0.5, 0.5, 0, 0.5),
      line(0.15, 0.5, 0.6, 0),
    ),
  },
  {
    name: 'K',
    points: concat(line(0, 0, 0, 1), line(0.55, 1, 0, 0.5), line(0, 0.5, 0.55, 0)),
  },
  {
    name: 'A',
    points: concat(line(0, 0, 0.5, 1), line(0.5, 1, 1, 0), line(0.22, 0.4, 0.78, 0.4)),
  },
  {
    name: 'E',
    points: concat(line(0, 0, 0, 1), line(0, 1, 0.7, 1), line(0, 0.5, 0.55, 0.5), line(0, 0, 0.7, 0)),
  },
  {
    name: 'T',
    points: concat(line(0, 1, 1, 1), line(0.5, 1, 0.5, 0)),
  },
  {
    name: 'M',
    points: concat(line(0, 0, 0, 1), line(0, 1, 0.5, 0.35), line(0.5, 0.35, 1, 1), line(1, 1, 1, 0)),
  },
  {
    name: 'L',
    points: concat(line(0, 1, 0, 0), line(0, 0, 0.7, 0)),
  },
  {
    name: 'D',
    points: concat(
      line(0, 0, 0, 1),
      line(0, 1, 0.45, 1),
      Array.from({ length: 16 }, (_, i) => {
        const t = -Math.PI / 2 + (i / 15) * Math.PI;
        return { x: 0.45 + Math.cos(t) * 0.45, y: 0.5 + Math.sin(t) * 0.5 };
      }),
      line(0.45, 0, 0, 0),
    ),
  },
  {
    name: 'G',
    points: concat(
      Array.from({ length: 22 }, (_, i) => {
        const t = 0.35 + (i / 21) * 1.85;
        return { x: Math.cos(t) * 0.7, y: Math.sin(t) * 0.9 };
      }),
      line(0.7, 0, 0.25, 0),
    ),
  },
  {
    name: 'X',
    points: concat(line(0, 1, 1, 0), line(0, 0, 1, 1)),
  },
];

export const ATOM_GLYPH_TEMPLATES: GlyphTemplate[] = RAW.map(t => ({
  name: t.name,
  points: normalizeUnistroke(t.points),
}));
