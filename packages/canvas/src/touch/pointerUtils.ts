import type React from 'react';
import type { PointerLike } from './types';

/**
 * Minimal pointer fields shared by MouseEvent and PointerEvent so tool
 * modules can keep reading `ctx.e.button`, `clientX`, modifiers, etc.
 */
export type CanvasPointerEvent = React.PointerEvent<HTMLCanvasElement>;

/** Narrow any pointer-like React event to the fields tools use. */
export function asPointerLike(e: {
  clientX: number;
  clientY: number;
  button: number;
  buttons?: number;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  pointerId?: number;
  pointerType?: string;
  width?: number;
  height?: number;
  pressure?: number;
  isPrimary?: boolean;
}): PointerLike {
  return {
    pointerId: e.pointerId ?? 1,
    pointerType: e.pointerType ?? 'mouse',
    clientX: e.clientX,
    clientY: e.clientY,
    button: e.button,
    buttons: e.buttons ?? 0,
    width: e.width,
    height: e.height,
    pressure: e.pressure,
    isPrimary: e.isPrimary,
    shiftKey: e.shiftKey,
    altKey: e.altKey,
    ctrlKey: e.ctrlKey,
    metaKey: e.metaKey,
  };
}

/** Primary button (left mouse / touch / pen tip). */
export function isPrimaryButton(e: { button: number }): boolean {
  return e.button === 0;
}

/** Middle mouse button (pan). Touch never reports button 1. */
export function isMiddleButton(e: { button: number }): boolean {
  return e.button === 1;
}

/** Right mouse / pen barrel equivalent for context menu. */
export function isSecondaryButton(e: { button: number }): boolean {
  return e.button === 2;
}

/**
 * Capture the pointer on the canvas so move/up keep firing even if the
 * finger leaves the element (critical on iOS/Android).
 */
export function captureCanvasPointer(
  canvas: HTMLCanvasElement | null,
  e: CanvasPointerEvent,
): void {
  if (!canvas) return;
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {
    // Some browsers throw if the pointer is already released.
  }
}

export function releaseCanvasPointer(
  canvas: HTMLCanvasElement | null,
  e: CanvasPointerEvent,
): void {
  if (!canvas) return;
  try {
    if (canvas.hasPointerCapture?.(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }
  } catch {
    // ignore
  }
}
