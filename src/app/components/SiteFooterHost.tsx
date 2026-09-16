/**
 * Relocates the crawler footer from `index.html` under the editor, and
 * publishes its real height so mobile docks stay above it.
 */
import { useLayoutEffect, useRef } from 'react';

const FOOTER_HEIGHT_VAR = '--app-site-footer-height';
const FOOTER_SELECTOR = '.site-footer-root';

export function SiteFooterHost() {
  const slotRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const slot = slotRef.current;
    const footer = document.querySelector<HTMLElement>(FOOTER_SELECTOR);
    if (!slot || !footer) return;

    const previousParent = footer.parentElement;
    const previousNext = footer.nextSibling;
    if (footer.parentElement !== slot) {
      slot.appendChild(footer);
    }

    const applyHeight = () => {
      const height = Math.ceil(footer.getBoundingClientRect().height);
      document.documentElement.style.setProperty(FOOTER_HEIGHT_VAR, `${Math.max(0, height)}px`);
    };

    applyHeight();
    const observer = new ResizeObserver(applyHeight);
    observer.observe(footer);
    window.addEventListener('resize', applyHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', applyHeight);
      document.documentElement.style.removeProperty(FOOTER_HEIGHT_VAR);
      if (previousParent && footer.parentElement === slot) {
        previousParent.insertBefore(footer, previousNext);
      }
    };
  }, []);

  return <div className="app-site-footer-slot" ref={slotRef} />;
}
