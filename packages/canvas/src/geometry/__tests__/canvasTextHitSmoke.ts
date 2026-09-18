/**
 * Text-box hit tests: padded grab vs glyph content vs I-beam/grab cursor.
 * Run: npx tsx --tsconfig tsconfig.app.json packages/canvas/src/geometry/__tests__/canvasTextHitSmoke.ts
 */
import type { CanvasText } from '@moldraw/domain';
import {
  canvasTextCursorAt,
  canvasTextHitPadWorld,
  getCanvasTextBox,
  hitCanvasTextBox,
  pickCanvasTextAt,
  pickCanvasTextContentAt,
} from '../canvasText';

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

const label: CanvasText = {
  id: 't1',
  x: 0,
  y: 0,
  text: 'Hello',
  fontSize: 22,
  color: '#0f172a',
  boxWidth: 200,
  boxHeight: 80,
};

const box = getCanvasTextBox(ctx, label);
ok(box.width >= 200, `box width ${box.width}`);
ok(box.height >= 80, `box height ${box.height}`);

ok(pickCanvasTextAt(ctx, [label], 0, 0), 'center of box is a hit');
ok(!pickCanvasTextAt(ctx, [label], box.right + 1, 0), 'just outside exact box misses');

const idlePad = canvasTextHitPadWorld(1, 'idle');
ok(idlePad > 0, 'idle pad is positive');
ok(
  pickCanvasTextAt(ctx, [label], box.right + idlePad * 0.5, 0, idlePad),
  'idle pad catches a near-miss on the frame',
);

const grabPad = canvasTextHitPadWorld(1, 'selected');
ok(grabPad > idlePad, 'selected grab pad is more generous than idle');
ok(
  hitCanvasTextBox(box, box.right + grabPad * 0.8, 0, grabPad),
  'selected pad hits well outside the painted frame',
);
ok(
  !hitCanvasTextBox(box, box.right + grabPad + 2, 0, grabPad),
  'selected pad still has an outer miss',
);

ok(pickCanvasTextContentAt(ctx, label, 0, 0) === false, 'wide-box center (empty interior) is not glyphs');
ok(pickCanvasTextContentAt(ctx, label, -box.width / 2 + 20, 0), 'left-aligned letters are a content hit');

const empty: CanvasText = { ...label, id: 'empty', text: '' };
ok(!pickCanvasTextContentAt(ctx, empty, 0, 0), 'empty label has no glyph hit');

ok(canvasTextCursorAt(ctx, [label], null, 0, 0, 1) === 'grab', 'unselected box shows grab');
ok(
  canvasTextCursorAt(ctx, [label], 't1', box.right, 0, 1) === 'ew-resize',
  'east mid-handle shows ew-resize',
);
ok(
  canvasTextCursorAt(ctx, [label], 't1', box.right + grabPad * 0.5, 20, 1) === 'grab',
  'selected frame slop away from handles shows grab',
);
ok(
  canvasTextCursorAt(ctx, [label], 't1', -box.width / 2 + 20, 0, 1, { editing: true }) === 'text',
  'inside a selected box shows I-beam',
);
ok(
  canvasTextCursorAt(ctx, [label], 't1', 0, 0, 1, { editing: true }) === 'text',
  'selected interior (empty padding) is still I-beam — click edits',
);
ok(
  canvasTextCursorAt(ctx, [label], 't1', 0, 0, 1) === 'text',
  'selected box interior shows I-beam even before edit',
);

console.log('canvasTextHitSmoke: ok');
