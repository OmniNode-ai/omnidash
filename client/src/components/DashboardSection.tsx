import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { StatusLegend } from '@/components/StatusLegend';
import { MockDataBadge } from '@/components/MockDataBadge';
import { ReactNode } from 'react';

interface DashboardSectionProps {
  /**
   * Section title displayed in the card header
   */
  title: string;

  /**
   * Optional description/subtitle below the title
   */
  description?: string;

  /**
   * Whether to show the status legend (green/yellow/red indicators)
   * Default: false
   */
  showStatusLegend?: boolean;

  /**
   * Whether to show the mock data badge indicator
   * Default: false
   */
  showMockBadge?: boolean;

  /**
   * Content to render inside the section (typically a grid of MetricCards)
   */
  children: ReactNode;

  /**
   * Optional CSS class name for the outer Card wrapper
   */
  className?: string;
}

/**
 * DashboardSection - Standard component for wrapping metric card groups
 *
 * Provides consistent structure across all dashboards following the Intelligence Analytics pattern:
 * - Card wrapper with header and content area
 * - Optional status legend for health indicators
 * - Grid layout for metric cards
 *
 * @example
 * ```tsx
 * <DashboardSection
 *   title="Agent Operations"
 *   description="Real-time monitoring of AI agents"
 *   showStatusLegend={true}
 * >
 *   <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
 *     <MetricCard label="Total Agents" value={50} />
 *     <MetricCard label="Active Agents" value={42} status="healthy" />
 *   </div>
 * </DashboardSection>
 * ```
 */
export function DashboardSection({
  title,
  description,
  showStatusLegend = false,
  showMockBadge = false,
  children,
  className = '',
}: DashboardSectionProps) {
  return (
    <Card className={className}>
      <CardHeader className="pb-4">
        {/* Horizontal layout: title/description on left, badges/legend on right */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <CardTitle>{title}</CardTitle>
            {description && <CardDescription className="mt-1.5">{description}</CardDescription>}
          </div>

          {/* Optional mock badge and status legend positioned top-right */}
          {(showMockBadge || showStatusLegend) && (
            <div className="flex items-center gap-3 flex-shrink-0">
              {showMockBadge && <MockDataBadge className="text-xs" />}
              {showStatusLegend && <StatusLegend />}
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent>{children}</CardContent>
    </Card>
  );
}
