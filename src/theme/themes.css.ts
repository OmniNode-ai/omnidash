import { createGlobalTheme } from '@vanilla-extract/css';
import { vars } from './tokens.css';

// Dark theme (default)
createGlobalTheme('.theme-dark', vars, {
  color: {
    background: '220 15% 12%',
    foreground: '210 20% 92%',
    card: '220 15% 15%',
    border: '220 10% 22%',
    primary: '217 91% 60%',
    muted: '220 10% 40%',
    accent: '263 70% 58%',
    destructive: '0 84% 60%',
    statusHealthy: '142 71% 45%',
    statusWarning: '38 92% 50%',
    statusError: '0 84% 60%',
    chart1: '217 91% 60%',
    chart2: '263 70% 58%',
    chart3: '142 71% 45%',
    chart4: '38 92% 50%',
    chart5: '0 84% 60%',
    chart6: '199 89% 48%',
    chart7: '326 80% 60%',
  },
  radius: {
    sm: '0.25rem',
    md: '0.5rem',
    lg: '0.75rem',
  },
});

// Light theme
createGlobalTheme('.theme-light', vars, {
  color: {
    background: '0 0% 100%',
    foreground: '220 15% 12%',
    card: '0 0% 98%',
    border: '220 10% 85%',
    primary: '217 91% 50%',
    muted: '220 10% 60%',
    accent: '263 70% 50%',
    destructive: '0 84% 50%',
    statusHealthy: '142 71% 35%',
    statusWarning: '38 92% 45%',
    statusError: '0 84% 50%',
    chart1: '217 91% 50%',
    chart2: '263 70% 50%',
    chart3: '142 71% 35%',
    chart4: '38 92% 45%',
    chart5: '0 84% 50%',
    chart6: '199 89% 40%',
    chart7: '326 80% 50%',
  },
  radius: {
    sm: '0.25rem',
    md: '0.5rem',
    lg: '0.75rem',
  },
});

// Body-level styles moved entirely to src/styles/globals.css where they use
// the prototype's OKLCH tokens. The vanilla-extract theme layer here only
// defines theme variables; it does not paint body. [OMN-47 follow-up]
