/**
 * Application preferences: General, Style, Bonds, Style presets, AI, Shortcuts.
 * Compact viewports use a full-screen bottom sheet.
 */
import { createContext, useContext, useEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Bot, FolderOpen, Hand, Keyboard, Palette, Puzzle, Type, X } from 'lucide-react';
import { MobileBottomSheet } from '../components/MobileBottomSheet';
import { useCompactViewport } from '../hooks/useCompactViewport';
import {
  clearGeminiApiKey,
  loadAiSecrets,
  updateGeminiApiKey,
  updateGeminiModel,
} from '../../ai/chat/secretsStorage';
import { MOLDRAW_CHAT_MODELS, resolveGeminiModelId } from '@moldraw/ai/chat';
import type { ShortcutBindingsMap } from '../keyboard/shortcutBindings';
import type { AppSettings, BondsSettings, GeneralSettings, ImageResolutionPreset } from './types';
import { APP_SETTINGS_PRESETS, type AppSettingsPresetId } from './presets';
import { StylePresetPreview } from './StylePresetPreview';
import { ShortcutsSettingsPanel } from './ShortcutsSettingsPanel';
import { PluginsSettingsPanel } from './PluginsSettingsPanel';
import { CANVAS_FONT_FAMILIES, canvasFontCssFamily } from '../constants/fonts';
import { UI_THEME_OPTIONS, type UiThemeId } from '../theme';
import { useInstalledStructureThemes } from '../hooks/useStructureTheme';
import { resolveUiLanguage, UI_LANGUAGES, useI18n, type UiLanguage } from '../i18n';

const ShowSettingsDescContext = createContext(false);

const RESOLUTION_VALUES: ImageResolutionPreset[] = ['document', 'low', 'medium', 'high'];

const RESOLUTION_LABEL_KEYS: Record<ImageResolutionPreset, string> = {
  document: 'settings.general.resolutionDocument',
  low: 'settings.general.resolutionLow',
  medium: 'settings.general.resolutionMedium',
  high: 'settings.general.resolutionHigh',
};

const THEME_LABEL_KEYS: Record<UiThemeId, string> = {
  light: 'settings.general.themeLight',
  'elegant-dark': 'settings.general.themeElegantDark',
  'ink-dark': 'settings.general.themeInkDark',
};

const THEME_HINT_KEYS: Record<UiThemeId, string> = {
  light: 'settings.general.themeLightHint',
  'elegant-dark': 'settings.general.themeElegantDarkHint',
  'ink-dark': 'settings.general.themeInkDarkHint',
};

const PRESET_LABEL_KEYS: Record<AppSettingsPresetId, string> = {
  default: 'settings.presets.defaultLabel',
  acs_1996: 'settings.presets.acs1996Label',
  frontiers: 'settings.presets.frontiersLabel',
  beilstein: 'settings.presets.beilsteinLabel',
  rsc: 'settings.presets.rscLabel',
  nature: 'settings.presets.natureLabel',
};

const PRESET_DESC_KEYS: Record<AppSettingsPresetId, string> = {
  default: 'settings.presets.defaultDesc',
  acs_1996: 'settings.presets.acs1996Desc',
  frontiers: 'settings.presets.frontiersDesc',
  beilstein: 'settings.presets.beilsteinDesc',
  rsc: 'settings.presets.rscDesc',
  nature: 'settings.presets.natureDesc',
};

export interface AppSettingsModalProps {
  open: boolean;
  onClose: () => void;
  settings: AppSettings;
  updateGeneral: (patch: Partial<GeneralSettings>) => void;
  updateBonds: (patch: Partial<BondsSettings>) => void;
  updateShortcutBindings: (bindings: ShortcutBindingsMap) => void;
  resetShortcutBindings: () => void;
  resetToDefaults: () => void;
  onApplyPreset: (presetId: AppSettingsPresetId) => void;
  /** Called after Gemini API key is saved or cleared (refresh chat session). */
  onAiSecretsChange?: () => void;
  /** Persist Style → Theme on the molecule (MCP / undo). */
  onStructureThemeChange?: (themeId: string, drawMode: 'skeletal' | 'ball-stick') => void;
  /** Live status of the local-session bridge (AI → canvas). */
  localSession?: {
    status: 'disconnected' | 'connecting' | 'connected' | 'error';
    revision: number;
    error: string | null;
    remoteChanges: number;
  };
}

type SettingsCategory =
  | 'general'
  | 'touch'
  | 'style'
  | 'bonds'
  | 'presets'
  | 'ai'
  | 'plugins'
  | 'shortcuts';

function SettingsBetaTag() {
  const { t } = useI18n();
  return (
    <span className="app-top-bar__beta" title={t('settings.beta')} style={{ marginLeft: 6, flexShrink: 0 }}>
      {t('settings.beta')}
    </span>
  );
}

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  padding: '5px 0',
  borderBottom: '1px solid var(--chrome-border)',
  fontSize: 13,
  minHeight: 28,
  color: 'var(--text-main)',
};

const labelStyle: CSSProperties = { flex: '1 1 auto', minWidth: 0, fontSize: 14, fontWeight: 650, lineHeight: 1.25 };

const hintStyle: CSSProperties = {
  display: 'block',
  fontSize: 11,
  color: 'var(--text-muted)',
  fontWeight: 400,
  marginTop: 4,
  lineHeight: 1.35,
};

function SettingsFieldLabel({ labelKey, hintKey }: { labelKey: string; hintKey?: string }) {
  const { t } = useI18n();
  const showDescriptions = useContext(ShowSettingsDescContext);
  return (
    <span className="app-settings-field-title" style={labelStyle}>
      {t(labelKey)}
      {showDescriptions && hintKey ? (
        <span className="app-settings-field-hint" style={hintStyle}>
          {t(hintKey)}
        </span>
      ) : null}
    </span>
  );
}

const controlStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  flexShrink: 0,
};

const inputNumStyle: CSSProperties = {
  width: 62,
  padding: '3px 6px',
  border: '1px solid var(--chrome-border-strong)',
  borderRadius: 5,
  fontSize: 12,
  textAlign: 'right' as const,
  background: 'var(--chrome-input-bg)',
  color: 'var(--text-main)',
};

const navBtnStyle = (active: boolean, first = false): CSSProperties => ({
  width: '100%',
  textAlign: 'left',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  borderRadius: 'var(--radius-control)',
  border: 'none',
  padding: '7px 10px',
  marginTop: first ? 0 : 2,
  color: 'var(--text-main)',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: active ? 700 : 600,
});

function BoolSwitch({
  checked,
  onToggle,
  ariaLabel,
  compact = true,
}: {
  checked: boolean;
  onToggle: () => void;
  ariaLabel: string;
  compact?: boolean;
}) {
  const w = compact ? 32 : 44;
  const h = compact ? 16 : 24;
  const knob = compact ? 12 : 18;
  return (
    <button
      type="button"
      role="switch"
      className="app-settings-switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={onToggle}
      style={{
        width: w,
        height: h,
        borderRadius: h / 2,
        border: 'none',
        background: checked ? '#0d9488' : '#cbd5e1',
        cursor: 'pointer',
        position: 'relative',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: (h - knob) / 2,
          left: checked ? w - knob - 2 : 2,
          width: knob,
          height: knob,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left 0.15s ease',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }}
      />
    </button>
  );
}

export function AppSettingsModal({
  open,
  onClose,
  settings,
  updateGeneral,
  updateBonds,
  updateShortcutBindings,
  resetShortcutBindings,
  resetToDefaults,
  onApplyPreset,
  onAiSecretsChange,
  onStructureThemeChange,
  localSession,
}: AppSettingsModalProps) {
  const { t } = useI18n();
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('general');
  const [presetId, setPresetId] = useState<AppSettingsPresetId>(
    () => (settings.lastPresetId as AppSettingsPresetId) || 'default',
  );
  const [geminiKeyDraft, setGeminiKeyDraft] = useState('');
  const [geminiModelDraft, setGeminiModelDraft] = useState(() =>
    resolveGeminiModelId(loadAiSecrets().geminiModel),
  );
  const structureThemes = useInstalledStructureThemes();

  useEffect(() => {
    if (open) {
      const s = loadAiSecrets();
      setGeminiKeyDraft(s.geminiApiKey);
      setGeminiModelDraft(resolveGeminiModelId(s.geminiModel));
      const stored = settings.lastPresetId;
      if (stored && APP_SETTINGS_PRESETS.some(p => p.id === stored)) {
        setPresetId(stored as AppSettingsPresetId);
      }
    }
  }, [open, settings.lastPresetId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  const isCompact = useCompactViewport(1024);

  if (!open) return null;

  const g = settings.general;
  const showDescriptions = g.showSettingsDescriptions === true;
  const uiLang = resolveUiLanguage(g.uiLanguage);
  const b = settings.bonds;

  const panelStyle: CSSProperties = {
    width: isCompact ? '100%' : undefined,
    height: isCompact ? '100%' : undefined,
    maxHeight: isCompact ? 'none' : undefined,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--chrome-bg-elevated)',
    borderRadius: isCompact ? 0 : undefined,
    boxShadow: isCompact ? 'none' : undefined,
    border: isCompact ? 'none' : undefined,
    color: 'var(--text-main)',
  };

  const settingsInner = (
    <ShowSettingsDescContext.Provider value={showDescriptions}>
      <div
        className={`app-settings-modal__panel${isCompact ? ' app-settings-sheet-inner' : ''}`}
        onMouseDown={e => e.stopPropagation()}
        onClick={e => e.stopPropagation()}
        style={panelStyle}
      >
        {!isCompact ? (
          <div className="app-settings-sheet-head">
            <div className="app-settings-sheet-head-row">
              <span className="app-settings-sheet-title">
                {t('settings.title')}
                <SettingsBetaTag />
              </span>
              <div className="app-settings-sheet-head-actions">
                <button
                  type="button"
                  className="app-settings-btn-secondary app-settings-reset-btn"
                  onClick={() => {
                    setPresetId('default');
                    resetToDefaults();
                  }}
                >
                  {t('settings.resetDefaults')}
                </button>
                <button
                  type="button"
                  className="app-settings-modal__close"
                  aria-label={t('settings.closeAria')}
                  onClick={onClose}
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="app-settings-desc-toggle">
          <span>{t('settings.showDescriptions')}</span>
          <BoolSwitch
            compact
            checked={showDescriptions}
            onToggle={() => updateGeneral({ showSettingsDescriptions: !showDescriptions })}
            ariaLabel={t('settings.showDescriptions')}
          />
        </div>

        {showDescriptions ? (
          <div className="app-settings-sheet-intro">{t('settings.intro')}</div>
        ) : null}

        <div
          className="app-settings-sheet-layout"
          style={{
            display: 'grid',
            gridTemplateColumns: isCompact ? '118px minmax(0, 1fr)' : undefined,
            flex: '1 1 auto',
            minHeight: 0,
            background: 'var(--chrome-bg-elevated)',
          }}
        >
          <div
            className="app-settings-modal__sidebar"
            style={{
              borderRight: '1px solid var(--chrome-border)',
              background: 'var(--chrome-bg)',
              padding: '8px 6px',
              overflowY: 'auto',
              minHeight: 0,
            }}
          >
            <div
              className="app-settings-modal__sections-label"
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                padding: '4px 8px 8px',
              }}
            >
              {t('settings.sections')}
            </div>
            <button
              type="button"
              className={`app-settings-modal__nav-btn${activeCategory === 'general' ? ' is-active' : ''}`}
              onClick={() => setActiveCategory('general')}
              style={navBtnStyle(activeCategory === 'general', true)}
            >
              <FolderOpen size={16} />
              {t('settings.general.nav')}
            </button>
            <button
              type="button"
              className={`app-settings-modal__nav-btn${activeCategory === 'touch' ? ' is-active' : ''}`}
              onClick={() => setActiveCategory('touch')}
              style={navBtnStyle(activeCategory === 'touch')}
            >
              <Hand size={16} />
              {t('settings.touch.nav')}
            </button>
            <button
              type="button"
              className={`app-settings-modal__nav-btn${activeCategory === 'style' ? ' is-active' : ''}`}
              onClick={() => setActiveCategory('style')}
              style={navBtnStyle(activeCategory === 'style')}
            >
              <Type size={16} />
              {t('settings.style.nav')}
            </button>
            <button
              type="button"
              className={`app-settings-modal__nav-btn${activeCategory === 'bonds' ? ' is-active' : ''}`}
              onClick={() => setActiveCategory('bonds')}
              style={navBtnStyle(activeCategory === 'bonds')}
            >
              <FolderOpen size={16} />
              {t('settings.bonds.nav')}
            </button>
            <button
              type="button"
              className={`app-settings-modal__nav-btn${activeCategory === 'presets' ? ' is-active' : ''}`}
              onClick={() => setActiveCategory('presets')}
              style={navBtnStyle(activeCategory === 'presets')}
            >
              <Palette size={16} />
              {t('settings.presets.nav')}
            </button>
            <button
              type="button"
              className={`app-settings-modal__nav-btn${activeCategory === 'ai' ? ' is-active' : ''}`}
              onClick={() => setActiveCategory('ai')}
              style={navBtnStyle(activeCategory === 'ai')}
            >
              <Bot size={16} />
              {t('settings.ai.nav')}
            </button>
            <button
              type="button"
              className={`app-settings-modal__nav-btn${activeCategory === 'plugins' ? ' is-active' : ''}`}
              onClick={() => setActiveCategory('plugins')}
              style={navBtnStyle(activeCategory === 'plugins')}
            >
              <Puzzle size={16} />
              {t('settings.plugins.nav')}
            </button>
            <button
              type="button"
              className={`app-settings-modal__nav-btn${activeCategory === 'shortcuts' ? ' is-active' : ''}`}
              onClick={() => setActiveCategory('shortcuts')}
              style={navBtnStyle(activeCategory === 'shortcuts')}
            >
              <Keyboard size={16} />
              {t('settings.shortcuts.nav')}
            </button>
          </div>

          <div
            className="app-settings-sheet-content"
            style={{
              padding: isCompact ? '10px 14px 16px' : '8px 10px 12px',
              background: 'var(--chrome-bg-elevated)',
              overflowY: 'auto',
              boxSizing: 'border-box',
              minHeight: 0,
              flex: '1 1 auto',
            }}
          >
            {activeCategory === 'shortcuts' ? (
              <ShortcutsSettingsPanel
                bindingsOverride={settings.shortcuts?.bindings}
                onChangeBindings={updateShortcutBindings}
                onResetAll={resetShortcutBindings}
                showDescriptions={showDescriptions}
              />
            ) : null}
            {activeCategory === 'presets' ? (
              <>
                {showDescriptions ? (
                  <p
                    style={{
                      margin: '0 0 10px',
                      fontSize: 12,
                      color: 'var(--text-muted)',
                      lineHeight: 1.5,
                    }}
                  >
                    {t('settings.presets.introBefore')}{' '}
                    <strong style={{ color: 'var(--text-main)' }}>{t('settings.presets.aspirin')}</strong>{' '}
                    {t('settings.presets.introAfter')}
                  </p>
                ) : null}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr',
                    gap: 8,
                  }}
                >
                  {APP_SETTINGS_PRESETS.map(p => {
                    const selected = p.id === presetId;
                    const presetDesc = t(PRESET_DESC_KEYS[p.id]);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className={`app-settings-preset-card${selected ? ' is-selected' : ''}`}
                        onClick={() => {
                          setPresetId(p.id);
                          onApplyPreset(p.id);
                        }}
                        title={presetDesc}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'stretch',
                          gap: 10,
                          textAlign: 'left',
                          borderRadius: 'var(--radius-panel)',
                          border: selected
                            ? '1px solid var(--chrome-accent)'
                            : '1px solid var(--chrome-border)',
                          padding: '8px 8px 10px',
                          background: selected ? 'var(--chrome-hover)' : 'var(--chrome-input-bg)',
                          cursor: 'pointer',
                          color: 'var(--text-main)',
                          boxShadow: 'none',
                        }}
                      >
                        <StylePresetPreview settings={p.settings} width={208} height={120} />
                        <span
                          className="app-settings-preset-card__title"
                          style={{ fontSize: 13, fontWeight: selected ? 700 : 600, color: 'var(--text-main)' }}
                        >
                          {t(PRESET_LABEL_KEYS[p.id])}
                        </span>
                        {showDescriptions && presetDesc ? (
                          <span
                            className="app-settings-preset-card__desc"
                            style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.35 }}
                          >
                            {presetDesc}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}

            {activeCategory === 'general' ? (
              <>
                <div style={rowStyle}>
                  <SettingsFieldLabel labelKey="settings.language" hintKey="settings.languageHint" />
                  <div style={controlStyle}>
                    <select
                      value={uiLang}
                      onChange={e => updateGeneral({ uiLanguage: e.target.value as UiLanguage })}
                      style={{ ...inputNumStyle, width: 118, textAlign: 'left' }}
                      aria-label={t('settings.language')}
                    >
                      {UI_LANGUAGES.map(opt => (
                        <option key={opt.id} value={opt.id}>
                          {t(opt.labelKey)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div style={rowStyle}>
                  <SettingsFieldLabel labelKey="settings.general.theme" hintKey="settings.general.themeHint" />
                  <div className="theme-picker">
                    {UI_THEME_OPTIONS.map(opt => {
                      const selected = (g.theme ?? 'light') === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          className={`theme-picker__btn${selected ? ' theme-picker__btn--active' : ''}`}
                          onClick={() => updateGeneral({ theme: opt.id as UiThemeId })}
                          aria-pressed={selected}
                          title={t(THEME_HINT_KEYS[opt.id])}
                        >
                          {t(THEME_LABEL_KEYS[opt.id])}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div style={rowStyle}>
                  <SettingsFieldLabel
                    labelKey="settings.general.showImplicitH"
                    hintKey="settings.general.showImplicitHHint"
                  />
                  <div style={{ ...controlStyle, paddingTop: 2 }}>
                    <BoolSwitch
                      checked={g.showImplicitHydrogens}
                      onToggle={() => updateGeneral({ showImplicitHydrogens: !g.showImplicitHydrogens })}
                      ariaLabel={t('settings.general.showImplicitH')}
                    />
                  </div>
                </div>
                <div style={rowStyle}>
                  <SettingsFieldLabel
                    labelKey="settings.general.colorAtomLabels"
                    hintKey="settings.general.colorAtomLabelsHint"
                  />
                  <div style={{ ...controlStyle, paddingTop: 2 }}>
                    <BoolSwitch
                      checked={g.colorAtomLabels}
                      onToggle={() => updateGeneral({ colorAtomLabels: !g.colorAtomLabels })}
                      ariaLabel={t('settings.general.colorAtomLabels')}
                    />
                  </div>
                </div>
                <div style={rowStyle}>
                  <SettingsFieldLabel
                    labelKey="settings.general.colorBondsToHeteroatoms"
                    hintKey="settings.general.colorBondsToHeteroatomsHint"
                  />
                  <div style={{ ...controlStyle, paddingTop: 2 }}>
                    <BoolSwitch
                      checked={g.applyAtomColorsToBonds}
                      onToggle={() =>
                        updateGeneral({ applyAtomColorsToBonds: !g.applyAtomColorsToBonds })
                      }
                      ariaLabel={t('settings.general.colorBondsToHeteroatoms')}
                    />
                  </div>
                </div>
                <div style={rowStyle}>
                  <SettingsFieldLabel
                    labelKey="settings.general.condensedGroupLabels"
                    hintKey="settings.general.condensedGroupLabelsHint"
                  />
                  <div style={{ ...controlStyle, paddingTop: 2 }}>
                    <BoolSwitch
                      checked={g.condensedGroupLabels}
                      onToggle={() => updateGeneral({ condensedGroupLabels: !g.condensedGroupLabels })}
                      ariaLabel={t('settings.general.condensedGroupLabels')}
                    />
                  </div>
                </div>
                <div style={rowStyle}>
                  <SettingsFieldLabel
                    labelKey="settings.general.showCipLabels"
                    hintKey="settings.general.showCipLabelsHint"
                  />
                  <div style={{ ...controlStyle, paddingTop: 2 }}>
                    <BoolSwitch
                      checked={g.showCipLabels === true}
                      onToggle={() => updateGeneral({ showCipLabels: g.showCipLabels !== true })}
                      ariaLabel={t('settings.general.showCipLabels')}
                    />
                  </div>
                </div>
                <div style={rowStyle}>
                  <SettingsFieldLabel
                    labelKey="settings.general.autoLayoutAfterBondBurst"
                    hintKey="settings.general.autoLayoutAfterBondBurstHint"
                  />
                  <div style={{ ...controlStyle, paddingTop: 2 }}>
                    <BoolSwitch
                      checked={g.autoLayoutAfterBondBurst}
                      onToggle={() =>
                        updateGeneral({ autoLayoutAfterBondBurst: !g.autoLayoutAfterBondBurst })
                      }
                      ariaLabel={t('settings.general.autoLayoutAfterBondBurst')}
                    />
                  </div>
                </div>
                <div style={rowStyle}>
                  <SettingsFieldLabel
                    labelKey="settings.general.preferIndigo2d"
                    hintKey="settings.general.preferIndigo2dHint"
                  />
                  <div style={{ ...controlStyle, paddingTop: 2 }}>
                    <BoolSwitch
                      checked={g.preferIndigo2d === true}
                      onToggle={() =>
                        updateGeneral({ preferIndigo2d: g.preferIndigo2d !== true })
                      }
                      ariaLabel={t('settings.general.preferIndigo2d')}
                    />
                  </div>
                </div>
                <div style={rowStyle}>
                  <SettingsFieldLabel labelKey="settings.general.snapToGrid" hintKey="settings.general.snapToGridHint" />
                  <div style={{ ...controlStyle, paddingTop: 2 }}>
                    <BoolSwitch
                      checked={g.snapToGrid === true}
                      onToggle={() => updateGeneral({ snapToGrid: !g.snapToGrid })}
                      ariaLabel={t('settings.general.snapToGrid')}
                    />
                  </div>
                </div>
                <div style={rowStyle}>
                  <SettingsFieldLabel labelKey="settings.general.showGrid" hintKey="settings.general.showGridHint" />
                  <div style={{ ...controlStyle, paddingTop: 2 }}>
                    <BoolSwitch
                      checked={g.showGrid === true}
                      onToggle={() => updateGeneral({ showGrid: g.showGrid !== true })}
                      ariaLabel={t('settings.general.showGrid')}
                    />
                  </div>
                </div>
                <div style={rowStyle}>
                  <SettingsFieldLabel labelKey="settings.general.reactionComponentMargin" />
                  <div style={controlStyle}>
                    <input
                      type="number"
                      min={0}
                      max={24}
                      step={0.1}
                      value={g.reactionComponentMarginPt}
                      onChange={e => updateGeneral({ reactionComponentMarginPt: Number(e.target.value) })}
                      style={inputNumStyle}
                    />
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('settings.general.unitPt')}</span>
                  </div>
                </div>
                <div style={{ ...rowStyle, borderBottom: 'none' }}>
                  <SettingsFieldLabel labelKey="settings.general.imageResolution" />
                  <div style={controlStyle}>
                    <select
                      value={g.imageResolution}
                      onChange={e =>
                        updateGeneral({ imageResolution: e.target.value as ImageResolutionPreset })
                      }
                      title={t('settings.general.imageResolutionHint')}
                      style={{ ...inputNumStyle, width: 132, textAlign: 'left' }}
                      aria-label={t('settings.general.imageResolution')}
                    >
                      {RESOLUTION_VALUES.map(value => (
                        <option key={value} value={value}>
                          {t(RESOLUTION_LABEL_KEYS[value])}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </>
            ) : null}

            {activeCategory === 'touch' ? (
              <>
                <div style={rowStyle}>
                  <SettingsFieldLabel
                    labelKey="settings.touch.touchPanOnEmptyCanvas"
                    hintKey="settings.touch.touchPanOnEmptyCanvasHint"
                  />
                  <div style={{ ...controlStyle, paddingTop: 2 }}>
                    <BoolSwitch
                      checked={g.touchPanOnEmptyCanvas === true}
                      onToggle={() =>
                        updateGeneral({ touchPanOnEmptyCanvas: g.touchPanOnEmptyCanvas !== true })
                      }
                      ariaLabel={t('settings.touch.touchPanOnEmptyCanvas')}
                    />
                  </div>
                </div>
                <div style={rowStyle}>
                  <SettingsFieldLabel
                    labelKey="settings.touch.touchLoupe"
                    hintKey="settings.touch.touchLoupeHint"
                  />
                  <div style={{ ...controlStyle, paddingTop: 2 }}>
                    <BoolSwitch
                      checked={g.touchLoupe !== false}
                      onToggle={() => updateGeneral({ touchLoupe: g.touchLoupe === false })}
                      ariaLabel={t('settings.touch.touchLoupe')}
                    />
                  </div>
                </div>
                <div style={{ ...rowStyle, borderBottom: 'none' }}>
                  <SettingsFieldLabel
                    labelKey="settings.touch.pointerDebugHud"
                    hintKey="settings.touch.pointerDebugHudHint"
                  />
                  <div style={{ ...controlStyle, paddingTop: 2 }}>
                    <BoolSwitch
                      checked={g.pointerDebugHud === true}
                      onToggle={() => updateGeneral({ pointerDebugHud: g.pointerDebugHud !== true })}
                      ariaLabel={t('settings.touch.pointerDebugHud')}
                    />
                  </div>
                </div>
              </>
            ) : null}

            {activeCategory === 'style' ? (
              <>
                <div style={rowStyle}>
                  <SettingsFieldLabel
                    labelKey="settings.style.structureTheme"
                    hintKey="settings.style.structureThemeHint"
                  />
                  <div style={controlStyle}>
                    <select
                      value={g.structureThemeId}
                      onChange={e => {
                        const next = structureThemes.find(th => th.id === e.target.value);
                        if (!next) return;
                        updateGeneral({
                          structureThemeId: next.id,
                          structureDrawMode: next.drawMode,
                        });
                        onStructureThemeChange?.(next.id, next.drawMode);
                      }}
                      style={{ ...inputNumStyle, width: 118, textAlign: 'left' }}
                      aria-label={t('settings.style.structureTheme')}
                    >
                      {structureThemes.map(th => (
                        <option key={th.id} value={th.id}>
                          {th.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div style={rowStyle}>
                  <SettingsFieldLabel labelKey="settings.style.font" />
                  <div style={controlStyle}>
                    <select
                      value={g.fontFamily}
                      onChange={e => updateGeneral({ fontFamily: e.target.value })}
                      style={{ ...inputNumStyle, width: 118, textAlign: 'left' }}
                      aria-label={t('settings.style.font')}
                    >
                      {CANVAS_FONT_FAMILIES.map(f => (
                        <option key={f} value={f} style={{ fontFamily: canvasFontCssFamily(f) }}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div style={rowStyle}>
                  <SettingsFieldLabel
                    labelKey="settings.style.boldAtomLabels"
                    hintKey="settings.style.boldAtomLabelsHint"
                  />
                  <div style={{ ...controlStyle, paddingTop: 2 }}>
                    <BoolSwitch
                      checked={g.boldAtomLabels}
                      onToggle={() => updateGeneral({ boldAtomLabels: !g.boldAtomLabels })}
                      ariaLabel={t('settings.style.boldAtomLabels')}
                    />
                  </div>
                </div>
                <div style={rowStyle}>
                  <SettingsFieldLabel labelKey="settings.style.fontSize" hintKey="settings.style.fontSizeHint" />
                  <div style={controlStyle}>
                    <input
                      type="number"
                      min={6}
                      max={36}
                      step={0.5}
                      value={g.fontSizePt}
                      onChange={e => updateGeneral({ fontSizePt: Number(e.target.value) })}
                      style={inputNumStyle}
                      aria-label={t('settings.style.fontSize')}
                    />
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('settings.style.unitPx')}</span>
                  </div>
                </div>
                <div style={rowStyle}>
                  <SettingsFieldLabel labelKey="settings.style.subFontSize" />
                  <div style={controlStyle}>
                    <input
                      type="number"
                      min={6}
                      max={36}
                      step={0.5}
                      value={g.subFontSizePt}
                      onChange={e => updateGeneral({ subFontSizePt: Number(e.target.value) })}
                      style={inputNumStyle}
                      aria-label={t('settings.style.subFontSize')}
                    />
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('settings.style.unitPx')}</span>
                  </div>
                </div>
                <div style={rowStyle}>
                  <SettingsFieldLabel labelKey="settings.style.bondLength" />
                  <div style={controlStyle}>
                    <input
                      type="number"
                      min={24}
                      max={80}
                      step={1}
                      value={b.bondLengthPx}
                      onChange={e => updateBonds({ bondLengthPx: Number(e.target.value) })}
                      style={inputNumStyle}
                      aria-label={t('settings.style.bondLength')}
                    />
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('settings.style.unitPx')}</span>
                  </div>
                </div>
                <div style={rowStyle}>
                  <SettingsFieldLabel labelKey="settings.style.bondSpacing" />
                  <div style={controlStyle}>
                    <input
                      type="number"
                      min={4}
                      max={45}
                      step={1}
                      value={b.bondSpacingPercent}
                      onChange={e => updateBonds({ bondSpacingPercent: Number(e.target.value) })}
                      style={inputNumStyle}
                      aria-label={t('settings.style.bondSpacing')}
                    />
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {t('settings.style.percentOfLength')}
                    </span>
                  </div>
                </div>
                <div style={rowStyle}>
                  <SettingsFieldLabel labelKey="settings.style.bondThickness" />
                  <div style={controlStyle}>
                    <input
                      type="number"
                      min={1}
                      max={14}
                      step={0.5}
                      value={b.bondThicknessPx}
                      onChange={e => updateBonds({ bondThicknessPx: Number(e.target.value) })}
                      style={inputNumStyle}
                      aria-label={t('settings.style.bondThickness')}
                    />
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('settings.style.unitPx')}</span>
                  </div>
                </div>
                <div style={rowStyle}>
                  <SettingsFieldLabel labelKey="settings.style.stereoWedgeWidth" />
                  <div style={controlStyle}>
                    <input
                      type="number"
                      min={2}
                      max={24}
                      step={0.5}
                      value={b.stereoWedgeWidthPx}
                      onChange={e => updateBonds({ stereoWedgeWidthPx: Number(e.target.value) })}
                      style={inputNumStyle}
                      aria-label={t('settings.style.stereoWedgeWidth')}
                    />
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('settings.style.unitPx')}</span>
                  </div>
                </div>
                <div style={{ ...rowStyle, borderBottom: 'none' }}>
                  <SettingsFieldLabel labelKey="settings.style.hashSpacing" />
                  <div style={controlStyle}>
                    <input
                      type="number"
                      min={0.5}
                      max={14}
                      step={0.1}
                      value={b.hashSpacingPx}
                      onChange={e => updateBonds({ hashSpacingPx: Number(e.target.value) })}
                      style={inputNumStyle}
                      aria-label={t('settings.style.hashSpacing')}
                    />
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('settings.style.unitPx')}</span>
                  </div>
                </div>
              </>
            ) : null}

            {activeCategory === 'bonds' ? (
              <>
                <div style={{ ...rowStyle, borderBottom: 'none' }}>
                  <SettingsFieldLabel
                    labelKey="settings.bonds.bondAngleSnap"
                    hintKey="settings.bonds.bondAngleSnapHint"
                  />
                  <div style={controlStyle}>
                    <input
                      type="number"
                      min={5}
                      max={45}
                      step={1}
                      value={b.bondAngleSnapDeg}
                      onChange={e => updateBonds({ bondAngleSnapDeg: Number(e.target.value) })}
                      style={inputNumStyle}
                      aria-label={t('settings.bonds.bondAngleSnap')}
                    />
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {t('settings.bonds.unitDeg')}
                    </span>
                  </div>
                </div>
              </>
            ) : null}

            {activeCategory === 'plugins' ? (
              <PluginsSettingsPanel showDescriptions={showDescriptions} />
            ) : null}

            {activeCategory === 'ai' ? (
              <>
                {showDescriptions ? (
                  <p
                    style={{
                      margin: '0 0 12px',
                      fontSize: 12,
                      color: 'var(--text-muted)',
                      lineHeight: 1.5,
                    }}
                  >
                    {t('settings.ai.introBefore')}
                    <code style={{ fontSize: 11 }}>localStorage</code>
                    {t('settings.ai.introAfter')}{' '}
                    <a
                      href="https://aistudio.google.com/apikey"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--chrome-accent)' }}
                    >
                      {t('settings.ai.googleAiStudio')}
                    </a>
                    .
                  </p>
                ) : null}
                <div style={rowStyle}>
                  <SettingsFieldLabel labelKey="settings.ai.geminiModel" />
                  <div style={controlStyle}>
                    <select
                      value={geminiModelDraft}
                      onChange={e => {
                        const id = resolveGeminiModelId(e.target.value);
                        setGeminiModelDraft(id);
                        updateGeminiModel(id);
                        onAiSecretsChange?.();
                      }}
                      style={{
                        ...inputNumStyle,
                        width: '100%',
                        minWidth: 0,
                        textAlign: 'left',
                      }}
                      aria-label={t('settings.ai.geminiModel')}
                    >
                      {MOLDRAW_CHAT_MODELS.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.displayName}
                          {showDescriptions && m.hint ? ` — ${m.hint}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {showDescriptions ? (
                  <p
                    style={{
                      margin: '0 0 12px',
                      fontSize: 11,
                      color: 'var(--text-muted)',
                      lineHeight: 1.45,
                    }}
                  >
                    {t('settings.ai.modelHintBefore')}{' '}
                    <strong>{t('settings.ai.modelHintPro')}</strong>{' '}
                    {t('settings.ai.modelHintAfter')}
                  </p>
                ) : null}
                <div style={rowStyle}>
                  <SettingsFieldLabel labelKey="settings.ai.geminiApiKey" />
                  <div style={{ ...controlStyle, flexDirection: 'column', alignItems: 'stretch' }}>
                    <input
                      type="password"
                      autoComplete="off"
                      value={geminiKeyDraft}
                      onChange={e => setGeminiKeyDraft(e.target.value)}
                      placeholder={t('settings.ai.apiKeyPlaceholder')}
                      style={{
                        ...inputNumStyle,
                        width: '100%',
                        minWidth: 0,
                        textAlign: 'left',
                      }}
                      aria-label={t('settings.ai.geminiApiKey')}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button
                    type="button"
                    onClick={() => {
                      updateGeminiApiKey(geminiKeyDraft);
                      onAiSecretsChange?.();
                    }}
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#fff',
                      background: '#0d9488',
                      border: 'none',
                      borderRadius: 'var(--radius-control)',
                      padding: '8px 14px',
                      cursor: 'pointer',
                    }}
                  >
                    {t('settings.ai.saveKey')}
                  </button>
                  <button
                    type="button"
                    className="app-settings-btn-secondary"
                    onClick={() => {
                      setGeminiKeyDraft('');
                      clearGeminiApiKey();
                      onAiSecretsChange?.();
                    }}
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'var(--text-main)',
                      background: 'var(--chrome-input-bg)',
                      border: '1px solid var(--chrome-border-strong)',
                      borderRadius: 'var(--radius-control)',
                      padding: '8px 14px',
                      cursor: 'pointer',
                    }}
                  >
                    {t('settings.ai.clear')}
                  </button>
                </div>

                <h4 style={{ margin: '20px 0 6px', fontSize: 14, color: 'var(--text-main)' }}>
                  {t('settings.ai.localSessionTitle')}
                </h4>
                {showDescriptions ? (
                  <p
                    style={{
                      margin: '0 0 8px',
                      fontSize: 11,
                      color: 'var(--text-muted)',
                      lineHeight: 1.45,
                    }}
                  >
                    {t('settings.ai.localSessionIntro')}
                  </p>
                ) : null}
                <div style={rowStyle}>
                  <SettingsFieldLabel labelKey="settings.ai.connectLocalSession" />
                  <div style={controlStyle}>
                    <BoolSwitch
                      checked={g.localSessionEnabled === true}
                      onToggle={() => updateGeneral({ localSessionEnabled: g.localSessionEnabled !== true })}
                      ariaLabel={t('settings.ai.connectLocalSession')}
                    />
                  </div>
                </div>
                <div style={rowStyle}>
                  <SettingsFieldLabel labelKey="settings.ai.sessionUrl" />
                  <div style={controlStyle}>
                    <input
                      type="text"
                      value={g.localSessionUrl ?? 'http://127.0.0.1:8787'}
                      onChange={e => updateGeneral({ localSessionUrl: e.target.value })}
                      spellCheck={false}
                      style={{ ...inputNumStyle, width: 148, textAlign: 'left' }}
                      aria-label={t('settings.ai.sessionUrl')}
                    />
                  </div>
                </div>
                <div style={{ ...rowStyle, borderBottom: 'none' }}>
                  <SettingsFieldLabel labelKey="settings.ai.status" />
                  <div style={{ ...controlStyle, fontSize: 12 }}>
                    <span
                      aria-hidden
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        display: 'inline-block',
                        background:
                          localSession?.status === 'connected'
                            ? '#0d9488'
                            : localSession?.status === 'connecting'
                              ? '#f59e0b'
                              : localSession?.status === 'error'
                                ? '#dc2626'
                                : '#94a3b8',
                      }}
                    />
                    <span style={{ color: 'var(--text-muted)' }}>
                      {localSession?.status === 'connected'
                        ? t('settings.ai.statusConnected', {
                            revision: localSession.revision,
                            remoteChanges: localSession.remoteChanges,
                          })
                        : localSession?.status === 'connecting'
                          ? t('settings.ai.statusConnecting')
                          : localSession?.status === 'error'
                            ? localSession.error ?? 'error'
                            : t('settings.ai.statusOff')}
                    </span>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </ShowSettingsDescContext.Provider>
  );

  if (isCompact) {
    return (
      <MobileBottomSheet
        open={open}
        onClose={onClose}
        title={t('topBar.settings')}
        size="tall"
        className="mobile-sheet--settings"
        footer={
          <button
            type="button"
            className="mobile-sheet--settings__reset"
            onClick={() => {
              setPresetId('default');
              resetToDefaults();
            }}
          >
            {t('settings.resetDefaults')}
          </button>
        }
      >
        {settingsInner}
      </MobileBottomSheet>
    );
  }

  return createPortal(
    <div
      className="app-settings-modal app-settings-modal--overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t('settings.modalAria')}
      onMouseDown={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 28000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {settingsInner}
    </div>,
    document.body,
  );
}
