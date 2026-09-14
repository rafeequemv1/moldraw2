import { matchUnistroke } from './dollarOne';
import { bboxOf, circularity, pathLength } from './simplify';
import { ATOM_GLYPH_TEMPLATES } from '../templates/atomGlyphs';
import { GLYPH_ACCEPT, type RecognitionCandidate, type Stroke } from './types';

export interface GlyphHit {
  strokeIndex: number;
  name: string;
  confidence: number;
  cx: number;
  cy: number;
  radius: number;
}

export function isSmallMark(stroke: Stroke, bondLengthPx: number): boolean {
  const len = pathLength(stroke.points);
  const box = bboxOf(stroke.points);
  return box.diag < 0.72 * bondLengthPx && len < 1.65 * bondLengthPx;
}

export function detectGlyphs(strokes: Stroke[], bondLengthPx: number): {
  glyphs: GlyphHit[];
  used: Set<number>;
  candidates: RecognitionCandidate[];
} {
  const glyphs: GlyphHit[] = [];
  const used = new Set<number>();
  const candidates: RecognitionCandidate[] = [];

  strokes.forEach((stroke, i) => {
    if (!isSmallMark(stroke, bondLengthPx)) return;
    const box = bboxOf(stroke.points);
    const circ = circularity(stroke.points);
    const radius = box.diag / 2;
    const cx = (box.minX + box.maxX) / 2;
    const cy = (box.minY + box.maxY) / 2;

    if (circ > 0.82 && radius < 0.45 * bondLengthPx) {
      const confidence = Math.min(0.98, 0.8 + circ * 0.2);
      if (confidence >= GLYPH_ACCEPT.O) {
        glyphs.push({ strokeIndex: i, name: 'O', confidence, cx, cy, radius });
        used.add(i);
        candidates.push({ type: 'atom', confidence, geometry: { name: 'O', cx, cy } });
        return;
      }
    }

    const hit = matchUnistroke(stroke.points, ATOM_GLYPH_TEMPLATES);
    if (!hit) return;
    const need = GLYPH_ACCEPT[hit.name] ?? 0.92;
    candidates.push({ type: hit.name === '+' || hit.name === '-' ? 'charge' : 'atom', confidence: hit.score, geometry: hit });
    if (hit.score < need) return;
    if (hit.name === 'I' && pathLength(stroke.points) > 0.55 * bondLengthPx) return;
    if (hit.name === '-' && pathLength(stroke.points) > 0.5 * bondLengthPx) return;
    glyphs.push({ strokeIndex: i, name: hit.name, confidence: hit.score, cx, cy, radius });
    used.add(i);
  });

  // Pair leftover small marks for Cl / Br.
  const unusedSmall = strokes
    .map((s, i) => ({ s, i }))
    .filter(({ i, s }) => !used.has(i) && isSmallMark(s, bondLengthPx));
  for (let a = 0; a < unusedSmall.length; a++) {
    for (let b = a + 1; b < unusedSmall.length; b++) {
      const A = unusedSmall[a]!;
      const B = unusedSmall[b]!;
      const ba = bboxOf(A.s.points);
      const bb = bboxOf(B.s.points);
      const cxa = (ba.minX + ba.maxX) / 2;
      const cya = (ba.minY + ba.maxY) / 2;
      const cxb = (bb.minX + bb.maxX) / 2;
      const cyb = (bb.minY + bb.maxY) / 2;
      if (Math.hypot(cxa - cxb, cya - cyb) > 0.7 * bondLengthPx) continue;
      const combined = { points: [...A.s.points, ...B.s.points] };
      const hit = matchUnistroke(combined.points, ATOM_GLYPH_TEMPLATES.filter(t => t.name === 'Cl' || t.name === 'Br'));
      if (!hit) continue;
      const need = GLYPH_ACCEPT[hit.name] ?? 0.92;
      if (hit.score < need) continue;
      glyphs.push({
        strokeIndex: A.i,
        name: hit.name,
        confidence: hit.score,
        cx: (cxa + cxb) / 2,
        cy: (cya + cyb) / 2,
        radius: 0.3 * bondLengthPx,
      });
      used.add(A.i);
      used.add(B.i);
      candidates.push({ type: 'atom', confidence: hit.score, geometry: hit });
    }
  }

  return { glyphs, used, candidates };
}
