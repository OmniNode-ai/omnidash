import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from '@/components/ui/pagination';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

export interface PaginationState {
  page: number;
  pageSize: number;
}

interface TablePaginationProps {
  pagination: PaginationState;
  onPaginationChange: (pagination: PaginationState) => void;
  totalItems: number;
  pageSizeOptions?: number[];
}

export function TablePagination({
  pagination,
  onPaginationChange,
  totalItems,
  pageSizeOptions = [10, 25, 50, 100],
}: TablePaginationProps) {
  const [jumpToPage, setJumpToPage] = useState('');

  const totalPages = Math.ceil(totalItems / pagination.pageSize);
  const startItem = (pagination.page - 1) * pagination.pageSize + 1;
  const endItem = Math.min(pagination.page * pagination.pageSize, totalItems);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      onPaginationChange({ ...pagination, page });
    }
  };

  const handlePageSizeChange = (pageSize: string) => {
    onPaginationChange({ ...pagination, pageSize: parseInt(pageSize), page: 1 });
  };

  const handleJumpToPage = () => {
    const page = parseInt(jumpToPage);
    if (!isNaN(page) && page >= 1 && page <= totalPages) {
      handlePageChange(page);
      setJumpToPage('');
    }
  };

  // Calculate visible page numbers
  const getVisiblePages = () => {
    const pages: (number | 'ellipsis')[] = [];
    const maxVisible = 7;

    if (totalPages <= maxVisible) {
      // Show all pages if total is small
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);

      if (pagination.page > 3) {
        pages.push('ellipsis');
      }

      // Show pages around current page
      const start = Math.max(2, pagination.page - 1);
      const end = Math.min(totalPages - 1, pagination.page + 1);

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (pagination.page < totalPages - 2) {
        pages.push('ellipsis');
      }

      // Always show last page
      pages.push(totalPages);
    }

    return pages;
  };

  if (totalItems === 0) {
    return (
      <div className="flex items-center justify-between px-2 py-4 text-sm text-muted-foreground">
        No results to display
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2 py-4">
      {/* Left: Page Size Selector and Results Count */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground whitespace-nowrap">Rows per page:</span>
          <Select value={pagination.pageSize.toString()} onValueChange={handlePageSizeChange}>
            <SelectTrigger className="w-20 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((size) => (
                <SelectItem key={size} value={size.toString()}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="text-sm text-muted-foreground whitespace-nowrap">
          {startItem}-{endItem} of {totalItems}
        </div>
      </div>

      {/* Center: Pagination Controls */}
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              onClick={() => handlePageChange(pagination.page - 1)}
              className={
                pagination.page === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'
              }
            />
          </PaginationItem>

          {getVisiblePages().map((page, index) =>
            page === 'ellipsis' ? (
              <PaginationItem key={`ellipsis-${index}`}>
                <PaginationEllipsis />
              </PaginationItem>
            ) : (
              <PaginationItem key={page}>
                <PaginationLink
                  onClick={() => handlePageChange(page)}
                  isActive={pagination.page === page}
                  className="cursor-pointer"
                >
                  {page}
                </PaginationLink>
              </PaginationItem>
            )
          )}

          <PaginationItem>
            <PaginationNext
              onClick={() => handlePageChange(pagination.page + 1)}
              className={
                pagination.page === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'
              }
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>

      {/* Right: Jump to Page */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground whitespace-nowrap">Jump to:</span>
        <Input
          type="number"
          min={1}
          max={totalPages}
          value={jumpToPage}
          onChange={(e) => setJumpToPage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleJumpToPage();
            }
          }}
          placeholder="Page"
          className="w-20 h-9"
        />
        <Button size="sm" onClick={handleJumpToPage} disabled={!jumpToPage} className="h-9">
          Go
        </Button>
      </div>
    </div>
  );
}
