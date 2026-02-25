import type { ErrorListProps } from '@rjsf/utils';
import { AlertCircle } from 'lucide-react';

/**
 * Custom Error List Template for RJSF
 *
 * Displays validation errors at the top of the form with styling
 * consistent with the AlertPill component.
 */
export function ErrorListTemplate(props: ErrorListProps) {
  const { errors } = props;

  if (!errors || errors.length === 0) {
    return null;
  }

  return (
    <div
      className="mb-4 p-3 rounded-lg border bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50"
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 mb-2 text-sm font-medium text-red-700 dark:text-red-400">
        <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-500" />
        <span>Please fix the following errors:</span>
      </div>
      <ul className="list-disc list-inside space-y-1 text-sm font-medium text-red-700 dark:text-red-400 pl-6">
        {errors.map((error, index) => (
          <li key={index}>{error.stack}</li>
        ))}
      </ul>
    </div>
  );
}
