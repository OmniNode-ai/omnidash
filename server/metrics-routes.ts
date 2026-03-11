// SPDX-FileCopyrightText: 2025 OmniNode.ai Inc.
// SPDX-License-Identifier: MIT
//
// metrics-routes.ts
//
// Prometheus-compatible /metrics endpoint exposing omnidash data source
// health gauges for scraping by the cluster's Prometheus instance.
//
// Route: GET /metrics
// Auth: NONE — Prometheus scrapes without tokens. This endpoint MUST NOT
//       be placed behind authentication middleware.
//
// Exposed gauges:
//   omnidash_data_sources_live_count    (gauge)
//   omnidash_data_sources_mock_count    (gauge)
//   omnidash_data_sources_error_count   (gauge)
//   omnidash_data_sources_offline_count (gauge)
//
// The OmnidashDataSourceHealthBelowThreshold PrometheusRule (OMN-4608)
// evaluates omnidash_data_sources_live_count against a threshold of 11.
//
// Ticket: OMN-4609 (OMN-4598 dashboard health regression prevention)

import { Router } from 'express';

export interface DataSourceSummary {
  live: number;
  mock: number;
  error: number;
  offline: number;
  total?: number;
}

/**
 * Render data source health as Prometheus text format.
 *
 * @param summary - Health summary from /api/health/data-sources response
 * @returns Prometheus text format string (text/plain; version=0.0.4)
 */
export function renderDataSourceMetrics(summary: DataSourceSummary): string {
  const lines: string[] = [];

  const gauges: Array<{ name: string; help: string; value: number }> = [
    {
      name: 'omnidash_data_sources_live_count',
      help: 'Number of omnidash data sources currently reporting live status',
      value: summary.live,
    },
    {
      name: 'omnidash_data_sources_mock_count',
      help: 'Number of omnidash data sources currently in mock/demo mode',
      value: summary.mock,
    },
    {
      name: 'omnidash_data_sources_error_count',
      help: 'Number of omnidash data sources currently in error state',
      value: summary.error,
    },
    {
      name: 'omnidash_data_sources_offline_count',
      help: 'Number of omnidash data sources currently offline',
      value: summary.offline,
    },
  ];

  for (const gauge of gauges) {
    lines.push(`# HELP ${gauge.name} ${gauge.help}`);
    lines.push(`# TYPE ${gauge.name} gauge`);
    lines.push(`${gauge.name} ${gauge.value}`);
  }

  // Trailing newline required by Prometheus text format spec
  return lines.join('\n') + '\n';
}

/**
 * Create the /metrics Express router.
 *
 * Dependency injection: pass a `getHealth` function that returns the health
 * response. This avoids circular imports and enables clean unit testing.
 *
 * @param getHealth - Function that returns the data-source health summary
 * @returns Express Router mounted at a path (e.g., app.use('/metrics', ...))
 */
export function createMetricsRouter(
  getHealth: () => Promise<{ summary: DataSourceSummary }>
): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    try {
      const health = await getHealth();
      const body = renderDataSourceMetrics(health.summary);
      res.set('Content-Type', 'text/plain; version=0.0.4');
      res.status(200).send(body);
    } catch {
      // Return a minimal error metric payload so Prometheus scrape doesn't fail entirely
      res.set('Content-Type', 'text/plain; version=0.0.4');
      res.status(500).send('# metrics unavailable\n');
    }
  });

  return router;
}
