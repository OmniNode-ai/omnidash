import type { FieldErrorProps } from '@rjsf/utils';
import { AlertCircle } from 'lucide-react';

/**
 * Custom Field Error Template for RJSF v6
 *
 * Displays inline validation errors directly below form fields with
 * consistent styling and accessibility attributes.
 */
export function FieldErrorTemplate(props: FieldErrorProps) {
  const { errors = [], fieldPathId } = props;

  if (!errors || errors.length === 0) {
    return null;
  }

  // Generate a stable ID from fieldPathId.$id
  const id = `${fieldPathId?.$id || 'field'}__error`;

  return (
    <div
      id={id}
      className="mt-1.5 text-sm font-medium text-red-700 dark:text-red-400"
      role="alert"
      aria-live="polite"
    >
      {errors.map((error, index) => (
        <div key={index} className="flex items-center gap-1.5">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-500" />
          <span>{typeof error === 'string' ? error : String(error)}</span>
        </div>
      ))}
    </div>
  );
}
