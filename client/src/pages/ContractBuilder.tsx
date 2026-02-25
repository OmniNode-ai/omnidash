import { useState, useMemo, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { FileText, AlertCircle, RefreshCw } from 'lucide-react';
import {
  ContractEmptyState,
  ContractList,
  ContractEditor,
  ContractViewer,
  ContractPublish,
  ContractHistory,
  ContractDiff,
  ContractCreateWizard,
  ContractLifecycleActions,
  type ContractType,
} from '@/components/contract-builder';
import { useContracts, useValidateContract } from '@/hooks/useContractRegistry';
import { contractRegistrySource, type Contract } from '@/lib/data-sources';
import { useToast } from '@/hooks/use-toast';

type ViewState = 'list' | 'editor' | 'viewer' | 'publish' | 'history' | 'diff';

/**
 * Compare semantic versions (e.g., "1.2.0" vs "1.10.0")
 * Returns positive if a > b, negative if a < b, 0 if equal
 */
function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);
  const maxLength = Math.max(partsA.length, partsB.length);

  for (let i = 0; i < maxLength; i++) {
    const numA = partsA[i] ?? 0;
    const numB = partsB[i] ?? 0;
    if (numA !== numB) {
      return numA - numB;
    }
  }
  return 0;
}

/**
 * Get the latest version of each contract (grouped by contractId)
 */
function getLatestVersions(contracts: Contract[]): Contract[] {
  const latestByContractId = new Map<string, Contract>();

  for (const contract of contracts) {
    const existing = latestByContractId.get(contract.contractId);
    if (!existing || compareVersions(contract.version, existing.version) > 0) {
      latestByContractId.set(contract.contractId, contract);
    }
  }

  return Array.from(latestByContractId.values());
}

/**
 * Get all versions of a specific contract, newest first
 */
function getContractVersions(contracts: Contract[], contractId: string): Contract[] {
  return contracts
    .filter((c) => c.contractId === contractId)
    .sort((a, b) => compareVersions(b.version, a.version));
}

/**
 * Contract Builder Page
 *
 * Main entry point for contract management.
 * Uses TanStack Query to load contracts from the API.
 * Includes:
 *  - Library browser (searchable, filterable, sortable)
 *  - Guided creation wizard
 *  - Lifecycle state transitions (DRAFT → PUBLISHED → DEPRECATED)
 */
export default function ContractBuilder() {
  const { toast } = useToast();

  // View state
  const [view, setView] = useState<ViewState>('list');
  const [selectedType, setSelectedType] = useState<ContractType | null>(null);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [showCreateWizard, setShowCreateWizard] = useState(false);

  // For diff view: track the two versions being compared
  const [diffVersions, setDiffVersions] = useState<{ older: Contract; newer: Contract } | null>(
    null
  );

  // TanStack Query — load all contracts from the API
  const { data: allContracts = [], isLoading, isError, error, refetch } = useContracts();

  // Policy-gate validation mutation (used inside editor and publish flow)
  const { mutateAsync: validateContract } = useValidateContract();

  // For the list view, show only the latest version of each contract
  const latestContracts = useMemo(() => getLatestVersions(allContracts), [allContracts]);

  // All versions of the currently selected contract (for version switching)
  const selectedContractVersions = useMemo(
    () => (selectedContract ? getContractVersions(allContracts, selectedContract.contractId) : []),
    [allContracts, selectedContract]
  );

  const hasContracts = latestContracts.length > 0;

  // ---------------------------------------------------------------------------
  // Navigation helpers
  // ---------------------------------------------------------------------------

  const handleBackToList = useCallback(() => {
    setView('list');
    setSelectedType(null);
    setSelectedContract(null);
  }, []);

  // Called after wizard creates a new draft — open it in the editor immediately
  const handleDraftCreated = useCallback(
    (contract: Contract) => {
      setSelectedContract(contract);
      setSelectedType(contract.type);
      setView('editor');
      toast({
        title: 'Draft created',
        description: `${contract.displayName || contract.name} v${contract.version} is ready to edit.`,
      });
    },
    [toast]
  );

  // Edit handler: only drafts are directly editable; others get a new draft version
  const handleEditContract = useCallback(
    async (contract: Contract) => {
      if (contract.status === 'draft') {
        setSelectedContract(contract);
        setSelectedType(contract.type);
        setView('editor');
        return;
      }

      // Immutable contract — look for existing draft first
      const existingDraft = contractRegistrySource.getDraftVersion(contract.contractId);
      if (existingDraft) {
        const editExisting = window.confirm(
          `A draft version (v${existingDraft.version}) already exists for this contract.\n\n` +
            `Would you like to edit the existing draft?`
        );
        if (editExisting) {
          setSelectedContract(existingDraft);
          setSelectedType(existingDraft.type);
          setView('editor');
        }
        return;
      }

      // Create a new draft version via API
      try {
        const { data: newDraft } = await contractRegistrySource.createDraftVersionAsync(
          contract,
          'patch'
        );
        setSelectedContract(newDraft);
        setSelectedType(newDraft.type);
        setView('editor');
        toast({
          title: 'New draft created',
          description: `Editing draft v${newDraft.version} based on v${contract.version}.`,
        });
      } catch (err) {
        toast({
          title: 'Failed to create draft',
          description: err instanceof Error ? err.message : 'An unexpected error occurred.',
          variant: 'destructive',
        });
      }
    },
    [toast]
  );

  const handleSelectContract = useCallback((contract: Contract) => {
    setSelectedContract(contract);
    setView('viewer');
  }, []);

  const handlePublishContract = useCallback((contract: Contract) => {
    setSelectedContract(contract);
    setView('publish');
  }, []);

  const handlePublishComplete = useCallback(
    (contract: Contract) => {
      toast({
        title: 'Contract published',
        description: `${contract.displayName || contract.name} v${contract.version} is now live.`,
      });
      handleBackToList();
    },
    [handleBackToList, toast]
  );

  const handleViewHistory = useCallback((contract: Contract) => {
    setSelectedContract(contract);
    setView('history');
  }, []);

  const handleCompareVersions = useCallback((older: Contract, newer: Contract) => {
    setDiffVersions({ older, newer });
    setView('diff');
  }, []);

  // Called by ContractLifecycleActions after deprecation/archiving
  const handleLifecycleTransition = useCallback((updatedContract: Contract) => {
    // Update local state so viewer shows the new status immediately
    setSelectedContract(updatedContract);
  }, []);

  // Validate a draft before publishing (wires up the API gate check)
  const handleValidateContract = useCallback(
    async (contractId: string) => {
      return validateContract(contractId);
    },
    [validateContract]
  );

  // ---------------------------------------------------------------------------
  // Loading / error states
  // ---------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="h-full flex flex-col gap-4">
        <PageHeader />
        <Card className="flex flex-col gap-4 p-6">
          <div className="flex justify-end">
            <Skeleton className="h-9 w-32" />
          </div>
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </Card>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="h-full flex flex-col gap-4">
        <PageHeader />
        <Card className="flex flex-col items-center justify-center gap-4 p-12 text-center">
          <AlertCircle className="w-10 h-10 text-destructive" />
          <div>
            <p className="font-semibold text-destructive">Failed to load contracts</p>
            <p className="text-sm text-muted-foreground mt-1">
              {error instanceof Error ? error.message : 'An unexpected error occurred.'}
            </p>
          </div>
          <Button variant="outline" onClick={() => void refetch()} className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Retry
          </Button>
        </Card>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="h-full flex flex-col gap-4">
      <PageHeader />

      {/* Guided creation wizard dialog */}
      <ContractCreateWizard
        open={showCreateWizard}
        onOpenChange={setShowCreateWizard}
        onCreated={handleDraftCreated}
      />

      {/* Main content area */}
      <Card className="contract-builder-content flex flex-col">
        {view === 'list' ? (
          hasContracts ? (
            <ContractList
              contracts={latestContracts}
              onCreateNew={() => setShowCreateWizard(true)}
              onSelectContract={handleSelectContract}
              onEditContract={(c) => void handleEditContract(c)}
              onPublishContract={handlePublishContract}
              onViewHistory={handleViewHistory}
            />
          ) : (
            <ContractEmptyState onCreateFirst={() => setShowCreateWizard(true)} />
          )
        ) : view === 'viewer' && selectedContract ? (
          <div className="flex flex-col h-full">
            <ContractViewer
              contract={selectedContract}
              allVersions={selectedContractVersions}
              onBack={handleBackToList}
              onEdit={(c) => void handleEditContract(c)}
              onViewHistory={handleViewHistory}
              onPublish={handlePublishContract}
              onVersionChange={setSelectedContract}
            />
            {/* Lifecycle action buttons (deprecate / archive) rendered below viewer header */}
            <div className="flex items-center gap-2 px-4 pb-3 border-t pt-3">
              <ContractLifecycleActions
                contract={selectedContract}
                onTransition={handleLifecycleTransition}
                className="flex items-center gap-2"
              />
            </div>
          </div>
        ) : view === 'editor' && selectedType ? (
          <ContractEditor
            contractType={selectedType}
            contract={selectedContract ?? undefined}
            initialData={
              selectedContract
                ? {
                    node_identity: {
                      name: selectedContract.name,
                      version: selectedContract.version,
                    },
                    metadata: {
                      displayName: selectedContract.displayName,
                      description: selectedContract.description,
                    },
                  }
                : undefined
            }
            onBack={handleBackToList}
            onSave={(data) => {
              console.log('Contract saved:', data);
              // TODO: persist via updateContract mutation, then navigate to list
              handleBackToList();
            }}
          />
        ) : view === 'publish' && selectedContract ? (
          <ContractPublish
            contract={selectedContract}
            onBack={handleBackToList}
            onEdit={(c) => void handleEditContract(c)}
            onPublish={handlePublishComplete}
          />
        ) : view === 'history' && selectedContract ? (
          <ContractHistory
            contract={selectedContract}
            allVersions={selectedContractVersions}
            onBack={() => setView('viewer')}
            onViewVersion={(version) => {
              setSelectedContract(version);
              setView('viewer');
            }}
            onCompareVersions={handleCompareVersions}
            onCreateDraftFromVersion={async (version) => {
              const existingDraft = contractRegistrySource.getDraftVersion(version.contractId);
              if (existingDraft) {
                const editExisting = window.confirm(
                  `A draft version (v${existingDraft.version}) already exists.\n\n` +
                    `Would you like to edit the existing draft instead?`
                );
                if (editExisting) {
                  setSelectedContract(existingDraft);
                  setSelectedType(existingDraft.type);
                  setView('editor');
                }
              } else {
                try {
                  const { data: newDraft } = await contractRegistrySource.createDraftVersionAsync(
                    version,
                    'patch'
                  );
                  setSelectedContract(newDraft);
                  setSelectedType(newDraft.type);
                  setView('editor');
                } catch (err) {
                  toast({
                    title: 'Failed to create draft',
                    description:
                      err instanceof Error ? err.message : 'An unexpected error occurred.',
                    variant: 'destructive',
                  });
                }
              }
            }}
          />
        ) : view === 'diff' && diffVersions ? (
          <ContractDiff
            olderVersion={diffVersions.older}
            newerVersion={diffVersions.newer}
            onBack={() => setView('history')}
            onViewOlder={() => {
              setSelectedContract(diffVersions.older);
              setView('viewer');
            }}
            onViewNewer={() => {
              setSelectedContract(diffVersions.newer);
              setView('viewer');
            }}
          />
        ) : null}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PageHeader() {
  return (
    <div className="flex items-center justify-between flex-shrink-0">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <FileText className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Contracts</h1>
          <p className="text-muted-foreground text-sm">
            Schema-driven contract authoring and governance
          </p>
        </div>
      </div>
    </div>
  );
}
