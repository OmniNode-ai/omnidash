import { useState, useCallback, useEffect, useMemo } from 'react';
import type { ArrayFieldItemTemplateProps } from '@rjsf/utils';
import { Button } from '@/components/ui/button';
import { Pencil, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { ArrayItemModal } from './ArrayItemModal';
import { useArrayFieldContext } from './ArrayFieldContext';

interface FormContext {
  formData?: Record<string, unknown>;
}

/**
 * Custom Array Field Item Template for RJSF v6
 *
 * Displays array items as rows with edit/delete actions.
 * Opens ArrayItemModal for editing, which has its own Form instance
 * for proper validation handling.
 */
export function ArrayFieldItemTemplate(props: ArrayFieldItemTemplateProps) {
  const { index, disabled, readonly, registry, schema, buttonsProps } = props;

  const { hasMoveUp, hasMoveDown, hasRemove, onMoveUpItem, onMoveDownItem, onRemoveItem } =
    buttonsProps;

  const { newlyAddedIndex, clearNewlyAdded, arrayPath, singularTitle, itemUiSchema, onItemUpdate } =
    useArrayFieldContext();
  const [isEditing, setIsEditing] = useState(false);
  const [isNewItem, setIsNewItem] = useState(false);

  // Get the item data for display and to pass to modal
  const itemData = useMemo(() => {
    const formContext = registry?.formContext as FormContext | undefined;
    const formData = formContext?.formData;

    if (!formData || !arrayPath) {
      return null;
    }

    // Try direct property access first (e.g., "io_operations")
    if (arrayPath in formData && Array.isArray(formData[arrayPath])) {
      return (formData[arrayPath] as unknown[])[index] ?? null;
    }

    // Try nested path (e.g., "metadata_tags" -> metadata.tags)
    const pathParts = arrayPath.split('_');
    let current: unknown = formData;

    for (const part of pathParts) {
      if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return null;
      }
    }

    const arrayData = current as Array<unknown> | undefined;
    return arrayData?.[index] ?? null;
  }, [registry?.formContext, arrayPath, index]);

  // Get the item's display name for the row
  const itemLabel = useMemo(() => {
    if (itemData === null || itemData === undefined) {
      return `Item ${index + 1}`;
    }

    // Handle primitive values (strings, numbers) directly
    if (typeof itemData === 'string') {
      return itemData.trim() || `Item ${index + 1}`;
    }
    if (typeof itemData === 'number') {
      return String(itemData);
    }

    // For objects, try to get a meaningful name from common fields
    if (typeof itemData === 'object') {
      const obj = itemData as Record<string, unknown>;

      // Try primary identifiers first
      const name = obj.name || obj.title || obj.label || obj.id;
      if (name && typeof name === 'string' && name.trim()) {
        return name;
      }

      // Fall back to description (truncated)
      if (obj.description && typeof obj.description === 'string' && obj.description.trim()) {
        const desc = obj.description.trim();
        return desc.length > 40 ? desc.slice(0, 40) + '…' : desc;
      }

      // Fall back to first non-empty string value found
      for (const value of Object.values(obj)) {
        if (typeof value === 'string' && value.trim()) {
          const str = value.trim();
          return str.length > 40 ? str.slice(0, 40) + '…' : str;
        }
      }
    }

    return `Item ${index + 1}`;
  }, [itemData, index]);

  // Auto-open modal when this is a newly added item
  useEffect(() => {
    if (newlyAddedIndex === index) {
      setIsNewItem(true);
      setIsEditing(true);
      clearNewlyAdded();
    }
  }, [newlyAddedIndex, index, clearNewlyAdded]);

  const handleEdit = useCallback(() => {
    setIsNewItem(false);
    setIsEditing(true);
  }, []);

  // Handle save from modal - update the item in the parent form
  const handleSave = useCallback(
    (data: unknown) => {
      onItemUpdate(index, data);
      setIsEditing(false);
      setIsNewItem(false);
    },
    [index, onItemUpdate]
  );

  // Handle cancel - if it's a new item, remove it
  const handleCancel = useCallback(() => {
    if (isNewItem) {
      // Remove the newly added item
      onRemoveItem();
    }
    setIsEditing(false);
    setIsNewItem(false);
  }, [isNewItem, onRemoveItem]);

  // Emerald accent color for array items
  const colorClass =
    'border-l-4 border-l-[hsl(160,84%,39%)] bg-[hsl(160,84%,39%,0.08)] hover:bg-[hsl(160,84%,39%,0.14)]';

  return (
    <div className="relative">
      {/* Row display */}
      <div
        className={`flex items-center gap-2 py-2 px-3 border rounded-lg transition-colors ${colorClass}`}
      >
        <span className="text-sm text-muted-foreground w-6">{index + 1}.</span>
        <span className="flex-1 text-sm font-medium truncate">{itemLabel}</span>

        <div className="flex items-center gap-1">
          {hasMoveUp && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onMoveUpItem}
              disabled={disabled || readonly}
              title="Move up"
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
          )}
          {hasMoveDown && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onMoveDownItem}
              disabled={disabled || readonly}
              title="Move down"
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          )}

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleEdit}
            disabled={disabled}
            title="Edit"
          >
            <Pencil className="h-4 w-4" />
          </Button>

          {hasRemove && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-red-600 dark:text-red-500 hover:text-red-700 dark:hover:text-red-400"
              onClick={onRemoveItem}
              disabled={disabled || readonly}
              title="Remove"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Modal with its own Form instance for proper validation */}
      <ArrayItemModal
        isOpen={isEditing}
        itemSchema={schema}
        itemUiSchema={itemUiSchema}
        initialData={itemData ?? (schema.type === 'string' ? '' : {})}
        singularTitle={singularTitle}
        isNewItem={isNewItem}
        onSave={handleSave}
        onCancel={handleCancel}
      />
    </div>
  );
}
