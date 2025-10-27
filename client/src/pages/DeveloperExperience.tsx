import { MetricCard } from "@/components/MetricCard";
import { RealtimeChart } from "@/components/RealtimeChart";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Code, TrendingUp, Award } from "lucide-react";

export default function DeveloperExperience() {
  //todo: remove mock functionality
  const workflows = [
    { id: '1', name: 'Code Generation', completions: 247, avgTime: '2.3s', improvement: 45 },
    { id: '2', name: 'Refactoring', completions: 189, avgTime: '3.1s', improvement: 38 },
    { id: '3', name: 'Test Generation', completions: 156, avgTime: '1.8s', improvement: 52 },
    { id: '4', name: 'Documentation', completions: 134, avgTime: '2.7s', improvement: 41 },
  ];

  const velocityData = Array.from({ length: 20 }, (_, i) => ({
    time: `${i}:00`,
    value: 60 + Math.random() * 30,
  }));

  const productivityData = Array.from({ length: 20 }, (_, i) => ({
    time: `${i}:00`,
    value: 70 + Math.random() * 20,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold mb-2">Developer Experience</h1>
        <p className="text-muted-foreground">Workflow improvements and productivity metrics</p>
      </div>

      <div className="grid grid-cols-4 gap-6">
        <MetricCard 
          label="Active Developers"
          value="247"
          trend={{ value: 12, isPositive: true }}
          icon={Users}
          status="healthy"
        />
        <MetricCard 
          label="Code Generated"
          value="12.4k"
          trend={{ value: 28, isPositive: true }}
          icon={Code}
          status="healthy"
        />
        <MetricCard 
          label="Productivity Gain"
          value="42%"
          trend={{ value: 5, isPositive: true }}
          icon={TrendingUp}
          status="healthy"
        />
        <MetricCard 
          label="Pattern Reuse"
          value="87%"
          trend={{ value: 8, isPositive: true }}
          icon={Award}
          status="healthy"
        />
      </div>

      <Card className="p-6">
        <h3 className="text-base font-semibold mb-4">AI-Powered Workflows</h3>
        <div className="grid grid-cols-2 gap-4">
          {workflows.map((workflow) => (
            <div 
              key={workflow.id}
              className="p-4 rounded-lg border border-card-border hover-elevate"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h4 className="font-medium text-sm mb-1">{workflow.name}</h4>
                  <div className="text-xs text-muted-foreground">
                    {workflow.completions} completions today
                  </div>
                </div>
                <Badge variant="outline" className="text-status-healthy border-status-healthy/30">
                  +{workflow.improvement}%
                </Badge>
              </div>
              
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Avg Time:</span>
                <span className="font-mono">{workflow.avgTime}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-6">
        <RealtimeChart 
          title="Development Velocity"
          data={velocityData}
          color="hsl(var(--chart-1))"
          showArea
        />
        <RealtimeChart 
          title="Developer Productivity Score"
          data={productivityData}
          color="hsl(var(--chart-2))"
        />
      </div>
    </div>
  );
}
