/**
 * OMN-26623: delegation-quality section of the local dashboard.
 * Last weeks (copy.weeks) of first-try pass rate and moves down the chain,
 * filterable by task type and model, read from delegation.quality-weekly.v1.
 * Every word comes from delegation-quality.config.json and every look from the
 * design system; a week with no runs reads copy.no_runs, never 0%.
 */
import { useMemo, useState } from 'react';
import { DataTable, Dropdown } from '@/theme/design-system/components';
import { formatDashboardCount, formatShare } from '@/theme/format';
import { modelOrUnknown } from './page-shared';
import copy from './delegation-quality.config.json';

export type DelegationQualityCopy = typeof copy;

export interface QualityCell {
  iso_week: string;
  week_start: string;
  task_type: string | null;
  model_id: string | null;
  runs: number;
  first_try_passes: number;
  moved_down_chain: number;
  first_try_pass_rate: number | null;
  moved_down_chain_rate: number | null;
}

export interface WeekFigures {
  week: string;
  runs: number;
  firstTryPasses: number;
  moved: number;
  firstTryRate: number | null;
  movedRate: number | null;
}

const ALL = '';
const DAY_MS = 86_400_000;
const WEEK_MS = DAY_MS * 7;

export function isoWeekOf(time: number): string {
  const d = new Date(time);
  const weekday = (d.getUTCDay() + 6) % 7;
  const thursday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - weekday + 3);
  const year = new Date(thursday).getUTCFullYear();
  const week = Math.floor((thursday - Date.UTC(year, 0, 1)) / WEEK_MS) + 1;
  return year + '-W' + String(week).padStart(2, '0');
}

export function lastWeeks(now: number, count: number): string[] {
  return Array.from({ length: count }, (_, index) => isoWeekOf(now - index * WEEK_MS));
}

export function cellsOf(rows: readonly unknown[]): QualityCell[] {
  const row = rows[0];
  if (!row || typeof row !== 'object') return [];
  const cells = (row as { cells?: unknown }).cells;
  if (cells == null) return [];
  const parsed = typeof cells === 'string' ? JSON.parse(cells) : cells;
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((cell): cell is QualityCell => typeof cell === 'object' && cell !== null);
}

export function weekFigures(
  cells: readonly QualityCell[],
  weeks: readonly string[],
  taskType: string,
  model: string,
): WeekFigures[] {
  return weeks.map((week) => {
    const matching = cells.filter(
      (cell) =>
        cell.iso_week === week &&
        (taskType === ALL || cell.task_type === taskType) &&
        (model === ALL || cell.model_id === model),
    );
    const runs = matching.reduce((sum, cell) => sum + cell.runs, 0);
    const firstTryPasses = matching.reduce((sum, cell) => sum + cell.first_try_passes, 0);
    const moved = matching.reduce((sum, cell) => sum + cell.moved_down_chain, 0);
    return {
      week,
      runs,
      firstTryPasses,
      moved,
      firstTryRate: runs === 0 ? null : firstTryPasses / runs,
      movedRate: runs === 0 ? null : moved / runs,
    };
  });
}

export function DelegationQualitySection({
  rows,
  now = Date.now(),
  words = copy,
}: {
  rows: readonly unknown[];
  now?: number;
  words?: DelegationQualityCopy;
}) {
  const [taskType, setTaskType] = useState(ALL);
  const [model, setModel] = useState(ALL);
  const cells = useMemo(() => cellsOf(rows), [rows]);
  const weeks = lastWeeks(now, words.weeks);
  const figures = weekFigures(cells, weeks, taskType, model);

  const taskTypeValues = Array.from(
    new Set(cells.map((cell) => cell.task_type).filter((value): value is string => value !== null)),
  ).sort();
  const taskOptions = [
    { value: ALL, label: words.all_option },
    ...taskTypeValues.map((value) => ({ value, label: value })),
  ];

  const modelValues = Array.from(
    new Set(cells.map((cell) => cell.model_id).filter((value): value is string => value !== null)),
  ).sort();
  const modelOptions = [
    { value: ALL, label: words.all_option },
    ...modelValues.map((value) => ({ value, label: modelOrUnknown(value) })),
  ];

  return (
    <section data-delegation-quality aria-label={words.title}>
      <div className="local-dashboard-toggles">
        <Dropdown label={words.task_type_label} value={taskType} options={taskOptions} onChange={setTaskType} />
        <Dropdown label={words.model_label} value={model} options={modelOptions} onChange={setModel} />
      </div>
      <DataTable aria-label={words.table_label}>
        <thead>
          <tr>
            <th scope="col">{words.week_header}</th>
            <th scope="col">{words.runs_header}</th>
            <th scope="col">{words.first_try_header}</th>
            <th scope="col">{words.moved_header}</th>
          </tr>
        </thead>
        <tbody>
          {figures.map((figure) => (
            <tr key={figure.week} data-week={figure.week}>
              <th scope="row">{figure.week}</th>
              <td data-figure="runs">{formatDashboardCount(figure.runs)}</td>
              <td data-figure="first-try">
                {figure.firstTryRate === null ? words.no_runs : formatShare(figure.firstTryRate)}
              </td>
              <td data-figure="moved">
                {figure.movedRate === null ? words.no_runs : formatShare(figure.movedRate)}
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </section>
  );
}
