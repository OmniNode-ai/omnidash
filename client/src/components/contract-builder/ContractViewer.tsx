import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useTheme } from '@/components/ThemeProvider';
import { ArrowLeft, Pencil, Copy, History, ChevronDown, Upload, Download } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ContractStatusBadge } from './ContractStatusBadge';
import { ContractTypeBadge } from './ContractTypeBadge';
import type { Contract } from './models/types';

interface ContractViewerProps {
  contract: Contract;
  /** All versions of this contract (for version switching) */
  allVersions?: Contract[];
  onBack: () => void;
  onEdit?: (contract: Contract) => void;
  onDuplicate?: (contract: Contract) => void;
  onViewHistory?: (contract: Contract) => void;
  /** Called when user wants to publish a draft contract */
  onPublish?: (contract: Contract) => void;
  /** Called when user selects a different version */
  onVersionChange?: (contract: Contract) => void;
}

// Format date for display
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Metadata row component
function MetadataRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 py-2">
      <span className="text-sm text-muted-foreground w-32 shrink-0">{label}</span>
      <div className="text-sm">{children}</div>
    </div>
  );
}

// Section component for grouping fields
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
        {title}
      </h3>
      <div className="border rounded-lg p-4 bg-background">{children}</div>
    </div>
  );
}

/**
 * Contract Viewer Component
 *
 * Read-only view of a contract with formatted display.
 * Features:
 * - Resizable split view: Formatted data on left, JSON on right
 * - Action buttons for Edit, Duplicate, History
 * - Clean metadata display with sections
 */
export function ContractViewer({
  contract,
  allVersions = [],
  onBack,
  onEdit,
  onDuplicate,
  onViewHistory,
  onPublish,
  onVersionChange,
}: ContractViewerProps) {
  const { theme } = useTheme();

  // Check if there are multiple versions to show the dropdown
  const hasMultipleVersions = allVersions.length > 1;

  // Handle version change from dropdown
  const handleVersionChange = (versionId: string) => {
    const selectedVersion = allVersions.find((v) => v.id === versionId);
    if (selectedVersion && onVersionChange) {
      onVersionChange(selectedVersion);
    }
  };
  // Build the full contract data for JSON preview
  // In future, this would include the actual contract schema/config
  const contractData = useMemo(
    () => ({
      id: contract.id,
      contractId: contract.contractId,
      name: contract.name,
      displayName: contract.displayName,
      type: contract.type,
      status: contract.status,
      version: contract.version,
      description: contract.description,
      createdAt: contract.createdAt,
      updatedAt: contract.updatedAt,
      createdBy: contract.createdBy,
      // Placeholder for actual contract configuration
      // This would be populated from the API in the future
      configuration: {
        node_identity: {
          name: contract.name,
          version: contract.version,
        },
        // Additional schema fields would go here
      },
    }),
    [contract]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div className="h-6 w-px bg-border" />
          <span className="text-lg font-medium">{contract.displayName || contract.name}</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Export button - triggers ZIP download */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              // Trigger download via anchor link
              const link = document.createElement('a');
              link.href = `/api/contracts/${contract.id}/export`;
              link.download = `contract_${contract.contractId}_v${contract.version.replace(/\./g, '-')}.zip`;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            }}
          >
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          {onViewHistory && (
            <Button variant="outline" size="sm" onClick={() => onViewHistory(contract)}>
              <History className="w-4 h-4 mr-2" />
              History
            </Button>
          )}
          {/* Edit split button with dropdown for secondary actions */}
          {onEdit && (
            <div className="flex">
              <Button size="sm" className="rounded-r-none" onClick={() => onEdit(contract)}>
                <Pencil className="w-4 h-4 mr-2" />
                Edit
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" className="rounded-l-none border-l-0 px-2">
                    <ChevronDown className="w-4 h-4" />
                    <span className="sr-only">More edit options</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {onDuplicate && (
                    <DropdownMenuItem onClick={() => onDuplicate(contract)}>
                      <Copy className="w-4 h-4 mr-2" />
                      Duplicate
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
          {/* Publish button - enabled only for draft contracts */}
          {onPublish && (
            <Button
              size="sm"
              disabled={contract.status !== 'draft'}
              onClick={() => onPublish(contract)}
            >
              <Upload className="w-4 h-4 mr-2" />
              Publish
            </Button>
          )}
        </div>
      </div>

      {/* Content - Resizable split view */}
      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          {/* Details Panel */}
          <ResizablePanel defaultSize={60} minSize={30}>
            <div className="h-full overflow-auto p-6">
              <div className="max-w-2xl">
                {/* Overview Section */}
                <Section title="Overview">
                  <MetadataRow label="Name">
                    <span className="font-mono">{contract.name}</span>
                  </MetadataRow>
                  {contract.displayName && contract.displayName !== contract.name && (
                    <MetadataRow label="Display Name">{contract.displayName}</MetadataRow>
                  )}
                  <MetadataRow label="Description">
                    {contract.description || (
                      <span className="text-muted-foreground italic">No description</span>
                    )}
                  </MetadataRow>
                  <MetadataRow label="Type">
                    <ContractTypeBadge type={contract.type} />
                  </MetadataRow>
                  <MetadataRow label="Status">
                    <ContractStatusBadge status={contract.status} />
                  </MetadataRow>
                  <MetadataRow label="Version">
                    {hasMultipleVersions ? (
                      <Select value={contract.id} onValueChange={handleVersionChange}>
                        <SelectTrigger className="w-[180px] h-8 font-mono text-sm">
                          <SelectValue>{contract.version}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {allVersions.map((v) => (
                            <SelectItem key={v.id} value={v.id} className="font-mono">
                              <span className="flex items-center gap-2">
                                {v.version}
                                {v.id === contract.id && (
                                  <span className="text-xs text-muted-foreground">(current)</span>
                                )}
                                {v.status !== 'published' && (
                                  <span className="text-xs text-muted-foreground">
                                    ({v.status})
                                  </span>
                                )}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="font-mono">{contract.version}</span>
                    )}
                  </MetadataRow>
                </Section>

                {/* Metadata Section */}
                <Section title="Metadata">
                  <MetadataRow label="Created">{formatDate(contract.createdAt)}</MetadataRow>
                  <MetadataRow label="Last Updated">{formatDate(contract.updatedAt)}</MetadataRow>
                  <MetadataRow label="Created By">
                    <span className="font-mono text-xs">{contract.createdBy}</span>
                  </MetadataRow>
                  <MetadataRow label="Contract ID">
                    <span className="font-mono text-xs text-muted-foreground">
                      {contract.contractId}
                    </span>
                  </MetadataRow>
                  <MetadataRow label="Version ID">
                    <span className="font-mono text-xs text-muted-foreground">{contract.id}</span>
                  </MetadataRow>
                </Section>

                {/* Configuration Section - Placeholder for future */}
                <Section title="Configuration">
                  <p className="text-sm text-muted-foreground italic">
                    Contract schema configuration will be displayed here once loaded from the API.
                  </p>
                </Section>
              </div>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* JSON Preview Panel */}
          <ResizablePanel defaultSize={40} minSize={20}>
            <div className="h-full overflow-auto p-2 bg-muted/30">
              <SyntaxHighlighter
                language="json"
                style={theme === 'dark' ? oneDark : oneLight}
                customStyle={{
                  margin: 0,
                  padding: '1rem',
                  borderRadius: '0.5rem',
                  fontSize: '0.75rem',
                  height: '100%',
                }}
              >
                {JSON.stringify(contractData, null, 2)}
              </SyntaxHighlighter>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
