/**
 * ContractCreateWizard
 *
 * A 3-step guided creation flow:
 *   Step 1 — Select contract type
 *   Step 2 — Enter name, display name, description, initial version
 *   Step 3 — Creates DRAFT via API and opens editor
 *
 * Auto-saves form state to localStorage so data survives accidental navigation.
 */

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { ArrowLeft, ArrowRight, Loader2, Workflow, Zap, Database, Cpu } from 'lucide-react';
import type { ContractType, Contract } from './models/types';
import { useCreateContract } from '@/hooks/useContractRegistry';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LS_KEY = 'contract-create-wizard:draft';

interface WizardDraft {
  type: ContractType | null;
  name: string;
  displayName: string;
  description: string;
  version: string;
}

const EMPTY_DRAFT: WizardDraft = {
  type: null,
  name: '',
  displayName: '',
  description: '',
  version: '1.0.0',
};

const TYPE_CONFIG: Record<
  ContractType,
  {
    label: string;
    description: string;
    icon: React.ElementType;
    color: string;
    bg: string;
    border: string;
    hover: string;
  }
> = {
  orchestrator: {
    label: 'Orchestrator',
    description: 'Coordinate workflows and manage multi-step processes',
    icon: Workflow,
    color: 'text-purple-500',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500',
    hover: 'hover:bg-purple-500/5',
  },
  effect: {
    label: 'Effect',
    description: 'Handle external interactions, APIs, and side effects',
    icon: Zap,
    color: 'text-yellow-500',
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500',
    hover: 'hover:bg-yellow-500/5',
  },
  reducer: {
    label: 'Reducer',
    description: 'Manage state, persistence, and data aggregation',
    icon: Database,
    color: 'text-green-500',
    bg: 'bg-green-500/10',
    border: 'border-green-500',
    hover: 'hover:bg-green-500/5',
  },
  compute: {
    label: 'Compute',
    description: 'Process data with pure, deterministic transformations',
    icon: Cpu,
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500',
    hover: 'hover:bg-blue-500/5',
  },
};

const ALL_TYPES: ContractType[] = ['orchestrator', 'effect', 'reducer', 'compute'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadDraft(): WizardDraft {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as WizardDraft;
  } catch {
    // ignore
  }
  return { ...EMPTY_DRAFT };
}

function saveDraft(d: WizardDraft) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(d));
  } catch {
    // ignore
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    // ignore
  }
}

function toContractId(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ContractCreateWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after the draft is created — navigates the parent to the editor */
  onCreated: (contract: Contract) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ContractCreateWizard({ open, onOpenChange, onCreated }: ContractCreateWizardProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [draft, setDraft] = useState<WizardDraft>(() => loadDraft());
  const [errors, setErrors] = useState<Partial<Record<keyof WizardDraft, string>>>({});

  const { mutateAsync: createContract, isPending } = useCreateContract();

  // Persist draft to localStorage whenever it changes
  useEffect(() => {
    if (open) saveDraft(draft);
  }, [draft, open]);

  // Reset to step 1 when dialog opens fresh (but keep draft data for recovery)
  useEffect(() => {
    if (open) setStep(1);
  }, [open]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handleTypeSelect(type: ContractType) {
    setDraft((d) => ({ ...d, type }));
  }

  function handleNext() {
    if (step === 1) {
      if (!draft.type) return;
      setStep(2);
    }
  }

  function handleBack() {
    if (step === 2) setStep(1);
  }

  function handleClose() {
    onOpenChange(false);
  }

  function validateStep2(): boolean {
    const newErrors: Partial<Record<keyof WizardDraft, string>> = {};

    if (!draft.name.trim()) {
      newErrors.name = 'Name is required';
    } else if (!/^[a-z][a-z0-9-]*$/.test(draft.name.trim())) {
      newErrors.name =
        'Name must start with a lowercase letter and contain only lowercase letters, numbers, and hyphens';
    }

    if (!draft.displayName.trim()) {
      newErrors.displayName = 'Display name is required';
    }

    if (!draft.version.trim()) {
      newErrors.version = 'Version is required';
    } else if (!/^\d+\.\d+\.\d+$/.test(draft.version.trim())) {
      newErrors.version = 'Version must be in semantic versioning format (e.g., 1.0.0)';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleCreate() {
    if (!draft.type) return;
    if (!validateStep2()) return;

    try {
      const contract = await createContract({
        name: draft.name.trim(),
        displayName: draft.displayName.trim(),
        type: draft.type,
        version: draft.version.trim(),
        description: draft.description.trim() || undefined,
      });

      clearDraft();
      setDraft({ ...EMPTY_DRAFT });
      setStep(1);
      onOpenChange(false);
      onCreated(contract);
    } catch (err) {
      // Surface error in the name field as a generic API error
      setErrors({ name: err instanceof Error ? err.message : 'Failed to create contract' });
    }
  }

  // Auto-fill displayName when name changes (if displayName not yet touched)
  function handleNameChange(value: string) {
    setDraft((d) => ({
      ...d,
      name: value,
      // Auto-fill displayName from name if it hasn't been manually edited
      displayName: d.displayName === toDisplayName(d.name) ? toDisplayName(value) : d.displayName,
    }));
    if (errors.name) setErrors((e) => ({ ...e, name: undefined }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New Contract</DialogTitle>
          <DialogDescription>
            {step === 1
              ? 'Step 1 of 2 — Choose the contract type'
              : 'Step 2 of 2 — Enter contract details'}
          </DialogDescription>
        </DialogHeader>

        {/* Progress indicator */}
        <div className="flex items-center gap-2 mb-2">
          {([1, 2] as const).map((s) => (
            <div
              key={s}
              className={cn(
                'h-1.5 flex-1 rounded-full transition-colors',
                s <= step ? 'bg-primary' : 'bg-muted'
              )}
            />
          ))}
        </div>

        {/* Step 1: Type selection */}
        {step === 1 && (
          <div className="grid grid-cols-2 gap-3 py-2">
            {ALL_TYPES.map((type) => {
              const cfg = TYPE_CONFIG[type];
              const isSelected = draft.type === type;
              return (
                <button
                  key={type}
                  onClick={() => handleTypeSelect(type)}
                  className={cn(
                    'flex flex-col items-center gap-2 p-5 rounded-lg border-2 transition-all text-center',
                    cfg.hover,
                    isSelected ? `${cfg.border} ${cfg.bg}` : 'border-border'
                  )}
                >
                  <div className={cn('p-2.5 rounded-lg', cfg.bg)}>
                    <cfg.icon className={cn('w-7 h-7', cfg.color)} />
                  </div>
                  <p className="font-semibold text-sm">{cfg.label}</p>
                  <p className="text-xs text-muted-foreground">{cfg.description}</p>
                </button>
              );
            })}
          </div>
        )}

        {/* Step 2: Contract details */}
        {step === 2 && draft.type && (
          <div className="space-y-4 py-2">
            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="contract-name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="contract-name"
                placeholder="e.g. fetch-user-data"
                value={draft.name}
                onChange={(e) => handleNameChange(e.target.value)}
                className={cn(errors.name && 'border-destructive')}
                autoFocus
              />
              {errors.name ? (
                <p className="text-xs text-destructive">{errors.name}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Lowercase letters, numbers, hyphens only. Used as the stable contract ID.
                </p>
              )}
            </div>

            {/* Display Name */}
            <div className="space-y-1.5">
              <Label htmlFor="contract-display-name">
                Display Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="contract-display-name"
                placeholder="e.g. Fetch User Data"
                value={draft.displayName}
                onChange={(e) => {
                  setDraft((d) => ({ ...d, displayName: e.target.value }));
                  if (errors.displayName) setErrors((er) => ({ ...er, displayName: undefined }));
                }}
                className={cn(errors.displayName && 'border-destructive')}
              />
              {errors.displayName && (
                <p className="text-xs text-destructive">{errors.displayName}</p>
              )}
            </div>

            {/* Initial Version */}
            <div className="space-y-1.5">
              <Label htmlFor="contract-version">
                Initial Version <span className="text-destructive">*</span>
              </Label>
              <Input
                id="contract-version"
                placeholder="1.0.0"
                value={draft.version}
                onChange={(e) => {
                  setDraft((d) => ({ ...d, version: e.target.value }));
                  if (errors.version) setErrors((er) => ({ ...er, version: undefined }));
                }}
                className={cn('w-40 font-mono', errors.version && 'border-destructive')}
              />
              {errors.version && <p className="text-xs text-destructive">{errors.version}</p>}
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="contract-description">Description</Label>
              <Textarea
                id="contract-description"
                placeholder="Briefly describe what this contract does..."
                value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                rows={3}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">Optional but recommended for clarity.</p>
            </div>
          </div>
        )}

        {/* Footer navigation */}
        <div className="flex items-center justify-between pt-2 border-t mt-2">
          {step === 1 ? (
            <Button variant="ghost" onClick={handleClose}>
              Cancel
            </Button>
          ) : (
            <Button variant="ghost" onClick={handleBack} disabled={isPending}>
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
          )}

          {step === 1 ? (
            <Button onClick={handleNext} disabled={!draft.type}>
              Continue
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleCreate} disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Draft'
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function toDisplayName(name: string): string {
  return name.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
