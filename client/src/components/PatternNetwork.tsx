import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

interface Pattern {
  id: string;
  name: string;
  quality: number;
  usage: number;
  category: string;
  language?: string | null;
}

interface PatternRelationship {
  source: string;
  target: string;
  type: string;
  weight: number;
}

interface PatternNetworkProps {
  patterns: Pattern[];
  height?: number;
  onPatternClick?: (pattern: Pattern) => void;
}

export function PatternNetwork({ patterns, height = 500, onPatternClick }: PatternNetworkProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredPattern, setHoveredPattern] = useState<Pattern | null>(null);

  // Fetch pattern relationships from API
  const patternIds = patterns.slice(0, 20).map(p => p.id).join(',');
  const { data: relationships = [] } = useQuery<PatternRelationship[]>({
    queryKey: [`/api/intelligence/patterns/relationships?patterns=${patternIds}`],
    enabled: patterns.length > 0,
    refetchInterval: 60000, // Refetch every 60 seconds
  });

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

    // Draw connections using real relationships
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.3;

    if (relationships.length > 0) {
      // Draw real relationships from API
      relationships.forEach((rel) => {
        const sourceNode = nodes.find(n => n.pattern.id === rel.source);
        const targetNode = nodes.find(n => n.pattern.id === rel.target);

        if (sourceNode && targetNode) {
          // Color-code by relationship type
          if (rel.type === 'modified_from') {
            ctx.strokeStyle = '#3b82f6'; // Blue for direct lineage
            ctx.lineWidth = 2;
          } else if (rel.type === 'same_language') {
            ctx.strokeStyle = '#10b981'; // Green for same language
            ctx.lineWidth = 1.5;
          } else if (rel.type === 'same_type') {
            ctx.strokeStyle = '#f59e0b'; // Orange for same type
            ctx.lineWidth = 1;
          } else {
            ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--border').trim()
              ? `hsl(${getComputedStyle(document.documentElement).getPropertyValue('--border').trim()})`
              : '#333';
            ctx.lineWidth = 1;
          }

          ctx.globalAlpha = Math.max(0.2, rel.weight * 0.5);
          ctx.beginPath();
          ctx.moveTo(sourceNode.x, sourceNode.y);
          ctx.lineTo(targetNode.x, targetNode.y);
          ctx.stroke();
        }
      });
    } else {
      // Fallback: draw connections based on category/language similarity
      ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--border').trim()
        ? `hsl(${getComputedStyle(document.documentElement).getPropertyValue('--border').trim()})`
        : '#333';
      ctx.lineWidth = 1;
      nodes.forEach((node, i) => {
        nodes.slice(i + 1).forEach((other) => {
          // Connect if same language or category
          if (node.pattern.language && other.pattern.language &&
              node.pattern.language === other.pattern.language) {
            ctx.globalAlpha = 0.4;
            ctx.beginPath();
            ctx.moveTo(node.x, node.y);
            ctx.lineTo(other.x, other.y);
            ctx.stroke();
          } else if (node.pattern.category === other.pattern.category && Math.random() > 0.8) {
            ctx.globalAlpha = 0.2;
            ctx.beginPath();
            ctx.moveTo(node.x, node.y);
            ctx.lineTo(other.x, other.y);
            ctx.stroke();
          }
        });
      });
    }
    ctx.globalAlpha = 1;

    // Draw nodes
    nodes.forEach((node) => {
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);

      // Color-code by quality score
      const quality = node.pattern.quality;
      if (quality > 0.80) {
        ctx.fillStyle = '#10b981'; // Green for high quality (>80%)
      } else if (quality > 0.60) {
        ctx.fillStyle = '#f59e0b'; // Orange for medium quality (60-80%)
      } else {
        ctx.fillStyle = '#ef4444'; // Red for low quality (<60%)
      }

      ctx.fill();
      ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--foreground').trim()
        ? `hsl(${getComputedStyle(document.documentElement).getPropertyValue('--foreground').trim()})`
        : '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Draw multi-line label
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--foreground').trim()
        ? `hsl(${getComputedStyle(document.documentElement).getPropertyValue('--foreground').trim()})`
        : '#fff';
      ctx.font = '10px IBM Plex Sans, sans-serif';
      ctx.textAlign = 'center';

      // Line 1: Pattern name (truncated if too long)
      const maxNameLength = 15;
      const displayName = node.pattern.name.length > maxNameLength
        ? node.pattern.name.substring(0, maxNameLength - 3) + '...'
        : node.pattern.name;
      ctx.fillText(displayName, node.x, node.y + node.radius + 12);

      // Line 2: Language (if available)
      if (node.pattern.language) {
        ctx.font = '9px IBM Plex Sans, sans-serif';
        ctx.fillStyle = '#9ca3af'; // Muted color for metadata
        ctx.fillText(node.pattern.language, node.x, node.y + node.radius + 23);
      }

      // Line 3: Quality score
      ctx.font = '9px IBM Plex Mono, monospace';
      const qualityPercent = Math.round(quality * 100);
      const qualityColor = quality > 0.80 ? '#10b981' : quality > 0.60 ? '#f59e0b' : '#ef4444';
      ctx.fillStyle = qualityColor;
      ctx.fillText(`${qualityPercent}%`, node.x, node.y + node.radius + (node.pattern.language ? 34 : 23));
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
  }, [patterns, relationships, onPatternClick]);

  return (
    <Card className="p-6" data-testid="viz-pattern-network">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold">Pattern Relationship Network</h3>
          <p className="text-sm text-muted-foreground">
            {hoveredPattern ? (
              <>
                <span className="font-medium">{hoveredPattern.name}</span>
                {hoveredPattern.language && (
                  <span className="text-xs ml-2">({hoveredPattern.language})</span>
                )}
                <span className="ml-2">Quality: {Math.round(hoveredPattern.quality * 100)}%</span>
              </>
            ) : (
              'Click nodes to view details'
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{patterns.length} patterns</Badge>
          <Badge variant="outline">{relationships.length} connections</Badge>
        </div>
      </div>

      <canvas 
        ref={canvasRef} 
        className="w-full rounded-lg border border-card-border bg-card"
        style={{ height: `${height}px` }}
      />
    </Card>
  );
}
