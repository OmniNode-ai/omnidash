import { createContext, useContext } from 'react';
import type { UiSchema } from '@rjsf/utils';

interface ArrayFieldContextValue {
  newlyAddedIndex: number | null;
  clearNewlyAdded: () => void;
  arrayPath: string | null;
  singularTitle: string;
  itemUiSchema?: UiSchema;
  onItemUpdate: (index: number, data: unknown) => void;
}

export const ArrayFieldContext = createContext<ArrayFieldContextValue>({
  newlyAddedIndex: null,
  clearNewlyAdded: () => {},
  arrayPath: null,
  singularTitle: 'Item',
  itemUiSchema: undefined,
  onItemUpdate: () => {},
});

export const useArrayFieldContext = () => useContext(ArrayFieldContext);
