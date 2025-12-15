import { describe, it, expect } from 'vitest';
import {
  NODE_TYPE_DEFINITIONS,
  getNodeTypeDefinition,
  getDefaultNodeData,
} from '../models/nodeRegistry';

describe('nodeRegistry', () => {
  describe('NODE_TYPE_DEFINITIONS', () => {
    it('should be an array of node type definitions', () => {
      expect(Array.isArray(NODE_TYPE_DEFINITIONS)).toBe(true);
      expect(NODE_TYPE_DEFINITIONS.length).toBeGreaterThan(0);
    });

    it('should have node types with required fields', () => {
      NODE_TYPE_DEFINITIONS.forEach((nodeType) => {
        expect(nodeType).toHaveProperty('type');
        expect(nodeType).toHaveProperty('label');
        expect(nodeType).toHaveProperty('color');
        expect(nodeType).toHaveProperty('inputs');
        expect(nodeType).toHaveProperty('outputs');
      });
    });

    it('should include core node types', () => {
      const types = NODE_TYPE_DEFINITIONS.map((n) => n.type);

      expect(types).toContain('start');
      expect(types).toContain('end');
      expect(types).toContain('action');
      expect(types).toContain('condition');
    });
  });

  describe('getNodeTypeDefinition', () => {
    it('should return a node type definition for valid types', () => {
      const startNode = getNodeTypeDefinition('start');
      expect(startNode).toBeDefined();
      expect(startNode?.type).toBe('start');
      expect(startNode?.label).toBe('Start');
    });

    it('should return undefined for invalid types', () => {
      const unknownNode = getNodeTypeDefinition('non-existent-type');
      expect(unknownNode).toBeUndefined();
    });

    it('should return correct port configuration for start node', () => {
      const startNode = getNodeTypeDefinition('start');
      expect(startNode?.inputs).toHaveLength(0);
      expect(startNode?.outputs.length).toBeGreaterThan(0);
    });

    it('should return correct port configuration for end node', () => {
      const endNode = getNodeTypeDefinition('end');
      expect(endNode?.inputs.length).toBeGreaterThan(0);
      expect(endNode?.outputs).toHaveLength(0);
    });

    it('should return correct port configuration for condition node', () => {
      const conditionNode = getNodeTypeDefinition('condition');
      expect(conditionNode?.inputs.length).toBeGreaterThan(0);
      // Condition should have True and False outputs
      expect(conditionNode?.outputs.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('getDefaultNodeData', () => {
    it('should return default data for a node type', () => {
      const defaultData = getDefaultNodeData('action');
      expect(defaultData).toBeDefined();
      expect(typeof defaultData).toBe('object');
    });

    it('should return empty object for unknown types', () => {
      const defaultData = getDefaultNodeData('unknown-type');
      expect(defaultData).toEqual({});
    });

    it('should return configured defaults for action nodes', () => {
      const defaultData = getDefaultNodeData('action');
      // Action nodes have configurable fields with defaults
      expect(Object.keys(defaultData).length).toBeGreaterThan(0);
    });
  });
});
