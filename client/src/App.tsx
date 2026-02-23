import { Switch, Route } from 'wouter';
import { queryClient } from './lib/queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/app-sidebar';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ThemeToggle } from '@/components/ThemeToggle';
import { AlertBanner } from '@/components/AlertBanner';
import { DemoModeProvider } from '@/contexts/DemoModeContext';
import { DemoModeToggle } from '@/components/DemoModeToggle';
import { DemoControlPanel } from '@/components/DemoControlPanel';
import { useWebSocket } from '@/hooks/useWebSocket';

// Archived legacy pages (OMN-1377)
import IntelligenceOperations from '@/_archive/pages/IntelligenceOperations';
import CodeIntelligence from '@/_archive/pages/CodeIntelligence';
import EventFlow from '@/_archive/pages/EventFlow';
import EventBusExplorer from '@/_archive/pages/EventBusExplorer';
import KnowledgeGraph from '@/_archive/pages/KnowledgeGraph';
import PlatformHealth from '@/_archive/pages/PlatformHealth';
import DeveloperExperience from '@/_archive/pages/DeveloperExperience';

// Active pages
import PatternLearning from '@/pages/PatternLearning';
import EventBusMonitor from '@/pages/EventBusMonitor';
import Chat from '@/pages/Chat';
import CorrelationTrace from '@/pages/CorrelationTrace';
import DashboardDemo from '@/pages/DashboardDemo';
import WidgetShowcase from '@/pages/WidgetShowcase';
import NodeRegistry from '@/pages/NodeRegistry';
import LiveEventStream from '@/pages/LiveEventStream';
import ExecutionGraph from '@/pages/ExecutionGraph';
import RegistryDiscovery from '@/pages/RegistryDiscovery';
import IntentDashboard from '@/pages/IntentDashboard';
import ValidationDashboard from '@/pages/ValidationDashboard';
import ExtractionDashboard from '@/pages/ExtractionDashboard';
import EffectivenessSummary from '@/pages/EffectivenessSummary';
import EffectivenessLatency from '@/pages/EffectivenessLatency';
import EffectivenessUtilization from '@/pages/EffectivenessUtilization';
import EffectivenessAB from '@/pages/EffectivenessAB';
import LearnedInsights from '@/pages/LearnedInsights';
import BaselinesROI from '@/pages/BaselinesROI';
import CostTrendDashboard from '@/pages/CostTrendDashboard';
import PatternEnforcement from '@/pages/PatternEnforcement';
import ContextEnrichmentDashboard from '@/pages/ContextEnrichmentDashboard';
import LlmRoutingDashboard from '@/pages/LlmRoutingDashboard';
import WhyThisHappened from '@/pages/WhyThisHappened';
import StatusDashboard from '@/pages/StatusDashboard';

// Phase 2: Category landing pages (OMN-2181)
import SpeedCategory from '@/pages/SpeedCategory';
import SuccessCategory from '@/pages/SuccessCategory';
import IntelligenceCategory from '@/pages/IntelligenceCategory';
import SystemHealthCategory from '@/pages/SystemHealthCategory';

// Preview pages
import EnhancedAnalytics from '@/pages/preview/EnhancedAnalytics';
import SystemHealth from '@/pages/preview/SystemHealth';
import AdvancedSettings from '@/pages/preview/AdvancedSettings';
import FeatureShowcase from '@/pages/preview/FeatureShowcase';
import ContractBuilder from '@/pages/preview/ContractBuilder';
import TechDebtAnalysis from '@/pages/preview/TechDebtAnalysis';
import PatternLineage from '@/pages/preview/PatternLineage';
import NodeNetworkComposer from '@/pages/preview/NodeNetworkComposer';
import IntelligenceSavings from '@/pages/preview/IntelligenceSavings';
import AgentRegistry from '@/pages/preview/AgentRegistry';
import AgentNetwork from '@/pages/preview/AgentNetwork';
import IntelligenceAnalytics from '@/pages/preview/IntelligenceAnalytics';
import PlatformMonitoring from '@/pages/preview/PlatformMonitoring';
import AgentManagement from '@/pages/preview/AgentManagement';
import CodeIntelligenceSuite from '@/pages/preview/CodeIntelligenceSuite';
import ArchitectureNetworks from '@/pages/preview/ArchitectureNetworks';
import DeveloperTools from '@/pages/preview/DeveloperTools';

function Router() {
  return (
    <Switch>
      <Route path="/" component={EventBusMonitor} />

      {/* Phase 2: Category landing pages (OMN-2181) */}
      <Route path="/category/speed" component={SpeedCategory} />
      <Route path="/category/success" component={SuccessCategory} />
      <Route path="/category/intelligence" component={IntelligenceCategory} />
      <Route path="/category/health" component={SystemHealthCategory} />

      <Route path="/patterns" component={PatternLearning} />
      <Route path="/intelligence" component={IntelligenceOperations} />
      <Route path="/code" component={CodeIntelligence} />
      <Route path="/events" component={EventBusMonitor} />
      <Route path="/live-events" component={LiveEventStream} />
      {/* Render function pattern required: EventFlow has optional props incompatible with RouteComponentProps */}
      <Route path="/events-legacy">{() => <EventFlow />}</Route>
      <Route path="/event-bus" component={EventBusExplorer} />
      <Route path="/knowledge" component={KnowledgeGraph} />
      <Route path="/health" component={PlatformHealth} />
      <Route path="/developer" component={DeveloperExperience} />
      <Route path="/chat" component={Chat} />
      <Route path="/trace" component={CorrelationTrace} />
      <Route path="/graph" component={ExecutionGraph} />
      <Route path="/demo" component={DashboardDemo} />
      <Route path="/showcase" component={WidgetShowcase} />
      <Route path="/registry" component={NodeRegistry} />
      <Route path="/discovery" component={RegistryDiscovery} />
      <Route path="/intents" component={IntentDashboard} />
      <Route path="/validation" component={ValidationDashboard} />
      <Route path="/extraction" component={ExtractionDashboard} />

      {/* Learned Insights dashboard (OMN-1407) */}
      <Route path="/insights" component={LearnedInsights} />

      {/* Effectiveness dashboard routes (OMN-1891) */}
      <Route path="/effectiveness" component={EffectivenessSummary} />
      <Route path="/effectiveness/latency" component={EffectivenessLatency} />
      <Route path="/effectiveness/utilization" component={EffectivenessUtilization} />
      <Route path="/effectiveness/ab" component={EffectivenessAB} />

      {/* Baselines & ROI dashboard (OMN-2156) */}
      <Route path="/baselines" component={BaselinesROI} />

      {/* Cost Trends dashboard (OMN-2242) */}
      <Route path="/cost-trends" component={CostTrendDashboard} />

      {/* Pattern Enforcement dashboard (OMN-2275) */}
      <Route path="/enforcement" component={PatternEnforcement} />

      {/* Context Enrichment dashboard (OMN-2280) */}
      <Route path="/enrichment" component={ContextEnrichmentDashboard} />

      {/* LLM Routing Effectiveness dashboard (OMN-2279) */}
      <Route path="/llm-routing" component={LlmRoutingDashboard} />

      {/* Why This Happened — decision provenance panel (OMN-2350 epic) */}
      <Route path="/why" component={WhyThisHappened} />

      {/* Status dashboard — PR triage, workstreams, hook feed (OMN-2658) */}
      <Route path="/status" component={StatusDashboard} />

      {/* Preview routes */}
      <Route path="/preview/analytics" component={EnhancedAnalytics} />
      <Route path="/preview/health" component={SystemHealth} />
      <Route path="/preview/settings" component={AdvancedSettings} />
      <Route path="/preview/showcase" component={FeatureShowcase} />
      <Route path="/preview/contracts" component={ContractBuilder} />
      <Route path="/preview/tech-debt" component={TechDebtAnalysis} />
      <Route path="/preview/pattern-lineage" component={PatternLineage} />
      <Route path="/preview/composer" component={NodeNetworkComposer} />
      <Route path="/preview/savings" component={IntelligenceSavings} />
      <Route path="/preview/agent-registry" component={AgentRegistry} />
      <Route path="/preview/agent-network" component={AgentNetwork} />
      <Route path="/preview/intelligence-analytics" component={IntelligenceAnalytics} />
      <Route path="/preview/platform-monitoring" component={PlatformMonitoring} />
      <Route path="/preview/agent-management" component={AgentManagement} />
      <Route path="/preview/code-intelligence-suite" component={CodeIntelligenceSuite} />
      <Route path="/preview/architecture-networks" component={ArchitectureNetworks} />
      <Route path="/preview/developer-tools" component={DeveloperTools} />
    </Switch>
  );
}

function App() {
  const style = {
    '--sidebar-width': '16rem',
    '--sidebar-width-icon': '3rem',
  };

  // WebSocket connection for global status indicator
  const { isConnected, connectionStatus } = useWebSocket({
    debug: false,
  });

  return (
    <QueryClientProvider client={queryClient}>
      <DemoModeProvider>
        <ThemeProvider defaultTheme="dark">
          <TooltipProvider>
            <SidebarProvider style={style as React.CSSProperties}>
              <div className="flex h-screen w-full">
                <AppSidebar />
                <div className="flex flex-col flex-1 overflow-hidden">
                  <header className="flex items-center justify-between px-6 py-4 border-b border-border">
                    <div className="flex items-center gap-4">
                      <SidebarTrigger data-testid="button-sidebar-toggle" />
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10">
                          <img src="/favicon.svg" alt="OmniNode icon" className="w-5 h-5" />
                        </div>
                        <div>
                          <h1 className="text-lg font-semibold">OmniNode</h1>
                          <p className="text-xs text-muted-foreground">
                            Code Intelligence Platform
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <DemoModeToggle />
                      <div className="flex items-center gap-2">
                        <div
                          className={`h-2 w-2 rounded-full transition-colors duration-300 ${
                            isConnected
                              ? 'bg-green-500 animate-pulse'
                              : connectionStatus === 'connecting'
                                ? 'bg-yellow-500 animate-pulse'
                                : 'bg-red-500'
                          }`}
                        />
                        <span className="text-xs text-muted-foreground">
                          {isConnected
                            ? 'Connected'
                            : connectionStatus === 'connecting'
                              ? 'Connecting...'
                              : 'Disconnected'}
                        </span>
                      </div>
                      <DemoControlPanel />
                      <ThemeToggle />
                    </div>
                  </header>

                  <AlertBanner />

                  <main className="flex-1 overflow-auto p-8">
                    <Router />
                  </main>
                </div>
              </div>
            </SidebarProvider>
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </DemoModeProvider>
    </QueryClientProvider>
  );
}

export default App;
