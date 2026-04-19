import { useState, useCallback, type FormEvent } from 'react';
import { useTheme } from '@/theme';
import { useFrameStore } from '@/store/store';
import { createEmptyDashboard } from '@shared/types/dashboard';
import * as s from './Header.css';

const DEFAULT_AUTHOR = 'clone45';

export function Header() {
  const { theme, setTheme, availableThemes } = useTheme();
  const setActiveDashboard = useFrameStore((st) => st.setActiveDashboard);

  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('');

  const nextTheme = () => {
    const idx = availableThemes.indexOf(theme);
    const next = availableThemes[(idx + 1) % availableThemes.length];
    setTheme(next);
  };

  const handleOpenForm = useCallback(() => {
    setName('');
    setFormOpen(true);
  }, []);

  const handleCancel = useCallback(() => {
    setName('');
    setFormOpen(false);
  }, []);

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const trimmed = name.trim();
      if (!trimmed) return;
      setActiveDashboard(createEmptyDashboard(trimmed, DEFAULT_AUTHOR));
      setName('');
      setFormOpen(false);
    },
    [name, setActiveDashboard]
  );

  return (
    <header className={s.header}>
      <span className={s.title}>omnidash</span>
      <div className={s.actions}>
        <button
          className={s.themeButton}
          onClick={handleOpenForm}
          aria-label="New dashboard"
        >
          + New dashboard
        </button>
        <button className={s.themeButton} onClick={nextTheme} aria-label="Toggle theme">
          {theme}
        </button>
      </div>
      {formOpen && (
        <form className={s.newDashboardForm} onSubmit={handleSubmit} role="dialog" aria-label="Create new dashboard">
          <input
            className={s.newDashboardInput}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Dashboard name"
            aria-label="Dashboard name"
            autoFocus
          />
          <button
            className={s.themeButton}
            type="submit"
            disabled={!name.trim()}
            aria-label="Create dashboard"
          >
            Create
          </button>
          <button
            className={s.themeButton}
            type="button"
            onClick={handleCancel}
            aria-label="Cancel"
          >
            Cancel
          </button>
        </form>
      )}
    </header>
  );
}
