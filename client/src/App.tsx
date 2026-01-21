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
import { useWebSocket } from '@/hooks/useWebSocket';

// Archived legacy pages (OMN-1377)
import PatternLearning from '@/_archive/pages/PatternLearning';
import IntelligenceOperations from '@/_archive/pages/IntelligenceOperations';
import CodeIntelligence from '@/_archive/pages/CodeIntelligence';
import EventFlow from '@/_archive/pages/EventFlow';
import EventBusExplorer from '@/_archive/pages/EventBusExplorer';
import KnowledgeGraph from '@/_archive/pages/KnowledgeGraph';
import PlatformHealth from '@/_archive/pages/PlatformHealth';
import DeveloperExperience from '@/_archive/pages/DeveloperExperience';

// Active pages
import EventBusMonitor from '@/pages/EventBusMonitor';
import Chat from '@/pages/Chat';
import CorrelationTrace from '@/pages/CorrelationTrace';
import DashboardDemo from '@/pages/DashboardDemo';
import WidgetShowcase from '@/pages/WidgetShowcase';
import NodeRegistry from '@/pages/NodeRegistry';
import LiveEventStream from '@/pages/LiveEventStream';
import ExecutionGraph from '@/pages/ExecutionGraph';
import RegistryDiscovery from '@/pages/RegistryDiscovery';

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
      <Route path="/" component={NodeRegistry} />
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
