import { claimLeftDock, type LeftDockId } from './leftDockExclusive';

const STYLE_CLOSE = '.format-left-panel.mol-color-side-panel .format-left-panel__close';
const PARAMS_CLOSE = '.left-params-dock .format-left-panel__close';
const OBJECTS_CLOSE =
  '.objects-panel:not(.objects-panel--sheet) [aria-label="Close objects panel"]';

let active: LeftDockId | null = null;
let closing = false;

function clickAll(selector: string): void {
  document.querySelectorAll(selector).forEach(el => {
    if (el instanceof HTMLElement) el.click();
  });
}

function closeExcept(keep: LeftDockId): void {
  closing = true;
  try {
    if (keep !== 'style') clickAll(STYLE_CLOSE);
    if (keep !== 'params') clickAll(PARAMS_CLOSE);
    if (keep !== 'objects') clickAll(OBJECTS_CLOSE);
  } finally {
    queueMicrotask(() => {
      closing = false;
    });
  }
}

function setActive(id: LeftDockId): void {
  if (closing || active === id) return;
  active = id;
  claimLeftDock(id);
  closeExcept(id);
}

function nodeOpensPanel(node: Node): LeftDockId | null {
  if (!(node instanceof Element)) return null;
  if (
    (node.matches?.('.objects-panel') && !node.classList.contains('objects-panel--sheet')) ||
    node.querySelector?.('.objects-panel:not(.objects-panel--sheet)')
  ) {
    return 'objects';
  }
  if (node.matches?.('.left-params-panel') || node.querySelector?.('.left-params-panel')) {
    return 'params';
  }
  return null;
}

function installLeftDockCoordinator(): void {
  if (typeof window === 'undefined') return;
  const w = window as Window & { __moldrawLeftDock?: boolean };
  if (w.__moldrawLeftDock) return;
  w.__moldrawLeftDock = true;

  const root = document.documentElement;
  const obs = new MutationObserver(mutations => {
    if (root.classList.contains('app-mobile-compact')) return;
    let opened: LeftDockId | null = null;
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        for (const node of mutation.addedNodes) {
          opened = nodeOpensPanel(node) ?? opened;
        }
      }
    }
    if (!opened && root.classList.contains('format-left-panel-open')) {
      opened = 'style';
    }
    if (opened) setActive(opened);
    if (
      active &&
      !root.classList.contains('format-left-panel-open') &&
      !document.querySelector('.left-params-dock:not(:empty) .left-params-panel') &&
      !document.querySelector('.objects-panel:not(.objects-panel--sheet)')
    ) {
      active = null;
    }
  });
  obs.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class'],
  });
}

installLeftDockCoordinator();
