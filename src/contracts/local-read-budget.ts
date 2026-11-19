import { DECISIONS_PAGE_LIMIT_DEFAULT } from '@/config/generated/data-source-defaults';
import type { BoundProjectionSnapshot, LocalPageLoadOptions, LocalPageName } from '@/layout/local-page-loader';

/** Why a local page started a load: the viewer opened it, pressed Refresh, or the page's timer fired. */
export type LocalLoadTrigger = 'mount' | 'manual' | 'timer';

/**
 * OMN-19998: how far one page load may walk the decisions history (the exposure's since-pages): it may not walk it at
 * all. Every page and every trigger — mount, Refresh, timer poll — gets { maxPages: 0 }, one newest-page read.
 *
 * The Runs page keeps its previous rules for all triggers, so a load merges the newest page into the runs the page
 * already holds instead of replacing them:
 *   - held without a failure passes previous = held;
 *   - OMN-24473: when a failed poll left the last good rows on it (lastGoodAt, set by the loader's withLastGood), it
 *     passes held without its failure and lastGoodAt, so mergeNewestDecisions merges into the rows the page keeps;
 *   - every other page, a missing held snapshot, and a failed one with no last good rows read the newest page alone.
 *
 * Why: no dashboard page may walk the run history on a first load, a Refresh or a timer poll. A 120,896-run store
 * costs 201 decisions requests walked end to end and loaded the dev Postgres to 110% CPU; a page load now costs one.
 * Older runs are read only by the viewer's Load more control (the loader's loadMoreDecisions), one page per press.
 */
export function decisionsWalkFor(
  pageName: LocalPageName,
  _trigger: LocalLoadTrigger,
  held: BoundProjectionSnapshot | undefined,
): LocalPageLoadOptions['decisionsWalk'] {
  if (pageName !== 'runs') return { maxPages: 0 };
  if (held === undefined) return { maxPages: 0 };
  if (!held.failure) return { maxPages: 0, previous: held };
  // One failed poll must not cost the page its rows (OMN-24473): rows a good read left behind stay on the snapshot,
  // so the next load merges the newest page into them. mergeNewestDecisions returns the newest page alone when
  // previous.failure is set, so both marks are stripped; a failure without them means nothing good was kept.
  if (typeof held.lastGoodAt !== 'string') return { maxPages: 0 };
  const { failure: _failure, lastGoodAt: _lastGoodAt, ...previous } = held;
  return { maxPages: 0, previous };
}

/**
 * OMN-26056: the decisions record window, declared config (contract.yaml refresh.decisions_page_limit). With a window set,
 * the newest-page read and each Load more page ask the projection API for that many runs; the API serves at most its own
 * page of 500 whatever is asked. With none set (0, today's default) no limit is sent. One run's own row (correlation_id)
 * is never windowed.
 */
export function withDecisionsWindow(params: Readonly<Record<string, string>> | undefined): Readonly<Record<string, string>> | undefined {
  if (DECISIONS_PAGE_LIMIT_DEFAULT <= 0 || params?.correlation_id !== undefined || params?.limit !== undefined) return params;
  return { ...params, limit: String(DECISIONS_PAGE_LIMIT_DEFAULT) };
}
