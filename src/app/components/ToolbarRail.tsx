/**
 * Left-side drawing toolbar. Compact viewports use a category dock
 * (Select | Draw | Rings | Annotate | More) with one active tool strip.
 */
import { useEffect, useState } from 'react';
import {
  ChevronDown,
  Settings,
  X,
  MousePointer2,
  Pencil,
  Hexagon,
  MessageSquareText,
  Layers,
  MoreHorizontal,
} from 'lucide-react';
import type { CanvasShapeKind, ReactionArrowKind } from '@moldraw/domain';
import {
  CANVAS_SHAPE_KIND_ORDER,
  isLabGlasswareShape,
  listGlasswareLibraryByCategory,
} from '@moldraw/domain';
import {
  C6_RING_TOOL_IDS,
  CHARGE_MENU_TOOL_IDS,
  LONE_PAIR_TOOL_IDS,
  ORBITAL_TOOL_IDS,
  MOBILE_CATEGORY_TOOL_IDS,
  MOBILE_TOOL_CATEGORIES,
  STEREO_BOND_TOOL_IDS,
  TOOL_DEFS,
  TOOL_GROUPS_LEFT_STRUCTURE,
  TOOL_IDS_BOTTOM_RINGS,
  TOOL_IDS_DRAW_PANEL,
  TOOL_IDS_LEFT_ANNOTATE,
  TOOL_IDS_LEFT_MARKS,
  TOOL_IDS_LEFT_SELECT,
  TOOL_IDS_LEFT_TEMPLATES,
  TOOL_IDS_TOP_BAR,
  type MobileToolCategory,
  type ShapeMenuValue,
  type SruBracketSubscript,
  type ToolDef,
  type ToolGroup,
} from '../toolDefs';
import { tooltipShortcutSuffix } from '../keyboard/shortcutCatalog';
import { usePluginHostOptional } from '../plugins';
import { renderToolIcon } from '../toolIcons';
import { ToolbarSplitTool } from './ToolbarSplitTool';
import { ToolbarFunctionalGroupsTool } from './ToolbarFunctionalGroupsTool';
import { ToolbarLigandsTool } from './ToolbarLigandsTool';
import { ArrowKindPreview, ShapeKindPreview } from './toolOptionPreviews';
import { GlasswareLibraryModal } from './GlasswareLibraryModal';
import { useToolbarI18n, type ToolbarI18n } from './toolbarI18n';

export type { ShapeMenuValue };

export interface ToolbarRailProps {
  activeTool: string;
  onSelect: (toolId: string) => void;
  isCompact: boolean;
  groupedTools: Record<ToolGroup, ToolDef[]>;
  reactionArrowKind?: ReactionArrowKind;
  onReactionArrowKindChange?: (kind: ReactionArrowKind) => void;
  canvasShapeKind?: CanvasShapeKind;
  onCanvasShapeKindChange?: (kind: CanvasShapeKind) => void;
  /** Current highlight in the shapes dropdown. */
  shapeMenuValue?: ShapeMenuValue;
  onShapeMenuValueChange?: (value: ShapeMenuValue) => void;
  sruBracketSubscript?: string;
  onSruBracketSubscriptChange?: (value: string) => void;
  onBeginFunctionalGroupPlacement?: (
    smiles: string,
    label: string,
    molblock?: string | null,
  ) => void;
  onBeginLigandPlacement?: (id: string, molblock?: string | null) => void;
  requestFunctionalGroupMolblock?: (smiles: string) => Promise<string | null>;
  /** App settings — pinned to the bottom-left of the left rail. */
  onOpenSettings?: () => void;
  /** Compact FG / ligands open as bottom sheets. */
  preferSheetMenus?: boolean;
  /** Objects list panel open (mobile dock highlight). */
  showObjectsPanel?: boolean;
  onToggleObjectsPanel?: () => void;
  /** Desktop Draw tab: pencil / shape / image flyout beside the left rail. */
  showDrawTools?: boolean;
}

const categoryForTool = (toolId: string): MobileToolCategory | null => {
  for (const cat of MOBILE_TOOL_CATEGORIES) {
    if (MOBILE_CATEGORY_TOOL_IDS[cat.id].includes(toolId)) return cat.id;
  }
  // Split-menu siblings map to their primary category
  if ((CHARGE_MENU_TOOL_IDS as readonly string[]).includes(toolId)) return 'draw';
  if ((LONE_PAIR_TOOL_IDS as readonly string[]).includes(toolId)) return 'draw';
  if (toolId === 'erase') return 'draw';
  if ((STEREO_BOND_TOOL_IDS as readonly string[]).includes(toolId)) return 'draw';
  if ((C6_RING_TOOL_IDS as readonly string[]).includes(toolId)) return 'rings';
  if ((ORBITAL_TOOL_IDS as readonly string[]).includes(toolId)) return 'annotate';
  return null;
};

const reactionArrowToolTitle = (
  tool: ToolDef,
  reactionArrowKind: ReactionArrowKind,
  i18n: ToolbarI18n,
): string => {
  const k = i18n.reactionArrowKindLabel(reactionArrowKind);
  return `${tool.label} (${k}): ${tool.title}${tooltipShortcutSuffix(tool.id)}`;
};

const shapeToolTitle = (tool: ToolDef, canvasShapeKind: CanvasShapeKind, i18n: ToolbarI18n): string => {
  const k = i18n.canvasShapeKindLabel(canvasShapeKind);
  return `${tool.label} (${k}): ${tool.title}${tooltipShortcutSuffix(tool.id)}`;
};

const shapeMenuPreview = (v: ShapeMenuValue) => (
  <ShapeKindPreview kind={v} size={20} />
);

const GLASSWARE_OPTION_GROUPS = listGlasswareLibraryByCategory().map(g => ({
  id: g.id,
  label: g.label,
  options: g.items.map(e => ({
    value: e.kind,
    label: e.label,
    keywords: [e.kind, ...e.aliases].join(' '),
  })),
}));

const MOBILE_CATEGORY_ICONS: Record<MobileToolCategory, typeof MousePointer2> = {
  select: MousePointer2,
  draw: Pencil,
  rings: Hexagon,
  annotate: MessageSquareText,
  objects: Layers,
  more: MoreHorizontal,
};

const sruSubscriptPreview = (v: string) => (
  <span style={{ fontSize: 9, fontWeight: 700, fontFamily: 'ui-monospace, monospace' }}>{v}</span>
);

const renderToolOrArrowRow = (
  tool: ToolDef,
  props: Pick<
    ToolbarRailProps,
    | 'activeTool'
    | 'onSelect'
    | 'reactionArrowKind'
    | 'onReactionArrowKindChange'
    | 'canvasShapeKind'
    | 'onCanvasShapeKindChange'
    | 'shapeMenuValue'
    | 'onShapeMenuValueChange'
    | 'sruBracketSubscript'
    | 'onSruBracketSubscriptChange'
    | 'onBeginFunctionalGroupPlacement'
    | 'onBeginLigandPlacement'
    | 'requestFunctionalGroupMolblock'
    | 'preferSheetMenus'
  > & { onOpenGlasswareLibrary?: () => void; flattenShapes?: boolean; i18n: ToolbarI18n },
) => {
  tool = props.i18n.localizeTool(tool);
  if (tool.id === 'functional_groups') {
    if (!props.onBeginFunctionalGroupPlacement || !props.requestFunctionalGroupMolblock) return null;
    return (
      <ToolbarFunctionalGroupsTool
        key={tool.id}
        onBeginPlacement={props.onBeginFunctionalGroupPlacement}
        requestSmilesMolblock={props.requestFunctionalGroupMolblock}
        preferSheet={props.preferSheetMenus}
      />
    );
  }
  if (tool.id === 'ligands') {
    if (!props.onBeginLigandPlacement || !props.requestFunctionalGroupMolblock) return null;
    return (
      <ToolbarLigandsTool
        key={tool.id}
        onBeginPlacement={props.onBeginLigandPlacement}
        requestSmilesMolblock={props.requestFunctionalGroupMolblock}
        preferSheet={props.preferSheetMenus}
      />
    );
  }
  if ((CHARGE_MENU_TOOL_IDS as readonly string[]).includes(tool.id)) {
    if (tool.id !== 'charge_plus') return null;
    const chargeActive = (CHARGE_MENU_TOOL_IDS as readonly string[]).includes(props.activeTool);
    const chargeToolId = chargeActive ? props.activeTool : 'charge_plus';
    const chargeTool = props.i18n.localizeTool(TOOL_DEFS.find(t => t.id === chargeToolId) ?? tool);
    return (
      <ToolbarSplitTool
        key="charge"
        toolId={chargeToolId}
        toolLabel={chargeTool.label}
        toolTitle={`${chargeTool.title}${tooltipShortcutSuffix(chargeToolId)}`}
        isActive={chargeActive}
        value={chargeToolId}
        groups={props.i18n.chargeMenuGroups}
        onSelectTool={() => props.onSelect(chargeToolId)}
        onChangeValue={v => props.onSelect(v)}
        menuAriaLabel={props.i18n.t('toolbar.menuChargeTools')}
        renderPreview={id => renderToolIcon(id)}
      />
    );
  }
  if (
    tool.id === 'hexagon' ||
    tool.id === 'cyclohexane' ||
    tool.id === 'boat_cyclohexane'
  ) {
    if (tool.id !== 'hexagon') return null;
    const c6Active = (C6_RING_TOOL_IDS as readonly string[]).includes(props.activeTool);
    const c6ToolId = c6Active ? props.activeTool : 'hexagon';
    const c6Tool = props.i18n.localizeTool(TOOL_DEFS.find(t => t.id === c6ToolId) ?? tool);
    return (
      <ToolbarSplitTool
        key="c6-ring"
        toolId={c6ToolId}
        toolLabel={c6Tool.shortLabel ?? c6Tool.label}
        toolTitle={`${c6Tool.title}${tooltipShortcutSuffix(c6ToolId)}`}
        isActive={c6Active}
        value={c6ToolId}
        options={props.i18n.c6Options}
        onSelectTool={() => props.onSelect(c6ToolId)}
        onChangeValue={v => props.onSelect(v)}
        menuAriaLabel={props.i18n.t('toolbar.menuC6Conformation')}
        renderPreview={id => renderToolIcon(id)}
      />
    );
  }
  if (tool.id === 'lone_pair' || tool.id === 'free_radical') {
    // One dropdown: lone pair / free radical (sibling hidden).
    if (tool.id !== 'lone_pair') return null;
    const lpActive = (LONE_PAIR_TOOL_IDS as readonly string[]).includes(props.activeTool);
    const lpToolId = lpActive ? props.activeTool : 'lone_pair';
    const lpTool = props.i18n.localizeTool(TOOL_DEFS.find(t => t.id === lpToolId) ?? tool);
    return (
      <ToolbarSplitTool
        key="lone-pair"
        toolId={lpToolId}
        toolLabel={lpTool.label}
        toolTitle={`${lpTool.title}${tooltipShortcutSuffix(lpToolId)}`}
        isActive={lpActive}
        value={lpToolId}
        options={props.i18n.lonePairOptions}
        onSelectTool={() => props.onSelect(lpToolId)}
        onChangeValue={v => props.onSelect(v)}
        menuAriaLabel={props.i18n.t('toolbar.menuLoneRadical')}
        renderPreview={id => renderToolIcon(id)}
      />
    );
  }
  if ((ORBITAL_TOOL_IDS as readonly string[]).includes(tool.id)) {
    if (tool.id !== 'orbital_p') return null;
    const orbActive = (ORBITAL_TOOL_IDS as readonly string[]).includes(props.activeTool);
    const orbToolId = orbActive ? props.activeTool : 'orbital_p';
    const orbTool = props.i18n.localizeTool(TOOL_DEFS.find(t => t.id === orbToolId) ?? tool);
    return (
      <ToolbarSplitTool
        key="orbitals"
        toolId={orbToolId}
        toolLabel={orbTool.shortLabel ?? orbTool.label}
        toolTitle={`${orbTool.title}${tooltipShortcutSuffix(orbToolId)}`}
        isActive={orbActive}
        value={orbToolId}
        options={props.i18n.orbitalOptions}
        onSelectTool={() => props.onSelect(orbToolId)}
        onChangeValue={v => props.onSelect(v)}
        menuAriaLabel={props.i18n.t('toolbar.menuOrbitals')}
        renderPreview={id => renderToolIcon(id)}
      />
    );
  }
  if (
    tool.id === 'wedge_bond' ||
    tool.id === 'dash_bond' ||
    tool.id === 'wavy_bond' ||
    tool.id === 'dative_bond'
  ) {
    // One dropdown: wedge / dash / wavy / dative (siblings hidden).
    if (tool.id !== 'wedge_bond') return null;
    const stereoActive = (STEREO_BOND_TOOL_IDS as readonly string[]).includes(props.activeTool);
    const stereoToolId = stereoActive ? props.activeTool : 'wedge_bond';
    const stereoTool = props.i18n.localizeTool(TOOL_DEFS.find(t => t.id === stereoToolId) ?? tool);
    return (
      <ToolbarSplitTool
        key="stereo-bond"
        toolId={stereoToolId}
        toolLabel={stereoTool.label}
        toolTitle={`${stereoTool.title}${tooltipShortcutSuffix(stereoToolId)}`}
        isActive={stereoActive}
        value={stereoToolId}
        options={props.i18n.stereoBondOptions}
        onSelectTool={() => props.onSelect(stereoToolId)}
        onChangeValue={v => props.onSelect(v)}
        menuAriaLabel={props.i18n.t('toolbar.menuStereoBond')}
        renderPreview={id => renderToolIcon(id)}
      />
    );
  }
  if (tool.id === 'sru_bracket') {
    const sub = props.sruBracketSubscript ?? 'n';
    return (
      <ToolbarSplitTool
        key={tool.id}
        toolId={tool.id}
        toolLabel={tool.shortLabel ?? tool.label}
        toolTitle={`${tool.title}${tooltipShortcutSuffix(tool.id)}`}
        isActive={props.activeTool === tool.id}
        value={sub as SruBracketSubscript}
        options={props.i18n.sruSubscriptOptions}
        onSelectTool={() => props.onSelect(tool.id)}
        onChangeValue={v => props.onSruBracketSubscriptChange?.(v)}
        menuAriaLabel={props.i18n.t('tools.sru_bracket.title')}
        renderPreview={sruSubscriptPreview}
      />
    );
  }
  if (tool.id === 'reaction_arrow') {
    const kind = props.reactionArrowKind ?? 'straight';
    return (
      <ToolbarSplitTool
        key={tool.id}
        toolId={tool.id}
        toolLabel={tool.label}
        toolTitle={reactionArrowToolTitle(tool, kind, props.i18n)}
        isActive={props.activeTool === tool.id}
        value={kind}
        options={props.i18n.reactionArrowOptions}
        onSelectTool={() => props.onSelect(tool.id)}
        onChangeValue={v => props.onReactionArrowKindChange?.(v)}
        menuAriaLabel={props.i18n.t('toolbar.menuReactionArrow')}
        renderPreview={k => <ArrowKindPreview kind={k} size={20} />}
      />
    );
  }
  if (tool.id === 'shape') {
    const kind = isLabGlasswareShape(props.canvasShapeKind ?? 'rectangle')
      ? 'rectangle'
      : (props.canvasShapeKind ?? 'rectangle');
    const menuValue: ShapeMenuValue = props.shapeMenuValue ?? kind;
    if (props.flattenShapes) {
      return (
        <span key={tool.id} className="toolbar-shape-strip" role="group" aria-label={props.i18n.t('toolbar.menuShapes')}>
          {CANVAS_SHAPE_KIND_ORDER.map(shapeKind => {
            const on = props.activeTool === tool.id && menuValue === shapeKind;
            const shapeLabel = props.i18n.canvasShapeKindLabel(shapeKind);
            return (
              <button
                key={shapeKind}
                type="button"
                className={`tool-btn${on ? ' active' : ''}`}
                title={`${shapeLabel}: ${tool.title}${tooltipShortcutSuffix(tool.id)}`}
                aria-label={shapeLabel}
                aria-pressed={on}
                onClick={() => {
                  props.onCanvasShapeKindChange?.(shapeKind);
                  props.onShapeMenuValueChange?.(shapeKind);
                  props.onSelect(tool.id);
                }}
              >
                <ShapeKindPreview kind={shapeKind} size={16} className="toolbar-shape-strip__preview" />
              </button>
            );
          })}
        </span>
      );
    }
    return (
      <ToolbarSplitTool
        key={tool.id}
        toolId={tool.id}
        toolLabel={tool.label}
        toolTitle={shapeToolTitle(tool, menuValue, props.i18n)}
        isActive={props.activeTool === tool.id}
        value={menuValue}
        groups={props.i18n.shapeMenuGroups}
        onSelectTool={() => {
          if (isLabGlasswareShape(props.canvasShapeKind ?? 'rectangle')) {
            props.onCanvasShapeKindChange?.('rectangle');
            props.onShapeMenuValueChange?.('rectangle');
          }
          props.onSelect(tool.id);
        }}
        onChangeValue={v => {
          props.onShapeMenuValueChange?.(v);
          props.onSelect(tool.id);
        }}
        menuAriaLabel={props.i18n.t('toolbar.menuShapes')}
        menuSize="wide"
        renderPreview={shapeMenuPreview}
      />
    );
  }
  if (tool.id === 'glassware') {
    const kind = isLabGlasswareShape(props.canvasShapeKind ?? 'conical_flask')
      ? (props.canvasShapeKind as CanvasShapeKind)
      : 'conical_flask';
    return (
      <ToolbarSplitTool
        key={tool.id}
        toolId={tool.id}
        toolLabel={tool.label}
        toolTitle={shapeToolTitle(tool, kind, props.i18n)}
        isActive={props.activeTool === tool.id}
        value={kind}
        groups={GLASSWARE_OPTION_GROUPS}
        onSelectTool={() => {
          if (!isLabGlasswareShape(props.canvasShapeKind ?? 'rectangle')) {
            props.onCanvasShapeKindChange?.('conical_flask');
          }
          props.onSelect(tool.id);
        }}
        onChangeValue={v => {
          props.onCanvasShapeKindChange?.(v);
          props.onSelect(tool.id);
        }}
        menuAriaLabel={props.i18n.t('toolbar.menuGlassware')}
        menuSize="wide"
        searchable
        searchPlaceholder={props.i18n.t('toolbar.searchApparatus')}
        libraryButtonLabel={props.i18n.t('toolbar.openLibrary')}
        onOpenLibrary={props.onOpenGlasswareLibrary}
        renderPreview={k => <ShapeKindPreview kind={k} size={20} />}
      />
    );
  }
  const groupClass =
    tool.group === 'bond_types' || tool.group === 'stereo'
      ? ' tool-btn--' + tool.group
      : '';
  const activeClass = props.activeTool === tool.id ? ' active' : '';
  return (
    <button
      key={tool.id}
      type="button"
      className={'tool-btn' + groupClass + activeClass}
      onClick={() => props.onSelect(tool.id)}
      title={tool.id === 'pencil' ? undefined : tool.label + ': ' + tool.title + tooltipShortcutSuffix(tool.id)}
      aria-label={tool.label}
      aria-pressed={props.activeTool === tool.id}
    >
      {renderToolIcon(tool.id)}
    </button>
  );
};

export function ToolbarRail({
  activeTool,
  onSelect,
  isCompact,
  groupedTools,
  reactionArrowKind = 'straight',
  onReactionArrowKindChange,
  canvasShapeKind = 'rectangle',
  onCanvasShapeKindChange,
  shapeMenuValue,
  onShapeMenuValueChange,
  sruBracketSubscript = 'n',
  onSruBracketSubscriptChange,
  onBeginFunctionalGroupPlacement,
  onBeginLigandPlacement,
  requestFunctionalGroupMolblock,
  onOpenSettings,
  preferSheetMenus = false,
  showObjectsPanel = false,
  onToggleObjectsPanel,
  showDrawTools = false,
}: ToolbarRailProps) {
  const i18n = useToolbarI18n();
  const [mobileCategory, setMobileCategory] = useState<MobileToolCategory>('select');
  /** Compact tool strip is closed by default — tap a category to open. */
  const [stripOpen, setStripOpen] = useState(false);
  const [glasswareLibraryOpen, setGlasswareLibraryOpen] = useState(false);

  // Keep the dock category in sync when the active tool changes (e.g. shortcuts).
  useEffect(() => {
    if (!isCompact) return;
    const cat = categoryForTool(activeTool);
    if (cat) setMobileCategory(cat);
  }, [activeTool, isCompact]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('app-mobile-strip-open', isCompact && stripOpen);
    return () => {
      root.classList.remove('app-mobile-strip-open');
    };
  }, [isCompact, stripOpen]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('app-draw-tools-open', !isCompact && showDrawTools);
    return () => {
      root.classList.remove('app-draw-tools-open');
    };
  }, [isCompact, showDrawTools]);

  const pluginHost = usePluginHostOptional();
  void pluginHost?.revision;
  const smartDrawVisible = (() => {
    const s = pluginHost?.host.getPluginState('smart-draw').state;
    return s === 'installed' || s === 'loaded' || s === 'failed';
  })();
  const annotateToolIds = TOOL_IDS_LEFT_ANNOTATE.filter(id => id !== 'smart_draw' || smartDrawVisible);
  const pluginCanvasTools: ToolDef[] = (pluginHost?.contributions.canvasTools ?? [])
    .filter(t => !TOOL_DEFS.some(d => d.id === t.id))
    .map(t => ({
      id: t.id,
      label: t.label,
      title: t.title,
      category: 'edit',
      group: 'select_edit',
    }));
  const leftPointerTools = TOOL_IDS_LEFT_SELECT.map(id => TOOL_DEFS.find(t => t.id === id)).filter(
    (t): t is ToolDef => Boolean(t),
  );
  const leftMarkTools = [
    ...TOOL_IDS_LEFT_MARKS.map(id => TOOL_DEFS.find(t => t.id === id)).filter(
      (t): t is ToolDef => Boolean(t),
    ),
    ...pluginCanvasTools,
  ];
  const selectTool = (toolId: string) => {
    onSelect(toolId);
  };

  useEffect(() => {
    if (activeTool === 'smart_draw' && !smartDrawVisible) onSelect('select');
  }, [activeTool, smartDrawVisible, onSelect]);
  const ringTools = TOOL_IDS_BOTTOM_RINGS.map(id => TOOL_DEFS.find(t => t.id === id)).filter(
    (t): t is ToolDef => Boolean(t),
  );

  const rowProps = {
    activeTool,
    onSelect: selectTool,
    reactionArrowKind,
    onReactionArrowKindChange,
    canvasShapeKind,
    onCanvasShapeKindChange,
    shapeMenuValue,
    onShapeMenuValueChange,
    sruBracketSubscript,
    onSruBracketSubscriptChange,
    onBeginFunctionalGroupPlacement,
    onBeginLigandPlacement,
    requestFunctionalGroupMolblock,
    preferSheetMenus: false,
    onOpenGlasswareLibrary: () => setGlasswareLibraryOpen(true),
    i18n,
  };

  const renderGroup = (group: ToolGroup) => (
    <div
      key={group}
      className={`toolbar-group${group === 'bond_types' ? ' toolbar-group--bonds' : ''}${
        group === 'stereo' ? ' toolbar-group--stereo' : ''
      }`}
    >
      {(groupedTools[group] ?? []).map(tool => renderToolOrArrowRow(tool, rowProps))}
    </div>
  );

  const settingsControl = onOpenSettings ? (
    <div className="toolbar-group toolbar-group--settings" role="group" aria-label={i18n.t('toolbar.settingsAria')}>
      <button
        type="button"
        className="tool-btn"
        onClick={onOpenSettings}
        title={i18n.t('toolbar.settingsAria')}
        aria-label={i18n.t('toolbar.settingsAria')}
      >
        <Settings size={18} strokeWidth={1.7} />
      </button>
    </div>
  ) : null;

  const glasswareKind = isLabGlasswareShape(canvasShapeKind ?? 'conical_flask')
    ? (canvasShapeKind as CanvasShapeKind)
    : 'conical_flask';

  if (isCompact) {
    const stripIds = MOBILE_CATEGORY_TOOL_IDS[mobileCategory].filter(
      id => id !== 'smart_draw' || smartDrawVisible,
    );
    const stripTools = [
      ...stripIds
        .map(id => TOOL_DEFS.find(t => t.id === id))
        .filter((t): t is ToolDef => Boolean(t)),
      ...(mobileCategory === 'select' ? pluginCanvasTools : []),
    ];

    const selectCategory = (cat: MobileToolCategory) => {
      if (cat === 'objects') {
        setStripOpen(false);
        onToggleObjectsPanel?.();
        setMobileCategory(cat);
        return;
      }
      // Tap active category again to close the tool strip.
      if (stripOpen && mobileCategory === cat) {
        setStripOpen(false);
        return;
      }
      setMobileCategory(cat);
      setStripOpen(true);
      const ids = MOBILE_CATEGORY_TOOL_IDS[cat];
      const first = ids[0];
      if (first && categoryForTool(activeTool) !== cat) {
        selectTool(first);
      }
    };

    return (
      <>
        {stripOpen ? (
          <div
            className="toolbar toolbar--mobile-strip"
            role="toolbar"
            aria-label={i18n.mobileCategoryLabel(mobileCategory)}
          >
            {stripTools.map(tool => renderToolOrArrowRow(tool, rowProps))}
            {mobileCategory === 'more' ? settingsControl : null}
            <button
              type="button"
              className="tool-btn toolbar--mobile-strip__close"
              title={i18n.t('toolbar.closeStrip')}
              aria-label={i18n.t('toolbar.closeStrip')}
              onClick={() => setStripOpen(false)}
            >
              <X size={14} strokeWidth={1.7} aria-hidden />
            </button>
          </div>
        ) : null}
        <nav className="toolbar-mobile-categories" aria-label={i18n.t('topBar.toolbarDrawTools')}>
          {MOBILE_TOOL_CATEGORIES.map(cat => {
            const Icon = MOBILE_CATEGORY_ICONS[cat.id];
            const isObjectsActive = cat.id === 'objects' && showObjectsPanel;
            const isStripActive = stripOpen && mobileCategory === cat.id;
            const catLabel = i18n.mobileCategoryLabel(cat.id);
            return (
              <button
                key={cat.id}
                type="button"
                className={
                  isStripActive || isObjectsActive
                    ? 'toolbar-mobile-categories__btn toolbar-mobile-categories__btn--active'
                    : 'toolbar-mobile-categories__btn'
                }
                aria-pressed={isStripActive || isObjectsActive}
                title={
                  cat.id === 'objects'
                    ? showObjectsPanel
                      ? i18n.t('toolbar.closeObjectsList')
                      : i18n.t('toolbar.objectsList')
                    : isStripActive
                      ? i18n.t('toolbar.tapToClose', { label: catLabel })
                      : catLabel
                }
                onClick={() => selectCategory(cat.id)}
              >
                <Icon size={14} strokeWidth={1.8} aria-hidden className="toolbar-mobile-categories__icon" />
                <span className="toolbar-mobile-categories__label">{catLabel}</span>
                {isStripActive ? (
                  <ChevronDown
                    size={10}
                    strokeWidth={2.5}
                    aria-hidden
                    className="toolbar-mobile-categories__caret"
                  />
                ) : null}
              </button>
            );
          })}
        </nav>
        <GlasswareLibraryModal
          open={glasswareLibraryOpen}
          onClose={() => setGlasswareLibraryOpen(false)}
          value={glasswareKind}
          onSelect={kind => {
            onCanvasShapeKindChange?.(kind);
            onSelect('glassware');
          }}
        />
      </>
    );
  }

  const ringsBar = (
    <div className="toolbar-bottom toolbar-bottom--rings" role="toolbar" aria-label={i18n.t('toolbar.ringTools')}>
      {ringTools.map(tool => renderToolOrArrowRow(tool, rowProps))}
    </div>
  );

  const drawPanelTools = TOOL_IDS_DRAW_PANEL.map(id => TOOL_DEFS.find(t => t.id === id)).filter(
    (t): t is ToolDef => Boolean(t),
  );

  return (
    <>
      <div className="toolbar" aria-label={i18n.t('toolbar.selectTools')}>
        <div className="toolbar-group toolbar-group--select">
          {leftPointerTools.map(tool => renderToolOrArrowRow(tool, rowProps))}
        </div>
        <div className="toolbar-group toolbar-group--marks">
          {leftMarkTools.map(tool => renderToolOrArrowRow(tool, rowProps))}
        </div>
        {TOOL_GROUPS_LEFT_STRUCTURE.map(renderGroup)}
        <div className="toolbar-group">
          {annotateToolIds.map(id => {
            const tool = TOOL_DEFS.find(t => t.id === id);
            return tool ? renderToolOrArrowRow(tool, rowProps) : null;
          })}
        </div>
        <div className="toolbar-group">
          {TOOL_IDS_LEFT_TEMPLATES.map(id => {
            const tool = TOOL_DEFS.find(t => t.id === id);
            return tool ? renderToolOrArrowRow(tool, rowProps) : null;
          })}
        </div>
      </div>
      {showDrawTools ? (
        <div className="toolbar-draw-panel" role="toolbar" aria-label={i18n.t('toolbar.drawTools')}>
          {drawPanelTools.map(tool => renderToolOrArrowRow(tool, rowProps))}
        </div>
      ) : null}
      {ringsBar}
      <GlasswareLibraryModal
        open={glasswareLibraryOpen}
        onClose={() => setGlasswareLibraryOpen(false)}
        value={glasswareKind}
        onSelect={kind => {
          onCanvasShapeKindChange?.(kind);
          onSelect('glassware');
        }}
      />
    </>
  );
}

type TopStripProps = Pick<
  ToolbarRailProps,
  | 'activeTool'
  | 'onSelect'
  | 'reactionArrowKind'
  | 'onReactionArrowKindChange'
  | 'canvasShapeKind'
  | 'onCanvasShapeKindChange'
  | 'shapeMenuValue'
  | 'onShapeMenuValueChange'
  | 'sruBracketSubscript'
  | 'onSruBracketSubscriptChange'
  | 'onBeginFunctionalGroupPlacement'
  | 'onBeginLigandPlacement'
  | 'requestFunctionalGroupMolblock'
>;

function ToolbarIdStrip({
  ids,
  ariaLabel,
  flattenShapes = false,
  ...props
}: TopStripProps & { ids: readonly string[]; ariaLabel: string; flattenShapes?: boolean }) {
  const i18n = useToolbarI18n();
  const [glasswareLibraryOpen, setGlasswareLibraryOpen] = useState(false);
  const glasswareKind = isLabGlasswareShape(props.canvasShapeKind ?? 'conical_flask')
    ? (props.canvasShapeKind as CanvasShapeKind)
    : 'conical_flask';
  const tools = ids.map(id => TOOL_DEFS.find(t => t.id === id)).filter((t): t is ToolDef => Boolean(t));
  const rowProps = {
    ...props,
    flattenShapes,
    onOpenGlasswareLibrary: () => setGlasswareLibraryOpen(true),
    i18n,
  };
  return (
    <>
      <div className="toolbar-top-strip" role="toolbar" aria-label={ariaLabel}>
        {tools.map(tool => renderToolOrArrowRow(tool, rowProps))}
      </div>
      <GlasswareLibraryModal
        open={glasswareLibraryOpen}
        onClose={() => setGlasswareLibraryOpen(false)}
        value={glasswareKind}
        onSelect={kind => {
          props.onCanvasShapeKindChange?.(kind);
          props.onSelect('glassware');
        }}
      />
    </>
  );
}

/** Annotate / template tools for the home tools row. */
export function ToolbarTopStrip(props: TopStripProps) {
  const i18n = useToolbarI18n();
  return (
    <ToolbarIdStrip ids={TOOL_IDS_TOP_BAR} ariaLabel={i18n.t('toolbar.annotationTools')} {...props} />
  );
}

/** Pencil / shape / image / glassware for the Draw ribbon. */
export function ToolbarDrawStrip(props: TopStripProps) {
  const i18n = useToolbarI18n();
  return (
    <ToolbarIdStrip ids={TOOL_IDS_DRAW_PANEL} flattenShapes ariaLabel={i18n.t('toolbar.drawTools')} {...props} />
  );
}
