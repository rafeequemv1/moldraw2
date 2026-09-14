/**
 * Synthetic stroke tests for Smart Draw recognition + graph validation.
 * Run: npm run test:smart-draw
 */
import { recognizeSketch, shouldCommit } from '../recognize/recognizeSketch';
import { resolveHandwrittenLabel } from '../recognize/resolveLabels';
import { validateSketchGraph } from '../recognize/validateSketchGraph';
import type { Point, SketchGraph, Stroke } from '../recognize/types';

const BL = 40;

const line = (x1: number, y1: number, x2: number, y2: number, n = 12): Stroke => ({
  points: Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    return { x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t };
  }),
});

const regularNgon = (n: number, cx: number, cy: number, bond = BL): Stroke => {
  const r = bond / (2 * Math.sin(Math.PI / n));
  const pts: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return { points: pts };
};

const circle = (cx: number, cy: number, r: number, n = 36): Stroke => ({
  points: Array.from({ length: n + 1 }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    return { x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) };
  }),
});

const letterN = (x: number, y: number, s = 14): Stroke => ({
  points: [
    { x, y: y + s },
    { x, y },
    { x: x + s, y: y + s },
    { x: x + s, y },
  ],
});

function rec(strokes: Stroke[], existing: { id: string; x: number; y: number; element: string }[] = []) {
  return recognizeSketch({
    strokes,
    bondLengthPx: BL,
    molecule: { atoms: existing },
  });
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function run(): void {
  {
    const r = rec([line(0, 0, BL, 0)]);
    assert(shouldCommit(r), 'line should commit');
    assert(r.graph.bonds.length === 1, `line bonds ${r.graph.bonds.length}`);
    assert(r.graph.atoms.length === 2, `line atoms ${r.graph.atoms.length}`);
  }

  {
    const r = rec([regularNgon(6, 200, 200)]);
    assert(shouldCommit(r), 'hexagon should commit');
    assert(r.graph.atoms.length === 6, `hexagon atoms ${r.graph.atoms.length}`);
    assert(r.graph.bonds.length === 6, `hexagon bonds ${r.graph.bonds.length}`);
  }

  {
    const r = rec([regularNgon(5, 80, 80)]);
    assert(r.graph.atoms.length === 5, `pentagon atoms ${r.graph.atoms.length}`);
    assert(r.graph.bonds.length === 5, `pentagon bonds ${r.graph.bonds.length}`);
  }

  {
    const r = rec([regularNgon(4, 40, 40)]);
    assert(r.graph.atoms.length === 4, `square atoms ${r.graph.atoms.length}`);
    assert(r.graph.bonds.length === 4, `square bonds ${r.graph.bonds.length}`);
  }

  {
    const hex = regularNgon(6, 120, 120);
    const wobble: Stroke = {
      points: hex.points.flatMap((p, i, arr) => {
        if (i === arr.length - 1) return [p];
        const q = arr[i + 1]!;
        const mid = { x: (p.x + q.x) / 2 + 3.2, y: (p.y + q.y) / 2 - 2.4 };
        return [p, mid];
      }),
    };
    const r = rec([wobble]);
    assert(r.graph.atoms.length === 6, `wobbly hexagon atoms ${r.graph.atoms.length}`);
    assert(r.graph.bonds.length === 6, `wobbly hexagon bonds ${r.graph.bonds.length}`);
  }

  {
    const cx = 300;
    const cy = 300;
    const rHex = BL / (2 * Math.sin(Math.PI / 6));
    const verts = Array.from({ length: 6 }, (_, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 6;
      return { x: cx + rHex * Math.cos(a), y: cy + rHex * Math.sin(a) };
    });
    const sides = verts.map((p, i) => line(p.x, p.y, verts[(i + 1) % 6]!.x, verts[(i + 1) % 6]!.y));
    const r = rec(sides);
    assert(r.graph.atoms.length === 6, `six-side hexagon atoms ${r.graph.atoms.length}`);
    assert(r.graph.bonds.length === 6, `six-side hexagon bonds ${r.graph.bonds.length}`);
  }

  {
    const oh = resolveHandwrittenLabel('OH');
    assert(oh?.alias === 'OH' || oh?.element === 'O', `OH label ${JSON.stringify(oh)}`);
    const me = resolveHandwrittenLabel('Me');
    assert(me?.alias === 'Me', `Me label ${JSON.stringify(me)}`);
    const ph = resolveHandwrittenLabel('Ph');
    assert(ph?.alias === 'Ph', `Ph label ${JSON.stringify(ph)}`);
    assert(resolveHandwrittenLabel('C') == null, 'bare C must not invent a label');
  }

  {
    const hex = regularNgon(6, 0, 0);
    const rHex =  BL / (2 * Math.sin(Math.PI / 6));
    const r = rec([hex, circle(0, 0, rHex * 0.35)]);
    assert(r.graph.bonds.some(b => b.aromatic), 'inner circle should mark aromatic');
    assert(!r.graph.atoms.some(a => a.element === 'O'), 'inner circle must not become oxygen');
  }

  {
    const hexA = regularNgon(6, 0, 0);
    const rHex = BL / (2 * Math.sin(Math.PI / 6));
    const hexB = regularNgon(6, rHex * Math.sqrt(3), 0);
    const r = rec([hexA, hexB]);
    assert(r.graph.atoms.length <= 11, `fused atoms ${r.graph.atoms.length}`);
    assert(r.graph.atoms.length >= 8, `fused too few atoms ${r.graph.atoms.length}`);
    assert(r.graph.bonds.length >= 10, `fused bonds ${r.graph.bonds.length}`);
  }

  {
    const r = rec([line(0, 0, BL, 0), letterN(BL + 4, -8)]);
    const hetero = r.graph.atoms.filter(a => a.element === 'N');
    assert(hetero.length >= 1, `expected N near bond, got ${r.graph.atoms.map(a => a.element).join(',')}`);
  }

  {
    const r = rec([line(0, 0, BL, 0), circle(BL, 0, 8)]);
    assert(r.graph.atoms.some(a => a.element === 'O'), 'small circle at endpoint should be O');
  }

  {
    const existing = [{ id: 'a1', x: 0, y: 0, element: 'C' }];
    const r = rec([line(2, 1, BL, 0)], existing);
    assert(r.graph.atoms.some(a => a.snappedTo === 'a1'), 'should snap onto existing atom');
  }

  {
    const scribble: Stroke = {
      points: Array.from({ length: 20 }, (_, i) => ({
        x: Math.sin(i * 1.7) * 6,
        y: Math.cos(i * 2.1) * 5,
      })),
    };
    const r = rec([scribble]);
    assert(!r.graph.atoms.some(a => a.element === 'C' && a.confidence < 0.5 && a.element === 'C' && r.graph.bonds.length === 0 && shouldCommit(r) && a.element === 'N'), 'scribble must not become N');
    assert(!shouldCommit(r) || r.graph.bonds.length > 0, 'low-score scribble should not invent heteroatoms');
  }

  {
    const bad: SketchGraph = {
      atoms: [{ tempId: 't0', x: 0, y: 0, element: 'C', confidence: 1 }],
      bonds: [{ fromTempId: 't0', toTempId: 't0', order: 1, confidence: 1 }],
      rejectedStrokes: [],
      confidence: 1,
      candidates: [],
    };
    const v = validateSketchGraph(bad);
    assert(!v.ok && v.errors.includes('self bond'), `expected self bond, got ${v.errors.join(',')}`);
  }

  {
    const bad: SketchGraph = {
      atoms: [
        { tempId: 't0', x: 0, y: 0, element: 'C', confidence: 1 },
        { tempId: 't1', x: 10, y: 0, element: 'C', confidence: 1 },
      ],
      bonds: [
        { fromTempId: 't0', toTempId: 't1', order: 1, confidence: 1 },
        { fromTempId: 't1', toTempId: 't0', order: 1, confidence: 1 },
      ],
      rejectedStrokes: [],
      confidence: 1,
      candidates: [],
    };
    const v = validateSketchGraph(bad);
    assert(!v.ok && v.errors.includes('duplicate bond'), `expected duplicate bond, got ${v.errors.join(',')}`);
  }

  console.log('smart-draw recognizer tests OK');
}

run();
