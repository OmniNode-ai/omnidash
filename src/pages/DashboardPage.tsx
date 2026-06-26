// Green-field dashboard (OMN-13602).
//
// The fixed delegation & savings dashboard. Each surface is a presentational
// section that owns one projection topic via useProjectionQuery (fixtures in dev,
// Jonah's Postgres projection API in prod). Rendered by App.tsx for the
// `dashboard` route, inside FrameLayout's `.main` region below the Header.
//
// The fixed delegation & savings dashboard: hero band (estimated savings +
// delegation across tiers), supporting stat row, tokens band, and the recent-runs
// table — each a section owning one or two projection topics via useProjectionQuery.
import { Text } from '@/components/ui/typography';
import { resolveEffectiveDataSource } from '@/data-source/data-source-override';
import { SavingsHeroSection } from './dashboard/sections/SavingsHeroSection';
import { TierDistributionSection } from './dashboard/sections/TierDistributionSection';
import { SupportingStatsSection } from './dashboard/sections/SupportingStatsSection';
import { TokensSection } from './dashboard/sections/TokensSection';
import { RecentRunsSection } from './dashboard/sections/RecentRunsSection';
import '@/styles/savings-dashboard.css';

export function DashboardPage() {
  // In `file` mode every figure is a representative fixture, not live data.
  // Surface that once, at the top, in addition to each card's own marker.
  const sample = resolveEffectiveDataSource().mode === 'file';

  return (
    <div className="dash-body">
      <div className="sd-page">
        {sample && (
          <div className="sd-banner" role="status">
            <Text as="span" size="md" weight="semibold" color="warn">Sample data</Text>
            <Text as="span" size="md" color="tertiary">
              These are representative fixtures, not live numbers — connect a projection backend for real data.
            </Text>
          </div>
        )}

        <div className="sd-hero">
          <SavingsHeroSection />
          <TierDistributionSection />
        </div>

        <SupportingStatsSection />
        <TokensSection />
        <RecentRunsSection />
      </div>
    </div>
  );
}
