/**
 * Tests for cross-repo validation routes and event handlers.
 *
 * @see OMN-1907 - Cross-Repo Validation Dashboard Integration
 */

import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import validationRoutes, {
  handleValidationRunStarted,
  handleValidationViolationsBatch,
  handleValidationRunCompleted,
} from '../validation-routes';
import type {
  ValidationRunStartedEvent,
  ValidationViolationsBatchEvent,
  ValidationRunCompletedEvent,
} from '@shared/validation-types';

// ============================================================================
// Test App Setup
// ============================================================================

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/validation', validationRoutes);
  return app;
}

// ============================================================================
// Event Handler Unit Tests
// ============================================================================

describe('Validation Event Handlers', () => {
  // Since the in-memory store is module-scoped, we use unique run_ids per test

  it('handleValidationRunStarted creates a new run', async () => {
    const event: ValidationRunStartedEvent = {
      event_type: 'ValidationRunStarted',
      run_id: 'test-run-001',
      repos: ['omnibase_core', 'omnidash'],
      validators: ['schema-validator', 'contract-validator'],
      triggered_by: 'ci',
      timestamp: new Date().toISOString(),
    };

    handleValidationRunStarted(event);

    const app = createApp();
    const res = await request(app).get('/api/validation/runs/test-run-001');
    expect(res.status).toBe(200);
    expect(res.body.run_id).toBe('test-run-001');
    expect(res.body.status).toBe('running');
    expect(res.body.repos).toEqual(['omnibase_core', 'omnidash']);
    expect(res.body.violations).toEqual([]);
  });

  it('handleValidationViolationsBatch appends violations to a run', async () => {
    const startEvent: ValidationRunStartedEvent = {
      event_type: 'ValidationRunStarted',
      run_id: 'test-run-002',
      repos: ['repo-a'],
      validators: ['v1'],
      timestamp: new Date().toISOString(),
    };
    handleValidationRunStarted(startEvent);

    const batchEvent: ValidationViolationsBatchEvent = {
      event_type: 'ValidationViolationsBatch',
      run_id: 'test-run-002',
      violations: [
        {
          rule_id: 'SCHEMA-001',
          severity: 'error',
          message: 'Missing required field',
          repo: 'repo-a',
          validator: 'v1',
        },
        {
          rule_id: 'SCHEMA-002',
          severity: 'warning',
          message: 'Deprecated field used',
          repo: 'repo-a',
          validator: 'v1',
        },
      ],
      batch_index: 0,
      timestamp: new Date().toISOString(),
    };
    handleValidationViolationsBatch(batchEvent);

    const app = createApp();
    const res = await request(app).get('/api/validation/runs/test-run-002');
    expect(res.status).toBe(200);
    expect(res.body.violations).toHaveLength(2);
    expect(res.body.total_violations).toBe(2);
    expect(res.body.violations_by_severity).toEqual({ error: 1, warning: 1 });
  });

  it('handleValidationViolationsBatch ignores unknown run_id', async () => {
    handleValidationViolationsBatch({
      event_type: 'ValidationViolationsBatch',
      run_id: 'nonexistent-batch-run',
      violations: [
        { rule_id: 'R1', severity: 'error', message: 'test', repo: 'r', validator: 'v' },
      ],
      batch_index: 0,
      timestamp: new Date().toISOString(),
    });

    // Verify the unknown run was not created
    const app = createApp();
    const res = await request(app).get('/api/validation/runs/nonexistent-batch-run');
    expect(res.status).toBe(404);
  });

  it('handleValidationRunCompleted marks run as finished', async () => {
    const startEvent: ValidationRunStartedEvent = {
      event_type: 'ValidationRunStarted',
      run_id: 'test-run-003',
      repos: ['repo-b'],
      validators: ['v1'],
      timestamp: new Date().toISOString(),
    };
    handleValidationRunStarted(startEvent);

    const completedEvent: ValidationRunCompletedEvent = {
      event_type: 'ValidationRunCompleted',
      run_id: 'test-run-003',
      status: 'passed',
      total_violations: 0,
      duration_ms: 1234,
      timestamp: new Date().toISOString(),
    };
    handleValidationRunCompleted(completedEvent);

    const app = createApp();
    const res = await request(app).get('/api/validation/runs/test-run-003');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('passed');
    expect(res.body.duration_ms).toBe(1234);
  });

  it('handleValidationRunCompleted ignores unknown run_id', async () => {
    handleValidationRunCompleted({
      event_type: 'ValidationRunCompleted',
      run_id: 'nonexistent-completed-run',
      status: 'passed',
      total_violations: 0,
      duration_ms: 100,
      timestamp: new Date().toISOString(),
    });

    // Verify the unknown run was not created
    const app = createApp();
    const res = await request(app).get('/api/validation/runs/nonexistent-completed-run');
    expect(res.status).toBe(404);
  });
});

// ============================================================================
// Route Tests
// ============================================================================

describe('Validation Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    app = createApp();
  });

  describe('GET /api/validation/runs', () => {
    it('should return runs list', async () => {
      // Seed a run
      handleValidationRunStarted({
        event_type: 'ValidationRunStarted',
        run_id: 'route-test-001',
        repos: ['repo-x'],
        validators: ['v1'],
        timestamp: new Date().toISOString(),
      });

      const res = await request(app).get('/api/validation/runs');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('runs');
      expect(res.body).toHaveProperty('total');
      expect(Array.isArray(res.body.runs)).toBe(true);
    });

    it('should filter by status', async () => {
      const res = await request(app).get('/api/validation/runs?status=passed');
      expect(res.status).toBe(200);
      // All returned runs should be passed (if any)
      for (const run of res.body.runs) {
        expect(run.status).toBe('passed');
      }
    });
  });

  describe('GET /api/validation/runs/:runId', () => {
    it('should return 404 for unknown run', async () => {
      const res = await request(app).get('/api/validation/runs/unknown-id');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Validation run not found');
    });
  });

  describe('GET /api/validation/summary', () => {
    it('should return summary stats', async () => {
      const res = await request(app).get('/api/validation/summary');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('total_runs');
      expect(res.body).toHaveProperty('pass_rate');
      expect(res.body).toHaveProperty('repos');
      expect(res.body).toHaveProperty('total_violations_by_severity');
    });
  });

  describe('GET /api/validation/repos/:repoId/trends', () => {
    it('should return trend data for a repo', async () => {
      const res = await request(app).get('/api/validation/repos/repo-x/trends');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('repo', 'repo-x');
      expect(res.body).toHaveProperty('trend');
      expect(Array.isArray(res.body.trend)).toBe(true);
    });
  });
});
