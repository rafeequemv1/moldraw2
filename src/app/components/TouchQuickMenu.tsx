/**
 * Touch quick menu: a finger-sized ring of the most-used actions that opens
 * where a long-press landed on the 2D canvas. The centre "More…" button hands
 * over to the full context menu (popup on tablets, bottom sheet on phones).
 *
 * The component owns no behaviour — items are built by `buildTouchQuickMenuItems`
 * from the same handlers the full context menu uses.
 */
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';
import { TOUCH_OPEN_CLICK_GUARD_MS } from '../touchConstants';
import { useChromeOverlay } from '../chromeDismiss';

export interface TouchQuickMenuItem {
  id: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
}

export interface TouchQuickMenuProps {
  /** Press point in client px. */
  x: number;
  y: number;
  title: string;
  items: TouchQuickMenuItem[];
  onMore: () => void;
  onDismiss: () => void;
}

const ITEM_PX = 54;
const CENTER_PX = 48;
const RING_RADIUS_PX = 84;
const EDGE_PAD_PX = 10;
/** Room below the ring for the target label chip. */
const LABEL_ROOM_PX = 26;

/** Start at 12 o'clock and go clockwise so the first item is under the eye. */
const angleFor = (index: number, count: number): number =>
  -Math.PI / 2 + (index * 2 * Math.PI) / Math.max(count, 1);

export function TouchQuickMenu({ x, y, title, items, onMore, onDismiss }: TouchQuickMenuProps) {
  useChromeOverlay(true, onDismiss);
  // Clamp the ring inside the viewport so no button hides under the chrome.
  // Pure function of the press point + viewport size (the menu is short-lived
  // and re-keyed per long-press, so no resize subscription is needed).
  const center = useMemo(() => {
    const extent = RING_RADIUS_PX + ITEM_PX / 2 + EDGE_PAD_PX;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    return {
      x: Math.min(Math.max(x, extent), Math.max(extent, vw - extent)),
      y: Math.min(Math.max(y, extent), Math.max(extent, vh - extent - LABEL_ROOM_PX)),
    };
  }, [x, y]);
  const mountedAtRef = useRef<number | null>(null);
  useEffect(() => {
    mountedAtRef.current = performance.now();
  }, []);

  /**
   * The finger that long-pressed is still down when we mount; some browsers
   * fire a compat `click` when it lifts. Swallow anything that early so the
   * centre button (right under the finger) is not triggered by the release.
   */
  const guardClick = (e: React.MouseEvent): boolean => {
    e.stopPropagation();
    const mountedAt = mountedAtRef.current;
    return mountedAt != null && performance.now() - mountedAt >= TOUCH_OPEN_CLICK_GUARD_MS;
  };

  const shown = items.slice(0, 8);

  return createPortal(
    <div
      className="touch-quick-menu"
      role="menu"
      aria-label={title}
      onContextMenu={e => e.preventDefault()}
    >
      <button
        type="button"
        className="touch-quick-menu__backdrop"
        aria-label="Dismiss"
        onClick={e => {
          if (guardClick(e)) onDismiss();
        }}
      />
      <div
        className="touch-quick-menu__ring"
        style={{ left: center.x, top: center.y }}
      >
        {shown.map((item, i) => {
          const a = angleFor(i, shown.length);
          const dx = Math.cos(a) * RING_RADIUS_PX;
          const dy = Math.sin(a) * RING_RADIUS_PX;
          return (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className={
                'touch-quick-menu__item' +
                (item.danger ? ' touch-quick-menu__item--danger' : '')
              }
              style={{
                width: ITEM_PX,
                height: ITEM_PX,
                transform: `translate(${dx - ITEM_PX / 2}px, ${dy - ITEM_PX / 2}px)`,
                animationDelay: `${i * 18}ms`,
              }}
              disabled={item.disabled}
              aria-label={item.label}
              onClick={e => {
                if (!guardClick(e) || item.disabled) return;
                item.onSelect();
              }}
            >
              <span className="touch-quick-menu__icon">{item.icon}</span>
              <span className="touch-quick-menu__label">{item.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          className="touch-quick-menu__more"
          style={{
            width: CENTER_PX,
            height: CENTER_PX,
            transform: `translate(${-CENTER_PX / 2}px, ${-CENTER_PX / 2}px)`,
          }}
          aria-label="More actions"
          onClick={e => {
            // guardClick also stops propagation so the window-level "click
            // closes the context menu" listener cannot dismiss the full menu
            // we are about to open.
            if (guardClick(e)) onMore();
          }}
        >
          <MoreHorizontal size={22} />
        </button>
        <div
          className="touch-quick-menu__title"
          style={{ transform: `translate(-50%, ${RING_RADIUS_PX + ITEM_PX / 2 + 4}px)` }}
        >
          {title}
        </div>
      </div>
    </div>,
    document.body,
  );
}

