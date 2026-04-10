import mitt from 'mitt';
import type {
  NodeSelectedEvent,
  ExecutionSelectedEvent,
  TimeRangeChangedEvent,
  FilterAppliedEvent,
  DrillDownEvent,
} from './types';

export type DashboardEvents = {
  'component:node_selected': NodeSelectedEvent;
  'component:execution_selected': ExecutionSelectedEvent;
  'component:time_range_changed': TimeRangeChangedEvent;
  'component:filter_applied': FilterAppliedEvent;
  'component:drill_down': DrillDownEvent;
};

export const eventBus = mitt<DashboardEvents>();
