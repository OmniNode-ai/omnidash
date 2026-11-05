/**
 * OMN-22168 AC6: every component the component kit exports, in each of its looks and states, with sample data. The
 * sample values are story data only; no page reads them.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { StoryPage, StorySection } from '../story-frame';
import {
  Badge, Card, ConfirmDialog, DashboardTabs, DashboardToggle, DataTable, Dropdown, EmptyState, Fact, FactList, Figure, InfoTip, KpiTile, Panel,
  PanelTitle, StatusChip, Tooltip,
} from './index';
import { FileSpreadsheet } from '../icons';

function Controls() {
  const [window, setWindow] = useState('7d');
  const [view, setView] = useState<'runs' | 'tokens'>('runs');
  const [confirming, setConfirming] = useState(false);
  return <>
    <Dropdown label="Window" value={window} onChange={setWindow} options={[
      { value: '24h', label: '24 h', name: 'Last 24 hours' }, { value: '7d', label: '7 d', name: 'Last 7 days' }, { value: 'all', label: 'All' }]} />
    <DashboardToggle label="Chart shows" value={view} onChange={setView} options={[{ value: 'runs', label: 'Runs' }, { value: 'tokens', label: 'Tokens' }]} />
    <DashboardTabs label="Design system tabs" param="ds-story-tab" tabs={[
      { id: 'first', label: 'Charts and causes', panel: () => <p>The first tab&apos;s panel.</p> },
      { id: 'second', label: 'Routing', panel: () => <p>The second tab&apos;s panel.</p> }]} />
    <p>
      <Tooltip text="Spend as metered by the provider"><button type="button">Hover or focus me</button></Tooltip>{' '}
      <InfoTip label="About savings" text="Savings are modelled against the baseline's list price." />
    </p>
    <p><button type="button" onClick={() => setConfirming(true)}>Export CSV</button></p>
    <ConfirmDialog open={confirming} tone="green" icon={<FileSpreadsheet size={16} />} title="Download 25 runs as CSV?"
      confirmLabel="Download CSV" onCancel={() => setConfirming(false)} onConfirm={() => setConfirming(false)}>
      <p>The file holds the runs that match the current search and filters, every field of each.</p>
    </ConfirmDialog>
  </>;
}

function Components() {
  return <>
    <StorySection title="Panel, card and figure card">
      <Panel aria-label="A panel" data-kind="metric_card">
        <PanelTitle>Spend</PanelTitle>
        <Figure measured>$0.42</Figure>
        <p className="local-dashboard-caption">Last 7 days, as metered</p>
      </Panel>
      <Panel aria-label="An unmeasured card" data-kind="metric_card">
        <PanelTitle>Savings</PanelTitle>
        <Figure measured={false}>Not measured</Figure>
      </Panel>
      <Panel full aria-label="An expanded chart panel"><PanelTitle>Expanded chart</PanelTitle><EmptyState>No runs in this window</EmptyState></Panel>
      <section className="local-overview-summary" aria-label="Headline cards">
        <Card heading="Spend" accent="var(--ds-field-cost)" data-kpi-card="Spend"><Figure measured>$0.42</Figure><p className="local-dashboard-caption">Last 7 days</p></Card>
        <Card heading="Saved" unavailable data-kpi-card="Saved"><Figure measured={false}>Unavailable</Figure></Card>
      </section>
      <section className="ins-window-kpis" aria-label="KPI tiles">
        <KpiTile tone="count" label="Runs" value="42"><small>Last 7 days</small><small>+6 on the previous window</small></KpiTile>
        <KpiTile tone="cost" label="You paid" value="Unavailable" unavailable><small>The spend total is not recorded.</small></KpiTile>
      </section>
    </StorySection>

    <StorySection title="Fact list">
      <FactList>
        <Fact term="Tenant" data-field-tone="identity">acme</Fact>
        <Fact term="Minted" valueClassName="mono" valueTitle="2026-10-25T10:36:18Z">Oct 25, 10:36 UTC</Fact>
        <Fact term="Model" data-field-tone="model" data-field-unavailable>Not recorded</Fact>
      </FactList>
      <FactList look="provider-inline"><Fact term="Provider">openrouter</Fact><Fact term="Key">sk-…a1</Fact></FactList>
      <FactList look="routing-counts"><Fact term="All runs" data-routing-count="total">20</Fact><Fact term="Local">12</Fact></FactList>
    </StorySection>

    <StorySection title="Status chip and badges">
      <p>
        <StatusChip outcome="passed">passed</StatusChip>{' '}<StatusChip outcome="failed">failed</StatusChip>{' '}<StatusChip>Not recorded</StatusChip>
      </p>
      <p>
        <Badge>fixture</Badge>{' '}<Badge>Failed here</Badge>{' '}<Badge look="provider">Tried first · qwen3.8-27b</Badge>{' '}
        <Badge look="run-fact"><span>tier:</span> local</Badge>{' '}
        <Badge look="since-visit" data-tone="runs">4 new runs</Badge>{' '}<Badge look="since-visit" data-tone="failed">1 failed</Badge>
      </p>
    </StorySection>

    <StorySection title="Data table">
      <DataTable fit aria-label="Usage by model" footer={<nav aria-label="Table pages"><button type="button" disabled>Previous</button> 1–2 of 2 <button type="button" disabled>Next</button></nav>}>
        <thead><tr><th>Model</th><th>Runs</th><th>Spend</th></tr></thead>
        <tbody>
          <tr><td>qwen3.8-27b</td><td>12</td><td>$0.00</td></tr>
          <tr><td>glm-5.1</td><td>5</td><td>Not measured</td></tr>
        </tbody>
      </DataTable>
    </StorySection>

    <StorySection title="Empty state">
      <EmptyState>No returned runs to group by route</EmptyState>
      <EmptyState as="div" status={false}>A quiet empty note, not announced</EmptyState>
    </StorySection>

    <StorySection title="Controls: dropdown, toggle, tabs, tooltip">
      <Controls />
    </StorySection>
  </>;
}

const meta = { title: 'Design system/Components', component: Components } satisfies Meta<typeof Components>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Light: Story = { render: () => <StoryPage><Components /></StoryPage>, parameters: { themes: { themeOverride: 'Light' } } };
export const Dark: Story = { render: () => <StoryPage><Components /></StoryPage>, parameters: { themes: { themeOverride: 'Dark' } } };
