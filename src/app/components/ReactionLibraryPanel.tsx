/**
 * Reaction library body — categories, list, detail pane. Embedded in template library tab.
 */
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ChevronRight, Folder, Star } from 'lucide-react';
import {
  DEFAULT_REACTION_CATEGORY_ID,
  REACTION_CATEGORIES,
  REACTION_BY_ID,
  categoryHasReactionMatch,
  reactionsInCategory,
  searchNamedReactions,
  toggleReactionFavorite,
  loadReactionLibraryLocal,
  type ReactionCategoryId,
  type ReactionTemplate,
} from '@moldraw/reactions';
import '../../styles/reaction-library-modal.css';

export interface ReactionLibraryPanelProps {
  active: boolean;
  onInsert: (reactionId: string) => void | Promise<void>;
  insertingId?: string | null;
}

export function ReactionLibraryPanel({
  active,
  onInsert,
  insertingId = null,
}: ReactionLibraryPanelProps) {
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<ReactionCategoryId>(DEFAULT_REACTION_CATEGORY_ID);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => loadReactionLibraryLocal().favoriteIds);

  const searchQuery = search.trim().toLowerCase();

  const filteredCategories = useMemo(() => {
    if (!searchQuery) return REACTION_CATEGORIES;
    return REACTION_CATEGORIES.filter(
      c => c.label.toLowerCase().includes(searchQuery) || categoryHasReactionMatch(c.id, search),
    );
  }, [search, searchQuery]);

  const globalSearchHits = useMemo(
    () => (searchQuery ? searchNamedReactions(search) : []),
    [search, searchQuery],
  );

  const categoryReactions = useMemo(() => {
    if (searchQuery) return [];
    return reactionsInCategory(categoryId);
  }, [categoryId, searchQuery]);

  const selected: ReactionTemplate | null = selectedId ? (REACTION_BY_ID.get(selectedId) ?? null) : null;

  useEffect(() => {
    if (!active) {
      setSearch('');
      setCategoryId(DEFAULT_REACTION_CATEGORY_ID);
      setSelectedId(null);
    }
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const visible = filteredCategories.some(c => c.id === categoryId);
    if (!visible && filteredCategories.length > 0) {
      setCategoryId(filteredCategories[0]!.id);
    }
  }, [active, filteredCategories, categoryId]);

  const listReactions = searchQuery
    ? globalSearchHits.map(h => h.reaction)
    : categoryReactions;

  useEffect(() => {
    if (!active || listReactions.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !listReactions.some(r => r.id === selectedId)) {
      setSelectedId(listReactions[0]!.id);
    }
  }, [active, listReactions, selectedId]);

  if (!active) return null;

  const activeCategory = REACTION_CATEGORIES.find(c => c.id === categoryId) ?? REACTION_CATEGORIES[0]!;

  const handleToggleFavorite = (id: string) => {
    const next = toggleReactionFavorite(id);
    setFavoriteIds(next.favoriteIds);
  };

  return (
    <div className="template-library-body reaction-library-body">
      <aside className="template-library-sidebar">
        <div className="template-library-search-wrap">
          <input
            type="search"
            className="template-library-search"
            placeholder="Search reactions…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Search reactions"
          />
        </div>
        <nav className="template-library-nav" aria-label="Reaction categories">
          {filteredCategories.map(cat => {
            const catActive = !searchQuery && cat.id === categoryId;
            const count = reactionsInCategory(cat.id).length;
            return (
              <button
                key={cat.id}
                type="button"
                className={`template-library-category${catActive ? ' template-library-category--active' : ''}`}
                onClick={() => {
                  setCategoryId(cat.id);
                  setSearch('');
                }}
              >
                <ChevronRight size={14} className="template-library-category__chevron" aria-hidden />
                <Folder size={15} className="template-library-category__icon" aria-hidden />
                <span className="template-library-category__label">{cat.label}</span>
                <span className="template-library-category__count">({count})</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <section className="template-library-main reaction-library-list" aria-label="Reactions">
        <div className="template-library-main__head">
          {searchQuery ? 'Search results' : activeCategory.label}
          <span className="template-library-main__meta">
            {listReactions.length} {listReactions.length === 1 ? 'reaction' : 'reactions'}
          </span>
        </div>
        <div className="template-library-main__scroll reaction-library-list__scroll">
          {listReactions.length === 0 ? (
            <p className="reaction-library-empty">No reactions match your search.</p>
          ) : (
            <ul className="reaction-library-cards">
              {listReactions.map(reaction => {
                const isActive = reaction.id === selectedId;
                const isFav = favoriteIds.includes(reaction.id);
                return (
                  <li key={reaction.id}>
                    <button
                      type="button"
                      className={`reaction-library-card${isActive ? ' reaction-library-card--active' : ''}`}
                      onClick={() => setSelectedId(reaction.id)}
                    >
                      <span className="reaction-library-card__label">{reaction.label}</span>
                      <span className="reaction-library-card__name">{reaction.name}</span>
                      <span className="reaction-library-card__summary">{reaction.summary}</span>
                      <span className="reaction-library-card__meta">
                        {reaction.steps.length} step{reaction.steps.length === 1 ? '' : 's'} ·{' '}
                        {reaction.compounds.length} structures
                      </span>
                      <button
                        type="button"
                        className={`reaction-library-card__fav${isFav ? ' reaction-library-card__fav--on' : ''}`}
                        title={isFav ? 'Remove favorite' : 'Favorite'}
                        aria-label={isFav ? 'Remove favorite' : 'Add favorite'}
                        onClick={e => {
                          e.stopPropagation();
                          handleToggleFavorite(reaction.id);
                        }}
                      >
                        <Star size={13} fill={isFav ? 'currentColor' : 'none'} />
                      </button>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <aside className="reaction-library-detail" aria-label="Reaction detail">
        {selected ? (
          <>
            <div className="reaction-library-detail__head">
              <h2 className="reaction-library-detail__title">{selected.name}</h2>
              <p className="reaction-library-detail__summary">{selected.summary}</p>
            </div>

            <div className="reaction-library-detail__scheme" aria-label="Reaction scheme preview">
              {selected.compounds.map((c, i) => (
                <span key={`${selected.id}-c-${i}`} className="reaction-library-detail__compound">
                  {c.labelBelow ?? c.smiles}
                  {i < selected.compounds.length - 1 ? (
                    <span className="reaction-library-detail__arrow-wrap">
                      <ArrowRight size={14} aria-hidden className="reaction-library-detail__arrow-icon" />
                      {selected.steps[i] ? (
                        <span className="reaction-library-detail__step-cond">
                          {selected.steps[i]!.reagentAbove ? (
                            <span className="reaction-library-detail__above">
                              {selected.steps[i]!.reagentAbove}
                            </span>
                          ) : null}
                          {selected.steps[i]!.reagentBelow ? (
                            <span className="reaction-library-detail__below">
                              {selected.steps[i]!.reagentBelow}
                            </span>
                          ) : null}
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </span>
              ))}
            </div>

            <ol className="reaction-library-detail__steps">
              {selected.steps.map((step, i) => (
                <li key={`${selected.id}-step-${i}`} className="reaction-library-detail__step">
                  <div className="reaction-library-detail__step-title">
                    Step {i + 1}: {step.label}
                  </div>
                  {(step.reagentAbove || step.reagentBelow) && (
                    <div className="reaction-library-detail__step-conditions">
                      {step.reagentAbove ? <span>↑ {step.reagentAbove}</span> : null}
                      {step.reagentBelow ? <span>↓ {step.reagentBelow}</span> : null}
                    </div>
                  )}
                  {step.mechanism ? (
                    <p className="reaction-library-detail__step-mechanism">{step.mechanism}</p>
                  ) : null}
                </li>
              ))}
            </ol>

            {selected.mechanism ? (
              <div className="reaction-library-detail__mechanism">
                <h3 className="reaction-library-detail__mechanism-title">Mechanism</h3>
                <p>{selected.mechanism}</p>
              </div>
            ) : null}

            <div className="reaction-library-detail__actions">
              <button
                type="button"
                className="reaction-library-insert-btn"
                disabled={insertingId === selected.id}
                onClick={() => void onInsert(selected.id)}
              >
                {insertingId === selected.id ? 'Inserting…' : 'Insert on canvas'}
              </button>
            </div>
          </>
        ) : (
          <p className="reaction-library-empty">Select a reaction to view steps and mechanism.</p>
        )}
      </aside>
    </div>
  );
}
