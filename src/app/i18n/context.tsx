import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { de } from './locales/de';
import { en, type LocaleMessages } from './locales/en';
import { ja } from './locales/ja';
import { zh } from './locales/zh';

export const UI_LANGUAGES = [
  { id: 'en' as const, labelKey: 'settings.languageEn' as const },
  { id: 'de' as const, labelKey: 'settings.languageDe' as const },
  { id: 'ja' as const, labelKey: 'settings.languageJa' as const },
  { id: 'zh' as const, labelKey: 'settings.languageZh' as const },
];

export type UiLanguage = (typeof UI_LANGUAGES)[number]['id'];

const LOCALES: Record<UiLanguage, LocaleMessages> = { en, de, ja, zh };

export function resolveUiLanguage(raw: string | undefined): UiLanguage {
  if (raw === 'de') return 'de';
  if (raw === 'ja') return 'ja';
  if (raw === 'zh' || raw === 'zh-CN' || raw === 'zh-Hans') return 'zh';
  return 'en';
}

/** Match browser locale on first visit (no saved settings yet). */
export function detectBrowserUiLanguage(): UiLanguage {
  if (typeof navigator === 'undefined') return 'en';
  const lang = (navigator.language ?? '').toLowerCase();
  if (lang.startsWith('zh')) return 'zh';
  if (lang.startsWith('de')) return 'de';
  if (lang.startsWith('ja')) return 'ja';
  return 'en';
}

function getByPath(obj: LocaleMessages, path: string): string | undefined {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

export function translate(
  lang: UiLanguage,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const table = LOCALES[lang] ?? en;
  let text = getByPath(table, key) ?? getByPath(en, key) ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replaceAll(`{{${k}}}`, String(v));
    }
  }
  return text;
}

type I18nContextValue = {
  language: UiLanguage;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  language,
  children,
}: {
  language: UiLanguage;
  children: ReactNode;
}) {
  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(language, key, vars),
    [language],
  );
  const value = useMemo(() => ({ language, t }), [language, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    return {
      language: 'en',
      t: (key, vars) => translate('en', key, vars),
    };
  }
  return ctx;
}

/** @deprecated Use `useI18n().t` or `translate()`. */
export function t(lang: UiLanguage, key: string, vars?: Record<string, string | number>): string {
  return translate(lang, key, vars);
}
