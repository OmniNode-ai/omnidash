/**
 * OMN-23330 AC23: the page stylesheets, each with its kit part (AC29), in the order the app loaded them when they were global.
 * Every page shell imports this first, so the page sheets load with the pages that use them, before the components'
 * own stylesheets, as they did from the entry; the app frame's rules stay global in src/styles/frame.
 */
import '@/theme/design-system/kit/local-dashboard.css';
import '@/styles/local-dashboard.css';
import '@/theme/design-system/kit/dashboard-cards.css';
import '@/styles/dashboard-cards.css';
import '@/theme/design-system/kit/seven-page-design.css';
import '@/styles/seven-page-design.css';
import '@/theme/design-system/kit/editorial.css';
import '@/styles/editorial.css';

/** A value of its own, so the bundler keeps this module a chunk that loads with the pages (an empty module joins the entry). */
export const PAGE_SHEETS = ['local-dashboard', 'dashboard-cards', 'seven-page-design', 'editorial'] as const;
