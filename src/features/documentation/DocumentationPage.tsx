import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowLeft, Check, Copy, Loader2 } from 'lucide-react';
import {
  ALL_DOC_SECTIONS,
  DEFAULT_DOC_SLUG,
  DOC_NAV,
  getDocSectionByFile,
  getDocSectionBySlug,
  type DocSection,
} from './docNav';
import { applyDocSeo, clearDocSeo } from './docSeo';
import { docsPathForSlug, navigateToDocs } from './docRoute';
import { loadDocMarkdown } from './loadDocs';

export interface DocumentationPageProps {
  onClose: () => void;
  /** SEO slug (path after `/docs/`). */
  slug?: string;
  /** Called when the user navigates to another doc page (sidebar or in-page links). */
  onSlugChange?: (slug: string) => void;
}

export function DocumentationPage({ onClose, slug: slugProp, onSlugChange }: DocumentationPageProps) {
  const initialSlug = slugProp ?? DEFAULT_DOC_SLUG;
  const [activeSlug, setActiveSlug] = useState(initialSlug);
  const [markdown, setMarkdown] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const section: DocSection = useMemo(
    () => getDocSectionBySlug(activeSlug) ?? getDocSectionBySlug(DEFAULT_DOC_SLUG)!,
    [activeSlug],
  );

  useEffect(() => {
    if (slugProp) setActiveSlug(slugProp);
  }, [slugProp]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void loadDocMarkdown(section.file)
      .then(content => {
        if (cancelled) return;
        setMarkdown(content);
        setLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : 'Failed to load page');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [section.file]);

  useEffect(() => {
    applyDocSeo(section);
    return () => clearDocSeo();
  }, [section]);

  const onNavClick = useCallback(
    (nextSlug: string) => {
      if (nextSlug === activeSlug) return;
      setActiveSlug(nextSlug);
      navigateToDocs(nextSlug);
      onSlugChange?.(nextSlug);
    },
    [activeSlug, onSlugChange],
  );

  const resolveDocHref = useCallback((href: string | undefined): string | null => {
    if (!href) return null;
    const normalized = href.replace(/^\.\//, '').replace(/^\//, '');
    const byFile = getDocSectionByFile(normalized);
    if (byFile) return byFile.slug;
    const bySuffix = ALL_DOC_SECTIONS.find(
      s => s.file === normalized || s.file.endsWith(`/${normalized}`),
    );
    return bySuffix?.slug ?? null;
  }, []);

  useEffect(() => {
    document.querySelector('.doc-page__main')?.scrollTo(0, 0);
    setCopied(false);
  }, [activeSlug]);

  const copyMarkdown = useCallback(async () => {
    if (!markdown || loading || loadError) return;
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }, [markdown, loading, loadError]);

  return (
    <div className="doc-page" role="document">
      <header className="doc-page__header">
        <button type="button" className="doc-page__back" onClick={onClose}>
          <ArrowLeft size={16} strokeWidth={2} aria-hidden />
          Back to editor
        </button>
        <span className="doc-page__title">Documentation</span>
        <span className="doc-page__path" title={docsPathForSlug(section.slug)}>
          /docs/{section.slug}
        </span>
        <nav className="doc-page__chips" aria-label="Ask AI">
          <button type="button" className="doc-page__chip" onClick={() => onNavClick('for-agents')}>
            For agents
          </button>
          <button type="button" className="doc-page__chip" onClick={() => onNavClick('mcp/overview')}>
            MCP
          </button>
          <button type="button" className="doc-page__chip" onClick={() => onNavClick('http-api')}>
            HTTP
          </button>
          <a
            className="doc-page__chip"
            href={`/docs/${section.slug}.md`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Raw .md
          </a>
        </nav>
        <button
          type="button"
          className="doc-page__copy-md"
          onClick={() => void copyMarkdown()}
          disabled={loading || Boolean(loadError) || !markdown}
          aria-label="Copy this page as Markdown"
        >
          {copied ? <Check size={14} strokeWidth={2} aria-hidden /> : <Copy size={14} strokeWidth={2} aria-hidden />}
          {copied ? 'Copied' : 'Copy as Markdown'}
        </button>
      </header>

      <div className="doc-page__body">
        <nav className="doc-page__nav" aria-label="Documentation sections">
          {DOC_NAV.map(group => (
            <div key={group.title} className="doc-page__nav-group">
              <div className="doc-page__nav-heading">{group.title}</div>
              <ul className="doc-page__nav-list">
                {group.sections.map(item => (
                  <li key={item.slug}>
                    <button
                      type="button"
                      className={`doc-page__nav-item${item.slug === activeSlug ? ' doc-page__nav-item--active' : ''}`}
                      onClick={() => onNavClick(item.slug)}
                      aria-current={item.slug === activeSlug ? 'page' : undefined}
                    >
                      {item.title}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <article className="doc-page__main">
          {loading ? (
            <div className="doc-page__loading" aria-busy="true">
              <Loader2 size={22} className="doc-page__loading-icon" aria-hidden />
              <span>Loading…</span>
            </div>
          ) : loadError ? (
            <div className="doc-prose">
              <h1>Error</h1>
              <p>{loadError}</p>
            </div>
          ) : (
            <div className="doc-prose">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ href, children }) => {
                    const sectionSlug = resolveDocHref(href);
                    if (sectionSlug) {
                      return (
                        <button
                          type="button"
                          className="doc-prose__inline-link"
                          onClick={() => onNavClick(sectionSlug)}
                        >
                          {children}
                        </button>
                      );
                    }
                    return (
                      <a href={href} target="_blank" rel="noopener noreferrer">
                        {children}
                      </a>
                    );
                  },
                }}
              >
                {markdown}
              </ReactMarkdown>
            </div>
          )}
        </article>
      </div>
    </div>
  );
}
