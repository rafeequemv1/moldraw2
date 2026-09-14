/**
 * Application preferences: General, Style, Bonds, Style presets, AI, Shortcuts.
 * Compact viewports use a full-screen bottom sheet.
 */
import { useEffect, useState, type CSSProperties } from 'react';
import { Bot, FolderOpen, Keyboard, Palette, Puzzle, Type, X } from 'lucide-react';
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
import { CANVAS_FONT_FAMILIES } from '../constants/fonts';
import { UI_THEME_OPTIONS, type UiThemeId } from '../theme';
import { useInstalledStructureThemes } from '../hooks/useStructureTheme';

/** Fixed content viewport so every section shares the same modal size (scroll inside). */
const SETTINGS_CONTENT_HEIGHT = 460;

const RESOLUTION_OPTIONS: { value: ImageResolutionPreset; label: string }[] = [
  { value: 'document', label: '1× (match font size)' },
  { value: 'low', label: 'low (2×)' },
  { value: 'medium', label: 'medium (3×)' },
  { value: 'high', label: 'high (4×)' },
];

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

type SettingsCategory = 'general' | 'style' | 'bonds' | 'presets' | 'ai' | 'plugins' | 'shortcuts';

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  padding: '6px 0',
  borderBottom: '1px solid var(--chrome-border)',
  fontSize: 12,
  color: 'var(--text-main)',
};

const labelStyle: CSSProperties = { flex: '1 1 auto', minWidth: 0 };

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
  padding: '9px 10px',
  marginTop: first ? 0 : 4,
  background: active ? 'var(--chrome-hover)' : 'transparent',
  color: 'var(--text-main)',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: active ? 700 : 600,
});

function BoolSwitch({
  checked,
  onToggle,
  ariaLabel,
}: {
  checked: boolean;
  onToggle: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={onToggle}
      style={{
        width: 44,
        height: 24,
        borderRadius: 12,
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
          top: 3,
          left: checked ? 22 : 3,
          width: 18,
          height: 18,
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
  const b = settings.bonds;

  const panelStyle: CSSProperties = {
    width: isCompact ? '100%' : 'min(700px, calc(100vw - 20px))',
    height: isCompact ? '100%' : undefined,
    maxHeight: isCompact ? 'none' : 'calc(100vh - 40px)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--chrome-bg-elevated)',
    borderRadius: isCompact ? 0 : 12,
    boxShadow: isCompact ? 'none' : 'var(--shadow-elevated)',
    border: isCompact ? 'none' : '1px solid var(--chrome-border)',
    color: 'var(--text-main)',
  };

  const settingsInner = (
      <div
        className={`app-settings-modal__panel${isCompact ? ' app-settings-sheet-inner' : ''}`}
        onMouseDown={e => e.stopPropagation()}
        style={panelStyle}
      >
        <div
          style={{
            padding: '10px 14px',
            borderBottom: '1px solid var(--chrome-border)',
            background: 'var(--chrome-bg-elevated)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
                Drawing settings
              </span>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.45 }}>
                {
                  'Saved in this browser. Typography, export, and bond appearance stay until you change them. Style presets compare journal layouts — each thumbnail shows aspirin with that preset.'
                }
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => {
                  setPresetId('default');
                  resetToDefaults();
                }}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--text-main)',
                  background: 'var(--chrome-bg)',
                  border: '1px solid var(--chrome-border-strong)',
                  borderRadius: 'var(--radius-control)',
                  padding: '8px 12px',
                  cursor: 'pointer',
                }}
              >
                Reset defaults
              </button>
              {!isCompact ? (
                <button
                  type="button"
                  aria-label="Close"
                  onClick={onClose}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 36,
                    height: 36,
                    border: '1px solid var(--chrome-border)',
                    borderRadius: 'var(--radius-control)',
                    background: 'var(--chrome-bg-elevated)',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                  }}
                >
                  <X size={18} />
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '118px minmax(0, 1fr)',
            flex: 1,
            minHeight: 0,
            maxHeight: 'calc(100vh - 96px)',
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
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                padding: '4px 8px 8px',
              }}
            >
              Sections
            </div>
            <button
              type="button"
              className={`app-settings-modal__nav-btn${activeCategory === 'general' ? ' is-active' : ''}`}
              onClick={() => setActiveCategory('general')}
              style={navBtnStyle(activeCategory === 'general', true)}
            >
              <FolderOpen size={16} />
              General
            </button>
            <button
              type="button"
              className={`app-settings-modal__nav-btn${activeCategory === 'style' ? ' is-active' : ''}`}
              onClick={() => setActiveCategory('style')}
              style={navBtnStyle(activeCategory === 'style')}
            >
              <Type size={16} />
              Style
            </button>
            <button
              type="button"
              className={`app-settings-modal__nav-btn${activeCategory === 'bonds' ? ' is-active' : ''}`}
              onClick={() => setActiveCategory('bonds')}
              style={navBtnStyle(activeCategory === 'bonds')}
            >
              <FolderOpen size={16} />
              Bonds
            </button>
            <button
              type="button"
              className={`app-settings-modal__nav-btn${activeCategory === 'presets' ? ' is-active' : ''}`}
              onClick={() => setActiveCategory('presets')}
              style={navBtnStyle(activeCategory === 'presets')}
            >
              <Palette size={16} />
              Style presets
            </button>
            <button
              type="button"
              className={`app-settings-modal__nav-btn${activeCategory === 'ai' ? ' is-active' : ''}`}
              onClick={() => setActiveCategory('ai')}
              style={navBtnStyle(activeCategory === 'ai')}
            >
              <Bot size={16} />
              AI
            </button>
            <button
              type="button"
              className={`app-settings-modal__nav-btn${activeCategory === 'plugins' ? ' is-active' : ''}`}
              onClick={() => setActiveCategory('plugins')}
              style={navBtnStyle(activeCategory === 'plugins')}
            >
              <Puzzle size={16} />
              Plugins
            </button>
            <button
              type="button"
              className={`app-settings-modal__nav-btn${activeCategory === 'shortcuts' ? ' is-active' : ''}`}
              onClick={() => setActiveCategory('shortcuts')}
              style={navBtnStyle(activeCategory === 'shortcuts')}
            >
              <Keyboard size={16} />
              Shortcuts
            </button>
          </div>

          <div
            style={{
              padding: '8px 12px 12px',
              background: 'var(--chrome-bg-elevated)',
              overflowY: 'auto',
              height: SETTINGS_CONTENT_HEIGHT,
              minHeight: SETTINGS_CONTENT_HEIGHT,
              maxHeight: SETTINGS_CONTENT_HEIGHT,
              boxSizing: 'border-box',
            }}
          >
            {activeCategory === 'shortcuts' ? (
              <ShortcutsSettingsPanel
                bindingsOverride={settings.shortcuts?.bindings}
                onChangeBindings={updateShortcutBindings}
                onResetAll={resetShortcutBindings}
              />
            ) : null}
            {activeCategory === 'presets' ? (
              <>
                <p
                  style={{
                    margin: '0 0 10px',
                    fontSize: 12,
                    color: 'var(--text-muted)',
                    lineHeight: 1.5,
                  }}
                >
                  Pick a publication-style preset. Each card shows{' '}
                  <strong style={{ color: 'var(--text-main)' }}>aspirin</strong> (2-acetoxybenzoic acid) rendered with
                  that preset&apos;s bond and label settings. The highlighted card matches your current
                  selection.
                </p>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                    gap: 8,
                  }}
                >
                  {APP_SETTINGS_PRESETS.map(p => {
                    const selected = p.id === presetId;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className={`app-settings-preset-card${selected ? ' is-selected' : ''}`}
                        onClick={() => {
                          setPresetId(p.id);
                          onApplyPreset(p.id);
                        }}
                        title={p.description}
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
                        <StylePresetPreview settings={p.settings} width={220} height={140} />
                        <span
                          className="app-settings-preset-card__title"
                          style={{ fontSize: 12, fontWeight: selected ? 700 : 600, color: 'var(--text-main)' }}
                        >
                          {p.label}
                        </span>
                        {p.description ? (
                          <span
                            className="app-settings-preset-card__desc"
                            style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.35 }}
                          >
                            {p.description}
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
                <div style={{ ...rowStyle, alignItems: 'flex-start' }}>
                  <span style={labelStyle}>
                    Theme
                    <span
                      style={{
                        display: 'block',
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        fontWeight: 400,
                        marginTop: 4,
                        lineHeight: 1.35,
                      }}
                    >
                      Look behind this window — chrome and canvas update as you pick a theme.
                      Ink dark uses a black canvas with white bonds and atom letters.
                    </span>
                  </span>
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
                          title={opt.hint}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div style={{ ...rowStyle, alignItems: 'flex-start' }}>
                  <span style={labelStyle}>
                    Show implicit H labels
                    <span
                      style={{
                        display: 'block',
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        fontWeight: 400,
                        marginTop: 4,
                        lineHeight: 1.35,
                      }}
                    >
                      Draw CH₃ / NH₂-style counts on the 2D canvas when hydrogens are not expanded.
                      The top-bar H button uses Indigo to fold/unfold real H atoms instead.
                    </span>
                  </span>
                  <div style={{ ...controlStyle, paddingTop: 2 }}>
                    <BoolSwitch
                      checked={g.showImplicitHydrogens}
                      onToggle={() => updateGeneral({ showImplicitHydrogens: !g.showImplicitHydrogens })}
                      ariaLabel="Show implicit hydrogen labels on 2D canvas"
                    />
                  </div>
                </div>
                <div style={{ ...rowStyle, alignItems: 'flex-start' }}>
                  <span style={labelStyle}>
                    Color atom labels by element
                    <span
                      style={{
                        display: 'block',
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        fontWeight: 400,
                        marginTop: 4,
                        lineHeight: 1.35,
                      }}
                    >
                      Off by default (2D atoms black). When on, heteroatom labels use palette colors
                      (N blue, O red, etc.). Custom painted colors always apply. The 3D viewer always
                      uses element colors.
                    </span>
                  </span>
                  <div style={{ ...controlStyle, paddingTop: 2 }}>
                    <BoolSwitch
                      checked={g.colorAtomLabels}
                      onToggle={() => updateGeneral({ colorAtomLabels: !g.colorAtomLabels })}
                      ariaLabel="Color atom labels by element on 2D canvas"
                    />
                  </div>
                </div>
                <div style={{ ...rowStyle, alignItems: 'flex-start' }}>
                  <span style={labelStyle}>
                    Color bonds to heteroatoms
                    <span
                      style={{
                        display: 'block',
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        fontWeight: 400,
                        marginTop: 4,
                        lineHeight: 1.35,
                      }}
                    >
                      Off by default (2D bonds black). When on, 2D bonds to heteroatoms / functional
                      groups match label colors (N blue, O red, etc.) unless the bond has a custom color.
                      The 3D viewer always uses element-colored bonds.
                    </span>
                  </span>
                  <div style={{ ...controlStyle, paddingTop: 2 }}>
                    <BoolSwitch
                      checked={g.applyAtomColorsToBonds}
                      onToggle={() =>
                        updateGeneral({ applyAtomColorsToBonds: !g.applyAtomColorsToBonds })
                      }
                      ariaLabel="Color bonds to heteroatoms and functional groups"
                    />
                  </div>
                </div>
                <div style={{ ...rowStyle, alignItems: 'flex-start' }}>
                  <span style={labelStyle}>
                    Condensed group labels
                    <span
                      style={{
                        display: 'block',
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        fontWeight: 400,
                        marginTop: 4,
                        lineHeight: 1.35,
                      }}
                    >
                      Terminal groups can show compact labels (e.g. CH₃, NH₂) instead of only implicit-H
                      stubs on carbons.
                    </span>
                  </span>
                  <div style={{ ...controlStyle, paddingTop: 2 }}>
                    <BoolSwitch
                      checked={g.condensedGroupLabels}
                      onToggle={() => updateGeneral({ condensedGroupLabels: !g.condensedGroupLabels })}
                      ariaLabel="Condensed group labels on terminal atoms"
                    />
                  </div>
                </div>
                <div style={{ ...rowStyle, alignItems: 'flex-start' }}>
                  <span style={labelStyle}>
                    R/S and E/Z labels
                    <span
                      style={{
                        display: 'block',
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        fontWeight: 400,
                        marginTop: 4,
                        lineHeight: 1.35,
                      }}
                    >
                      Show CIP stereo descriptors on the canvas (R/S on chiral atoms, E/Z on double
                      bonds). Requires Indigo. Default off.
                    </span>
                  </span>
                  <div style={{ ...controlStyle, paddingTop: 2 }}>
                    <BoolSwitch
                      checked={g.showCipLabels === true}
                      onToggle={() => updateGeneral({ showCipLabels: g.showCipLabels !== true })}
                      ariaLabel="Show CIP R/S and E/Z labels"
                    />
                  </div>
                </div>
                <div style={{ ...rowStyle, alignItems: 'flex-start' }}>
                  <span style={labelStyle}>
                    Auto-layout after bond burst
                    <span
                      style={{
                        display: 'block',
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        fontWeight: 400,
                        marginTop: 4,
                        lineHeight: 1.35,
                      }}
                    >
                      When you add several bonds in quick succession, tidy that fragment (same engine as
                      Cleanup).
                    </span>
                  </span>
                  <div style={{ ...controlStyle, paddingTop: 2 }}>
                    <BoolSwitch
                      checked={g.autoLayoutAfterBondBurst}
                      onToggle={() =>
                        updateGeneral({ autoLayoutAfterBondBurst: !g.autoLayoutAfterBondBurst })
                      }
                      ariaLabel="Auto layout after drawing a burst of bonds"
                    />
                  </div>
                </div>
                <div style={{ ...rowStyle, alignItems: 'flex-start' }}>
                  <span style={labelStyle}>
                    Indigo accelerator (legacy) for 2D layout
                    <span
                      style={{
                        display: 'block',
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        fontWeight: 400,
                        marginTop: 4,
                        lineHeight: 1.35,
                      }}
                    >
                      On (default): Cleanup and SMILES→2D try Indigo WASM when loaded
                      (accelerator for hard polycyclics). Off: native TypeScript engine only.
                      CIP, aromatize, and structure check work natively.
                    </span>
                  </span>
                  <div style={{ ...controlStyle, paddingTop: 2 }}>
                    <BoolSwitch
                      checked={g.preferIndigo2d === true}
                      onToggle={() =>
                        updateGeneral({ preferIndigo2d: g.preferIndigo2d !== true })
                      }
                      ariaLabel="Indigo accelerator for 2D layout"
                    />
                  </div>
                </div>
                <div style={{ ...rowStyle, alignItems: 'flex-start' }}>
                  <span style={labelStyle}>
                    Snap to grid
                    <span
                      style={{
                        display: 'block',
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        fontWeight: 400,
                        marginTop: 4,
                        lineHeight: 1.35,
                      }}
                    >
                      When dragging molecules or reaction arrows, snap centers to the background
                      grid. Hold Shift to move freely. Alignment guides still snap to other
                      molecule bounds.
                    </span>
                  </span>
                  <div style={{ ...controlStyle, paddingTop: 2 }}>
                    <BoolSwitch
                      checked={g.snapToGrid === true}
                      onToggle={() => updateGeneral({ snapToGrid: !g.snapToGrid })}
                      ariaLabel="Snap to grid when dragging"
                    />
                  </div>
                </div>
                <div style={{ ...rowStyle, alignItems: 'flex-start' }}>
                  <span style={labelStyle}>
                    Show grid
                    <span
                      style={{
                        display: 'block',
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        fontWeight: 400,
                        marginTop: 4,
                        lineHeight: 1.35,
                      }}
                    >
                      Draw the light background grid on the 2D canvas (on by default).
                    </span>
                  </span>
                  <div style={{ ...controlStyle, paddingTop: 2 }}>
                    <BoolSwitch
                      checked={g.showGrid !== false}
                      onToggle={() => updateGeneral({ showGrid: g.showGrid === false })}
                      ariaLabel="Show background grid"
                    />
                  </div>
                </div>
                <div style={{ ...rowStyle, alignItems: 'flex-start' }}>
                  <span style={labelStyle}>
                    Touch: one-finger pan on empty canvas
                    <span
                      style={{
                        display: 'block',
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        fontWeight: 400,
                        marginTop: 4,
                        lineHeight: 1.35,
                      }}
                    >
                      With the Select tool, dragging one finger on empty canvas pans the view
                      instead of drawing a selection box. Off by default: pan with two fingers
                      or the Hand tool, pinch to zoom, two-finger tap to undo, three-finger tap
                      to redo.
                    </span>
                  </span>
                  <div style={{ ...controlStyle, paddingTop: 2 }}>
                    <BoolSwitch
                      checked={g.touchPanOnEmptyCanvas === true}
                      onToggle={() =>
                        updateGeneral({ touchPanOnEmptyCanvas: g.touchPanOnEmptyCanvas !== true })
                      }
                      ariaLabel="Touch: one-finger pan on empty canvas"
                    />
                  </div>
                </div>
                <div style={{ ...rowStyle, alignItems: 'flex-start' }}>
                  <span style={labelStyle}>
                    Touch: magnifier while drawing
                    <span
                      style={{
                        display: 'block',
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        fontWeight: 400,
                        marginTop: 4,
                        lineHeight: 1.35,
                      }}
                    >
                      Shows a 2× loupe above the fingertip while dragging a bond, ring or chain
                      or resting on an atom, so the finger does not hide what it is pointing at.
                    </span>
                  </span>
                  <div style={{ ...controlStyle, paddingTop: 2 }}>
                    <BoolSwitch
                      checked={g.touchLoupe !== false}
                      onToggle={() => updateGeneral({ touchLoupe: g.touchLoupe === false })}
                      ariaLabel="Touch: magnifier while drawing"
                    />
                  </div>
                </div>
                <div style={{ ...rowStyle, alignItems: 'flex-start' }}>
                  <span style={labelStyle}>
                    Pointer debug overlay
                    <span
                      style={{
                        display: 'block',
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        fontWeight: 400,
                        marginTop: 4,
                        lineHeight: 1.35,
                      }}
                    >
                      Developer aid for checking pens and touch screens: shows the last pointer's
                      type, pressure, tilt, buttons, contact size and gesture state on the canvas.
                    </span>
                  </span>
                  <div style={{ ...controlStyle, paddingTop: 2 }}>
                    <BoolSwitch
                      checked={g.pointerDebugHud === true}
                      onToggle={() => updateGeneral({ pointerDebugHud: g.pointerDebugHud !== true })}
                      ariaLabel="Pointer debug overlay"
                    />
                  </div>
                </div>
                <div style={rowStyle}>
                  <span style={labelStyle}>Reaction component margin size</span>
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
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>pt</span>
                  </div>
                </div>
                <div style={{ ...rowStyle, borderBottom: 'none' }}>
                  <span style={labelStyle}>Image resolution</span>
                  <div style={{ ...controlStyle, gap: 10 }}>
                    <span
                      title="Applies to white PNG, JPEG, and PDF. Transparent PNG and SVG stay 1× so atom labels match Font size."
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        border: '1px solid #94a3b8',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 11,
                        fontWeight: 700,
                        color: 'var(--text-muted)',
                      }}
                    >
                      i
                    </span>
                    <select
                      value={g.imageResolution}
                      onChange={e =>
                        updateGeneral({ imageResolution: e.target.value as ImageResolutionPreset })
                      }
                      style={{ ...inputNumStyle, width: 180, textAlign: 'left' }}
                    >
                      {RESOLUTION_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </>
            ) : null}

            {activeCategory === 'style' ? (
              <>
                <div style={{ ...rowStyle, alignItems: 'flex-start' }}>
                  <span style={labelStyle}>
                    Structure theme
                    <span
                      style={{
                        display: 'block',
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        fontWeight: 400,
                        marginTop: 4,
                        lineHeight: 1.35,
                      }}
                    >
                      Default (skeletal) or Simple (ball-and-stick). Same as Style → Theme and
                      molecule.setStructureTheme.
                    </span>
                  </span>
                  <div style={controlStyle}>
                    <select
                      value={g.structureThemeId}
                      onChange={e => {
                        const next = structureThemes.find(t => t.id === e.target.value);
                        if (!next) return;
                        updateGeneral({
                          structureThemeId: next.id,
                          structureDrawMode: next.drawMode,
                        });
                        onStructureThemeChange?.(next.id, next.drawMode);
                      }}
                      style={{ ...inputNumStyle, width: 160, textAlign: 'left' }}
                      aria-label="Structure theme"
                    >
                      {structureThemes.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div style={rowStyle}>
                  <span style={labelStyle}>Font</span>
                  <div style={controlStyle}>
                    <select
                      value={g.fontFamily}
                      onChange={e => updateGeneral({ fontFamily: e.target.value })}
                      style={{ ...inputNumStyle, width: 160, textAlign: 'left' }}
                    >
                      {CANVAS_FONT_FAMILIES.map(f => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div style={{ ...rowStyle, alignItems: 'flex-start' }}>
                  <span style={labelStyle}>
                    Bold atom labels
                    <span
                      style={{
                        display: 'block',
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        fontWeight: 400,
                        marginTop: 4,
                        lineHeight: 1.35,
                      }}
                    >
                      Off by default. When on, element and group labels (N, OH, NH₂, …) render bold.
                    </span>
                  </span>
                  <div style={{ ...controlStyle, paddingTop: 2 }}>
                    <BoolSwitch
                      checked={g.boldAtomLabels}
                      onToggle={() => updateGeneral({ boldAtomLabels: !g.boldAtomLabels })}
                      ariaLabel="Bold atom and group labels on the canvas"
                    />
                  </div>
                </div>
                <div style={rowStyle}>
                  <span style={labelStyle}>
                    Font size
                    <span
                      style={{
                        display: 'block',
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        fontWeight: 400,
                        marginTop: 4,
                        lineHeight: 1.35,
                      }}
                    >
                      CSS pixels at zoom 1. Transparent PNG and SVG use this size (20 = 20px Times New Roman).
                    </span>
                  </span>
                  <div style={controlStyle}>
                    <input
                      type="number"
                      min={6}
                      max={36}
                      step={0.5}
                      value={g.fontSizePt}
                      onChange={e => updateGeneral({ fontSizePt: Number(e.target.value) })}
                      style={inputNumStyle}
                    />
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>px</span>
                  </div>
                </div>
                <div style={rowStyle}>
                  <span style={labelStyle}>Sub font size</span>
                  <div style={controlStyle}>
                    <input
                      type="number"
                      min={6}
                      max={36}
                      step={0.5}
                      value={g.subFontSizePt}
                      onChange={e => updateGeneral({ subFontSizePt: Number(e.target.value) })}
                      style={inputNumStyle}
                    />
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>px</span>
                  </div>
                </div>
                <div style={rowStyle}>
                  <span style={labelStyle}>Bond length</span>
                  <div style={controlStyle}>
                    <input
                      type="number"
                      min={24}
                      max={80}
                      step={1}
                      value={b.bondLengthPx}
                      onChange={e => updateBonds({ bondLengthPx: Number(e.target.value) })}
                      style={inputNumStyle}
                    />
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>px</span>
                  </div>
                </div>
                <div style={rowStyle}>
                  <span style={labelStyle}>Bond spacing</span>
                  <div style={controlStyle}>
                    <input
                      type="number"
                      min={4}
                      max={45}
                      step={1}
                      value={b.bondSpacingPercent}
                      onChange={e => updateBonds({ bondSpacingPercent: Number(e.target.value) })}
                      style={inputNumStyle}
                    />
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      % of length
                    </span>
                  </div>
                </div>
                <div style={rowStyle}>
                  <span style={labelStyle}>Bond thickness</span>
                  <div style={controlStyle}>
                    <input
                      type="number"
                      min={1}
                      max={14}
                      step={0.5}
                      value={b.bondThicknessPx}
                      onChange={e => updateBonds({ bondThicknessPx: Number(e.target.value) })}
                      style={inputNumStyle}
                    />
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>px</span>
                  </div>
                </div>
                <div style={rowStyle}>
                  <span style={labelStyle}>Stereo (Wedge) bond width</span>
                  <div style={controlStyle}>
                    <input
                      type="number"
                      min={2}
                      max={24}
                      step={0.5}
                      value={b.stereoWedgeWidthPx}
                      onChange={e => updateBonds({ stereoWedgeWidthPx: Number(e.target.value) })}
                      style={inputNumStyle}
                    />
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>px</span>
                  </div>
                </div>
                <div style={{ ...rowStyle, borderBottom: 'none' }}>
                  <span style={labelStyle}>Hash spacing</span>
                  <div style={controlStyle}>
                    <input
                      type="number"
                      min={0.5}
                      max={14}
                      step={0.1}
                      value={b.hashSpacingPx}
                      onChange={e => updateBonds({ hashSpacingPx: Number(e.target.value) })}
                      style={inputNumStyle}
                    />
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>px</span>
                  </div>
                </div>
              </>
            ) : null}

            {activeCategory === 'bonds' ? (
              <>
                <div style={{ ...rowStyle, borderBottom: 'none' }}>
                  <span style={labelStyle}>
                    Bond angle snap
                    <span
                      style={{
                        display: 'block',
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        fontWeight: 400,
                        marginTop: 4,
                        lineHeight: 1.35,
                      }}
                    >
                      New bonds and rings snap to this increment (15° = RSC style, 30° = ACS / Nature).
                    </span>
                  </span>
                  <div style={controlStyle}>
                    <input
                      type="number"
                      min={5}
                      max={45}
                      step={1}
                      value={b.bondAngleSnapDeg}
                      onChange={e => updateBonds({ bondAngleSnapDeg: Number(e.target.value) })}
                      style={inputNumStyle}
                    />
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>°</span>
                  </div>
                </div>
              </>
            ) : null}

            {activeCategory === 'plugins' ? <PluginsSettingsPanel /> : null}

            {activeCategory === 'ai' ? (
              <>
                <p
                  style={{
                    margin: '0 0 12px',
                    fontSize: 12,
                    color: 'var(--text-muted)',
                    lineHeight: 1.5,
                  }}
                >
                  Chat uses Google Gemini with your API key stored only in this browser (
                  <code style={{ fontSize: 11 }}>localStorage</code>). Get a key from{' '}
                  <a
                    href="https://aistudio.google.com/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#0d9488' }}
                  >
                    Google AI Studio
                  </a>
                  .
                </p>
                <div style={rowStyle}>
                  <span style={labelStyle}>Gemini model</span>
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
                        minWidth: 200,
                        textAlign: 'left',
                      }}
                    >
                      {MOLDRAW_CHAT_MODELS.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.displayName}
                          {m.hint ? ` — ${m.hint}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <p
                  style={{
                    margin: '0 0 12px',
                    fontSize: 11,
                    color: 'var(--text-muted)',
                    lineHeight: 1.45,
                  }}
                >
                  Use <strong>3.1 Pro</strong> for reaction schemes — it produces more accurate SMILES
                  for the canvas. Flash is faster for simple draws.
                </p>
                <div style={rowStyle}>
                  <span style={labelStyle}>Gemini API key</span>
                  <div style={{ ...controlStyle, flexDirection: 'column', alignItems: 'stretch' }}>
                    <input
                      type="password"
                      autoComplete="off"
                      value={geminiKeyDraft}
                      onChange={e => setGeminiKeyDraft(e.target.value)}
                      placeholder="AIza…"
                      style={{
                        ...inputNumStyle,
                        width: '100%',
                        minWidth: 200,
                        textAlign: 'left',
                      }}
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
                    Save key
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
                    Clear
                  </button>
                </div>

                <h4 style={{ margin: '20px 0 6px', fontSize: 12, color: 'var(--text-main)' }}>
                  Local session bridge (MCP agents → this canvas)
                </h4>
                <p
                  style={{
                    margin: '0 0 8px',
                    fontSize: 11,
                    color: 'var(--text-muted)',
                    lineHeight: 1.45,
                  }}
                >
                  Run <code style={{ fontSize: 11 }}>npm run api</code> in the repo, turn this on, and start
                  the MCP server with <code style={{ fontSize: 11 }}>MOLDRAW_SESSION_URL</code> set to the
                  same address. Cursor / Claude edits then appear here live and share this undo history.
                  Loopback addresses only.
                </p>
                <div style={rowStyle}>
                  <span style={labelStyle}>Connect to local session</span>
                  <div style={controlStyle}>
                    <BoolSwitch
                      checked={g.localSessionEnabled === true}
                      onToggle={() => updateGeneral({ localSessionEnabled: g.localSessionEnabled !== true })}
                      ariaLabel="Connect to local session"
                    />
                  </div>
                </div>
                <div style={rowStyle}>
                  <span style={labelStyle}>Session URL</span>
                  <div style={controlStyle}>
                    <input
                      type="text"
                      value={g.localSessionUrl ?? 'http://127.0.0.1:8787'}
                      onChange={e => updateGeneral({ localSessionUrl: e.target.value })}
                      spellCheck={false}
                      style={{ ...inputNumStyle, width: 220, textAlign: 'left' }}
                    />
                  </div>
                </div>
                <div style={{ ...rowStyle, borderBottom: 'none' }}>
                  <span style={labelStyle}>Status</span>
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
                        ? `connected · revision ${localSession.revision} · ${localSession.remoteChanges} remote change(s)`
                        : localSession?.status === 'connecting'
                          ? 'connecting…'
                          : localSession?.status === 'error'
                            ? localSession.error ?? 'error'
                            : 'off'}
                    </span>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
  );

  if (isCompact) {
    return (
      <MobileBottomSheet
        open={open}
        onClose={onClose}
        title="Settings"
        size="tall"
        className="mobile-sheet--settings"
      >
        {settingsInner}
      </MobileBottomSheet>
    );
  }

  return (
    <div
      className="app-settings-modal"
      role="dialog"
      aria-modal="true"
      aria-label="App settings"
      onMouseDown={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.16)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        zIndex: 9999,
      }}
    >
      {settingsInner}
    </div>
  );
}
