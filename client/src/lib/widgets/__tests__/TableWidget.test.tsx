/**
 * TableWidget Tests
 *
 * Comprehensive tests for the TableWidget component which renders data tables
 * with pagination, sorting, and configurable column formatting.
 */

import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { TableWidget } from '../TableWidget';
import type { WidgetDefinition, WidgetConfigTable, DashboardData } from '@/lib/dashboard-schema';

// Helper to create a widget definition
function createWidget(overrides: Partial<WidgetDefinition> = {}): WidgetDefinition {
  return {
    widget_id: 'test-table-widget',
    title: 'Test Table',
    config: {
      config_kind: 'table',
      columns: [
        { key: 'name', header: 'Name' },
        { key: 'value', header: 'Value' },
      ],
      rows_key: 'rows',
    },
    row: 0,
    col: 0,
    width: 4,
    height: 2,
    ...overrides,
  };
}

// Helper to create a table config
function createConfig(overrides: Partial<WidgetConfigTable> = {}): WidgetConfigTable {
  return {
    config_kind: 'table',
    columns: [
      { key: 'name', header: 'Name' },
      { key: 'value', header: 'Value' },
    ],
    rows_key: 'rows',
    ...overrides,
  };
}

// Sample table data
const sampleRows = [
  { name: 'Alpha', value: 100, status: 'active', updated: '2024-01-15T10:30:00Z' },
  { name: 'Beta', value: 200, status: 'pending', updated: '2024-01-16T14:45:00Z' },
  { name: 'Gamma', value: 150, status: 'failed', updated: '2024-01-17T09:15:00Z' },
  { name: 'Delta', value: 300, status: 'active', updated: '2024-01-18T16:00:00Z' },
  { name: 'Epsilon', value: 50, status: 'warning', updated: '2024-01-19T11:20:00Z' },
];

// Many rows for pagination testing
const manyRows = Array.from({ length: 25 }, (_, i) => ({
  name: `Item ${i + 1}`,
  value: (i + 1) * 10,
  status: i % 2 === 0 ? 'active' : 'pending',
}));

describe('TableWidget', () => {
  it('should render table with columns and rows', () => {
    const widget = createWidget();
    const config = createConfig();
    const data: DashboardData = { rows: sampleRows };

    render(<TableWidget widget={widget} config={config} data={data} />);

    // Check headers
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Value')).toBeInTheDocument();

    // Check data
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText('200')).toBeInTheDocument();
  });

  it('should sort by clicking column header', async () => {
    const user = userEvent.setup();
    const widget = createWidget();
    const config = createConfig({
      columns: [
        { key: 'name', header: 'Name', sortable: true },
        { key: 'value', header: 'Value', sortable: true },
      ],
    });
    const data: DashboardData = { rows: sampleRows };

    render(<TableWidget widget={widget} config={config} data={data} />);

    // Get all table rows (excluding header)
    const rows = screen.getAllByRole('row').slice(1);

    // Initial order - should show Alpha first
    expect(within(rows[0]).getByText('Alpha')).toBeInTheDocument();

    // Click on Name header to sort
    const nameHeader = screen.getByText('Name');
    await user.click(nameHeader);

    // After ascending sort, Alpha should still be first
    const sortedRowsAsc = screen.getAllByRole('row').slice(1);
    expect(within(sortedRowsAsc[0]).getByText('Alpha')).toBeInTheDocument();

    // Click again for descending sort
    await user.click(nameHeader);

    // After descending sort, Gamma should be first (alphabetically last)
    const sortedRowsDesc = screen.getAllByRole('row').slice(1);
    expect(within(sortedRowsDesc[0]).getByText('Gamma')).toBeInTheDocument();
  });

  it('should paginate when data exceeds page_size', async () => {
    const user = userEvent.setup();
    const widget = createWidget();
    const config = createConfig({
      page_size: 5,
      show_pagination: true,
    });
    const data: DashboardData = { rows: manyRows };

    render(<TableWidget widget={widget} config={config} data={data} />);

    // Should show first 5 items
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.getByText('Item 5')).toBeInTheDocument();
    expect(screen.queryByText('Item 6')).not.toBeInTheDocument();

    // Should show pagination info
    expect(screen.getByText('Showing 1-5 of 25')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 5')).toBeInTheDocument();

    // Click next page button (find by icon class since button has no accessible name)
    const buttons = screen.getAllByRole('button');
    const nextPageButton = buttons.find((btn) => btn.querySelector('.lucide-chevron-right'));
    if (nextPageButton) {
      await user.click(nextPageButton);
    }

    // Should now show items 6-10
    expect(screen.queryByText('Item 1')).not.toBeInTheDocument();
    expect(screen.getByText('Item 6')).toBeInTheDocument();
    expect(screen.getByText('Item 10')).toBeInTheDocument();
  });

  it('should format datetime columns', () => {
    const widget = createWidget();
    const config = createConfig({
      columns: [
        { key: 'name', header: 'Name' },
        { key: 'updated', header: 'Last Updated', format: 'datetime' },
      ],
    });
    const data: DashboardData = { rows: sampleRows };

    render(<TableWidget widget={widget} config={config} data={data} />);

    // Datetime should be formatted (format depends on locale)
    // Check that the column header is present
    expect(screen.getByText('Last Updated')).toBeInTheDocument();
    // The datetime value should be present (format varies by locale)
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('should format badge columns', () => {
    const widget = createWidget();
    const config = createConfig({
      columns: [
        { key: 'name', header: 'Name' },
        { key: 'status', header: 'Status', format: 'badge' },
      ],
    });
    const data: DashboardData = { rows: sampleRows };

    render(<TableWidget widget={widget} config={config} data={data} />);

    // Badge should render status values (sampleRows has 2 items with 'active' status)
    expect(screen.getAllByText('active').length).toBe(2);
    expect(screen.getByText('pending')).toBeInTheDocument();
    expect(screen.getByText('failed')).toBeInTheDocument();
  });

  it('should show loading skeleton', () => {
    const widget = createWidget();
    const config = createConfig();
    const data: DashboardData = {};

    render(<TableWidget widget={widget} config={config} data={data} isLoading={true} />);

    // Headers should show skeleton
    const table = screen.getByRole('table');
    expect(table).toBeInTheDocument();

    // Should have multiple skeleton rows
    const skeletonDivs = document.querySelectorAll('.animate-pulse');
    expect(skeletonDivs.length).toBeGreaterThan(0);
  });

  it('should show empty state when no data', () => {
    const widget = createWidget();
    const config = createConfig();
    const data: DashboardData = { rows: [] };

    render(<TableWidget widget={widget} config={config} data={data} />);

    expect(screen.getByText('No data available')).toBeInTheDocument();
  });

  it('should show empty state when rows_key not found', () => {
    const widget = createWidget();
    const config = createConfig({ rows_key: 'missing_key' });
    const data: DashboardData = { other_data: sampleRows };

    render(<TableWidget widget={widget} config={config} data={data} />);

    expect(screen.getByText('No data available')).toBeInTheDocument();
  });

  it('should apply striped styling when configured', () => {
    const widget = createWidget();
    const config = createConfig({ striped: true });
    const data: DashboardData = { rows: sampleRows };

    render(<TableWidget widget={widget} config={config} data={data} />);

    // Check that alternating rows have different styling
    const rows = screen.getAllByRole('row').slice(1); // Exclude header
    // Odd rows (index 1, 3, etc.) should have bg-muted/30 class
    expect(rows[1]).toHaveClass('bg-muted/30');
    expect(rows[3]).toHaveClass('bg-muted/30');
    expect(rows[0]).not.toHaveClass('bg-muted/30');
  });

  it('should apply hover highlight when configured', () => {
    const widget = createWidget();
    const config = createConfig({ hover_highlight: true });
    const data: DashboardData = { rows: sampleRows };

    render(<TableWidget widget={widget} config={config} data={data} />);

    const rows = screen.getAllByRole('row').slice(1);
    rows.forEach((row) => {
      expect(row).toHaveClass('hover:bg-muted/50');
    });
  });

  it('should format number columns', () => {
    const widget = createWidget();
    const config = createConfig({
      columns: [
        { key: 'name', header: 'Name' },
        { key: 'value', header: 'Value', format: 'number' },
      ],
    });
    const data: DashboardData = {
      rows: [{ name: 'Large', value: 1000000 }],
    };

    render(<TableWidget widget={widget} config={config} data={data} />);

    // Number should be formatted with locale
    expect(screen.getByText('1,000,000')).toBeInTheDocument();
  });

  it('should format percent columns', () => {
    const widget = createWidget();
    const config = createConfig({
      columns: [
        { key: 'name', header: 'Name' },
        { key: 'rate', header: 'Success Rate', format: 'percent' },
      ],
    });
    const data: DashboardData = {
      rows: [{ name: 'Test', rate: 95.5 }],
    };

    render(<TableWidget widget={widget} config={config} data={data} />);

    expect(screen.getByText('95.5%')).toBeInTheDocument();
  });

  it('should format currency columns', () => {
    const widget = createWidget();
    const config = createConfig({
      columns: [
        { key: 'name', header: 'Name' },
        { key: 'cost', header: 'Cost', format: 'currency' },
      ],
    });
    const data: DashboardData = {
      rows: [{ name: 'Service', cost: 1234.56 }],
    };

    render(<TableWidget widget={widget} config={config} data={data} />);

    expect(screen.getByText('$1,234.56')).toBeInTheDocument();
  });

  it('should use default sort when configured', () => {
    const widget = createWidget();
    const config = createConfig({
      columns: [
        { key: 'name', header: 'Name', sortable: true },
        { key: 'value', header: 'Value', sortable: true },
      ],
      default_sort_key: 'value',
      default_sort_direction: 'desc',
    });
    const data: DashboardData = { rows: sampleRows };

    render(<TableWidget widget={widget} config={config} data={data} />);

    // With descending sort by value, Delta (300) should be first
    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]).getByText('Delta')).toBeInTheDocument();
    expect(within(rows[0]).getByText('300')).toBeInTheDocument();
  });

  it('should handle null/undefined cell values', () => {
    const widget = createWidget();
    const config = createConfig({
      columns: [
        { key: 'name', header: 'Name' },
        { key: 'optional', header: 'Optional' },
      ],
    });
    const data: DashboardData = {
      rows: [
        { name: 'With Value', optional: 'Present' },
        { name: 'Without Value', optional: null },
        { name: 'Undefined', optional: undefined },
      ],
    };

    render(<TableWidget widget={widget} config={config} data={data} />);

    expect(screen.getByText('Present')).toBeInTheDocument();
    // Null/undefined should show dash
    const dashes = screen.getAllByText('-');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it('should apply column alignment', () => {
    const widget = createWidget();
    const config = createConfig({
      columns: [
        { key: 'name', header: 'Name', align: 'left' },
        { key: 'value', header: 'Value', align: 'right' },
        { key: 'status', header: 'Status', align: 'center' },
      ],
    });
    const data: DashboardData = { rows: sampleRows };

    render(<TableWidget widget={widget} config={config} data={data} />);

    const headers = screen.getAllByRole('columnheader');
    expect(headers[1]).toHaveClass('text-right');
    expect(headers[2]).toHaveClass('text-center');
  });

  it('should reset to first page when sort changes', async () => {
    const user = userEvent.setup();
    const widget = createWidget();
    const config = createConfig({
      columns: [
        { key: 'name', header: 'Name', sortable: true },
        { key: 'value', header: 'Value', sortable: true },
      ],
      page_size: 5,
      show_pagination: true,
    });
    const data: DashboardData = { rows: manyRows };

    render(<TableWidget widget={widget} config={config} data={data} />);

    // Navigate to page 2
    const buttons = screen.getAllByRole('button');
    const nextPageButton = buttons.find((btn) => btn.querySelector('.lucide-chevron-right'));
    if (nextPageButton) {
      await user.click(nextPageButton);
    }

    expect(screen.getByText('Page 2 of 5')).toBeInTheDocument();

    // Click sort - should reset to page 1
    const nameHeader = screen.getByText('Name');
    await user.click(nameHeader);

    expect(screen.getByText('Page 1 of 5')).toBeInTheDocument();
  });
});
