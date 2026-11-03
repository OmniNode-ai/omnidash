/**
 * OMN-22168 AC6: every icon the registry holds: each concept in CONCEPT_ICONS with the icon it resolves to, and every
 * named icon icons.ts exports. Both lists are walked, so an icon added to the registry is shown here with no edit.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ComponentType } from 'react';
import * as Icons from './icons';
import { StoryPage, StorySection } from './story-frame';

type IconComponent = ComponentType<{ size?: number; 'aria-hidden'?: boolean | 'true' }>;

/** The named icons: every PascalCase value export (lucide icons are forwardRef objects), not CONCEPT_ICONS itself. */
const NAMED = Object.entries(Icons as Record<string, unknown>)
  .filter(([name, value]) => /^[A-Z][a-z]/.test(name) && value !== null && (typeof value === 'object' || typeof value === 'function'))
  .sort(([a], [b]) => a.localeCompare(b)) as Array<[string, IconComponent]>;

const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 } as const;
const cell = { display: 'flex', gap: 8, alignItems: 'center', padding: 8, border: '1px solid var(--ds-line-soft)', borderRadius: 6 } as const;

function IconCatalogue() {
  const concepts = Object.entries(Icons.CONCEPT_ICONS) as Array<[string, IconComponent]>;
  return <>
    <StorySection title={`Concepts (${concepts.length})`}>
      <div style={grid}>
        {concepts.map(([concept, Icon]) => <div key={concept} data-concept={concept} style={cell}><Icon size={18} aria-hidden="true" /><code>{concept}</code></div>)}
      </div>
    </StorySection>
    <StorySection title={`Named icons (${NAMED.length})`}>
      <div style={grid}>
        {NAMED.map(([name, Icon]) => <div key={name} data-icon={name} style={cell}><Icon size={18} aria-hidden="true" /><code>{name}</code></div>)}
      </div>
    </StorySection>
  </>;
}

const meta = { title: 'Design system/Icons', component: IconCatalogue } satisfies Meta<typeof IconCatalogue>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Light: Story = { render: () => <StoryPage><IconCatalogue /></StoryPage>, parameters: { themes: { themeOverride: 'Light' } } };
export const Dark: Story = { render: () => <StoryPage><IconCatalogue /></StoryPage>, parameters: { themes: { themeOverride: 'Dark' } } };
