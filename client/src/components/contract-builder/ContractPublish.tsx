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

interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

interface ValidationError {
  field: string;
  message: string;
}

interface ValidationWarning {
  field: string;
  message: string;
}

type ValidationState = 'idle' | 'validating' | 'complete';

/**
 * Contract Publish Component
 *
 * Dedicated page for publishing a draft contract.
 * Shows validation status, errors, and publish confirmation.
 */
export function ContractPublish({ contract, onBack, onEdit, onPublish }: ContractPublishProps) {
  const [validationState, setValidationState] = useState<ValidationState>('idle');
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);

  // Auto-run validation when component mounts
  useEffect(() => {
    runValidation();
  }, [contract.id]);

  // Mock validation - in the future this would call the API
  const runValidation = async () => {
    setValidationState('validating');

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Mock validation result - in production, this would call the actual validation API
    const mockErrors: ValidationError[] = [];
    const mockWarnings: ValidationWarning[] = [];

    // === VALIDATION ERRORS (block publishing) ===

    // Error: Missing description entirely
    if (!contract.description) {
      mockErrors.push({
        field: 'description',
        message: 'Description is required for publishing',
      });
    }

    // Error: Name contains invalid characters
    if (!/^[a-z][a-z0-9-]*$/.test(contract.name)) {
      mockErrors.push({
        field: 'name',
        message:
          'Name must start with a lowercase letter and contain only lowercase letters, numbers, and hyphens',
      });
    }

    // Error: Version format invalid
    if (!/^\d+\.\d+\.\d+$/.test(contract.version)) {
      mockErrors.push({
        field: 'version',
        message: 'Version must be in semantic versioning format (e.g., 1.0.0)',
      });
    }

    // === VALIDATION WARNINGS (allow publishing but notify user) ===

    // Warning: Short description
    if (contract.description && contract.description.length < 20) {
      mockWarnings.push({
        field: 'description',
        message: 'Description is recommended to be at least 20 characters for clarity',
      });
    }

    // Warning: version 0.x.x indicates pre-release
    if (contract.version.startsWith('0.')) {
      mockWarnings.push({
        field: 'version',
        message: 'Version 0.x.x indicates pre-release. Consider using 1.0.0 for production.',
      });
    }

    setValidationResult({
      isValid: mockErrors.length === 0,
      errors: mockErrors,
      warnings: mockWarnings,
    });
    setValidationState('complete');
  };

  const handlePublish = async () => {
    setIsPublishing(true);

    // Simulate publish API call
    await new Promise((resolve) => setTimeout(resolve, 1000));

    onPublish(contract);
  };

  const canPublish = validationState === 'complete' && validationResult?.isValid && !isPublishing;

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
              Validation
            </h2>

            {validationState === 'idle' && (
              <p className="text-sm text-muted-foreground">Validation not started.</p>
            )}

            {validationState === 'validating' && (
              <div className="flex items-center gap-3 text-sm">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <span>Running validation checks...</span>
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
                        Validation passed
                      </span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-5 h-5 text-destructive" />
                      <span className="text-sm font-medium text-destructive">
                        Validation failed
                      </span>
                    </>
                  )}
                </div>

                {/* Errors */}
                {validationResult.errors.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-destructive">Errors</h3>
                    <ul className="space-y-1">
                      {validationResult.errors.map((error, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <XCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                          <span>
                            <span className="font-mono text-xs">{error.field}:</span>{' '}
                            {error.message}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Warnings */}
                {validationResult.warnings.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-yellow-600 dark:text-yellow-400">
                      Warnings
                    </h3>
                    <ul className="space-y-1">
                      {validationResult.warnings.map((warning, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" />
                          <span>
                            <span className="font-mono text-xs">{warning.field}:</span>{' '}
                            {warning.message}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex items-center gap-2">
                  {onEdit && (
                    <Button variant="outline" size="sm" onClick={() => onEdit(contract)}>
                      <Pencil className="w-4 h-4 mr-2" />
                      Edit Contract
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={runValidation}>
                    Re-run Validation
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
