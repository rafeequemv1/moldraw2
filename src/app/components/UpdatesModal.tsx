import { useEffect, useRef, useState } from 'react';
import { useChromeOverlay } from '../chromeDismiss';

const UPDATES_SEEN_STORAGE_KEY = 'moldraw_updates_seen_version';
export const CURRENT_UPDATES_VERSION = '2026-09-changelog-v3';

const LAZY_BATCH = 3;

type UpdateEntry = {
  date: string;
  version: string;
  title: string;
  body?: string;
  items?: string[];
  highlight?: boolean;
};

/** Oldest first in source; rendered newest-first. */
const UPDATES: UpdateEntry[] = [
  {
    date: 'February 2026',
    version: 'Early 2026',
    title: '3D properties and file extras',
    items: [
      'PubChem properties card: name, IUPAC, mass, boiling and melting points',
      'IUPAC lookup from the drawn structure',
      'JPEG export for 2D drawings and 3D snapshots',
      'Protein PDB add/remove in the 3D scene without wiping other models',
    ],
  },
  {
    date: 'February 2026',
    version: 'Early 2026',
    title: 'AI assistant and PubChem import',
    items: [
      'Gemini chat in the 3D panel — names, properties, and draw/edit commands',
      'PubChem import adds beside what is already on the canvas (2D and 3D)',
    ],
  },
  {
    date: 'March 2026',
    version: 'Spring 2026',
    title: 'Feature requests and header menus',
    items: [
      'Request a feature from the toolbar, with screenshots',
      'More menu no longer clips under the top bar',
      'Transparent PNG drops enclosed white backgrounds',
    ],
  },
  {
    date: 'May 2026',
    version: 'Spring 2026',
    title: 'Community and local drawings',
    items: [
      'Public Community: posts, replies, votes, and avatars',
      'Drawings autosave locally on this device',
      'New design starts a fresh canvas while keeping the last file',
    ],
  },
  {
    date: 'June 2026',
    version: 'Mid 2026',
    title: 'Chemistry tools hub',
    items: [
      'Standalone Tools pages: formula/mass, lookup, classroom calculators, drug-likeness, spectroscopy, Lewis, converters',
      'Mass spectrum predictor from the drawing, SMILES, or PubChem',
      'Accounts for saved designs, AI, and community',
    ],
  },
  {
    date: 'September 2026',
    version: 'Current',
    title: 'Editor, draw tools, and 3D',
    highlight: true,
    items: [
      'New draw UI: compact islands, category dock on phones, clearer tool grouping',
      'Better 3D viewer: rebuild, hydrogens, conformers, and heavier-atom structures',
      'Larger atom set and aliases in the editor',
      'Multi-project tabs — several drawings open at once, switch without losing work',
    ],
  },
  {
    date: 'September 2026',
    version: 'Current',
    title: 'Arrange, library, and materials',
    highlight: true,
    items: [
      'Arrange and alignment tools: align, distribute, and tidy a selection',
      'Template library for fragments and common rings',
      'COF and MOF builders, with packing and layer options',
      'Dendrimer construction from the library',
    ],
  },
  {
    date: 'September 2026',
    version: 'Current',
    title: 'Select menu, color, and languages',
    highlight: true,
    items: [
      'Select menu: atoms, lasso, all/invert/connected, rings, heteroatoms, and more',
      'Ring coloring and style: fill, stroke, and Color panel under Pattern',
      'Grid on by default; clearer dot grid',
      'Teal selection handles — corners scale uniformly, sides stretch',
      'German, Japanese, and Simplified Chinese in the editor',
      'Formula / MW / charge / selection count in a light bottom status bar',
    ],
  },
  {
    date: 'September 2026',
    version: 'Current',
    title: 'Mobile chrome and Help',
    highlight: true,
    items: [
      'Phone top bar: search icon, delete (clear canvas), Help for support chat',
      'Charla chat stays hidden until Help — tap again and the bubble is gone',
      'Bottom status bar: formula, MW, charge, and selection count',
      'Selection info opens as a bottom sheet on phones',
    ],
  },
];

const NEWEST_FIRST = [...UPDATES].reverse();

export function hasUnreadMolDrawUpdates(): boolean {
  try {
    return localStorage.getItem(UPDATES_SEEN_STORAGE_KEY) !== CURRENT_UPDATES_VERSION;
  } catch {
    return true;
  }
}

export function markMolDrawUpdatesSeen(): void {
  try {
    localStorage.setItem(UPDATES_SEEN_STORAGE_KEY, CURRENT_UPDATES_VERSION);
  } catch {
    /* ignore quota / private mode */
  }
}

export function UpdatesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useChromeOverlay(open, onClose, 'modal');
  const [visibleCount, setVisibleCount] = useState(LAZY_BATCH);
  const listRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setVisibleCount(LAZY_BATCH);
      return;
    }
    const root = listRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel) return;
    const io = new IntersectionObserver(
      entries => {
        if (!entries.some(e => e.isIntersecting)) return;
        setVisibleCount(n => Math.min(NEWEST_FIRST.length, n + LAZY_BATCH));
      },
      { root, rootMargin: '120px', threshold: 0 },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [open, visibleCount]);

  if (!open) return null;

  const items = NEWEST_FIRST.slice(0, visibleCount);
  const hasMore = visibleCount < NEWEST_FIRST.length;

  return (
    <div className="feature-request-backdrop">
      <div className="updates-modal">
        <div className="feature-request-header">
          <div>
            <div className="updates-eyebrow">MolDraw updates</div>
            <div className="feature-request-title">What is new</div>
            <div className="feature-request-subtitle">
              Newest first. Scroll for earlier versions — older notes load as you go.
            </div>
          </div>
          <button type="button" className="feature-request-close" onClick={onClose} aria-label="Close updates">
            ×
          </button>
        </div>

        <div className="updates-list" ref={listRef}>
          {items.map((entry, i) => (
            <article
              key={`${entry.date}-${entry.title}`}
              className={`updates-card${entry.highlight ? ' updates-card-highlight' : ''}${i === 0 ? ' updates-card-latest' : ''}`}
            >
              <div className="updates-card-meta">
                <div className="updates-card-date">{entry.date}</div>
                <div className="updates-card-version">{entry.version}</div>
              </div>
              <div className="updates-card-title">{entry.title}</div>
              {entry.body ? <p>{entry.body}</p> : null}
              {entry.items && entry.items.length > 0 ? (
                <ul className="updates-card-list">
                  {entry.items.map(item => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
          {hasMore ? (
            <div ref={sentinelRef} className="updates-list-sentinel" aria-hidden>
              Loading earlier updates…
            </div>
          ) : (
            <p className="updates-list-end">That is the start of the public changelog.</p>
          )}
        </div>
      </div>
    </div>
  );
}
