/**
 * Text-box resize: corners change W+H, edges change one axis, font stays put.
 * Run: npx tsx --tsconfig tsconfig.app.json packages/canvas/src/geometry/__tests__/canvasTextResizeSmoke.ts
 */
import type { CanvasText } from '@moldraw/domain';
import {
  canvasTextResizePatch,
  getCanvasTextBox,
  pickCanvasTextResizeHandle,
} from '../canvasText';

const fail = (msg: string): never => {
  throw new Error(msg);
};
const ok = (cond: unknown, msg: string): void => {
  if (!cond) fail(msg);
};
const close = (a: number, b: number, msg: string, eps = 0.05): void => {
  if (Math.abs(a - b) > eps) fail(`${msg}: ${a} vs ${b}`);
};

const ctx = {
  font: '22px Inter, sans-serif',
  measureText: (s: string) => ({ width: Math.max(1, (s || ' ').length * 10) }),
} as unknown as CanvasRenderingContext2D;

const orig: CanvasText = {
  id: 't1',
  x: 0,
  y: 0,
  text: 'Hello wrap me please',
  fontSize: 22,
  color: '#0f172a',
  boxWidth: 200,
  boxHeight: 80,
};

const se = canvasTextResizePatch(orig, 'se', 140, 70);
ok(se.fontSize == null, 'corner patch does not touch fontSize');
ok((se.boxWidth ?? 0) > 200, `se grows width ${se.boxWidth}`);
ok((se.boxHeight ?? 0) > 80, `se grows height ${se.boxHeight}`);

const e = canvasTextResizePatch(orig, 'e', 180, 15);
ok(e.fontSize == null, 'edge patch does not touch fontSize');
ok((e.boxWidth ?? 0) > 200, `e grows width ${e.boxWidth}`);
close(e.boxHeight ?? -1, 80, 'e keeps height');
close(e.y ?? orig.y, orig.y, 'e keeps y');

const n = canvasTextResizePatch(orig, 'n', 0, -80);
ok((n.boxHeight ?? 0) > 80, `n grows height ${n.boxHeight}`);
close(n.boxWidth ?? -1, 200, 'n keeps width');
close(n.x ?? orig.x, orig.x, 'n keeps x');

const w = canvasTextResizePatch(orig, 'w', -40, 0);
ok((w.boxWidth ?? 0) < 200, `w shrinks width ${w.boxWidth}`);
close(w.boxHeight ?? -1, 80, 'w keeps height');

const shrinkH = canvasTextResizePatch(orig, 's', 0, 10);
ok((shrinkH.boxHeight ?? 80) < 80, `s shrinks height ${shrinkH.boxHeight}`);
close(shrinkH.boxWidth ?? -1, 200, 's keeps width');

const boxed: CanvasText = { ...orig, ...shrinkH };
const frame = getCanvasTextBox(ctx, boxed);
ok(frame.height < 80, `honors shrunk frame ${frame.height}`);

ok(pickCanvasTextResizeHandle(ctx, orig, 100, 0, 1) === 'e', 'picks east mid-handle');
ok(pickCanvasTextResizeHandle(ctx, orig, 0, -40, 1) === 'n', 'picks north mid-handle');
ok(pickCanvasTextResizeHandle(ctx, orig, 100, -40, 1) === 'ne', 'picks ne corner');

console.log('canvasTextResizeSmoke: ok');
