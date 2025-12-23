import { describe, it, expect } from 'vitest';
import { getAllTemplates, getTemplateById, getTemplateWorkflow } from '../models/templateRegistry';

describe('templateRegistry', () => {
  describe('getAllTemplates', () => {
    it('should return an array of templates', () => {
      const templates = getAllTemplates();
      expect(Array.isArray(templates)).toBe(true);
      expect(templates.length).toBeGreaterThan(0);
    });

    it('should return templates with required fields', () => {
      const templates = getAllTemplates();
      templates.forEach((template) => {
        expect(template).toHaveProperty('id');
        expect(template).toHaveProperty('name');
        expect(template).toHaveProperty('description');
        expect(template).toHaveProperty('workflow');
      });
    });

    it('should include the Simple Sequence template', () => {
      const templates = getAllTemplates();
      const simpleSequence = templates.find((t) => t.id === 'simple-sequence');
      expect(simpleSequence).toBeDefined();
      expect(simpleSequence?.name).toBe('Simple Sequence');
    });

    it('should include the Conditional Branch template', () => {
      const templates = getAllTemplates();
      const conditionalBranch = templates.find((t) => t.id === 'conditional-branch');
      expect(conditionalBranch).toBeDefined();
      expect(conditionalBranch?.name).toBe('Conditional Branch');
    });
  });

  describe('getTemplateById', () => {
    it('should return a template when given a valid ID', () => {
      const template = getTemplateById('simple-sequence');
      expect(template).toBeDefined();
      expect(template?.id).toBe('simple-sequence');
    });

    it('should return undefined for an invalid ID', () => {
      const template = getTemplateById('non-existent-template');
      expect(template).toBeUndefined();
    });
  });

  describe('getTemplateWorkflow', () => {
    it('should return workflow data for a valid template ID', () => {
      const workflow = getTemplateWorkflow('simple-sequence');
      expect(workflow).toBeDefined();
      expect(workflow).toHaveProperty('version');
      expect(workflow).toHaveProperty('nodes');
      expect(workflow).toHaveProperty('edges');
    });

    it('should return undefined for an invalid template ID', () => {
      const workflow = getTemplateWorkflow('non-existent-template');
      expect(workflow).toBeUndefined();
    });

    it('should return valid workflow structure for Simple Sequence', () => {
      const workflow = getTemplateWorkflow('simple-sequence');
      expect(workflow?.nodes).toHaveLength(3); // Start, Action, End
      expect(workflow?.edges).toHaveLength(2); // Start->Action, Action->End
    });

    it('should return valid workflow structure for Conditional Branch', () => {
      const workflow = getTemplateWorkflow('conditional-branch');
      expect(workflow?.nodes).toHaveLength(6); // Start, Condition, 2 Actions, 2 Ends
      expect(workflow?.edges).toHaveLength(5); // Start->Condition, Condition->2 Actions, Actions->Ends
    });
  });
});
