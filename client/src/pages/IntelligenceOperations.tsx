import { MetricCard } from "@/components/MetricCard";
import { RealtimeChart } from "@/components/RealtimeChart";
import { EventFeed } from "@/components/EventFeed";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Zap, CheckCircle, AlertTriangle, TrendingUp } from "lucide-react";

export default function IntelligenceOperations() {
  //todo: remove mock functionality
  const operations = [
    { id: '1', name: 'Code Analysis', status: 'running', count: 42, avgTime: '1.2s' },
    { id: '2', name: 'Pattern Recognition', status: 'running', count: 38, avgTime: '0.8s' },
    { id: '3', name: 'Quality Assessment', status: 'running', count: 25, avgTime: '2.1s' },
    { id: '4', name: 'Performance Optimization', status: 'idle', count: 15, avgTime: '3.4s' },
    { id: '5', name: 'Semantic Analysis', status: 'running', count: 31, avgTime: '1.5s' },
    { id: '6', name: 'Dependency Mapping', status: 'running', count: 18, avgTime: '2.8s' },
  ];

  const chartData = Array.from({ length: 20 }, (_, i) => ({
    time: `${i}:00`,
    value: 120 + Math.random() * 50,
  }));

  const qualityData = Array.from({ length: 20 }, (_, i) => ({
    time: `${i}:00`,
    value: 75 + Math.random() * 15,
  }));

  const events = [
    { id: '1', type: 'success' as const, message: 'Code analysis completed for Repository-42', timestamp: '10:23:15', source: 'Analysis Engine' },
    { id: '2', type: 'info' as const, message: 'Quality score improved by 12% for Project-A', timestamp: '10:23:12', source: 'Quality Assessor' },
    { id: '3', type: 'success' as const, message: 'Performance optimization recommendations generated', timestamp: '10:23:08', source: 'Optimizer' },
    { id: '4', type: 'warning' as const, message: 'High complexity detected in Module-X', timestamp: '10:22:55', source: 'Analyzer' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold mb-2">Intelligence Operations</h1>
        <p className="text-muted-foreground">168+ AI operations for code analysis and optimization</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <div className="grid grid-cols-4 gap-6">
            <MetricCard 
              label="Active Operations"
              value="168"
              trend={{ value: 5, isPositive: true }}
              icon={Zap}
              status="healthy"
            />
            <MetricCard 
              label="Running Now"
              value="42"
              icon={Zap}
              status="healthy"
            />
            <MetricCard 
              label="Success Rate"
              value="96.8%"
              trend={{ value: 1.2, isPositive: true }}
              icon={CheckCircle}
              status="healthy"
            />
            <MetricCard 
              label="Avg Processing"
              value="1.8s"
              icon={TrendingUp}
              status="healthy"
            />
          </div>

          <Card className="p-6">
            <h3 className="text-base font-semibold mb-4">Operation Status</h3>
            <div className="grid grid-cols-2 gap-4">
              {operations.map((op) => (
                <div 
                  key={op.id}
                  className="flex items-center gap-3 p-4 rounded-lg border border-card-border hover-elevate"
                >
                  <div className={`h-3 w-3 rounded-full ${op.status === 'running' ? 'bg-status-healthy animate-pulse' : 'bg-status-idle'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{op.name}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {op.count} operations • {op.avgTime} avg
                    </div>
                  </div>
                  <Badge variant={op.status === 'running' ? 'default' : 'secondary'}>
                    {op.status}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>
        
        <div className="space-y-6">
          <RealtimeChart 
            title="Operations per Minute"
            data={chartData}
            color="hsl(var(--chart-4))"
            showArea
            height={240}
          />
          <RealtimeChart 
            title="Quality Improvement Impact"
            data={qualityData}
            color="hsl(var(--chart-3))"
            height={240}
          />
          <EventFeed events={events} maxHeight={280} />
        </div>
      </div>
    </div>
  );
}
