import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  ArrowLeft,
  Upload,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  Pencil,
} from 'lucide-react';
import { ContractStatusBadge } from './ContractStatusBadge';
import { ContractTypeBadge } from './ContractTypeBadge';
import type { Contract } from './models/types';

interface ContractPublishProps {
  contract: Contract;
  onBack: () => void;
  onEdit?: (contract: Contract) => void;
  onPublish: (contract: Contract) => void;
}

/**
 * A single gate violation returned by the server policy gate.
 */
interface GateViolation {
  code: string;
  message: string;
  path?: string;
  severity?: 'error' | 'warning';
}

interface ValidationResult {
  isValid: boolean;
  violations: GateViolation[];
  /** Updated contract after successful validate call (status → 'validated') */
  validatedContract?: Contract;
}

type ValidationState = 'idle' | 'validating' | 'complete';
type PublishState = 'idle' | 'publishing' | 'done' | 'error';

/**
 * Map a gate violation code to an actionable suggestion for the user.
 */
function gateViolationHint(code: string): string | undefined {
  const hints: Record<string, string> = {
    missing_determinism_class: 'Open the editor and set the determinism_class field.',
    invalid_determinism_class:
      "Valid values are 'deterministic', 'nondeterministic', or 'effect-driven'.",
    missing_effect_surface:
      "Add at least one value to effect_surface (e.g. 'network', 'filesystem').",
    schema_not_found: 'The contract type has no registered schema. Contact a platform engineer.',
    missing_contract_schema_version: "Set contract_schema_version in the schema (e.g. '1.0.0').",
    invalid_policy_envelope_validators:
      'policy_envelope.validators must be a list of validator objects.',
    empty_policy_envelope_validator: 'Remove empty strings from policy_envelope.validators.',
    empty_policy_envelope_validator_name:
      'Each policy_envelope validator object must have a non-empty name field.',
    empty_metadata_tag: 'Remove empty strings from metadata.tags.',
  };
  return hints[code];
}

/**
 * Contract Publish Component
 *
 * Dedicated page for publishing a contract.
 * Calls the real API to validate (DRAFT→REVIEW or →VALIDATED) and then publish.
 * Shows structured gate failures with actionable hints.
 */
export function ContractPublish({ contract, onBack, onEdit, onPublish }: ContractPublishProps) {
  const [validationState, setValidationState] = useState<ValidationState>('idle');
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [publishState, setPublishState] = useState<PublishState>('idle');
  const [publishError, setPublishError] = useState<string | null>(null);

  // Auto-run validation when component mounts
  useEffect(() => {
    runValidation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contract.id]);

  /**
   * Call POST /api/contracts/:id/validate.
   * On success the server transitions the contract to 'validated'.
   * On 422 the server returns structured gate violations.
   */
  const runValidation = async () => {
    setValidationState('validating');
    setValidationResult(null);
    setPublishError(null);

    try {
      const response = await fetch(`/api/contracts/${contract.id}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        const data = await response.json();
        setValidationResult({
          isValid: true,
          violations: [],
          validatedContract: data.contract as Contract,
        });
      } else if (response.status === 422) {
        const data = await response.json();
        const gates: GateViolation[] = Array.isArray(data.gates) ? data.gates : [];
        setValidationResult({ isValid: false, violations: gates });
      } else {
        const data = await response.json().catch(() => ({}));
        const msg =
          (data as { message?: string; error?: string }).message ??
          (data as { error?: string }).error ??
          `Unexpected error: ${response.status}`;
        setValidationResult({
          isValid: false,
          violations: [{ code: 'server_error', message: msg, severity: 'error' }],
        });
      }
    } catch (err) {
      setValidationResult({
        isValid: false,
        violations: [
          {
            code: 'network_error',
            message: `Could not reach server: ${String(err)}`,
            severity: 'error',
          },
        ],
      });
    } finally {
      setValidationState('complete');
    }
  };

  /**
   * Call POST /api/contracts/:id/publish.
   * The server enforces the full policy gate (schema valid + policy envelope + CSV).
   * Returns 422 with structured gate violations if publish is blocked.
   */
  const handlePublish = async () => {
    if (publishState === 'publishing') return;
    setPublishState('publishing');
    setPublishError(null);

    // Use the validated contract id (may differ if server returned updated contract)
    const targetId = validationResult?.validatedContract?.id ?? contract.id;

    try {
      const response = await fetch(`/api/contracts/${targetId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evidence: [] }),
      });

      if (response.ok) {
        const data = await response.json();
        setPublishState('done');
        onPublish(data.contract as Contract);
      } else if (response.status === 422) {
        const data = await response.json();
        const gates: GateViolation[] = Array.isArray(data.gates) ? data.gates : [];
        // Merge publish gate failures back into the validation result panel
        setValidationResult({
          isValid: false,
          violations: gates,
        });
        setValidationState('complete');
        setPublishState('error');
        setPublishError('Publish blocked by policy gate. See violations above.');
      } else {
        const data = await response.json().catch(() => ({}));
        const msg =
          (data as { message?: string; error?: string }).message ??
          (data as { error?: string }).error ??
          `Publish failed: ${response.status}`;
        setPublishState('error');
        setPublishError(msg);
      }
    } catch (err) {
      setPublishState('error');
      setPublishError(`Network error: ${String(err)}`);
    }
  };

  const canPublish =
    validationState === 'complete' &&
    validationResult?.isValid === true &&
    publishState !== 'publishing' &&
    publishState !== 'done';

  const isPublishing = publishState === 'publishing';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} disabled={isPublishing}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div className="h-6 w-px bg-border" />
          <span className="text-lg font-medium">Publish Contract</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Contract Summary */}
          <Card className="p-6 bg-background">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
              Contract to Publish
            </h2>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-xl font-semibold">
                  {contract.displayName || contract.name}
                </span>
                <ContractTypeBadge type={contract.type} />
                <ContractStatusBadge status={contract.status} />
              </div>
              {contract.description && (
                <p className="text-sm text-muted-foreground">{contract.description}</p>
              )}
              <div className="flex items-center gap-4 text-sm">
                <span className="text-muted-foreground">Version:</span>
                <span className="font-mono">{contract.version}</span>
              </div>
            </div>
          </Card>

          {/* Validation Status */}
          <Card className="p-6 bg-background">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
              Policy Gate Check
            </h2>

            {validationState === 'idle' && (
              <p className="text-sm text-muted-foreground">Validation not started.</p>
            )}

            {validationState === 'validating' && (
              <div className="flex items-center gap-3 text-sm">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <span>Running policy gate checks...</span>
              </div>
            )}

            {validationState === 'complete' && validationResult && (
              <div className="space-y-4">
                {/* Overall status */}
                <div className="flex items-center gap-3">
                  {validationResult.isValid ? (
                    <>
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                      <span className="text-sm font-medium text-green-600 dark:text-green-400">
                        All policy gates passed
                      </span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-5 h-5 text-destructive" />
                      <span className="text-sm font-medium text-destructive">
                        Policy gates failed — {validationResult.violations.length} violation
                        {validationResult.violations.length !== 1 ? 's' : ''}
                      </span>
                    </>
                  )}
                </div>

                {/* Gate violations */}
                {validationResult.violations.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-destructive">Gate Violations</h3>
                    <ul className="space-y-3">
                      {validationResult.violations.map((v, i) => {
                        const hint = gateViolationHint(v.code);
                        const isWarning = v.severity === 'warning';
                        return (
                          <li
                            key={i}
                            className={`rounded-md border p-3 text-sm ${
                              isWarning
                                ? 'border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20'
                                : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              {isWarning ? (
                                <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" />
                              ) : (
                                <XCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <code
                                    className={`text-xs font-mono px-1 py-0.5 rounded ${
                                      isWarning
                                        ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300'
                                        : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
                                    }`}
                                  >
                                    {v.code}
                                  </code>
                                  {v.path && (
                                    <code className="text-xs font-mono text-muted-foreground">
                                      {v.path}
                                    </code>
                                  )}
                                </div>
                                <p
                                  className={`mt-1 ${
                                    isWarning
                                      ? 'text-yellow-800 dark:text-yellow-200'
                                      : 'text-red-800 dark:text-red-200'
                                  }`}
                                >
                                  {v.message}
                                </p>
                                {hint && (
                                  <p className="mt-1 text-xs text-muted-foreground italic">
                                    Fix: {hint}
                                  </p>
                                )}
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex items-center gap-2">
                  {onEdit && !validationResult.isValid && (
                    <Button variant="outline" size="sm" onClick={() => onEdit(contract)}>
                      <Pencil className="w-4 h-4 mr-2" />
                      Edit Contract
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={runValidation}
                    disabled={isPublishing}
                  >
                    Re-run Checks
                  </Button>
                </div>
              </div>
            )}
          </Card>

          {/* Publish Action */}
          <Card className="p-6 bg-background">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
              Publish
            </h2>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Publishing will make this contract version <strong>immutable</strong>. It cannot be
                edited after publishing. Future changes will require creating a new version.
              </p>

              {publishState === 'error' && publishError && (
                <div className="flex items-start gap-2 p-3 rounded-md border border-destructive/40 bg-destructive/10 text-sm text-destructive">
                  <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{publishError}</span>
                </div>
              )}

              <Button onClick={handlePublish} disabled={!canPublish} className="gap-2">
                {isPublishing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Publishing...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Publish Version {contract.version}
                  </>
                )}
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
