/**
 * Auto-cleanup heuristic: when the user draws a *burst* of bonds in quick
 * succession, schedule a local layout clean once they pause. Lifts the
 * "my structure looks crooked, let me hit Cleanup" chore that interrupts the
 * drawing flow.
 *
 * Thresholds:
 *   - `windowMs`   — sliding window over which bonds are counted.
 *   - `threshold`  — minimum bond count inside the window to trigger.
 *   - `debounceMs` — quiet period after the last recorded bond before the
 *                    cleanup fires (so we don't snap mid-stroke).
 *
 * Counting is tracked via refs only so it never causes re-renders, and the
 * timer is cleared on unmount and via `reset()` (called after a manual cleanup
 * to avoid a double layout).
 *
 * The hook is *render-policy free* — it does not know about the worker,
 * or the molecule shape. Wiring of the actual cleanup happens in the
 * consumer's `onTrigger` callback, which receives the union of atom IDs
 * involved in the recent bond burst.
 */
import { useCallback, useEffect, useRef } from 'react';

export interface UseAutoCleanupOptions {
  /** Sliding window length (ms). Default 8000. */
  windowMs?: number;
  /** Minimum number of bonds inside the window to trigger cleanup. Default 5. */
  threshold?: number;
  /** Quiet period (ms) after the last recorded bond before firing. Default 1500. */
  debounceMs?: number;
  /** Called with the set of atom IDs involved in the recent bond burst. */
  onTrigger: (touchedAtomIds: Set<string>) => void;
  /** Toggle to disable the heuristic without removing the hook (e.g. user pref). */
  enabled?: boolean;
}

export interface AutoCleanupApi {
  /** Record a bond addition (call from your `onAddBond` handler). */
  recordBond: (fromAtomId: string, toAtomId: string) => void;
  /** Drop the buffered count + any pending timer. */
  reset: () => void;
}

export function useAutoCleanup({
  windowMs = 8000,
  threshold = 5,
  debounceMs = 1500,
  onTrigger,
  enabled = true,
}: UseAutoCleanupOptions): AutoCleanupApi {
  const entriesRef = useRef<Array<{ from: string; to: string; t: number }>>([]);
  const timeoutRef = useRef<number | null>(null);

  // Keep onTrigger up-to-date without making `recordBond` re-bind on every
  // render (which would cancel pending timers via the unmount cleanup).
  const onTriggerRef = useRef(onTrigger);
  useEffect(() => {
    onTriggerRef.current = onTrigger;
  }, [onTrigger]);

  const reset = useCallback(() => {
    entriesRef.current = [];
    if (timeoutRef.current != null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const recordBond = useCallback(
    (fromAtomId: string, toAtomId: string) => {
      if (!enabled) return;
      const now = performance.now();
      entriesRef.current.push({ from: fromAtomId, to: toAtomId, t: now });

      if (timeoutRef.current != null) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => {
        timeoutRef.current = null;
        const t = performance.now();
        entriesRef.current = entriesRef.current.filter(e => t - e.t <= windowMs);
        if (entriesRef.current.length >= threshold) {
          const seeds = new Set<string>();
          for (const e of entriesRef.current) {
            seeds.add(e.from);
            seeds.add(e.to);
          }
          entriesRef.current = [];
          onTriggerRef.current(seeds);
        }
      }, debounceMs);
    },
    [debounceMs, enabled, threshold, windowMs],
  );

  useEffect(
    () => () => {
      if (timeoutRef.current != null) window.clearTimeout(timeoutRef.current);
    },
    [],
  );

  return { recordBond, reset };
}
