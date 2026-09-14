import type { AppSettings } from './types';
import { DEFAULT_APP_SETTINGS } from './defaults';

/**
 * Publication-style drawing presets.
 *
 * Journal metrics match ChemDraw document settings (points), then scaled for
 * interactive screen editing so ACS fixed length (~14.4 pt) lands near ~42 px
 * while keeping relative bond thickness / bold / hash / font proportions.
 *
 * Sources:
 * - ACS Document 1996 / ACS graphics prep (fixed length 14.4 pt, line 0.6,
 *   bold 2.0, hash 2.5, margin 1.6, spacing 18%, Arial/Helvetica 10 pt)
 * - RSC / Wiley-style sheets used for RSC & Beilstein-like rows
 * - Nature: compact length + ACS-like line weights
 */
export type AppSettingsPresetId =
  | 'default'
  | 'acs_1996'
  | 'frontiers'
  | 'beilstein'
  | 'rsc'
  | 'nature';

export type AppSettingsPreset = {
  id: AppSettingsPresetId;
  label: string;
  description?: string;
  settings: AppSettings;
};

/** CSS px per ChemDraw point at 96 dpi (1 pt = 1/72 in). */
const PT_TO_PX = 96 / 72;

/**
 * Scale ChemDraw print points onto the editor canvas.
 * ACS 14.4 pt × PT_TO_PX × EDIT_SCALE ≈ 42 px bond length.
 */
const EDIT_SCALE = 42 / (14.4 * PT_TO_PX);

function journalFromChemDraw(doc: {
  lengthPt: number;
  spacePct: number;
  lineWidthPt: number;
  boldWidthPt: number;
  marginPt: number;
  hashSpacingPt: number;
  snapDeg: number;
  fontSizePt: number;
  fontFamily?: string;
  generalOverrides?: Partial<AppSettings['general']>;
}): AppSettings {
  const px = (pt: number) => pt * PT_TO_PX * EDIT_SCALE;
  const g = DEFAULT_APP_SETTINGS.general;
  // Same screen scale as bonds so font/bond ratio matches the canvas (and ChemDraw).
  const fontSizePt = Math.round(px(doc.fontSizePt) * 10) / 10;
  const subFontSizePt = Math.max(6, Math.round(fontSizePt * 0.8 * 10) / 10);
  return {
    general: {
      ...g,
      fontFamily: doc.fontFamily ?? 'Arial',
      fontSizePt,
      subFontSizePt,
      // Reaction margins stay in pt (canvas prefs consume pt directly).
      reactionComponentMarginPt: Math.round(doc.marginPt * EDIT_SCALE * 10) / 10,
      ...doc.generalOverrides,
    },
    bonds: {
      bondLengthPx: Math.round(px(doc.lengthPt) * 10) / 10,
      bondSpacingPercent: doc.spacePct,
      bondThicknessPx: Math.max(0.75, Math.round(px(doc.lineWidthPt) * 100) / 100),
      stereoWedgeWidthPx: Math.round(px(doc.boldWidthPt) * 10) / 10,
      hashSpacingPx: Math.round(px(doc.hashSpacingPt) * 10) / 10,
      bondAngleSnapDeg: doc.snapDeg,
    },
  };
}

export const APP_SETTINGS_PRESETS: readonly AppSettingsPreset[] = [
  {
    id: 'default',
    label: 'Balanced (screen)',
    description: 'Default editor lengths and typography — 20px Times New Roman, bold off (not a journal sheet).',
    settings: DEFAULT_APP_SETTINGS,
  },
  {
    id: 'acs_1996',
    label: 'ACS 1996',
    description:
      'ACS Document 1996 — 14.4 pt bonds, 0.6/2.0 pt line/bold, 18% spacing, Arial 10 pt (screen-scaled to match canvas).',
    settings: journalFromChemDraw({
      lengthPt: 14.4,
      spacePct: 18,
      lineWidthPt: 0.6,
      boldWidthPt: 2.0,
      marginPt: 1.6,
      hashSpacingPt: 2.5,
      snapDeg: 30,
      fontSizePt: 10,
    }),
  },
  {
    id: 'frontiers',
    label: 'Frontiers',
    description: 'ACS geometry with slightly larger atom labels for on-screen readability.',
    settings: journalFromChemDraw({
      lengthPt: 14.4,
      spacePct: 18,
      lineWidthPt: 0.6,
      boldWidthPt: 2.0,
      marginPt: 1.6,
      hashSpacingPt: 2.5,
      snapDeg: 30,
      fontSizePt: 11,
    }),
  },
  {
    id: 'beilstein',
    label: 'Beilstein',
    description: 'Wiley / Beilstein-like sheet — ~17 pt bonds, thicker bold wedges, Arial 10 pt.',
    settings: journalFromChemDraw({
      lengthPt: 17,
      spacePct: 18,
      lineWidthPt: 0.75,
      boldWidthPt: 2.5,
      marginPt: 2,
      hashSpacingPt: 2.6,
      snapDeg: 30,
      fontSizePt: 10,
    }),
  },
  {
    id: 'rsc',
    label: 'RSC / Chem Soc',
    description: 'RSC-style — shorter bonds, thinner strokes, 15° angle snap, Arial 10 pt.',
    settings: journalFromChemDraw({
      lengthPt: 12.2,
      spacePct: 20,
      lineWidthPt: 0.45,
      boldWidthPt: 1.6,
      marginPt: 1.6,
      hashSpacingPt: 2.0,
      snapDeg: 15,
      fontSizePt: 10,
    }),
  },
  {
    id: 'nature',
    label: 'Nature',
    description: 'Compact figure sheet — shorter bonds than ACS, ACS-like line weights, Arial 8 pt.',
    settings: journalFromChemDraw({
      lengthPt: 12,
      spacePct: 18,
      lineWidthPt: 0.6,
      boldWidthPt: 1.8,
      marginPt: 1.4,
      hashSpacingPt: 2.2,
      snapDeg: 30,
      fontSizePt: 8,
    }),
  },
];

export const getAppSettingsPreset = (id: AppSettingsPresetId): AppSettingsPreset =>
  APP_SETTINGS_PRESETS.find(p => p.id === id) ?? APP_SETTINGS_PRESETS[0];
