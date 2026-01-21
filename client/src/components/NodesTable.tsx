/**
 * NodesTable Component
 *
 * Interactive table displaying registered nodes with their type, state, version,
 * and capabilities. Supports row selection for detail panel integration.
 *
 * Features:
 * - Striped rows for readability
 * - Responsive column visibility (version hidden on mobile, capabilities on tablet)
 * - Capability badges with overflow indicator
 * - Click-to-select row behavior
 * - Accessible table structure
 *
 * Part of OMN-1278: Contract-Driven Dashboard - Registry Discovery
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { NodeTypeIcon, NodeStateBadge } from '@/components/NodeDetailPanel';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RegisteredNodeInfo } from '@/lib/configs/registry-discovery-dashboard';

/**
 * Props for the NodesTable component
 */
export interface NodesTableProps {
  /**
   * Array of registered nodes to display in the table
   */
  nodes: RegisteredNodeInfo[];

  /**
   * Callback when a node row is clicked
   * @param node - The clicked node
   */
  onNodeClick: (node: RegisteredNodeInfo) => void;
}

/**
 * NodesTable displays registered nodes in an interactive table format.
 *
 * @example
 * ```tsx
 * <NodesTable
 *   nodes={filteredNodes}
 *   onNodeClick={(node) => setSelectedNode(node)}
 * />
 * ```
 */
export function NodesTable({ nodes, onNodeClick }: NodesTableProps) {
  if (nodes.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium">Registered Nodes</CardTitle>
        <p className="text-sm text-muted-foreground">
          Click a node to view details and live instances
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="rounded-md border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left py-3 px-4 font-medium">Name</th>
                  <th className="text-left py-3 px-4 font-medium">Type</th>
                  <th className="text-left py-3 px-4 font-medium">State</th>
                  <th className="text-left py-3 px-4 font-medium hidden md:table-cell">Version</th>
                  <th className="text-left py-3 px-4 font-medium hidden lg:table-cell">
                    Capabilities
                  </th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {nodes.map((node: RegisteredNodeInfo, idx: number) => {
                  const capabilities = node.capabilities;
                  const displayCaps = capabilities.slice(0, 3);
                  const moreCaps = capabilities.length - 3;

                  return (
                    <tr
                      key={node.node_id || node.name}
                      className={cn(
                        'border-b last:border-b-0 cursor-pointer transition-colors',
                        'hover:bg-muted/50',
                        idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'
                      )}
                      onClick={() => onNodeClick(node)}
                    >
                      <td className="py-3 px-4">
                        <span className="font-medium">{node.name}</span>
                      </td>
                      <td className="py-3 px-4">
                        <NodeTypeIcon type={node.node_type} showLabel />
                      </td>
                      <td className="py-3 px-4">
                        <NodeStateBadge state={node.state} />
                      </td>
                      <td className="py-3 px-4 hidden md:table-cell">
                        <span className="font-mono text-xs">{node.version}</span>
                      </td>
                      <td className="py-3 px-4 hidden lg:table-cell">
                        <div className="flex flex-wrap gap-1 max-w-[300px]">
                          {displayCaps.map((cap) => (
                            <Badge
                              key={cap}
                              variant="outline"
                              className="text-xs font-mono bg-muted/50"
                            >
                              {cap}
                            </Badge>
                          ))}
                          {moreCaps > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              +{moreCaps} more
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default NodesTable;
