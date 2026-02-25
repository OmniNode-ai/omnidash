/**
 * ContractLifecycleActions
 *
 * Renders the lifecycle-transition buttons appropriate for the current
 * contract status, with confirmation dialogs for irreversible actions.
 *
 * Supported transitions:
 *   DRAFT      → validate (gate check) then PUBLISHED via ContractPublish
 *   PUBLISHED  → DEPRECATED  (confirm dialog)
 *
 * The "Submit for review" / "Publish" flow delegates to ContractPublish
 * (handled in the parent page) rather than duplicating that UI here.
 * This component focuses on post-publish deprecation.
 */

import { useState } from 'react';
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
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useDeprecateContract, useArchiveContract } from '@/hooks/useContractRegistry';
import type { Contract } from './models/types';

interface ContractLifecycleActionsProps {
  contract: Contract;
  /** Called after a successful lifecycle transition with the updated contract */
  onTransition?: (updatedContract: Contract) => void;
  className?: string;
}

export function ContractLifecycleActions({
  contract,
  onTransition,
  className,
}: ContractLifecycleActionsProps) {
  const { toast } = useToast();
  const [confirmDeprecate, setConfirmDeprecate] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);

  const { mutateAsync: deprecate, isPending: isDeprecating } = useDeprecateContract();
  const { mutateAsync: archive, isPending: isArchiving } = useArchiveContract();

  const isPending = isDeprecating || isArchiving;

  // ---------------------------------------------------------------------------
  // Deprecate (PUBLISHED → DEPRECATED)
  // ---------------------------------------------------------------------------

  async function handleDeprecate() {
    try {
      const result = await deprecate(contract.id);
      setConfirmDeprecate(false);
      toast({
        title: 'Contract deprecated',
        description: `${contract.displayName || contract.name} v${contract.version} has been deprecated.`,
      });
      onTransition?.(result.contract);
    } catch (err) {
      toast({
        title: 'Deprecation failed',
        description: err instanceof Error ? err.message : 'An unexpected error occurred.',
        variant: 'destructive',
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Archive (DEPRECATED → ARCHIVED)
  // ---------------------------------------------------------------------------

  async function handleArchive() {
    try {
      const result = await archive(contract.id);
      setConfirmArchive(false);
      toast({
        title: 'Contract archived',
        description: `${contract.displayName || contract.name} v${contract.version} has been archived.`,
      });
      onTransition?.(result.contract);
    } catch (err) {
      toast({
        title: 'Archive failed',
        description: err instanceof Error ? err.message : 'An unexpected error occurred.',
        variant: 'destructive',
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // Only published contracts can be deprecated; only deprecated can be archived
  if (contract.status !== 'published' && contract.status !== 'deprecated') {
    return null;
  }

  return (
    <div className={className}>
      {contract.status === 'published' && (
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmDeprecate(true)}
            disabled={isPending}
            className="text-yellow-600 border-yellow-300 hover:bg-yellow-50 dark:text-yellow-400 dark:border-yellow-700 dark:hover:bg-yellow-950"
          >
            {isDeprecating ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <AlertTriangle className="w-4 h-4 mr-1" />
            )}
            Deprecate
          </Button>

          <AlertDialog open={confirmDeprecate} onOpenChange={setConfirmDeprecate}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Deprecate Contract?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will mark <strong>{contract.displayName || contract.name}</strong> v
                  {contract.version} as deprecated. Deprecated contracts are still accessible but
                  signal that consumers should migrate to a newer version. This action cannot be
                  undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isDeprecating}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault();
                    void handleDeprecate();
                  }}
                  disabled={isDeprecating}
                  className="bg-yellow-600 hover:bg-yellow-700 focus-visible:ring-yellow-600"
                >
                  {isDeprecating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      Deprecating...
                    </>
                  ) : (
                    'Deprecate'
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}

      {contract.status === 'deprecated' && (
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmArchive(true)}
            disabled={isPending}
            className="text-muted-foreground hover:text-destructive"
          >
            {isArchiving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
            Archive
          </Button>

          <AlertDialog open={confirmArchive} onOpenChange={setConfirmArchive}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Archive Contract?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will archive <strong>{contract.displayName || contract.name}</strong> v
                  {contract.version}. Archived contracts are hidden from default views and
                  considered end-of-life. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isArchiving}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault();
                    void handleArchive();
                  }}
                  disabled={isArchiving}
                  className="bg-destructive hover:bg-destructive/90"
                >
                  {isArchiving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      Archiving...
                    </>
                  ) : (
                    'Archive'
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  );
}
