import { describe, it, expect } from 'vitest';
import { exportWorkflow, importWorkflow, isValidWorkflowExport } from '../utils/workflow-io';
import type { WorkflowNode, Port } from '../models/types';

describe('workflow-io', () => {
  // Helper to create a mock node
  const createMockNode = (id: string, type: string): WorkflowNode => ({
    id,
    type,
    position: { x: 100, y: 100 },
    data: { name: 'Test' },
    inputPorts: [{ id: `${id}-in-0`, name: 'In', type: 'input', nodeId: id, index: 0 }],
    outputPorts: [{ id: `${id}-out-0`, name: 'Out', type: 'output', nodeId: id, index: 0 }],
  });

  describe('exportWorkflow', () => {
    it('should export an empty workflow', () => {
      const exported = exportWorkflow([], []);
      expect(exported.version).toBe('1.0');
      expect(exported.nodes).toHaveLength(0);
      expect(exported.edges).toHaveLength(0);
    });

    it('should export nodes with correct structure', () => {
      const nodes = [createMockNode('node-1', 'action')];
      const exported = exportWorkflow(nodes, []);

      expect(exported.nodes).toHaveLength(1);
      expect(exported.nodes[0]).toMatchObject({
        id: 'node-1',
        type: 'action',
        position: { x: 100, y: 100 },
        config: { name: 'Test' },
        ports: {
          inputs: ['In'],
          outputs: ['Out'],
        },
      });
    });

    it('should export connections as edges', () => {
      const node1 = createMockNode('node-1', 'start');
      const node2 = createMockNode('node-2', 'action');
      const connections = [
        {
          id: 'conn-1',
          fromNodeId: 'node-1',
          toNodeId: 'node-2',
          fromPortId: 'node-1-out-0',
          toPortId: 'node-2-in-0',
        },
      ];

      const exported = exportWorkflow([node1, node2], connections);

      expect(exported.edges).toHaveLength(1);
      expect(exported.edges[0]).toMatchObject({
        from: { nodeId: 'node-1', port: 'Out' },
        to: { nodeId: 'node-2', port: 'In' },
      });
    });

    it('should sort nodes by ID for deterministic output', () => {
      const nodeB = createMockNode('b-node', 'action');
      const nodeA = createMockNode('a-node', 'start');
      const nodeC = createMockNode('c-node', 'end');

      const exported = exportWorkflow([nodeB, nodeA, nodeC], []);

      expect(exported.nodes[0].id).toBe('a-node');
      expect(exported.nodes[1].id).toBe('b-node');
      expect(exported.nodes[2].id).toBe('c-node');
    });

    it('should preserve workflow metadata', () => {
      const meta = { name: 'My Workflow', author: 'Test' };
      const exported = exportWorkflow([], [], meta);

      expect(exported.name).toBe('My Workflow');
      expect(exported.author).toBe('Test');
    });
  });

  describe('isValidWorkflowExport', () => {
    it('should return true for valid workflow export', () => {
      const valid = {
        version: '1.0',
        nodes: [],
        edges: [],
      };
      expect(isValidWorkflowExport(valid)).toBe(true);
    });

    it('should return false for null', () => {
      expect(isValidWorkflowExport(null)).toBe(false);
    });

    it('should return false for missing version', () => {
      const invalid = { nodes: [], edges: [] };
      expect(isValidWorkflowExport(invalid)).toBe(false);
    });

    it('should return false for missing nodes', () => {
      const invalid = { version: '1.0', edges: [] };
      expect(isValidWorkflowExport(invalid)).toBe(false);
    });

    it('should return false for missing edges', () => {
      const invalid = { version: '1.0', nodes: [] };
      expect(isValidWorkflowExport(invalid)).toBe(false);
    });

    it('should return false for non-array nodes', () => {
      const invalid = { version: '1.0', nodes: 'not-array', edges: [] };
      expect(isValidWorkflowExport(invalid)).toBe(false);
    });
  });

  describe('importWorkflow', () => {
    const createPorts = (
      nodeId: string,
      _nodeType: string
    ): { inputPorts: Port[]; outputPorts: Port[] } => ({
      inputPorts: [{ id: `${nodeId}-in-0`, name: 'In', type: 'input', nodeId, index: 0 }],
      outputPorts: [{ id: `${nodeId}-out-0`, name: 'Out', type: 'output', nodeId, index: 0 }],
    });

    it('should return null for invalid data', () => {
      const result = importWorkflow(null as any, createPorts);
      expect(result).toBeNull();
    });

    it('should import a valid workflow', () => {
      const workflowData = {
        version: '1.0',
        nodes: [
          {
            id: 'node-1',
            type: 'action',
            position: { x: 100, y: 100 },
            config: { name: 'Test' },
            ports: { inputs: ['In'], outputs: ['Out'] },
          },
        ],
        edges: [],
      };

      const result = importWorkflow(workflowData, createPorts);

      expect(result).not.toBeNull();
      expect(result?.nodes).toHaveLength(1);
      expect(result?.nodes[0].id).toBe('node-1');
      expect(result?.nodes[0].type).toBe('action');
    });

    it('should import connections correctly', () => {
      const workflowData = {
        version: '1.0',
        nodes: [
          {
            id: 'node-1',
            type: 'start',
            position: { x: 0, y: 0 },
            config: {},
            ports: { inputs: ['In'], outputs: ['Out'] },
          },
          {
            id: 'node-2',
            type: 'end',
            position: { x: 200, y: 0 },
            config: {},
            ports: { inputs: ['In'], outputs: ['Out'] },
          },
        ],
        edges: [{ from: { nodeId: 'node-1', port: 'Out' }, to: { nodeId: 'node-2', port: 'In' } }],
      };

      const result = importWorkflow(workflowData, createPorts);

      expect(result?.connections).toHaveLength(1);
      expect(result?.connections[0].fromNodeId).toBe('node-1');
      expect(result?.connections[0].toNodeId).toBe('node-2');
    });

    it('should preserve extra fields in workflow metadata', () => {
      const workflowData = {
        version: '1.0',
        nodes: [],
        edges: [],
        name: 'Custom Workflow',
        customField: 'custom value',
      };

      const result = importWorkflow(workflowData, createPorts);

      expect(result?.workflowMeta).toBeDefined();
      expect(result?.workflowMeta?.name).toBe('Custom Workflow');
      expect(result?.workflowMeta?.customField).toBe('custom value');
    });
  });
});
