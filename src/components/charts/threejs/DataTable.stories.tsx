/**
 * Stories for `DataTable<T>` — the generic sort/search/paginate primitive.
 *
 * `DataTable` does not call `useProjectionQuery`; it accepts `projectionData`
 * directly as a prop. No `makeDashboardDecorator` needed — stories drive
 * state through props only.
 *
 * ADR 002 compliance: `Empty` and `Populated` are the two required canonical
 * exports. Additional variants exercise specific interactive states.
 *
 * The storybook-coverage-compliance.test.ts Phase 2 grep checks for
 * `export const Empty` and `export const Populated` — both must be present.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { DataTable } from './DataTable';
import type { DataTableColumnConfig } from '@shared/types/chart-config';

interface SampleRow extends Record<string, unknown> {
  id: string;
  name: string;
  value: number;
  active: boolean;
}

const COLUMNS: DataTableColumnConfig[] = [
  { field: 'id',     header: 'ID',     sortable: true,  searchable: false },
  { field: 'name',   header: 'Name',   sortable: true,  searchable: true  },
  { field: 'value',  header: 'Value',  sortable: true,  searchable: false },
  { field: 'active', header: 'Active', sortable: false, searchable: true  },
];

function buildRows(count: number): SampleRow[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `row-${i}`,
    name: `Item ${i}`,
    value: (i + 1) * 10,
    active: i % 2 === 0,
  }));
}

const meta: Meta<typeof DataTable> = {
  title: 'Charts / DataTable',
  component: DataTable,
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof DataTable>;

export const Empty: Story = {
  args: {
    projectionData: [],
    columns: COLUMNS,
    emptyState: { defaultMessage: 'No items found' },
  },
};

export const Populated: Story = {
  args: {
    projectionData: buildRows(30),
    columns: COLUMNS,
    pageSize: 25,
  },
};

export const Sorted: Story = {
  args: {
    projectionData: buildRows(20),
    columns: COLUMNS,
    pageSize: 25,
  },
};

export const Searched: Story = {
  args: {
    projectionData: buildRows(50),
    columns: COLUMNS,
    pageSize: 25,
  },
};

export const Paginated: Story = {
  args: {
    projectionData: buildRows(100),
    columns: COLUMNS,
    pageSize: 10,
  },
};
