/**
 * Canvas touch / pen / multi-pointer support.
 *
 * Owns palm rejection, pinch-pan math, long-press context menu, and
 * pointer-capture helpers. Wired from `useCanvasInput` + `useCanvasViewport`.
 */
export {
  CANVAS_TOUCH_CLASS,
  PALM_MAX_CONTACT_SIZE_PX,
  PEN_PALM_MAX_CONTACT_SIZE_PX,
  PINCH_SCALE_EPSILON,
  MULTI_PAN_EPSILON_PX,
  TOUCH_LONG_PRESS_MS,
  TOUCH_LONG_PRESS_SLOP_PX,
  POINTER_COALESCE_MS,
  PEN_COALESCE_MS,
} from './constants';

export type {
  PointerLike,
  TrackedPointer,
  MultiTouchGestureKind,
  PinchPanSample,
  PinchPanDelta,
} from './types';

export {
  isLikelyPalm,
  isDrawingPointer,
  isTouchPointer,
  isPenPointer,
} from './palmRejection';

export { sampleTwoPointers, deltaPinchPan, pickTwoPointers } from './gestures';

export type { CanvasPointerEvent } from './pointerUtils';
export {
  asPointerLike,
  isPrimaryButton,
  isMiddleButton,
  isSecondaryButton,
  captureCanvasPointer,
  releaseCanvasPointer,
} from './pointerUtils';

export { useTouchLongPress } from './useTouchLongPress';
export type {
  UseTouchLongPressOptions,
  UseTouchLongPressResult,
} from './useTouchLongPress';

export { usePointerCoalesce } from './usePointerCoalesce';

export { useMultiTouchGestures } from './useMultiTouchGestures';
export type {
  MultiTouchHandlers,
  UseMultiTouchGesturesResult,
} from './useMultiTouchGestures';
