import { MetricCard } from "@/components/MetricCard";
import { PatternNetwork } from "@/components/PatternNetwork";
import { TopPatternsList } from "@/components/TopPatternsList";
import { RealtimeChart } from "@/components/RealtimeChart";
import { DrillDownPanel } from "@/components/DrillDownPanel";
import { Database, TrendingUp, Award } from "lucide-react";
import { useState } from "react";

export default function PatternLearning() {
  const [selectedPattern, setSelectedPattern] = useState<any>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  //todo: remove mock functionality
  const patterns = Array.from({ length: 50 }, (_, i) => ({
    id: `pattern-${i}`,
    name: `${['React', 'TS', 'API', 'DB', 'Perf'][i % 5]} ${i + 1}`,
    description: `Advanced pattern for ${['hooks', 'optimization', 'state management', 'error handling'][i % 4]}`,
    quality: 60 + Math.random() * 40,
    usage: Math.floor(Math.random() * 100),
    usageCount: 150 - i * 2,
    trend: Math.floor(Math.random() * 20) - 5,
    category: ['React', 'TypeScript', 'API', 'Database', 'Performance'][i % 5],
  }));

  const discoveryData = Array.from({ length: 20 }, (_, i) => ({
    time: `${i}:00`,
    value: 100 + Math.random() * 50,
  }));

  const qualityData = Array.from({ length: 20 }, (_, i) => ({
    time: `${i}:00`,
    value: 70 + Math.random() * 20,
  }));

  const handlePatternClick = (pattern: any) => {
    setSelectedPattern(pattern);
    setPanelOpen(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold mb-2">Pattern Learning</h1>
        <p className="text-muted-foreground">Discovery and evolution of 25,000+ code patterns</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <div className="grid grid-cols-4 gap-6">
            <MetricCard 
              label="Total Patterns"
              value="25,847"
              trend={{ value: 8.5, isPositive: true }}
              icon={Database}
              status="healthy"
            />
            <MetricCard 
              label="New Today"
              value="342"
              trend={{ value: 15, isPositive: true }}
              icon={TrendingUp}
              status="healthy"
            />
            <MetricCard 
              label="Avg Quality"
              value="87%"
              trend={{ value: 2.1, isPositive: true }}
              icon={Award}
              status="healthy"
            />
            <MetricCard 
              label="Active Learning"
              value="156"
              icon={Database}
              status="healthy"
            />
          </div>

          <PatternNetwork patterns={patterns} height={500} onPatternClick={handlePatternClick} />
        </div>
        
        <div className="space-y-6">
          <RealtimeChart 
            title="Pattern Discovery Rate"
            data={discoveryData}
            color="hsl(var(--chart-2))"
            showArea
            height={240}
          />
          <RealtimeChart 
            title="Average Quality Score"
            data={qualityData}
            color="hsl(var(--chart-3))"
            height={240}
          />
          <TopPatternsList patterns={patterns} limit={6} />
        </div>
      </div>

      <DrillDownPanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        title={selectedPattern?.name || "Pattern Details"}
        data={selectedPattern || {}}
        type="pattern"
      />
    </div>
  );
}
