/**
 * Text-box resize: corners scale font+box; edges change frame and grow height to wrap.
 * Opposite corner/edge stays world-fixed.
 * Run: npx tsx --tsconfig tsconfig.app.json packages/canvas/src/geometry/__tests__/canvasTextResizeSmoke.ts
 */
import type { CanvasText } from '@moldraw/domain';
import {
  canvasTextFitContentPatch,
  canvasTextResizePatch,
  getCanvasTextBox,
  getCanvasTextHandleWorld,
  pickCanvasTextResizeHandle,
  type CanvasTextBox,
  type CanvasTextResizeHandle,
} from '../canvasText';

const fail = (msg: string): never => {
  throw new Error(msg);
};
const ok = (cond: unknown, msg: string): void => {
  if (!cond) fail(msg);
};
const close = (a: number, b: number, msg: string, eps = 0.05): void => {
  if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a - b) > eps) {
    fail(`${msg}: ${a} vs ${b}`);
  }
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

const asBox = (t: CanvasText): CanvasTextBox => {
  const w = t.boxWidth ?? 0;
  const h = t.boxHeight ?? 0;
  return {
    width: w,
    height: h,
    left: t.x - w / 2,
    right: t.x + w / 2,
    top: t.y - h / 2,
    bottom: t.y + h / 2,
    cx: t.x,
    cy: t.y,
    rotationRad: t.rotationRad ?? 0,
  };
};

const pinOf = (t: CanvasText, handle: CanvasTextResizeHandle) =>
  getCanvasTextHandleWorld(asBox(t), handle);

const assertPin = (
  before: CanvasText,
  patch: Partial<CanvasText>,
  handle: CanvasTextResizeHandle,
  label: string,
) => {
  const a = pinOf(before, handle);
  const b = pinOf({ ...before, ...patch }, handle);
  close(b.x, a.x, `${label} keeps ${handle} x`);
  close(b.y, a.y, `${label} keeps ${handle} y`);
};

const se = canvasTextResizePatch(orig, 'se', 140, 70);
ok((se.fontSize ?? 0) > 22, `corner scales fontSize ${se.fontSize}`);
ok((se.boxWidth ?? 0) > 200, `se grows width ${se.boxWidth}`);
ok((se.boxHeight ?? 0) > 80, `se grows height ${se.boxHeight}`);
ok(Number.isFinite(se.x) && Number.isFinite(se.y), `se center is finite ${se.x},${se.y}`);
assertPin(orig, se, 'nw', 'se');

const nw = canvasTextResizePatch(orig, 'nw', -40, -20);
ok((nw.fontSize ?? 22) < 22, `inward corner shrinks font ${nw.fontSize}`);
ok((nw.boxWidth ?? 200) < 200, `nw shrinks width ${nw.boxWidth}`);
assertPin(orig, nw, 'se', 'nw');

const e = canvasTextResizePatch(orig, 'e', 180, 15);
ok(e.fontSize == null, 'edge patch does not touch fontSize');
ok((e.boxWidth ?? 0) > 200, `e grows width ${e.boxWidth}`);
close(e.boxHeight ?? -1, 80, 'e keeps height when there is slack');
close(e.y ?? orig.y, orig.y, 'e keeps y');
assertPin(orig, e, 'w', 'e');

const n = canvasTextResizePatch(orig, 'n', 0, -80);
ok((n.boxHeight ?? 0) > 80, `n grows height ${n.boxHeight}`);
close(n.boxWidth ?? -1, 200, 'n keeps width');
close(n.x ?? orig.x, orig.x, 'n keeps x');
ok(n.fontSize == null, 'n does not change font');
assertPin(orig, n, 's', 'n');

const w = canvasTextResizePatch(orig, 'w', -40, 0);
ok((w.boxWidth ?? 0) < 200, `w shrinks width ${w.boxWidth}`);
ok(w.fontSize == null, 'w does not change font');
assertPin(orig, w, 'e', 'w');

const s = canvasTextResizePatch(orig, 's', 0, 80);
ok((s.boxHeight ?? 0) > 80, `s grows height ${s.boxHeight}`);
assertPin(orig, s, 'n', 's');

const long: CanvasText = {
  ...orig,
  text: 'Hello wrap me please again and again and again',
  boxHeight: 40,
};
const skinny = canvasTextResizePatch(long, 'e', -20, 0, 56, 28, ctx);
ok((skinny.boxWidth ?? 200) < 200, `e inward shrinks width ${skinny.boxWidth}`);
ok(
  (skinny.boxHeight ?? 0) > 40,
  `e inward grows height to wrapped content ${skinny.boxHeight}`,
);
assertPin(long, skinny, 'w', 'e wrap-grow');

const skinnyW = canvasTextResizePatch(long, 'w', 20, 0, 56, 28, ctx);
ok((skinnyW.boxHeight ?? 0) > 40, `w inward grows height to wrap ${skinnyW.boxHeight}`);
assertPin(long, skinnyW, 'e', 'w wrap-grow');

const fitted = canvasTextFitContentPatch(ctx, { ...long, ...skinny });
ok(
  (fitted.boxHeight ?? skinny.boxHeight ?? 0) >= (skinny.boxHeight ?? 0),
  'fit patch does not shrink below wrap height',
);

const boxed: CanvasText = { ...long, boxWidth: 80, boxHeight: 28 };
const frame = getCanvasTextBox(ctx, boxed);
const contentH = canvasTextFitContentPatch(ctx, boxed).boxHeight ?? frame.height;
ok(frame.height >= contentH - 0.5, `frame grows to content ${frame.height} vs ${contentH}`);
ok(frame.height > 28, `does not honor a clipping height ${frame.height}`);

const growDown = canvasTextFitContentPatch(ctx, boxed, { staticHandle: 'n' });
ok((growDown.boxHeight ?? 0) > 28, `fit with pin grows height ${growDown.boxHeight}`);
assertPin(boxed, growDown, 'n', 'fit grow-down');

const rot: CanvasText = { ...orig, rotationRad: Math.PI / 4 };
const seRot = canvasTextResizePatch(rot, 'se', 80, 80);
assertPin(rot, seRot, 'nw', 'rotated se');
const eRot = canvasTextResizePatch(rot, 'e', 80, 0);
assertPin(rot, eRot, 'w', 'rotated e');

ok(pickCanvasTextResizeHandle(ctx, orig, 100, 0, 1) === 'e', 'picks east mid-handle');
ok(pickCanvasTextResizeHandle(ctx, orig, 0, -40, 1) === 'n', 'picks north mid-handle');
ok(pickCanvasTextResizeHandle(ctx, orig, 100, -40, 1) === 'ne', 'picks ne corner');

console.log('canvasTextResizeSmoke: ok');
