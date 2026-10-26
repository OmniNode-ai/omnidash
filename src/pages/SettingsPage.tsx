import { useRef, type KeyboardEvent } from 'react';
import { useLocation, useSearch } from 'wouter';
import { SETTINGS_SECTION_ICONS } from '@/navigation/destination-icons';
import { LocalDashboardPage, type LocalDashboardCache } from './LocalDashboardPage';

// OMN-21166 part 26: one Settings page holds API Keys and Credentials, each rendered from its own page document so the
// panels, states and served reads are the ones the separate pages had (AC156). The section lives in the address
// (AC154); /api-keys and /credentials no longer exist (AC155).
export const SETTINGS_SECTIONS = [
  { id: 'api-keys', label: 'API Keys' },
  { id: 'credentials', label: 'Credentials' },
] as const;
export type SettingsSection = typeof SETTINGS_SECTIONS[number]['id'];

/** API Keys for no section or an unknown one. */
export function readSettingsSection(search: string): SettingsSection {
  const value = new URLSearchParams(search).get('section');
  return SETTINGS_SECTIONS.find(section => section.id === value)?.id ?? 'api-keys';
}

function SettingsTabs({ active, onSelect }: { active: SettingsSection; onSelect: (section: SettingsSection) => void }) {
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  // WAI-ARIA tabs: the arrow keys, Home and End move between sections; only the selected tab is in the tab order.
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = SETTINGS_SECTIONS.length - 1;
    const next = event.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
      : event.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
      : event.key === 'Home' ? 0 : event.key === 'End' ? last : null;
    if (next === null) return;
    event.preventDefault();
    onSelect(SETTINGS_SECTIONS[next].id);
    tabs.current[next]?.focus();
  };
  return <div className="local-settings-tabs" role="tablist" aria-label="Settings sections">
    {SETTINGS_SECTIONS.map(({ id, label }, index) => {
      const Icon = SETTINGS_SECTION_ICONS[id];
      const selected = id === active;
      return <button key={id} ref={element => { tabs.current[index] = element; }} type="button" role="tab"
        id={`settings-tab-${id}`} aria-selected={selected} aria-controls="settings-section" tabIndex={selected ? 0 : -1}
        data-testid={`settings-tab-${id}`} className="local-settings-tab" onClick={() => onSelect(id)}
        onKeyDown={event => onKeyDown(event, index)}>
        <Icon size={14} aria-hidden="true" />{label}
      </button>;
    })}
  </div>;
}

export function SettingsPage({ navigationCache }: { navigationCache: LocalDashboardCache }) {
  const [, navigate] = useLocation();
  const section = readSettingsSection(useSearch());
  const select = (next: SettingsSection) => {
    if (next !== section) navigate(`/settings?section=${next}`);
  };
  return <LocalDashboardPage key={section} pageName={section} navigationCache={navigationCache}
    settingsTabs={<SettingsTabs active={section} onSelect={select} />} />;
}
