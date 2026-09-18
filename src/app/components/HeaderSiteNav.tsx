import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import { createPortal } from 'react-dom';

import { ChevronRight, ClipboardPaste, Copy, FolderOpen, Image, Search } from 'lucide-react';

import { COPY_AS_FORMAT_ITEMS } from '../copyAsFormats';
import type { CopyAsFormat } from '../types';
import { useI18n } from '../i18n';
import { useChromeOverlay } from '../chromeDismiss';
import {
  anchoredMenuStyle,
  placeAnchoredMenu,
  placeSideFlyout,
  sideFlyoutStyle,
  type AnchoredMenuPos,
  type SideFlyoutPos,
} from '../menuPlacement';
import { trackEvent } from '../../lib/trackEvent';
import { MobileBottomSheet } from './MobileBottomSheet';
import { MobileSheetAccordion } from './MobileSheetAccordion';

/** Keep the More trigger put; shift the portal panel slightly left of the right edge. */
const MORE_MENU_NUDGE_X = -20;



export interface HeaderSiteNavProps {

  onOpenMyDesigns: () => void;

  onCopySmiles: () => void;

  onCopySvg: () => void;

  onPaste?: () => void;

  /** Compact More sheet: Copy as accordion uses the full format catalog. */
  onCopyAs?: (format: CopyAsFormat) => void;

  smilesCopied: boolean;

  svgCopied: boolean;

  svgCopyError: boolean;

  onRequestFeature: () => void;

  signedIn: boolean;

  authDisplayName: string;

  onOpenUpdates: () => void;

  hasUnreadUpdates: boolean;

  downloadMenu: ReactNode;

  /** File dropdown — rendered immediately left of Select, then Community. */
  fileMenu?: ReactNode;

  /** Select menu — rendered immediately right of File on desktop/web. */
  selectMenu?: ReactNode;

  /**
   * Phone/tablet site row: File stays next to the logo in AppTopBar.
   * Copy SMILES / Copy SVG / Request live in the More sheet, not the top row.
   */
  compactLayout?: boolean;

  onOpenAdvancedSearch?: () => void;

  onOpenShortcuts?: () => void;

}



export interface HeaderPromoRowProps {

  quickSearch: string;

  setQuickSearch: (v: string) => void;

  quickSearchLoading: boolean;

  quickSearchError: string;

  setQuickSearchError: (v: string) => void;

  onQuickSearch: () => void;

  onOpenMyProjects?: () => void;

}



type MoreMenuItem =

  | { kind: 'link'; href: string; label: string; title: string }

  | { kind: 'action'; label: string; title: string; onClick: () => void; className?: string; piqoEvent?: string }

  | { kind: 'disabled'; label: string; title: string; hint: string }

  | { kind: 'submenu'; label: string; title: string; hint: string }

  | { kind: 'accordion'; label: string; title: string; items: MoreMenuItem[] };



function buildMoreItems(
  t: (key: string, vars?: Record<string, string>) => string,
  onOpenAdvancedSearch: () => void,
  onOpenShortcuts: () => void,
  account?: {
    signedIn: boolean;
    displayName: string;
    onSignOut: () => void;
    onSignIn?: () => void;
    onSignUp?: () => void;
  },
  extraActions?: MoreMenuItem[],
): MoreMenuItem[] {

  const accountItems: MoreMenuItem[] =
    account?.signedIn
      ? [
          {
            kind: 'disabled',
            label: t('nav.signedInTitle', { name: account.displayName }),
            title: t('nav.signedInTitle', { name: account.displayName }),
            hint: '',
          },
          {
            kind: 'action',
            label: t('nav.signOut'),
            title: t('nav.signedInTitle', { name: account.displayName }),
            onClick: account.onSignOut,
          },
        ]
      : account?.onSignIn && account?.onSignUp
        ? [
            {
              kind: 'action',
              label: t('nav.signIn'),
              title: t('nav.signInTitle'),
              onClick: account.onSignIn,
              piqoEvent: 'sign_in',
            },
            {
              kind: 'action',
              label: t('nav.signUp'),
              title: t('nav.signUpTitle'),
              onClick: account.onSignUp,
              className: 'tb-menu-item--auth-cta',
              piqoEvent: 'sign_up',
            },
          ]
        : [];

  return [
    ...accountItems,

    ...(extraActions ?? []),

    { kind: 'link', href: '/pages/about.html', label: t('nav.homepage'), title: t('nav.homepageTitle') },

    { kind: 'link', href: '/addons', label: t('nav.addons'), title: t('nav.addonsTitle') },

    {

      kind: 'link',

      href: '/tools/free-chem-tools/chemical-reaction-drawer.html',

      label: t('nav.reactionDrawer'),

      title: t('nav.reactionDrawerTitle'),

    },

    {

      kind: 'link',

      href: '/blog/chemdraw-vs-moldraw-free-alternative-guide.html',

      label: t('nav.chemdrawAlternative'),

      title: t('nav.chemdrawAlternativeTitle'),

    },

    { kind: 'link', href: '/course/index.html', label: t('nav.course'), title: t('nav.courseTitle') },

    { kind: 'link', href: '/pages/contact.html', label: t('nav.contact'), title: t('nav.contactTitle') },

    {

      kind: 'action',

      label: t('nav.pubchemSearch'),

      title: t('nav.pubchemSearchTitle'),

      onClick: onOpenAdvancedSearch,

    },

    {

      kind: 'submenu',

      label: t('nav.chemistry'),

      title: t('nav.chemistryTitle'),

      hint: t('nav.comingSoon'),

    },

    {

      kind: 'disabled',

      label: t('nav.docs'),

      title: t('nav.docsTitle'),

      hint: t('nav.comingSoon'),

    },

    { kind: 'link', href: '/pages/faq.html', label: t('nav.faq'), title: t('nav.faqTitle') },

    { kind: 'link', href: '/pages/ai-help.html', label: t('nav.aiSetup'), title: t('nav.aiSetupTitle') },

    { kind: 'link', href: '/blog/index.html', label: t('nav.blog'), title: t('nav.blogTitle') },

    {

      kind: 'action',

      label: t('nav.keyboardShortcuts'),

      title: t('nav.keyboardShortcutsTitle'),

      onClick: onOpenShortcuts,

    },

  ];

}



function MoreMenuBody({
  items,
  variant,
  onDismiss,
}: {
  items: MoreMenuItem[];
  variant: 'dropdown' | 'sheet';
  onDismiss: () => void;
}) {
  const [openAccordion, setOpenAccordion] = useState<string | null>(null);
  const itemClass = variant === 'sheet' ? 'mobile-sheet-list__btn' : 'tb-menu-item';
  const hintClass = variant === 'sheet' ? 'mobile-sheet-list__hint' : 'tb-menu-item-hint';
  const disabledClass = variant === 'sheet' ? ' mobile-sheet-list__btn--disabled' : ' tb-menu-item--disabled';

  const renderItem = (item: MoreMenuItem, nested = false) => {
        if (item.kind === 'link') {
          return (
            <a
              key={item.href}
              className={itemClass}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              title={item.title}
              role={variant === 'sheet' ? 'menuitem' : undefined}
              onClick={onDismiss}
            >
              {item.label}
            </a>
          );
        }
        if (item.kind === 'action') {
          const authCta = item.className?.includes('tb-menu-item--auth-cta');
          return (
            <button
              key={item.label}
              type="button"
              className={`${itemClass}${item.className ? ` ${item.className}` : ''}${
                variant === 'sheet' && authCta ? ' mobile-sheet-list__btn--auth-cta' : ''
              }`}
              title={item.title}
              role={variant === 'sheet' ? 'menuitem' : undefined}
              data-piqo-event={item.piqoEvent}
              onClick={() => {
                onDismiss();
                item.onClick();
              }}
            >
              {item.label}
            </button>
          );
        }
        if (item.kind === 'accordion') {
          if (variant !== 'sheet' || nested) {
            return item.items.map(child => renderItem(child, true));
          }
          return (
            <MobileSheetAccordion
              key={item.label}
              label={item.label}
              icon={item.label === 'Copy as' ? <Copy size={16} aria-hidden /> : undefined}
              open={openAccordion === item.label}
              onToggle={() => setOpenAccordion(v => (v === item.label ? null : item.label))}
            >
              {item.items.map(child => renderItem(child, true))}
            </MobileSheetAccordion>
          );
        }
        if (item.kind === 'submenu') {
          if (variant === 'dropdown') {
            return <MoreMenuSubmenuRow key={item.label} item={item} />;
          }
          return (
            <button
              key={item.label}
              type="button"
              className={`${itemClass}${disabledClass}`}
              title={item.title}
              disabled
            >
              <span>{item.label}</span>
              <span className={hintClass}>{item.hint}</span>
            </button>
          );
        }
        return (
          <button
            key={item.label}
            type="button"
            className={`${itemClass}${disabledClass}`}
            title={item.title}
            disabled
          >
            <span>{item.label}</span>
            {item.hint ? <span className={hintClass}>{item.hint}</span> : null}
          </button>
        );
  };

  return <>{items.map(item => renderItem(item))}</>;
}

function MoreMenuSubmenuRow({ item }: { item: Extract<MoreMenuItem, { kind: 'submenu' }> }) {
  const [open, setOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const [flyoutPos, setFlyoutPos] = useState<SideFlyoutPos | null>(null);

  useLayoutEffect(() => {
    if (!open || !rowRef.current) {
      setFlyoutPos(null);
      return;
    }
    const place = () => {
      const row = rowRef.current;
      if (!row) return;
      const panel = flyoutRef.current;
      setFlyoutPos(
        placeSideFlyout(row.getBoundingClientRect(), {
          menuWidth: panel?.offsetWidth ?? 160,
          menuHeight: panel?.offsetHeight ?? 80,
          prefer: 'left',
        }),
      );
    };
    place();
    const raf = window.requestAnimationFrame(place);
    return () => window.cancelAnimationFrame(raf);
  }, [open]);

  return (
    <div
      ref={rowRef}
      className="tb-menu-item tb-menu-item--submenu"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span>{item.label}</span>
      <ChevronRight size={12} aria-hidden />
      {open
        ? createPortal(
            <div
              ref={flyoutRef}
              className="tb-menu-dropdown-list tb-menu-dropdown-list--portal tb-menu-submenu-flyout"
              role="menu"
              style={
                flyoutPos
                  ? sideFlyoutStyle(flyoutPos)
                  : { position: 'fixed', top: 0, left: 0, visibility: 'hidden', zIndex: 25000 }
              }
              onMouseEnter={() => setOpen(true)}
              onMouseLeave={() => setOpen(false)}
            >
              <button type="button" className="tb-menu-item tb-menu-item--disabled" disabled title={item.title}>
                <span>{item.hint}</span>
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}



/** Row 1 right: Updates, More. */

export function HeaderPromoLinks({

  onOpenUpdates,

  hasUnreadUpdates,

  onOpenAdvancedSearch,

  onOpenShortcuts,

  signedIn = false,

  authDisplayName = '',

  onSignOut,

  onSignIn,

  onSignUp,

}: Pick<HeaderSiteNavProps, 'onOpenUpdates' | 'hasUnreadUpdates'> & {

  onOpenAdvancedSearch: () => void;

  onOpenShortcuts: () => void;

  signedIn?: boolean;

  authDisplayName?: string;

  onSignOut?: () => void;

  onSignIn?: () => void;

  onSignUp?: () => void;

}) {

  const { t } = useI18n();
  const [moreOpen, setMoreOpen] = useState(false);
  useChromeOverlay(moreOpen, () => setMoreOpen(false));

  const [moreMenuPos, setMoreMenuPos] = useState<AnchoredMenuPos | null>(null);

  const moreRef = useRef<HTMLDivElement>(null);

  const moreMenuRef = useRef<HTMLDivElement>(null);

  const moreItems = buildMoreItems(
    t,
    onOpenAdvancedSearch,
    onOpenShortcuts,
  );



  useLayoutEffect(() => {

    if (!moreOpen || !moreRef.current) {

      setMoreMenuPos(null);

      return;

    }

    const place = () => {
      const el = moreRef.current;
      if (!el) return;
      const panel = moreMenuRef.current;
      setMoreMenuPos(
        placeAnchoredMenu(el.getBoundingClientRect(), {
          menuWidth: panel?.offsetWidth ?? 200,
          menuHeight: panel?.offsetHeight ?? 280,
          align: 'right',
          offsetX: MORE_MENU_NUDGE_X,
        }),
      );
    };
    place();
    const raf = window.requestAnimationFrame(place);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };

  }, [moreOpen]);



  useEffect(() => {

    if (!moreOpen) return undefined;

    const onDoc = (event: MouseEvent) => {

      const target = event.target as Node;

      if (moreRef.current?.contains(target) || moreMenuRef.current?.contains(target)) return;

      setMoreOpen(false);

    };

    document.addEventListener('mousedown', onDoc);

    return () => document.removeEventListener('mousedown', onDoc);

  }, [moreOpen]);



  return (

    <nav className="header-promo-links" aria-label={t('nav.siteLinksAria')}>

      <button

        type="button"

        className={`viewer-toolbar-extra viewer-toolbar-updates${hasUnreadUpdates ? ' viewer-toolbar-updates-unread' : ''}`}

        onClick={onOpenUpdates}

        title={t('nav.updatesTitle')}

      >

        {t('nav.updates')}

        {hasUnreadUpdates ? <span className="updates-notification-dot" aria-hidden /> : null}

      </button>

      <div className="tb-menu-dropdown viewer-toolbar-more" ref={moreRef}>

        <button

          type="button"

          className={`viewer-toolbar-extra${signedIn ? ' viewer-toolbar-more--account' : ''}`}

          onClick={() => setMoreOpen(v => !v)}

          title={signedIn ? t('nav.signedInTitle', { name: authDisplayName }) : t('nav.moreLinksTitle')}

          aria-expanded={moreOpen}

        >

          {signedIn ? <span className="viewer-toolbar-more__dot" aria-hidden /> : null}

          {t('nav.more')}

        </button>

        {moreOpen && moreMenuPos

          ? createPortal(

              <div

                ref={moreMenuRef}

                className="tb-menu-dropdown-list tb-menu-dropdown-list--portal tb-menu-dropdown-list--compact"

                role="menu"

                aria-label={t('nav.moreLinksTitle')}

                style={anchoredMenuStyle(moreMenuPos)}

                onMouseDown={e => e.stopPropagation()}

              >

                <MoreMenuBody items={moreItems} variant="dropdown" onDismiss={() => setMoreOpen(false)} />

              </div>,

              document.body,

            )

          : null}

      </div>

    </nav>

  );

}



export function HeaderInlineSearch({

  quickSearch,

  setQuickSearch,

  quickSearchLoading,

  quickSearchError,

  setQuickSearchError,

  onQuickSearch,

  searchPlaceholder = 'Search molecule name (e.g., aspirin, caffeine…)',

  searchAriaLabel = 'Search PubChem by molecule name or CAS',

  autoFocus = false,

}: HeaderPromoRowProps & {
  searchPlaceholder?: string;
  searchAriaLabel?: string;
  autoFocus?: boolean;
}) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!autoFocus) return;
    const id = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [autoFocus]);

  return (
    <div className="header-inline-search">
      <div className={`header-inline-search__field${quickSearchError ? ' header-inline-search__field--error' : ''}`}>
        <button
          type="button"
          className={`header-inline-search__icon-btn${quickSearchLoading ? ' header-inline-search__icon-btn--spin' : ''}`}
          onClick={onQuickSearch}
          title={searchAriaLabel}
          aria-label={searchAriaLabel}
          data-piqo-event="search"
        >
          <Search size={13} color="#64748b" aria-hidden />
        </button>
        {!quickSearch.trim() ? (
          <span className="header-inline-search__source" title={searchAriaLabel}>
            {t('topBar.pubchem')}
          </span>
        ) : null}
        <input
          ref={inputRef}
          className="header-inline-search__input"
          value={quickSearch}
          onChange={e => {
            setQuickSearch(e.target.value);
            setQuickSearchError('');
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              trackEvent('search');
              onQuickSearch();
            }
          }}
          placeholder={searchPlaceholder}
          aria-label={searchAriaLabel}
          autoFocus={autoFocus}
        />
      </div>
    </div>
  );

}



/** Row 2: Community, designs, copy, Request feature, Download. Auth sits beside Tools. */

export function HeaderSiteNav({
  onOpenMyDesigns,
  onCopySmiles,
  onCopySvg,
  onPaste,
  onCopyAs,
  smilesCopied,
  svgCopied,
  svgCopyError,
  onRequestFeature,
  signedIn,
  authDisplayName,
  downloadMenu,
  fileMenu,
  selectMenu,
  compactLayout = false,
  onOpenAdvancedSearch,
  onOpenShortcuts,
}: HeaderSiteNavProps) {
  const { t } = useI18n();
  const [moreOpen, setMoreOpen] = useState(false);
  useChromeOverlay(moreOpen, () => setMoreOpen(false));

  const compactMoreItems = compactLayout
    ? buildMoreItems(
        t,
        () => onOpenAdvancedSearch?.(),
        () => onOpenShortcuts?.(),
        undefined,
        [
          {
            kind: 'link',
            href: '/tools/',
            label: t('nav.tools'),
            title: t('nav.toolsTitle'),
          },
          {
            kind: 'link',
            href: '/addons',
            label: t('nav.addons'),
            title: t('nav.addonsTitle'),
          },
          {
            kind: 'link',
            href: '/community/',
            label: t('nav.community'),
            title: t('nav.openCommunity'),
          },
          {
            kind: 'accordion',
            label: 'Copy as',
            title: 'Copy as…',
            items: onCopyAs
              ? COPY_AS_FORMAT_ITEMS.filter(item => item.available).map(item => ({
                  kind: 'action' as const,
                  label:
                    item.key === 'smiles' && smilesCopied
                      ? t('nav.copied')
                      : item.key === 'svg' && svgCopied
                        ? t('nav.copiedSvg')
                        : item.key === 'svg' && svgCopyError
                          ? t('nav.copyFailed')
                          : item.label.replace(/^Copy as /, ''),
                  title: item.label,
                  onClick: () => onCopyAs(item.key),
                }))
              : [
                  {
                    kind: 'action' as const,
                    label: smilesCopied ? t('nav.copied') : t('nav.copySmiles'),
                    title: t('nav.copySmilesTitle'),
                    onClick: onCopySmiles,
                  },
                  {
                    kind: 'action' as const,
                    label: svgCopied ? t('nav.copiedSvg') : svgCopyError ? t('nav.copyFailed') : t('nav.copySvg'),
                    title: t('nav.copySvgTitle'),
                    onClick: onCopySvg,
                  },
                ],
          },
          {
            kind: 'action',
            label: t('nav.paste'),
            title: t('nav.pasteTitle'),
            onClick: () => onPaste?.(),
          },
          {
            kind: 'action',
            label: t('nav.requestFeature'),
            title: t('nav.requestFeatureTitle'),
            onClick: onRequestFeature,
            piqoEvent: 'feature_request_open',
          },
        ],
      )
    : [];

  return (
    <nav
      className={`header-links header-links--actions${compactLayout ? ' header-links--compact' : ''}`}
      aria-label={t('nav.editorActionsAria')}
    >
      <div className="header-links__lead">
        {compactLayout ? null : fileMenu}
        {compactLayout ? null : selectMenu}
        {compactLayout ? null : (
          <a
            className="tb-btn tb-btn-community"
            href="/community/"
            target="_blank"
            rel="noopener noreferrer"
            title={t('nav.openCommunity')}
          >
            {t('nav.community')}
          </a>
        )}
        {compactLayout ? null : (
          <>
            <button
              type="button"
              className="tb-btn tb-btn-my-designs"
              onClick={onOpenMyDesigns}
              title={t('nav.openSavedDesigns')}
            >
              <FolderOpen size={11} strokeWidth={2} aria-hidden />
              {t('nav.myDesigns')}
            </button>
            <button
              type="button"
              className={`tb-btn tb-btn-clip${smilesCopied ? ' tb-copied' : ''}`}
              onClick={onCopySmiles}
              title={t('nav.copySmilesTitle')}
            >
              <Copy size={13} strokeWidth={2} aria-hidden />
              {smilesCopied ? t('nav.copied') : t('nav.copySmiles')}
            </button>
            <button
              type="button"
              className={`tb-btn tb-btn-clip${svgCopied ? ' tb-copied' : ''}${svgCopyError ? ' tb-copy-error' : ''}`}
              onClick={onCopySvg}
              title={t('nav.copySvgTitle')}
            >
              <Image size={13} strokeWidth={2} aria-hidden />
              {svgCopied ? t('nav.copiedSvg') : svgCopyError ? t('nav.copyFailed') : t('nav.copySvg')}
            </button>
            <button
              type="button"
              className="tb-btn tb-btn-clip"
              onClick={() => onPaste?.()}
              title={t('nav.pasteTitle')}
            >
              <ClipboardPaste size={13} strokeWidth={2} aria-hidden />
              {t('nav.paste')}
            </button>
            <button
              type="button"
              className="tb-btn tb-btn-feature-request"
              onClick={onRequestFeature}
              title={t('nav.requestFeatureTitle')}
              data-piqo-event="feature_request_open"
            >
              {t('nav.requestFeature')}
            </button>
            {downloadMenu}
          </>
        )}
      </div>
      <span className="header-links__trailing">
        {compactLayout ? downloadMenu : null}
        {compactLayout ? (
          <div className="tb-menu-dropdown viewer-toolbar-more">
            <button
              type="button"
              className={`viewer-toolbar-extra${signedIn ? ' viewer-toolbar-more--account' : ''}`}
              onClick={() => setMoreOpen(v => !v)}
              title={signedIn ? t('nav.signedInTitle', { name: authDisplayName }) : t('nav.moreLinksTitle')}
              aria-expanded={moreOpen}
              aria-haspopup="dialog"
            >
              {signedIn ? <span className="viewer-toolbar-more__dot" aria-hidden /> : null}
              {t('nav.more')}
            </button>
            <MobileBottomSheet
              open={moreOpen}
              onClose={() => setMoreOpen(false)}
              title={t('nav.more')}
              size="auto"
              className="mobile-sheet--menu"
              ariaLabel={t('nav.moreLinksTitle')}
            >
              <div className="mobile-sheet-list" role="menu" aria-label={t('nav.moreLinksTitle')}>
                <MoreMenuBody items={compactMoreItems} variant="sheet" onDismiss={() => setMoreOpen(false)} />
              </div>
            </MobileBottomSheet>
          </div>
        ) : null}
      </span>
    </nav>
  );
}

