import { useCallback, useEffect, useMemo } from 'react';
import { AgentActionDispatcher } from './AgentActionDispatcher';
import { usePageAgent } from './usePageAgent';
import { buildSystemPrompt } from './buildSystemPrompt';
import { buildUserContext } from './contextUtils';
import { AgentChatPanel } from '@/components/agent/AgentChatPanel';
import { AgentLauncher } from '@/components/agent/AgentLauncher';
import { useFrameStore } from '@/store/store';
import { useRegistry } from '@/registry/RegistryProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { DASHBOARD_TEMPLATES } from '@/templates';
import type { ScalarFilterKey } from '@/store/types';

export function AgentOrchestrator() {
  const registry = useRegistry();
  const { setTheme, availableThemes } = useTheme();

  const messages = useFrameStore((s) => s.messages);
  const status = useFrameStore((s) => s.status);
  const isPanelOpen = useFrameStore((s) => s.isPanelOpen);
  const activeDashboard = useFrameStore((s) => s.activeDashboard);
  const globalFilters = useFrameStore((s) => s.globalFilters);

  // Read store actions via getState() — safe for event handlers that don't need re-renders
  const { appendMessage, setStatus, setPanelOpen } = useFrameStore.getState();

  const addComponentToLayout = useFrameStore((s) => s.addComponentToLayout);
  const removeComponentFromLayout = useFrameStore((s) => s.removeComponentFromLayout);
  const updateLayout = useFrameStore((s) => s.updateLayout);
  const updateComponentConfig = useFrameStore((s) => s.updateComponentConfig);
  const setActiveDashboard = useFrameStore((s) => s.setActiveDashboard);
  const setTimeRangeStore = useFrameStore((s) => s.setTimeRange);
  const setFilterStore = useFrameStore((s) => s.setFilter);

  const dispatcher = useMemo(() => {
    const d = new AgentActionDispatcher();
    d.setHandlers({
      // Adapter: AgentActionDispatcher passes a full item object; store takes (name, version, size)
      addComponentToLayout: async (item: unknown) => {
        const i = item as { componentName: string; componentVersion?: string; w?: number; h?: number };
        const component = registry.getComponent(i.componentName);
        const defaultSize = component?.manifest?.defaultSize ?? { w: i.w ?? 6, h: i.h ?? 4 };
        addComponentToLayout(i.componentName, i.componentVersion ?? '1.0.0', defaultSize);
      },
      removeComponentFromLayout: async (id) => {
        removeComponentFromLayout(id);
      },
      updateLayout: async (layout) => {
        updateLayout(layout as Parameters<typeof updateLayout>[0]);
      },
      updateComponentConfig: async (id, config) => {
        updateComponentConfig(id, config);
      },
      setTheme: (name) => {
        setTheme(name);
      },
      setTimeRange: (range) => {
        // Adapter: dispatcher passes a string range; store expects { start, end } TimeRange
        // Map preset strings to approximate TimeRange values; custom range uses from/to args
        const now = new Date();
        const presets: Record<string, number> = {
          '1h': 1, '6h': 6, '24h': 24, '7d': 24 * 7, '30d': 24 * 30, '90d': 24 * 90,
        };
        const hoursBack = presets[range] ?? 24;
        const start = new Date(now.getTime() - hoursBack * 3600 * 1000).toISOString();
        setTimeRangeStore({ start, end: now.toISOString() });
      },
      setFilter: (key, value) => {
        // Only 'repo' and 'author' are valid ScalarFilterKeys in the current store
        const validKeys: ScalarFilterKey[] = ['repo', 'author'];
        if (validKeys.includes(key as ScalarFilterKey)) {
          setFilterStore(key as ScalarFilterKey, value);
        }
        // Other keys are silently ignored — extend GlobalFilters type if more keys are needed
      },
      setActiveDashboard: (def) => {
        setActiveDashboard(def as Parameters<typeof setActiveDashboard>[0]);
      },
      saveDashboard: async (_name) => {
        // DashboardService.save() does not return an ID — gap noted here
        // TODO: wire to DashboardService when it returns a persisted ID
        return activeDashboard?.id ?? 'unsaved';
      },
      getRegistry: () => ({
        getAvailableComponents: () => registry.getAvailableComponents(),
        getComponentsByCategory: (cat) => registry.getComponentsByCategory(cat as Parameters<typeof registry.getComponentsByCategory>[0]),
        getComponent: (name) => registry.getComponent(name),
      }),
      getThemes: () => availableThemes,
      getTemplates: () => DASHBOARD_TEMPLATES,
      getCurrentLayout: () => activeDashboard?.layout ?? [],
    });
    return d;
  }, [registry, addComponentToLayout, removeComponentFromLayout, updateLayout, updateComponentConfig, setTheme, setTimeRangeStore, setFilterStore, setActiveDashboard, activeDashboard, availableThemes]);

  const systemPrompt = useMemo(
    () =>
      buildSystemPrompt({
        components: registry.getAvailableComponents(),
        themes: availableThemes,
        templateNames: DASHBOARD_TEMPLATES.map((t) => t.name),
      }),
    [registry, availableThemes]
  );

  const onAction = useCallback(
    async (actionName: string, args: Record<string, unknown>) => {
      setStatus('executing');
      const result = await dispatcher.dispatch(actionName, args);
      setStatus(result.success ? 'idle' : 'error');
      return result;
    },
    [dispatcher, setStatus]
  );

  const onResponse = useCallback(
    (content: string, actions: Array<{ name: string; args: Record<string, unknown>; result: string }>) => {
      appendMessage({ role: 'assistant', content, actions });
      setStatus('idle');
    },
    [appendMessage, setStatus]
  );

  const { isReady, initialize, sendMessage } = usePageAgent({
    enabled: isPanelOpen,
    systemPrompt,
    onAction,
    onResponse,
  });

  useEffect(() => {
    if (isPanelOpen && !isReady) {
      initialize();
    }
  }, [isPanelOpen, isReady, initialize]);

  const handleSend = useCallback(
    async (userMessage: string) => {
      // Append original message to UI — context prefix is NOT shown to the user
      appendMessage({ role: 'user', content: userMessage });
      setStatus('thinking');
      try {
        // Inject current layout context to improve multi-turn reference resolution
        const context = buildUserContext({
          layout: activeDashboard?.layout ?? [],
          timeRange: globalFilters.timeRange,
          filters: globalFilters,
        });
        const contextualMessage = `[Context: ${context}]\n\nUser: ${userMessage}`;
        await sendMessage(contextualMessage);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        appendMessage({
          role: 'assistant',
          content: `Sorry, I encountered an error: ${error}`,
          actions: [],
        });
        setStatus('error');
      }
      return '';
    },
    [appendMessage, setStatus, sendMessage, activeDashboard, globalFilters]
  );

  // Respect VITE_AGENT_ENABLED=false kill switch
  if (import.meta.env.VITE_AGENT_ENABLED === 'false') {
    return null;
  }

  return (
    <>
      <AgentLauncher isOpen={isPanelOpen} onClick={() => setPanelOpen(!isPanelOpen)} />
      <AgentChatPanel
        isOpen={isPanelOpen}
        onToggle={() => setPanelOpen(false)}
        onSend={handleSend}
        isAgentReady={isReady}
        isThinking={status === 'thinking' || status === 'executing'}
        messages={messages}
      />
    </>
  );
}
