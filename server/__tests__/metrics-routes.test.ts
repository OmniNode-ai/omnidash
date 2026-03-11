// SPDX-FileCopyrightText: 2025 OmniNode.ai Inc.
// SPDX-License-Identifier: MIT
//
// metrics-routes.test.ts
//
// Unit tests for renderDataSourceMetrics and createMetricsRouter.
//
// Ticket: OMN-4609 (OMN-4598 dashboard health regression prevention)

import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { renderDataSourceMetrics, createMetricsRouter } from '../metrics-routes';

describe('renderDataSourceMetrics', () => {
  it('renders all 4 gauges in Prometheus text format for given summary', () => {
    const summary = { live: 11, mock: 1, error: 0, offline: 2 };
    const output = renderDataSourceMetrics(summary);

    expect(output).toContain('omnidash_data_sources_live_count 11');
    expect(output).toContain('# TYPE omnidash_data_sources_live_count gauge');
    expect(output).toContain('omnidash_data_sources_mock_count 1');
    expect(output).toContain('omnidash_data_sources_error_count 0');
    expect(output).toContain('omnidash_data_sources_offline_count 2');
    // Trailing newline required by Prometheus text format spec
    expect(output.endsWith('\n')).toBe(true);
  });
});

describe('createMetricsRouter', () => {
  it('returns 200 with Prometheus text body when getHealth resolves', async () => {
    const getHealth = vi.fn().mockResolvedValue({
      summary: { live: 11, mock: 1, error: 0, offline: 2 },
    });

    const app = express();
    app.use('/metrics', createMetricsRouter(getHealth));

    const res = await request(app).get('/metrics');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toContain('omnidash_data_sources_live_count 11');
    expect(res.text).toContain('# TYPE omnidash_data_sources_live_count gauge');
  });

  it('returns 500 with # metrics unavailable when getHealth throws', async () => {
    const getHealth = vi.fn().mockRejectedValue(new Error('DB unavailable'));

    const app = express();
    app.use('/metrics', createMetricsRouter(getHealth));

    const res = await request(app).get('/metrics');

    expect(res.status).toBe(500);
    expect(res.text).toContain('# metrics unavailable');
  });
});
