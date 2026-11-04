/**
 * OMN-22168 AC6: the frame every design-system story draws in. It loads the stylesheets the local pages load, so a
 * component looks as it does on its page, and builds each story's Light and Dark exports: the themes addon forces the
 * theme (themeOverride), so both are always shown, whatever the toolbar says. Each story file declares its own Light and
 * Dark exports, which the coverage scorecard reads.
 */
import type { ReactNode } from 'react';
import '@/styles/local-dashboard.css';
import '@/styles/dashboard-cards.css';
import '@/styles/seven-page-design.css';
import '@/styles/editorial.css';

export function StorySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 'var(--ds-gap)' }} aria-label={title}>
      <h2 className="local-dashboard-caption">{title}</h2>
      {children}
    </section>
  );
}

export function StoryPage({ children }: { children: ReactNode }) {
  return (
    <div className="local-dashboard-page" style={{ background: 'var(--ds-page)', color: 'var(--ds-ink)', padding: 24, minHeight: '100vh' }}>
      {children}
    </div>
  );
}
