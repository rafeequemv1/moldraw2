import { detectBrowserUiLanguage } from '../i18n';
import { DEFAULT_APP_SETTINGS } from './defaults';
import type { AppSettings } from './types';

function settingsForFirstVisit(): AppSettings {
  return {
    ...DEFAULT_APP_SETTINGS,
    general: {
      ...DEFAULT_APP_SETTINGS.general,
      uiLanguage: detectBrowserUiLanguage(),
    },
  };
}

const STORAGE_KEY = 'moldraw-app-settings-v1';
/** Bumped when a one-shot default migration must run for existing localStorage. */
const SETTINGS_SCHEMA_VERSION = 13;
const SCHEMA_VERSION_KEY = 'moldraw-app-settings-schema';

function deepMerge<T extends Record<string, unknown>>(base: T, patch: Partial<T>): T {
  const out = { ...base };
  for (const k of Object.keys(patch) as (keyof T)[]) {
    const pv = patch[k];
    if (pv === undefined) continue;
    const bv = base[k];
    if (bv !== null && typeof bv === 'object' && !Array.isArray(bv) && typeof pv === 'object' && pv !== null && !Array.isArray(pv)) {
      out[k] = deepMerge(bv as Record<string, unknown>, pv as Record<string, unknown>) as T[keyof T];
    } else {
      out[k] = pv as T[keyof T];
    }
  }
  return out;
}

export function loadAppSettings(): AppSettings {
  if (typeof window === 'undefined') return DEFAULT_APP_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return settingsForFirstVisit();
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    const merged = deepMerge(
      DEFAULT_APP_SETTINGS as unknown as Record<string, unknown>,
      parsed as Record<string, unknown>,
    ) as unknown as AppSettings;

    // Older builds defaulted "Color bonds to heteroatoms" to on; force the new
    // product default (off) once for existing saved settings.
    const schemaRaw = window.localStorage.getItem(SCHEMA_VERSION_KEY);
    const schema = schemaRaw ? Number(schemaRaw) : 0;
    if (!Number.isFinite(schema) || schema < SETTINGS_SCHEMA_VERSION) {
      const nextGeneral = { ...merged.general, applyAtomColorsToBonds: false, boldAtomLabels: false };
      // One-shot: previous default was 20/18 pt-as-px; later default was 16/13 CSS px.
      if (schema < 3) {
        if (nextGeneral.fontSizePt === 20) nextGeneral.fontSizePt = 16;
        if (nextGeneral.subFontSizePt === 18) nextGeneral.subFontSizePt = 13;
      }
      // One-shot: Indigo accelerator is on for everyone at startup.
      if (schema < 4) {
        nextGeneral.preferIndigo2d = true;
      }
      // One-shot: screenshot Style defaults (Arial 20/16, 45 px bonds, 35% gap).
      if (schema < 6) {
        nextGeneral.fontFamily = 'Arial';
        nextGeneral.boldAtomLabels = false;
        nextGeneral.fontSizePt = 20;
        nextGeneral.subFontSizePt = 16;
        nextGeneral.reactionComponentMarginPt = 1.6;
        nextGeneral.imageResolution = 'high';
        merged.bonds = {
          ...merged.bonds,
          bondLengthPx: 45,
          bondSpacingPercent: 35,
          bondThicknessPx: 2,
          stereoWedgeWidthPx: 10,
          hashSpacingPx: 3.5,
          bondAngleSnapDeg: 30,
        };
      }
      // One-shot: Times New Roman is the editor default (keep a user-picked other font).
      if (schema < 7 && (nextGeneral.fontFamily === 'Arial' || !nextGeneral.fontFamily)) {
        nextGeneral.fontFamily = 'Times New Roman';
      }
      // One-shot: thinner skeletal singles (old screenshot default was 2).
      if (schema < 8 && merged.bonds.bondThicknessPx === 2) {
        merged.bonds = { ...merged.bonds, bondThicknessPx: 1 };
      }
      // One-shot: uniform round singles at 2 px (schema 8 had forced 1).
      if (schema < 9 && merged.bonds.bondThicknessPx === 1) {
        merged.bonds = { ...merged.bonds, bondThicknessPx: 2 };
      }
      // One-shot: background grid on (older saves may have turned it off).
      if (schema < 10) {
        nextGeneral.showGrid = true;
      }
      // One-shot: line grid only (older saves used a dotted pattern).
      if (schema < 12) {
        nextGeneral.showGrid = true;
        delete (nextGeneral as { gridPattern?: unknown }).gridPattern;
      }
      // Grid off by default (schema 12 had forced it on).
      if (schema < 13) {
        nextGeneral.showGrid = false;
      }
      merged.general = nextGeneral;
      window.localStorage.setItem(SCHEMA_VERSION_KEY, String(SETTINGS_SCHEMA_VERSION));
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      } catch {
        // ignore quota
      }
    }
    return merged;
  } catch {
    return DEFAULT_APP_SETTINGS;
  }
}

export function saveAppSettings(settings: AppSettings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore quota / private mode
  }
}
