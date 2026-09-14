/** App-chrome touch timing constants shared by the context menu and quick menu. */

/**
 * Ignore the finger-lift compat `click` that some browsers fire right after a
 * touch long-press opened a menu (the finger is still down when the menu mounts).
 */
export const TOUCH_OPEN_CLICK_GUARD_MS = 450;
