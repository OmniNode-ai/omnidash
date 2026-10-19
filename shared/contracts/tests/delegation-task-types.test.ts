import { describe, it, expect } from 'vitest';
import contract from '../delegation-task-types.json';

// OMN-17122 (DR-13): the dashboard menu fell two classes behind the delegate
// skill orchestrator because nothing compared the two. The orchestrator's
// `allowed_task_types` (omnimarket
// `node_delegate_skill_orchestrator/contract.yaml`) is spelled out here, in
// this repository, so the check runs on every runner without the omnimarket
// clone. Adding or removing a class on the orchestrator means changing this
// list and the contract JSON in the same change.
const ORCHESTRATOR_ALLOWED_TASK_TYPES = [
  'test',
  'document',
  'research',
  'code_generation',
  'code_review',
  'refactor',
  'reasoning',
  'complex_reasoning',
  'planning',
  'review',
  'summarization',
  'agent_delegation',
  'escalation',
  'documentation',
  'validator_generation',
];

describe('delegation-task-types.json', () => {
  const ids = contract.task_types.map((taskType) => taskType.id);

  it('lists exactly the task types the orchestrator accepts', () => {
    expect([...ids].sort()).toEqual([...ORCHESTRATOR_ALLOWED_TASK_TYPES].sort());
  });

  it('lists the 15 task types once each', () => {
    expect(ids).toHaveLength(15);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every task type a label, description and prompt placeholder', () => {
    for (const taskType of contract.task_types) {
      expect(taskType.label.trim(), taskType.id).not.toBe('');
      expect(taskType.description.trim(), taskType.id).not.toBe('');
      expect(taskType.prompt_placeholder.trim(), taskType.id).not.toBe('');
    }
  });
});
