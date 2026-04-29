import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { DataTable } from '../DataTable';
import type { DataTableColumnConfig } from '@shared/types/chart-config';
import type { IDataTableAdapter } from '@shared/types/chart-adapter-table';

interface TestRow extends Record<string, unknown> {
  id: string;
  name: string;
  score: number;
  tag: string;
}

const COLUMNS: DataTableColumnConfig[] = [
  { field: 'id',    header: 'ID',    sortable: false, searchable: false },
  { field: 'name',  header: 'Name',  sortable: true,  searchable: true  },
  { field: 'score', header: 'Score', sortable: true,  searchable: false },
  { field: 'tag',   header: 'Tag',   sortable: false, searchable: true  },
];

function buildTestRows(count: number): TestRow[] {
  return Array.from({ length: count }, (_, i) => ({
    id:    `id-${i}`,
    name:  `Item ${String(i).padStart(3, '0')}`,
    score: count - i,
    tag:   i % 3 === 0 ? 'alpha' : i % 3 === 1 ? 'beta' : 'gamma',
  }));
}

// --- interface conformance (compile-time) ---
// If `DataTable` does not satisfy `IDataTableAdapter<TestRow>`, this
// assignment will fail at tsc time.
const _conformanceCheck: IDataTableAdapter<TestRow> = DataTable as IDataTableAdapter<TestRow>;
void _conformanceCheck;

// --- empty-state reasons ---

describe('DataTable — empty state', () => {
  it('renders default empty message when projectionData is empty', () => {
    render(
      <DataTable
        projectionData={[]}
        columns={COLUMNS}
        emptyState={{ defaultMessage: 'Nothing here' }}
      />,
    );
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });

  it('renders fallback message when emptyState is omitted', () => {
    render(<DataTable projectionData={[]} columns={COLUMNS} />);
    expect(screen.getByText('No data')).toBeInTheDocument();
  });

  it('renders datatable-container test-id in empty state', () => {
    render(<DataTable projectionData={[]} columns={COLUMNS} />);
    expect(screen.getByTestId('datatable-container')).toBeInTheDocument();
  });
});

// --- populated + testids ---

describe('DataTable — rows and testids', () => {
  it('renders datatable-container test-id when populated', () => {
    render(<DataTable projectionData={buildTestRows(3)} columns={COLUMNS} />);
    expect(screen.getByTestId('datatable-container')).toBeInTheDocument();
  });

  it('renders datatable-row-{index} for each visible row', () => {
    render(<DataTable projectionData={buildTestRows(5)} columns={COLUMNS} pageSize={25} />);
    for (let i = 0; i < 5; i++) {
      expect(screen.getByTestId(`datatable-row-${i}`)).toBeInTheDocument();
    }
  });
});

// --- sort ---

describe('DataTable — sortable behavior', () => {
  it('clicking a sortable column header sorts ascending', () => {
    const rows = buildTestRows(5);
    render(<DataTable projectionData={rows} columns={COLUMNS} pageSize={25} />);

    const scoreBtn = screen.getByRole('button', { name: /sort by score/i });
    fireEvent.click(scoreBtn);

    const visibleRows = screen
      .getAllByTestId(/^datatable-row-/)
      .map((el) => {
        const cells = within(el).getAllByRole('cell');
        return cells[2]?.textContent ?? '';
      });

    const scores = visibleRows.map(Number);
    expect(scores).toEqual([...scores].sort((a, b) => a - b));
  });

  it('clicking a sortable column twice sorts descending', () => {
    const rows = buildTestRows(5);
    render(<DataTable projectionData={rows} columns={COLUMNS} pageSize={25} />);

    const scoreBtn = screen.getByRole('button', { name: /sort by score/i });
    fireEvent.click(scoreBtn);
    fireEvent.click(scoreBtn);

    const visibleRows = screen
      .getAllByTestId(/^datatable-row-/)
      .map((el) => {
        const cells = within(el).getAllByRole('cell');
        return cells[2]?.textContent ?? '';
      });

    const scores = visibleRows.map(Number);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });
});

// --- search ---

describe('DataTable — searchable behavior', () => {
  it('filters rows by searchable field', () => {
    render(<DataTable projectionData={buildTestRows(30)} columns={COLUMNS} pageSize={25} />);

    const input = screen.getByRole('textbox', { name: /filter table rows/i });
    fireEvent.change(input, { target: { value: 'alpha' } });

    const rowIds = screen.queryAllByTestId(/^datatable-row-/);
    expect(rowIds.length).toBeGreaterThan(0);

    for (const row of rowIds) {
      const text = row.textContent ?? '';
      expect(text.toLowerCase()).toContain('alpha');
    }
  });

  it('shows no-results message when query matches nothing', () => {
    render(<DataTable projectionData={buildTestRows(10)} columns={COLUMNS} pageSize={25} />);
    const input = screen.getByRole('textbox', { name: /filter table rows/i });
    fireEvent.change(input, { target: { value: 'zzz-no-match' } });
    expect(screen.getByText(/no results match/i)).toBeInTheDocument();
  });
});

// --- pagination ---

describe('DataTable — pagination behavior', () => {
  it('renders only pageSize rows on first page', () => {
    render(<DataTable projectionData={buildTestRows(100)} columns={COLUMNS} pageSize={10} />);
    const rows = screen.getAllByTestId(/^datatable-row-/);
    expect(rows).toHaveLength(10);
  });

  it('navigates to page 2 with Next button', () => {
    render(<DataTable projectionData={buildTestRows(100)} columns={COLUMNS} pageSize={10} />);
    const nextBtn = screen.getByRole('button', { name: /next/i });
    fireEvent.click(nextBtn);
    expect(screen.getByText(/page 2 of 10/i)).toBeInTheDocument();
  });

  it('shows correct total-pages count', () => {
    render(<DataTable projectionData={buildTestRows(100)} columns={COLUMNS} pageSize={10} />);
    expect(screen.getByText(/page 1 of 10/i)).toBeInTheDocument();
  });

  it('Previous button is disabled on first page', () => {
    render(<DataTable projectionData={buildTestRows(20)} columns={COLUMNS} pageSize={10} />);
    const prevBtn = screen.getByRole('button', { name: /previous/i });
    expect(prevBtn).toBeDisabled();
  });

  it('Next button is disabled on last page', () => {
    render(<DataTable projectionData={buildTestRows(5)} columns={COLUMNS} pageSize={10} />);
    const nextBtn = screen.getByRole('button', { name: /next/i });
    expect(nextBtn).toBeDisabled();
  });
});

// --- generic row shape inference ---

describe('DataTable — generic row shape', () => {
  it('renders custom row shape with arbitrary fields', () => {
    interface CustomRow extends Record<string, unknown> { title: string; count: number }
    const customColumns: DataTableColumnConfig[] = [
      { field: 'title', header: 'Title', sortable: true, searchable: true },
      { field: 'count', header: 'Count', sortable: true, searchable: false },
    ];
    const customRows: CustomRow[] = [
      { title: 'Alpha', count: 3 },
      { title: 'Beta',  count: 7 },
    ];
    render(<DataTable<CustomRow> projectionData={customRows} columns={customColumns} />);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });
});
