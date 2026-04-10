import { useCallback, useRef, useState } from 'react';
import { z } from 'zod/v4';
import { DEFAULT_LLM_CONFIG, FALLBACK_LLM_CONFIG } from './llmClient';
import { AGENT_ACTIONS } from './actions';
import type { DispatchResult } from './AgentActionDispatcher';

// Phase 0 verification: page-agent v1.7.1 uses execute(task) → ExecutionResult
// Tools use Zod inputSchema (not JSON Schema). No init()/sendMessage()/destroy() API.
// This hook wraps execute() for our conversational use case.
type PageAgentInstance = {
  execute: (task: string) => Promise<{ success: boolean; data: string; history: unknown[] }>;
  dispose: () => void;
  status: string;
};

interface UsePageAgentOptions {
  enabled: boolean;
  systemPrompt?: string;
  onAction?: (actionName: string, args: Record<string, unknown>) => Promise<DispatchResult>;
  onResponse?: (content: string, actions: Array<{ name: string; args: Record<string, unknown>; result: string }>) => void;
  useFallback?: boolean;
}

export function usePageAgent(options: UsePageAgentOptions) {
  const [isReady, setIsReady] = useState(false);
  const agentRef = useRef<PageAgentInstance | null>(null);

  const initialize = useCallback(async () => {
    // Returns early when isReady=true — makes the prompt session-static (MVP simplification).
    // To get a fresh prompt, call destroy() first, then initialize() again.
    if (!options.enabled || isReady) return;

    // page-agent is dynamically imported to keep bundle lean when chat is disabled
    const { PageAgent } = await import('page-agent');
    const llmConfig = options.useFallback ? FALLBACK_LLM_CONFIG : DEFAULT_LLM_CONFIG;

    // Build customTools from AGENT_ACTIONS — each tool executes via onAction dispatcher
    const customTools: Record<string, unknown> = {};
    for (const action of AGENT_ACTIONS) {
      const shape: Record<string, import('zod/v4').ZodType> = {};
      for (const [paramName, paramDef] of Object.entries(action.parameters)) {
        if (paramDef.type === 'string') {
          const base = paramDef.enum
            ? (z.enum(paramDef.enum as [string, ...string[]]).describe(paramDef.description) as unknown as import('zod/v4').ZodString)
            : z.string().describe(paramDef.description);
          shape[paramName] = paramDef.required ? base : base.optional();
        } else if (paramDef.type === 'object') {
          const objSchema = z.record(z.string(), z.unknown()).describe(paramDef.description);
          shape[paramName] = paramDef.required ? objSchema : objSchema.optional();
        }
      }

      const actionName = action.name;
      const onAction = options.onAction;
      customTools[actionName] = {
        description: action.description,
        inputSchema: z.object(shape),
        execute: async (args: Record<string, unknown>) => {
          const result = await onAction?.(actionName, args);
          return result?.message ?? result?.error ?? 'done';
        },
      };
    }

    const systemInstructions = options.systemPrompt ||
      'You are a dashboard configuration assistant for the OmniNode platform. ' +
      'Translate natural language dashboard requests into tool calls. ' +
      'Never invent component names — only use names confirmed by list_components.';

    const agent = new PageAgent({
      baseURL: llmConfig.baseURL,
      model: llmConfig.model,
      apiKey: llmConfig.apiKey,
      temperature: llmConfig.temperature,
      customTools: customTools as never,
      instructions: {
        system: systemInstructions,
      },
    });

    agentRef.current = agent as unknown as PageAgentInstance;
    setIsReady(true);
  }, [options.enabled, options.useFallback, options.systemPrompt, options.onAction, isReady]);

  const sendMessage = useCallback(async (userMessage: string): Promise<string> => {
    if (!agentRef.current) throw new Error('Agent not initialized');

    const result = await agentRef.current.execute(userMessage);
    const responseText = result.data || (result.success ? 'Done.' : 'Sorry, I could not complete that request.');

    // Extract tool calls from history for action annotations
    const actionResults: Array<{ name: string; args: Record<string, unknown>; result: string }> = [];
    for (const event of result.history) {
      const evt = event as { type: string; action?: { name: string; input: unknown; output: string } };
      if (evt.type === 'step' && evt.action) {
        actionResults.push({
          name: evt.action.name,
          args: evt.action.input as Record<string, unknown>,
          result: evt.action.output,
        });
      }
    }

    options.onResponse?.(responseText, actionResults);
    return responseText;
  }, [options]);

  const destroy = useCallback(() => {
    const agent = agentRef.current as (PageAgentInstance & { dispose?: () => void }) | null;
    agent?.dispose?.();
    agentRef.current = null;
    setIsReady(false);
  }, []);

  return { isReady, initialize, sendMessage, destroy };
}
