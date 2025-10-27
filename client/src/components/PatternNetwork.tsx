import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useEffect, useRef, useState } from "react";

interface Pattern {
  id: string;
  name: string;
  quality: number;
  usage: number;
  category: string;
}

interface PatternNetworkProps {
  patterns: Pattern[];
  height?: number;
}

export function PatternNetwork({ patterns, height = 500 }: PatternNetworkProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedPattern, setSelectedPattern] = useState<Pattern | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    // Simple network visualization
    const nodes = patterns.slice(0, 20).map((p, i) => ({
      x: 50 + (i % 5) * (rect.width / 5),
      y: 50 + Math.floor(i / 5) * (rect.height / 4),
      radius: 8 + (p.usage / 100) * 12,
      pattern: p,
    }));

    // Clear canvas
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--card').trim();
    
    // Draw connections
    ctx.strokeStyle = 'hsl(var(--border))';
    ctx.lineWidth = 1;
    nodes.forEach((node, i) => {
      nodes.slice(i + 1).forEach((other) => {
        if (Math.random() > 0.7) {
          ctx.beginPath();
          ctx.moveTo(node.x, node.y);
          ctx.lineTo(other.x, other.y);
          ctx.stroke();
        }
      });
    });

    // Draw nodes
    nodes.forEach((node) => {
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      ctx.fillStyle = `hsl(${(node.pattern.quality / 100) * 120}, 70%, 50%)`;
      ctx.fill();
      ctx.strokeStyle = 'hsl(var(--foreground))';
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    // Add click handler
    const handleClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const clickedNode = nodes.find(node => {
        const dx = x - node.x;
        const dy = y - node.y;
        return Math.sqrt(dx * dx + dy * dy) <= node.radius;
      });

      if (clickedNode) {
        setSelectedPattern(clickedNode.pattern);
        console.log('Pattern selected:', clickedNode.pattern);
      }
    };

    canvas.addEventListener('click', handleClick);
    return () => canvas.removeEventListener('click', handleClick);
  }, [patterns]);

  return (
    <Card className="p-6" data-testid="viz-pattern-network">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold">Pattern Relationship Network</h3>
          <p className="text-sm text-muted-foreground">Click nodes to view details</p>
        </div>
        <Badge variant="outline">{patterns.length} patterns</Badge>
      </div>

      <div className="relative">
        <canvas 
          ref={canvasRef} 
          className="w-full rounded-lg border border-card-border bg-card"
          style={{ height: `${height}px` }}
        />
        
        {selectedPattern && (
          <div className="absolute top-4 right-4 bg-card border border-card-border rounded-lg p-4 shadow-lg max-w-xs">
            <h4 className="font-semibold mb-2">{selectedPattern.name}</h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Quality:</span>
                <span className="font-mono">{selectedPattern.quality}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Usage:</span>
                <span className="font-mono">{selectedPattern.usage}x</span>
              </div>
              <Badge variant="secondary" className="mt-2">{selectedPattern.category}</Badge>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
