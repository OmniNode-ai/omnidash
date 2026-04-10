import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { ThemeProvider, useTheme } from './ThemeProvider';

function ThemeConsumer() {
  const { theme, setTheme, availableThemes } = useTheme();
  return (
    <div>
      <span data-testid="current-theme">{theme}</span>
      <span data-testid="theme-count">{availableThemes.length}</span>
      <button onClick={() => setTheme('light')}>Set Light</button>
    </div>
  );
}

describe('ThemeProvider', () => {
  it('defaults to dark theme', () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );
    expect(screen.getByTestId('current-theme').textContent).toBe('dark');
  });

  it('has at least 2 built-in themes', () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );
    expect(Number(screen.getByTestId('theme-count').textContent)).toBeGreaterThanOrEqual(2);
  });

  it('switches theme on setTheme', async () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );
    await userEvent.click(screen.getByText('Set Light'));
    expect(screen.getByTestId('current-theme').textContent).toBe('light');
  });
});
