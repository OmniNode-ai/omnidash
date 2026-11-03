/**
 * OMN-22168 AC6: every --ds-* token, read from tokens.css itself, so a token added there is shown here with no edit.
 * Each row draws the token as a swatch and prints the value the theme resolves it to.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useLayoutEffect, useRef, useState } from 'react';
import tokenSource from './tokens.css?raw';
import { StoryPage, StorySection } from './story-frame';

/** Every token tokens.css declares, in the order first declared, grouped by its first word after --ds-. */
const TOKENS = [...new Set(Array.from(tokenSource.matchAll(/(--ds-[a-z0-9-]+)\s*:/g), match => match[1]))];
const GROUPS = TOKENS.reduce<Record<string, string[]>>((groups, token) => {
  const group = token.slice('--ds-'.length).split('-')[0];
  (groups[group] ??= []).push(token);
  return groups;
}, {});

function TokenRow({ token }: { token: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState('');
  useLayoutEffect(() => {
    if (ref.current) setValue(getComputedStyle(ref.current).getPropertyValue(token).trim());
  }, [token]);
  return (
    <div ref={ref} data-token={token} style={{ display: 'grid', gridTemplateColumns: '40px minmax(0, 1fr) minmax(0, 1fr)', gap: 12, alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--ds-line-soft)' }}>
      <span aria-hidden="true" style={{ width: 32, height: 20, borderRadius: 4, border: '1px solid var(--ds-line)', background: `var(${token})` }} />
      <code>{token}</code>
      <code>{value || 'not a value in this theme'}</code>
    </div>
  );
}

function Tokens() {
  return <>
    <p className="local-dashboard-caption">{TOKENS.length} tokens from src/design-system/tokens.css</p>
    {Object.entries(GROUPS).map(([group, tokens]) => (
      <StorySection key={group} title={`${group} (${tokens.length})`}>
        {tokens.map(token => <TokenRow key={token} token={token} />)}
      </StorySection>
    ))}
  </>;
}

const meta = { title: 'Design system/Tokens', component: Tokens } satisfies Meta<typeof Tokens>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Light: Story = { render: () => <StoryPage><Tokens /></StoryPage>, parameters: { themes: { themeOverride: 'Light' } } };
export const Dark: Story = { render: () => <StoryPage><Tokens /></StoryPage>, parameters: { themes: { themeOverride: 'Dark' } } };
