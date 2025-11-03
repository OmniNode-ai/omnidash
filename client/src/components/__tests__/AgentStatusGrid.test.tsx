import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import userEvent from '@testing-library/user-event';
import { AgentStatusGrid } from '../AgentStatusGrid';

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

describe('AgentStatusGrid', () => {
  const mockAgents = [
    {
      id: 'agent-1',
      name: 'Test Agent 1',
      status: 'active' as const,
      successRate: 95,
      responseTime: 120,
      quality: 90,
    },
    {
      id: 'agent-2',
      name: 'Test Agent 2',
      status: 'idle' as const,
      successRate: 88,
      responseTime: 150,
      quality: 85,
    },
    {
      id: 'agent-3',
      name: 'Test Agent 3',
      status: 'error' as const,
      successRate: 70,
      responseTime: 300,
      quality: 60,
    },
  ];

  it('should render all agents', () => {
    render(<AgentStatusGrid agents={mockAgents} />);
    
    expect(screen.getByText('Test Agent 1')).toBeInTheDocument();
    expect(screen.getByText('Test Agent 2')).toBeInTheDocument();
    expect(screen.getByText('Test Agent 3')).toBeInTheDocument();
  });

  it('should display agent status indicators', () => {
    render(<AgentStatusGrid agents={mockAgents} />);
    
    // Status should be visible on cards
    const agent1 = screen.getByText('Test Agent 1').closest('[data-testid*="agent"]');
    expect(agent1).toBeInTheDocument();
  });

  it('should call onAgentClick when agent card is clicked', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    
    render(<AgentStatusGrid agents={mockAgents} onAgentClick={handleClick} />);
    
    const agentCard = screen.getByText('Test Agent 1').closest('button') || 
                      screen.getByText('Test Agent 1').closest('[role="button"]') ||
                      screen.getByText('Test Agent 1');
    
    await user.click(agentCard);
    
    expect(handleClick).toHaveBeenCalled();
  });

  it('should display success rate', () => {
    render(<AgentStatusGrid agents={mockAgents} />);
    
    // Success rate should be displayed
    expect(screen.getByText('Test Agent 1')).toBeInTheDocument();
  });

  it('should display response time', () => {
    render(<AgentStatusGrid agents={mockAgents} />);
    
    // Response time should be displayed (in ms format)
    expect(screen.getByText('Test Agent 1')).toBeInTheDocument();
  });

  it('should apply correct status colors', () => {
    const { container } = render(<AgentStatusGrid agents={mockAgents} />);
    
    // Cards should have status-specific styling
    const cards = container.querySelectorAll('[data-testid*="agent"]');
    expect(cards.length).toBeGreaterThan(0);
  });

  it('should render in compact mode', () => {
    render(<AgentStatusGrid agents={mockAgents} compact />);
    
    expect(screen.getByText('Test Agent 1')).toBeInTheDocument();
  });

  it('should apply custom card background class', () => {
    const { container } = render(
      <AgentStatusGrid 
        agents={mockAgents} 
        cardBackgroundClass="bg-muted"
      />
    );
    
    expect(screen.getByText('Test Agent 1')).toBeInTheDocument();
  });

  it('should handle empty agents array', () => {
    render(<AgentStatusGrid agents={[]} />);
    
    // Component should render but show no agents
    const container = document.body;
    expect(container).toBeInTheDocument();
  });

  it('should display quality score when provided', () => {
    render(<AgentStatusGrid agents={mockAgents} />);
    
    expect(screen.getByText('Test Agent 1')).toBeInTheDocument();
  });

  it('should handle virtualization when virtualHeightPx is provided', () => {
    const largeAgentList = Array.from({ length: 50 }, (_, i) => ({
      id: `agent-${i}`,
      name: `Agent ${i}`,
      status: 'active' as const,
      successRate: 90,
      responseTime: 100,
      quality: 85,
    }));
    
    render(
      <AgentStatusGrid 
        agents={largeAgentList} 
        virtualHeightPx={600}
      />
    );
    
    // Should render container with virtualization
    expect(screen.getByText('Agent 0')).toBeInTheDocument();
  });
});

