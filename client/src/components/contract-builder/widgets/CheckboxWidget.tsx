import type { WidgetProps } from '@rjsf/utils';

/**
 * Custom CheckboxWidget with specific CSS classes for reliable styling.
 * Uses rjsf-checkbox-* classes to avoid CSS specificity issues.
 */
export function CheckboxWidget({
  id,
  value = false,
  required = false,
  disabled = false,
  readonly = false,
  autofocus = false,
  label,
  onChange,
  onBlur,
  onFocus,
}: WidgetProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.checked);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    onBlur(id, e.target.checked);
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    onFocus(id, e.target.checked);
  };

  return (
    <div className="rjsf-checkbox-container">
      <label className="rjsf-checkbox-wrapper" htmlFor={id}>
        <input
          type="checkbox"
          id={id}
          name={id}
          className="rjsf-checkbox-input"
          checked={typeof value === 'undefined' ? false : Boolean(value)}
          required={required}
          disabled={disabled || readonly}
          autoFocus={autofocus}
          onChange={handleChange}
          onBlur={handleBlur}
          onFocus={handleFocus}
        />
        <span className="rjsf-checkbox-label">{label}</span>
      </label>
    </div>
  );
}
