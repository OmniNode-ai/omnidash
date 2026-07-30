import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Providers } from './Providers';

describe('Providers browser authentication boundary', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does not start a second browser OIDC flow when the server owns the session', () => {
    vi.stubEnv('VITE_OIDC_AUTHORITY', 'https://dev.auth.omninode.ai/realms/omninode');
    vi.stubEnv('VITE_OIDC_CLIENT_ID', 'omnidash');

    render(
      <Providers>
        <div>server session content</div>
      </Providers>,
    );

    expect(screen.getByText('server session content')).toBeInTheDocument();
  });
});
