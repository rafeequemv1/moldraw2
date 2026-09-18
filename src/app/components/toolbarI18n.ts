import { useMemo } from 'react';
import {
  CANVAS_SHAPE_KIND_ORDER,
  getGlasswareEntry,
  type CanvasShapeKind,
  type ReactionArrowKind,
  REACTION_ARROW_KIND_ORDER,
} from '@moldraw/domain';
import { useI18n } from '../i18n';
import { localizeTool } from '../i18n/localeTools';
import {
  BOND_MENU_SECTIONS,
  CHARGE_SYMBOL_TOOL_IDS,
  SELECT_MENU_TOOL_IDS,
  SRU_BRACKET_SUBSCRIPT_OPTIONS,
  TOOL_DEFS,
  type ShapeMenuValue,
  type SruBracketSubscript,
  type ToolDef,
} from '../toolDefs';

/** Split-menu values: scheme kinds plus mechanism 2e / 1e variants. */
export type ReactionArrowMenuValue =
  | Exclude<ReactionArrowKind, 'electron_flow'>
  | 'electron_flow_pair'
  | 'electron_flow_single';

const SCHEME_ARROW_KINDS = REACTION_ARROW_KIND_ORDER.filter(
  (k): k is Exclude<ReactionArrowKind, 'electron_flow'> => k !== 'electron_flow',
);

export function toReactionArrowMenuValue(
  kind: ReactionArrowKind,
  headStyle?: import('@moldraw/domain').ArrowHeadStyle,
): ReactionArrowMenuValue {
  if (kind === 'electron_flow') {
    return headStyle === 'single' ? 'electron_flow_single' : 'electron_flow_pair';
  }
  return kind;
}

export function fromReactionArrowMenuValue(value: ReactionArrowMenuValue): {
  kind: ReactionArrowKind;
  headStyle?: 'single' | 'pair';
} {
  if (value === 'electron_flow_pair') return { kind: 'electron_flow', headStyle: 'pair' };
  if (value === 'electron_flow_single') return { kind: 'electron_flow', headStyle: 'single' };
  return { kind: value };
}

export function useToolbarI18n() {
  const { t } = useI18n();

  return useMemo(() => {
    const reactionArrowKindLabel = (k: ReactionArrowKind): string => {
      const key = `toolbar.reactionArrows.${k}`;
      const v = t(key);
      return v === key ? k : v;
    };

    const reactionArrowMenuLabel = (v: ReactionArrowMenuValue): string => {
      if (v === 'electron_flow_pair' || v === 'electron_flow_single') {
        const key = `toolbar.reactionArrows.${v}`;
        const label = t(key);
        return label === key ? v : label;
      }
      return reactionArrowKindLabel(v);
    };

    const canvasShapeKindLabel = (k: CanvasShapeKind): string => {
      switch (k) {
        case 'rectangle':
          return t('toolbar.shapeRectangle');
        case 'line':
          return t('toolbar.shapeLine');
        case 'circle':
          return t('toolbar.shapeCircle');
        case 'triangle':
          return t('toolbar.shapeTriangle');
        case 'star':
          return t('toolbar.shapeStar');
        default: {
          const gw = getGlasswareEntry(k);
          return gw?.label ?? k;
        }
      }
    };

    const reactionArrowOptions = REACTION_ARROW_KIND_ORDER.map(k => ({
      value: k,
      label: reactionArrowKindLabel(k),
    }));

    const reactionArrowGroups = [
      {
        id: 'mechanism',
        label: t('toolbar.reactionArrowGroups.mechanism'),
        options: [
          {
            value: 'electron_flow_pair' as const,
            label: reactionArrowMenuLabel('electron_flow_pair'),
            keywords: 'mechanism electron flow curly pair 2e',
          },
          {
            value: 'electron_flow_single' as const,
            label: reactionArrowMenuLabel('electron_flow_single'),
            keywords: 'mechanism fishhook fish-hook radical 1e',
          },
        ],
      },
      {
        id: 'scheme',
        label: t('toolbar.reactionArrowGroups.scheme'),
        options: SCHEME_ARROW_KINDS.map(k => ({
          value: k,
          label: reactionArrowKindLabel(k),
        })),
      },
    ];

    const shapeDrawOptions = CANVAS_SHAPE_KIND_ORDER.map(k => ({
      value: k as ShapeMenuValue,
      label: canvasShapeKindLabel(k),
    }));

    const shapeMenuGroups = [
      { id: 'shapes', label: t('toolbar.menuShapes'), options: shapeDrawOptions },
    ];

    const chargeMenuGroups = [
      {
        id: 'charge',
        label: t('toolbar.menuCharge'),
        options: [
          { value: 'oplus', label: t('toolbar.carbocation') },
          { value: 'ominus', label: t('toolbar.carbanion') },
          { value: 'radical_cation', label: t('toolbar.radicalCation') },
          { value: 'radical_anion', label: t('toolbar.radicalAnion') },
          { value: 'delta_plus', label: 'δ+' },
          { value: 'delta_minus', label: 'δ−' },
        ],
      },
      {
        id: 'symbols',
        label: t('toolbar.menuSymbols'),
        options: CHARGE_SYMBOL_TOOL_IDS.map(id => {
          const tool = TOOL_DEFS.find(x => x.id === id);
          const lt = tool ? localizeTool(tool, t) : null;
          return {
            value: id,
            label: lt?.label ?? id,
            keywords: lt?.title,
          };
        }),
      },
    ] as const;

    const sruKey: Record<SruBracketSubscript, 'n' | 'paren' | 'parenBond' | 'm'> = {
      n: 'n',
      '(CH2)n': 'paren',
      '-(CH2)n-': 'parenBond',
      m: 'm',
    };
    const sruSubscriptOptions = SRU_BRACKET_SUBSCRIPT_OPTIONS.map(o => {
      const key = sruKey[o.value];
      const labelKey = `toolbar.sruSubscripts.${key}`;
      const hintKey = `toolbar.sruSubscriptHints.${key}`;
      const label = t(labelKey);
      const hint = t(hintKey);
      return {
        value: o.value,
        label: label === labelKey ? o.label : label,
        hint: hint === hintKey ? o.hint : hint,
      };
    });

    const mobileCategoryLabel = (id: string): string => {
      const key = `toolbar.categories.${id}`;
      const v = t(key);
      return v === key ? id : v;
    };

    return {
      t,
      localizeTool: (tool: ToolDef) => localizeTool(tool, t),
      reactionArrowKindLabel,
      reactionArrowMenuLabel,
      canvasShapeKindLabel,
      reactionArrowOptions,
      reactionArrowGroups,
      shapeMenuGroups,
      chargeMenuGroups,
      sruSubscriptOptions,
      mobileCategoryLabel,
      c6Options: [
        { value: 'hexagon', label: t('toolbar.menuFlatC6') },
        { value: 'cyclohexane', label: t('toolbar.menuChair') },
        { value: 'boat_cyclohexane', label: t('toolbar.menuBoat') },
      ],
      lonePairOptions: [
        { value: 'lone_pair', label: t('toolbar.menuLonePair') },
        { value: 'free_radical', label: t('toolbar.menuFreeRadical') },
      ],
      orbitalOptions: [
        { value: 'orbital_p', label: t('toolbar.menuOrbitalP') },
        { value: 'orbital_s', label: t('toolbar.menuOrbitalS') },
        { value: 'orbital_p2', label: t('toolbar.menuOrbitalP2') },
        { value: 'orbital_d', label: t('toolbar.menuOrbitalD') },
        { value: 'orbital_dz2', label: t('toolbar.menuOrbitalDz2') },
      ],
      selectMenuOptions: SELECT_MENU_TOOL_IDS.map(id => {
        const selTool = TOOL_DEFS.find(x => x.id === id);
        const lt = selTool ? localizeTool(selTool, t) : null;
        return {
          value: id,
          label: lt?.label ?? id,
          keywords: lt?.title,
        };
      }),
      stereoBondOptions: [
        { value: 'wedge_bond', label: t('toolbar.menuWedge') },
        { value: 'dash_bond', label: t('toolbar.menuDashWedge') },
        { value: 'wavy_bond', label: t('toolbar.menuWavy') },
        { value: 'dative_bond', label: t('toolbar.menuDative') },
      ],
      bondMenuGroups: BOND_MENU_SECTIONS.map(section => ({
        id: section.id,
        label: t(
          section.id === 'main'
            ? 'toolbar.bondMenuMain'
            : section.id === 'more'
              ? 'toolbar.bondMenuMore'
              : 'toolbar.bondMenuAdvanced',
        ),
        options: section.tools.map(id => {
          const tool = TOOL_DEFS.find(x => x.id === id);
          const lt = tool ? localizeTool(tool, t) : null;
          return {
            value: id,
            label: lt?.label ?? id,
            keywords: lt?.title,
          };
        }),
      })),
    };
  }, [t]);
}

export type ToolbarI18n = ReturnType<typeof useToolbarI18n>;
