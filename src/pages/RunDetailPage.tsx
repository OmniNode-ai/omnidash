import { Heading, Text } from '@/components/ui/typography';
import { useFrameStore } from '@/store/store';
import type { AppPage } from '@/store/types';
import { useDelegationRuns, type RunRow } from './dashboard/lib/useDelegationRuns';
import { GateBadge } from './dashboard/GateBadge';
import { TIER_LABEL } from './dashboard/lib/modelTier';
import {
  formatUsdCents,
  formatLatency,
  formatRelativeTime,
  formatDateTime,
  formatInt,
  formatCompact,
} from './dashboard/lib/format';
import '@/styles/savings-dashboard.css';

function prettyTask(t: string): string {
  return t.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function copy(text: string | undefined) {
  if (text && navigator.clipboard) void navigator.clipboard.writeText(text);
}

function KV({ k, v, big }: { k: string; v: string; big?: boolean }) {
  return (
    <div className="rd-kv-item">
      <Text as="div" size="xs" color="tertiary" transform="uppercase" weight="semibold">{k}</Text>
      <div className={big ? 'rd-kv-val rd-kv-val-big' : 'rd-kv-val'}>{v}</div>
    </div>
  );
}

function TextPanel({ title, text }: { title: string; text: string | undefined }) {
  return (
    <section className="rd-panel">
      <div className="rd-panel-head">
        <Text as="span" size="xs" color="secondary" transform="uppercase" weight="semibold">{title}</Text>
        <button type="button" className="sd-linkbtn" onClick={() => copy(text)} disabled={!text}>Copy</button>
      </div>
      <div className="rd-panel-body">
        {text
          ? <Text as="p" size="md" color="secondary">{text}</Text>
          : <Text as="p" size="md" color="tertiary">No {title.toLowerCase()} text recorded for this run.</Text>}
      </div>
    </section>
  );
}

function RunDetail({ run }: { run: RunRow }) {
  const openHowCalc = useFrameStore((s) => s.openHowCalc);
  // Per-run token saving: the dollar saving expressed in baseline tokens. Since a
  // cheaper tier ran it for free/less, the avoided baseline tokens equal the run's
  // token count when there was a saving, and zero when the premium tier served it.
  const tokensSaved = run.saved_usd > 0 ? run.tokens : 0;

  return (
    <>
      <section className="sd-card rd-head">
        <Text as="div" size="xs" color="tertiary" transform="uppercase" weight="semibold">Task detail</Text>
        <div className="rd-title">
          <Heading level={2} size="4xl" color="primary">{prettyTask(run.task_type)}</Heading>
          <Text as="span" size="3xl" color="tertiary" family="mono">run {run.session_id.slice(0, 6)}</Text>
        </div>
        <div className="rd-meta">
          <div className="rd-meta-item">
            <Text as="div" size="xs" color="tertiary" transform="uppercase" weight="semibold">Ran</Text>
            <Text as="div" size="md" color="secondary">{formatRelativeTime(run.created_at)} · {formatDateTime(run.created_at)}</Text>
          </div>
          {run.correlation_id && (
            <div className="rd-meta-item">
              <Text as="div" size="xs" color="tertiary" transform="uppercase" weight="semibold">Correlation id</Text>
              <Text as="div" size="md" color="tertiary" family="mono">{run.correlation_id}</Text>
            </div>
          )}
          <div className="rd-meta-item">
            <Text as="div" size="xs" color="tertiary" transform="uppercase" weight="semibold">Task type</Text>
            <Text as="div" size="md" color="secondary" family="mono">{run.task_type}</Text>
          </div>
        </div>
      </section>

      <div className="rd-summary">
        <section className="sd-card rd-served">
          <div className="rd-served-top">
            <div>
              <Text as="div" size="xs" color="tertiary" transform="uppercase" weight="semibold">Served by</Text>
              <div className="rd-served-tier">{TIER_LABEL[run.tier]}</div>
              <Text as="div" size="md" color="tertiary" family="mono">{run.model_name}</Text>
            </div>
            <GateBadge passed={run.gate} />
          </div>

          <div className="rd-kv">
            <KV k="Latency" v={formatLatency(run.latency_ms)} />
            <KV k="Actual cost" v={formatUsdCents(run.cost_usd)} />
            <KV k="Prompt tokens" v={formatInt(run.prompt_tokens)} />
            <KV k="Completion tokens" v={formatInt(run.completion_tokens)} />
          </div>

          <div className="rd-saving">
            <div className="rd-saving-row">
              <Text as="span" size="lg" color="secondary">Estimated saving vs premium baseline</Text>
              <Text as="span" size="3xl" color="primary" weight="semibold">{formatUsdCents(run.saved_usd)}</Text>
            </div>
            <div className="rd-saving-row">
              <Text as="span" size="lg" color="secondary">Tokens saved vs baseline</Text>
              <Text as="span" size="3xl" color="primary" weight="semibold">{formatCompact(tokensSaved)}</Text>
            </div>
            <Text as="p" size="sm" color="tertiary" className="rd-estlabel">
              Baseline {run.baseline_model} (list price) for these tokens, minus what the task actually cost. An estimate, not a charge; reads $0.00 when the premium tier served the task. <button type="button" className="sd-linkbtn" onClick={openHowCalc}>how this is counted</button>
            </Text>
          </div>
        </section>

        <section className="sd-card rd-compliance">
          <Text as="div" size="xs" color="tertiary" transform="uppercase" weight="semibold">Compliance, serving tier</Text>
          <Text as="p" size="md" color="tertiary" className="rd-sub">Re-prompts to reach a contract-valid result on {TIER_LABEL[run.tier]}.</Text>
          <div className="rd-kv">
            <KV k="Compliance attempts" big v={run.compliance_attempts !== undefined ? formatInt(run.compliance_attempts) : '—'} />
            <KV k="Tokens to compliance" big v={run.tokens_to_compliance !== null ? formatInt(run.tokens_to_compliance) : '—'} />
          </div>
          <Text as="p" size="sm" color="tertiary" className="rd-note">
            An attempt is a re-prompt within the serving tier to fix a structural problem. A count above one means the first output failed the contract check and the model was asked again. This is not cross-tier escalation.
          </Text>
        </section>
      </div>

      <div className="rd-panels">
        <TextPanel title="Prompt" text={run.prompt_text} />
        <TextPanel title="Response" text={run.response_text} />
      </div>

      <section className="rd-deferred">
        <div className="rd-deferred-head">
          <Text as="span" size="xs" color="tertiary" transform="uppercase" weight="semibold">Full per-tier ladder</Text>
          <span className="rd-deferred-tag">
            <Text as="span" size="xs" color="tertiary" transform="uppercase" weight="semibold">Deferred · C2a</Text>
          </span>
        </div>
        <div className="rd-deferred-body">
          <Text as="div" size="md" color="tertiary">Not available yet.</Text>
          <Text as="div" size="sm" color="tertiary" className="rd-deferred-muted">
            The ordered record of every tier tried before this one won is not kept today. The platform builds it in memory but drops it at the projection boundary, so the climb can&apos;t be shown. A per-attempt projection would fill this region.
          </Text>
        </div>
        <div className="rd-deferred-strip" aria-hidden="true" />
      </section>

      <Text as="p" size="sm" color="tertiary" className="rd-footnote">
        This task is one unit of delegated work, keyed by correlation id. The saving here is the same estimate the dashboard totals across the period.
      </Text>
    </>
  );
}

/**
 * One delegated run's detail, reached by clicking a run row. Reads the run from
 * the shared useDelegationRuns join by session_id. Lives in the app shell; the
 * back link returns to wherever the run was opened from (dashboard or tasks).
 */
export function RunDetailPage({ runId, from }: { runId?: string; from?: AppPage }) {
  const setActivePage = useFrameStore((s) => s.setActivePage);
  const { rows, isLoading, error } = useDelegationRuns();
  const run = runId ? rows.find((r) => r.session_id === runId) : undefined;
  const backTo: AppPage = from === 'tasks' ? 'tasks' : 'dashboard';
  const backLabel = backTo === 'tasks' ? '← Back to tasks' : '← Back to dashboard';

  return (
    <div className="dash-body">
      <div className="sd-page">
        <button type="button" className="tl-back" onClick={() => setActivePage(backTo)}>{backLabel}</button>
        {isLoading ? (
          <Text as="div" size="lg" color="tertiary" className="tl-state">Loading…</Text>
        ) : error ? (
          <Text as="div" size="lg" color="bad" className="tl-state">Couldn&apos;t load this run: {error.message}</Text>
        ) : !run ? (
          <Text as="div" size="lg" color="tertiary" className="tl-state">That run isn&apos;t in the current data.</Text>
        ) : (
          <RunDetail run={run} />
        )}
      </div>
    </div>
  );
}
