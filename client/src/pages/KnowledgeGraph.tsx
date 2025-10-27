import { MetricCard } from "@/components/MetricCard";
import { PatternNetwork } from "@/components/PatternNetwork";
import { DrillDownPanel } from "@/components/DrillDownPanel";
import { Card } from "@/components/ui/card";
import { Database, Network, Link, TrendingUp } from "lucide-react";
import { useState } from "react";

export default function KnowledgeGraph() {
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  //todo: remove mock functionality
  const nodes = Array.from({ length: 50 }, (_, i) => ({
    id: `node-${i}`,
    name: `${['Module', 'Func', 'Class', 'Intf', 'Svc'][i % 5]}${i + 1}`,
    quality: 60 + Math.random() * 40,
    usage: Math.floor(Math.random() * 100),
    category: ['Module', 'Function', 'Class', 'Interface', 'Service'][i % 5],
  }));

  const relationships = [
    { id: '1', type: 'depends-on', count: 1247 },
    { id: '2', type: 'imports', count: 892 },
    { id: '3', type: 'extends', count: 456 },
    { id: '4', type: 'implements', count: 324 },
  ];

  const handleNodeClick = (node: any) => {
    setSelectedNode(node);
    setPanelOpen(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold mb-2">Knowledge Graph</h1>
        <p className="text-muted-foreground">Interactive exploration of code relationships and dependencies</p>
      </div>

      <div className="grid grid-cols-4 gap-6">
        <MetricCard 
          label="Total Nodes"
          value="15,847"
          trend={{ value: 5.2, isPositive: true }}
          icon={Database}
          status="healthy"
        />
        <MetricCard 
          label="Relationships"
          value="42,391"
          trend={{ value: 8.1, isPositive: true }}
          icon={Network}
          status="healthy"
        />
        <MetricCard 
          label="Connected Components"
          value="324"
          icon={Link}
          status="healthy"
        />
        <MetricCard 
          label="Graph Density"
          value="0.67"
          icon={TrendingUp}
          status="healthy"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        <div className="xl:col-span-3">
          <PatternNetwork patterns={nodes} height={600} onPatternClick={handleNodeClick} />
        </div>

        <Card className="p-6">
          <h3 className="text-base font-semibold mb-4">Relationship Types</h3>
          <div className="space-y-3">
            {relationships.map((rel) => (
              <div 
                key={rel.id}
                className="p-3 rounded-lg border border-card-border"
              >
                <div className="text-sm font-medium font-mono mb-1">{rel.type}</div>
                <div className="text-2xl font-bold font-mono">{rel.count.toLocaleString()}</div>
              </div>
            ))}
          </div>

          <div className="mt-6 p-4 rounded-lg bg-primary/5 border border-primary/10">
            <h4 className="text-sm font-medium mb-2">Graph Statistics</h4>
            <div className="space-y-2 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span>Avg Degree:</span>
                <span className="font-mono text-foreground">5.3</span>
              </div>
              <div className="flex justify-between">
                <span>Max Depth:</span>
                <span className="font-mono text-foreground">12</span>
              </div>
              <div className="flex justify-between">
                <span>Clustering:</span>
                <span className="font-mono text-foreground">0.42</span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <DrillDownPanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        title={selectedNode?.name || "Node Details"}
        data={selectedNode || {}}
        type="pattern"
      />
    </div>
  );
}
