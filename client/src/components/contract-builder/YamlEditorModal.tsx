/**
 * YAML Editor Modal Component
 *
 * A modal dialog containing a CodeMirror-based YAML editor.
 * Used for editing contract data in raw YAML format.
 *
 * Features:
 * - Syntax highlighting for YAML
 * - Line numbers
 * - Dark/light theme support
 * - YAML validation with error display
 * - Save/Cancel actions
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { yaml } from '@codemirror/lang-yaml';
import { linter, type Diagnostic } from '@codemirror/lint';
import { EditorView } from '@codemirror/view';
import { githubLight, githubDark } from '@uiw/codemirror-theme-github';
import * as jsYaml from 'js-yaml';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/components/ThemeProvider';
import { AlertCircle, Loader2 } from 'lucide-react';

interface YamlEditorModalProps {
  /** Whether the modal is open */
  open: boolean;
  /** Callback when modal should close */
  onOpenChange: (open: boolean) => void;
  /** Initial YAML content to edit */
  initialValue: string;
  /** Called when user saves valid YAML - receives parsed object */
  onSave: (data: Record<string, unknown>) => void;
  /** Optional title for the modal */
  title?: string;
}

/**
 * Create a CodeMirror linter that validates YAML syntax using js-yaml
 */
function createYamlLinter() {
  return linter((view) => {
    const diagnostics: Diagnostic[] = [];
    const doc = view.state.doc.toString();

    if (!doc.trim()) {
      return diagnostics;
    }

    try {
      jsYaml.load(doc);
    } catch (e: unknown) {
      const error = e as { mark?: { line: number; column: number }; reason?: string };
      if (error.mark) {
        // Calculate position from line/column
        const line = view.state.doc.line(error.mark.line + 1);
        const pos = Math.min(line.from + error.mark.column, line.to);
        diagnostics.push({
          from: pos,
          to: Math.min(pos + 1, line.to),
          severity: 'error',
          message: error.reason || 'Invalid YAML syntax',
        });
      }
    }

    return diagnostics;
  });
}

export function YamlEditorModal({
  open,
  onOpenChange,
  initialValue,
  onSave,
  title = 'Edit YAML',
}: YamlEditorModalProps) {
  const { theme } = useTheme();
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Reset state when modal opens - this handles both programmatic and internal opens
  useEffect(() => {
    if (open) {
      setValue(initialValue);
      setError(null);
      setIsSaving(false);
    }
  }, [open, initialValue]);

  // Create the YAML linter once
  const yamlLinter = useMemo(() => createYamlLinter(), []);

  // Editor extensions
  const extensions = useMemo(() => [yaml(), yamlLinter, EditorView.lineWrapping], [yamlLinter]);

  // Handle editor changes
  const handleChange = useCallback((val: string) => {
    setValue(val);
    // Clear error when user starts typing
    setError(null);
  }, []);

  // Handle save - validate and parse YAML
  const handleSave = useCallback(() => {
    setIsSaving(true);
    setError(null);

    try {
      const parsed = jsYaml.load(value);

      if (typeof parsed !== 'object' || parsed === null) {
        setError('YAML must be an object at the root level');
        setIsSaving(false);
        return;
      }

      // Small delay for UX feedback
      setTimeout(() => {
        onSave(parsed as Record<string, unknown>);
        setIsSaving(false);
        onOpenChange(false);
      }, 150);
    } catch (e: unknown) {
      const error = e as { reason?: string; mark?: { line: number } };
      const message = error.reason || 'Invalid YAML syntax';
      const lineInfo = error.mark ? ` (line ${error.mark.line + 1})` : '';
      setError(`${message}${lineInfo}`);
      setIsSaving(false);
    }
  }, [value, onSave, onOpenChange]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {/* Editor container */}
        <div className="flex-1 min-h-[400px] max-h-[60vh] overflow-hidden border rounded-md">
          <CodeMirror
            value={value}
            height="100%"
            theme={theme === 'dark' ? githubDark : githubLight}
            extensions={extensions}
            onChange={handleChange}
            basicSetup={{
              lineNumbers: true,
              highlightActiveLineGutter: true,
              foldGutter: true,
              dropCursor: true,
              allowMultipleSelections: false,
              indentOnInput: true,
              bracketMatching: true,
              closeBrackets: true,
              autocompletion: false,
              rectangularSelection: true,
              highlightActiveLine: true,
              highlightSelectionMatches: true,
            }}
            className="h-full text-sm"
          />
        </div>

        {/* Error display */}
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
