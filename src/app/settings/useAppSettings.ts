import { useCallback, useMemo, useState } from 'react';
import { resolveCanvasPreferences } from '@moldraw/core/canvasPreferences';
import { DEFAULT_APP_SETTINGS } from './defaults';
import { loadAppSettings, saveAppSettings } from './storage';
import type { ShortcutBindingsMap } from '../keyboard/shortcutBindings';
import type { AppSettings, BondsSettings, GeneralSettings } from './types';

export function useAppSettings() {
  const [settings, setSettingsState] = useState<AppSettings>(() => loadAppSettings());

  const setSettings = useCallback((updater: AppSettings | ((prev: AppSettings) => AppSettings)) => {
    setSettingsState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveAppSettings(next);
      return next;
    });
  }, []);

  const updateGeneral = useCallback(
    (patch: Partial<GeneralSettings>) => {
      setSettings(prev => ({ ...prev, general: { ...prev.general, ...patch } }));
    },
    [setSettings],
  );

  const updateBonds = useCallback(
    (patch: Partial<BondsSettings>) => {
      setSettings(prev => ({ ...prev, bonds: { ...prev.bonds, ...patch } }));
    },
    [setSettings],
  );

  const updateShortcutBindings = useCallback(
    (bindings: ShortcutBindingsMap) => {
      setSettings(prev => ({
        ...prev,
        shortcuts: { ...(prev.shortcuts ?? {}), bindings },
      }));
    },
    [setSettings],
  );

  const resetShortcutBindings = useCallback(() => {
    setSettings(prev => ({
      ...prev,
      shortcuts: { ...(prev.shortcuts ?? {}), bindings: {} },
    }));
  }, [setSettings]);

  const resetToDefaults = useCallback(() => {
    setSettings({
      ...DEFAULT_APP_SETTINGS,
      general: { ...DEFAULT_APP_SETTINGS.general },
      bonds: { ...DEFAULT_APP_SETTINGS.bonds },
      shortcuts: { bindings: {} },
      lastPresetId: 'default',
    });
  }, [setSettings]);

  const resolvedCanvasPreferences = useMemo(() => resolveCanvasPreferences(settings), [settings]);

  return {
    settings,
    setSettings,
    updateGeneral,
    updateBonds,
    updateShortcutBindings,
    resetShortcutBindings,
    resetToDefaults,
    resolvedCanvasPreferences,
  };
}
