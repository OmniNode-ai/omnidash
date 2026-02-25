import { useState, useCallback, useMemo } from 'react';
import type { ArrayFieldTemplateProps, UiSchema } from '@rjsf/utils';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { ArrayFieldContext } from './ArrayFieldContext';

/**
 * Custom Array Field Template for RJSF v6
 *
 * Renders the array container with a header, items list, and add button.
 * Provides context to child items for modal-based editing.
 *
 * Note: In RJSF v6, items is an array of ReactElements, not objects.
 * The ArrayFieldItemTemplate receives props directly from RJSF.
 */
export function ArrayFieldTemplate(props: ArrayFieldTemplateProps) {
  const { items, canAdd, onAddClick, title, uiSchema, registry, fieldPathId } = props;
  const [newlyAddedIndex, setNewlyAddedIndex] = useState<number | null>(null);

  const singularTitle = title?.replace(/s$/, '') || 'Item';

  // Extract the array path from fieldPathId.$id (e.g., "root_io_operations" -> "io_operations")
  const arrayPath = useMemo(() => {
    // fieldPathId.$id is like "root_io_operations" or "root_metadata_tags" (RJSF v6 uses underscores)
    const pathStr = fieldPathId?.$id || '';
    // Remove "root." or "root_" prefix, then convert any remaining dots to underscores
    return pathStr.replace(/^root[._]/, '').replace(/\./g, '_');
  }, [fieldPathId]);

  // Extract item uiSchema from the array's uiSchema
  const itemUiSchema = useMemo(() => {
    return (uiSchema?.items as UiSchema) || {};
  }, [uiSchema]);

  // Callback to update an item in the array via formContext
  const onItemUpdate = useCallback(
    (index: number, data: unknown) => {
      registry?.formContext?.onArrayItemUpdate?.(arrayPath, index, data);
    },
    [arrayPath, registry]
  );

  const handleAddClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      // Set the index that will be newly added (current length = next index)
      setNewlyAddedIndex(items.length);
      // Call RJSF's add handler to add the item
      onAddClick(e);
    },
    [items.length, onAddClick]
  );

  const clearNewlyAdded = useCallback(() => {
    setNewlyAddedIndex(null);
  }, []);

  const contextValue = useMemo(
    () => ({
      newlyAddedIndex,
      clearNewlyAdded,
      arrayPath,
      singularTitle,
      itemUiSchema,
      onItemUpdate,
    }),
    [newlyAddedIndex, clearNewlyAdded, arrayPath, singularTitle, itemUiSchema, onItemUpdate]
  );

  return (
    <ArrayFieldContext.Provider value={contextValue}>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h5 className="text-sm font-semibold">{title}</h5>
          {canAdd && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddClick}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Add {singularTitle}
            </Button>
          )}
        </div>

        <div className="rjsf-array-items">
          {items.length > 0 ? (
            <div className="space-y-2">{items}</div>
          ) : (
            <div className="border-l-4 border-l-[hsl(160,84%,39%)] bg-[hsl(160,84%,39%,0.08)] border rounded-lg py-4 px-4 text-muted-foreground">
              No items yet. Click "Add {singularTitle}" to create one.
            </div>
          )}
        </div>
      </div>
    </ArrayFieldContext.Provider>
  );
}
