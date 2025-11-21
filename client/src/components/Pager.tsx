import React from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface PagerProps {
  page: number; // 1-based
  pageSize: number;
  totalItems?: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
}

export function Pager({
  page,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50],
}: PagerProps) {
  const totalPages = totalItems ? Math.max(1, Math.ceil(totalItems / pageSize)) : undefined;
  const canPrev = page > 1;
  const canNext = totalPages ? page < totalPages : true; // allow next if unknown total

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={!canPrev}
        onClick={() => onPageChange(Math.max(1, page - 1))}
      >
        Prev
      </Button>
      <div className="text-xs text-muted-foreground">
        Page <span className="font-medium">{page}</span>
        {totalPages ? (
          <>
            {' '}
            / <span className="font-medium">{totalPages}</span>
          </>
        ) : null}
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={!canNext}
        onClick={() => onPageChange(page + 1)}
      >
        Next
      </Button>
      {onPageSizeChange && (
        <div className="flex items-center gap-1 ml-2 text-xs">
          <span className="text-muted-foreground">Per page</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => onPageSizeChange?.(parseInt(v, 10))}
          >
            <SelectTrigger className="h-8 w-[80px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((opt) => (
                <SelectItem key={opt} value={String(opt)}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
