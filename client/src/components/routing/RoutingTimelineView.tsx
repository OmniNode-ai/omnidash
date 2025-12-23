import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Route } from 'lucide-react';
import {
  RoutingDecisionDetailModal,
  RoutingDecision as ModalRoutingDecision,
} from '@/components/RoutingDecisionDetailModal';

// =============================================================================
// TYPES
// =============================================================================

export interface RoutingDecision {
  // Timeline-specific fields
  timestamp: number;
  agent: string;
  confidence: number;
  routingTimeMs: number;
  // Modal-compatible fields
  id: string;
  correlationId: string;
  userRequest: string;
  routingStrategy: string;
  alternatives?: Array<{ agent: string; confidence: number }>;
  reasoning?: string;
}

interface TimelineState {
  viewportStart: number;
  visibleDuration: number;
}

interface TimelineViewport {
  startTime: number;
  endTime: number;
  msPerPixel: number;
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
  'agent-frontend',
  'agent-database',
  'agent-devops',
  'agent-debugging',
  'agent-refactoring',
  'agent-architecture',
  'agent-integration',
  'agent-monitoring',
  'agent-optimization',
  'agent-migration',
];

// Time constants
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const DEFAULT_VISIBLE_DURATION = 10 * MINUTE;
const MIN_VISIBLE_DURATION = 1 * MINUTE;
const MAX_VISIBLE_DURATION = 24 * HOUR;

// Layout constants
const LABEL_WIDTH = 140;
const LANE_HEIGHT = 21;
const MIN_PIANO_ROLL_HEIGHT = 100;
const WAVEFORM_HEIGHT = 80;
const TIME_AXIS_HEIGHT = 24;
const SECTION_GAP = 8;
const FIXED_TIMELINE_OVERHEAD = 2 * WAVEFORM_HEIGHT + TIME_AXIS_HEIGHT + 3 * SECTION_GAP;

// =============================================================================
// MOCK DATA GENERATION
// =============================================================================

const SAMPLE_USER_REQUESTS = [
  'Help me refactor this React component to use hooks instead of class components',
  'Write unit tests for the authentication module',
  'Review this pull request for security vulnerabilities',
  "Optimize the database query that's causing slow page loads",
  'Create API documentation for the user service endpoints',
  'Debug why the payment integration is failing intermittently',
  'Set up CI/CD pipeline for the new microservice',
  'Analyze the codebase architecture and suggest improvements',
  'Implement rate limiting for the public API',
  'Fix the memory leak in the WebSocket connection handler',
  'Create a dashboard component showing real-time metrics',
  'Review and improve error handling across the application',
  'Migrate the legacy codebase to TypeScript',
  'Set up monitoring and alerting for production services',
  'Optimize frontend bundle size and loading performance',
];

const ROUTING_STRATEGIES = [
  'semantic_similarity',
  'capability_match',
  'load_balanced',
  'specialized_routing',
  'hybrid_analysis',
];

const REASONING_TEMPLATES = [
  'Selected {agent} due to strong capability match for {task_type} tasks. Confidence boosted by recent successful completions.',
  'Routing to {agent} based on semantic analysis of request keywords matching agent specialization.',
  '{agent} chosen for optimal load distribution while maintaining high task completion probability.',
  'Specialized routing: {agent} has demonstrated expertise in similar {task_type} scenarios.',
  'Hybrid analysis selected {agent} combining keyword matching and historical performance data.',
];

function generateMockDecisions(startTime: number, endTime: number): RoutingDecision[] {
  const decisions: RoutingDecision[] = [];
  let lastAgent = AGENTS[0];
  const avgInterval = 10 * 1000;
  let currentTime = startTime;
  let decisionIndex = 0;

  while (currentTime < endTime) {
    const interval = avgInterval * (0.5 + Math.random());
    currentTime += interval;
    if (currentTime >= endTime) break;

    const switchAgent = Math.random() > 0.7;
    const agent = switchAgent ? AGENTS[Math.floor(Math.random() * AGENTS.length)] : lastAgent;
    lastAgent = agent;

    const confidence = 60 + Math.random() * 40;
    const userRequest = SAMPLE_USER_REQUESTS[decisionIndex % SAMPLE_USER_REQUESTS.length];
    const routingStrategy =
      ROUTING_STRATEGIES[Math.floor(Math.random() * ROUTING_STRATEGIES.length)];

    const numAlternatives = Math.floor(Math.random() * 4);
    const alternatives: Array<{ agent: string; confidence: number }> = [];
    const usedAgents = new Set([agent]);
    for (let i = 0; i < numAlternatives; i++) {
      let altAgent = AGENTS[Math.floor(Math.random() * AGENTS.length)];
      while (usedAgents.has(altAgent)) {
        altAgent = AGENTS[Math.floor(Math.random() * AGENTS.length)];
      }
      usedAgents.add(altAgent);
      alternatives.push({
        agent: altAgent,
        confidence: Math.max(0.3, confidence / 100 - 0.05 - Math.random() * 0.2),
      });
    }
    alternatives.sort((a, b) => b.confidence - a.confidence);

    const taskType = agent.replace('agent-', '').replace(/-/g, ' ');
    const reasoningTemplate =
      REASONING_TEMPLATES[Math.floor(Math.random() * REASONING_TEMPLATES.length)];
    const reasoning = reasoningTemplate
      .replace(/{agent}/g, agent)
      .replace(/{task_type}/g, taskType);

    decisions.push({
      timestamp: currentTime,
      agent,
      confidence,
      routingTimeMs: 30 + Math.random() * 100,
      id: `decision-${decisionIndex}-${Date.now()}`,
      correlationId: `corr-${Math.random().toString(36).substring(2, 10)}`,
      userRequest,
      routingStrategy,
      alternatives,
      reasoning,
    });

    decisionIndex++;
  }

  return decisions;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function computeViewport(timelineState: TimelineState, canvasWidth: number): TimelineViewport {
  const rollWidth = canvasWidth - LABEL_WIDTH;
  return {
    startTime: timelineState.viewportStart,
    endTime: timelineState.viewportStart + timelineState.visibleDuration,
    msPerPixel: timelineState.visibleDuration / rollWidth,
  };
}

function timeToX(timestamp: number, viewport: TimelineViewport, rollWidth: number): number {
  const fraction = (timestamp - viewport.startTime) / (viewport.endTime - viewport.startTime);
  return LABEL_WIDTH + fraction * rollWidth;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

function getValueColor(t: number): string {
  const clampedT = Math.max(0, Math.min(1, t));
  const r = Math.round(34 + (249 - 34) * clampedT);
  const g = Math.round(197 + (115 - 197) * clampedT);
  const b = Math.round(94 + (22 - 94) * clampedT);
  return `rgb(${r}, ${g}, ${b})`;
}

function getValueColorWithAlpha(t: number, alpha: number): string {
  const clampedT = Math.max(0, Math.min(1, t));
  const r = Math.round(34 + (249 - 34) * clampedT);
  const g = Math.round(197 + (115 - 197) * clampedT);
  const b = Math.round(94 + (22 - 94) * clampedT);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// =============================================================================
// TIMELINE CANVAS COMPONENT
// =============================================================================

interface TimelineCanvasProps {
  decisions: RoutingDecision[];
  agents: string[];
  viewport: TimelineViewport;
  availableHeight: number;
  onPan: (deltaMs: number) => void;
  onZoom: (factor: number, centerX: number) => void;
  onDecisionClick: (decision: RoutingDecision) => void;
}

function TimelineCanvas({
  decisions,
  agents,
  viewport,
  availableHeight,
  onPan,
  onZoom,
  onDecisionClick,
}: TimelineCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(800);
  const [agentScrollOffset, setAgentScrollOffset] = useState(0);
  const isDragging = useRef(false);
  const lastX = useRef(0);
  const lastY = useRef(0);
  const dragStartedInPianoRoll = useRef(false);
  const hasMoved = useRef(false);
  const mouseDownPos = useRef({ x: 0, y: 0 });

  const pianoRollFullHeight = agents.length * LANE_HEIGHT;
  const maxPianoRollHeight = Math.max(
    MIN_PIANO_ROLL_HEIGHT,
    availableHeight - FIXED_TIMELINE_OVERHEAD
  );
  const pianoRollClippedHeight = Math.min(maxPianoRollHeight, pianoRollFullHeight);
  const maxAgentScroll = Math.max(0, pianoRollFullHeight - pianoRollClippedHeight);

  const pianoRollY = 0;
  const waveform1Y = pianoRollClippedHeight + SECTION_GAP;
  const waveform2Y = waveform1Y + WAVEFORM_HEIGHT + SECTION_GAP;
  const timeAxisY = waveform2Y + WAVEFORM_HEIGHT + SECTION_GAP;
  const totalHeight = timeAxisY + TIME_AXIS_HEIGHT;

  const rollWidth = canvasWidth - LABEL_WIDTH;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setCanvasWidth(entry.contentRect.width);
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      isDragging.current = true;
      lastX.current = e.clientX;
      lastY.current = e.clientY;
      dragStartedInPianoRoll.current = mouseY < pianoRollClippedHeight;
      hasMoved.current = false;
      mouseDownPos.current = { x: mouseX, y: mouseY };
      if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
    },
    [pianoRollClippedHeight]
  );

  const isOverDecisionBlock = useCallback(
    (mouseX: number, mouseY: number): boolean => {
      if (mouseY >= pianoRollClippedHeight || mouseX < LABEL_WIDTH) return false;

      const laneIndex = Math.floor((mouseY + agentScrollOffset) / LANE_HEIGHT);
      const hoverTime = viewport.startTime + (mouseX - LABEL_WIDTH) * viewport.msPerPixel;
      const blockDuration = 5000;

      for (const decision of decisions) {
        const agentIndex = agents.indexOf(decision.agent);
        if (agentIndex !== laneIndex) continue;
        if (hoverTime >= decision.timestamp && hoverTime <= decision.timestamp + blockDuration) {
          return true;
        }
      }
      return false;
    },
    [pianoRollClippedHeight, agentScrollOffset, viewport, decisions, agents]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      if (isDragging.current) {
        const deltaX = e.clientX - lastX.current;
        const deltaY = e.clientY - lastY.current;
        lastX.current = e.clientX;
        lastY.current = e.clientY;

        if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
          hasMoved.current = true;
        }

        if (dragStartedInPianoRoll.current) {
          setAgentScrollOffset((prev) => {
            const newOffset = prev - deltaY;
            return Math.max(0, Math.min(maxAgentScroll, newOffset));
          });
        }

        const deltaMs = -deltaX * viewport.msPerPixel;
        onPan(deltaMs);
      } else {
        if (canvasRef.current) {
          if (isOverDecisionBlock(mouseX, mouseY)) {
            canvasRef.current.style.cursor = 'pointer';
          } else {
            canvasRef.current.style.cursor = 'grab';
          }
        }
      }
    },
    [onPan, viewport.msPerPixel, maxAgentScroll, isOverDecisionBlock]
  );

  const handleMouseUp = useCallback(
    (_e: React.MouseEvent) => {
      isDragging.current = false;
      if (canvasRef.current) canvasRef.current.style.cursor = 'grab';

      if (!hasMoved.current) {
        const { x: clickX, y: clickY } = mouseDownPos.current;

        if (clickY < pianoRollClippedHeight && clickX >= LABEL_WIDTH) {
          const laneIndex = Math.floor((clickY + agentScrollOffset) / LANE_HEIGHT);
          const clickTime = viewport.startTime + (clickX - LABEL_WIDTH) * viewport.msPerPixel;

          for (const decision of decisions) {
            const agentIndex = agents.indexOf(decision.agent);
            if (agentIndex !== laneIndex) continue;

            const blockDuration = 5000;
            if (
              clickTime >= decision.timestamp &&
              clickTime <= decision.timestamp + blockDuration
            ) {
              onDecisionClick(decision);
              break;
            }
          }
        }
      }
    },
    [pianoRollClippedHeight, agentScrollOffset, viewport, decisions, agents, onDecisionClick]
  );

  const handleMouseLeave = useCallback((_e: React.MouseEvent) => {
    if (isDragging.current) {
      isDragging.current = false;
      if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
    }
  }, []);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      if (mouseY < pianoRollClippedHeight) {
        setAgentScrollOffset((prev) => {
          const newOffset = prev + e.deltaY;
          return Math.max(0, Math.min(maxAgentScroll, newOffset));
        });
        return;
      }

      if (mouseY >= waveform1Y && mouseY < timeAxisY) {
        const centerX = mouseX - LABEL_WIDTH;
        const zoomFactor = e.deltaY > 0 ? 1.15 : 0.87;
        onZoom(zoomFactor, centerX);
      }
    },
    [onZoom, pianoRollClippedHeight, maxAgentScroll, waveform1Y, timeAxisY]
  );

  // Canvas rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasWidth * dpr;
    canvas.height = totalHeight * dpr;
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${totalHeight}px`;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvasWidth, totalHeight);

    // Vertical grid lines
    const duration = viewport.endTime - viewport.startTime;
    let gridInterval: number;
    if (duration <= 2 * MINUTE) gridInterval = 10 * 1000;
    else if (duration <= 10 * MINUTE) gridInterval = MINUTE;
    else if (duration <= HOUR) gridInterval = 5 * MINUTE;
    else if (duration <= 6 * HOUR) gridInterval = 30 * MINUTE;
    else gridInterval = HOUR;

    const firstTick = Math.ceil(viewport.startTime / gridInterval) * gridInterval;

    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;
    for (let t = firstTick; t <= viewport.endTime; t += gridInterval) {
      const x = timeToX(t, viewport, rollWidth);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, totalHeight - TIME_AXIS_HEIGHT);
      ctx.stroke();
    }

    // Piano roll section
    ctx.fillStyle = '#0f0f0f';
    ctx.fillRect(0, pianoRollY, LABEL_WIDTH, pianoRollClippedHeight);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, pianoRollY, canvasWidth, pianoRollClippedHeight);
    ctx.clip();

    agents.forEach((agent, laneIndex) => {
      const y = pianoRollY + laneIndex * LANE_HEIGHT - agentScrollOffset;

      if (y + LANE_HEIGHT < pianoRollY || y > pianoRollY + pianoRollClippedHeight) return;

      ctx.fillStyle = laneIndex % 2 === 0 ? '#0a0a0a' : '#0d0d0d';
      ctx.fillRect(LABEL_WIDTH, y, rollWidth, LANE_HEIGHT);

      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y + LANE_HEIGHT);
      ctx.lineTo(canvasWidth, y + LANE_HEIGHT);
      ctx.stroke();

      ctx.fillStyle = '#0f0f0f';
      ctx.fillRect(0, y, LABEL_WIDTH, LANE_HEIGHT);
      ctx.fillStyle = '#888';
      ctx.font = '11px Inter, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(agent.replace('agent-', ''), 8, y + LANE_HEIGHT / 2 + 4);
    });

    decisions.forEach((decision) => {
      if (decision.timestamp < viewport.startTime || decision.timestamp > viewport.endTime) return;

      const agentIndex = agents.indexOf(decision.agent);
      if (agentIndex === -1) return;

      const y = pianoRollY + agentIndex * LANE_HEIGHT - agentScrollOffset;

      if (y + LANE_HEIGHT < pianoRollY || y > pianoRollY + pianoRollClippedHeight) return;

      const x = timeToX(decision.timestamp, viewport, rollWidth);
      const blockY = y + 4;
      const blockDuration = 5000;
      const blockWidth = Math.max(blockDuration / viewport.msPerPixel, 4);
      const blockHeight = LANE_HEIGHT - 8;

      ctx.fillStyle = '#a1a1aa';
      ctx.fillRect(x, blockY, blockWidth, blockHeight);
    });

    ctx.restore();

    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(LABEL_WIDTH, pianoRollY);
    ctx.lineTo(LABEL_WIDTH, pianoRollY + pianoRollClippedHeight);
    ctx.stroke();

    ctx.strokeStyle = '#2a2a2a';
    ctx.beginPath();
    ctx.moveTo(0, pianoRollY + pianoRollClippedHeight);
    ctx.lineTo(canvasWidth, pianoRollY + pianoRollClippedHeight);
    ctx.stroke();

    if (maxAgentScroll > 0) {
      const scrollbarHeight =
        (pianoRollClippedHeight / pianoRollFullHeight) * pianoRollClippedHeight;
      const scrollbarY =
        pianoRollY +
        (agentScrollOffset / maxAgentScroll) * (pianoRollClippedHeight - scrollbarHeight);
      ctx.fillStyle = '#3f3f46';
      ctx.fillRect(LABEL_WIDTH - 6, scrollbarY, 4, scrollbarHeight);
    }

    // Waveform 1: Routing Time
    ctx.fillStyle = '#0f0f0f';
    ctx.fillRect(0, waveform1Y, LABEL_WIDTH, WAVEFORM_HEIGHT);
    ctx.fillStyle = '#888';
    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Routing Time (ms)', 8, waveform1Y + 16);

    ctx.strokeStyle = '#1a1a1a';
    for (let i = 0; i <= 4; i++) {
      const y = waveform1Y + (WAVEFORM_HEIGHT / 4) * i;
      ctx.beginPath();
      ctx.moveTo(LABEL_WIDTH, y);
      ctx.lineTo(canvasWidth, y);
      ctx.stroke();
    }

    const routingTimeMax = 150;
    const routingTimeGood = 50;
    const routingTimeBad = 120;
    const visibleDecisions = decisions.filter(
      (d) => d.timestamp >= viewport.startTime && d.timestamp <= viewport.endTime
    );

    if (visibleDecisions.length > 0) {
      let lastX = LABEL_WIDTH;
      let lastY = waveform1Y + WAVEFORM_HEIGHT;
      let lastValue = visibleDecisions[0].routingTimeMs;

      visibleDecisions.forEach((decision, i) => {
        const x = timeToX(decision.timestamp, viewport, rollWidth);
        const y =
          waveform1Y +
          WAVEFORM_HEIGHT -
          (decision.routingTimeMs / routingTimeMax) * WAVEFORM_HEIGHT * 0.9;

        const segmentValue = i === 0 ? decision.routingTimeMs : lastValue;
        const t = Math.max(
          0,
          Math.min(1, (segmentValue - routingTimeGood) / (routingTimeBad - routingTimeGood))
        );
        const color = getValueColor(t);
        const colorAlpha = getValueColorWithAlpha(t, 0.15);

        const segmentY = i === 0 ? y : lastY;
        ctx.fillStyle = colorAlpha;
        ctx.fillRect(lastX, segmentY, x - lastX, waveform1Y + WAVEFORM_HEIGHT - segmentY);

        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(lastX, i === 0 ? y : lastY);
        ctx.lineTo(x, i === 0 ? y : lastY);
        ctx.stroke();

        if (i > 0) {
          const newT = Math.max(
            0,
            Math.min(
              1,
              (decision.routingTimeMs - routingTimeGood) / (routingTimeBad - routingTimeGood)
            )
          );
          ctx.strokeStyle = getValueColor(newT);
          ctx.beginPath();
          ctx.moveTo(x, lastY);
          ctx.lineTo(x, y);
          ctx.stroke();
        }

        lastX = x;
        lastY = y;
        lastValue = decision.routingTimeMs;
      });

      const lastT = Math.max(
        0,
        Math.min(1, (lastValue - routingTimeGood) / (routingTimeBad - routingTimeGood))
      );
      const lastColor = getValueColor(lastT);
      const lastColorAlpha = getValueColorWithAlpha(lastT, 0.15);

      ctx.fillStyle = lastColorAlpha;
      ctx.fillRect(lastX, lastY, canvasWidth - lastX, waveform1Y + WAVEFORM_HEIGHT - lastY);

      ctx.strokeStyle = lastColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(canvasWidth, lastY);
      ctx.stroke();
    }

    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(LABEL_WIDTH, waveform1Y);
    ctx.lineTo(LABEL_WIDTH, waveform1Y + WAVEFORM_HEIGHT);
    ctx.stroke();

    // Waveform 2: Confidence
    ctx.fillStyle = '#0f0f0f';
    ctx.fillRect(0, waveform2Y, LABEL_WIDTH, WAVEFORM_HEIGHT);
    ctx.fillStyle = '#888';
    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Confidence %', 8, waveform2Y + 16);

    ctx.strokeStyle = '#1a1a1a';
    for (let i = 0; i <= 4; i++) {
      const y = waveform2Y + (WAVEFORM_HEIGHT / 4) * i;
      ctx.beginPath();
      ctx.moveTo(LABEL_WIDTH, y);
      ctx.lineTo(canvasWidth, y);
      ctx.stroke();
    }

    const confidenceMax = 100;
    const confidenceGood = 85;
    const confidenceBad = 70;

    if (visibleDecisions.length > 0) {
      let lastX = LABEL_WIDTH;
      let lastY = waveform2Y + WAVEFORM_HEIGHT;
      let lastValue = visibleDecisions[0].confidence;

      visibleDecisions.forEach((decision, i) => {
        const x = timeToX(decision.timestamp, viewport, rollWidth);
        const y =
          waveform2Y +
          WAVEFORM_HEIGHT -
          (decision.confidence / confidenceMax) * WAVEFORM_HEIGHT * 0.9;

        const segmentValue = i === 0 ? decision.confidence : lastValue;
        const t = Math.max(
          0,
          Math.min(1, (confidenceGood - segmentValue) / (confidenceGood - confidenceBad))
        );
        const color = getValueColor(t);
        const colorAlpha = getValueColorWithAlpha(t, 0.15);

        const segmentY = i === 0 ? y : lastY;
        ctx.fillStyle = colorAlpha;
        ctx.fillRect(lastX, segmentY, x - lastX, waveform2Y + WAVEFORM_HEIGHT - segmentY);

        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(lastX, i === 0 ? y : lastY);
        ctx.lineTo(x, i === 0 ? y : lastY);
        ctx.stroke();

        if (i > 0) {
          const newT = Math.max(
            0,
            Math.min(1, (confidenceGood - decision.confidence) / (confidenceGood - confidenceBad))
          );
          ctx.strokeStyle = getValueColor(newT);
          ctx.beginPath();
          ctx.moveTo(x, lastY);
          ctx.lineTo(x, y);
          ctx.stroke();
        }

        lastX = x;
        lastY = y;
        lastValue = decision.confidence;
      });

      const lastT = Math.max(
        0,
        Math.min(1, (confidenceGood - lastValue) / (confidenceGood - confidenceBad))
      );
      const lastColor = getValueColor(lastT);
      const lastColorAlpha = getValueColorWithAlpha(lastT, 0.15);

      ctx.fillStyle = lastColorAlpha;
      ctx.fillRect(lastX, lastY, canvasWidth - lastX, waveform2Y + WAVEFORM_HEIGHT - lastY);

      ctx.strokeStyle = lastColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(canvasWidth, lastY);
      ctx.stroke();
    }

    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(LABEL_WIDTH, waveform2Y);
    ctx.lineTo(LABEL_WIDTH, waveform2Y + WAVEFORM_HEIGHT);
    ctx.stroke();

    // Time axis
    ctx.fillStyle = '#0f0f0f';
    ctx.fillRect(0, timeAxisY, canvasWidth, TIME_AXIS_HEIGHT);

    ctx.fillStyle = '#888';
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';

    for (let t = firstTick; t <= viewport.endTime; t += gridInterval) {
      const x = timeToX(t, viewport, rollWidth);
      ctx.fillText(formatTime(t), x, timeAxisY + 16);
    }
  }, [
    canvasWidth,
    totalHeight,
    viewport,
    decisions,
    agents,
    agentScrollOffset,
    pianoRollClippedHeight,
    pianoRollFullHeight,
    maxAgentScroll,
    rollWidth,
    waveform1Y,
    waveform2Y,
    timeAxisY,
  ]);

  return (
    <div ref={containerRef} className="w-full">
      <canvas
        ref={canvasRef}
        className="w-full cursor-grab rounded"
        style={{ height: `${totalHeight}px` }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
      />
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export interface RoutingTimelineViewProps {
  dataStartTime: number;
  dataEndTime: number;
  visibleDuration: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
}

export function RoutingTimelineView({ dataStartTime, dataEndTime }: RoutingTimelineViewProps) {
  const decisions = useMemo(
    () => generateMockDecisions(dataStartTime, dataEndTime),
    [dataStartTime, dataEndTime]
  );

  const [timeline, setTimeline] = useState<TimelineState>(() => ({
    viewportStart: dataEndTime - DEFAULT_VISIBLE_DURATION,
    visibleDuration: DEFAULT_VISIBLE_DURATION,
  }));

  // Reset timeline position when data boundaries change (e.g., switching dates)
  useEffect(() => {
    setTimeline({
      viewportStart: dataEndTime - DEFAULT_VISIBLE_DURATION,
      visibleDuration: DEFAULT_VISIBLE_DURATION,
    });
  }, [dataStartTime, dataEndTime]);

  const [selectedDecision, setSelectedDecision] = useState<RoutingDecision | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleDecisionClick = useCallback((decision: RoutingDecision) => {
    setSelectedDecision(decision);
    setIsModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  const modalDecision: ModalRoutingDecision | null = useMemo(() => {
    if (!selectedDecision) return null;
    return {
      id: selectedDecision.id,
      correlationId: selectedDecision.correlationId,
      userRequest: selectedDecision.userRequest,
      selectedAgent: selectedDecision.agent,
      confidenceScore: selectedDecision.confidence / 100,
      routingStrategy: selectedDecision.routingStrategy,
      alternatives: selectedDecision.alternatives,
      reasoning: selectedDecision.reasoning,
      routingTimeMs: selectedDecision.routingTimeMs,
      createdAt: new Date(selectedDecision.timestamp).toISOString(),
    };
  }, [selectedDecision]);

  const [canvasWidth, setCanvasWidth] = useState(800);
  const [availableHeight, setAvailableHeight] = useState(500);
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateDimensions = () => {
      const containerRect = container.getBoundingClientRect();
      setCanvasWidth(containerRect.width - 48);

      const windowHeight = window.innerHeight;
      const cardTop = cardRef.current?.getBoundingClientRect().top || 0;
      const availableFromCard = windowHeight - cardTop - 40;
      const calculatedHeight = Math.max(300, availableFromCard);
      setAvailableHeight(calculatedHeight);
    };

    updateDimensions();

    const resizeObserver = new ResizeObserver(updateDimensions);
    resizeObserver.observe(container);

    window.addEventListener('resize', updateDimensions);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateDimensions);
    };
  }, []);

  const viewport = useMemo(() => computeViewport(timeline, canvasWidth), [timeline, canvasWidth]);

  const handlePan = useCallback(
    (deltaMs: number) => {
      setTimeline((prev) => {
        let newStart = prev.viewportStart + deltaMs;

        // Clamp to data boundaries
        // Don't allow scrolling past the end (into the future)
        const maxStart = dataEndTime - prev.visibleDuration;
        // Don't allow scrolling before the start
        const minStart = dataStartTime;

        newStart = Math.max(minStart, Math.min(maxStart, newStart));

        return {
          ...prev,
          viewportStart: newStart,
        };
      });
    },
    [dataStartTime, dataEndTime]
  );

  const handleZoom = useCallback(
    (factor: number, centerX: number) => {
      setTimeline((prev) => {
        const rollWidth = canvasWidth - LABEL_WIDTH;
        const newDuration = Math.max(
          MIN_VISIBLE_DURATION,
          Math.min(MAX_VISIBLE_DURATION, prev.visibleDuration * factor)
        );

        const centerRatio = centerX / rollWidth;
        const oldCenterTime = prev.viewportStart + prev.visibleDuration * centerRatio;
        let newViewportStart = oldCenterTime - newDuration * centerRatio;

        // Clamp to data boundaries after zoom
        const maxStart = dataEndTime - newDuration;
        const minStart = dataStartTime;
        newViewportStart = Math.max(minStart, Math.min(maxStart, newViewportStart));

        return {
          viewportStart: newViewportStart,
          visibleDuration: newDuration,
        };
      });
    },
    [canvasWidth, dataStartTime, dataEndTime]
  );

  return (
    <div ref={containerRef}>
      <Card ref={cardRef}>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Route className="h-4 w-4" />
            Agent Routing Timeline
            <span className="text-xs text-muted-foreground font-normal ml-2">
              (click decision to view details • drag to pan • scroll wheel zooms)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TimelineCanvas
            decisions={decisions}
            agents={AGENTS}
            viewport={viewport}
            availableHeight={availableHeight}
            onPan={handlePan}
            onZoom={handleZoom}
            onDecisionClick={handleDecisionClick}
          />
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

export function formatDuration(ms: number): string {
  const MINUTE = 60 * 1000;
  const HOUR = 60 * MINUTE;
  if (ms < MINUTE) return `${Math.round(ms / 1000)}s`;
  if (ms < HOUR) return `${Math.round(ms / MINUTE)}m`;
  return `${(ms / HOUR).toFixed(1)}h`;
}
