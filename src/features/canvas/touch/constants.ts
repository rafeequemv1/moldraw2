/**
 * Touch / pen / multi-pointer thresholds for the canvas.
 * Tuned for iOS, Android, and Windows tablet (Surface) drawing.
 */

/** Ignore contacts larger than this (CSS px) — typical palm / heel. */
export const PALM_MAX_CONTACT_SIZE_PX = 40;

/** Pen tip contact is usually tiny; reject only clearly oversized pens. */
export const PEN_PALM_MAX_CONTACT_SIZE_PX = 28;

/** Two-finger pinch: ignore scale noise below this ratio delta from 1. */
export const PINCH_SCALE_EPSILON = 0.008;

/** Two-finger pan: ignore sub-pixel jitter (CSS px). */
export const MULTI_PAN_EPSILON_PX = 0.5;

/** Long-press (ms) to open the context menu on touch (no right-click). */
export const TOUCH_LONG_PRESS_MS = 480;

/** Max movement (CSS px) during long-press before it becomes a drag. */
export const TOUCH_LONG_PRESS_SLOP_PX = 10;

/** Coalesce pointermove: min interval between tool dispatches (ms). Pen gets finer. */
export const POINTER_COALESCE_MS = 8;
export const PEN_COALESCE_MS = 4;

/** CSS class applied to the drawing canvas for touch-action / selection. */
export const CANVAS_TOUCH_CLASS = 'moldraw-canvas-surface';
