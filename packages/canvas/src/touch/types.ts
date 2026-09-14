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

/** Snapshot of the last pointer event for the on-canvas debug HUD. */
export interface PointerDebugInfo {
  phase: 'down' | 'move' | 'up' | 'cancel';
  pointerType: string;
  pointerId: number;
  isPrimary: boolean;
  pressure: number;
  tiltX: number;
  tiltY: number;
  buttons: number;
  width: number;
  height: number;
  /** Number of tracked touch contacts. */
  touchCount: number;
  /** Two-finger gesture active / claimed by the selection transform. */
  gesturing: boolean;
  claimed: boolean;
  /** Ignored by palm rejection or pen priority. */
  rejected: 'palm' | 'pen-priority' | null;
  activeTool: string;
  ts: number;
}

export interface PinchPanSample {
  /** Midpoint between the two contacts (screen / client coords). */
  midpoint: Point;
  /** Distance between contacts (CSS px). */
  distance: number;
  /** Angle of the finger-to-finger vector (radians, screen space). */
  angle: number;
}

export interface PinchPanDelta {
  /** Screen-space translation of the midpoint since the previous sample. */
  panDx: number;
  panDy: number;
  /** Zoom multiplier to apply (newDistance / prevDistance). */
  scale: number;
  /** Rotation of the finger-to-finger vector since the previous sample (radians). */
  rotateRad: number;
  /** Focal point for zoom (client coords). */
  focalClientX: number;
  focalClientY: number;
}
