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
  onPatternClick?: (pattern: Pattern) => void;
}

export function PatternNetwork({ patterns, height = 500, onPatternClick }: PatternNetworkProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredPattern, setHoveredPattern] = useState<Pattern | null>(null);

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

    // Create nodes
    const nodes = patterns.slice(0, 20).map((p, i) => ({
      x: 80 + (i % 5) * (rect.width / 5),
      y: 60 + Math.floor(i / 5) * (rect.height / 4),
      radius: 8 + (p.usage / 100) * 12,
      pattern: p,
    }));

    // Clear canvas
    ctx.clearRect(0, 0, rect.width, rect.height);
    
    // Draw connections
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--border').trim() 
      ? `hsl(${getComputedStyle(document.documentElement).getPropertyValue('--border').trim()})` 
      : '#333';
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.3;
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
    ctx.globalAlpha = 1;

    // Draw nodes
    nodes.forEach((node) => {
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      ctx.fillStyle = `hsl(${(node.pattern.quality / 100) * 120}, 70%, 50%)`;
      ctx.fill();
      ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--foreground').trim()
        ? `hsl(${getComputedStyle(document.documentElement).getPropertyValue('--foreground').trim()})`
        : '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Draw label
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--foreground').trim()
        ? `hsl(${getComputedStyle(document.documentElement).getPropertyValue('--foreground').trim()})`
        : '#fff';
      ctx.font = '10px IBM Plex Sans, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(node.pattern.name, node.x, node.y + node.radius + 12);
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

      if (clickedNode && onPatternClick) {
        onPatternClick(clickedNode.pattern);
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const hoveredNode = nodes.find(node => {
        const dx = x - node.x;
        const dy = y - node.y;
        return Math.sqrt(dx * dx + dy * dy) <= node.radius;
      });

      setHoveredPattern(hoveredNode?.pattern || null);
      canvas.style.cursor = hoveredNode ? 'pointer' : 'default';
    };

    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('mousemove', handleMouseMove);
    return () => {
      canvas.removeEventListener('click', handleClick);
      canvas.removeEventListener('mousemove', handleMouseMove);
    };
  }, [patterns, onPatternClick]);

  return (
    <Card className="p-6" data-testid="viz-pattern-network">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold">Pattern Relationship Network</h3>
          <p className="text-sm text-muted-foreground">
            {hoveredPattern ? `Hovering: ${hoveredPattern.name}` : 'Click nodes to view details'}
          </p>
        </div>
        <Badge variant="outline">{patterns.length} patterns</Badge>
      </div>

      <canvas 
        ref={canvasRef} 
        className="w-full rounded-lg border border-card-border bg-card"
        style={{ height: `${height}px` }}
      />
    </Card>
  );
}
