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
  MULTI_TAP_MAX_MS,
  MULTI_TAP_SLOP_PX,
  PEN_PRIORITY_MS,
  PINCH_ROTATE_EPSILON_RAD,
  SELECTION_TWIST_START_RAD,
  SELECTION_PINCH_START_RATIO,
  TOUCH_LOUPE_RADIUS_PX,
  TOUCH_LOUPE_MAGNIFICATION,
  TOUCH_LOUPE_OFFSET_PX,
} from './constants';

export type { InputProfile, HitMetrics } from './inputProfile';
export {
  inputProfileOf,
  hitMetricsFor,
  hitScaleForZoom,
  DEFAULT_HIT_METRICS,
} from './inputProfile';

export type { PenPriorityTracker } from './penPriority';
export { createPenPriorityTracker, isPenEraser, isPenBarrelButton } from './penPriority';

export type {
  PointerLike,
  TrackedPointer,
  MultiTouchGestureKind,
  PinchPanSample,
  PinchPanDelta,
  PointerDebugInfo,
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
