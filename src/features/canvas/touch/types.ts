import type { Point } from '../geometry';

/** Subset of PointerEvent fields tools and gestures need. */
export interface PointerLike {
  pointerId: number;
  pointerType: string;
  clientX: number;
  clientY: number;
  button: number;
  buttons: number;
  width?: number;
  height?: number;
  pressure?: number;
  isPrimary?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
}

export interface TrackedPointer {
  pointerId: number;
  pointerType: string;
  clientX: number;
  clientY: number;
  width: number;
  height: number;
  pressure: number;
  isPrimary: boolean;
}

export type MultiTouchGestureKind = 'none' | 'pinch-pan';

export interface PinchPanSample {
  /** Midpoint between the two contacts (screen / client coords). */
  midpoint: Point;
  /** Distance between contacts (CSS px). */
  distance: number;
}

export interface PinchPanDelta {
  /** Screen-space translation of the midpoint since the previous sample. */
  panDx: number;
  panDy: number;
  /** Zoom multiplier to apply (newDistance / prevDistance). */
  scale: number;
  /** Focal point for zoom (client coords). */
  focalClientX: number;
  focalClientY: number;
}
