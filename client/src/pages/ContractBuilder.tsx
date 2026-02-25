import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { FileText } from 'lucide-react';
import {
  ContractEmptyState,
  ContractList,
  ContractTypeSelector,
  ContractEditor,
  ContractViewer,
  ContractPublish,
  ContractHistory,
  ContractDiff,
  type ContractType,
} from '@/components/contract-builder';
import { contractRegistrySource, type Contract } from '@/lib/data-sources';

type ViewState = 'list' | 'select-type' | 'editor' | 'viewer' | 'publish' | 'history' | 'diff';

/**
 * Compare semantic versions (e.g., "1.2.0" vs "1.10.0")
 * Returns positive if a > b, negative if a < b, 0 if equal
 */
function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);
  const maxLength = Math.max(partsA.length, partsB.length);

  for (let i = 0; i < maxLength; i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
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
 * Get all versions of a specific contract
 */
function getContractVersions(contracts: Contract[], contractId: string): Contract[] {
  return contracts
    .filter((c) => c.contractId === contractId)
    .sort((a, b) => compareVersions(b.version, a.version)); // Newest first
}

/**
 * Contract Builder Page
 *
 * Main entry point for contract management.
 * Routes between list view, empty state, type selector, and editor.
 */
export default function ContractBuilder() {
  const [view, setView] = useState<ViewState>('list');
  const [selectedType, setSelectedType] = useState<ContractType | null>(null);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  // For diff view: track the two versions being compared
  const [diffVersions, setDiffVersions] = useState<{ older: Contract; newer: Contract } | null>(
    null
  );

  // Get ALL contracts from the registry source (supports mock/API modes)
  const allContracts = contractRegistrySource.getContractsSync();

  // For the list view, show only the latest version of each contract
  const latestContracts = useMemo(() => getLatestVersions(allContracts), [allContracts]);

  // Get all versions of the currently selected contract (for version switching)
  const selectedContractVersions = useMemo(
    () => (selectedContract ? getContractVersions(allContracts, selectedContract.contractId) : []),
    [allContracts, selectedContract]
  );

  const hasContracts = latestContracts.length > 0;

  const handleCreateFirst = () => {
    setView('select-type');
  };

  const handleCreateNew = () => {
    setView('select-type');
  };

  const handleBackToList = () => {
    setView('list');
    setSelectedType(null);
    setSelectedContract(null);
  };

  const handleTypeSelected = (type: ContractType) => {
    setSelectedContract(null); // Clear any previously selected contract - we're creating new
    setSelectedType(type);
    setView('editor');
  };

  // Handler for editing a contract
  const handleEditContract = (contract: Contract) => {
    // Check if the contract is a draft - only drafts can be edited in place
    if (contract.status === 'draft') {
      // Edit draft - navigate to editor with contract data
      setSelectedContract(contract);
      setSelectedType(contract.type);
      setView('editor');
    } else {
      // Immutable contract (validated, published, deprecated, archived)
      // Check if a draft already exists for this contract
      const existingDraft = contractRegistrySource.getDraftVersion(contract.contractId);

      if (existingDraft) {
        // A draft already exists - offer to edit it instead
        const editExisting = window.confirm(
          `A draft version (v${existingDraft.version}) already exists for this contract.\n\n` +
            `Would you like to edit the existing draft?`
        );
        if (editExisting) {
          setSelectedContract(existingDraft);
          setSelectedType(existingDraft.type);
          setView('editor');
        }
      } else {
        // Create a new draft version
        const newDraft = contractRegistrySource.createDraftVersion(contract, 'patch');
        setSelectedContract(newDraft);
        setSelectedType(newDraft.type);
        setView('editor');
      }
    }
  };

  // Handler for duplicating a contract
  const handleDuplicateContract = (contract: Contract) => {
    console.log('Duplicate contract:', contract);
    // TODO: Create a copy with new ID and "Copy of" prefix
  };

  // Handler for viewing a contract (read-only)
  const handleSelectContract = (contract: Contract) => {
    setSelectedContract(contract);
    setView('viewer');
  };

  // Handler for publishing a contract (opens publish workflow)
  const handlePublishContract = (contract: Contract) => {
    setSelectedContract(contract);
    setView('publish');
  };

  // Handler for when publish completes
  const handlePublishComplete = (contract: Contract) => {
    console.log('Contract published:', contract);
    // TODO: Update contract status in API, refresh list
    // For now, just go back to list
    handleBackToList();
  };

  // Handler for viewing contract history
  const handleViewHistory = (contract: Contract) => {
    setSelectedContract(contract);
    setView('history');
  };

  // Handler for comparing two versions
  const handleCompareVersions = (older: Contract, newer: Contract) => {
    setDiffVersions({ older, newer });
    setView('diff');
  };

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Header */}
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

      {/* Main content */}
      <Card className="contract-builder-content flex flex-col">
        {view === 'list' ? (
          hasContracts ? (
            <ContractList
              contracts={latestContracts}
              onCreateNew={handleCreateNew}
              onSelectContract={handleSelectContract}
              onEditContract={handleEditContract}
              onDuplicateContract={handleDuplicateContract}
              onPublishContract={handlePublishContract}
            />
          ) : (
            <ContractEmptyState onCreateFirst={handleCreateFirst} />
          )
        ) : view === 'select-type' ? (
          <ContractTypeSelector onSelect={handleTypeSelected} onBack={handleBackToList} />
        ) : view === 'viewer' && selectedContract ? (
          <ContractViewer
            contract={selectedContract}
            allVersions={selectedContractVersions}
            onBack={handleBackToList}
            onEdit={handleEditContract}
            onDuplicate={handleDuplicateContract}
            onViewHistory={handleViewHistory}
            onPublish={handlePublishContract}
            onVersionChange={setSelectedContract}
          />
        ) : view === 'editor' && selectedType ? (
          <ContractEditor
            contractType={selectedType}
            contract={selectedContract ?? undefined}
            initialData={
              selectedContract
                ? {
                    // TODO: Map contract data to form schema structure
                    // For now, we'll use a minimal mapping
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
              // TODO: Save to API, then navigate to list
              handleBackToList();
            }}
          />
        ) : view === 'publish' && selectedContract ? (
          <ContractPublish
            contract={selectedContract}
            onBack={handleBackToList}
            onEdit={handleEditContract}
            onPublish={handlePublishComplete}
          />
        ) : view === 'history' && selectedContract ? (
          <ContractHistory
            contract={selectedContract}
            allVersions={selectedContractVersions}
            onBack={() => {
              // Go back to viewer for the selected contract
              setView('viewer');
            }}
            onViewVersion={(version) => {
              setSelectedContract(version);
              setView('viewer');
            }}
            onCompareVersions={handleCompareVersions}
            onCreateDraftFromVersion={(version) => {
              // Create a new draft based on the selected version
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
                const newDraft = contractRegistrySource.createDraftVersion(version, 'patch');
                setSelectedContract(newDraft);
                setSelectedType(newDraft.type);
                setView('editor');
              }
            }}
          />
        ) : view === 'diff' && diffVersions ? (
          <ContractDiff
            olderVersion={diffVersions.older}
            newerVersion={diffVersions.newer}
            onBack={() => {
              // Go back to history view
              setView('history');
            }}
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
