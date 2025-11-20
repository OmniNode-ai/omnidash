import { memo } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/hooks/use-toast';

interface ExportButtonProps {
  data: Record<string, unknown> | Array<Record<string, unknown>> | null;
  filename: string;
  disabled?: boolean;
}

/**
 * ExportButton component provides JSON and CSV export functionality for dashboard data.
 * Memoized to prevent unnecessary re-renders when parent state changes.
 *
 * Features:
 * - JSON export with pretty formatting
 * - CSV export with automatic header detection (for arrays)
 * - Handles nested objects and arrays
 * - Client-side file download
 *
 * @param data - The data to export (can be object, array, or any JSON-serializable data)
 * @param filename - Base filename without extension (e.g., "agent-operations")
 * @param disabled - Optional disable state
 */
export const ExportButton = memo(function ExportButton({
  data,
  filename,
  disabled = false,
}: ExportButtonProps) {
  const exportAsJSON = () => {
    let url: string | null = null;
    try {
      const jsonString = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (error) {
      console.error('Failed to export JSON:', error);
      const errorMessage = 'Failed to export data as JSON. Please check console for details.';
      window.alert(errorMessage);
      toast({
        title: 'Export Failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      // Always cleanup to prevent memory leak
      if (url) {
        URL.revokeObjectURL(url);
      }
    }
  };

  const exportAsCSV = () => {
    let url: string | null = null;
    try {
      let csv = '';

      // Handle array data (most common for CSV)
      if (Array.isArray(data)) {
        if (data.length === 0) {
          const errorMessage = 'No data available to export as CSV.';
          window.alert(errorMessage);
          toast({
            title: 'No Data',
            description: errorMessage,
            variant: 'destructive',
          });
          return;
        }

        // Flatten nested objects and get all unique keys
        const flattenObject = (obj: any, prefix = ''): any => {
          return Object.keys(obj).reduce((acc: any, key: string) => {
            const pre = prefix.length ? `${prefix}.` : '';
            if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
              Object.assign(acc, flattenObject(obj[key], pre + key));
            } else {
              acc[pre + key] = obj[key];
            }
            return acc;
          }, {});
        };

        // Get all unique keys from all objects
        const allKeys = new Set<string>();
        const flattenedData = data.map((item) => {
          const flattened = flattenObject(item);
          Object.keys(flattened).forEach((key) => allKeys.add(key));
          return flattened;
        });

        const headers = Array.from(allKeys);

        // Create CSV header row
        csv += headers.map((h) => `"${h}"`).join(',') + '\n';

        // Create CSV data rows
        flattenedData.forEach((row) => {
          csv +=
            headers
              .map((header) => {
                const value = row[header];
                if (value === null || value === undefined) {
                  return '""';
                }
                // Handle arrays and objects in cells
                if (typeof value === 'object') {
                  return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
                }
                // Escape quotes in strings
                const stringValue = String(value).replace(/"/g, '""');
                return `"${stringValue}"`;
              })
              .join(',') + '\n';
        });
      }
      // Handle single object (convert to single-row CSV)
      else if (typeof data === 'object' && data !== null) {
        const flatObject = Object.entries(data).reduce((acc: any, [key, value]) => {
          if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            // Flatten nested objects
            Object.entries(value).forEach(([nestedKey, nestedValue]) => {
              acc[`${key}.${nestedKey}`] = nestedValue;
            });
          } else {
            acc[key] = value;
          }
          return acc;
        }, {});

        const headers = Object.keys(flatObject);
        csv += headers.map((h) => `"${h}"`).join(',') + '\n';
        csv +=
          headers
            .map((header) => {
              const value = flatObject[header];
              if (value === null || value === undefined) {
                return '""';
              }
              if (typeof value === 'object') {
                return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
              }
              const stringValue = String(value).replace(/"/g, '""');
              return `"${stringValue}"`;
            })
            .join(',') + '\n';
      } else {
        toast({
          title: 'Invalid Format',
          description: 'Data format not suitable for CSV export. Use JSON export instead.',
          variant: 'destructive',
        });
        return;
      }

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (error) {
      console.error('Failed to export CSV:', error);
      toast({
        title: 'Export Failed',
        description:
          'Failed to export data as CSV. Please try JSON export or check console for details.',
        variant: 'destructive',
      });
    } finally {
      // Always cleanup to prevent memory leak
      if (url) {
        URL.revokeObjectURL(url);
      }
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled || !data}>
          <Download className="w-4 h-4 mr-2" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={exportAsJSON}>Export as JSON</DropdownMenuItem>
        <DropdownMenuItem onClick={exportAsCSV}>Export as CSV</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
});
