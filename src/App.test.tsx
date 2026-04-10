import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Providers } from './providers/Providers';
import { App } from './App';

describe('App', () => {
  it('renders the root element', () => {
    render(
      <Providers>
        <App />
      </Providers>
    );
    expect(screen.getByText('omnidash v2')).toBeInTheDocument();
  });
});
