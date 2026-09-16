import { useEffect, useRef } from 'react';

/** Left-side docks that share the style-panel slot (only one open at a time). */
export type LeftDockId = 'style' | 'objects' | 'params' | 'apparatus';

export const LEFT_DOCK_EVENT = 'moldraw:left-dock';

export function claimLeftDock(id: LeftDockId): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<LeftDockId>(LEFT_DOCK_EVENT, { detail: id }));
}

/**
 * While `active`, claim this dock and close when another left panel claims the slot.
 */
export function useLeftDockExclusive(
  id: LeftDockId,
  active: boolean,
  onForeignClaim: () => void,
): void {
  const onForeignRef = useRef(onForeignClaim);
  onForeignRef.current = onForeignClaim;

  useEffect(() => {
    if (!active) return;
    claimLeftDock(id);
  }, [active, id]);

  useEffect(() => {
    const onClaim = (e: Event) => {
      const claimed = (e as CustomEvent<LeftDockId>).detail;
      if (claimed !== id) onForeignRef.current();
    };
    window.addEventListener(LEFT_DOCK_EVENT, onClaim);
    return () => window.removeEventListener(LEFT_DOCK_EVENT, onClaim);
  }, [id]);
}
