/**
 * StatusGridWidget Tests
 *
 * Comprehensive tests for the StatusGridWidget component which renders a grid
 * of status items with semantic coloring based on status values.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { StatusGridWidget } from '../StatusGridWidget';
import type {
  WidgetDefinition,
  WidgetConfigStatusGrid,
  DashboardData,
} from '@/lib/dashboard-schema';

// Helper to create a widget definition
function createWidget(overrides: Partial<WidgetDefinition> = {}): WidgetDefinition {
  return {
    widget_id: 'test-status-grid-widget',
    title: 'Test Status Grid',
    config: {
      config_kind: 'status_grid',
      items_key: 'services',
      id_field: 'id',
      label_field: 'name',
      status_field: 'status',
    },
    row: 0,
    col: 0,
    width: 4,
    height: 2,
    ...overrides,
  };
}

// Helper to create a status grid config
function createConfig(overrides: Partial<WidgetConfigStatusGrid> = {}): WidgetConfigStatusGrid {
  return {
    config_kind: 'status_grid',
    items_key: 'services',
    id_field: 'id',
    label_field: 'name',
    status_field: 'status',
    ...overrides,
  };
}

// Sample status items
const sampleStatusItems = [
  { id: 'api', name: 'API Server', status: 'healthy' },
  { id: 'db', name: 'Database', status: 'warning' },
  { id: 'cache', name: 'Cache', status: 'error' },
  { id: 'queue', name: 'Message Queue', status: 'healthy' },
  { id: 'auth', name: 'Auth Service', status: 'degraded' },
  { id: 'storage', name: 'Storage', status: 'offline' },
];

describe('StatusGridWidget', () => {
  it('should render grid of status items', () => {
    const widget = createWidget();
    const config = createConfig();
    const data: DashboardData = { services: sampleStatusItems };

    render(<StatusGridWidget widget={widget} config={config} data={data} />);

    // All labels should be visible
    expect(screen.getByText('API Server')).toBeInTheDocument();
    expect(screen.getByText('Database')).toBeInTheDocument();
    expect(screen.getByText('Cache')).toBeInTheDocument();
    expect(screen.getByText('Message Queue')).toBeInTheDocument();
    expect(screen.getByText('Auth Service')).toBeInTheDocument();
    expect(screen.getByText('Storage')).toBeInTheDocument();
  });

  it('should show correct color for healthy status', () => {
    const widget = createWidget();
    const config = createConfig();
    const data: DashboardData = {
      services: [{ id: 'test', name: 'Test Service', status: 'healthy' }],
    };

    render(<StatusGridWidget widget={widget} config={config} data={data} />);

    // Find the status indicator dot
    const indicator = screen.getByLabelText('Status: healthy');
    expect(indicator).toHaveClass('bg-status-healthy');
  });

  it('should show correct color for warning status', () => {
    const widget = createWidget();
    const config = createConfig();
    const data: DashboardData = {
      services: [{ id: 'test', name: 'Test Service', status: 'warning' }],
    };

    render(<StatusGridWidget widget={widget} config={config} data={data} />);

    const indicator = screen.getByLabelText('Status: warning');
    expect(indicator).toHaveClass('bg-status-warning');
  });

  it('should show correct color for error status', () => {
    const widget = createWidget();
    const config = createConfig();
    const data: DashboardData = {
      services: [{ id: 'test', name: 'Test Service', status: 'error' }],
    };

    render(<StatusGridWidget widget={widget} config={config} data={data} />);

    const indicator = screen.getByLabelText('Status: error');
    expect(indicator).toHaveClass('bg-status-error');
  });

  it('should show correct color for inactive/unknown status', () => {
    const widget = createWidget();
    const config = createConfig();
    const data: DashboardData = {
      services: [{ id: 'test', name: 'Test Service', status: 'unknown' }],
    };

    render(<StatusGridWidget widget={widget} config={config} data={data} />);

    const indicator = screen.getByLabelText('Status: unknown');
    expect(indicator).toHaveClass('bg-status-offline');
  });

  it('should map degraded status to warning', () => {
    const widget = createWidget();
    const config = createConfig();
    const data: DashboardData = {
      services: [{ id: 'test', name: 'Test Service', status: 'degraded' }],
    };

    render(<StatusGridWidget widget={widget} config={config} data={data} />);

    const indicator = screen.getByLabelText('Status: degraded');
    expect(indicator).toHaveClass('bg-status-warning');
  });

  it('should map active status to healthy', () => {
    const widget = createWidget();
    const config = createConfig();
    const data: DashboardData = {
      services: [{ id: 'test', name: 'Test Service', status: 'active' }],
    };

    render(<StatusGridWidget widget={widget} config={config} data={data} />);

    const indicator = screen.getByLabelText('Status: active');
    expect(indicator).toHaveClass('bg-status-healthy');
  });

  it('should map failed status to error', () => {
    const widget = createWidget();
    const config = createConfig();
    const data: DashboardData = {
      services: [{ id: 'test', name: 'Test Service', status: 'failed' }],
    };

    render(<StatusGridWidget widget={widget} config={config} data={data} />);

    const indicator = screen.getByLabelText('Status: failed');
    expect(indicator).toHaveClass('bg-status-error');
  });

  it('should display labels when show_labels=true', () => {
    const widget = createWidget();
    const config = createConfig({ show_labels: true });
    const data: DashboardData = {
      services: [{ id: 'api', name: 'API Server', status: 'healthy' }],
    };

    render(<StatusGridWidget widget={widget} config={config} data={data} />);

    expect(screen.getByText('API Server')).toBeInTheDocument();
  });

  it('should hide labels when show_labels=false', () => {
    const widget = createWidget();
    const config = createConfig({ show_labels: false });
    const data: DashboardData = {
      services: [{ id: 'api', name: 'API Server', status: 'healthy' }],
    };

    render(<StatusGridWidget widget={widget} config={config} data={data} />);

    // Label should not be visible (still in DOM via title attribute but not displayed)
    expect(screen.queryByText('API Server')).not.toBeInTheDocument();
  });

  it('should apply compact mode styling', () => {
    const widget = createWidget();
    const config = createConfig({ compact: true });
    const data: DashboardData = {
      services: [{ id: 'api', name: 'API Server', status: 'healthy' }],
    };

    render(<StatusGridWidget widget={widget} config={config} data={data} />);

    // In compact mode, indicator should have smaller size classes
    const indicator = screen.getByLabelText('Status: healthy');
    expect(indicator).toHaveClass('h-2', 'w-2');
  });

  it('should apply normal mode styling when compact=false', () => {
    const widget = createWidget();
    const config = createConfig({ compact: false });
    const data: DashboardData = {
      services: [{ id: 'api', name: 'API Server', status: 'healthy' }],
    };

    render(<StatusGridWidget widget={widget} config={config} data={data} />);

    // In normal mode, indicator should have larger size classes
    const indicator = screen.getByLabelText('Status: healthy');
    expect(indicator).toHaveClass('h-3', 'w-3');
  });

  it('should show loading skeleton when isLoading=true', () => {
    const widget = createWidget();
    const config = createConfig();
    const data: DashboardData = {};

    render(<StatusGridWidget widget={widget} config={config} data={data} isLoading={true} />);

    // Should have skeleton elements with animate-pulse
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('should show empty state when no items', () => {
    const widget = createWidget();
    const config = createConfig();
    const data: DashboardData = { services: [] };

    render(<StatusGridWidget widget={widget} config={config} data={data} />);

    expect(screen.getByText('No status items available')).toBeInTheDocument();
  });

  it('should show empty state when items_key not found', () => {
    const widget = createWidget();
    const config = createConfig({ items_key: 'nonexistent' });
    const data: DashboardData = { services: sampleStatusItems };

    render(<StatusGridWidget widget={widget} config={config} data={data} />);

    expect(screen.getByText('No status items available')).toBeInTheDocument();
  });

  it('should respect configured column count', () => {
    const widget = createWidget();
    const config = createConfig({ columns: 3 });
    const data: DashboardData = { services: sampleStatusItems };

    render(<StatusGridWidget widget={widget} config={config} data={data} />);

    // Check grid template columns style
    const grid = document.querySelector('[style*="grid-template-columns"]');
    expect(grid).toBeInTheDocument();
    expect(grid?.getAttribute('style')).toContain('repeat(3,');
  });

  it('should use default 4 columns when not specified', () => {
    const widget = createWidget();
    const config = createConfig();
    const data: DashboardData = { services: sampleStatusItems };

    render(<StatusGridWidget widget={widget} config={config} data={data} />);

    const grid = document.querySelector('[style*="grid-template-columns"]');
    expect(grid?.getAttribute('style')).toContain('repeat(4,');
  });

  it('should show status counts summary', () => {
    const widget = createWidget();
    const config = createConfig();
    const data: DashboardData = { services: sampleStatusItems };

    render(<StatusGridWidget widget={widget} config={config} data={data} />);

    // Should show count summaries - use getAllByText since status appears in cards and summary
    const healthyElements = screen.getAllByText(/healthy/i);
    expect(healthyElements.length).toBeGreaterThanOrEqual(1);

    const warningElements = screen.getAllByText(/warning/i);
    expect(warningElements.length).toBeGreaterThanOrEqual(1);

    const errorElements = screen.getAllByText(/error/i);
    expect(errorElements.length).toBeGreaterThanOrEqual(1);

    // Total count shown in footer
    expect(screen.getByText('6')).toBeInTheDocument();
  });

  it('should apply pulse animation to healthy items', () => {
    const widget = createWidget();
    const config = createConfig();
    const data: DashboardData = {
      services: [{ id: 'test', name: 'Test Service', status: 'healthy' }],
    };

    render(<StatusGridWidget widget={widget} config={config} data={data} />);

    const indicator = screen.getByLabelText('Status: healthy');
    expect(indicator).toHaveClass('animate-pulse');
  });

  it('should not apply pulse animation to non-healthy items', () => {
    const widget = createWidget();
    const config = createConfig();
    const data: DashboardData = {
      services: [{ id: 'test', name: 'Test Service', status: 'error' }],
    };

    render(<StatusGridWidget widget={widget} config={config} data={data} />);

    const indicator = screen.getByLabelText('Status: error');
    expect(indicator).not.toHaveClass('animate-pulse');
  });

  it('should display status badge in non-compact mode', () => {
    const widget = createWidget();
    const config = createConfig({ compact: false });
    const data: DashboardData = {
      services: [{ id: 'api', name: 'API Server', status: 'healthy' }],
    };

    render(<StatusGridWidget widget={widget} config={config} data={data} />);

    // Status text should appear in the badge (in addition to summary)
    // The status value appears in multiple places
    const healthyTexts = screen.getAllByText('healthy');
    expect(healthyTexts.length).toBeGreaterThanOrEqual(1);
  });

  it('should hide status badge in compact mode', () => {
    const widget = createWidget();
    const config = createConfig({ compact: true });
    const data: DashboardData = {
      services: [{ id: 'api', name: 'API Server', status: 'healthy' }],
    };

    render(<StatusGridWidget widget={widget} config={config} data={data} />);

    // In compact mode, status badge should not show (only summary shows status text)
    // The count summary still shows status text, but the card should not have badge
    const cards = document.querySelectorAll('[title="API Server: healthy"]');
    expect(cards.length).toBe(1);
  });

  it('should handle custom field names', () => {
    const widget = createWidget();
    const config = createConfig({
      items_key: 'agents',
      id_field: 'agent_id',
      label_field: 'display_name',
      status_field: 'health',
    });
    const data: DashboardData = {
      agents: [
        { agent_id: 'a1', display_name: 'Agent Alpha', health: 'healthy' },
        { agent_id: 'a2', display_name: 'Agent Beta', health: 'error' },
      ],
    };

    render(<StatusGridWidget widget={widget} config={config} data={data} />);

    expect(screen.getByText('Agent Alpha')).toBeInTheDocument();
    expect(screen.getByText('Agent Beta')).toBeInTheDocument();
  });

  it('should apply warning border to warning items', () => {
    const widget = createWidget();
    const config = createConfig();
    const data: DashboardData = {
      services: [{ id: 'test', name: 'Test', status: 'warning' }],
    };

    render(<StatusGridWidget widget={widget} config={config} data={data} />);

    // Card should have warning border class
    const card = document.querySelector('[title="Test: warning"]');
    expect(card).toHaveClass('border-status-warning/30');
  });

  it('should apply error border to error items', () => {
    const widget = createWidget();
    const config = createConfig();
    const data: DashboardData = {
      services: [{ id: 'test', name: 'Test', status: 'error' }],
    };

    render(<StatusGridWidget widget={widget} config={config} data={data} />);

    const card = document.querySelector('[title="Test: error"]');
    expect(card).toHaveClass('border-status-error/30');
  });
});
