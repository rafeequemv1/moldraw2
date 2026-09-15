import { Moon, MoonStar, Sun } from 'lucide-react';
import { useI18n } from '../i18n';
import { nextToggledUiTheme, type UiThemeId } from '../theme';

function themeToggleCopy(theme: UiThemeId): 'topBar.switchToElegantDark' | 'topBar.switchToInkDark' | 'topBar.switchToLight' {
  if (theme === 'light') return 'topBar.switchToElegantDark';
  if (theme === 'elegant-dark') return 'topBar.switchToInkDark';
  return 'topBar.switchToLight';
}

export function ThemeToggleButton({
  theme,
  onChangeTheme,
}: {
  theme: UiThemeId;
  onChangeTheme: (theme: UiThemeId) => void;
}) {
  const { t } = useI18n();
  const label = t(themeToggleCopy(theme));

  return (
    <button
      type="button"
      className="tb-btn tb-btn-theme-toggle"
      title={label}
      aria-label={label}
      onClick={() => onChangeTheme(nextToggledUiTheme(theme))}
    >
      {theme === 'light' ? <Sun size={14} strokeWidth={2} aria-hidden /> : null}
      {theme === 'elegant-dark' ? <Moon size={14} strokeWidth={2} aria-hidden /> : null}
      {theme === 'ink-dark' ? <MoonStar size={14} strokeWidth={2} aria-hidden /> : null}
    </button>
  );
}
