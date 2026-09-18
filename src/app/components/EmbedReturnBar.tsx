import { useEffect, useState } from 'react';

/** Cross-origin iframe target. Other routes stay same-origin frameable only. */
export function isEmbedPathname(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/';
  return path === '/embed';
}

/**
 * Slim brand link inside the embed player so a framed editor can send
 * visitors back to MolDraw without replacing the host page.
 */
export function EmbedReturnBar() {
  const [embed] = useState(
    () => typeof window !== 'undefined' && isEmbedPathname(window.location.pathname),
  );

  useEffect(() => {
    if (!embed) return;
    document.documentElement.classList.add('moldraw-embed');
    return () => document.documentElement.classList.remove('moldraw-embed');
  }, [embed]);

  if (!embed) return null;

  return (
    <div className="embed-return-bar">
      <span>MolDraw</span>
      <a href="https://www.moldraw.com/" target="_blank" rel="noopener noreferrer">
        Open in MolDraw
      </a>
    </div>
  );
}
