import type { WorkflowExport } from '../utils/workflow-io';
import templatesData from './workflowTemplates.json';

/**
 * A workflow template definition
 */
export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  workflow: WorkflowExport;
}

// Load templates from JSON
const templates: WorkflowTemplate[] = templatesData as WorkflowTemplate[];

/**
 * Get all available workflow templates
 */
export function getAllTemplates(): WorkflowTemplate[] {
  return templates;
}

/**
 * Get a specific template by ID
 */
export function getTemplateById(id: string): WorkflowTemplate | undefined {
  return templates.find((t) => t.id === id);
}

/**
 * Get the workflow export data for a template
 */
export function getTemplateWorkflow(id: string): WorkflowExport | undefined {
  const template = getTemplateById(id);
  return template?.workflow;
}
