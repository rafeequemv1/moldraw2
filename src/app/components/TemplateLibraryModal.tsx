/**
 * Template library: R-groups, ligands, structure categories, COFs, reactions.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronRight, Folder, X } from 'lucide-react';
import {
  DEFAULT_TEMPLATE_CATEGORY_ID,
  TEMPLATE_CATEGORIES,
  AMINO_ACID_TEMPLATES,
  FUNCTIONAL_GROUP_TEMPLATES,
  LIGAND_TEMPLATES,
  STRUCTURE_3D_TEMPLATES,
  categoryHasTemplateMatch,
  searchImplementedTemplates,
  type TemplateCategoryId,
} from '@moldraw/templates';
import { AminoAcidTemplateCard } from './AminoAcidTemplateCard';
import { SmilesTemplateCard } from './SmilesTemplateCard';
import { ReactionLibraryPanel } from './ReactionLibraryPanel';
import { CofsLibraryPanel } from '../cofs/CofsLibraryPanel';
import { DendrimerLibraryPanel } from '../dendrimers/DendrimerLibraryPanel';
import { MofsLibraryPanel } from '../mofs/MofsLibraryPanel';
import { PolymersLibraryPanel } from '../polymers/PolymersLibraryPanel';
import { GrapheneLibraryPanel, type GrapheneLibraryInsert } from '../graphene/GrapheneLibraryPanel';
import '../../styles/template-library-modal.css';
import { useChromeOverlay } from '../chromeDismiss';

export type TemplateLibraryTab =
  | 'r-groups'
  | 'ligands'
  | 'structures'
  | 'cofs'
  | 'mofs'
  | 'graphene'
  | 'dendrimers'
  | 'polymers'
  | 'reactions';

export interface TemplateLibraryModalProps {
  open: boolean;
  onClose: () => void;
  initialTab?: TemplateLibraryTab;
  onInsertAmino: (code: string) => void;
  onInsertFunctionalGroup: (smiles: string, label: string) => void;
  onInsertLigand: (id: string) => void;
  onInsertStructure3D: (id: string) => void;
  onInsertCof: (id: string) => void;
  onInsertMof: (id: string) => void;
  onInsertGraphene?: (opts: GrapheneLibraryInsert) => void;
  onInsertDendrimer: (id: string) => void;
  onInsertPolymer: (id: string) => void;
  onInsertReaction?: (reactionId: string) => void | Promise<void>;
  insertingReactionId?: string | null;
  /** Resolve SMILES to molblock for structure thumbnails (engine worker). */
  requestSmilesMolblock: (smiles: string) => Promise<string | null>;
}

export function TemplateLibraryModal({
  open,
  onClose,
  initialTab = 'structures',
  onInsertAmino,
  onInsertFunctionalGroup,
  onInsertLigand,
  onInsertStructure3D,
  onInsertCof,
  onInsertMof,
  onInsertGraphene,
  onInsertDendrimer,
  onInsertPolymer,
  onInsertReaction,
  insertingReactionId = null,
  requestSmilesMolblock,
}: TemplateLibraryModalProps) {
  useChromeOverlay(open, onClose, 'modal');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<TemplateCategoryId>(DEFAULT_TEMPLATE_CATEGORY_ID);
  const [libraryTab, setLibraryTab] = useState<TemplateLibraryTab>(initialTab);

  const searchQuery = search.trim().toLowerCase();

  const filteredCategories = useMemo(() => {
    if (!searchQuery) return TEMPLATE_CATEGORIES;
    return TEMPLATE_CATEGORIES.filter(
      c =>
        c.label.toLowerCase().includes(searchQuery) ||
        categoryHasTemplateMatch(c.id, search),
    );
  }, [search, searchQuery]);

  const globalSearchHits = useMemo(
    () => (searchQuery ? searchImplementedTemplates(search) : []),
    [search, searchQuery],
  );

  useEffect(() => {
    if (!open) return;
    const visible = filteredCategories.some(c => c.id === categoryId);
    if (!visible && filteredCategories.length > 0) {
      setCategoryId(filteredCategories[0].id as TemplateCategoryId);
    }
  }, [open, filteredCategories, categoryId]);

  useEffect(() => {
    if (!open) {
      setSearch('');
      setCategoryId(DEFAULT_TEMPLATE_CATEGORY_ID);
      setLibraryTab(initialTab);
    }
  }, [open, initialTab]);

  useEffect(() => {
    if (open) setLibraryTab(initialTab);
  }, [open, initialTab]);

  const activeCategory = useMemo(
    () => TEMPLATE_CATEGORIES.find(c => c.id === categoryId) ?? TEMPLATE_CATEGORIES[0],
    [categoryId],
  );

  const showAminoGrid =
    !searchQuery && activeCategory.implemented === true && activeCategory.id === 'l-amino-acids';
  const showRGroupGrid =
    !searchQuery && activeCategory.implemented === true && activeCategory.id === 'r-groups';
  const showLigandGrid =
    !searchQuery && activeCategory.implemented === true && activeCategory.id === 'ligands';
  const showStructure3DGrid =
    !searchQuery && activeCategory.implemented === true && activeCategory.id === '3d-templates';

  const filteredAminos = useMemo(() => {
    if (!showAminoGrid && !searchQuery) return [];
    if (!searchQuery) return [...AMINO_ACID_TEMPLATES];
    return AMINO_ACID_TEMPLATES.filter(
      t => t.code.toLowerCase().includes(searchQuery) || t.name.toLowerCase().includes(searchQuery),
    );
  }, [searchQuery, showAminoGrid]);

  const filteredRGroups = useMemo(() => {
    if (!searchQuery) return [...FUNCTIONAL_GROUP_TEMPLATES];
    return FUNCTIONAL_GROUP_TEMPLATES.filter(
      t => t.label.toLowerCase().includes(searchQuery) || t.id.toLowerCase().includes(searchQuery),
    );
  }, [searchQuery]);

  const filteredLigands = useMemo(() => {
    if (!searchQuery) return [...LIGAND_TEMPLATES];
    return LIGAND_TEMPLATES.filter(
      t =>
        t.label.toLowerCase().includes(searchQuery) ||
        t.name.toLowerCase().includes(searchQuery) ||
        t.id.toLowerCase().includes(searchQuery),
    );
  }, [searchQuery]);

  const filteredStructures = useMemo(() => {
    if (!showStructure3DGrid) return [];
    return [...STRUCTURE_3D_TEMPLATES];
  }, [showStructure3DGrid]);

  const showGlobalSearchResults = searchQuery.length > 0 && globalSearchHits.length > 0;
  const showCategoryAminoGrid = showAminoGrid && filteredAminos.length > 0;
  const showCategoryAminoEmpty = showAminoGrid && filteredAminos.length === 0;
  const showCategoryRGroupGrid = showRGroupGrid && filteredRGroups.length > 0;
  const showCategoryLigandGrid = showLigandGrid && filteredLigands.length > 0;
  const showCategoryStructureGrid = showStructure3DGrid && filteredStructures.length > 0;
  const categoryMatchCount = showGlobalSearchResults
    ? globalSearchHits.length
    : showCategoryAminoGrid
      ? filteredAminos.length
      : showCategoryRGroupGrid
        ? filteredRGroups.length
        : showCategoryLigandGrid
          ? filteredLigands.length
          : showCategoryStructureGrid
            ? filteredStructures.length
            : 0;

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Template library"
      className="template-library-overlay"
    >
      <div className="template-library-dialog">
        <header className="template-library-header">
          <div>
            <div className="template-library-header__title-row">
              <div className="template-library-header__title">Library</div>
              <span className="app-top-bar__beta" title="Beta release">
                Beta
              </span>
            </div>
            <div className="template-library-header__subtitle">
              R-groups, ligands, structure templates, COFs, MOFs, graphene, polymers, dendrimers, and named reactions — place on canvas.
            </div>
            <div className="template-library-tabs" role="tablist" aria-label="Library sections">
              <button
                type="button"
                role="tab"
                aria-selected={libraryTab === 'r-groups'}
                className={`template-library-tab${libraryTab === 'r-groups' ? ' template-library-tab--active' : ''}`}
                onClick={() => setLibraryTab('r-groups')}
              >
                R-groups
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={libraryTab === 'ligands'}
                className={`template-library-tab${libraryTab === 'ligands' ? ' template-library-tab--active' : ''}`}
                onClick={() => setLibraryTab('ligands')}
              >
                Ligands
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={libraryTab === 'structures'}
                className={`template-library-tab${libraryTab === 'structures' ? ' template-library-tab--active' : ''}`}
                onClick={() => setLibraryTab('structures')}
              >
                Structures
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={libraryTab === 'cofs'}
                className={`template-library-tab${libraryTab === 'cofs' ? ' template-library-tab--active' : ''}`}
                onClick={() => setLibraryTab('cofs')}
              >
                COFs
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={libraryTab === 'mofs'}
                className={`template-library-tab${libraryTab === 'mofs' ? ' template-library-tab--active' : ''}`}
                onClick={() => setLibraryTab('mofs')}
              >
                MOFs
              </button>
              {onInsertGraphene ? (
                <button
                  type="button"
                  role="tab"
                  aria-selected={libraryTab === 'graphene'}
                  className={`template-library-tab${libraryTab === 'graphene' ? ' template-library-tab--active' : ''}`}
                  onClick={() => setLibraryTab('graphene')}
                >
                  Graphene
                </button>
              ) : null}
              <button
                type="button"
                role="tab"
                aria-selected={libraryTab === 'polymers'}
                className={`template-library-tab${libraryTab === 'polymers' ? ' template-library-tab--active' : ''}`}
                onClick={() => setLibraryTab('polymers')}
              >
                Polymers
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={libraryTab === 'dendrimers'}
                className={`template-library-tab${libraryTab === 'dendrimers' ? ' template-library-tab--active' : ''}`}
                onClick={() => setLibraryTab('dendrimers')}
              >
                Dendrimers
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={libraryTab === 'reactions'}
                className={`template-library-tab${libraryTab === 'reactions' ? ' template-library-tab--active' : ''}`}
                onClick={() => setLibraryTab('reactions')}
              >
                Reactions
              </button>
            </div>
          </div>
          <button type="button" aria-label="Close" className="template-library-close" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        {libraryTab === 'r-groups' ? (
          <LibraryFlatCollection
            title="R-groups"
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search R-groups…"
            searchAria="Search R-groups"
            empty={filteredRGroups.length === 0}
          >
            <div className="template-library-grid">
              {filteredRGroups.map(t => (
                <SmilesTemplateCard
                  key={t.id}
                  code={t.label}
                  name="R-group"
                  hint="Click an atom to attach"
                  smiles={t.smiles}
                  requestMolblock={requestSmilesMolblock}
                  onInsert={() => onInsertFunctionalGroup(t.smiles, t.label)}
                />
              ))}
            </div>
          </LibraryFlatCollection>
        ) : libraryTab === 'ligands' ? (
          <LibraryFlatCollection
            title="Ligands"
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search ligands…"
            searchAria="Search ligands"
            empty={filteredLigands.length === 0}
          >
            <div className="template-library-grid">
              {filteredLigands.map(t => (
                <SmilesTemplateCard
                  key={t.id}
                  code={t.label}
                  name={t.name}
                  smiles={t.smiles}
                  requestMolblock={requestSmilesMolblock}
                  onInsert={() => onInsertLigand(t.id)}
                />
              ))}
            </div>
          </LibraryFlatCollection>
        ) : libraryTab === 'reactions' && onInsertReaction ? (
          <ReactionLibraryPanel
            active
            onInsert={onInsertReaction}
            insertingId={insertingReactionId}
          />
        ) : libraryTab === 'cofs' ? (
          <CofsLibraryPanel
            onInsert={onInsertCof}
            requestSmilesMolblock={requestSmilesMolblock}
          />
        ) : libraryTab === 'mofs' ? (
          <MofsLibraryPanel
            onInsert={onInsertMof}
            requestSmilesMolblock={requestSmilesMolblock}
          />
        ) : libraryTab === 'graphene' && onInsertGraphene ? (
          <GrapheneLibraryPanel
            onInsert={onInsertGraphene}
            requestSmilesMolblock={requestSmilesMolblock}
          />
        ) : libraryTab === 'polymers' ? (
          <PolymersLibraryPanel
            onInsert={onInsertPolymer}
            requestSmilesMolblock={requestSmilesMolblock}
          />
        ) : libraryTab === 'dendrimers' ? (
          <DendrimerLibraryPanel
            onInsert={onInsertDendrimer}
            requestSmilesMolblock={requestSmilesMolblock}
          />
        ) : (
        <div className="template-library-body">
          <aside className="template-library-sidebar">
            <div className="template-library-search-wrap">
              <input
                type="search"
                className="template-library-search"
                placeholder="Search categories or templates…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                aria-label="Search templates"
              />
            </div>
            <nav className="template-library-nav" aria-label="Template categories">
              {filteredCategories.length === 0 ? (
                <p className="template-library-nav__empty">No categories match your search.</p>
              ) : (
                filteredCategories.map(cat => {
                  const active = cat.id === categoryId;
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
                      {cat.count != null ? (
                        <span className="template-library-category__count">({cat.count})</span>
                      ) : null}
                    </button>
                  );
                })
              )}
            </nav>
          </aside>

          <section className="template-library-main" aria-label={activeCategory.label}>
            <div className="template-library-main__head">
              {showGlobalSearchResults ? 'Search results' : activeCategory.label}
              {categoryMatchCount > 0 ? (
                <span className="template-library-main__meta">
                  {categoryMatchCount} {categoryMatchCount === 1 ? 'match' : 'matches'}
                </span>
              ) : null}
            </div>
            <div className="template-library-main__scroll">
              {showGlobalSearchResults ? (
                <div className="template-library-grid">
                  {globalSearchHits.map(hit => {
                    if (hit.kind === 'amino') {
                      return (
                        <AminoAcidTemplateCard
                          key={`aa-${hit.amino.code}`}
                          template={hit.amino}
                          requestMolblock={requestSmilesMolblock}
                          onInsert={() => onInsertAmino(hit.amino.code)}
                        />
                      );
                    }
                    if (hit.kind === 'functional_group') {
                      return (
                        <SmilesTemplateCard
                          key={`fg-${hit.group.id}`}
                          code={hit.group.label}
                          name="R-group"
                          hint="Click an atom to attach"
                          smiles={hit.group.smiles}
                          requestMolblock={requestSmilesMolblock}
                          onInsert={() => onInsertFunctionalGroup(hit.group.smiles, hit.group.label)}
                        />
                      );
                    }
                    if (hit.kind === 'ligand') {
                      return (
                        <SmilesTemplateCard
                          key={`lig-${hit.ligand.id}`}
                          code={hit.ligand.label}
                          name={hit.ligand.name}
                          smiles={hit.ligand.smiles}
                          requestMolblock={requestSmilesMolblock}
                          onInsert={() => onInsertLigand(hit.ligand.id)}
                        />
                      );
                    }
                    return (
                      <SmilesTemplateCard
                        key={`s3d-${hit.structure.id}`}
                        code={hit.structure.label}
                        name={hit.structure.name}
                        hint={hit.structure.hint}
                        smiles={hit.structure.smiles}
                        molblock={hit.structure.molblock}
                        requestMolblock={requestSmilesMolblock}
                        onInsert={() => onInsertStructure3D(hit.structure.id)}
                      />
                    );
                  })}
                </div>
              ) : showCategoryAminoEmpty ? (
                <p className="template-library-nav__empty">No amino acids match your search.</p>
              ) : showCategoryAminoGrid ? (
                <div className="template-library-grid">
                  {filteredAminos.map(t => (
                    <AminoAcidTemplateCard
                      key={t.code}
                      template={t}
                      requestMolblock={requestSmilesMolblock}
                      onInsert={() => onInsertAmino(t.code)}
                    />
                  ))}
                </div>
              ) : showCategoryRGroupGrid ? (
                <div className="template-library-grid">
                  {filteredRGroups.map(t => (
                    <SmilesTemplateCard
                      key={t.id}
                      code={t.label}
                      name="R-group"
                  hint="Click an atom to attach"
                      smiles={t.smiles}
                      requestMolblock={requestSmilesMolblock}
                      onInsert={() => onInsertFunctionalGroup(t.smiles, t.label)}
                    />
                  ))}
                </div>
              ) : showCategoryLigandGrid ? (
                <div className="template-library-grid">
                  {filteredLigands.map(t => (
                    <SmilesTemplateCard
                      key={t.id}
                      code={t.label}
                      name={t.name}
                      smiles={t.smiles}
                      requestMolblock={requestSmilesMolblock}
                      onInsert={() => onInsertLigand(t.id)}
                    />
                  ))}
                </div>
              ) : showCategoryStructureGrid ? (
                <div className="template-library-grid">
                  {filteredStructures.map(t => (
                    <SmilesTemplateCard
                      key={t.id}
                      code={t.label}
                      name={t.name}
                      hint={t.hint}
                      smiles={t.smiles}
                      molblock={t.molblock}
                      requestMolblock={requestSmilesMolblock}
                      onInsert={() => onInsertStructure3D(t.id)}
                    />
                  ))}
                </div>
              ) : searchQuery && globalSearchHits.length === 0 ? (
                <div className="template-library-placeholder">
                  <p className="template-library-placeholder__title">No templates found</p>
                  <p>
                    No implemented templates match &ldquo;{search.trim()}&rdquo;. Try R-groups,
                    amino acids, ligands, or 3D cages (cubane, C₆₀). COFs, MOFs, polymers, and dendrimers have their own tabs.
                  </p>
                </div>
              ) : (
                <div className="template-library-placeholder">
                  <p className="template-library-placeholder__title">Coming soon</p>
                  <p>
                    {activeCategory.label} templates are not available yet. Browse{' '}
                    <strong>R-groups</strong>, <strong>Ligands</strong>, <strong>L-Amino Acids</strong>, or{' '}
                    <strong>3D Templates</strong>. COFs, MOFs, polymers, and dendrimers are top-level tabs.
                  </p>
                  <p className="template-library-placeholder__hint">
                    Metals are on the atom palette.
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>
        )}
      </div>
    </div>
  );
}

function LibraryFlatCollection({
  title,
  search,
  onSearchChange,
  searchPlaceholder,
  searchAria,
  empty,
  children,
}: {
  title: string;
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  searchAria: string;
  empty: boolean;
  children: ReactNode;
}) {
  return (
    <div className="template-library-body template-library-body--single">
      <div className="template-library-search-wrap">
        <input
          type="search"
          className="template-library-search"
          placeholder={searchPlaceholder}
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          aria-label={searchAria}
        />
      </div>
      <section className="template-library-main" aria-label={title}>
        <div className="template-library-main__head">{title}</div>
        <div className="template-library-main__scroll">
          {empty ? <p className="template-library-nav__empty">No matches.</p> : children}
        </div>
      </section>
    </div>
  );
}
