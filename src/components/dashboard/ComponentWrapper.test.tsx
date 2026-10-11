import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TenantNotConfiguredError } from '@/data-source/projection-tenant';
import { ComponentWrapper } from './ComponentWrapper';

describe('ComponentWrapper tenant error state', () => {
  it('renders the typed tenant state for a refused tenant projection', () => {
    render(
      <ComponentWrapper
        title="Tenant widget"
        error={new TenantNotConfiguredError('topic', 'tenant_context_unresolved')}
      >
        <div>widget body</div>
      </ComponentWrapper>,
    );

    expect(document.querySelector('[data-tenant-state="not-configured"]')).toBeInTheDocument();
    expect(screen.getByText('Tenant not configured')).toBeInTheDocument();
    expect(screen.getByText(/Configure the tenant/i)).toBeInTheDocument();
    expect(screen.queryByText(/Error:/i)).not.toBeInTheDocument();
    expect(screen.queryByText('widget body')).not.toBeInTheDocument();
  });

  it('recognizes a typed error reconstructed across a query boundary', () => {
    const reconstructed = Object.assign(new Error('Tenant not configured. cached refusal'), {
      code: 'TENANT_NOT_CONFIGURED',
    });
    render(<ComponentWrapper title="Cached tenant widget" error={reconstructed}><div>widget body</div></ComponentWrapper>);

    expect(document.querySelector('[data-tenant-state="not-configured"]')).toBeInTheDocument();
    expect(screen.queryByText(/Error:/i)).not.toBeInTheDocument();
  });

  it('keeps the generic error state for unrelated errors', () => {
    render(
      <ComponentWrapper title="Error widget" error={new Error('HTTP 500')}>
        <div>widget body</div>
      </ComponentWrapper>,
    );

    expect(screen.getByText('Error: HTTP 500')).toBeInTheDocument();
    expect(document.querySelector('[data-tenant-state="not-configured"]')).not.toBeInTheDocument();
  });
});
