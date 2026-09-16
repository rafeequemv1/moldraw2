import { DEFAULT_DOC_SLUG, getDocSection, getDocSectionBySlug } from './docNav';

export type AppDocRoute =
  | { kind: 'editor' }
  | { kind: 'docs'; slug: string }
  | { kind: 'my' }
  | { kind: 'addons' };

export const parseAppRoute = (loc: Pick<Location, 'pathname' | 'hash'>): AppDocRoute => {
  const path = loc.pathname.replace(/\/$/, '') || '/';
  if (path === '/my') return { kind: 'my' };
  if (path === '/addons') return { kind: 'addons' };
  if (path === '/docs' || path.startsWith('/docs/')) {
    const raw =
      path === '/docs' ? DEFAULT_DOC_SLUG : decodeURIComponent(path.slice('/docs/'.length));
    const section = getDocSectionBySlug(raw);
    return { kind: 'docs', slug: section?.slug ?? DEFAULT_DOC_SLUG };
  }

  const hash = loc.hash.replace(/^#/, '');
  if (hash) {
    const byId = getDocSection(hash);
    if (byId) return { kind: 'docs', slug: byId.slug };
  }

  return { kind: 'editor' };
};

export const docsPathForSlug = (slug: string): string => `/docs/${slug}`;

export const navigateToDocs = (slug: string, replace = false): void => {
  const path = docsPathForSlug(slug);
  if (replace) window.history.replaceState(null, '', path);
  else window.history.pushState(null, '', path);
};

export const navigateToEditor = (replace = false): void => {
  if (replace) window.history.replaceState(null, '', '/');
  else window.history.pushState(null, '', '/');
};

export const navigateToMy = (replace = false): void => {
  if (replace) window.history.replaceState(null, '', '/my');
  else window.history.pushState(null, '', '/my');
};

export const navigateToAddons = (replace = false): void => {
  if (replace) window.history.replaceState(null, '', '/addons');
  else window.history.pushState(null, '', '/addons');
};
