import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import userEvent from '@testing-library/user-event';
import { ExportButton } from '../ExportButton';

// Mock URL.createObjectURL and URL.revokeObjectURL
global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = vi.fn();

describe('ExportButton', () => {
  let mockAnchor: HTMLAnchorElement;
  let originalCreateElement: typeof document.createElement;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Save original createElement before any mocking
    originalCreateElement = document.createElement.bind(document);

    // Create a real anchor element to mock
    mockAnchor = originalCreateElement('a') as HTMLAnchorElement;
    mockAnchor.click = vi.fn();

    // Spy on createElement only for 'a' tags, leave others untouched
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') {
        return mockAnchor;
      }
      // For all other tags, use the original createElement
      return originalCreateElement(tag);
    });

    // Mock appendChild and removeChild to track calls but allow normal operation
    const originalAppendChild = document.body.appendChild.bind(document.body);
    const originalRemoveChild = document.body.removeChild.bind(document.body);

    vi.spyOn(document.body, 'appendChild').mockImplementation((node: Node) => {
      if (node === mockAnchor) {
        return node; // Mock anchor, just return it
      }
      return originalAppendChild(node); // Real nodes, use original
    });

    vi.spyOn(document.body, 'removeChild').mockImplementation((node: Node) => {
      if (node === mockAnchor) {
        return node; // Mock anchor, just return it
      }
      return originalRemoveChild(node); // Real nodes, use original
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render export button', () => {
    render(<ExportButton data={{}} filename="test" />);

    expect(screen.getByText('Export')).toBeInTheDocument();
  });

  it('should be disabled when data is null', () => {
    render(<ExportButton data={null} filename="test" />);

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });

  it('should be disabled when disabled prop is true', () => {
    render(<ExportButton data={{}} filename="test" disabled />);

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });

  it('should export data as JSON', async () => {
    const user = userEvent.setup();
    const mockData = { key: 'value', number: 42 };

    render(<ExportButton data={mockData} filename="test-export" />);

    const button = screen.getByRole('button');
    await user.click(button);

    // Wait for dropdown menu to open and find JSON export option
    await waitFor(
      () => {
        expect(screen.getByText('Export as JSON')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    // Click JSON export option
    const jsonOption = screen.getByText('Export as JSON');
    await user.click(jsonOption);

    // Wait a bit for the export to process
    await waitFor(() => {
      expect(global.URL.createObjectURL).toHaveBeenCalled();
    });
  });

  it('should export array data as CSV', async () => {
    const user = userEvent.setup();
    const mockData = [
      { name: 'Item 1', value: 100 },
      { name: 'Item 2', value: 200 },
    ];

    render(<ExportButton data={mockData} filename="csv-export" />);

    const button = screen.getByRole('button');
    await user.click(button);

    await waitFor(
      () => {
        expect(screen.getByText('Export as CSV')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    const csvOption = screen.getByText('Export as CSV');
    await user.click(csvOption);

    await waitFor(() => {
      expect(global.URL.createObjectURL).toHaveBeenCalled();
    });
  });

  it('should handle empty array for CSV export', async () => {
    const user = userEvent.setup();
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    render(<ExportButton data={[]} filename="empty" />);

    const button = screen.getByRole('button');
    await user.click(button);

    await waitFor(
      () => {
        expect(screen.getByText('Export as CSV')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    const csvOption = screen.getByText('Export as CSV');
    await user.click(csvOption);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('No data available to export as CSV.');
    });

    alertSpy.mockRestore();
  });

  it('should handle nested objects in CSV export', async () => {
    const user = userEvent.setup();
    const mockData = [
      { id: 1, user: { name: 'John', email: 'john@example.com' } },
      { id: 2, user: { name: 'Jane', email: 'jane@example.com' } },
    ];

    render(<ExportButton data={mockData} filename="nested" />);

    const button = screen.getByRole('button');
    await user.click(button);

    await waitFor(
      () => {
        expect(screen.getByText('Export as CSV')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    const csvOption = screen.getByText('Export as CSV');
    await user.click(csvOption);

    await waitFor(() => {
      expect(global.URL.createObjectURL).toHaveBeenCalled();
    });
  });

  it('should handle JSON export errors gracefully', async () => {
    const user = userEvent.setup();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    // Create data that will cause an error when stringified
    const errorData: any = {};

    render(<ExportButton data={errorData} filename="error" />);

    const button = screen.getByRole('button');
    await user.click(button);

    await waitFor(
      () => {
        expect(screen.getByText('Export as JSON')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    // Mock JSON.stringify only for the export call
    const originalStringify = JSON.stringify;
    const stringifySpy = vi
      .spyOn(JSON, 'stringify')
      .mockImplementation((value: any, ...args: any[]) => {
        // Only throw for our test data
        if (value === errorData) {
          throw new Error('Circular reference');
        }
        return originalStringify(value, ...args);
      });

    const jsonOption = screen.getByText('Export as JSON');
    await user.click(jsonOption);

    await waitFor(() => {
      expect(consoleError).toHaveBeenCalled();
      expect(alertSpy).toHaveBeenCalled();
    });

    stringifySpy.mockRestore();
    consoleError.mockRestore();
    alertSpy.mockRestore();
  });
});
