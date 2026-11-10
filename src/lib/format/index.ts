/**
 * OMN-23330 AC19: the one module that formats money, counts, percentages, dates and durations for every page. Number and
 * date formatting calls (toFixed, toLocaleString, toLocaleDateString, toLocaleTimeString) live only under this folder
 * (AC20, enforced by local/no-adhoc-format), so a figure reads the same wherever it is drawn.
 */
export { formatDashboardCount, formatFullCount, wholeCount } from './count';
export { formatUsd, usdFractionDigits } from './currency';
export { formatDashboardUsd } from './dashboard-currency';
export { exactMs, formatDuration } from './duration';
export { readableTime } from './readable-time';
export { formatShare, formatShortDay } from './share-and-day';
export { fixed, localeDate, localeString, localeTime } from './primitives';
