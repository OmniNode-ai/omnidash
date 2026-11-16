import type { BoundProjectionSnapshot, LocalPageLoadOptions, LocalPageName } from '@/layout/local-page-loader';

/** Why a local page started a load: the viewer opened it, pressed Refresh, or the page's timer fired. */
export type LocalLoadTrigger = 'mount' | 'manual' | 'timer';

/**
 * OMN-19998: how far one page load may walk the decisions history (the exposure's since-pages).
 *
 * Only the Runs page ('runs') lists every run, so only it may walk the history, and only when the viewer opens it
 * (trigger 'mount') or presses Refresh ('manual'): it returns undefined, the loader's full walk. Every other case
 * reads only the newest page (maxPages 0):
 *   - the Runs page on a 'timer' trigger passes previous = held when held exists and has no failure; OMN-24473: also
 *     when a failed poll left the last good rows on it (lastGoodAt, set by the loader's withLastGood), passing held
 *     without its failure and lastGoodAt so mergeNewestDecisions merges into the history the page already walked;
 *   - every other page, a missing held snapshot, and a failed one with no last good rows read the newest page alone
 *     ({ maxPages: 0 }).
 *
 * Why: a page's timer poll must never walk the whole run history. The decisions exposure's since-pages used to be
 * read every poll, and the dev runtime was loaded by ~180 requests a minute from the Overview page doing exactly
 * that every 30 s (a 120,896-run store costs 201 decisions requests per poll; a poll now costs one).
 */
export function decisionsWalkFor(
  pageName: LocalPageName,
  trigger: LocalLoadTrigger,
  held: BoundProjectionSnapshot | undefined,
): LocalPageLoadOptions['decisionsWalk'] {
  // OMN-24616 AC1 (decision D1): Usage's analysis is a window figure too, so it walks every page as Runs does.
  if (pageName !== 'runs' && pageName !== 'usage') return { maxPages: 0 };
  if (trigger !== 'timer') return undefined;
  if (held === undefined) return { maxPages: 0 };
  if (!held.failure) return { maxPages: 0, previous: held };
  // One failed poll must not cost the page its full history (OMN-24473): rows a good read left behind stay on the
  // snapshot, so the next poll merges the newest page into them. mergeNewestDecisions returns the newest page alone
  // when previous.failure is set, so both marks are stripped; a failure without them means nothing good was kept.
  if (typeof held.lastGoodAt !== 'string') return { maxPages: 0 };
  const { failure: _failure, lastGoodAt: _lastGoodAt, ...previous } = held;
  return { maxPages: 0, previous };
}
