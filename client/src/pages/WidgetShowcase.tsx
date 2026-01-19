/**
 * Widget Showcase Page
 *
 * Tests all 5 contract-driven widget types with mock data.
 * Route: /showcase
 */

import { useState } from 'react';
import { DashboardRenderer } from '@/lib/widgets';
import {
  widgetShowcaseDashboardConfig,
  widgetShowcaseMockData,
} from '@/lib/configs/widget-showcase';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

export default function WidgetShowcase() {
  const [isLoading, setIsLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const handleRefresh = () => {
    setIsLoading(true);
    // Simulate refresh
    setTimeout(() => {
      setIsLoading(false);
      setLastRefresh(new Date());
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Widget Showcase</h1>
              <p className="text-sm text-muted-foreground">
                Testing all 5 contract-driven widget types
              </p>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-muted-foreground">
                Last refresh: {lastRefresh.toLocaleTimeString()}
              </span>
              <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Widget Type Legend */}
      <div className="container mx-auto px-4 py-4">
        <Card className="p-4 mb-4">
          <h3 className="text-sm font-semibold mb-2">Widget Types Being Tested:</h3>
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-chart-1" />
              <span>MetricCard (4)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-chart-2" />
              <span>Chart - Line, Bar, Pie (3)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-chart-3" />
              <span>Table (1)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-chart-4" />
              <span>StatusGrid (1)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-chart-5" />
              <span>EventFeed (1)</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Dashboard Content */}
      <div className="container mx-auto px-4 pb-8">
        <DashboardRenderer
          config={widgetShowcaseDashboardConfig}
          data={widgetShowcaseMockData}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
