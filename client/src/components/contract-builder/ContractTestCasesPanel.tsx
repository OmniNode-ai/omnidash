/**
 * ContractTestCasesPanel
 *
 * Test Cases tab for a contract version.
 * Displays attached test scenarios and allows attaching new ones.
 * Shows pass/fail status per test case per version.
 */

import { useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Plus, Trash2, CheckCircle, XCircle, MinusCircle, AlertCircle } from 'lucide-react';
import {
  useContractTestCases,
  useCreateContractTestCase,
  useDeleteContractTestCase,
} from '@/hooks/useContractTestCases';
import type { ContractTestCase } from '@/hooks/useContractTestCases';

// ============================================================================
// Helpers
// ============================================================================

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type ResultMeta = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
};

const RESULT_META: Record<string, ResultMeta> = {
  passed: { icon: CheckCircle, label: 'Passed', variant: 'default' },
  failed: { icon: XCircle, label: 'Failed', variant: 'destructive' },
  skipped: { icon: MinusCircle, label: 'Skipped', variant: 'secondary' },
};

function ResultBadge({ result }: { result: string | null }) {
  if (!result) {
    return (
      <Badge variant="outline" className="text-xs text-muted-foreground">
        Not run
      </Badge>
    );
  }
  const meta = RESULT_META[result] ?? {
    icon: AlertCircle,
    label: result,
    variant: 'outline' as const,
  };
  const Icon = meta.icon;
  return (
    <Badge variant={meta.variant} className="text-xs flex items-center gap-1">
      <Icon className="w-3 h-3" />
      {meta.label}
    </Badge>
  );
}

// ============================================================================
// Test case row
// ============================================================================

function TestCaseRow({
  testCase,
  onDelete,
  isDeleting,
}: {
  testCase: ContractTestCase;
  onDelete: (id: string) => void;
  isDeleting: boolean;
}) {
  return (
    <div className="flex items-start gap-3 p-3 border rounded-lg bg-background hover:bg-muted/30 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium truncate">{testCase.name}</span>
          <ResultBadge result={testCase.lastResult} />
        </div>

        {testCase.description && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
            {testCase.description}
          </p>
        )}

        <div className="flex items-center gap-3 mt-1 flex-wrap">
          {testCase.lastRunAt && (
            <span className="text-xs text-muted-foreground">
              Last run: {formatDateTime(testCase.lastRunAt)}
            </span>
          )}
          {testCase.lastRunBy && (
            <span className="text-xs text-muted-foreground font-mono">by {testCase.lastRunBy}</span>
          )}
          {Array.isArray(testCase.assertions) && testCase.assertions.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {testCase.assertions.length} assertion{testCase.assertions.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="shrink-0 text-muted-foreground hover:text-destructive"
        onClick={() => onDelete(testCase.id)}
        disabled={isDeleting}
        aria-label={`Delete test case: ${testCase.name}`}
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
}

// ============================================================================
// Add test case dialog
// ============================================================================

interface AddTestCaseDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, description: string) => void;
  isPending: boolean;
}

function AddTestCaseDialog({ open, onClose, onCreate, isPending }: AddTestCaseDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onCreate(name.trim(), description.trim());
  };

  const handleClose = () => {
    setName('');
    setDescription('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Test Case</DialogTitle>
          <DialogDescription>
            Attach a test scenario to this contract version. You can add inputs, expected outputs,
            and assertions after creation.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="tc-name" className="text-sm font-medium">
              Name <span className="text-destructive">*</span>
            </label>
            <Input
              id="tc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Happy path — valid input"
              autoFocus
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="tc-description" className="text-sm font-medium text-muted-foreground">
              Description
            </label>
            <Input
              id="tc-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this test verify?"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || isPending}>
              {isPending ? 'Adding…' : 'Add Test Case'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Main Component
// ============================================================================

interface ContractTestCasesPanelProps {
  /** UUID primary key of the contract version (contracts.id) */
  contractId: string;
  /** Whether the contract is editable (drafts only) */
  editable?: boolean;
}

export function ContractTestCasesPanel({
  contractId,
  editable = false,
}: ContractTestCasesPanelProps) {
  const [showAddDialog, setShowAddDialog] = useState(false);

  const { data: testCases, isLoading, error } = useContractTestCases(contractId);
  const createMutation = useCreateContractTestCase(contractId);
  const deleteMutation = useDeleteContractTestCase(contractId);

  const handleCreate = (name: string, description: string) => {
    createMutation.mutate(
      { name, description: description || undefined },
      { onSuccess: () => setShowAddDialog(false) }
    );
  };

  const handleDelete = (testCaseId: string) => {
    if (!window.confirm('Delete this test case? This cannot be undone.')) return;
    deleteMutation.mutate(testCaseId);
  };

  // ---- loading state
  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  // ---- error state
  if (error) {
    return (
      <div className="p-4 text-sm text-muted-foreground flex items-center gap-2">
        <AlertCircle className="w-4 h-4 text-destructive" />
        Failed to load test cases.
      </div>
    );
  }

  const cases = testCases ?? [];
  const passedCount = cases.filter((tc) => tc.lastResult === 'passed').length;
  const failedCount = cases.filter((tc) => tc.lastResult === 'failed').length;

  return (
    <>
      {/* Summary bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/20">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {cases.length} test case{cases.length !== 1 ? 's' : ''}
          </span>
          {cases.length > 0 && (
            <>
              <Badge variant="default" className="text-xs">
                {passedCount} passed
              </Badge>
              {failedCount > 0 && (
                <Badge variant="destructive" className="text-xs">
                  {failedCount} failed
                </Badge>
              )}
            </>
          )}
        </div>

        {editable && (
          <Button size="sm" variant="outline" onClick={() => setShowAddDialog(true)}>
            <Plus className="w-4 h-4 mr-1" />
            Add Test Case
          </Button>
        )}
      </div>

      {/* List */}
      {cases.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-sm text-muted-foreground italic">
            No test cases attached to this contract version.
          </p>
          {editable && (
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={() => setShowAddDialog(true)}
            >
              <Plus className="w-4 h-4 mr-1" />
              Add First Test Case
            </Button>
          )}
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-2">
            {cases.map((tc) => (
              <TestCaseRow
                key={tc.id}
                testCase={tc}
                onDelete={handleDelete}
                isDeleting={deleteMutation.isPending}
              />
            ))}
          </div>
        </ScrollArea>
      )}

      <AddTestCaseDialog
        open={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        onCreate={handleCreate}
        isPending={createMutation.isPending}
      />
    </>
  );
}
