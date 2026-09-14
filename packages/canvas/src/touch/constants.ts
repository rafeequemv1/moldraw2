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

/** Two-finger twist: ignore angular jitter below this (radians ≈ 0.1°). */
export const PINCH_ROTATE_EPSILON_RAD = 0.002;

/**
 * Two-finger selection transform: the twist must exceed this before rotation
 * starts (so a plain pinch/drag doesn't wobble the selection), and the pinch
 * must exceed this ratio before scaling starts.
 */
export const SELECTION_TWIST_START_RAD = 0.09;
export const SELECTION_PINCH_START_RATIO = 0.06;

/**
 * Touch loupe (magnifier above the fingertip while a drawing tool is active):
 * radius (CSS px), magnification and vertical offset above the finger.
 */
export const TOUCH_LOUPE_RADIUS_PX = 60;
export const TOUCH_LOUPE_MAGNIFICATION = 2;
export const TOUCH_LOUPE_OFFSET_PX = 96;

/**
 * Long-press (ms) to open the context menu on touch (no right-click). Only
 * armed for select / lasso / hand on a target — drawing tools never long-press,
 * so a finger that rests before dragging a bond is not interrupted.
 */
export const TOUCH_LONG_PRESS_MS = 600;

/** Max movement (CSS px) during long-press before it becomes a drag. */
export const TOUCH_LONG_PRESS_SLOP_PX = 12;

/** Multi-finger tap (undo / redo): max duration and per-finger movement. */
export const MULTI_TAP_MAX_MS = 350;
export const MULTI_TAP_SLOP_PX = 14;

/**
 * Pen-priority window: while a pen is down, and for this long after it lifts,
 * touch contacts are ignored entirely (palm / knuckle resting on the glass).
 */
export const PEN_PRIORITY_MS = 400;

/** Coalesce pointermove: min interval between tool dispatches (ms). Pen gets finer. */
export const POINTER_COALESCE_MS = 8;
export const PEN_COALESCE_MS = 4;

/** CSS class applied to the drawing canvas for touch-action / selection. */
export const CANVAS_TOUCH_CLASS = 'moldraw-canvas-surface';
