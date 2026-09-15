const PROJECT_ID = '5e6b67da-62ae-4645-acbe-d56d94aa0a63';
const SCRIPT_SRC = 'https://app.charla.com/widget/widget.js';
const VISIBLE_CLASS = 'charla-visible';

function isCompactViewport(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window.innerWidth;
  const h = window.innerHeight;
  return w <= 1024 && w <= h;
}

export function isCharlaVisible(): boolean {
  return typeof document !== 'undefined' && document.documentElement.classList.contains(VISIBLE_CLASS);
}

function ensureLoaded(): void {
  if (typeof document === 'undefined') return;
  if (!document.querySelector('charla-widget')) {
    const widgetElement = document.createElement('charla-widget');
    widgetElement.setAttribute('p', PROJECT_ID);
    document.body.appendChild(widgetElement);
  }
  if (!document.querySelector(`script[src="${SCRIPT_SRC}"]`)) {
    const widgetCode = document.createElement('script');
    widgetCode.src = SCRIPT_SRC;
    widgetCode.async = true;
    document.body.appendChild(widgetCode);
  }
}

export function showCharlaSupport(): void {
  ensureLoaded();
  document.documentElement.classList.add(VISIBLE_CLASS);
}

export function hideCharlaSupport(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.remove(VISIBLE_CLASS);
}

export function toggleCharlaSupport(): boolean {
  if (isCharlaVisible()) {
    hideCharlaSupport();
    return false;
  }
  showCharlaSupport();
  return true;
}

/** Desktop / landscape: load on page start. Compact mobile waits for Help. */
export function shouldAutoLoadCharla(): boolean {
  return !isCompactViewport();
}
