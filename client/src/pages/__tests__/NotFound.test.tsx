import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

describe('NotFound page', () => {
  it('displays 404 messaging and helper text', async () => {
    const { default: NotFound } = await import('../not-found');

    render(<NotFound />);

    expect(screen.getByText('404 Page Not Found')).toBeInTheDocument();
    expect(screen.getByText('Did you forget to add the page to the router?')).toBeInTheDocument();
  });
});
