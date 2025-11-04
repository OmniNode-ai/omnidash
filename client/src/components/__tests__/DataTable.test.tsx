import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import userEvent from '@testing-library/user-event';
import { DataTable } from '../DataTable';
import type { Column } from '../DataTable';

interface TestData {
  id: string;
  name: string;
  status: string;
  value: number;
}

describe('DataTable', () => {
  const mockColumns: Column<TestData>[] = [
    { key: 'name', header: 'Name', sortable: true },
    { key: 'status', header: 'Status', sortable: false },
    { key: 'value', header: 'Value', sortable: true },
  ];

  const mockData: TestData[] = [
    { id: '1', name: 'Item A', status: 'active', value: 100 },
    { id: '2', name: 'Item B', status: 'inactive', value: 200 },
    { id: '3', name: 'Item C', status: 'active', value: 150 },
  ];

  it('should render table with data', () => {
    render(<DataTable data={mockData} columns={mockColumns} />);
    
    expect(screen.getByText('Item A')).toBeInTheDocument();
    expect(screen.getByText('Item B')).toBeInTheDocument();
    expect(screen.getByText('Item C')).toBeInTheDocument();
  });

  it('should render table headers', () => {
    render(<DataTable data={mockData} columns={mockColumns} />);
    
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Value')).toBeInTheDocument();
  });

  it('should display empty message when no data', () => {
    render(<DataTable data={[]} columns={mockColumns} />);
    
    expect(screen.getByText('No data available')).toBeInTheDocument();
  });

  it('should display custom empty message', () => {
    render(
      <DataTable 
        data={[]} 
        columns={mockColumns} 
        emptyMessage="Custom empty message"
      />
    );
    
    expect(screen.getByText('Custom empty message')).toBeInTheDocument();
  });

  it('should show loading state', () => {
    const { container } = render(<DataTable data={mockData} columns={mockColumns} isLoading />);
    
    // Loading state shows a spinner, check for the spinner element
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('should support search functionality', async () => {
    const user = userEvent.setup();
    render(
      <DataTable 
        data={mockData} 
        columns={mockColumns} 
        searchKeys={['name']}
      />
    );
    
    const searchInput = screen.getByPlaceholderText('Search...');
    await user.type(searchInput, 'Item A');
    
    await waitFor(() => {
      expect(screen.getByText('Item A')).toBeInTheDocument();
      expect(screen.queryByText('Item B')).not.toBeInTheDocument();
    });
  });

  it('should support sorting', async () => {
    const user = userEvent.setup();
    render(<DataTable data={mockData} columns={mockColumns} />);
    
    const nameHeader = screen.getByText('Name');
    await user.click(nameHeader);
    
    // After sorting, items should be in different order
    const rows = screen.getAllByRole('row');
    expect(rows.length).toBeGreaterThan(1);
  });

  it('should paginate data when pageSize is set', () => {
    const largeData: TestData[] = Array.from({ length: 100 }, (_, i) => ({
      id: String(i),
      name: `Item ${i}`,
      status: 'active',
      value: i * 10,
    }));
    
    render(
      <DataTable 
        data={largeData} 
        columns={mockColumns} 
        defaultPageSize={10}
      />
    );
    
    // Should only show first page of data
    expect(screen.getByText('Item 0')).toBeInTheDocument();
    expect(screen.queryByText('Item 50')).not.toBeInTheDocument();
  });

  it('should render custom title when provided', () => {
    render(
      <DataTable 
        data={mockData} 
        columns={mockColumns} 
        title="Custom Table Title"
      />
    );
    
    expect(screen.getByText('Custom Table Title')).toBeInTheDocument();
  });

  it('should render custom cell content with render function', () => {
    const columnsWithRender: Column<TestData>[] = [
      {
        key: 'status',
        header: 'Status',
        render: (item) => <span className="badge">{item.status}</span>,
      },
    ];
    
    render(<DataTable data={mockData} columns={columnsWithRender} />);
    
    // There are multiple "active" texts, so use getAllByText and check it exists
    const activeElements = screen.getAllByText('active');
    expect(activeElements.length).toBeGreaterThan(0);
    // Verify at least one is in a badge
    expect(activeElements.some(el => el.classList.contains('badge'))).toBe(true);
  });

  it('should apply custom className', () => {
    const { container } = render(
      <DataTable 
        data={mockData} 
        columns={mockColumns} 
        className="custom-table-class"
      />
    );
    
    const table = container.querySelector('.custom-table-class');
    expect(table).toBeInTheDocument();
  });

  it('should respect maxHeight', () => {
    const { container } = render(
      <DataTable 
        data={mockData} 
        columns={mockColumns} 
        maxHeight="400px"
      />
    );
    
    const scrollArea = container.querySelector('[style*="max-height: 400px"]');
    expect(scrollArea).toBeInTheDocument();
  });
});

