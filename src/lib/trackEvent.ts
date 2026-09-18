/**
 * Fire a Piqo custom event. Never sends `pageview` — the piqo.js snippet
 * already records one pageview per URL (including SPA pushState/replaceState).
 */
type PiqoFn = (name: string, opts?: { props?: Record<string, string | number | boolean> }) => void;

declare global {
  interface Window {
    piqo?: PiqoFn;
  }
}

export function trackEvent(
  name: string,
  props?: Record<string, string | number | boolean>,
): void {
  if (typeof window === 'undefined') return;
  if (!name || name === 'pageview') return;

  const fire = (): boolean => {
    if (typeof window.piqo !== 'function') return false;
    window.piqo(name, props ? { props } : undefined);
    return true;
  };

  if (fire()) return;

  let attempts = 0;
  const id = window.setInterval(() => {
    if (fire() || ++attempts > 40) window.clearInterval(id);
  }, 50);
}
