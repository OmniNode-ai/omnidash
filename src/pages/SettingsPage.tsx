import { Fragment } from 'react';
import { DestinationIcon } from '@/navigation/destination-icons';
import { useTheme } from '@/theme';
import { LocalDashboardPage, type LocalDashboardCache } from './LocalDashboardPage';

// OMN-21166 part 26 revised: /settings is one page with no tabs and no ?section= handling (AC154). Model providers
// come first, then Access, then System status (OMN-19988's Environment panel; revision 2, AC158), as in comparable
// products' settings. Each section renders its existing page document embedded, so its panels, states and served reads
// are unchanged (AC156). /api-keys and /credentials stay retired (AC155). A section takes no landmark name, so the
// "Model providers" region stays the provider list's own (OMN-20816). Revision 3: each section is one card, and a
// one-panel section shows only its own title (single), as comparable products' settings do. Revision 4 (part 27, AC169)
// adds Appearance after Model providers.
const SECTIONS = [
  { id: 'settings-model-providers', page: 'credentials', title: 'Model providers', single: true,
    description: 'The AI provider accounts OmniNode can use for your delegations.' },
  { id: 'settings-access', page: 'api-keys', title: 'Access', single: false,
    description: 'Your local identity and how this dashboard is protected.' },
  // Revision 2 (AC158): service health is watched, not set, so it comes last, as admin areas place monitoring.
  { id: 'settings-system-status', page: 'status', title: 'System status', single: true,
    description: 'Whether the OmniNode services on this machine are running.' },
] as const;

/** Part 27 AC169 (Anthony and Jonah in #standups: theme belongs in Settings): one Light/Dark choice. It is the header
 * toggle's own setting (useTheme), so the two always agree and the choice is kept the way the toggle keeps it. */
function Appearance() {
  const { theme, setTheme } = useTheme();
  return <section id="settings-appearance" className="local-settings-section">
    <h2 id="settings-appearance-heading">Appearance</h2>
    <p className="local-settings-description">How this dashboard looks on this device.</p>
    <div role="radiogroup" aria-label="Theme" className="local-settings-choice">
      {(['light', 'dark'] as const).map(name => <label key={name}>
        <input type="radio" name="settings-theme" value={name} checked={theme === name} onChange={() => setTheme(name)} />
        <span>{name === 'light' ? 'Light' : 'Dark'}</span>
      </label>)}
    </div>
  </section>;
}

export function SettingsPage({ navigationCache }: { navigationCache: LocalDashboardCache }) {
  return <main data-destination="local-settings" aria-label="Settings page" className="local-dashboard-page local-dashboard-page--settings">
    <header className="local-dashboard-header">
      <div className="local-dashboard-title">
        <span className="local-dashboard-page-icon" aria-hidden="true"><DestinationIcon page="local-settings" size={20} /></span>
        <div><h1>Settings</h1></div>
      </div>
    </header>
    {SECTIONS.map(section => <Fragment key={section.id}>
      <section id={section.id} className={`local-settings-section${section.single ? ' local-settings-section--single' : ''}`}>
        <h2 id={`${section.id}-heading`}>{section.title}</h2>
        <p className="local-settings-description">{section.description}</p>
        <LocalDashboardPage pageName={section.page} embedded navigationCache={navigationCache} />
      </section>
      {section.id === 'settings-model-providers' && <Appearance />}
    </Fragment>)}
  </main>;
}
