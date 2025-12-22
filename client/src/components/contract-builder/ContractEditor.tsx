import { useState, useCallback, useMemo, useRef } from 'react';
import Form, { FormProps } from '@rjsf/core';
import validator from '@rjsf/validator-ajv8';
import type { IChangeEvent } from '@rjsf/core';
import type { TemplatesType, RegistryWidgetsType } from '@rjsf/utils';
import * as jsYaml from 'js-yaml';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useTheme } from '@/components/ThemeProvider';
import { ArrowLeft, Save, Copy, Check, Pencil } from 'lucide-react';
import { getContractSchemas } from './schemas';
import type { Contract, ContractType } from './models/types';
import {
  ArrayFieldTemplate,
  ArrayFieldItemTemplate,
  FieldErrorTemplate,
  ObjectFieldTemplate,
} from './templates';
import { TextareaWidget } from './widgets';
import { YamlEditorModal } from './YamlEditorModal';
import { useAutosaveDraft } from './useAutosaveDraft';

interface ContractEditorProps {
  contractType: ContractType;
  /** Existing contract to edit (for draft contracts) */
  contract?: Contract;
  /** Initial form data (when editing an existing contract) */
  initialData?: Record<string, unknown>;
  onBack: () => void;
  onSave?: (data: Record<string, unknown>) => void;
}

// Type labels for display
const typeLabels: Record<ContractType, string> = {
  orchestrator: 'Orchestrator',
  effect: 'Effect',
  reducer: 'Reducer',
  compute: 'Compute',
};

/**
 * Contract Editor Component
 *
 * Uses RJSF (@rjsf/core) to render a schema-driven form for contract editing.
 * Note: We use @rjsf/core instead of @rjsf/shadcn to ensure our custom templates
 * (ObjectFieldTemplate, ArrayFieldTemplate, etc.) are properly applied.
 * Features:
 * - Resizable split view: Form on left, JSON preview on right
 * - Drag divider to adjust panel sizes (or collapse to single view)
 * - Live validation with custom CSS styling
 * - Modal-based array item editing with proper validation
 */
export function ContractEditor({
  contractType,
  contract,
  initialData,
  onBack,
  onSave,
}: ContractEditorProps) {
  const { theme } = useTheme();

  // Ref to the form for programmatic submission with validation
  const formRef = useRef<Form>(null);

  // Store the initial form data for comparison (to detect unsaved changes)
  const initialFormDataRef = useRef<string>(
    initialData
      ? JSON.stringify(initialData)
      : JSON.stringify({ node_identity: { version: '1.0.0' } })
  );

  // Initialize with existing data (if editing) or defaults (if creating new)
  const [formData, setFormData] = useState<Record<string, unknown>>(() => {
    if (initialData) {
      return initialData;
    }
    // Default for new contracts
    return {
      node_identity: {
        version: '1.0.0',
      },
    };
  });

  // State for the "leave without saving" dialog
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);

  // State for the YAML editor modal
  const [showYamlEditor, setShowYamlEditor] = useState(false);

  // State for copy button feedback
  const [copied, setCopied] = useState(false);

  // Determine if we're editing an existing contract or creating new
  const isEditing = !!contract;

  // Autosave draft to localStorage
  const { existingDraft, dismissDraft, clearDraft } = useAutosaveDraft({
    contractType,
    contractId: contract?.contractId,
    formData,
  });

  // Restore draft data
  const handleRestoreDraft = useCallback(() => {
    if (existingDraft) {
      setFormData(existingDraft.formData);
      dismissDraft();
    }
  }, [existingDraft, dismissDraft]);

  // Check if there are unsaved changes by comparing current form data to initial
  const hasUnsavedChanges = useMemo(() => {
    const currentJson = JSON.stringify(formData);
    return currentJson !== initialFormDataRef.current;
  }, [formData]);

  // Handle back button - show confirmation if there are unsaved changes
  const handleBackClick = useCallback(() => {
    if (hasUnsavedChanges) {
      setShowLeaveDialog(true);
    } else {
      onBack();
    }
  }, [hasUnsavedChanges, onBack]);

  // Confirm leaving without saving
  const handleConfirmLeave = useCallback(() => {
    setShowLeaveDialog(false);
    onBack();
  }, [onBack]);

  // Get schemas for this contract type
  const { jsonSchema, uiSchema } = getContractSchemas(contractType);

  // Custom templates for cleaner array rendering
  const templates: Partial<TemplatesType> = useMemo(
    () => ({
      ArrayFieldTemplate,
      ArrayFieldItemTemplate,
      FieldErrorTemplate,
      ObjectFieldTemplate,
    }),
    []
  );

  // Custom widgets
  const widgets: RegistryWidgetsType = useMemo(
    () => ({
      TextareaWidget,
    }),
    []
  );

  // Callback to update a specific array item from modal
  // arrayPath format: "io_operations" or "metadata_tags" (from idSchema with root_ removed)
  const onArrayItemUpdate = useCallback((arrayPath: string, index: number, data: unknown) => {
    setFormData((currentData) => {
      const newData = { ...currentData };

      // Handle nested paths (e.g., "metadata_tags" -> metadata.tags)
      const pathParts = arrayPath.split('_');

      // Try to find the array in the form data
      // First, check if it's a direct property (e.g., "io_operations")
      if (arrayPath in newData && Array.isArray(newData[arrayPath])) {
        const newArray = [...(newData[arrayPath] as unknown[])];
        newArray[index] = data;
        newData[arrayPath] = newArray;
        return newData;
      }

      // Try nested path (e.g., "metadata_tags" -> metadata.tags)
      // Navigate through the path parts
      let current: Record<string, unknown> = newData;
      for (let i = 0; i < pathParts.length - 1; i++) {
        const part = pathParts[i];
        if (current[part] && typeof current[part] === 'object') {
          // Clone the nested object to maintain immutability
          current[part] = { ...(current[part] as Record<string, unknown>) };
          current = current[part] as Record<string, unknown>;
        } else {
          // Path doesn't exist, try different interpretation
          break;
        }
      }

      // Check if the last part is an array
      const lastPart = pathParts[pathParts.length - 1];
      if (lastPart in current && Array.isArray(current[lastPart])) {
        const newArray = [...(current[lastPart] as unknown[])];
        newArray[index] = data;
        current[lastPart] = newArray;
      }

      return newData;
    });
  }, []);

  // Form context passed to all RJSF components
  const formContext = useMemo(
    () => ({
      formData,
      onArrayItemUpdate,
    }),
    [formData, onArrayItemUpdate]
  );

  // Handle form changes
  const handleChange = useCallback((e: IChangeEvent) => {
    setFormData(e.formData);
  }, []);

  // Handle form submission
  const handleSubmit = useCallback(
    (e: IChangeEvent) => {
      console.log('Form submitted:', e.formData);
      clearDraft(); // Clear autosaved draft on successful save
      onSave?.(e.formData);
    },
    [onSave, clearDraft]
  );

  // Build a skeleton object from JSON schema with all fields set to null
  // This ensures all possible fields are visible in the YAML for easy editing
  const buildSkeleton = useCallback((schema: Record<string, unknown>): unknown => {
    if (!schema || typeof schema !== 'object') return null;

    const type = schema.type as string | undefined;

    if (type === 'object') {
      const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
      if (!properties) return {};

      const result: Record<string, unknown> = {};
      for (const [key, propSchema] of Object.entries(properties)) {
        result[key] = buildSkeleton(propSchema);
      }
      return result;
    }

    if (type === 'array') {
      // Return empty array for arrays - don't create skeleton items
      return [];
    }

    // For primitive types (string, number, boolean), return null
    return null;
  }, []);

  // Merge form data with skeleton, keeping form values where they exist
  const mergeWithSkeleton = useCallback((skeleton: unknown, data: unknown): unknown => {
    // If data has a real value, use it
    if (data !== undefined && data !== null) {
      if (
        typeof data === 'object' &&
        !Array.isArray(data) &&
        typeof skeleton === 'object' &&
        !Array.isArray(skeleton)
      ) {
        // Both are objects - merge recursively
        const result: Record<string, unknown> = {};
        const skeletonObj = skeleton as Record<string, unknown>;
        const dataObj = data as Record<string, unknown>;

        // Include all keys from skeleton
        for (const key of Object.keys(skeletonObj)) {
          result[key] = mergeWithSkeleton(skeletonObj[key], dataObj[key]);
        }
        // Also include any extra keys from data not in skeleton
        for (const key of Object.keys(dataObj)) {
          if (!(key in result)) {
            result[key] = dataObj[key];
          }
        }
        return result;
      }
      return data;
    }

    // Data is undefined/null, use skeleton value (which is null for primitives)
    return skeleton;
  }, []);

  // Convert form data to YAML for display
  const yamlContent = useMemo(() => {
    try {
      const skeleton = buildSkeleton(jsonSchema);
      const merged = mergeWithSkeleton(skeleton, formData);
      return jsYaml.dump(merged, {
        indent: 2,
        lineWidth: -1, // Don't wrap lines
        noRefs: true,
        sortKeys: false,
        styles: { '!!null': 'lowercase' }, // Output 'null' instead of '~' or empty
      });
    } catch {
      return '# Error converting to YAML';
    }
  }, [formData, jsonSchema, buildSkeleton, mergeWithSkeleton]);

  // Handle copy to clipboard
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(yamlContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [yamlContent]);

  // Handle save from YAML editor modal
  const handleYamlSave = useCallback((data: Record<string, unknown>) => {
    setFormData(data);
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleBackClick}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div className="h-6 w-px bg-border" />
          <span className="text-lg font-medium">
            {isEditing
              ? `Edit: ${contract.displayName || contract.name}`
              : `New ${typeLabels[contractType]} Contract`}
          </span>
        </div>

        <Button size="sm" onClick={() => formRef.current?.submit()}>
          <Save className="w-4 h-4 mr-2" />
          Save
          {hasUnsavedChanges && (
            <span className="ml-2 w-2 h-2 bg-yellow-500 rounded-full" title="Unsaved changes" />
          )}
        </Button>
      </div>

      {/* Draft recovery banner */}
      {existingDraft && (
        <div className="flex items-center justify-between px-4 py-2 bg-yellow-100 dark:bg-yellow-900/30 border-b border-yellow-200 dark:border-yellow-800">
          <span className="text-sm text-yellow-800 dark:text-yellow-200">
            Unsaved draft found from {new Date(existingDraft.savedAt).toLocaleString()}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={dismissDraft}>
              Discard
            </Button>
            <Button size="sm" onClick={handleRestoreDraft}>
              Restore Draft
            </Button>
          </div>
        </div>
      )}

      {/* Content - Resizable split view */}
      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          {/* Form Panel */}
          <ResizablePanel defaultSize={60} minSize={30}>
            <div className="h-full overflow-auto p-4">
              <div className="max-w-2xl">
                <Form
                  ref={formRef}
                  schema={jsonSchema}
                  uiSchema={uiSchema}
                  formData={formData}
                  formContext={formContext}
                  validator={validator}
                  templates={templates}
                  widgets={widgets}
                  onChange={handleChange}
                  onSubmit={handleSubmit}
                  liveValidate
                  showErrorList={false}
                  className="rjsf-form"
                >
                  {/* Hide default submit button - we have our own */}
                  <div />
                </Form>
              </div>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Preview Panel - YAML with floating action buttons */}
          <ResizablePanel defaultSize={40} minSize={20}>
            <div className="h-full overflow-auto p-2 bg-muted/30 relative group">
              {/* Floating action buttons */}
              <div className="absolute top-3 right-3 z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={handleCopy}
                  className="p-1.5 rounded bg-black/50 hover:bg-black/70 text-white/70 hover:text-white transition-colors"
                  aria-label={copied ? 'Copied' : 'Copy YAML'}
                  title={copied ? 'Copied!' : 'Copy to clipboard'}
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => setShowYamlEditor(true)}
                  className="p-1.5 rounded bg-black/50 hover:bg-black/70 text-white/70 hover:text-white transition-colors"
                  aria-label="Edit YAML"
                  title="Edit as YAML"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>

              <SyntaxHighlighter
                language="yaml"
                style={theme === 'dark' ? oneDark : oneLight}
                customStyle={{
                  margin: 0,
                  padding: '1rem',
                  borderRadius: '0.5rem',
                  fontSize: '0.75rem',
                  height: '100%',
                }}
              >
                {yamlContent}
              </SyntaxHighlighter>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/* Leave without saving confirmation dialog */}
      <AlertDialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Are you sure you want to leave? Your changes will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmLeave}>Leave Without Saving</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* YAML Editor Modal */}
      <YamlEditorModal
        open={showYamlEditor}
        onOpenChange={setShowYamlEditor}
        initialValue={yamlContent}
        onSave={handleYamlSave}
        title="Edit Contract YAML"
      />
    </div>
  );
}
