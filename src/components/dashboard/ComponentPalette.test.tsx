import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ComponentPalette } from './ComponentPalette';
import type { RegisteredComponent } from '@/registry/types';

const mockComponents: RegisteredComponent[] = [
  {
    name: 'cost-trend-panel',
    status: 'available',
    manifest: {
      name: 'cost-trend-panel',
      displayName: 'Cost Trend',
      description: 'LLM cost trends over time',
      category: 'metrics',
      version: '1.0.0',
      implementationKey: 'cost-trend/CostTrendPanel',
      configSchema: {},
      dataSources: [],
      events: { emits: [], consumes: [] },
      defaultSize: { w: 6, h: 4 },
      minSize: { w: 3, h: 2 },
      maxSize: { w: 12, h: 8 },
      emptyState: { message: 'No cost data' },
      capabilities: { supports_compare: false, supports_export: true, supports_fullscreen: true },
    },
  },
  {
    name: 'event-stream',
    status: 'not_implemented',
    manifest: {
      name: 'event-stream',
      displayName: 'Event Stream',
      description: 'Live Kafka events',
      category: 'stream',
      version: '1.0.0',
      implementationKey: 'event-stream/EventStream',
      configSchema: {},
      dataSources: [],
      events: { emits: [], consumes: [] },
      defaultSize: { w: 12, h: 6 },
      minSize: { w: 6, h: 3 },
      maxSize: { w: 12, h: 12 },
      emptyState: { message: 'No events' },
      capabilities: { supports_compare: false, supports_export: false, supports_fullscreen: true },
    },
  },
];

describe('ComponentPalette', () => {
  it('renders available components', () => {
    render(<ComponentPalette components={mockComponents} onAddComponent={() => {}} />);
    expect(screen.getByText('Cost Trend')).toBeInTheDocument();
  });

  it('shows not-implemented badge', () => {
    render(<ComponentPalette components={mockComponents} onAddComponent={() => {}} />);
    expect(screen.getByText(/not implemented/i)).toBeInTheDocument();
  });

  it('calls onAddComponent when clicking available component', async () => {
    const onAdd = vi.fn();
    render(<ComponentPalette components={mockComponents} onAddComponent={onAdd} />);
    await userEvent.click(screen.getByText('Cost Trend'));
    expect(onAdd).toHaveBeenCalledWith('cost-trend-panel');
  });

  it('does not call onAddComponent for not-implemented components', async () => {
    const onAdd = vi.fn();
    render(<ComponentPalette components={mockComponents} onAddComponent={onAdd} />);
    await userEvent.click(screen.getByText('Event Stream'));
    expect(onAdd).not.toHaveBeenCalled();
  });
});
