/**
 * Wrapped canvas text must advance y by line-height so glyphs never stack.
 * Run: npx tsx --tsconfig tsconfig.app.json packages/canvas/src/geometry/__tests__/canvasTextWrapSmoke.ts
 */
import type { CanvasText } from '@moldraw/domain';
import { canvasTextLineHeight, measureCanvasTextBox, wrapCanvasTextLines } from '../canvasText';

const fail = (msg: string): never => {
  throw new Error(msg);
};
const ok = (cond: unknown, msg: string): void => {
  if (!cond) fail(msg);
};

const ctx = {
  font: '22px Inter, sans-serif',
  measureText: (s: string) => ({ width: Math.max(1, (s || ' ').length * 10) }),
} as unknown as CanvasRenderingContext2D;

const wrapped = wrapCanvasTextLines(
  ctx,
  'COLORS BUT I CANT USE THE SPACE BAR',
  80,
);
ok(wrapped.length >= 3, `expected several wrap lines, got ${wrapped.length}: ${JSON.stringify(wrapped)}`);
ok(
  wrapped.every(line => line.length > 0 || true),
  'lines exist',
);
ok(
  wrapped.join(' ').replace(/\s+/g, ' ').includes('SPACE'),
  `spaces must survive wrap: ${JSON.stringify(wrapped)}`,
);

const label: CanvasText = {
  id: 't1',
  x: 0,
  y: 0,
  text: 'COLORS BUT I CANT USE THE SPACE BAR',
  fontSize: 22,
  color: '#0f172a',
  boxWidth: 100,
};
const measured = measureCanvasTextBox(ctx, label);
const lh = canvasTextLineHeight(label);
ok(measured.lines.length >= 2, `measure should wrap, got ${measured.lines.length} lines`);
ok(measured.lineHeight >= lh - 0.01, `lineHeight ${measured.lineHeight} < ${lh}`);
ok(
  measured.totalH + 0.01 >= measured.lines.length * measured.lineHeight,
  `totalH ${measured.totalH} does not cover ${measured.lines.length} × ${measured.lineHeight}`,
);
const ys = measured.lines.map((_, i) => (i - (measured.lines.length - 1) / 2) * measured.lineHeight);
for (let i = 1; i < ys.length; i++) {
  ok(ys[i]! - ys[i - 1]! >= measured.lineHeight - 0.01, `line ${i} overlaps line ${i - 1}`);
}

const unwrapped = wrapCanvasTextLines(ctx, 'Hello\nWorld', Infinity);
ok(unwrapped.length === 2 && unwrapped[0] === 'Hello' && unwrapped[1] === 'World', 'hard breaks kept');

console.log('canvasTextWrapSmoke: ok');
