import { useTheme } from '@/theme';
import * as s from './Header.css';

export function Header() {
  const { theme, setTheme, availableThemes } = useTheme();

  const nextTheme = () => {
    const idx = availableThemes.indexOf(theme);
    const next = availableThemes[(idx + 1) % availableThemes.length];
    setTheme(next);
  };

  return (
    <header className={s.header}>
      <span className={s.title}>omnidash</span>
      <div className={s.actions}>
        <button className={s.themeButton} onClick={nextTheme} aria-label="Toggle theme">
          {theme}
        </button>
      </div>
    </header>
  );
}
