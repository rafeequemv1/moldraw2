import type { DocSection } from './docNav';
import { DOC_SITE_ORIGIN, docCanonicalUrl } from './docNav';

const META_DESC_ID = 'moldraw-doc-description';
const META_OG_TITLE_ID = 'moldraw-doc-og-title';
const META_OG_DESC_ID = 'moldraw-doc-og-description';
const META_OG_URL_ID = 'moldraw-doc-og-url';
const META_ROBOTS_ID = 'moldraw-doc-robots';
const CANONICAL_ID = 'moldraw-doc-canonical';
const ALTERNATE_MD_ID = 'moldraw-doc-alternate-md';
const API_CATALOG_ID = 'moldraw-doc-api-catalog';
const META_AI_SUMMARY_ID = 'moldraw-doc-ai-summary';
const META_AI_POLICY_ID = 'moldraw-doc-ai-policy';
const JSONLD_ID = 'moldraw-doc-jsonld';

const HOME_AI_SUMMARY =
  'ChemDraw-class visual chemistry editor. Agents mutate via session.applyCommand (local MCP or 127.0.0.1 HTTP). Do not use runCommand as an adapter.';

const upsertMeta = (id: string, attr: 'name' | 'property', key: string, content: string): void => {
  let el = document.getElementById(id) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.id = id;
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
};

const upsertLink = (id: string, rel: string, href: string, type?: string): void => {
  let el = document.getElementById(id) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement('link');
    el.id = id;
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.rel = rel;
  el.href = href;
  if (type) el.type = type;
};

const upsertJsonLd = (id: string, data: object): void => {
  let el = document.getElementById(id) as HTMLScriptElement | null;
  if (!el) {
    el = document.createElement('script');
    el.id = id;
    el.type = 'application/ld+json';
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
};

/** Browser tab text for the editor. Meta / OG / Twitter titles stay unchanged. */
export const EDITOR_BROWSER_TAB_TITLE = 'moldraw.com';

export const applyDocSeo = (section: DocSection): void => {
  const title = `${section.title} — Moldraw Documentation`;
  const url = docCanonicalUrl(section.slug);
  document.title = title;

  upsertMeta(META_DESC_ID, 'name', 'description', section.description);
  upsertMeta(META_OG_TITLE_ID, 'property', 'og:title', title);
  upsertMeta(META_OG_DESC_ID, 'property', 'og:description', section.description);
  upsertMeta(META_OG_URL_ID, 'property', 'og:url', url);
  upsertMeta(META_ROBOTS_ID, 'name', 'robots', 'index, follow');
  upsertMeta(
    META_AI_SUMMARY_ID,
    'name',
    'ai-summary',
    `${section.title}: ${section.description} Mutations use session.applyCommand. HTTP is 127.0.0.1 only.`,
  );
  upsertMeta(META_AI_POLICY_ID, 'name', 'ai-policy', `${DOC_SITE_ORIGIN.replace(/\/$/, '')}/ai.txt`);
  upsertLink(CANONICAL_ID, 'canonical', url);
  upsertLink(ALTERNATE_MD_ID, 'alternate', `${url}.md`, 'text/markdown');
  upsertLink(API_CATALOG_ID, 'api-catalog', '/.well-known/api-catalog');

  upsertJsonLd(JSONLD_ID, {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: section.title,
    description: section.description,
    url,
    isPartOf: {
      '@type': 'WebSite',
      name: 'Moldraw',
      url: docCanonicalUrl('introduction'),
    },
    about: {
      '@type': 'SoftwareApplication',
      name: 'Moldraw',
      applicationCategory: 'ChemistryApplication',
    },
  });
};

export const clearDocSeo = (): void => {
  document.title = EDITOR_BROWSER_TAB_TITLE;
  for (const id of [META_DESC_ID, META_OG_TITLE_ID, META_OG_DESC_ID, META_OG_URL_ID, META_ROBOTS_ID]) {
    document.getElementById(id)?.remove();
  }
  upsertMeta(META_AI_SUMMARY_ID, 'name', 'ai-summary', HOME_AI_SUMMARY);
  upsertMeta(META_AI_POLICY_ID, 'name', 'ai-policy', `${DOC_SITE_ORIGIN.replace(/\/$/, '')}/ai.txt`);
  upsertLink(API_CATALOG_ID, 'api-catalog', '/.well-known/api-catalog');
  document.getElementById(CANONICAL_ID)?.remove();
  document.getElementById(ALTERNATE_MD_ID)?.remove();
  document.getElementById(JSONLD_ID)?.remove();
};
