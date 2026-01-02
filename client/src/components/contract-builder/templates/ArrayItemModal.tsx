import { useRef, useState, useCallback, useEffect } from 'react';
import Form, { type IChangeEvent } from '@rjsf/core';
import type { RJSFSchema, UiSchema, RegistryWidgetsType, TemplatesType } from '@rjsf/utils';
import validator from '@rjsf/validator-ajv8';
import { Button } from '@/components/ui/button';
import { ObjectFieldTemplate } from './ObjectFieldTemplate';
import { ErrorListTemplate } from './ErrorListTemplate';
import { FieldErrorTemplate } from './FieldErrorTemplate';
import { TextareaWidget } from '../widgets';

interface ArrayItemModalProps {
  isOpen: boolean;
  itemSchema: RJSFSchema;
  itemUiSchema?: UiSchema;
  initialData: unknown;
  singularTitle: string;
  isNewItem: boolean;
  onSave: (data: unknown) => void;
  onCancel: () => void;
}

/**
 * Modal component for editing array items with its own Form instance.
 *
 * This architecture ensures proper validation by:
 * 1. Managing local form state isolated from parent
 * 2. Using formRef.validateForm() for programmatic validation
 * 3. Only propagating validated data back to parent on save
 */
export function ArrayItemModal({
  isOpen,
  itemSchema,
  itemUiSchema,
  initialData,
  singularTitle,
  isNewItem,
  onSave,
  onCancel,
}: ArrayItemModalProps) {
  // Form ref for programmatic validation
  const formRef = useRef<Form>(null);
  const [formData, setFormData] = useState<unknown>(initialData);
  const [hasAttemptedSave, setHasAttemptedSave] = useState(false);

  // Reset state when modal opens with new data
  useEffect(() => {
    if (isOpen) {
      setFormData(initialData);
      setHasAttemptedSave(false);
    }
  }, [isOpen, initialData]);

  const handleChange = useCallback(({ formData: newData }: IChangeEvent) => {
    setFormData(newData);
  }, []);

  const handleDone = useCallback(() => {
    setHasAttemptedSave(true);

    // Use RJSF's built-in validation
    if (formRef.current?.validateForm()) {
      onSave(formData);
    }
    // If validation fails, errors display automatically
  }, [formData, onSave]);

  const handleCancel = useCallback(() => {
    onCancel();
  }, [onCancel]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleCancel]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Handle backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        handleCancel();
      }
    },
    [handleCancel]
  );

  // Merge uiSchema to hide submit button
  const mergedUiSchema: UiSchema = {
    ...itemUiSchema,
    'ui:submitButtonOptions': { norender: true },
  };

  // Use the same templates as the parent form for consistency
  const templates: Partial<TemplatesType> = {
    ObjectFieldTemplate,
    ErrorListTemplate,
    FieldErrorTemplate,
  };

  const widgets: RegistryWidgetsType = {
    TextareaWidget,
  };

  if (!isOpen) return null;

  const title = isNewItem ? `Add ${singularTitle}` : `Edit ${singularTitle}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={handleBackdropClick}
    >
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/80 animate-in fade-in-0" />

      {/* Modal */}
      <div
        className="relative z-50 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden rounded-lg border border-l-4 border-l-[hsl(160,84%,39%)] bg-background shadow-lg animate-in fade-in-0 zoom-in-95"
        role="dialog"
        aria-modal="true"
        aria-labelledby="array-item-modal-title"
      >
        {/* Header */}
        <div
          className="modal-header flex items-center border-b px-6 py-4 shrink-0"
          style={{
            backgroundColor: 'color-mix(in srgb, hsl(160 84% 39%) 8%, hsl(var(--background)))',
          }}
        >
          <h2 id="array-item-modal-title" className="text-lg font-semibold">
            {title}
          </h2>
        </div>

        {/* Form Content */}
        <div className="flex-1 overflow-y-auto p-6 min-h-0">
          <Form
            ref={formRef}
            schema={itemSchema}
            uiSchema={mergedUiSchema}
            formData={formData}
            validator={validator}
            templates={templates}
            widgets={widgets}
            onChange={handleChange}
            liveValidate={hasAttemptedSave}
            showErrorList="top"
            noHtml5Validate
            tagName="div"
            className="rjsf-form"
          >
            {/* Empty children hides default submit button */}
            <></>
          </Form>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t px-6 py-4 shrink-0">
          <Button type="button" variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button type="button" onClick={handleDone}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
