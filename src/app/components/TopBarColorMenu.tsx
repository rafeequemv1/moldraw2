/**
 * Compact palette dropdown: color swatches + selection style (font / bond / opacity).
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Palette, RotateCcw, X } from 'lucide-react';
import type { CanvasShape, CanvasText, Molecule, ReactionArrow } from '@moldraw/domain';
import {
  CONICAL_FLASK_DEFAULT_FILL,
  isLabGlasswareShape,
  isLiquidGlasswareShape,
} from '@moldraw/domain';
import {
  BOND_THICKNESS_PRESETS_PX,
  LABEL_FONT_SIZE_PRESETS_PT,
} from '@moldraw/core';
import {
  COLOR_PRESETS,
  getSelectionColorCapabilities,
  normalizeHexColor,
  resolveColorMenuContext,
  type ColorApplyFlags,
} from '@moldraw/core/color/selectionColor';
import type { ColorTargetPrefs } from '../settings/types';
import { FormatPanelAccordion } from './FormatPanelAccordion';
import { useI18n } from '../i18n';

export interface TopBarColorMenuProps {
  activeColor: string;
  onActiveColorChange: (color: string) => void;
  colorTargets: ColorTargetPrefs;
  onColorTargetsChange: (patch: Partial<ColorTargetPrefs>) => void;
  molecule: Molecule;
  selectedAtomIds: string[];
  selectedBondIds?: string[];
  selectedCanvasText: CanvasText | null;
  selectedReactionArrow: ReactionArrow | null;
  selectedStrokeId?: string | null;
  selectedCanvasShapeId?: string | null;
  ringPaintActive?: boolean;
  onApplyColor: (
    color: string,
    flags: ColorApplyFlags,
    opts: { ringFillOpacity: number; clearRingFill?: boolean; clearAllRingFills?: boolean },
  ) => void;
  onClearAtomColors: () => void;
  onUpdateCanvasShape?: (id: string, patch: Partial<Omit<CanvasShape, 'id'>>) => void;
  onBeginCanvasShapeLiquidScrub?: () => void;
  onScrubCanvasShapeLiquidLevel?: (id: string, fillLevel: number) => void;
  onEndCanvasShapeLiquidScrub?: (id: string, fillLevel: number) => void;
  documentFontSizePt?: number;
  documentBondThicknessPx?: number;
  onApplyFontSize?: (pt: number | null) => void;
  onApplyBondThickness?: (px: number | null) => void;
  onApplyOpacity?: (opacity: number | null) => void;
  /** Theme + grid section (top of panel). */
  documentStyleThemePanel?: ReactNode;
  /** Atoms/bonds section (below color). */
  documentStyleRestPanel?: ReactNode;
  /** Phone/tablet: peek sheet so the canvas stays visible while styles update. */
  isCompact?: boolean;
}

function sharedLabelFontPt(molecule: Molecule, atomIds: string[]): number | undefined {
  if (atomIds.length === 0) return undefined;
  const pts = atomIds
    .map(id => molecule.atoms.find(a => a.id === id)?.labelFontSizePt)
    .filter((v): v is number => v != null);
  if (pts.length === 0) return undefined;
  const first = pts[0];
  return pts.every(p => p === first) ? first : undefined;
}

function sharedBondThickness(
  molecule: Molecule,
  atomIds: string[],
  bondIds: string[],
): number | undefined {
  const bonds =
    bondIds.length > 0
      ? molecule.bonds.filter(b => bondIds.includes(b.id))
      : (() => {
          const set = new Set(atomIds);
          return molecule.bonds.filter(b => set.has(b.fromAtomId) || set.has(b.toAtomId));
        })();
  const thicknesses = bonds.map(b => b.thicknessPx).filter((v): v is number => v != null);
  if (thicknesses.length === 0) return undefined;
  const first = thicknesses[0];
  return thicknesses.every(t => t === first) ? first : undefined;
}

function sharedOpacity(
  molecule: Molecule,
  atomIds: string[],
  bondIds: string[],
): number | undefined {
  const atomOps = atomIds
    .map(id => molecule.atoms.find(a => a.id === id)?.opacity)
    .filter((v): v is number => v != null);
  const bonds =
    bondIds.length > 0
      ? molecule.bonds.filter(b => bondIds.includes(b.id))
      : (() => {
          const set = new Set(atomIds);
          return molecule.bonds.filter(b => set.has(b.fromAtomId) || set.has(b.toAtomId));
        })();
  const bondOps = bonds.map(b => b.opacity).filter((v): v is number => v != null);
  const all = [...atomOps, ...bondOps];
  if (all.length === 0) return undefined;
  const first = all[0];
  return all.every(o => Math.abs(o - first) < 1e-6) ? first : undefined;
}

const HEX_RE = /^#[0-9A-Fa-f]{6}$/i;

function translateColorContextTitle(
  title: string,
  t: (key: string) => string,
): string {
  const map: Record<string, string> = {
    'Shape color': 'colorPanel.ctxShapeColor',
    'Text color': 'colorPanel.ctxTextColor',
    'Drawing color': 'colorPanel.ctxDrawingColor',
    'Bond color': 'colorPanel.ctxBondColor',
    'Bond colors': 'colorPanel.ctxBondColors',
    'Molecule color': 'colorPanel.ctxMoleculeColor',
    'Selection color': 'colorPanel.ctxSelectionColor',
    'Stroke color': 'colorPanel.ctxStrokeColor',
    'Arrow color': 'colorPanel.ctxArrowColor',
  };
  const key = map[title];
  return key ? t(key) : title;
}

export function TopBarColorMenu({
  activeColor,
  onActiveColorChange,
  colorTargets,
  onColorTargetsChange,
  molecule,
  selectedAtomIds,
  selectedBondIds = [],
  selectedCanvasText,
  selectedReactionArrow,
  selectedStrokeId = null,
  selectedCanvasShapeId = null,
  ringPaintActive = false,
  onApplyColor,
  onClearAtomColors,
  onUpdateCanvasShape,
  onBeginCanvasShapeLiquidScrub,
  onScrubCanvasShapeLiquidLevel,
  onEndCanvasShapeLiquidScrub,
  documentFontSizePt = 20,
  documentBondThicknessPx = 2,
  onApplyFontSize,
  onApplyBondThickness,
  onApplyOpacity,
  documentStyleThemePanel,
  documentStyleRestPanel,
  isCompact = false,
}: TopBarColorMenuProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const ringOpacity = colorTargets.ringFillOpacity;

  const caps = getSelectionColorCapabilities(
    molecule,
    selectedAtomIds,
    selectedCanvasText,
    selectedReactionArrow,
    activeColor,
    { selectedStrokeId, selectedCanvasShapeId, ringPaintActive, selectedBondIds: selectedBondIds },
  );

  const ctx = useMemo(
    () =>
      resolveColorMenuContext(molecule, selectedAtomIds, caps, {
        selectedBondIds,
      }),
    [molecule, selectedAtomIds, selectedBondIds, caps],
  );

  const selectedShape =
    selectedCanvasShapeId != null
      ? (molecule.canvasShapes ?? []).find(s => s.id === selectedCanvasShapeId) ?? null
      : null;
  const isGlass = selectedShape != null && isLabGlasswareShape(selectedShape.kind);
  const isLiquidGlass = selectedShape != null && isLiquidGlasswareShape(selectedShape.kind);
  const isLine = selectedShape?.kind === 'line';
  const shapeOnly = ctx.mode === 'shape';

  useEffect(() => {
    if (!open || isCompact) return undefined;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, isCompact]);

  useEffect(() => {
    if (isCompact) return undefined;
    document.documentElement.classList.toggle('format-left-panel-open', open);
    return () => document.documentElement.classList.remove('format-left-panel-open');
  }, [open, isCompact]);

  const bondDisplayColor = useMemo(() => {
    if (selectedBondIds.length > 0) {
      const b = molecule.bonds.find(x => selectedBondIds.includes(x.id) && x.color);
      if (b?.color) return normalizeHexColor(b.color);
    }
    if (selectedAtomIds.length > 0) {
      const set = new Set(selectedAtomIds);
      const b = molecule.bonds.find(
        x => (set.has(x.fromAtomId) || set.has(x.toAtomId)) && x.color,
      );
      if (b?.color) return normalizeHexColor(b.color);
    }
    return normalizeHexColor(caps.displayColor);
  }, [caps.displayColor, molecule.bonds, selectedAtomIds, selectedBondIds]);

  const labelDisplayColor = useMemo(() => {
    if (selectedCanvasText) {
      return normalizeHexColor(selectedCanvasText.color, caps.displayColor);
    }
    if (selectedAtomIds.length > 0) {
      const a = molecule.atoms.find(x => selectedAtomIds.includes(x.id) && x.color);
      if (a?.color) return normalizeHexColor(a.color);
    }
    return normalizeHexColor(caps.displayColor);
  }, [caps.displayColor, molecule.atoms, selectedAtomIds, selectedCanvasText]);

  const showBondSection =
    caps.canBonds && (ctx.mode === 'bond' || ctx.mode === 'structure' || ctx.mode === 'molecule');
  const showLabelSection =
    (caps.canAtoms && (ctx.mode === 'structure' || ctx.mode === 'molecule')) ||
    (caps.canText && ctx.mode === 'text');
  const showSplitStructure = showBondSection || showLabelSection;

  const commitColor = useCallback(
    (
      raw: string,
      extra?: { clearRingFill?: boolean; clearAllRingFills?: boolean },
      overrideFlags?: ColorApplyFlags,
    ) => {
      const hex = normalizeHexColor(raw, caps.displayColor);

      if (shapeOnly && selectedShape && onUpdateCanvasShape) {
        if (isLiquidGlass) {
          onUpdateCanvasShape(selectedShape.id, { fillColor: hex });
        } else if (!isGlass) {
          onUpdateCanvasShape(selectedShape.id, { color: hex });
        }
        return;
      }

      onActiveColorChange(hex);
      if (caps.toolDefaultOnly || ctx.mode === 'drawing') return;

      onApplyColor(hex, overrideFlags ?? ctx.applyFlags, {
        ringFillOpacity: ringOpacity,
        clearRingFill: extra?.clearRingFill,
        clearAllRingFills: extra?.clearAllRingFills,
      });
    },
    [
      caps.displayColor,
      caps.toolDefaultOnly,
      ctx.applyFlags,
      ctx.mode,
      isGlass,
      isLiquidGlass,
      onActiveColorChange,
      onApplyColor,
      onUpdateCanvasShape,
      ringOpacity,
      selectedShape,
      shapeOnly,
    ],
  );

  const shapeFillValue = selectedShape
    ? HEX_RE.test(selectedShape.fillColor ?? '')
      ? selectedShape.fillColor!
      : isLiquidGlass
        ? CONICAL_FLASK_DEFAULT_FILL
        : '#ffffff'
    : '#ffffff';

  /** Custom square first, then small presets — no hex field. */
  const swatchRow = (current: string, onPick: (hex: string) => void, label: string) => {
    const cur = normalizeHexColor(current).toLowerCase();
    return (
      <div className="app-top-bar__color-swatches" role="group" aria-label={label}>
        <label className="app-top-bar__color-custom" title={t('colorPanel.customColor')}>
          <input
            type="color"
            className="app-top-bar__color-custom-input"
            value={normalizeHexColor(current)}
            onInput={e => onPick((e.target as HTMLInputElement).value)}
            aria-label={`${label} ${t('colorPanel.customColor').toLowerCase()}`}
          />
        </label>
        {COLOR_PRESETS.map(c => {
          const selected = cur === c.toLowerCase();
          return (
            <button
              key={c}
              type="button"
              className={`app-top-bar__color-preset${selected ? ' is-selected' : ''}`}
              style={{ background: c }}
              title={c}
              aria-label={`Color ${c}`}
              aria-pressed={selected}
              onClick={() => onPick(c)}
            />
          );
        })}
      </div>
    );
  };

  const emptyApply = (): ColorApplyFlags => ({
    atomLabels: false,
    bonds: false,
    ringFill: false,
    text: false,
    arrowLine: false,
    arrowReagent: false,
    strokes: false,
    canvasShapes: false,
  });

  const hasAtoms = selectedAtomIds.length > 0;
  const hasBonds =
    selectedBondIds.length > 0 ||
    (hasAtoms &&
      molecule.bonds.some(
        b => selectedAtomIds.includes(b.fromAtomId) || selectedAtomIds.includes(b.toAtomId),
      ));
  const showStyleSection =
    (hasAtoms || hasBonds) &&
    (onApplyFontSize != null || onApplyBondThickness != null || onApplyOpacity != null);
  const fontPt = sharedLabelFontPt(molecule, selectedAtomIds);
  const bondPx = sharedBondThickness(molecule, selectedAtomIds, selectedBondIds);
  const opacity = sharedOpacity(molecule, selectedAtomIds, selectedBondIds);
  const opacityPct = Math.round((opacity ?? 1) * 100);

  return (
    <div ref={wrapRef} className="app-top-bar__color-wrap">
      <button
        type="button"
        className={`app-top-bar__color-trigger${open ? ' is-open' : ''}`}
        onClick={() => setOpen(v => !v)}
        title={t('colorPanel.triggerTitle')}
        aria-label={t('colorPanel.colorAndStyleAria')}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={menuId}
      >
        <Palette size={16} strokeWidth={2} aria-hidden />
        <span
          className="app-top-bar__color-trigger-dot"
          style={{ background: caps.displayColor }}
          aria-hidden
        />
      </button>
      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              id={menuId}
              ref={panelRef}
              className={`format-left-panel mol-color-side-panel${isCompact ? ' format-left-panel--sheet' : ''}`}
              role="dialog"
              aria-label={t('colorPanel.colorAndStyleAria')}
            >
              {isCompact ? <div className="format-left-panel__handle" aria-hidden /> : null}
              <div className="format-left-panel__head">
                <div className="mol-color-side-panel-title">{t('colorPanel.title')}</div>
                <button
                  type="button"
                  className="format-left-panel__close"
                  onClick={() => setOpen(false)}
                  aria-label={t('colorPanel.closeAria')}
                >
                  <X size={14} strokeWidth={2} aria-hidden />
                </button>
              </div>

              <div className="format-left-panel__scroll">
              {documentStyleThemePanel ? (
                <div className="format-left-panel__section format-left-panel__section--style">
                  {documentStyleThemePanel}
                </div>
              ) : null}

              <FormatPanelAccordion title={t('colorPanel.sectionColor')} pinned>
                <div className="format-left-panel__color-subtitle">
                  {translateColorContextTitle(ctx.title, t)}
                </div>

          {shapeOnly && selectedShape && onUpdateCanvasShape ? (
            <>
              {!isGlass && (
                <>
                  {swatchRow(
                    selectedShape.color || '#0f172a',
                    hex => onUpdateCanvasShape(selectedShape.id, { color: hex }),
                    t('colorPanel.stroke'),
                  )}
                  <div className="app-top-bar__color-style-row">
                    <span className="mol-color-side-label">{t('colorPanel.width')}</span>
                    <input
                      type="range"
                      className="chrome-range app-top-bar__color-opacity-range"
                      min={1}
                      max={12}
                      step={1}
                      value={Math.min(12, Math.max(1, Math.round(selectedShape.strokeWidth || 2)))}
                      aria-label={t('colorPanel.strokeWidthAria')}
                      onInput={e => {
                        const n = parseInt((e.target as HTMLInputElement).value, 10);
                        if (!Number.isNaN(n)) {
                          onUpdateCanvasShape(selectedShape.id, { strokeWidth: n });
                        }
                      }}
                    />
                    <span className="app-top-bar__color-opacity-pct">
                      {Math.min(12, Math.max(1, Math.round(selectedShape.strokeWidth || 2)))}
                    </span>
                  </div>
                </>
              )}
              {isLiquidGlass && (
                <div className="app-top-bar__color-style-row" style={{ flexWrap: 'wrap' }}>
                  <span className="mol-color-side-label">{t('colorPanel.liquid')}</span>
                  <label className="app-top-bar__color-custom" aria-label={t('colorPanel.liquid')}>
                    <input
                      type="color"
                      className="app-top-bar__color-custom-input"
                      value={shapeFillValue}
                      onInput={e =>
                        onUpdateCanvasShape(selectedShape.id, {
                          fillColor: (e.target as HTMLInputElement).value,
                        })
                      }
                    />
                  </label>
                  <span className="mol-color-side-label">{t('colorPanel.level')}</span>
                  <input
                    type="range"
                    className="chrome-range app-top-bar__color-opacity-range"
                    min={0}
                    max={100}
                    step={1}
                    value={Math.round((selectedShape.fillLevel ?? 0.35) * 100)}
                    onPointerDown={() => onBeginCanvasShapeLiquidScrub?.()}
                    onInput={e => {
                      const n = parseInt((e.target as HTMLInputElement).value, 10);
                      if (Number.isNaN(n)) return;
                      const level = n / 100;
                      if (onScrubCanvasShapeLiquidLevel) {
                        onScrubCanvasShapeLiquidLevel(selectedShape.id, level);
                      } else {
                        onUpdateCanvasShape?.(selectedShape.id, { fillLevel: level });
                      }
                    }}
                    onPointerUp={e => {
                      const n = parseInt((e.target as HTMLInputElement).value, 10);
                      if (Number.isNaN(n)) return;
                      onEndCanvasShapeLiquidScrub?.(selectedShape.id, n / 100);
                    }}
                    onPointerCancel={e => {
                      const n = parseInt((e.target as HTMLInputElement).value, 10);
                      if (Number.isNaN(n)) return;
                      onEndCanvasShapeLiquidScrub?.(selectedShape.id, n / 100);
                    }}
                  />
                </div>
              )}
              {!isGlass && !isLine && (
                <div className="app-top-bar__color-style-row">
                  <span className="mol-color-side-label">{t('colorPanel.fill')}</span>
                  <label className="app-top-bar__color-custom" aria-label={t('colorPanel.fill')}>
                    <input
                      type="color"
                      className="app-top-bar__color-custom-input"
                      value={shapeFillValue}
                      onInput={e =>
                        onUpdateCanvasShape(selectedShape.id, {
                          fillColor: (e.target as HTMLInputElement).value,
                        })
                      }
                    />
                  </label>
                  {selectedShape.fillColor ? (
                    <button
                      type="button"
                      className="mol-color-side-link"
                      onClick={() => onUpdateCanvasShape(selectedShape.id, { fillColor: '' })}
                    >
                      {t('colorPanel.clear')}
                    </button>
                  ) : null}
                </div>
              )}
            </>
          ) : showSplitStructure ? (
            <>
              {showBondSection && (
                <div className="format-left-panel__color-block" aria-label={t('colorPanel.ctxBondColor')}>
                  <div className="format-left-panel__color-block-title">{t('colorPanel.bond')}</div>
                  {swatchRow(
                    bondDisplayColor,
                    hex =>
                      commitColor(hex, undefined, {
                        ...emptyApply(),
                        bonds: true,
                      }),
                    t('colorPanel.ctxBondColor'),
                  )}
                </div>
              )}

              {showLabelSection && (
                <div className="format-left-panel__color-block" aria-label={t('colorPanel.ctxTextColor')}>
                  <div className="format-left-panel__color-block-title">
                    {ctx.mode === 'text' ? t('colorPanel.text') : t('colorPanel.labels')}
                  </div>
                  {swatchRow(
                    labelDisplayColor,
                    hex =>
                      commitColor(hex, undefined, {
                        ...emptyApply(),
                        atomLabels: caps.canAtoms,
                        text: caps.canText,
                      }),
                    t('colorPanel.labelColor'),
                  )}
                </div>
              )}

              {caps.canRingFill && (ctx.mode === 'structure' || ctx.mode === 'molecule') && (
                <div className="format-left-panel__color-block" aria-label={t('colorPanel.ringFill')}>
                  <div className="format-left-panel__color-block-title">{t('colorPanel.ringFill')}</div>
                  {swatchRow(
                    caps.displayColor,
                    hex =>
                      commitColor(hex, undefined, {
                        ...emptyApply(),
                        ringFill: true,
                      }),
                    t('colorPanel.ringFill'),
                  )}
                  <div className="app-top-bar__color-style-row">
                    <span className="mol-color-side-label">{t('colorPanel.opacity')}</span>
                    <input
                      type="range"
                      className="chrome-range app-top-bar__color-opacity-range"
                      min={5}
                      max={80}
                      value={Math.round(ringOpacity * 100)}
                      onChange={e => {
                        const v = parseInt(e.target.value, 10) / 100;
                        onColorTargetsChange({ ringFillOpacity: v });
                      }}
                      onMouseUp={() =>
                        commitColor(caps.displayColor, undefined, {
                          ...emptyApply(),
                          ringFill: true,
                        })
                      }
                      onTouchEnd={() =>
                        commitColor(caps.displayColor, undefined, {
                          ...emptyApply(),
                          ringFill: true,
                        })
                      }
                    />
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {swatchRow(caps.displayColor, hex => commitColor(hex), t('colorPanel.sectionColor'))}
            </>
          )}

          <div className="mol-color-side-footer format-left-panel__color-footer">
            {caps.canAtoms && (
              <button type="button" className="mol-color-side-link" onClick={onClearAtomColors}>
                {t('colorPanel.resetColors')}
              </button>
            )}
            {caps.canRingFill && (
              <button
                type="button"
                className="mol-color-side-link"
                onClick={() => commitColor(caps.displayColor, { clearRingFill: true })}
              >
                {t('colorPanel.clearRing')}
              </button>
            )}
            {caps.hasAnyRingFills && (
              <button
                type="button"
                className="mol-color-side-link"
                onClick={() => commitColor(caps.displayColor, { clearAllRingFills: true })}
              >
                {t('colorPanel.clearAllRings')}
              </button>
            )}
            <button
              type="button"
              className="mol-color-side-link"
              onClick={() => commitColor('#0f172a')}
            >
              <RotateCcw size={11} strokeWidth={2} aria-hidden />
              {t('colorPanel.default')}
            </button>
          </div>
              </FormatPanelAccordion>

              {documentStyleRestPanel ? (
                <div className="format-left-panel__section format-left-panel__section--style">
                  {documentStyleRestPanel}
                </div>
              ) : null}

          {showStyleSection ? (
            <FormatPanelAccordion title={t('colorPanel.sectionSelectionOverrides')}>
              {onApplyFontSize ? (
                <div className="app-top-bar__color-style-row">
                  <span className="mol-color-side-label">{t('stylePanel.font')}</span>
                  <select
                    className="app-top-bar__color-style-select"
                    disabled={!hasAtoms}
                    value={fontPt != null ? String(fontPt) : 'default'}
                    aria-label={t('colorPanel.fontSizeAria')}
                    onChange={e => {
                      const v = e.target.value;
                      onApplyFontSize(v === 'default' ? null : Number(v));
                    }}
                  >
                    <option value="default">{documentFontSizePt} pt</option>
                    {LABEL_FONT_SIZE_PRESETS_PT.map(pt => (
                      <option key={pt} value={String(pt)}>
                        {pt} pt
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              {onApplyBondThickness ? (
                <div className="app-top-bar__color-style-row">
                  <span className="mol-color-side-label">{t('colorPanel.bond')}</span>
                  <select
                    className="app-top-bar__color-style-select"
                    disabled={!hasBonds}
                    value={bondPx != null ? String(bondPx) : 'default'}
                    aria-label={t('colorPanel.bondThicknessAria')}
                    onChange={e => {
                      const v = e.target.value;
                      onApplyBondThickness(v === 'default' ? null : Number(v));
                    }}
                  >
                    <option value="default">{documentBondThicknessPx} px</option>
                    {BOND_THICKNESS_PRESETS_PX.map(px => (
                      <option key={px} value={String(px)}>
                        {px} px
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              {onApplyOpacity ? (
                <div className="app-top-bar__color-style-row">
                  <span className="mol-color-side-label">{t('colorPanel.opacity')}</span>
                  <input
                    type="range"
                    className="chrome-range app-top-bar__color-opacity-range"
                    min={0}
                    max={100}
                    step={5}
                    value={opacityPct}
                    aria-label={t('colorPanel.opacity')}
                    onChange={e => {
                      const pct = Number(e.target.value);
                      if (pct >= 100) onApplyOpacity(null);
                      else onApplyOpacity(pct / 100);
                    }}
                  />
                  <span className="app-top-bar__color-opacity-pct" aria-hidden>
                    {opacityPct}%
                  </span>
                </div>
              ) : null}
            </FormatPanelAccordion>
          ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
