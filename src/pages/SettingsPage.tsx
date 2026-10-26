import { DestinationIcon } from '@/navigation/destination-icons';
import { LocalDashboardPage, type LocalDashboardCache } from './LocalDashboardPage';

// OMN-21166 part 26 revised: /settings is one page with no tabs and no ?section= handling (AC154). Model providers
// come first, then Access, then System status (OMN-19988's Environment panel; revision 2, AC158), as in comparable
// products' settings. Each section renders its existing page document embedded, so its panels, states and served reads
// are unchanged (AC156). /api-keys and /credentials stay retired (AC155). A section takes no landmark name, so the
// "Model providers" region stays the provider list's own (OMN-20816).
const SECTIONS = [
  { id: 'settings-model-providers', page: 'credentials', title: 'Model providers',
    description: 'The AI provider accounts OmniNode can use for your delegations.' },
  { id: 'settings-access', page: 'api-keys', title: 'Access',
    description: 'Your local identity and how this dashboard is protected.' },
  // Revision 2 (AC158): service health is watched, not set, so it comes last, as admin areas place monitoring.
  { id: 'settings-system-status', page: 'status', title: 'System status',
    description: 'Whether the OmniNode services on this machine are running.' },
] as const;

export function SettingsPage({ navigationCache }: { navigationCache: LocalDashboardCache }) {
  return <main data-destination="local-settings" aria-label="Settings page" className="local-dashboard-page local-dashboard-page--settings">
    <header className="local-dashboard-header">
      <div className="local-dashboard-title">
        <span className="local-dashboard-page-icon" aria-hidden="true"><DestinationIcon page="local-settings" size={20} /></span>
        <div><h1>Settings</h1></div>
      </div>
    </header>
    {SECTIONS.map(section => <section key={section.id} id={section.id} className="local-settings-section">
      <h2 id={`${section.id}-heading`}>{section.title}</h2>
      <p className="local-settings-description">{section.description}</p>
      <LocalDashboardPage pageName={section.page} embedded navigationCache={navigationCache} />
    </section>)}
  </main>;
}
