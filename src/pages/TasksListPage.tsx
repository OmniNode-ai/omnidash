import { useMemo, useState } from 'react';
import { Heading, Text } from '@/components/ui/typography';
import { useFrameStore } from '@/store/store';
import { resolveEffectiveDataSource } from '@/data-source/data-source-override';
import { useDelegationRuns } from './dashboard/lib/useDelegationRuns';
import { TIER_LABEL, TIER_ORDER } from './dashboard/lib/modelTier';
import { formatUsdCents, formatLatency, formatRelativeTime } from './dashboard/lib/format';
import { GateBadge } from './dashboard/GateBadge';
import '@/styles/savings-dashboard.css';

const PAGE = 8;

/** "code_review" / "refactor-plan" → "Code review" / "Refactor plan". */
function prettyTask(t: string): string {
  return t.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * The full delegated-task list, reached from "View all tasks" or from a tier-scoped
 * dashboard figure (which seeds the Tier filter via `initialTier`). Lives inside the
 * app shell; filters are real (they narrow the rows) and the count reflects the
 * match. Rows will open run-detail once that view exists; for now the run id is plain.
 */
export function TasksListPage({ initialTier }: { initialTier?: string }) {
  const setActivePage = useFrameStore((s) => s.setActivePage);
  const { rows, isLoading, error } = useDelegationRuns();
  const isSample = resolveEffectiveDataSource().mode === 'file';

  const [tier, setTier] = useState<string>(initialTier ?? '');
  const [model, setModel] = useState<string>('');
  const [taskType, setTaskType] = useState<string>('');
  const [visible, setVisible] = useState(PAGE);

  const models = useMemo(() => [...new Set(rows.map((r) => r.model_name))].sort(), [rows]);
  const taskTypes = useMemo(() => [...new Set(rows.map((r) => r.task_type))].sort(), [rows]);

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (tier === '' || r.tier === tier) &&
          (model === '' || r.model_name === model) &&
          (taskType === '' || r.task_type === taskType),
      ),
    [rows, tier, model, taskType],
  );
  const shown = filtered.slice(0, visible);
  const hasMore = visible < filtered.length;

  // Changing any filter resets pagination to the first page of the new set.
  const onTier = (v: string) => { setTier(v); setVisible(PAGE); };
  const onModel = (v: string) => { setModel(v); setVisible(PAGE); };
  const onTaskType = (v: string) => { setTaskType(v); setVisible(PAGE); };

  return (
    <div className="dash-body">
      <div className="sd-page">
        <button type="button" className="tl-back" onClick={() => setActivePage('dashboard')}>
          ← Back to dashboard
        </button>

        <Heading level={2} color="secondary">Tasks</Heading>
        <Text as="p" size="md" color="tertiary" className="tl-note">
          A snapshot of delegated runs. Filter to narrow the list; a row will open that task&apos;s detail.
        </Text>

        {isSample && (
          <div className="sd-banner" role="status">
            <Text as="span" size="md" weight="semibold" color="warn">Sample data</Text>
            <Text as="span" size="md" color="tertiary">Representative fixtures, not live numbers.</Text>
          </div>
        )}

        <div className="tl-filters">
          <label className="tl-field">
            <Text as="span" size="xs" color="tertiary" transform="uppercase" weight="semibold">Tier</Text>
            <select className="tl-select" value={tier} onChange={(e) => onTier(e.target.value)}>
              <option value="">All tiers</option>
              {TIER_ORDER.map((t) => <option key={t} value={t}>{TIER_LABEL[t]}</option>)}
            </select>
          </label>
          <label className="tl-field">
            <Text as="span" size="xs" color="tertiary" transform="uppercase" weight="semibold">Model</Text>
            <select className="tl-select" value={model} onChange={(e) => onModel(e.target.value)}>
              <option value="">All models</option>
              {models.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label className="tl-field">
            <Text as="span" size="xs" color="tertiary" transform="uppercase" weight="semibold">Task type</Text>
            <select className="tl-select" value={taskType} onChange={(e) => onTaskType(e.target.value)}>
              <option value="">All types</option>
              {taskTypes.map((t) => <option key={t} value={t}>{prettyTask(t)}</option>)}
            </select>
          </label>
          <div className="tl-count">
            <Text as="div" size="xs" color="tertiary" transform="uppercase" weight="semibold">Matching tasks</Text>
            <div className="tl-count-num">{filtered.length}</div>
          </div>
        </div>

        {isLoading ? (
          <Text as="div" size="lg" color="tertiary" className="tl-state">Loading…</Text>
        ) : error ? (
          <Text as="div" size="lg" color="bad" className="tl-state">Couldn&apos;t load tasks: {error.message}</Text>
        ) : filtered.length === 0 ? (
          <Text as="div" size="lg" color="tertiary" className="tl-state">No tasks match these filters.</Text>
        ) : (
          <>
            <table className="sd-table">
              <thead>
                <tr>
                  {(['When', 'Run', 'Served by', 'Task type', 'Gate'] as const).map((h) => (
                    <Text key={h} as="th" size="xs" color="tertiary" transform="uppercase" weight="semibold">{h}</Text>
                  ))}
                  {(['Cost', 'Saved', 'Latency'] as const).map((h) => (
                    <Text key={h} as="th" size="xs" color="tertiary" transform="uppercase" weight="semibold" className="sd-num">{h}</Text>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr
                    key={r.session_id}
                    className="sd-row-link"
                    role="button"
                    tabIndex={0}
                    onClick={() => setActivePage('run-detail', { runId: r.session_id, from: 'tasks' })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setActivePage('run-detail', { runId: r.session_id, from: 'tasks' });
                      }
                    }}
                  >
                    <Text as="td" size="md" color="secondary">{formatRelativeTime(r.created_at)}</Text>
                    <Text as="td" size="md" color="secondary" family="mono">run {r.session_id.slice(0, 6)}</Text>
                    <td>
                      <Text as="div" size="md" color="secondary">{TIER_LABEL[r.tier]}</Text>
                      <Text as="div" size="sm" color="tertiary" family="mono">{r.model_name}</Text>
                    </td>
                    <Text as="td" size="md" color="secondary">{prettyTask(r.task_type)}</Text>
                    <td><GateBadge passed={r.gate} /></td>
                    <Text as="td" size="md" color="secondary" className="sd-num">{formatUsdCents(r.cost_usd)}</Text>
                    <Text as="td" size="md" color={r.saved_usd > 0 ? 'primary' : 'tertiary'} className="sd-num">{formatUsdCents(r.saved_usd)}</Text>
                    <Text as="td" size="md" color="secondary" className="sd-num">{formatLatency(r.latency_ms)}</Text>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="sd-runs-controls">
              {hasMore && (
                <button type="button" className="sd-show-more" onClick={() => setVisible((n) => n + PAGE)}>
                  <Text as="span" size="md" weight="semibold" color="secondary">Load more</Text>
                </button>
              )}
              <Text as="div" size="sm" color="tertiary" className="sd-runs-foot">
                Showing {shown.length} of {filtered.length} matching tasks
              </Text>
            </div>

            <Text as="p" size="sm" color="tertiary" className="tl-footnote">
              Saved is the premium baseline&apos;s cost for these tokens minus what the task actually cost; it reads $0.00 when the premium model served the task. Estimated against claude-opus-4-6.
            </Text>
          </>
        )}
      </div>
    </div>
  );
}
