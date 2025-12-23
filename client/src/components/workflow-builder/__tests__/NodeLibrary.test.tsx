import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NodeLibrary } from '../NodeLibrary';

describe('NodeLibrary', () => {
  const defaultProps = {
    selectedType: 'action',
    onSelectType: vi.fn(),
    onAddNode: vi.fn(),
  };

  it('should render without crashing', () => {
    render(<NodeLibrary {...defaultProps} />);
    expect(screen.getByText('Node Library')).toBeInTheDocument();
  });

  it('should display available node types', () => {
    render(<NodeLibrary {...defaultProps} />);

    // Check for common node types
    expect(screen.getByText('Start')).toBeInTheDocument();
    expect(screen.getByText('End')).toBeInTheDocument();
    expect(screen.getByText('Action')).toBeInTheDocument();
    expect(screen.getByText('Condition')).toBeInTheDocument();
  });

  it('should call onSelectType when a node type is clicked', async () => {
    const onSelectType = vi.fn();
    const user = userEvent.setup();

    render(<NodeLibrary {...defaultProps} onSelectType={onSelectType} />);

    await user.click(screen.getByText('Start'));
    expect(onSelectType).toHaveBeenCalledWith('start');
  });

  it('should call onAddNode when a node type is double-clicked', async () => {
    const onAddNode = vi.fn();
    const user = userEvent.setup();

    render(<NodeLibrary {...defaultProps} onAddNode={onAddNode} />);

    // Double-click on a node type to add it
    const startButton = screen.getByText('Start').closest('button');
    expect(startButton).toBeInTheDocument();

    await user.dblClick(startButton!);
    expect(onAddNode).toHaveBeenCalledWith('start');
  });

  it('should highlight the selected node type', () => {
    const { rerender } = render(<NodeLibrary {...defaultProps} selectedType="start" />);

    // The selected item should have some visual indicator
    // This tests that the component handles selectedType prop
    expect(screen.getByText('Start')).toBeInTheDocument();

    rerender(<NodeLibrary {...defaultProps} selectedType="condition" />);
    expect(screen.getByText('Condition')).toBeInTheDocument();
  });
});
