import { formatDashboardCount } from '@/lib/format';
import { PricingFacts } from '@/pages/local/pricing';
import { WindowMenu } from '@/pages/local/window-menu';
import { readableTime } from '@/lib/format';
import { dailyMeteringTokens } from '@/lib/daily-metering-tokens';
import { DailyMeteringTokens } from '@/components/dashboard/usage/DailyMeteringTokens';
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { modelTiersFrom } from '@/lib/dashboard-colors';
import { Link, useLocation, useSearch } from 'wouter';
import { Maximize2, X } from '@/theme/design-system/icons';
import { createSnapshotSource } from '@/data-source';
import { fetchExposureCensus } from '@/data-source/exposure-census';
import { resolveEffectiveDataSource } from '@/data-source/data-source-override';
import { resolveConfiguredTenant } from '@/data-source/projection-tenant';
import { latestServedRead, publishLocalPageRead, requestLocalPageRefresh, subscribeLocalPageRefresh } from '@/services/local-page-refresh';
import { PAGE_PATHS } from '@/navigation/page-routes';
import { readWorkflowRunId, writeWorkflowRunId } from '@/navigation/workflow-url-state';
import { InsightsWindowContext, OverviewRunsContext, type ActivityWindow } from '@/pages/local/insight-charts';
import { DashboardTabs, EmptyState, Panel, PanelTitle } from '@/theme/design-system/components';
import { Bot, CalendarRange, ChartArea, ChartPie, Layers } from '@/theme/design-system/icons';
import { SinceLastVisit } from '@/pages/local/since-last-visit';
import { ModelKeys } from '@/pages/local/model-keys';
import { EnvironmentPanel, ServiceHealthUnread } from '@/pages/local/environment';
import { RunFilterProvider } from '@/pages/local/run-filter';
import { AccessNotServed } from '@/pages/local/access';
import { ConceptIcon } from '@/components/dashboard/FieldIcon';
import { fieldTone } from '@/components/dashboard/field-identity';
import '@/styles/local-dashboard.css';
import '@/styles/dashboard-cards.css';
import '@/styles/seven-page-design.css';
import '@/styles/editorial.css';
import { DestinationIcon } from '@/navigation/destination-icons';
import type { AppPage } from '@/store/types';
import { loadLocalPageConfig, loadLocalPageSnapshots, rowsForLocalComponent, resolveLocalPageEmptyState, withLastGood, newestRunId as newestWorkflowRunId, DELEGATION_DECISIONS_TOPIC, METERING_SUMMARY_TOPIC, RUN_TRACE_TOPIC, isPerRunTopic, LOCAL_READ_TIMEOUT_MS, type BoundProjectionSnapshot, type LocalPageDocument, type LocalPageName } from '@/layout/local-page-loader';
import { ModelTiersContext } from '@/components/dashboard/model-tiers';
import { pageRefreshMs } from '@/lib/refresh';
import { CARD_LINKS, MAPLE_WIDTHS, MeteringTotalCard, MetricCard, OUTSIDE_WINDOW_NOTE, OverviewDayPicker, type OverviewWindow, PendingState, RUNS_SECONDARY, RunChartsSlot, RunLocallyCard, RunRoutingSlot, RunsKpis, UsageKpis, captionRowFor, meteringRangeFor, meteringTokens, pickMeteringRow, readOverviewWindow, servedMeteringDays, writeOverviewWindow } from '@/pages/local/page-headline';
import { type DeclaredColumn, PAGE_TITLES, PANEL_CONCEPTS, type PanelSlice, ReadFailureNotice, TableComponent, WidgetReadState, bindingFailedEmpty, notServedTopic, rawRowsFor } from '@/pages/local/page-tables';
import { type Row, asRecord, asRecords, isMissing, metricConfigFor, timeOf } from '@/pages/local/page-shared';
import { WorkflowRun } from '@/pages/local/page-workflow';
import { NoRunsYet } from '@/pages/local/page-runs';
import { NoProviderKeys } from '@/pages/local/page-settings';
import { OverviewStatusStrip } from '@/pages/local/page-overview';

// OMN-23330 AC24: the page's parts live in src/pages/local/page-*.tsx; every name this module exported is still exported
// from here, so no import elsewhere changes.
// OMN-21166 part 15: CardBasis moved to components/dashboard/CardBasis so the shared KPI cards can use it.
export { CardBasis } from '@/components/dashboard/CardBasis';
export { CopyButton, FIRST_RUN_COMMAND, runModelledCell } from '@/pages/local/page-shared';
export { ChangeLine, MIXED_PRICING, MeteringTotalCard, MetricCard, OverviewDayPicker, PENDING_SOURCES, PendingState, QualityCard, RunLocallyCard, RunsKpis, SavingsByModel, UsageKpis, captionText, headlineHoverLines, meteringMoneyBasis, meteringRangeFor, meteringTokens, periodChangeLine, pickMeteringRow, pricingLabel, qualityChangeLine, readOverviewWindow, servedMeteringDays, unbroken, writeOverviewWindow } from '@/pages/local/page-headline';
export type { MetricCardConfig, OverviewWindow } from '@/pages/local/page-headline';
export { LastRunCard, NewestRunLine, NoRunsYet, QualityPanel, RecentRunsTable, RunsTable, runModelColumnWidth } from '@/pages/local/page-runs';
export { ModelUsagePanel, OverviewStatusStrip, OverviewTrendPanel, TierMixPanel } from '@/pages/local/page-overview';
export { AlertsTable, CredentialsTable } from '@/pages/local/page-settings';
export { LocalIdentity, RunNeighbours, RunSummary, RunTimeline, WorkflowRun } from '@/pages/local/page-workflow';
export { MeteringDayTable, PANEL_CONCEPTS, PANEL_ICONS, RUN_MEASURED_FIELDS } from '@/pages/local/page-tables';
export type { PanelSlice } from '@/pages/local/page-tables';

interface LocalDashboardPageProps {
  pageName: LocalPageName;
  syncUrl?: boolean;
  navigationCache?: LocalDashboardCache;
  /** OMN-21166 part 26 revised: a section of the one Settings page, drawn without its own main landmark or header. */
  embedded?: boolean;
}

export interface LocalDashboardCache {
  context: string | null;
  snapshots: Map<string, BoundProjectionSnapshot>;
}

export { readableTime };

export function LocalDashboardPage({ pageName, syncUrl = false, navigationCache, embedded = false }: LocalDashboardPageProps) {
  const [page, setPage] = useState<LocalPageDocument | null>(null);
  // OMN-21166 part 26: API Keys and Credentials are sections of Settings, so they carry its destination identity.
  const destination: AppPage = embedded ? 'local-settings' : `local-${pageName}` as AppPage;
  const Frame = embedded ? 'div' : 'main';
  const [snapshots, setSnapshots] = useState<BoundProjectionSnapshot[]>([]);
  // OMN-21166 AC77: Overview and Usage tell the top bar when their rows were last read from the runtime.
  const servedRead = pageName === 'overview' || pageName === 'usage' ? latestServedRead(snapshots) : null;
  useEffect(() => {
    if (pageName !== 'overview' && pageName !== 'usage') return undefined;
    publishLocalPageRead(pageName, servedRead);
    return () => publishLocalPageRead(null, null);
  }, [pageName, servedRead]);
  const [error, setError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // OV-3: which fixed window the Overview's metering cards read. Kept by the page so every card moves together.
  // OMN-21166 part 19 AC136: Overview's window starts from its address and is written back to it (replace, so the back
  // button and a shared link keep it without one history entry per click); a malformed value is all time, corrected.
  const windowSearch = useSearch();
  const [, navigateWindow] = useLocation();
  const initialWindow = pageName === 'overview' ? readOverviewWindow(windowSearch) : null;
  const [overviewWindow, setOverviewWindow] = useState<OverviewWindow>(initialWindow?.overview ?? 'all');
  const [activityWindow, setActivityWindow] = useState<ActivityWindow>(initialWindow?.activity ?? { kind: 'all' });
  useEffect(() => {
    if (pageName !== 'overview') return;
    const next = writeOverviewWindow(windowSearch, activityWindow);
    if (next !== new URLSearchParams(windowSearch).toString()) navigateWindow(`/overview${next ? `?${next}` : ''}`, { replace: true });
  }, [pageName, activityWindow, windowSearch, navigateWindow]);
  const [runChartsSlot, setRunChartsSlot] = useState<HTMLElement | null>(null);
  const [runRoutingSlot, setRunRoutingSlot] = useState<HTMLElement | null>(null);
  // Part 30 AC201: a link to one of Runs' analysis tabs opens "More analysis" on it.
  const [expandedChart, setExpandedChart] = useState<{ componentId: string; title: string; slice?: PanelSlice } | null>(null);
  const chartDialog = useRef<HTMLDialogElement>(null);
  const chartOpener = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const dialog = chartDialog.current;
    if (!dialog || !expandedChart) return;
    dialog.showModal();
    const priorOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = priorOverflow;
      if (dialog.open) dialog.close();
    };
  }, [expandedChart]);
  const windowId = useId();
  const latest = useRef<BoundProjectionSnapshot[]>([]);
  // Memory only: reuse recent successful reads between local destinations, scoped
  // to the configured source/tenant and (for traces) the exact requested run.
  const ownCache = useRef<LocalDashboardCache>({ context: null, snapshots: new Map() });
  const recent = navigationCache ?? ownCache.current;
  // One source per mounted page, so a double mount (React's development mode) shares its reads in flight.
  const source = useRef<ReturnType<typeof createSnapshotSource> | null>(null);
  // WF-3: the run Workflow shows is the one its address names (or, without address sync, the one picked here).
  const search = useSearch();
  const [, navigate] = useLocation();
  const [pickedRunId, setPickedRunId] = useState<string | null>(null);
  const requestedRunId = pageName !== 'workflow' ? null : syncUrl ? readWorkflowRunId(search) : pickedRunId;
  const openRun = (runId: string | null) => {
    if (!syncUrl) {
      setPickedRunId(runId);
      return;
    }
    const query = writeWorkflowRunId(search, runId);
    navigate(`${PAGE_PATHS['local-workflow']}${query ? `?${query}` : ''}`);
  };

  useEffect(() => {
    let active = true;
    // A page switch must never show another page's document or another run's steps.
    setPage(null);
    setSnapshots([]);
    latest.current = [];
    setError(null);
    setRefreshError(null);
    setLoading(true);
    let document: LocalPageDocument;
    try {
      document = loadLocalPageConfig(pageName);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setLoading(false);
      return () => { active = false; };
    }
    const tenant = resolveConfiguredTenant();
    const context = JSON.stringify([resolveEffectiveDataSource(), tenant]);
    if (recent.context !== context) {
      recent.snapshots.clear();
      source.current = null;
      recent.context = context;
    }
    const topics = [...new Set(document.components.flatMap(component =>
      (component.data_bindings ?? []).map(binding => binding.projection_topic)))];
    const snapshotKey = (snapshot: BoundProjectionSnapshot) => `${snapshot.topic}\0${snapshot.runId ?? ''}`;
    // An implicit server tenant is not safe to cache across navigation: the same
    // origin can begin serving another install without a client config change.
    const cached = tenant === null ? [] : topics.flatMap(topic => {
      if (isPerRunTopic(topic) && requestedRunId === null) return [];
      const key = `${topic}\0${isPerRunTopic(topic) ? requestedRunId ?? '' : ''}`;
      const snapshot = recent.snapshots.get(key);
      return snapshot && Date.now() - timeOf(snapshot.readAt) < 60_000 ? [snapshot] : [];
    });
    latest.current = cached;
    setSnapshots(cached);
    setPage(document);
    setLoading(false);
    // Reads of one page can overlap: the interval and the refresh button each start one while an earlier one is still
    // unanswered. Only the read started last may write. A read that was overtaken answers a question the page has
    // already asked again (the newest run may have changed since), so its rows, its failure and its end of loading
    // are all dropped, however late it answers.
    let started = 0;
    // Every read after the first keeps the last good rows on screen while it runs, and when it fails (F25).
    async function load() {
      const mine = ++started;
      const current = () => active && mine === started;
      const publish = (snapshot: BoundProjectionSnapshot) => {
        if (!current()) return;
        const retained = withLastGood(latest.current, [snapshot])[0];
        latest.current = [...latest.current.filter(candidate => candidate.topic !== snapshot.topic), retained];
        if (pageName === 'workflow' && requestedRunId === null
          && snapshot.topic === DELEGATION_DECISIONS_TOPIC && !snapshot.failure) {
          const runId = newestWorkflowRunId(document, [retained]);
          latest.current = latest.current.filter(candidate => !isPerRunTopic(candidate.topic) || candidate.runId === runId);
        }
        setSnapshots(latest.current);
        if (tenant !== null && !snapshot.failure) {
          recent.snapshots.set(snapshotKey(snapshot), snapshot);
          if (recent.snapshots.size > 64) {
            recent.snapshots.delete(recent.snapshots.keys().next().value!);
          }
        }
      };
      let catalogueTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        const { mode } = resolveEffectiveDataSource();
        if (mode !== 'http') {
          throw new Error('Local pages require HTTP mode to read runtime exposures.');
        }
        // The catalogue precedes the bounded projection reads. Bound this UI
        // wait too: a stalled catalogue must not leave the whole page loading.
        const census = await Promise.race([
          fetchExposureCensus(),
          new Promise<never>((_, reject) => {
            catalogueTimer = setTimeout(() => reject(new Error('Exposure catalogue: no answer in 5 s')), LOCAL_READ_TIMEOUT_MS);
          }),
        ]);
        clearTimeout(catalogueTimer);
        if (!current()) return;
        setError(null);
        setRefreshError(null);
        const availableTopics = new Set(
          census.rows.filter((row) => row.reachability === 'reachable').map((row) => row.topic),
        );
        source.current ??= createSnapshotSource();
        await loadLocalPageSnapshots(document, source.current, {
          mode,
          availableTopics,
          runId: requestedRunId,
          onSnapshot: publish,
          isCurrent: current,
        });
        if (current()) {
          setPage(document);
          // Every result has already been published. Reapplying the collected
          // results here could replace a late recovery with an older timeout.
          setSnapshots(latest.current);
          setError(null);
          setRefreshError(null);
        }
      } catch (cause) {
        if (current()) {
          const message = cause instanceof Error ? cause.message : String(cause);
          if (latest.current.length === 0) setError(message);
          else {
            setRefreshError(message);
            // A failed catalogue must terminate uncached panel loading too.
            for (const topic of topics) {
              if (latest.current.some(snapshot => snapshot.topic === topic)) continue;
              publish({ topic, rows: [], rowCount: 0, dataFreshness: 'unknown', latestEventAt: null,
                readAt: new Date().toISOString(), failure: { kind: 'error', message },
                ...(isPerRunTopic(topic) ? { runId: requestedRunId } : {}) });
            }
          }
        }
      } finally {
        clearTimeout(catalogueTimer);
        if (current()) setLoading(false);
      }
    }
    const unsubscribeRefresh = subscribeLocalPageRefresh(() => { void load(); });
    void load();
    // The page's declared refresh interval (requirements: the dashboard shows the runtime's data as it changes), never under
    // the one refresh setting (OMN-23330 AC21).
    const timer = setInterval(() => { void load(); }, pageRefreshMs(document.dashboard.refresh_interval_seconds));
    return () => {
      active = false;
      clearInterval(timer);
      unsubscribeRefresh();
    };
  }, [pageName, requestedRunId, recent]);

  const emptyState = page ? resolveLocalPageEmptyState(page, snapshots) : null;
  const now = Date.now();
  const interval = pageRefreshMs(page?.dashboard.refresh_interval_seconds) / 1000;

  const renderComponent = (component: LocalPageDocument['components'][number], meteringView: 'all' | 'kpis' | 'daily' = 'all', slice?: PanelSlice, fullView = false) => {
    if (!page) return null;
    const rows = rowsForLocalComponent(component, snapshots);
    const first = (rows[0] ?? {}) as Record<string, unknown>;
    const widget = page.dashboard.widgets.find((candidate) => candidate.data_source === component.component_id);
    const pageSize = Number((widget?.config as Record<string, unknown> | undefined)?.page_size ?? 25);
    const notServed = notServedTopic(component, snapshots);
    const unbound = (component.data_bindings ?? []).length === 0;
    const bindings = component.component_id === 'workflow-run-path'
      ? (component.data_bindings ?? []).filter(binding => binding.projection_topic === RUN_TRACE_TOPIC)
      : component.component_kind === 'table' ? (component.data_bindings ?? []).slice(0, 1) : component.data_bindings ?? [];
    const pending = bindings.some(binding => !snapshots.some(snapshot => snapshot.topic === binding.projection_topic));
    const metering = snapshots.find(snapshot => snapshot.topic === METERING_SUMMARY_TOPIC);
    const tokenSources = snapshots.filter(snapshot => snapshot.topic === METERING_SUMMARY_TOPIC
      || snapshot.topic === component.data_bindings?.[0]?.projection_topic);
    const tokenFallback = component.component_id === 'usage-tokens-by-day' && rows.length === 0
      && metering && metering.rows.length > 0
      && !tokenSources.some(snapshot => snapshot.failure?.kind === 'tenant-not-configured')
      ? dailyMeteringTokens(metering.rows) : null;
    const panelConcept = PANEL_CONCEPTS[component.component_id];
    // OV-3: only the panels that read metering-summary.v1 have a row per window. Every other Overview panel
    // reads an exposure with no day rows, so with today chosen it still shows all time and has to say so:
    // seen on a store of two real days, "Agent calls 4" beside "6 of 6 runs local".
    const outsideWindow = pageName === 'overview' && overviewWindow !== 'all'
      && component.data_bindings?.[0]?.projection_topic !== METERING_SUMMARY_TOPIC
      // OMN-21166: the trends follow the window themselves.
      && !['overview-insights', 'status-environment'].includes(component.component_id);
    // GET /models has its own loading/error state; credential projection availability
    // must only gate the key-reference region, including its aria-busy state.
    const credentialProviders = component.component_id === 'credentials-keys';
    const environment = component.component_id === 'status-environment';
    // OMN-21970 AC10: Settings' Pricing and routing section, from the served all-time metering row.
    const pricing = component.component_id === 'pricing-baseline';
    const readContent = <>
        {pending ? <p className="local-dashboard-caption" role="status">Loading data…</p>
          : unbound && component.component_kind !== 'metric_card' ? <PendingState componentId={component.component_id} />
          : component.component_id === 'workflow-run-path' ? (
            <WorkflowRun component={component} snapshots={snapshots} requested={requestedRunId} onOpen={openRun} />
          ) : tokenFallback ? <DailyMeteringTokens data={tokenFallback} />
          : environment ? (notServed || bindingFailedEmpty(component, snapshots)
            ? <ServiceHealthUnread />
            : <EnvironmentPanel rows={rows as Record<string, unknown>[]}
                complete={!bindings.some(binding => snapshots.some(snapshot => snapshot.topic === binding.projection_topic && snapshot.failure))} />)
          : notServed ? <EmptyState>{notServed}</EmptyState>
          : bindingFailedEmpty(component, snapshots) ? null
          : pricing ? <PricingFacts rows={rows as Record<string, unknown>[]} />
          : emptyState === 'NO_RUNS_YET' ? <NoRunsYet />
          : emptyState ? <EmptyState>Baseline unresolved</EmptyState>
          : component.component_kind === 'table' ? (
            <TableComponent
              component={component}
              snapshots={snapshots}
              pageSize={pageSize}
              syncUrl={syncUrl}
              activityWindow={activityWindow}
              meteringView={meteringView}
              slice={slice}
              columns={((widget?.config as { columns?: DeclaredColumn[] } | undefined)?.columns) ?? []}
            />
          ) : component.component_id === 'overview-run-locally' ? (
            <RunLocallyCard row={asRecord(rows[0])} />
          ) : component.data_bindings?.[0]?.projection_topic === METERING_SUMMARY_TOPIC ? (() => {
            const config = metricConfigFor(page, component.component_id);
            return config
              ? <MeteringTotalCard component={component} config={config} rows={rows} window={overviewWindow} now={now} />
              : <EmptyState status={false}>Not measured</EmptyState>;
          })() : (() => {
            const config = metricConfigFor(page, component.component_id);
            return config
              ? <MetricCard component={component} config={config} row={first} caption={captionRowFor(component, snapshots)} />
              : <EmptyState status={false}>Not measured</EmptyState>;
          })()}
        {!pending && <WidgetReadState component={component} snapshots={snapshots} now={now} interval={interval} />}
    </>;
    const cardLink = pageName === 'overview' && (component.component_id !== 'overview-quality' || slice?.key === 'card')
      ? CARD_LINKS[component.component_id] : undefined;
    // OMN-22168 (Lakshman 2026-11-04, "remove that"): the four Overview charts are full width in one tabbed row, so the
    // Expand button (OMN-21166 part 24 AC148) is gone; no chart opens a larger view.
    const chartTitle: string | null = null;
    return (
      <Panel
        full={fullView}
        data-width={String(MAPLE_WIDTHS[`${pageName}:${component.component_id}${slice ? `:${slice.key}` : ''}`] ?? (pageName === 'overview' && component.component_id === 'overview-spend-by-day' ? 12
          : pageName === 'overview' && ['overview-quality', 'overview-last-run'].includes(component.component_id) ? 6
          : pageName === 'overview' && ['overview-recent-runs', 'overview-tier-mix'].includes(component.component_id) ? 6 : widget?.width ?? 12))}
        data-component={component.component_id}
        data-slice={slice?.key}
        data-kind={component.component_kind}
        data-field-tone={component.component_kind === 'metric_card' ? fieldTone(component.title)
          // OMN-21970 (Lakshman 2026-11-02): the Delegation Quality card carries the quality colour like its neighbours.
          : component.component_id === 'overview-quality' ? 'pass' : undefined}
        aria-busy={credentialProviders ? 'false' : pending}
        key={slice ? `${component.component_id}-${slice.key}` : component.component_id}
      >
        <h2 data-page-heading={pageName !== 'overview' || ['overview-quality', 'overview-insights', 'overview-spend-by-day', 'overview-last-run', 'overview-recent-runs', 'overview-model-usage', 'overview-tier-mix'].includes(component.component_id) ? '' : undefined} tabIndex={-1}>{slice ? <><ConceptIcon concept={slice.concept} label={slice.title} size={14} />{slice.title}</>
          : <>{panelConcept && <ConceptIcon concept={panelConcept} label={pageName === 'overview' && component.component_id === 'overview-insights' ? 'Activity trends' : component.title} size={14} />}{pageName === 'overview' && component.component_id === 'overview-insights' ? 'Activity trends' : component.title}</>}</h2>
        {chartTitle && !fullView && <button type="button" className="local-chart-expand" aria-label={`Expand ${chartTitle}`}
          onClick={(event) => { chartOpener.current = event.currentTarget; setExpandedChart({ componentId: component.component_id, title: chartTitle, slice }); }}>
          <Maximize2 size={14} aria-hidden="true" /><span>Expand</span>
        </button>}
        {/* Part 19 AC134: the whole card opens the page that explains it; the info button sits above the link. */}
        {cardLink && <Link href={cardLink.href} className="local-card-link" aria-label={`${slice?.title ?? component.title}: open ${cardLink.page}`} />}
        {/* A headline card keeps only its figure; its all-time note is in its hover (QualityCard). */}
        {outsideWindow && slice?.key !== 'card' && <p className="local-dashboard-caption">{OUTSIDE_WINDOW_NOTE}</p>}
        {/* Part 18 AC128: one table; the keys in use (as served, unrevoked) sit on their provider's row. */}
        {credentialProviders && <ModelKeys keys={asRecords(rows).filter(key => isMissing(key.revoked_at))} empty={asRecords(rows).length === 0 ? <NoProviderKeys /> : undefined} />}
        {credentialProviders ? <div aria-busy={pending}>{readContent}</div> : readContent}
      </Panel>
    );
  };
  const overviewGroups = {
    summary: ['overview-spend', 'overview-savings', 'overview-measured', 'overview-tokens'],
  };
  const renderGroup = (ids: string[], meteringView: 'all' | 'kpis' | 'daily' = 'all') => ids.map(id => {
    const component = page?.components.find(candidate => candidate.component_id === id);
    return component ? renderComponent(component, meteringView) : null;
  });
  return (
    <RunFilterProvider>
    {/* OMN-21970 AC5: one model -> tier map from every served row that names both, so a model is its tier's colour on
        every chart and table this page draws. */}
    <ModelTiersContext.Provider value={modelTiersFrom(snapshots.flatMap(snapshot => snapshot.rows ?? []))}>
    <Frame data-destination={destination} aria-label={embedded ? undefined : `${page?.dashboard.name ?? 'Local dashboard'} page`}
      className={`${embedded ? 'local-settings-embed' : 'local-dashboard-page'} local-dashboard-page--${pageName}`}>
      {!embedded && <header className="local-dashboard-header">
        <div className="local-dashboard-title">
          <span className="local-dashboard-page-icon" aria-hidden="true"><DestinationIcon page={destination} size={20} /></span>
          <div>
            <h1>{page?.dashboard.name ?? PAGE_TITLES[pageName]}</h1>
          </div>
        </div>
        {/* One toolbar row: the page's own control when it has one, and the runtime mode at the right. */}
        {pageName === 'overview' && !loading && !error && page && (
          // OMN-21166 mockup build used a button switch (radio semantics); OMN-21970 AC9 (Lakshman 2026-11-02) made it one
          // button that opens the list, each option keeping its radio semantics.
          // Live review 2026-10-25: one compact control; the name stays "Figures for" and each option keeps its full name
          // ("Today (UTC)") for screen readers, while the visible label is short with UTC as a muted suffix.
          <div className="local-dashboard-filters local-window-switch">
            {/* Live review 2026-10-25 ("unified"): one window for the cards and the charts. All, Today, the last 7, 15 or
                30 UTC days (the cards sum the served day rows, as AC42 does), or one day picked in the calendar. */}
            <span id={windowId} className="local-visually-hidden">Figures for</span>
            <div className="local-window-options" title="Figures and charts for: all time, today, the last 7/15/30 UTC days, or a picked day">
              <OverviewDayPicker value={overviewWindow} now={now}
                onChange={value => { setOverviewWindow(value); if (value.startsWith('day:')) setActivityWindow({ kind: 'custom', start: value.slice(4), end: value.slice(4) }); }}
                days={servedMeteringDays(snapshots.find(snapshot => snapshot.topic === METERING_SUMMARY_TOPIC)?.rows ?? [])} />
              {(() => {
                // OMN-21970 AC9 (Lakshman 2026-11-02): one button opens the list of windows, the chosen one ticked.
                const options = ([['all', 'All time', 'All time', 0], ['today', 'Today', 'Today (UTC)', 1], ['last-7', 'Last 7 days', 'Last 7 days (UTC)', 7],
                  ['last-15', 'Last 15 days', 'Last 15 days (UTC)', 15], ['last-30', 'Last 30 days', 'Last 30 days (UTC)', 30],
                  ['last-90', 'Last 90 days', 'Last 90 days (UTC)', 90]] as const).map(([value, label, name, days]) => {
                  const target: OverviewWindow = days === 0 ? 'all' : days === 1 ? 'today' : meteringRangeFor(days, now);
                  const checked = days === 0 ? overviewWindow === 'all' : days === 1 ? overviewWindow === 'today'
                    : overviewWindow.startsWith('range:') && activityWindow.kind === 'days' && activityWindow.days === days;
                  return { value, label, name, checked,
                    onSelect: () => { setOverviewWindow(target); setActivityWindow(days === 0 ? { kind: 'all' } : { kind: 'days', days }); } };
                });
                const chosen = options.find(option => option.checked);
                const current = chosen ? chosen.label : overviewWindow.startsWith('day:') ? `Day ${overviewWindow.slice(4)} (UTC)` : 'All time';
                return <WindowMenu labelledBy={windowId} options={options} current={current} />;
              })()}
            </div>
          </div>
        )}
        {/* OMN-21166: new runs and failures since this browser's last Overview visit, from the served runs. */}
        {pageName === 'overview' && !loading && !error && page && (() => {
          const recent = page.components.find(candidate => candidate.component_id === 'overview-recent-runs');
          const decisions = snapshots.find(snapshot => snapshot.topic === DELEGATION_DECISIONS_TOPIC);
            return recent && decisions && !decisions.failure ? <SinceLastVisit decisions={rowsForLocalComponent(recent, snapshots)} now={now} onOpenFailures={() => navigate('/runs?status=failed')} /> : null;
        })()}
        {/* Live review 2026-10-25: no "Explore runs" button; the sidebar's Runs and Recent runs' "View all runs" lead there. */}
        {/* OMN-21166 AC63: the owning page's summary strip, part of its header, from the same served rows its panels
            read; a read that failed draws no strip (its panels say why). */}
        {!loading && !error && page && pageName === 'runs' && (() => {
          const read = snapshots.find(snapshot => snapshot.topic === DELEGATION_DECISIONS_TOPIC);
          return read && !read.failure ? <RunsKpis rows={read.rows} now={now} complete={read.truncated !== true} /> : null;
        })()}
        {!loading && !error && page && pageName === 'usage' && (() => {
          const read = snapshots.find(snapshot => snapshot.topic === METERING_SUMMARY_TOPIC);
          return read && !read.failure ? <UsageKpis rows={read.rows} /> : null;
        })()}
        {/* OMN-22168 (Lakshman 2026-11-04, superseding the 2026-10-25 waiver of an environment line on Overview). */}
        {pageName === 'overview' && page && (() => {
          const status = page.components.find(candidate => candidate.component_id === 'status-environment');
          const usage = page.components.find(candidate => candidate.component_id === 'overview-model-usage');
          if (!status) return null;
          const record = (value: unknown) => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Row) : null);
          // As TableComponent reads it (OMN-21970 AC3): the decisions read is complete when it walked every page.
          const walk = snapshots.find(snapshot => snapshot.topic === DELEGATION_DECISIONS_TOPIC);
          const meteringRead = snapshots.find(snapshot => snapshot.topic === METERING_SUMMARY_TOPIC);
          return <OverviewStatusStrip env={record(rawRowsFor(status, snapshots, 0)[0])} now={now} window={overviewWindow}
            metering={meteringRead && !meteringRead.failure ? meteringRead.rows : null}
            complete={walk !== undefined && !walk.failure && walk.truncated !== true} decisions={walk?.rows ?? []}
            routing={usage ? record(rawRowsFor(usage, snapshots, 0)[0]) : null} />;
        })()}
      </header>}
      {loading && <p role="status">Loading runtime exposures…</p>}
      {error && <ReadFailureNotice title="Dashboard" now={now}
        snapshot={{ topic: 'page', failure: { kind: error.includes('no answer') ? 'timeout' : 'error', message: error } }}
        onRetry={page ? requestLocalPageRefresh : () => window.location.reload()} />}
      {refreshError && <ReadFailureNotice title="Dashboard connection" now={now}
        snapshot={{ topic: 'catalogue', failure: { kind: refreshError.includes('no answer') ? 'timeout' : 'error', message: refreshError } }}
        savedMessage="Showing saved data. Each panel shows when it was updated." />}
      {/* Part 27: Access whose exposure is not served at all says so once for the section (AccessNotServed). */}
      {embedded && pageName === 'api-keys' && !loading && !error && page && page.components.length > 0
        && page.components.every(component => notServedTopic(component, snapshots) !== null) ? <AccessNotServed />
        : !loading && !error && page && (
        <section className="local-dashboard-grid" aria-label="Dashboard components">
          {pageName === 'overview' ? <>
            <OverviewRunsContext.Provider value={(() => {
              const recent = page.components.find(candidate => candidate.component_id === 'overview-recent-runs');
              return recent ? { decisions: rowsForLocalComponent(recent, snapshots), now } : null;
            })()}>
            <InsightsWindowContext.Provider value={{ window: activityWindow, setWindow: setActivityWindow }}>
            {/* OMN-21166 Maple grid: the KPI strip, then rows of a chart (8 of 12 columns) beside its ranking (4), then
                the recent runs beside quality. The last run is the first recent run, so it sits under "Additional". */}
            <div className="local-overview-surface">
              <section className="local-overview-summary" aria-label="Runtime summary" style={{ '--kpi-count': 5 } as CSSProperties}>
                {renderGroup(overviewGroups.summary)}
                {(() => {
                  const quality = page.components.find(candidate => candidate.component_id === 'overview-quality');
                  return quality ? renderComponent(quality, 'all', { key: 'card', title: 'Delegation Quality', concept: 'quality' }) : null;
                })()}
              </section>
            </div>
            <div className="maple-grid">
              {/* Live review 2026-10-25: no newest-run line and no environment on Overview (requirement Q2 waived by
                  Lakshman); Environment is the System status section of Settings (OMN-21166 part 26 revision 2).
                  Delegation Quality is the fifth card above. */}
              {(() => {
                const insights = page.components.find(candidate => candidate.component_id === 'overview-insights');
                if (!insights) return null;
                const slice = (key: string, title: string, concept: string) => renderComponent(insights, 'all', { key, title, concept });
                // Live review 2026-10-25: "Why runs failed" left Overview (its causes stay on Runs under More analysis);
                // Runs per day sits beside Tier mix and Tokens per day takes the row.
                return <>
                  {/* OMN-22168 (Lakshman 2026-11-04): one line chart, a metric at a time, the full row under the cards. */}
                  <div className="maple-cell maple-cell--full">{renderGroup(['overview-trend'])}</div>
                  {/* Live review 2026-10-25: every bar chart takes the full row. */}
                  {/* Live review 2026-10-25: Model usage, then Tier mix last. */}
                  {/* OMN-21166 part 21 AC139: the four charts in two columns (one under 1100px). */}
                  {/* OMN-22168 (Lakshman 2026-11-04, "these 4 into one bar graph with tab and full size big one"): Runs per
                      day, Tokens per day, Model usage and Tier mix are one full-width row of tabs, one big chart at a time;
                      the chosen tab is kept in the address (?chart=). */}
                  <div className="maple-cell maple-cell--full local-overview-charts">
                    {/* Lakshman 2026-11-04, "give heading to ... bar chart and each tab colourful modern": one titled panel
                        around the tabs; each tab carries its chart's own glyph and colour. */}
                    {/* The frame reads nothing itself (as Runs' "Analysis views"): the chart inside carries its own busy state. */}
                    <Panel className="local-overview-charts-panel" aria-labelledby="overview-charts-title" aria-busy="false" data-width="12">
                      <PanelTitle id="overview-charts-title"><ConceptIcon concept="analysis" label="Activity breakdown" size={14} />Activity breakdown</PanelTitle>
                      {/* Lakshman 2026-11-04 ("make sure all information written is correct"): models and tiers are served all
                          time only (usage-by-model-day counts provider calls, not runs, so it cannot stand in). */}
                      <p className="local-dashboard-caption">{overviewWindow === 'all'
                        ? 'Runs, tokens, models and tiers, all time. Pick a chart.'
                        : 'Runs and tokens for the chosen window; models and tiers are all time. Pick a chart.'}</p>
                      {/* Lakshman 2026-11-04 ("not happy ... use best design and impress user"): stat tabs. Each tab is a small
                        card with its glyph tile, the chart's name and a served headline (the routing view's run total and
                        its model and tier counts; the window's token total, as the Tokens processed card reads it). */}
                    {(() => {
                      const usage = page.components.find(candidate => candidate.component_id === 'overview-model-usage');
                      const routingValue = usage ? rawRowsFor(usage, snapshots, 0)[0] : undefined;
                      const routing = routingValue && typeof routingValue === 'object' && !Array.isArray(routingValue) ? routingValue as Row : null;
                      const metering = snapshots.find(snapshot => snapshot.topic === METERING_SUMMARY_TOPIC);
                      const picked = metering && !metering.failure ? pickMeteringRow(metering.rows, overviewWindow, now) : null;
                      const tokens = picked && 'row' in picked ? meteringTokens(picked.row).total : null;
                      // The runs headline follows the window, as the cards do; all time falls back to the routing total.
                      const windowRuns = picked && 'row' in picked && !isMissing(picked.row.runs_total) ? Number(picked.row.runs_total) : NaN;
                      const runs = Number.isFinite(windowRuns) ? windowRuns
                        : overviewWindow === 'all' && routing && !isMissing(routing.total_delegations) ? Number(routing.total_delegations) : NaN;
                      const models = routing && Array.isArray(routing.by_model) ? routing.by_model.length : null;
                      // Only the tier-routed tiers count, as Tier mix draws them (the served not-tier-routed row is not a tier).
                      const tierRows = routing && routing.by_tier && typeof routing.by_tier === 'object' && Array.isArray((routing.by_tier as Row).tiers)
                        ? asRecords((routing.by_tier as Row).tiers as unknown[]).filter(tier => tier.tier_routed !== false).length : null;
                      const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
                      return <DashboardTabs label="Overview charts" param="chart" tabs={[
                        { id: 'runs', label: 'Runs per day', tone: 'var(--ds-field-runs-daily)', icon: <CalendarRange size={18} />,
                          hint: Number.isFinite(runs) ? `${formatDashboardCount(runs)} runs` : 'Runs not recorded', panel: () => slice('runs', 'Runs per day', 'runs-daily') },
                        { id: 'tokens', label: 'Tokens per day', tone: 'var(--ds-field-tokens-daily)', icon: <ChartArea size={18} />,
                          hint: tokens !== null ? `${formatDashboardCount(tokens)} tokens` : 'Tokens not recorded', panel: () => slice('tokens', 'Tokens per day', 'tokens-daily') },
                        { id: 'models', label: 'Model usage', tone: 'var(--ds-field-runs-model)', icon: <Bot size={18} />,
                          hint: models !== null ? `${plural(models, 'model')}${overviewWindow === 'all' ? '' : ' · all time'}` : 'Models not recorded', panel: () => renderGroup(['overview-model-usage']) },
                        { id: 'tiers', label: 'Tier mix', tone: 'var(--ds-field-tier-mix)', icon: <ChartPie size={18} />,
                          hint: tierRows !== null ? `${plural(tierRows, 'tier')}${overviewWindow === 'all' ? '' : ' · all time'}` : 'Tiers not recorded', panel: () => renderGroup(['overview-tier-mix']) },
                      ]} />;
                    })()}
                    </Panel>
                  </div>
                </>;
              })()}
            </div>
            {/* Live review 2026-10-25 ("not needed in overview"): the Environment panel and "Additional runtime metrics"
                (last run, run locally, saving per call, baseline spend, compression, cache hit rate, spend per day) are
                not drawn on Overview; spend per day and baseline cost are on Usage, the last run is Recent runs' first row. */}
            </InsightsWindowContext.Provider>
            </OverviewRunsContext.Provider>
          </> : pageName === 'usage' ? (() => {
            // OMN-21166 Maple grid: each day chart beside its ranking by model; the rest under one "More usage".
            const find = (id: string) => page.components.find(candidate => candidate.component_id === id);
            const savings = find('usage-savings-series');
            const tokens = find('usage-tokens-by-day');
            const insights = find('usage-insights');
            const byDay = find('usage-by-model-day');
            return <>
              <div className="maple-grid">
                {/* Live review 2026-10-25: the model charts sit side by side as vertical dotted bars between the day charts. */}
                {/* Lakshman 2026-11-05 ("all bar graph should be switched via tabs ... not in overview, check in Runs, Workflow,
                    Usage, Settings"): Usage's seven bar charts are two full-width rows of tabs, one chart at a time, grouped
                    by what they measure; the choice is kept in the address (?money=, ?tokens=). Each hint says what its chart
                    measures; no figure is computed for a hint. */}
                {(savings || insights) && <div className="maple-cell maple-cell--full">
                  <Panel className="local-chart-tabs-panel" aria-labelledby="usage-money-title" aria-busy="false" data-width="12">
                    <PanelTitle id="usage-money-title"><ConceptIcon concept="savings" label="Savings and spend" size={16} />Savings and spend</PanelTitle>
                    <DashboardTabs label="Savings and spend charts" param="money" tabs={[
                      ...(savings ? [
                        { id: 'savings-daily', label: 'Savings per day', tone: 'var(--ds-field-savings-daily)', icon: <ConceptIcon concept="savings-daily" size={18} />,
                          hint: 'Modelled, daily', panel: () => renderComponent(savings) },
                        { id: 'savings-model', label: 'Savings by model', tone: 'var(--ds-field-savings)', icon: <ConceptIcon concept="savings" size={18} />,
                          hint: 'Modelled, by model', panel: () => renderComponent(savings, 'all', { key: 'by-model', title: 'Savings by model', concept: 'savings' }) },
                      ] : []),
                      ...(insights ? [
                        { id: 'spend-model', label: 'Spend by model', tone: 'var(--ds-field-spend-model)', icon: <ConceptIcon concept="spend-model" size={18} />,
                          hint: 'Measured spend', panel: () => renderComponent(insights, 'all', { key: 'spend', title: 'Spend by model', concept: 'spend-model' }) },
                        { id: 'cost-run', label: 'Cost per run', tone: 'var(--ds-field-cost-per-run)', icon: <ConceptIcon concept="cost-per-run" size={18} />,
                          hint: 'Per UTC day', panel: () => renderComponent(insights, 'all', { key: 'cost-per-run', title: 'Cost per run', concept: 'cost-per-run' }) },
                        { id: 'cost-route', label: 'Cost by route', tone: 'var(--ds-field-cost-route)', icon: <ConceptIcon concept="cost-route" size={18} />,
                          hint: 'Measured, by route', panel: () => renderComponent(insights, 'all', { key: 'cost-by-route', title: 'Cost by route', concept: 'cost-route' }) },
                      ] : []),
                    ]} />
                  </Panel>
                </div>}
                {(tokens || insights) && <div className="maple-cell maple-cell--full">
                  <Panel className="local-chart-tabs-panel" aria-labelledby="usage-tokens-title" aria-busy="false" data-width="12">
                    <PanelTitle id="usage-tokens-title"><ConceptIcon concept="tokens" label="Tokens" size={16} />Tokens</PanelTitle>
                    <DashboardTabs label="Token charts" param="tokens" tabs={[
                      ...(tokens ? [{ id: 'tokens-daily', label: 'Tokens per day', tone: 'var(--ds-field-tokens-daily)', icon: <ConceptIcon concept="tokens-daily" size={18} />,
                        hint: 'In and out, by model', panel: () => renderComponent(tokens) }] : []),
                      ...(insights ? [{ id: 'tokens-model', label: 'Tokens by model', tone: 'var(--ds-field-tokens-model)', icon: <ConceptIcon concept="tokens-model" size={18} />,
                        hint: 'In and out, all days', panel: () => renderComponent(insights, 'all', { key: 'tokens-by-model', title: 'Tokens by model', concept: 'tokens-model' }) }] : []),
                    ]} />
                  </Panel>
                </div>}
                {/* Part 29 AC194, AC195: one Usage analysis panel (group-by table and cost versus quality), full row (AC89). */}
                {insights && <div className="maple-cell maple-cell--full">{renderComponent(insights, 'all', { key: 'analysis', title: 'Usage analysis', concept: 'usage-analysis' })}</div>}
                {byDay && <div className="maple-cell maple-cell--full">{renderComponent(byDay)}</div>}
              </div>
            </>;
          })() : pageName === 'runs' ? (
            <InsightsWindowContext.Provider value={{ window: activityWindow, setWindow: setActivityWindow }}>
            <RunChartsSlot.Provider value={runChartsSlot}>
            <RunRoutingSlot.Provider value={runRoutingSlot}>
              {/* OMN-21166 part 13: the run list in view; run charts, routing and analysis in one "More analysis" (part 18
                  AC118); Run locally is Overview's, so Runs does not repeat it. */}
              {page.components.filter(component => !RUNS_SECONDARY.has(component.component_id) && component.component_id !== 'overview-run-locally')
                .map(component => renderComponent(component))}
              {/* Lakshman 2026-11-05 ("don't use this instead open all, no hide the contents"; "run page should be fully
                  organised and logically ... visually attractive"): no "More analysis" fold and no outer frame of two plain
                  tabs. Under the run list, in order: the run charts (one bar per listed run), the run analysis (across the
                  runs), then routing (the tier breakdown and the routing groups), each one full-width row of tabs. */}
              <div className="local-runs-sections">
                <div className="local-run-charts-slot" ref={setRunChartsSlot} />
                {(() => {
                  const insights = page.components.find(component => component.component_id === 'runs-insights');
                  return insights ? renderComponent(insights) : null;
                })()}
                {(() => {
                  const tiers = page.components.find(component => component.component_id === 'runs-tier-mix');
                  return (
                    <Panel className="local-runs-routing-panel" aria-labelledby="runs-routing-title" aria-busy="false">
                      <PanelTitle id="runs-routing-title"><ConceptIcon concept="runs-analysis" label="Routing" size={16} />Routing</PanelTitle>
                      <DashboardTabs label="Routing views" param="routing" tabs={[
                        ...(tiers ? [{ id: 'tiers', label: 'Tier breakdown', tone: 'var(--ds-field-tier-mix)', icon: <ChartPie size={18} />,
                          hint: 'Runs by tier and model', panel: () => renderComponent(tiers) }] : []),
                        { id: 'groups', label: 'Routing groups', tone: 'var(--ds-field-run-routes)', icon: <Layers size={18} />,
                          hint: 'Runs by route', panel: () => <div className="local-run-routing-slot" ref={setRunRoutingSlot} /> },
                      ]} />
                    </Panel>
                  );
                })()}
              </div>
            </RunRoutingSlot.Provider>
            </RunChartsSlot.Provider>
            </InsightsWindowContext.Provider>
          ) : page.components.map(component => renderComponent(component))}
        </section>
      )}
      <dialog ref={chartDialog} className="local-chart-dialog" aria-label={expandedChart ? `${expandedChart.title} full view` : 'Chart full view'}
        onClose={() => { setExpandedChart(null); chartOpener.current?.focus(); }}>
        {expandedChart && page && <>
          <button type="button" className="local-chart-dialog-close" onClick={() => chartDialog.current?.close()} aria-label={`Close ${expandedChart.title} full view`}>
            <X size={16} aria-hidden="true" /><span>Close</span>
          </button>
          {(() => {
            const component = page.components.find(candidate => candidate.component_id === expandedChart.componentId);
            return component ? renderComponent(component, 'all', expandedChart.slice, true) : null;
          })()}
        </>}
      </dialog>
    </Frame>
    </ModelTiersContext.Provider>
    </RunFilterProvider>
  );
}
