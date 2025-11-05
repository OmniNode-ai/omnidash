/**
 * Mock Data Generator for Knowledge Graph Dashboard
 */

import { MockDataGenerator as Gen } from './config';
import type { GraphNode, GraphEdge, KnowledgeGraphData } from '../data-sources/knowledge-graph-source';

export class KnowledgeGraphMockData {
  /**
   * Generate mock knowledge graph nodes
   */
  static generateNodes(count: number = 50): GraphNode[] {
    const nodes: GraphNode[] = [];
    const nodeTypes = ['pattern', 'service', 'agent', 'api', 'database', 'component'];

    // Generate pattern nodes
    const patternCount = Math.floor(count * 0.4);
    for (let i = 0; i < patternCount; i++) {
      nodes.push({
        id: `pattern-${i + 1}`,
        label: `Pattern ${i + 1}`,
        type: 'pattern',
        quality: Gen.randomFloat(0.7, 0.99, 2),
        usage: Gen.randomInt(5, 100),
        category: Gen.randomItem([
          'authentication',
          'data-processing',
          'error-handling',
          'caching',
          'validation',
        ]),
      });
    }

    // Generate service nodes
    const serviceCount = Math.floor(count * 0.2);
    for (let i = 0; i < serviceCount; i++) {
      nodes.push({
        id: `service-${i + 1}`,
        label: `${Gen.randomItem(['API', 'Auth', 'Data', 'Queue', 'Cache'])} Service`,
        type: 'service',
        status: Gen.healthStatus(),
        uptime: Gen.randomFloat(95, 99.9, 2),
      });
    }

    // Generate agent nodes
    const agentCount = Math.floor(count * 0.25);
    for (let i = 0; i < agentCount; i++) {
      nodes.push({
        id: `agent-${i + 1}`,
        label: Gen.agentName(),
        type: 'agent',
        activeRuns: Gen.randomInt(0, 50),
        successRate: Gen.randomFloat(0.8, 0.99, 2),
      });
    }

    // Generate other nodes
    const otherCount = count - patternCount - serviceCount - agentCount;
    for (let i = 0; i < otherCount; i++) {
      const type = Gen.randomItem(['api', 'database', 'component']);
      nodes.push({
        id: `${type}-${i + 1}`,
        label: `${type.charAt(0).toUpperCase() + type.slice(1)} ${i + 1}`,
        type,
      });
    }

    return nodes;
  }

  /**
   * Generate mock knowledge graph edges
   */
  static generateEdges(nodes: GraphNode[], edgeCount: number = 80): GraphEdge[] {
    const edges: GraphEdge[] = [];
    const edgeTypes = [
      'uses',
      'depends-on',
      'calls',
      'implements',
      'extends',
      'relates-to',
    ];

    const nodeIds = nodes.map((n) => n.id);
    const addedEdges = new Set<string>();

    for (let i = 0; i < edgeCount; i++) {
      const source = Gen.randomItem(nodeIds);
      const target = Gen.randomItem(nodeIds.filter((id) => id !== source));
      const edgeKey = `${source}-${target}`;

      if (!addedEdges.has(edgeKey)) {
        edges.push({
          source,
          target,
          type: Gen.randomItem(edgeTypes),
          weight: Gen.randomInt(1, 10),
        });
        addedEdges.add(edgeKey);
      }
    }

    return edges;
  }

  /**
   * Generate complete knowledge graph data
   */
  static generateAll(nodeCount: number = 50, edgeCount: number = 80): KnowledgeGraphData {
    const nodes = this.generateNodes(nodeCount);
    const edges = this.generateEdges(nodes, edgeCount);

    return {
      nodes,
      edges,
      isMock: true,
    };
  }
}
