export interface NodeSelectedEvent {
  nodeId: string;
  source: string;
}

export interface ExecutionSelectedEvent {
  correlationId: string;
  source: string;
}

export interface TimeRangeChangedEvent {
  start: string;
  end: string;
}

export interface FilterAppliedEvent {
  key: string;
  value: string | undefined;
  source: string;
}

export interface DrillDownEvent {
  entityId: string;
  targetComponent?: string;
  source: string;
}
