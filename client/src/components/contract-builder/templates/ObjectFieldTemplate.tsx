import type { ObjectFieldTemplateProps } from '@rjsf/utils';

/**
 * Custom Object Field Template for RJSF v6
 *
 * Adds a class to distinguish nested sections from top-level sections.
 */
export function ObjectFieldTemplate(props: ObjectFieldTemplateProps) {
  const { title, description, properties, fieldPathId } = props;

  // DEBUG: Verify our custom template is being used
  console.log('[Custom ObjectFieldTemplate] Rendering:', fieldPathId?.$id, '- Title:', title);

  // Determine if this is a nested section
  // The root object has id="root", all nested objects have id="root_*"
  const id = fieldPathId?.$id || '';
  const isNested = id !== 'root';

  // Check if this is an array item (e.g., "root_io_operations_0")
  // Array items have a numeric suffix at the end
  const isArrayItem = /_\d+$/.test(id);

  const fieldsetClass = isNested ? 'rjsf-nested-section' : 'rjsf-section';

  // Hide legend for array items since they're displayed in a modal with its own title
  const showLegend = title && !isArrayItem;

  return (
    <fieldset className={fieldsetClass}>
      {showLegend && <legend id={`${id}__title`}>{title}</legend>}
      {description && <p className="field-description">{description}</p>}
      <div className="rjsf-fields-container">{properties.map((prop) => prop.content)}</div>
    </fieldset>
  );
}
