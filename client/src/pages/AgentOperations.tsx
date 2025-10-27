import { MetricCard } from "@/components/MetricCard";
import { AgentStatusGrid } from "@/components/AgentStatusGrid";
import { RealtimeChart } from "@/components/RealtimeChart";
import { EventFeed } from "@/components/EventFeed";
import { DrillDownPanel } from "@/components/DrillDownPanel";
import { Activity, Cpu, CheckCircle, Clock } from "lucide-react";
import { useState, useEffect } from "react";

export default function AgentOperations() {
  const [selectedAgent, setSelectedAgent] = useState<any>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  //todo: remove mock functionality
  const [agents, setAgents] = useState(() => 
    Array.from({ length: 52 }, (_, i) => ({
      id: `agent-${i + 1}`,
      name: `Agent ${i + 1}`,
      status: (["active", "idle", "error", "offline"] as const)[Math.floor(Math.random() * 4)],
      currentTask: Math.random() > 0.5 ? `Processing task ${Math.floor(Math.random() * 100)}` : undefined,
      successRate: 85 + Math.floor(Math.random() * 15),
      responseTime: 50 + Math.floor(Math.random() * 150),
      tasksCompleted: Math.floor(Math.random() * 1000),
    }))
  );

  const [chartData, setChartData] = useState(() =>
    Array.from({ length: 20 }, (_, i) => ({
      time: `${i}:00`,
      value: 40 + Math.random() * 60,
    }))
  );

  const [events, setEvents] = useState([
    { id: '1', type: 'success' as const, message: 'Agent-42 completed code analysis', timestamp: '10:23:15', source: 'Agent-42' },
    { id: '2', type: 'info' as const, message: 'New task queued for Agent-15', timestamp: '10:23:12', source: 'Scheduler' },
    { id: '3', type: 'warning' as const, message: 'High memory usage on Agent-7', timestamp: '10:23:08', source: 'Monitor' },
  ]);

  useEffect(() => {
    const interval = setInterval(() => {
      setChartData(prev => {
        const newData = [...prev.slice(1), {
          time: `${prev.length}:00`,
          value: 40 + Math.random() * 60,
        }];
        return newData;
      });

      if (Math.random() > 0.7) {
        setAgents(prev => prev.map(agent => 
          Math.random() > 0.9 ? {
            ...agent,
            status: (["active", "idle", "error", "offline"] as const)[Math.floor(Math.random() * 4)]
          } : agent
        ));
      }
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const handleAgentClick = (agent: any) => {
    setSelectedAgent(agent);
    setPanelOpen(true);
  };

  const activeAgents = agents.filter(a => a.status === "active").length;
  const avgResponseTime = Math.round(agents.reduce((sum, a) => sum + a.responseTime, 0) / agents.length);
  const avgSuccessRate = Math.round(agents.reduce((sum, a) => sum + a.successRate, 0) / agents.length);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold mb-2">AI Agent Operations</h1>
        <p className="text-muted-foreground">Real-time monitoring of 52 specialized AI agents</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <div className="grid grid-cols-4 gap-6">
            <MetricCard 
              label="Active Agents"
              value={activeAgents}
              trend={{ value: 12, isPositive: true }}
              icon={Activity}
              status="healthy"
            />
            <MetricCard 
              label="Total Agents"
              value="52"
              icon={Activity}
              status="healthy"
            />
            <MetricCard 
              label="Avg Response Time"
              value={`${avgResponseTime}ms`}
              icon={Clock}
              status={avgResponseTime < 100 ? "healthy" : "warning"}
            />
            <MetricCard 
              label="Success Rate"
              value={`${avgSuccessRate}%`}
              trend={{ value: 3.2, isPositive: true }}
              icon={CheckCircle}
              status="healthy"
            />
          </div>

          <AgentStatusGrid 
            agents={agents}
            onAgentClick={handleAgentClick}
          />
        </div>
        
        <div className="space-y-6">
          <RealtimeChart 
            title="Agent Response Times"
            data={chartData}
            color="hsl(var(--chart-1))"
            height={240}
          />
          <RealtimeChart 
            title="Task Completion Rate"
            data={chartData}
            color="hsl(var(--chart-2))"
            showArea
            height={240}
          />
          <EventFeed events={events} maxHeight={300} />
        </div>
      </div>

      <DrillDownPanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        title={selectedAgent?.name || "Agent Details"}
        data={selectedAgent || {}}
        type="agent"
      />
    </div>
  );
}
