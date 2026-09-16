/**
 * One toolbar cell (26×26): tool icon like peers + tiny in-corner chevron menu.
 * Menus portal to document.body (fixed) so top-bar overflow cannot clip them.
 * A single click on the icon (or caret) selects the tool and toggles the menu.
 */
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, LayoutGrid, Search } from 'lucide-react';
import { renderToolIcon } from '../toolIcons';
import {
  dropUpMenuStyle,
  isLeftRailTrigger,
  leftRailColumnRect,
  pinMenuAboveAnchor,
  pinMenuRightOfRail,
  placeAnchoredMenu,
  placeLeftRailFlyout,
  shouldOpenMenuAbove,
} from '../menuPlacement';

export interface ToolbarSplitToolOption<T extends string> {
  value: T;
  label: string;
  /** Extra tokens for searchable menus (aliases, kind ids, …). */
  keywords?: string;
}

export interface ToolbarSplitToolOptionGroup<T extends string> {
  id: string;
  label: string;
  options: readonly ToolbarSplitToolOption<T>[];
}

export interface ToolbarSplitToolProps<T extends string> {
  toolId: string;
  toolLabel: string;
  toolTitle: string;
  isActive: boolean;
  value: T;
  /** Flat option list (used when `groups` is omitted). */
  options?: readonly ToolbarSplitToolOption<T>[];
  /** Categorized option list — takes precedence over flat `options`. */
  groups?: readonly ToolbarSplitToolOptionGroup<T>[];
  onSelectTool: () => void;
  onChangeValue: (value: T) => void;
  menuAriaLabel: string;
  renderPreview?: (value: T) => ReactNode;
  /** Wider / taller popup (e.g. glassware catalog). */
  menuSize?: 'default' | 'wide';
  /** Show a compact search field at the top of the menu. */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Optional “open full library” control above the menu list. */
  onOpenLibrary?: () => void;
  libraryButtonLabel?: string;
  /** One-line usage hint shown at the top of the menu (e.g. polymer tool). */
  menuHint?: string;
}

type MenuPlacement = 'right' | 'below' | 'above' | 'slider';

function matchesQuery(opt: ToolbarSplitToolOption<string>, q: string): boolean {
  if (!q) return true;
  const hay = `${opt.label} ${opt.value} ${opt.keywords ?? ''}`.toLowerCase();
  return hay.includes(q);
}

function detectPlacement(el: HTMLElement): MenuPlacement {
  if (isLeftRailTrigger(el)) return 'right';
  const rect = el.getBoundingClientRect();
  if (shouldOpenMenuAbove(el, rect)) return 'above';
  if (el.closest('.toolbar-top-strip') || el.closest('.app-top-bar__tools-row')) return 'below';
  return 'right';
}

function menuFixedStyle(
  anchor: DOMRect,
  placement: MenuPlacement,
  menuWidth: number,
  trigger?: HTMLElement | null,
): CSSProperties {
  const compact = document.documentElement.classList.contains('app-mobile-compact');
  const tall = compact ? Math.max(280, window.innerHeight * 0.55) : 280;
  if (placement === 'above' || placement === 'slider') {
    return dropUpMenuStyle(anchor, menuWidth);
  }
  if (placement === 'below') {
    const placed = placeAnchoredMenu(anchor, {
      menuWidth,
      menuHeight: tall,
    });
    if (placed.openUp) return dropUpMenuStyle(anchor, menuWidth);
    return {
      position: 'fixed',
      top: placed.top,
      left: placed.left,
      right: 'auto',
      bottom: 'auto',
      maxHeight: placed.maxHeight,
      zIndex: 24000,
    };
  }
  const col = trigger ? leftRailColumnRect(trigger) : null;
  const pos = placeLeftRailFlyout(anchor, { menuWidth, menuHeight: 280 }, col);
  return {
    position: 'fixed',
    top: pos.top,
    left: pos.left,
    right: 'auto',
    bottom: 'auto',
    maxHeight: pos.maxHeight,
    zIndex: 24000,
  };
}

export function ToolbarSplitTool<T extends string>({
  toolId,
  toolLabel,
  toolTitle,
  isActive,
  value,
  options,
  groups,
  onSelectTool,
  onChangeValue,
  menuAriaLabel,
  renderPreview,
  menuSize = 'default',
  searchable = false,
  searchPlaceholder = 'Search…',
  onOpenLibrary,
  libraryButtonLabel = 'Browse all',
  menuHint,
}: ToolbarSplitToolProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const [menuCompact, setMenuCompact] = useState(false);
  const [menuDropUp, setMenuDropUp] = useState(
    () =>
      typeof document !== 'undefined' &&
      document.documentElement.classList.contains('app-mobile-compact'),
  );
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const menuId = useId();
  const searchId = useId();

  const closeMenu = () => {
    setOpen(false);
    setQuery('');
  };

  const toggleMenu = () => {
    onSelectTool();
    setOpen(v => !v);
  };

  useLayoutEffect(() => {
    if (!open || !wrapRef.current) {
      setMenuStyle(null);
      return;
    }
    const menuWidth = menuSize === 'wide' ? 196 : 168;
    const update = () => {
      const el = wrapRef.current;
      if (!el) return;
      const placement = detectPlacement(el);
      const rect = el.getBoundingClientRect();
      const dropUp = !isLeftRailTrigger(el) && (placement === 'above' || placement === 'slider');
      setMenuCompact(true);
      setMenuDropUp(dropUp);
      setMenuStyle(
        dropUp ? dropUpMenuStyle(rect, menuWidth) : menuFixedStyle(rect, placement, menuWidth, el),
      );
      const menu = menuRef.current;
      if (menu && isLeftRailTrigger(el)) {
        pinMenuRightOfRail(menu, el, menuWidth);
      }
    };
    update();
    const raf = window.requestAnimationFrame(update);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
    };
  }, [open, menuSize]);

  useLayoutEffect(() => {
    if (!open) return;
    const menu = menuRef.current;
    const el = wrapRef.current;
    if (!menu || !el) return;
    const menuWidth = menuSize === 'wide' ? 196 : 168;
    if (isLeftRailTrigger(el)) {
      pinMenuRightOfRail(menu, el, menuWidth);
      return;
    }
    if (!menuDropUp) return;
    pinMenuAboveAnchor(menu, el.getBoundingClientRect(), menuWidth);
  }, [open, menuDropUp, menuStyle, menuSize]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: Event) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      closeMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu();
    };
    const t = window.setTimeout(() => {
      document.addEventListener('pointerdown', onDoc);
    }, 0);
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('pointerdown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !searchable) return;
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open, searchable]);

  const q = query.trim().toLowerCase();

  const filteredGroups = useMemo(() => {
    if (groups == null) return null;
    if (!q) return groups;
    return groups
      .map(g => ({
        ...g,
        options: g.options.filter(opt => matchesQuery(opt, q)),
      }))
      .filter(g => g.options.length > 0);
  }, [groups, q]);

  const flatOptions = useMemo(
    () => (groups != null ? groups.flatMap(g => g.options) : (options ?? [])),
    [groups, options],
  );

  const filteredFlat = useMemo(() => {
    if (groups != null) return [];
    if (!q) return flatOptions;
    return flatOptions.filter(opt => matchesQuery(opt, q));
  }, [groups, flatOptions, q]);

  const currentLabel = flatOptions.find(o => o.value === value)?.label ?? value;
  const visibleCount =
    filteredGroups != null
      ? filteredGroups.reduce((n, g) => n + g.options.length, 0)
      : filteredFlat.length;

  const renderItem = (opt: ToolbarSplitToolOption<T>) => {
    const preview = renderPreview ? (
      renderPreview(opt.value)
    ) : (
      renderToolIcon(opt.value)
    );
    return (
    <button
      key={opt.value}
      type="button"
      role="menuitemradio"
      aria-checked={opt.value === value}
      className={`toolbar-split-tool__item${opt.value === value ? ' toolbar-split-tool__item--on' : ''}`}
      onClick={() => {
        onChangeValue(opt.value);
        closeMenu();
      }}
    >
      <span className="toolbar-split-tool__preview" aria-hidden>
        {preview}
      </span>
      <span className="toolbar-split-tool__item-label">{opt.label}</span>
    </button>
    );
  };

  const menu =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={menuRef}
            id={menuId}
            className={`toolbar-split-tool__menu toolbar-split-tool__menu--portal${menuSize === 'wide' ? ' toolbar-split-tool__menu--wide' : ''}${menuCompact ? ' toolbar-split-tool__menu--compact' : ''}${menuDropUp ? ' toolbar-split-tool__menu--drop-up' : ''}${searchable || onOpenLibrary ? ' toolbar-split-tool__menu--searchable' : ''}`}
            data-placement={menuDropUp ? 'above' : 'right'}
            role="menu"
            style={menuStyle ?? undefined}
          >
            {menuHint ? <p className="toolbar-split-tool__hint">{menuHint}</p> : null}
            {onOpenLibrary ? (
              <button
                type="button"
                className="toolbar-split-tool__library-btn"
                onClick={e => {
                  e.stopPropagation();
                  closeMenu();
                  onOpenLibrary();
                }}
                title={libraryButtonLabel}
              >
                <LayoutGrid size={12} strokeWidth={2} aria-hidden />
                <span>{libraryButtonLabel}</span>
              </button>
            ) : null}
            {searchable ? (
              <div className="toolbar-split-tool__search">
                <Search size={12} strokeWidth={2} aria-hidden className="toolbar-split-tool__search-icon" />
                <input
                  ref={searchRef}
                  id={searchId}
                  type="search"
                  className="toolbar-split-tool__search-input"
                  value={query}
                  placeholder={searchPlaceholder}
                  aria-label={`Search ${toolLabel.toLowerCase()}`}
                  autoComplete="off"
                  onKeyDown={e => {
                    e.stopPropagation();
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      closeMenu();
                    }
                  }}
                  onChange={e => setQuery(e.target.value)}
                  onClick={e => e.stopPropagation()}
                />
              </div>
            ) : null}
            <div className="toolbar-split-tool__menu-body">
              {visibleCount === 0 ? (
                <div className="toolbar-split-tool__empty">No matches</div>
              ) : filteredGroups != null
                ? filteredGroups.map(group => (
                    <div key={group.id} className="toolbar-split-tool__group" role="group" aria-label={group.label}>
                      <div className="toolbar-split-tool__group-label">{group.label}</div>
                      {group.options.map(renderItem)}
                    </div>
                  ))
                : filteredFlat.map(renderItem)}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      ref={wrapRef}
      className={`toolbar-split-tool${isActive ? ' toolbar-split-tool--active' : ''}${open ? ' toolbar-split-tool--open' : ''}`}
    >
      <button
        type="button"
        className="toolbar-split-tool__icon"
        onClick={toggleMenu}
        title={`${toolTitle} — click to open options (${currentLabel})`}
        aria-label={toolLabel}
        aria-pressed={isActive}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
      >
        {renderToolIcon(toolId)}
      </button>
      <button
        type="button"
        className={`toolbar-split-tool__caret${open ? ' toolbar-split-tool__caret--open' : ''}`}
        onPointerDown={e => e.stopPropagation()}
        onClick={e => {
          e.stopPropagation();
          toggleMenu();
        }}
        title={`${toolLabel}: ${currentLabel}`}
        aria-label={menuAriaLabel}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        tabIndex={-1}
      >
        <ChevronDown size={6} strokeWidth={2.5} aria-hidden />
      </button>
      {menu}
    </div>
  );
}
