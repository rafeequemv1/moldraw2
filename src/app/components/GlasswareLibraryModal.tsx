/**
 * Full apparatus catalog modal: category sidebar + searchable preview grid.
 */
import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Folder, LayoutGrid, X } from 'lucide-react';
import {
  listGlasswareLibraryByCategory,
  type CanvasShapeKind,
  type GlasswareCategoryId,
} from '@moldraw/domain';
import { ShapeKindPreview } from './toolOptionPreviews';
import '../../styles/template-library-modal.css';
import '../../styles/glassware-library-modal.css';

const ALL_CATEGORY_ID = 'all' as const;
type SidebarCategoryId = typeof ALL_CATEGORY_ID | GlasswareCategoryId;

export interface GlasswareLibraryModalProps {
  open: boolean;
  onClose: () => void;
  value: CanvasShapeKind;
  onSelect: (kind: CanvasShapeKind) => void;
}

export function GlasswareLibraryModal({
  open,
  onClose,
  value,
  onSelect,
}: GlasswareLibraryModalProps) {
  const groups = useMemo(() => listGlasswareLibraryByCategory(), []);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<SidebarCategoryId>(ALL_CATEGORY_ID);

  const searchQuery = search.trim().toLowerCase();
  const totalCount = useMemo(() => groups.reduce((n, g) => n + g.items.length, 0), [groups]);

  const filteredGroups = useMemo(() => {
    if (!searchQuery) return groups;
    return groups
      .map(g => ({
        ...g,
        items: g.items.filter(e => {
          const hay = `${e.label} ${e.kind} ${e.aliases.join(' ')} ${e.summary}`.toLowerCase();
          return hay.includes(searchQuery);
        }),
      }))
      .filter(g => g.items.length > 0 || g.label.toLowerCase().includes(searchQuery));
  }, [groups, searchQuery]);

  const filteredTotal = useMemo(
    () => filteredGroups.reduce((n, g) => n + g.items.length, 0),
    [filteredGroups],
  );

  const showAll = categoryId === ALL_CATEGORY_ID || Boolean(searchQuery);

  const activeGroup = useMemo(() => {
    if (categoryId === ALL_CATEGORY_ID) return null;
    const hit = filteredGroups.find(g => g.id === categoryId);
    return hit ?? filteredGroups[0] ?? null;
  }, [filteredGroups, categoryId]);

  const displayItems = useMemo(() => {
    if (showAll) {
      return filteredGroups.flatMap(g => g.items.map(item => ({ ...item, categoryLabel: g.label })));
    }
    return (activeGroup?.items ?? []).map(item => ({
      ...item,
      categoryLabel: activeGroup?.label ?? '',
    }));
  }, [showAll, filteredGroups, activeGroup]);

  const handleClose = () => {
    setSearch('');
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSearch('');
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const mainLabel = searchQuery ? 'Search results' : showAll ? 'All apparatus' : (activeGroup?.label ?? 'Apparatus');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Apparatus library"
      className="template-library-overlay"
      onMouseDown={handleClose}
    >
      <div className="template-library-dialog glassware-library-dialog" onMouseDown={e => e.stopPropagation()}>
        <header className="template-library-header">
          <div>
            <div className="template-library-header__title">Apparatus library</div>
            <div className="template-library-header__subtitle">
              Browse all lab glassware and instruments — click to select the drawing tool.
            </div>
          </div>
          <button type="button" aria-label="Close" className="template-library-close" onClick={handleClose}>
            <X size={18} />
          </button>
        </header>

        <div className="template-library-body">
          <aside className="template-library-sidebar">
            <div className="template-library-search-wrap">
              <input
                type="search"
                className="template-library-search"
                placeholder="Search apparatus…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                aria-label="Search apparatus"
                autoFocus
              />
            </div>
            <nav className="template-library-nav" aria-label="Apparatus categories">
              <button
                type="button"
                className={`template-library-category${categoryId === ALL_CATEGORY_ID && !searchQuery ? ' template-library-category--active' : ''}`}
                onClick={() => setCategoryId(ALL_CATEGORY_ID)}
              >
                <ChevronRight size={14} className="template-library-category__chevron" aria-hidden />
                <LayoutGrid size={15} className="template-library-category__icon" aria-hidden />
                <span className="template-library-category__label">All</span>
                <span className="template-library-category__count">
                  ({searchQuery ? filteredTotal : totalCount})
                </span>
              </button>
              {filteredGroups.length === 0 ? (
                <p className="template-library-nav__empty">No categories match.</p>
              ) : (
                filteredGroups.map(cat => {
                  const active = !showAll && cat.id === activeGroup?.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      className={`template-library-category${active ? ' template-library-category--active' : ''}`}
                      onClick={() => setCategoryId(cat.id)}
                    >
                      <ChevronRight size={14} className="template-library-category__chevron" aria-hidden />
                      <Folder size={15} className="template-library-category__icon" aria-hidden />
                      <span className="template-library-category__label">{cat.label}</span>
                      <span className="template-library-category__count">({cat.items.length})</span>
                    </button>
                  );
                })
              )}
            </nav>
          </aside>

          <section className="template-library-main" aria-label={mainLabel}>
            <div className="template-library-main__head">
              {mainLabel}
              <span className="template-library-main__meta">
                {displayItems.length} {displayItems.length === 1 ? 'item' : 'items'}
              </span>
            </div>
            <div className="template-library-main__scroll">
              {displayItems.length === 0 ? (
                <div className="template-library-placeholder">
                  <p className="template-library-placeholder__title">No matches</p>
                  <p className="template-library-placeholder__hint">Try another search term.</p>
                </div>
              ) : (
                <div className="template-library-grid glassware-library-grid">
                  {displayItems.map(item => {
                    const selected = item.kind === value;
                    return (
                      <button
                        key={item.kind}
                        type="button"
                        className={`template-library-card glassware-library-card${selected ? ' glassware-library-card--on' : ''}`}
                        title={item.summary}
                        onClick={() => {
                          onSelect(item.kind);
                          handleClose();
                        }}
                      >
                        <span className="glassware-library-card__preview" aria-hidden>
                          <ShapeKindPreview
                            kind={item.kind}
                            size={56}
                            className="glassware-library-card__canvas"
                          />
                        </span>
                        <span className="glassware-library-card__label">{item.label}</span>
                        {showAll && item.categoryLabel ? (
                          <span className="glassware-library-card__cat">{item.categoryLabel}</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
