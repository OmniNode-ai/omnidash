import type { BoundProjectionSnapshot, LocalPageLoadOptions, LocalPageName } from './local-page-loader';

/** Why a local page started a load: the viewer opened it, pressed Refresh, or the page's timer fired. */
export type LocalLoadTrigger = 'mount' | 'manual' | 'timer';

/**
 * OMN-19998: how far one page load may walk the decisions history (the exposure's since-pages).
 *
 * Only the Runs page ('runs') lists every run, so only it may walk the history, and only when the viewer opens it
 * (trigger 'mount') or presses Refresh ('manual'): it returns undefined, the loader's full walk. Every other case
 * reads only the newest page (maxPages 0):
 *   - the Runs page on a 'timer' trigger passes previous = held when held exists and has no failure, so the newest
 *     page is merged into the snapshot the page already walked;
 *   - every other page, and a missing or failed held snapshot, read the newest page alone ({ maxPages: 0 }).
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
  if (pageName !== 'runs') return { maxPages: 0 };
  if (trigger === 'timer') return held && !held.failure ? { maxPages: 0, previous: held } : { maxPages: 0 };
  return undefined;
}
