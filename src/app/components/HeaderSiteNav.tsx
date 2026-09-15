import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import { createPortal } from 'react-dom';

import { ChevronRight, Copy, FolderOpen, Image, Search } from 'lucide-react';

import { useI18n } from '../i18n';
import { anchoredMenuStyle, placeAnchoredMenu, type AnchoredMenuPos } from '../menuPlacement';



export interface HeaderSiteNavProps {

  onOpenMyDesigns: () => void;

  onCopySmiles: () => void;

  onCopySvg: () => void;

  smilesCopied: boolean;

  svgCopied: boolean;

  svgCopyError: boolean;

  onRequestFeature: () => void;

  onSignIn: () => void;

  onSignUp: () => void;

  onSignOut: () => void;

  signedIn: boolean;

  authDisplayName: string;

  onOpenUpdates: () => void;

  hasUnreadUpdates: boolean;

  downloadMenu: ReactNode;

  /**
   * Desktop: the signed-in account (name + Sign out) lives in the right-hand
   * "More" menu instead of this row. Compact rows keep it here, pushed right.
   */
  accountInMoreMenu?: boolean;

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

  | { kind: 'action'; label: string; title: string; onClick: () => void }

  | { kind: 'disabled'; label: string; title: string; hint: string }

  | { kind: 'submenu'; label: string; title: string; hint: string };



function buildMoreItems(
  t: (key: string, vars?: Record<string, string>) => string,
  onOpenAdvancedSearch: () => void,
  onOpenShortcuts: () => void,
  account?: { signedIn: boolean; displayName: string; onSignOut: () => void },
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
      : [];

  return [
    ...accountItems,

    { kind: 'link', href: '/pages/about.html', label: t('nav.homepage'), title: t('nav.homepageTitle') },

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



function MoreMenuSubmenuRow({ item }: { item: Extract<MoreMenuItem, { kind: 'submenu' }> }) {

  const [open, setOpen] = useState(false);

  const rowRef = useRef<HTMLDivElement>(null);

  const flyoutRef = useRef<HTMLDivElement>(null);

  const [flyoutPos, setFlyoutPos] = useState<{ top: number; left: number } | null>(null);



  useLayoutEffect(() => {

    if (!open || !rowRef.current) {

      setFlyoutPos(null);

      return;

    }

    const rect = rowRef.current.getBoundingClientRect();

    setFlyoutPos({ top: rect.top, left: rect.right + 4 });

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

      {open && flyoutPos

        ? createPortal(

            <div

              ref={flyoutRef}

              className="tb-menu-dropdown-list tb-menu-dropdown-list--portal tb-menu-submenu-flyout"

              role="menu"

              style={{ top: flyoutPos.top, left: flyoutPos.left }}

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

}: Pick<HeaderSiteNavProps, 'onOpenUpdates' | 'hasUnreadUpdates'> & {

  onOpenAdvancedSearch: () => void;

  onOpenShortcuts: () => void;

  signedIn?: boolean;

  authDisplayName?: string;

  onSignOut?: () => void;

}) {

  const { t } = useI18n();
  const [moreOpen, setMoreOpen] = useState(false);

  const [moreMenuPos, setMoreMenuPos] = useState<AnchoredMenuPos | null>(null);

  const moreRef = useRef<HTMLDivElement>(null);

  const moreMenuRef = useRef<HTMLDivElement>(null);

  const moreItems = buildMoreItems(
    t,
    onOpenAdvancedSearch,
    onOpenShortcuts,
    onSignOut ? { signedIn, displayName: authDisplayName, onSignOut } : undefined,
  );



  useLayoutEffect(() => {

    if (!moreOpen || !moreRef.current) {

      setMoreMenuPos(null);

      return;

    }

    const rect = moreRef.current.getBoundingClientRect();

    setMoreMenuPos(placeAnchoredMenu(rect, { menuWidth: 180, menuHeight: 280, align: 'right' }));

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

                {moreItems.map(item => {

                  if (item.kind === 'link') {

                    return (

                      <a

                        key={item.href}

                        className="tb-menu-item"

                        href={item.href}

                        target="_blank"

                        rel="noopener noreferrer"

                        title={item.title}

                        onClick={() => setMoreOpen(false)}

                      >

                        {item.label}

                      </a>

                    );

                  }

                  if (item.kind === 'action') {

                    return (

                      <button

                        key={item.label}

                        type="button"

                        className="tb-menu-item"

                        title={item.title}

                        onClick={() => {

                          setMoreOpen(false);

                          item.onClick();

                        }}

                      >

                        {item.label}

                      </button>

                    );

                  }

                  if (item.kind === 'submenu') {

                    return <MoreMenuSubmenuRow key={item.label} item={item} />;

                  }

                  return (

                    <button

                      key={item.label}

                      type="button"

                      className="tb-menu-item tb-menu-item--disabled"

                      title={item.title}

                      disabled

                    >

                      <span>{item.label}</span>

                      <span className="tb-menu-item-hint">{item.hint}</span>

                    </button>

                  );

                })}

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

}: HeaderPromoRowProps & {
  searchPlaceholder?: string;
  searchAriaLabel?: string;
}) {

  return (

    <div className="header-inline-search">

      <div className={`header-inline-search__field${quickSearchError ? ' header-inline-search__field--error' : ''}`}>

        <button
          type="button"
          className={`header-inline-search__icon-btn${quickSearchLoading ? ' header-inline-search__icon-btn--spin' : ''}`}
          onClick={onQuickSearch}
          title={searchAriaLabel}
          aria-label={searchAriaLabel}
        >
          <Search size={13} color="#64748b" aria-hidden />
        </button>

        <input

          className="header-inline-search__input"

          value={quickSearch}

          onChange={e => {

            setQuickSearch(e.target.value);

            setQuickSearchError('');

          }}

          onKeyDown={e => {

            if (e.key === 'Enter') onQuickSearch();

          }}

          placeholder={searchPlaceholder}

          aria-label={searchAriaLabel}

        />

      </div>

    </div>

  );

}



/** Row 2: Community, designs, auth, Download, Tools. */

export function HeaderSiteNav({

  onOpenMyDesigns,

  onCopySmiles,

  onCopySvg,

  smilesCopied,

  svgCopied,

  svgCopyError,

  onRequestFeature,

  onSignIn,

  onSignUp,

  onSignOut,

  signedIn,

  authDisplayName,

  downloadMenu,

  accountInMoreMenu = false,

}: HeaderSiteNavProps) {

  const { t } = useI18n();

  return (

    <nav className="header-links header-links--actions" aria-label={t('nav.editorActionsAria')}>

      <a

        className="tb-btn tb-btn-community"

        href="/community/"

        target="_blank"

        rel="noopener noreferrer"

        title={t('nav.openCommunity')}

      >

        {t('nav.community')}

      </a>

      <button type="button" className="tb-btn tb-btn-my-designs" onClick={onOpenMyDesigns} title={t('nav.openSavedDesigns')}>

        <FolderOpen size={11} strokeWidth={2} aria-hidden />

        {t('nav.myDesigns')}

      </button>

      <button

        type="button"

        className={`tb-btn tb-btn-clip${smilesCopied ? ' tb-copied' : ''}`}

        onClick={onCopySmiles}

        title={t('nav.copySmilesTitle')}

      >

        <Copy size={11} strokeWidth={2} aria-hidden />

        {smilesCopied ? t('nav.copied') : t('nav.copySmiles')}

      </button>

      <button

        type="button"

        className={`tb-btn tb-btn-clip${svgCopied ? ' tb-copied' : ''}${svgCopyError ? ' tb-copy-error' : ''}`}

        onClick={onCopySvg}

        title={t('nav.copySvgTitle')}

      >

        <Image size={11} strokeWidth={2} aria-hidden />

        {svgCopied ? t('nav.copiedSvg') : svgCopyError ? t('nav.copyFailed') : t('nav.copySvg')}

      </button>

      <button

        type="button"

        className="tb-btn tb-btn-feature-request"

        onClick={onRequestFeature}

        title={t('nav.requestFeatureTitle')}

      >

        {t('nav.requestFeature')}

      </button>

      {signedIn ? (

        accountInMoreMenu ? null : (

          <button

            type="button"

            className="tb-btn tb-btn-auth tb-btn-auth-signed tb-btn-auth-signed--right"

            onClick={() => void onSignOut()}

            title={t('nav.signedInTitle', { name: authDisplayName })}

          >

            {t('nav.signOut')}

          </button>

        )

      ) : (

        <>

          <button type="button" className="tb-btn tb-btn-auth" onClick={onSignIn} title={t('nav.signInTitle')}>

            {t('nav.signIn')}

          </button>

          <button

            type="button"

            className="tb-btn tb-btn-auth tb-btn-auth-cta"

            onClick={onSignUp}

            title={t('nav.signUpTitle')}

          >

            {t('nav.signUp')}

          </button>

        </>

      )}

      {downloadMenu}

      <a

        className="tb-btn tb-btn-tools"

        href="/tools/"

        target="_blank"

        rel="noopener noreferrer"

        title={t('nav.toolsTitle')}

      >

        {t('nav.tools')}

      </a>

    </nav>

  );

}

