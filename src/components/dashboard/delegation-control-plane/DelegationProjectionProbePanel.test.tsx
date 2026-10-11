import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TenantNotConfiguredError } from '@/data-source/projection-tenant';
import { DelegationProjectionProbePanel } from './DelegationProjectionProbePanel';
import type { DelegationProjectionProbe } from './delegation-control-plane.types';

const mockContext = vi.hoisted(() => ({ snapshot: null as unknown }));
vi.mock('./DelegationRunContext', () => ({
  useDelegationRunContext: () => ({ snapshot: mockContext.snapshot }),
}));

function probe(overrides: Partial<DelegationProjectionProbe>): DelegationProjectionProbe {
  return {
    key: 'decisions',
    label: 'Decision Rows',
    topic: 'onex.snapshot.projection.delegation.decisions.v1',
    rowCount: 0,
    provisioned: null,
    isLoading: false,
    error: null,
    ...overrides,
  };
}

function renderPanel(probes: DelegationProjectionProbe[], primaryError: Error | null) {
  mockContext.snapshot = { probes, primaryError, isLoading: false };
  return render(<DelegationProjectionProbePanel />);
}

const TENANT_REFUSAL = new TenantNotConfiguredError(
  'onex.snapshot.projection.delegation.decisions.v1',
  'tenant_context_unresolved: no tenant is configured',
);

describe('DelegationProjectionProbePanel tenant refusal (OMN-19994 AC2)', () => {
  it('renders the typed state for the primary error and the probe row, not the message string', () => {
    const { container } = renderPanel([probe({ error: TENANT_REFUSAL })], TENANT_REFUSAL);
    expect(container.querySelectorAll('[data-tenant-state="not-configured"]')).toHaveLength(2);
    expect(screen.queryByText(/tenant_context_unresolved/)).toBeNull();
    expect(screen.queryByText(/Primary error:/)).toBeNull();
  });

  it('recognises a refusal rebuilt across a query boundary by its code', () => {
    const rebuilt = Object.assign(new Error('Tenant not configured. x'), { code: 'TENANT_NOT_CONFIGURED' });
    const { container } = renderPanel([probe({ error: rebuilt })], rebuilt);
    expect(container.querySelectorAll('[data-tenant-state="not-configured"]')).toHaveLength(2);
  });

  it('still prints the message for any other error (the fix must not swallow real failures)', () => {
    const boom = new Error('Projection decisions failed: HTTP 500');
    const { container } = renderPanel([probe({ error: boom })], boom);
    expect(container.querySelector('[data-tenant-state]')).toBeNull();
    expect(screen.getByText(/Primary error: Projection decisions failed: HTTP 500/)).toBeTruthy();
    expect(screen.getAllByText('Projection decisions failed: HTTP 500').length).toBe(1);
  });
});
