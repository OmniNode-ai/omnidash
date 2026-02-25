/**
 * ContractEditor — Phase 3 base+overlay diff editor.
 *
 * Replaces the RJSF form with a two-pane diff-first editing experience:
 *   Left  — base profile defaults (read-only CodeMirror YAML)
 *   Right — engineer's overlay (ModelContractPatch, editable CodeMirror YAML)
 *
 * "Preview Resolved" → POST /api/contracts/resolve → full merged contract shown
 * in a read-only panel below the split view.
 *
 * RJSF, its templates, and its widgets are entirely removed from this component.
 * Lifecycle state machine (ContractList/Viewer/History/Publish) is unchanged.
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { yaml as yamlLang } from '@codemirror/lang-yaml';
import { linter, type Diagnostic } from '@codemirror/lint';
import { EditorView } from '@codemirror/view';
import { githubLight, githubDark } from '@uiw/codemirror-theme-github';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { useTheme } from '@/components/ThemeProvider';
import {
  ArrowLeft,
  Save,
  Eye,
  Loader2,
  CheckCircle,
  XCircle,
  AlertCircle,
  Lock,
} from 'lucide-react';
import type { Contract, ContractType } from './models/types';
import { useAutosaveDraft } from './useAutosaveDraft';
import { contractRegistrySource } from '@/lib/data-sources/contract-registry-source';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BaseProfile {
  id: string;
  label: string;
  version: string;
}

interface ContractEditorProps {
  contractType: ContractType;
  /** Existing contract to edit (for draft contracts) */
  contract?: Contract;
  /** Initial overlay data (when editing an existing contract) */
  initialData?: Record<string, unknown>;
  onBack: () => void;
  onSave?: (data: Record<string, unknown>) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const typeLabels: Record<ContractType, string> = {
  orchestrator: 'Orchestrator',
  effect: 'Effect',
  reducer: 'Reducer',
  compute: 'Compute',
};

/** Default overlay YAML stub shown when creating a new contract. */
const DEFAULT_OVERLAY_YAML = `extends:
  profile: effect_idempotent
  version: "1.0.0"
name: my_node
descriptor:
  timeout_ms: 30000
  max_retries: 5
`;

/** Static base profile defaults keyed by profile id. Shown while the bridge loads. */
const STATIC_BASE_DEFAULTS: Record<string, string> = {
  effect_idempotent: `# Base profile: effect_idempotent v1.0.0 (read-only)
descriptor:
  timeout_ms: 5000
  max_retries: 3
  determinism: deterministic
  idempotency: idempotent
capability_inputs: []
capability_outputs: []
`,
  effect_streaming: `# Base profile: effect_streaming v1.0.0 (read-only)
descriptor:
  timeout_ms: 60000
  max_retries: 1
  determinism: non_deterministic
  idempotency: non_idempotent
capability_inputs: []
capability_outputs: []
`,
  orchestrator_safe: `# Base profile: orchestrator_safe v1.0.0 (read-only)
descriptor:
  max_concurrent_nodes: 10
  timeout_ms: 30000
  retry_on_failure: true
capability_inputs: []
capability_outputs: []
`,
  reducer_aggregate: `# Base profile: reducer_aggregate v1.0.0 (read-only)
descriptor:
  aggregation_strategy: merge
  timeout_ms: 10000
capability_inputs: []
capability_outputs: []
`,
  compute_pure: `# Base profile: compute_pure v1.0.0 (read-only)
descriptor:
  determinism: deterministic
  timeout_ms: 5000
  side_effects: none
capability_inputs: []
capability_outputs: []
`,
};

// ---------------------------------------------------------------------------
// YAML linter (same as YamlEditorModal)
// ---------------------------------------------------------------------------

function createYamlLinter() {
  return linter((view) => {
    const diagnostics: Diagnostic[] = [];
    const doc = view.state.doc.toString();
    if (!doc.trim()) return diagnostics;
    try {
      jsYaml.load(doc);
    } catch (e: unknown) {
      const err = e as { mark?: { line: number; column: number }; reason?: string };
      if (err.mark) {
        const line = view.state.doc.line(err.mark.line + 1);
        const pos = Math.min(line.from + err.mark.column, line.to);
        diagnostics.push({
          from: pos,
          to: Math.min(pos + 1, line.to),
          severity: 'error',
          message: err.reason || 'Invalid YAML syntax',
        });
      }
    }
    return diagnostics;
  });
}

// ---------------------------------------------------------------------------
// Helper: parse overlay YAML to extract profile/version
// ---------------------------------------------------------------------------

function parseOverlayForProfile(overlayYaml: string): {
  profile: string | null;
  version: string | null;
} {
  try {
    const parsed = jsYaml.load(overlayYaml) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== 'object') return { profile: null, version: null };
    const ext = parsed['extends'] as Record<string, unknown> | undefined;
    if (!ext) return { profile: null, version: null };
    return {
      profile: (ext['profile'] as string) ?? null,
      version: (ext['version'] as string) ?? null,
    };
  } catch {
    return { profile: null, version: null };
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ContractEditor({
  contractType,
  contract,
  initialData,
  onBack,
  onSave,
}: ContractEditorProps) {
  const { theme } = useTheme();
  const isEditing = !!contract;

  // ------------------------------------------------------------------
  // Overlay YAML state (right pane — editable)
  // ------------------------------------------------------------------
  const [overlayYaml, setOverlayYaml] = useState<string>(() => {
    if (initialData) {
      try {
        return jsYaml.dump(initialData, { indent: 2, lineWidth: -1, noRefs: true });
      } catch {
        return DEFAULT_OVERLAY_YAML;
      }
    }
    return DEFAULT_OVERLAY_YAML;
  });

  // ------------------------------------------------------------------
  // Profile selector state
  // ------------------------------------------------------------------
  const [profiles, setProfiles] = useState<Record<string, BaseProfile[]>>({});
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [selectedProfileVersion, setSelectedProfileVersion] = useState<string>('1.0.0');

  // Derived: profile options for this contractType
  const profileOptions: BaseProfile[] = useMemo(() => {
    return profiles[contractType] ?? [];
  }, [profiles, contractType]);

  // Fetch profiles from the server on mount
  useEffect(() => {
    contractRegistrySource
      .fetchProfiles()
      .then((data) => {
        setProfiles(data);
        // Auto-select first profile if none selected yet
        const options = data[contractType] ?? [];
        if (options.length > 0 && !selectedProfileId) {
          setSelectedProfileId(options[0].id);
          setSelectedProfileVersion(options[0].version);
        }
      })
      .catch(() => {
        // Silently degrade to static catalogue shown in STATIC_BASE_DEFAULTS
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractType]);

  // Sync selectedProfileId when overlay changes (to keep panes in sync)
  useEffect(() => {
    const { profile, version } = parseOverlayForProfile(overlayYaml);
    if (profile && profile !== selectedProfileId) {
      setSelectedProfileId(profile);
    }
    if (version && version !== selectedProfileVersion) {
      setSelectedProfileVersion(version);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayYaml]);

  // ------------------------------------------------------------------
  // Left pane: base profile YAML (read-only)
  // ------------------------------------------------------------------
  const baseProfileYaml = useMemo(() => {
    if (!selectedProfileId) {
      return '# Select a base profile to see its defaults\n';
    }
    return (
      STATIC_BASE_DEFAULTS[selectedProfileId] ??
      `# Base profile: ${selectedProfileId} v${selectedProfileVersion} (read-only)\n# Profile defaults not available locally\n`
    );
  }, [selectedProfileId, selectedProfileVersion]);

  // ------------------------------------------------------------------
  // CodeMirror extensions
  // ------------------------------------------------------------------
  const yamlLinter = useMemo(() => createYamlLinter(), []);
  const editableExtensions = useMemo(
    () => [yamlLang(), yamlLinter, EditorView.lineWrapping],
    [yamlLinter]
  );
  const readOnlyExtensions = useMemo(
    () => [yamlLang(), EditorView.lineWrapping, EditorView.editable.of(false)],
    []
  );

  // ------------------------------------------------------------------
  // Autosave draft
  // ------------------------------------------------------------------
  const overlayAsRecord = useMemo<Record<string, unknown>>(() => {
    try {
      const parsed = jsYaml.load(overlayYaml);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // invalid YAML — ignore for autosave
    }
    return {};
  }, [overlayYaml]);

  const { existingDraft, dismissDraft, clearDraft } = useAutosaveDraft({
    contractType,
    contractId: contract?.contractId,
    formData: overlayAsRecord,
    initialFormData: undefined,
  });

  const handleRestoreDraft = useCallback(() => {
    if (existingDraft) {
      try {
        const restoredYaml = jsYaml.dump(existingDraft.formData, {
          indent: 2,
          lineWidth: -1,
          noRefs: true,
        });
        setOverlayYaml(restoredYaml);
      } catch {
        // ignore
      }
      dismissDraft();
    }
  }, [existingDraft, dismissDraft]);

  // ------------------------------------------------------------------
  // Unsaved changes detection
  // ------------------------------------------------------------------
  const initialOverlayRef = useMemo(() => {
    if (initialData) {
      try {
        return jsYaml.dump(initialData, { indent: 2, lineWidth: -1, noRefs: true });
      } catch {
        return DEFAULT_OVERLAY_YAML;
      }
    }
    return DEFAULT_OVERLAY_YAML;
  }, [initialData]);

  const hasUnsavedChanges = overlayYaml !== initialOverlayRef;

  // ------------------------------------------------------------------
  // Leave dialog
  // ------------------------------------------------------------------
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);

  const handleBackClick = useCallback(() => {
    if (hasUnsavedChanges) {
      setShowLeaveDialog(true);
    } else {
      onBack();
    }
  }, [hasUnsavedChanges, onBack]);

  const handleConfirmLeave = useCallback(() => {
    setShowLeaveDialog(false);
    onBack();
  }, [onBack]);

  // ------------------------------------------------------------------
  // Save
  // ------------------------------------------------------------------
  const [overlayParseError, setOverlayParseError] = useState<string | null>(null);

  const handleSave = useCallback(() => {
    setOverlayParseError(null);
    try {
      const parsed = jsYaml.load(overlayYaml);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setOverlayParseError('Overlay YAML must be an object at the root level.');
        return;
      }
      clearDraft();
      onSave?.(parsed as Record<string, unknown>);
    } catch (e: unknown) {
      const err = e as { reason?: string; mark?: { line: number } };
      const lineInfo = err.mark ? ` (line ${err.mark.line + 1})` : '';
      setOverlayParseError(`Invalid YAML: ${err.reason ?? 'syntax error'}${lineInfo}`);
    }
  }, [overlayYaml, onSave, clearDraft]);

  // ------------------------------------------------------------------
  // Preview Resolved
  // ------------------------------------------------------------------
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewYaml, setPreviewYaml] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const handlePreviewResolved = useCallback(async () => {
    setIsPreviewing(true);
    setPreviewError(null);
    setPreviewYaml(null);

    let parsedOverlay: Record<string, unknown>;
    try {
      const parsed = jsYaml.load(overlayYaml);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setPreviewError('Overlay YAML must be an object at the root level.');
        setIsPreviewing(false);
        return;
      }
      parsedOverlay = parsed as Record<string, unknown>;
    } catch (e: unknown) {
      const err = e as { reason?: string };
      setPreviewError(`Invalid overlay YAML: ${err.reason ?? 'syntax error'}`);
      setIsPreviewing(false);
      return;
    }

    try {
      const resolved = await contractRegistrySource.resolveContract(
        selectedProfileId || 'effect_idempotent',
        selectedProfileVersion || '1.0.0',
        parsedOverlay
      );
      setPreviewYaml(
        jsYaml.dump(resolved, { indent: 2, lineWidth: -1, noRefs: true, sortKeys: false })
      );
    } catch (e: unknown) {
      const err = e as { message?: string };
      setPreviewError(err.message ?? 'Failed to resolve contract');
    } finally {
      setIsPreviewing(false);
    }
  }, [overlayYaml, selectedProfileId, selectedProfileVersion]);

  // ------------------------------------------------------------------
  // Validation (unchanged from Phase 2)
  // ------------------------------------------------------------------
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    success?: boolean;
    violations?: Array<{ code: string; message: string; path?: string; severity?: string }>;
  } | null>(null);

  const handleValidate = useCallback(async () => {
    if (!contract?.id) return;
    setIsValidating(true);
    setValidationResult(null);
    try {
      const response = await fetch(`/api/contracts/${contract.id}/validate`, { method: 'POST' });
      if (response.ok) {
        setValidationResult({ success: true });
      } else if (response.status === 422) {
        const data = await response.json();
        setValidationResult({ success: false, violations: data.gates });
      } else {
        const data = await response.json();
        throw new Error(data.error || 'Validation failed');
      }
    } catch (err) {
      setValidationResult({
        success: false,
        violations: [{ code: 'error', message: String(err) }],
      });
    } finally {
      setIsValidating(false);
    }
  }, [contract?.id]);

  // ------------------------------------------------------------------
  // Handle profile selector change — update overlay extends block
  // ------------------------------------------------------------------
  const handleProfileChange = useCallback(
    (profileId: string) => {
      const found = profileOptions.find((p) => p.id === profileId);
      const version = found?.version ?? '1.0.0';
      setSelectedProfileId(profileId);
      setSelectedProfileVersion(version);

      // Update the extends block in the overlay YAML
      try {
        const parsed = (jsYaml.load(overlayYaml) ?? {}) as Record<string, unknown>;
        parsed['extends'] = { profile: profileId, version };
        setOverlayYaml(
          jsYaml.dump(parsed, { indent: 2, lineWidth: -1, noRefs: true, sortKeys: false })
        );
      } catch {
        // YAML parse error — just prepend the extends block
        setOverlayYaml(
          `extends:\n  profile: ${profileId}\n  version: "${version}"\n` + overlayYaml
        );
      }
    },
    [profileOptions, overlayYaml]
  );

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  const cmTheme = theme === 'dark' ? githubDark : githubLight;

  return (
    <div className="flex flex-col h-full">
      {/* ------------------------------------------------------------------ */}
      {/* Header */}
      {/* ------------------------------------------------------------------ */}
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

        <div className="flex items-center gap-2">
          {/* Profile selector */}
          {profileOptions.length > 0 && (
            <Select value={selectedProfileId} onValueChange={handleProfileChange}>
              <SelectTrigger className="w-52 h-8 text-xs">
                <SelectValue placeholder="Select base profile…" />
              </SelectTrigger>
              <SelectContent>
                {profileOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="text-xs">
                    {p.label} <span className="text-muted-foreground ml-1">v{p.version}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Validate (only for persisted contracts) */}
          {contract?.id && (
            <Button size="sm" variant="outline" onClick={handleValidate} disabled={isValidating}>
              {isValidating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4 mr-2" />
              )}
              {isValidating ? 'Validating…' : 'Validate'}
            </Button>
          )}

          {/* Preview Resolved */}
          <Button
            size="sm"
            variant="outline"
            onClick={handlePreviewResolved}
            disabled={isPreviewing}
          >
            {isPreviewing ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Eye className="w-4 h-4 mr-2" />
            )}
            {isPreviewing ? 'Resolving…' : 'Preview Resolved'}
          </Button>

          {/* Save */}
          <Button size="sm" onClick={handleSave}>
            <Save className="w-4 h-4 mr-2" />
            Save
            {hasUnsavedChanges && (
              <span className="ml-2 w-2 h-2 bg-yellow-500 rounded-full" title="Unsaved changes" />
            )}
          </Button>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Draft recovery banner */}
      {/* ------------------------------------------------------------------ */}
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

      {/* ------------------------------------------------------------------ */}
      {/* Overlay YAML parse error */}
      {/* ------------------------------------------------------------------ */}
      {overlayParseError && (
        <div className="flex items-start gap-3 px-4 py-3 border-b bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <span className="text-sm text-red-800 dark:text-red-200">{overlayParseError}</span>
          <button
            onClick={() => setOverlayParseError(null)}
            className="ml-auto flex-shrink-0 text-muted-foreground hover:text-foreground"
            aria-label="Dismiss"
          >
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Validation result */}
      {/* ------------------------------------------------------------------ */}
      {validationResult && (
        <div
          className={`flex items-start gap-3 px-4 py-3 border-b ${
            validationResult.success
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
              : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
          }`}
        >
          {validationResult.success ? (
            <>
              <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
              <span className="text-sm text-green-800 dark:text-green-200 font-medium">
                Contract validated successfully
              </span>
            </>
          ) : (
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
                <span className="text-sm text-red-800 dark:text-red-200 font-medium">
                  Validation failed — {validationResult.violations?.length ?? 0} violation(s)
                </span>
              </div>
              {validationResult.violations && validationResult.violations.length > 0 && (
                <ul className="space-y-1 pl-7">
                  {validationResult.violations.map((v, i) => (
                    <li
                      key={i}
                      className="text-sm text-red-700 dark:text-red-300 flex items-start gap-2"
                    >
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      <span>
                        <code className="font-mono text-xs bg-red-100 dark:bg-red-900/40 px-1 rounded">
                          {v.code}
                        </code>{' '}
                        {v.message}
                        {v.path && (
                          <span className="ml-1 text-red-500 dark:text-red-400 text-xs">
                            ({v.path})
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <button
            onClick={() => setValidationResult(null)}
            className="ml-auto flex-shrink-0 text-muted-foreground hover:text-foreground"
            aria-label="Dismiss"
          >
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Main diff editor — base (left, read-only) / overlay (right, editable) */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex-1 overflow-hidden min-h-0">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          {/* Left: base profile (read-only) */}
          <ResizablePanel defaultSize={48} minSize={25}>
            <div className="flex flex-col h-full">
              <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/40 text-xs text-muted-foreground font-medium shrink-0">
                <Lock className="w-3 h-3" />
                Base Profile
                {selectedProfileId && (
                  <span className="font-mono text-foreground ml-1">
                    {selectedProfileId} v{selectedProfileVersion}
                  </span>
                )}
                <span className="ml-auto italic">read-only</span>
              </div>
              <div className="flex-1 overflow-auto">
                <CodeMirror
                  value={baseProfileYaml}
                  height="100%"
                  theme={cmTheme}
                  extensions={readOnlyExtensions}
                  basicSetup={{
                    lineNumbers: true,
                    highlightActiveLineGutter: false,
                    foldGutter: true,
                    highlightActiveLine: false,
                    highlightSelectionMatches: false,
                  }}
                  className="h-full text-xs"
                  readOnly
                />
              </div>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Right: overlay (editable) */}
          <ResizablePanel defaultSize={52} minSize={25}>
            <div className="flex flex-col h-full">
              <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/40 text-xs text-muted-foreground font-medium shrink-0">
                Your Overlay
                <span className="font-mono text-foreground ml-1">ModelContractPatch</span>
                <span className="ml-auto italic text-yellow-600 dark:text-yellow-400">
                  editable — only changed fields
                </span>
              </div>
              <div className="flex-1 overflow-auto">
                <CodeMirror
                  value={overlayYaml}
                  height="100%"
                  theme={cmTheme}
                  extensions={editableExtensions}
                  onChange={setOverlayYaml}
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
                  className="h-full text-xs"
                />
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Preview Resolved panel (shown after clicking "Preview Resolved") */}
      {/* ------------------------------------------------------------------ */}
      {(previewYaml !== null || previewError !== null) && (
        <div className="border-t shrink-0" style={{ maxHeight: '35%', minHeight: '10rem' }}>
          <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/40 text-xs text-muted-foreground font-medium">
            <span className="flex items-center gap-2">
              <Eye className="w-3 h-3" />
              Preview — Full Resolved Contract
            </span>
            <button
              onClick={() => {
                setPreviewYaml(null);
                setPreviewError(null);
              }}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Close preview"
            >
              <XCircle className="w-4 h-4" />
            </button>
          </div>

          {previewError ? (
            <div className="flex items-start gap-2 p-3 text-sm text-red-700 dark:text-red-300">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{previewError}</span>
            </div>
          ) : (
            <div className="overflow-auto" style={{ maxHeight: 'calc(35vh - 2.5rem)' }}>
              <CodeMirror
                value={previewYaml ?? ''}
                theme={cmTheme}
                extensions={readOnlyExtensions}
                basicSetup={{
                  lineNumbers: true,
                  highlightActiveLineGutter: false,
                  foldGutter: true,
                  highlightActiveLine: false,
                }}
                className="text-xs"
                readOnly
              />
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Leave without saving dialog */}
      {/* ------------------------------------------------------------------ */}
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
    </div>
  );
}
