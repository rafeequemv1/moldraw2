import type { BondsSettings, GeneralSettings } from './types';

/** Per-design style overrides when "Canvas default" is off. */
export type DocumentStyleOverrides = {
  general?: Partial<
    Pick<
      GeneralSettings,
      | 'structureThemeId'
      | 'structureDrawMode'
      | 'fontFamily'
      | 'fontSizePt'
      | 'subFontSizePt'
      | 'boldAtomLabels'
      | 'showGrid'
      | 'gridPattern'
    >
  >;
  bonds?: Partial<BondsSettings>;
};

export type DocumentStyleByTabId = Record<string, DocumentStyleOverrides>;

export function mergeDocumentStyle(
  prev: DocumentStyleOverrides | undefined,
  patch: DocumentStyleOverrides,
): DocumentStyleOverrides {
  return {
    general: patch.general ? { ...prev?.general, ...patch.general } : prev?.general,
    bonds: patch.bonds ? { ...prev?.bonds, ...patch.bonds } : prev?.bonds,
  };
}

export function mergeGeneralForDocument(
  base: GeneralSettings,
  overrides: DocumentStyleOverrides | undefined,
  moleculeTheme?: Pick<GeneralSettings, 'structureThemeId' | 'structureDrawMode'>,
): GeneralSettings {
  const merged = overrides?.general ? { ...base, ...overrides.general } : { ...base };
  if (moleculeTheme?.structureThemeId) merged.structureThemeId = moleculeTheme.structureThemeId;
  if (moleculeTheme?.structureDrawMode) merged.structureDrawMode = moleculeTheme.structureDrawMode;
  return merged;
}

export function mergeBondsForDocument(
  base: BondsSettings,
  overrides: DocumentStyleOverrides | undefined,
): BondsSettings {
  return overrides?.bonds ? { ...base, ...overrides.bonds } : { ...base };
}
