import { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Route,
  BarChart3,
  TrendingUp,
  PieChart,
  Grid3X3,
  AlertTriangle,
  Clock,
  Target,
} from 'lucide-react';
import {
  RoutingDecisionDetailModal,
  RoutingDecision as ModalRoutingDecision,
} from '@/components/RoutingDecisionDetailModal';

// =============================================================================
// TYPES
// =============================================================================

export interface RoutingAggregateViewProps {
  timeRange: '7d' | '30d' | '90d';
  dataStartTime: number;
  dataEndTime: number;
}

interface DailyAggregate {
  date: Date;
  totalRequests: number;
  avgConfidence: number;
  avgRoutingTime: number;
  byAgent: Record<string, number>;
  byHour: number[]; // 24 hours
}

interface TroubleRequest {
  id: string;
  timestamp: Date;
  agent: string;
  confidence: number;
  routingTimeMs: number;
  userRequest: string;
  issue: 'low_confidence' | 'high_latency' | 'both';
  // Modal-compatible fields
  correlationId: string;
  routingStrategy: string;
  alternatives?: Array<{ agent: string; confidence: number }>;
  reasoning?: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const AGENTS = [
  'polymorphic-agent',
  'agent-python-expert',
  'agent-api-architect',
  'agent-testing',
  'agent-code-review',
  'agent-documentation',
  'agent-performance',
  'agent-security',
];

const AGENT_COLORS: Record<string, string> = {
  'polymorphic-agent': '#8b5cf6',
  'agent-python-expert': '#3b82f6',
  'agent-api-architect': '#10b981',
  'agent-testing': '#f59e0b',
  'agent-code-review': '#ef4444',
  'agent-documentation': '#6366f1',
  'agent-performance': '#14b8a6',
  'agent-security': '#f97316',
};

const DAY = 24 * 60 * 60 * 1000;

// Thresholds for "trouble"
const LOW_CONFIDENCE_THRESHOLD = 75;
const HIGH_LATENCY_THRESHOLD = 100;

const SAMPLE_USER_REQUESTS = [
  'Help me refactor this React component to use hooks',
  'Write unit tests for the authentication module',
  'Review this pull request for security vulnerabilities',
  'Optimize the database query causing slow page loads',
  'Create API documentation for the user service',
  'Debug why the payment integration is failing',
  'Set up CI/CD pipeline for the new microservice',
  'Analyze the codebase architecture',
  'Implement rate limiting for the public API',
  'Fix the memory leak in WebSocket handler',
];

const ROUTING_STRATEGIES = [
  'semantic_similarity',
  'capability_match',
  'load_balanced',
  'specialized_routing',
  'hybrid_analysis',
];

const REASONING_TEMPLATES = [
  'Selected {agent} due to capability match for {task_type} tasks. Low confidence due to ambiguous request context.',
  'Routing to {agent} based on semantic analysis. High latency caused by extensive pattern matching.',
  '{agent} chosen for load distribution, but confidence reduced due to limited specialization in this domain.',
  'Specialized routing: {agent} selected despite suboptimal match due to availability constraints.',
  'Hybrid analysis selected {agent} with degraded confidence due to conflicting keyword signals.',
];

// =============================================================================
// MOCK DATA GENERATION
// =============================================================================

function generateAggregateData(startTime: number, endTime: number): DailyAggregate[] {
  const days: DailyAggregate[] = [];
  let currentDay = new Date(startTime);
  currentDay.setHours(0, 0, 0, 0);

  while (currentDay.getTime() < endTime) {
    const dayOfWeek = currentDay.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    // Base activity varies by day
    const baseActivity = isWeekend ? 50 + Math.random() * 50 : 150 + Math.random() * 100;

    // Generate hourly distribution (more activity during work hours)
    const byHour: number[] = [];
    for (let h = 0; h < 24; h++) {
      let hourMultiplier = 0.2; // night baseline
      if (h >= 9 && h <= 17)
        hourMultiplier = 1.0; // work hours
      else if (h >= 7 && h <= 9)
        hourMultiplier = 0.6; // morning ramp
      else if (h >= 17 && h <= 20) hourMultiplier = 0.5; // evening
      byHour.push(Math.floor(baseActivity * hourMultiplier * (0.5 + Math.random())));
    }

    // Generate agent distribution
    const byAgent: Record<string, number> = {};
    const totalRequests = byHour.reduce((a, b) => a + b, 0);
    let remaining = totalRequests;

    AGENTS.forEach((agent, i) => {
      if (i === AGENTS.length - 1) {
        byAgent[agent] = remaining;
      } else {
        const share = Math.floor(remaining * (0.1 + Math.random() * 0.2));
        byAgent[agent] = share;
        remaining -= share;
      }
    });

    days.push({
      date: new Date(currentDay),
      totalRequests,
      avgConfidence: 70 + Math.random() * 25,
      avgRoutingTime: 40 + Math.random() * 60,
      byAgent,
      byHour,
    });

    currentDay = new Date(currentDay.getTime() + DAY);
  }

  return days;
}

function generateTroubleData(startTime: number, endTime: number): TroubleRequest[] {
  const troubles: TroubleRequest[] = [];
  const duration = endTime - startTime;

  // Generate 15-30 trouble requests spread across the time range
  const numTroubles = 15 + Math.floor(Math.random() * 16);

  for (let i = 0; i < numTroubles; i++) {
    const timestamp = new Date(startTime + Math.random() * duration);
    const agent = AGENTS[Math.floor(Math.random() * AGENTS.length)];

    // Determine the type of trouble
    const troubleType = Math.random();
    let confidence: number;
    let routingTimeMs: number;
    let issue: TroubleRequest['issue'];

    if (troubleType < 0.4) {
      // Low confidence only
      confidence = 50 + Math.random() * 25; // 50-75%
      routingTimeMs = 40 + Math.random() * 50; // Normal latency
      issue = 'low_confidence';
    } else if (troubleType < 0.8) {
      // High latency only
      confidence = 80 + Math.random() * 15; // Normal confidence
      routingTimeMs = 100 + Math.random() * 80; // 100-180ms
      issue = 'high_latency';
    } else {
      // Both issues
      confidence = 50 + Math.random() * 20; // 50-70%
      routingTimeMs = 120 + Math.random() * 60; // 120-180ms
      issue = 'both';
    }

    // Generate alternatives
    const numAlternatives = Math.floor(Math.random() * 3) + 1;
    const alternatives: Array<{ agent: string; confidence: number }> = [];
    const usedAgents = new Set([agent]);
    for (let j = 0; j < numAlternatives; j++) {
      let altAgent = AGENTS[Math.floor(Math.random() * AGENTS.length)];
      while (usedAgents.has(altAgent)) {
        altAgent = AGENTS[Math.floor(Math.random() * AGENTS.length)];
      }
      usedAgents.add(altAgent);
      alternatives.push({
        agent: altAgent,
        confidence: Math.max(0.3, confidence / 100 - 0.05 - Math.random() * 0.15),
      });
    }
    alternatives.sort((a, b) => b.confidence - a.confidence);

    // Generate reasoning
    const taskType = agent.replace('agent-', '').replace(/-/g, ' ');
    const reasoningTemplate =
      REASONING_TEMPLATES[Math.floor(Math.random() * REASONING_TEMPLATES.length)];
    const reasoning = reasoningTemplate
      .replace(/{agent}/g, agent)
      .replace(/{task_type}/g, taskType);

    troubles.push({
      id: `trouble-${i}-${Date.now()}`,
      timestamp,
      agent,
      confidence,
      routingTimeMs,
      userRequest: SAMPLE_USER_REQUESTS[i % SAMPLE_USER_REQUESTS.length],
      issue,
      correlationId: `corr-${Math.random().toString(36).substring(2, 10)}`,
      routingStrategy: ROUTING_STRATEGIES[Math.floor(Math.random() * ROUTING_STRATEGIES.length)],
      alternatives,
      reasoning,
    });
  }

  // Sort by timestamp descending (most recent first)
  return troubles.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

// =============================================================================
// 1. HEATMAP VISUALIZATION
// =============================================================================

function HeatmapChart({ data }: { data: DailyAggregate[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 200 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({ width: entry.contentRect.width, height: 200 });
      }
    });
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const { width, height } = dimensions;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);

    const labelWidth = 40;
    const labelHeight = 20;
    const cellWidth = (width - labelWidth) / data.length;
    const cellHeight = (height - labelHeight) / 24;

    // Find max for color scaling
    const maxValue = Math.max(...data.flatMap((d) => d.byHour));

    // Draw cells
    data.forEach((day, dayIndex) => {
      day.byHour.forEach((value, hour) => {
        const x = labelWidth + dayIndex * cellWidth;
        const y = hour * cellHeight;

        // Color intensity based on value
        const intensity = value / maxValue;
        const r = Math.floor(34 + (34 - 34) * intensity);
        const g = Math.floor(197 * intensity);
        const b = Math.floor(94 * intensity);
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.fillRect(x + 1, y + 1, cellWidth - 2, cellHeight - 2);
      });
    });

    // Hour labels
    ctx.fillStyle = '#666';
    ctx.font = '9px Inter, system-ui, sans-serif';
    ctx.textAlign = 'right';
    for (let h = 0; h < 24; h += 4) {
      ctx.fillText(`${h}:00`, labelWidth - 4, h * cellHeight + cellHeight / 2 + 3);
    }

    // Day labels
    ctx.textAlign = 'center';
    const labelInterval = Math.ceil(data.length / 10);
    data.forEach((day, i) => {
      if (i % labelInterval === 0) {
        const x = labelWidth + i * cellWidth + cellWidth / 2;
        ctx.fillText(
          day.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          x,
          height - 4
        );
      }
    });
  }, [data, dimensions]);

  return (
    <div ref={containerRef} className="w-full">
      <canvas ref={canvasRef} style={{ width: '100%', height: '200px' }} />
    </div>
  );
}

// =============================================================================
// 2. HISTOGRAM VISUALIZATION
// =============================================================================

function HistogramChart({ data }: { data: DailyAggregate[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 200 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({ width: entry.contentRect.width, height: 200 });
      }
    });
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const { width, height } = dimensions;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);

    // Create histogram bins for routing time
    const routingTimes = data.map((d) => d.avgRoutingTime);
    const minTime = 0;
    const maxTime = 150;
    const numBins = 15;
    const binWidth = (maxTime - minTime) / numBins;
    const bins = new Array(numBins).fill(0);

    routingTimes.forEach((time) => {
      const binIndex = Math.min(Math.floor((time - minTime) / binWidth), numBins - 1);
      bins[binIndex]++;
    });

    const maxBin = Math.max(...bins);
    const labelWidth = 40;
    const labelHeight = 25;
    const chartWidth = width - labelWidth - 20;
    const chartHeight = height - labelHeight - 10;
    const barWidth = chartWidth / numBins;

    // Draw bars
    bins.forEach((count, i) => {
      const x = labelWidth + i * barWidth;
      const barHeight = (count / maxBin) * chartHeight;
      const y = chartHeight - barHeight + 5;

      // Color based on routing time (green = fast, orange = slow)
      const binCenter = minTime + (i + 0.5) * binWidth;
      const t = Math.min(1, binCenter / 100);
      const r = Math.floor(34 + (249 - 34) * t);
      const g = Math.floor(197 + (115 - 197) * t);
      const b = Math.floor(94 + (22 - 94) * t);

      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.fillRect(x + 2, y, barWidth - 4, barHeight);
    });

    // X-axis labels
    ctx.fillStyle = '#666';
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (let i = 0; i <= numBins; i += 3) {
      const x = labelWidth + i * barWidth;
      const label = Math.round(minTime + i * binWidth);
      ctx.fillText(`${label}ms`, x, height - 5);
    }

    // Y-axis labels
    ctx.textAlign = 'right';
    ctx.fillText('Days', labelWidth - 5, 15);
  }, [data, dimensions]);

  return (
    <div ref={containerRef} className="w-full">
      <canvas ref={canvasRef} style={{ width: '100%', height: '200px' }} />
    </div>
  );
}

// =============================================================================
// 3. STACKED BAR CHART
// =============================================================================

function StackedBarChart({ data }: { data: DailyAggregate[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 200 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({ width: entry.contentRect.width, height: 200 });
      }
    });
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const { width, height } = dimensions;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);

    const labelWidth = 40;
    const labelHeight = 20;
    const chartWidth = width - labelWidth - 10;
    const chartHeight = height - labelHeight - 10;
    const barWidth = chartWidth / data.length;

    const maxTotal = Math.max(...data.map((d) => d.totalRequests));

    // Draw stacked bars
    data.forEach((day, dayIndex) => {
      const x = labelWidth + dayIndex * barWidth;
      let currentY = chartHeight + 5;

      AGENTS.forEach((agent) => {
        const count = day.byAgent[agent] || 0;
        const barHeight = (count / maxTotal) * chartHeight;
        currentY -= barHeight;

        ctx.fillStyle = AGENT_COLORS[agent] || '#666';
        ctx.fillRect(x + 1, currentY, barWidth - 2, barHeight);
      });
    });

    // Day labels
    ctx.fillStyle = '#666';
    ctx.font = '9px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    const labelInterval = Math.ceil(data.length / 8);
    data.forEach((day, i) => {
      if (i % labelInterval === 0) {
        const x = labelWidth + i * barWidth + barWidth / 2;
        ctx.fillText(
          day.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          x,
          height - 4
        );
      }
    });
  }, [data, dimensions]);

  // Legend
  const legend = AGENTS.slice(0, 6).map((agent) => (
    <div key={agent} className="flex items-center gap-1 text-xs">
      <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: AGENT_COLORS[agent] }} />
      <span className="text-muted-foreground truncate max-w-20">{agent.replace('agent-', '')}</span>
    </div>
  ));

  return (
    <div ref={containerRef} className="w-full">
      <canvas ref={canvasRef} style={{ width: '100%', height: '200px' }} />
      <div className="flex flex-wrap gap-3 mt-2 justify-center">{legend}</div>
    </div>
  );
}

// =============================================================================
// 4. TREND LINES CHART
// =============================================================================

function TrendLinesChart({ data }: { data: DailyAggregate[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 200 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({ width: entry.contentRect.width, height: 200 });
      }
    });
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const { width, height } = dimensions;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);

    const labelWidth = 40;
    const labelHeight = 20;
    const chartWidth = width - labelWidth - 20;
    const chartHeight = height - labelHeight - 20;
    const padding = 10;

    // Draw grid
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding + (chartHeight / 4) * i;
      ctx.beginPath();
      ctx.moveTo(labelWidth, y);
      ctx.lineTo(width - 10, y);
      ctx.stroke();
    }

    // Draw confidence line (scaled 0-100)
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    data.forEach((day, i) => {
      const x = labelWidth + (i / (data.length - 1)) * chartWidth;
      const y = padding + chartHeight - (day.avgConfidence / 100) * chartHeight;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Draw routing time line (scaled 0-150ms)
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 2;
    ctx.beginPath();
    data.forEach((day, i) => {
      const x = labelWidth + (i / (data.length - 1)) * chartWidth;
      const y = padding + chartHeight - (day.avgRoutingTime / 150) * chartHeight;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Draw request volume (normalized)
    const maxRequests = Math.max(...data.map((d) => d.totalRequests));
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    data.forEach((day, i) => {
      const x = labelWidth + (i / (data.length - 1)) * chartWidth;
      const y = padding + chartHeight - (day.totalRequests / maxRequests) * chartHeight;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Day labels
    ctx.fillStyle = '#666';
    ctx.font = '9px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    const labelInterval = Math.ceil(data.length / 6);
    data.forEach((day, i) => {
      if (i % labelInterval === 0 || i === data.length - 1) {
        const x = labelWidth + (i / (data.length - 1)) * chartWidth;
        ctx.fillText(
          day.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          x,
          height - 4
        );
      }
    });
  }, [data, dimensions]);

  return (
    <div ref={containerRef} className="w-full">
      <canvas ref={canvasRef} style={{ width: '100%', height: '200px' }} />
      <div className="flex gap-4 mt-2 justify-center text-xs">
        <div className="flex items-center gap-1">
          <div className="w-3 h-0.5 bg-green-500" />
          <span className="text-muted-foreground">Confidence %</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-0.5 bg-orange-500" />
          <span className="text-muted-foreground">Routing Time</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-0.5 bg-blue-500" />
          <span className="text-muted-foreground">Request Volume</span>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// 5. HORIZONTAL BAR CHART (Agent Distribution)
// =============================================================================

function DistributionBarChart({ data }: { data: DailyAggregate[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 280 });

  // Aggregate totals by agent
  const agentTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    data.forEach((day) => {
      Object.entries(day.byAgent).forEach(([agent, count]) => {
        totals[agent] = (totals[agent] || 0) + count;
      });
    });
    return Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [data]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({ width: entry.contentRect.width, height: 280 });
      }
    });
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || agentTotals.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const { width, height } = dimensions;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);

    const labelWidth = 120;
    const valueWidth = 80;
    const barAreaWidth = width - labelWidth - valueWidth - 20;
    const barHeight = 24;
    const barGap = 8;
    const startY = 10;

    const maxValue = Math.max(...agentTotals.map(([, count]) => count));
    const total = agentTotals.reduce((sum, [, count]) => sum + count, 0);

    agentTotals.forEach(([agent, count], index) => {
      const y = startY + index * (barHeight + barGap);
      const barWidth = (count / maxValue) * barAreaWidth;
      const percent = ((count / total) * 100).toFixed(1);

      // Agent label
      ctx.fillStyle = '#888';
      ctx.font = '11px Inter, system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(agent.replace('agent-', ''), labelWidth - 10, y + barHeight / 2);

      // Bar background
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(labelWidth, y, barAreaWidth, barHeight);

      // Bar fill
      ctx.fillStyle = AGENT_COLORS[agent] || '#666';
      ctx.fillRect(labelWidth, y, barWidth, barHeight);

      // Value and percentage
      ctx.fillStyle = '#fff';
      ctx.font = '11px Inter, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(
        `${count.toLocaleString()} (${percent}%)`,
        labelWidth + barAreaWidth + 10,
        y + barHeight / 2
      );
    });

    // Total at bottom
    ctx.fillStyle = '#666';
    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'right';
    const totalY = startY + agentTotals.length * (barHeight + barGap) + 10;
    ctx.fillText('Total:', labelWidth - 10, totalY);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.fillText(`${total.toLocaleString()} requests`, labelWidth + barAreaWidth + 10, totalY);
  }, [agentTotals, dimensions]);

  return (
    <div ref={containerRef} className="w-full">
      <canvas ref={canvasRef} style={{ width: '100%', height: '280px' }} />
    </div>
  );
}

// =============================================================================
// 6. TROUBLE LIST
// =============================================================================

function TroubleList({
  troubles,
  onTroubleClick,
}: {
  troubles: TroubleRequest[];
  onTroubleClick: (trouble: TroubleRequest) => void;
}) {
  return (
    <div className="space-y-2 max-h-80 overflow-y-auto">
      {troubles.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p>No trouble requests found</p>
        </div>
      ) : (
        troubles.map((trouble) => (
          <div
            key={trouble.id}
            className="flex items-start gap-3 p-3 rounded-lg border bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer"
            onClick={() => onTroubleClick(trouble)}
          >
            {/* Issue indicator */}
            <div className="flex-shrink-0 mt-0.5">
              {trouble.issue === 'both' ? (
                <AlertTriangle className="h-4 w-4 text-red-500" />
              ) : trouble.issue === 'low_confidence' ? (
                <Target className="h-4 w-4 text-yellow-500" />
              ) : (
                <Clock className="h-4 w-4 text-orange-500" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-muted-foreground">
                  {trouble.timestamp.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </span>
                <Badge
                  variant="outline"
                  className="text-xs"
                  style={{
                    borderColor: AGENT_COLORS[trouble.agent],
                    color: AGENT_COLORS[trouble.agent],
                  }}
                >
                  {trouble.agent.replace('agent-', '')}
                </Badge>
              </div>
              <p className="text-sm truncate">{trouble.userRequest}</p>
              <div className="flex items-center gap-3 mt-1.5">
                {trouble.issue !== 'high_latency' && (
                  <span
                    className={`text-xs ${trouble.confidence < 65 ? 'text-red-400' : 'text-yellow-400'}`}
                  >
                    {trouble.confidence.toFixed(0)}% confidence
                  </span>
                )}
                {trouble.issue !== 'low_confidence' && (
                  <span
                    className={`text-xs ${trouble.routingTimeMs > 150 ? 'text-red-400' : 'text-orange-400'}`}
                  >
                    {trouble.routingTimeMs.toFixed(0)}ms latency
                  </span>
                )}
                {trouble.issue === 'both' && (
                  <Badge variant="destructive" className="text-xs px-1.5 py-0">
                    Both
                  </Badge>
                )}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

function getTimeRangeLabel(timeRange: string): string {
  switch (timeRange) {
    case '7d':
      return 'Last 7 Days';
    case '30d':
      return 'Last 30 Days';
    case '90d':
      return 'Last 90 Days';
    default:
      return timeRange;
  }
}

export function RoutingAggregateView({
  timeRange,
  dataStartTime,
  dataEndTime,
}: RoutingAggregateViewProps) {
  const data = useMemo(
    () => generateAggregateData(dataStartTime, dataEndTime),
    [dataStartTime, dataEndTime]
  );

  const troubles = useMemo(
    () => generateTroubleData(dataStartTime, dataEndTime),
    [dataStartTime, dataEndTime]
  );

  // Modal state
  const [selectedTrouble, setSelectedTrouble] = useState<TroubleRequest | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleTroubleClick = useCallback((trouble: TroubleRequest) => {
    setSelectedTrouble(trouble);
    setIsModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  // Convert TroubleRequest to modal-compatible format
  const modalDecision: ModalRoutingDecision | null = useMemo(() => {
    if (!selectedTrouble) return null;
    return {
      id: selectedTrouble.id,
      correlationId: selectedTrouble.correlationId,
      userRequest: selectedTrouble.userRequest,
      selectedAgent: selectedTrouble.agent,
      confidenceScore: selectedTrouble.confidence / 100,
      routingStrategy: selectedTrouble.routingStrategy,
      alternatives: selectedTrouble.alternatives,
      reasoning: selectedTrouble.reasoning,
      routingTimeMs: selectedTrouble.routingTimeMs,
      createdAt: selectedTrouble.timestamp.toISOString(),
    };
  }, [selectedTrouble]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Route className="h-4 w-4" />
            Routing Analytics - {getTimeRangeLabel(timeRange)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="heatmap" className="w-full">
            <TabsList className="grid w-full grid-cols-5 mb-4">
              <TabsTrigger value="heatmap" className="flex items-center gap-1.5">
                <Grid3X3 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Heatmap</span>
              </TabsTrigger>
              <TabsTrigger value="histogram" className="flex items-center gap-1.5">
                <BarChart3 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Histogram</span>
              </TabsTrigger>
              <TabsTrigger value="stacked" className="flex items-center gap-1.5">
                <BarChart3 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Stacked</span>
              </TabsTrigger>
              <TabsTrigger value="trends" className="flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Trends</span>
              </TabsTrigger>
              <TabsTrigger value="distribution" className="flex items-center gap-1.5">
                <PieChart className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Distribution</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="heatmap" className="mt-0">
              <div className="space-y-2">
                <div>
                  <h3 className="text-sm font-medium">Activity Heatmap</h3>
                  <p className="text-xs text-muted-foreground">
                    Request volume by hour of day across the time range
                  </p>
                </div>
                <HeatmapChart data={data} />
              </div>
            </TabsContent>

            <TabsContent value="histogram" className="mt-0">
              <div className="space-y-2">
                <div>
                  <h3 className="text-sm font-medium">Routing Time Distribution</h3>
                  <p className="text-xs text-muted-foreground">
                    Distribution of average daily routing times
                  </p>
                </div>
                <HistogramChart data={data} />
              </div>
            </TabsContent>

            <TabsContent value="stacked" className="mt-0">
              <div className="space-y-2">
                <div>
                  <h3 className="text-sm font-medium">Agent Volume Breakdown</h3>
                  <p className="text-xs text-muted-foreground">
                    Daily request volume broken down by agent
                  </p>
                </div>
                <StackedBarChart data={data} />
              </div>
            </TabsContent>

            <TabsContent value="trends" className="mt-0">
              <div className="space-y-2">
                <div>
                  <h3 className="text-sm font-medium">Performance Trends</h3>
                  <p className="text-xs text-muted-foreground">
                    Confidence, routing time, and volume over time
                  </p>
                </div>
                <TrendLinesChart data={data} />
              </div>
            </TabsContent>

            <TabsContent value="distribution" className="mt-0">
              <div className="space-y-2">
                <div>
                  <h3 className="text-sm font-medium">Agent Distribution</h3>
                  <p className="text-xs text-muted-foreground">
                    Share of requests handled by each agent
                  </p>
                </div>
                <DistributionBarChart data={data} />
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Trouble List - always visible */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            Trouble Requests
            <Badge variant="secondary" className="ml-auto">
              {troubles.length}
            </Badge>
          </CardTitle>
          <CardDescription className="text-xs">
            Requests with low confidence (&lt;{LOW_CONFIDENCE_THRESHOLD}%) or high latency (&gt;
            {HIGH_LATENCY_THRESHOLD}ms)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TroubleList troubles={troubles} onTroubleClick={handleTroubleClick} />
        </CardContent>
      </Card>

      <RoutingDecisionDetailModal
        decision={modalDecision}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
      />
    </div>
  );
}
