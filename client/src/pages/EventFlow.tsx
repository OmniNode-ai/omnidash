import { MetricCard } from "@/components/MetricCard";
import { RealtimeChart } from "@/components/RealtimeChart";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Zap, Database, TrendingUp } from "lucide-react";

export default function EventFlow() {
  //todo: remove mock functionality
  const topics = [
    { id: '1', name: 'agent-events', messagesPerSec: 342, consumers: 5, lag: 12 },
    { id: '2', name: 'pattern-discovery', messagesPerSec: 156, consumers: 3, lag: 5 },
    { id: '3', name: 'code-analysis', messagesPerSec: 289, consumers: 7, lag: 8 },
    { id: '4', name: 'quality-metrics', messagesPerSec: 198, consumers: 4, lag: 3 },
    { id: '5', name: 'performance-data', messagesPerSec: 425, consumers: 6, lag: 15 },
  ];

  const throughputData = Array.from({ length: 20 }, (_, i) => ({
    time: `${i}:00`,
    value: 800 + Math.random() * 400,
  }));

  const lagData = Array.from({ length: 20 }, (_, i) => ({
    time: `${i}:00`,
    value: 5 + Math.random() * 10,
  }));

  const totalThroughput = topics.reduce((sum, t) => sum + t.messagesPerSec, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold mb-2">Event Flow</h1>
        <p className="text-muted-foreground">Real-time Kafka/Redpanda event processing at 1000+ events/sec</p>
      </div>

      <div className="grid grid-cols-4 gap-6">
        <MetricCard 
          label="Total Throughput"
          value={`${totalThroughput}/s`}
          trend={{ value: 12, isPositive: true }}
          icon={Activity}
          status="healthy"
        />
        <MetricCard 
          label="Active Topics"
          value="12"
          icon={Database}
          status="healthy"
        />
        <MetricCard 
          label="Consumer Groups"
          value="8"
          icon={Zap}
          status="healthy"
        />
        <MetricCard 
          label="Avg Lag"
          value="8ms"
          icon={TrendingUp}
          status="healthy"
        />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <RealtimeChart 
          title="Event Throughput"
          data={throughputData}
          color="hsl(var(--chart-4))"
          showArea
        />
        <RealtimeChart 
          title="Consumer Lag"
          data={lagData}
          color="hsl(var(--chart-5))"
        />
      </div>

      <Card className="p-6">
        <h3 className="text-base font-semibold mb-4">Topic Performance</h3>
        <div className="space-y-4">
          {topics.map((topic) => (
            <div 
              key={topic.id}
              className="flex items-center gap-4 p-4 rounded-lg border border-card-border hover-elevate"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-medium text-sm font-mono">{topic.name}</h4>
                  <Badge variant="secondary">{topic.consumers} consumers</Badge>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>Throughput: <span className="font-mono text-foreground">{topic.messagesPerSec}/s</span></span>
                  <span>•</span>
                  <span>Lag: <span className="font-mono text-foreground">{topic.lag}ms</span></span>
                </div>
              </div>
              
              <div className="w-32">
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-status-healthy transition-all"
                    style={{ width: `${Math.min((topic.messagesPerSec / 500) * 100, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
