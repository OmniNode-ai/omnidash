import type { WidgetProps } from '@rjsf/utils';

/**
 * Custom TextareaWidget that uses default parameters instead of defaultProps
 * to avoid React deprecation warnings.
 */
export function TextareaWidget({
  id,
  placeholder = '',
  value = '',
  required = false,
  disabled = false,
  readonly = false,
  autofocus = false,
  onChange,
  onBlur,
  onFocus,
  options = {},
}: WidgetProps) {
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value === '' ? options.emptyValue : e.target.value);
  };

  const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    onBlur(id, e.target.value);
  };

  const handleFocus = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    onFocus(id, e.target.value);
  };

  return (
    <textarea
      id={id}
      name={id}
      className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      value={value ?? ''}
      placeholder={placeholder}
      required={required}
      disabled={disabled}
      readOnly={readonly}
      autoFocus={autofocus}
      rows={(options.rows as number) || 5}
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={handleFocus}
    />
  );
}
