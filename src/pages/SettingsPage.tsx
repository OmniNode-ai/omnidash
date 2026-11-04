import { useEffect, useState } from 'react';
import { ConceptIcon } from '@/components/dashboard/FieldIcon';
import { DestinationIcon } from '@/navigation/destination-icons';
import { LocalDashboardPage, type LocalDashboardCache } from './LocalDashboardPage';

// OMN-21970 AC10 (Lakshman 2026-11-02, "yes best way", after a review of how leading AI products lay out settings):
// Settings has a section menu down its left side and shows the chosen section beside it, as Linear, Vercel and
// OpenRouter settings do. This replaces OMN-21166 part 26's one long page with no section handling (AC154). The chosen
// section is the URL hash (#access), so a link opens it and a reload keeps it; no hash, or one no section has, opens
// Model providers. Every section stays rendered and only the chosen one is visible, so each embedded page keeps its own
// panels, states and served reads (AC156) and switching sections reads nothing again. Model providers come first, then
// Access, Pricing and routing, and System status last, since service health is watched, not set (AC158).
// /api-keys and /credentials stay retired (AC155); there is still no Appearance section (AC169a).
export const SETTINGS_SECTIONS = [
  { id: 'settings-model-providers', hash: 'providers', page: 'credentials', title: 'Model providers', icon: 'credentials', single: true,
    description: 'The AI provider accounts OmniNode can use for your delegations.' },
  { id: 'settings-access', hash: 'access', page: 'api-keys', title: 'Access', icon: 'local-access', single: false,
    description: 'Your local identity and how this dashboard is protected.' },
  { id: 'settings-pricing', hash: 'pricing', page: 'pricing', title: 'Pricing and routing', icon: 'baseline', single: true,
    description: 'The baseline model your savings are measured against, and its pricing version.' },
  { id: 'settings-system-status', hash: 'system', page: 'status', title: 'System status', icon: 'host', single: true,
    description: 'Whether the OmniNode services on this machine are running.' },
] as const;

type SectionHash = (typeof SETTINGS_SECTIONS)[number]['hash'];

/** The section a hash names, or Model providers for no hash or one no section has. */
export function sectionFromHash(hash: string): SectionHash {
  const wanted = hash.replace(/^#/, '');
  return SETTINGS_SECTIONS.find(section => section.hash === wanted)?.hash ?? 'providers';
}

function useSectionHash(): SectionHash {
  const read = () => sectionFromHash(typeof window === 'undefined' ? '' : window.location.hash);
  const [current, setCurrent] = useState<SectionHash>(read);
  useEffect(() => {
    const update = () => setCurrent(read());
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  return current;
}

export function SettingsPage({ navigationCache }: { navigationCache: LocalDashboardCache }) {
  const current = useSectionHash();
  return <main data-destination="local-settings" aria-label="Settings page" className="local-dashboard-page local-dashboard-page--settings">
    <header className="local-dashboard-header">
      <div className="local-dashboard-title">
        <span className="local-dashboard-page-icon" aria-hidden="true"><DestinationIcon page="local-settings" size={20} /></span>
        <div><h1>Settings</h1></div>
      </div>
    </header>
    <div className="local-settings-layout">
      <nav className="local-settings-menu" aria-label="Settings sections">
        <p className="local-settings-menu-label">Sections</p>
        <ol>{SETTINGS_SECTIONS.map((section, index) => {
          const active = section.hash === current;
          return <li key={section.id}>
            <a className="local-settings-link" href={`#${section.hash}`} aria-current={active ? 'page' : undefined} data-active={active ? 'true' : undefined}>
              <span className="local-settings-index mono" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
              {/* The section's concept icon from the registry, so it carries the same glyph and colour wherever the concept appears. */}
              <ConceptIcon concept={section.icon} label={section.title} size={16} /><span>{section.title}</span>
            </a>
          </li>;
        })}</ol>
      </nav>
      <div className="local-settings-content">
        {/* A section takes no landmark name, so the "Model providers" region stays the provider list's own (OMN-20816). */}
        {SETTINGS_SECTIONS.map((section, index) => <section key={section.id} id={section.id} hidden={section.hash !== current}
          className={`local-settings-section${section.single ? ' local-settings-section--single' : ''}`}>
          <p className="local-settings-eyebrow mono" aria-hidden="true">{`Section ${String(index + 1).padStart(2, '0')} of ${String(SETTINGS_SECTIONS.length).padStart(2, '0')}`}</p>
          <h2 id={`${section.id}-heading`}>{section.title}</h2>
          <p className="local-settings-description">{section.description}</p>
          <LocalDashboardPage pageName={section.page} embedded navigationCache={navigationCache} />
        </section>)}
      </div>
    </div>
  </main>;
}
