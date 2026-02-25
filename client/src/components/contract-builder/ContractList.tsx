import { DataTable, Column } from '@/components/DataTable';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, MoreHorizontal, Pencil, Copy, Eye, History, Upload } from 'lucide-react';
import { ContractStatusBadge } from './ContractStatusBadge';
import { ContractTypeBadge } from './ContractTypeBadge';
import type { Contract, ContractType, ContractStatus } from './models/types';

interface ContractListProps {
  contracts: Contract[];
  onCreateNew: () => void;
  onSelectContract?: (contract: Contract) => void;
  onEditContract?: (contract: Contract) => void;
  onDuplicateContract?: (contract: Contract) => void;
  onPublishContract?: (contract: Contract) => void;
  onViewHistory?: (contract: Contract) => void;
}

// Format relative time
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

// Contract type options for filter (TableFilters adds "All" option automatically)
const typeOptions = [
  { value: 'orchestrator', label: 'Orchestrator' },
  { value: 'effect', label: 'Effect' },
  { value: 'reducer', label: 'Reducer' },
  { value: 'compute', label: 'Compute' },
];

// Contract status options for filter (TableFilters adds "All" option automatically)
const statusOptions = [
  { value: 'draft', label: 'Draft' },
  { value: 'validated', label: 'Validated' },
  { value: 'published', label: 'Published' },
  { value: 'deprecated', label: 'Deprecated' },
  { value: 'archived', label: 'Archived' },
];

/**
 * Contract list view - shown when contracts exist.
 * Displays a searchable, filterable, paginated table of contracts.
 */
export function ContractList({
  contracts,
  onCreateNew,
  onSelectContract,
  onEditContract,
  onDuplicateContract,
  onPublishContract,
  onViewHistory,
}: ContractListProps) {
  // Define table columns
  const columns: Column<Contract>[] = [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      render: (contract) => (
        <div className="flex flex-col">
          <button
            className="text-left font-medium hover:text-primary hover:underline"
            onClick={() => onSelectContract?.(contract)}
          >
            {contract.displayName || contract.name}
          </button>
          {contract.description && (
            <span className="text-xs text-muted-foreground truncate max-w-[300px]">
              {contract.description}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      sortable: true,
      render: (contract) => <ContractTypeBadge type={contract.type} />,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (contract) =>
        contract.status === 'draft' && onEditContract ? (
          <button
            className="cursor-pointer"
            onClick={() => onEditContract(contract)}
            title="Click to edit draft"
          >
            <ContractStatusBadge status={contract.status} />
          </button>
        ) : (
          <ContractStatusBadge status={contract.status} />
        ),
    },
    {
      key: 'version',
      header: 'Version',
      sortable: true,
      className: 'font-mono text-sm',
    },
    {
      key: 'updatedAt',
      header: 'Updated',
      sortable: true,
      render: (contract) => (
        <span className="text-sm text-muted-foreground">
          {formatRelativeTime(contract.updatedAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-[50px]',
      render: (contract) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">Open menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onSelectContract?.(contract)}>
              <Eye className="mr-2 h-4 w-4" />
              View
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEditContract?.(contract)}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDuplicateContract?.(contract)}>
              <Copy className="mr-2 h-4 w-4" />
              Duplicate
            </DropdownMenuItem>
            {onPublishContract && contract.status === 'draft' && (
              <DropdownMenuItem onClick={() => onPublishContract(contract)}>
                <Upload className="mr-2 h-4 w-4" />
                Publish
              </DropdownMenuItem>
            )}
            {onViewHistory && (
              <DropdownMenuItem onClick={() => onViewHistory(contract)}>
                <History className="mr-2 h-4 w-4" />
                View History
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="flex-1 flex flex-col gap-4 p-6">
      {/* Header with New Contract button */}
      <div className="flex items-center justify-end">
        <Button onClick={onCreateNew} className="gap-2">
          <Plus className="w-4 h-4" />
          New Contract
        </Button>
      </div>

      {/* Data Table - let browser handle scrolling */}
      <DataTable
        data={contracts}
        columns={columns}
        searchKeys={['name', 'displayName', 'description']}
        searchPlaceholder="Search contracts..."
        columnFilters={[
          { key: 'type', label: 'Type', options: typeOptions },
          { key: 'status', label: 'Status', options: statusOptions },
        ]}
        defaultPageSize={20}
        emptyMessage="No contracts found matching your filters"
        maxHeight="none"
        className="border-0 shadow-none p-0"
      />
    </div>
  );
}
