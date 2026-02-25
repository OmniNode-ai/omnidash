import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/contexts/DemoModeContext', () => ({
  useDemoMode: () => ({ isDemoMode: false }),
}));

vi.mock('@/components/MockDataBadge', () => ({
  MockDataBadge: ({ label }: { label?: string }) => (
    <span data-testid="mock-badge">{label ?? 'Mock Data'}</span>
  ),
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children?: any }) => <div data-testid="card">{children}</div>,
  CardHeader: ({ children }: { children?: any }) => <div>{children}</div>,
  CardTitle: ({ children }: { children?: any }) => <h2>{children}</h2>,
  CardDescription: ({ children }: { children?: any }) => <p>{children}</p>,
  CardContent: ({ children }: { children?: any }) => <div>{children}</div>,
  CardFooter: ({ children }: { children?: any }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: { children?: any }) => <span>{children}</span>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: { children?: any }) => <button {...props}>{children}</button>,
}));

vi.mock('@/components/ui/progress', () => ({
  Progress: (props: { value: number }) => <div data-testid={`progress-${props.value}`} />,
}));

vi.mock('@/components/ui/alert', () => ({
  Alert: ({ children }: { children?: any }) => <div>{children}</div>,
  AlertTitle: ({ children }: { children?: any }) => <strong>{children}</strong>,
  AlertDescription: ({ children }: { children?: any }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children?: any }) => <>{children}</>,
  Tooltip: ({ children }: { children?: any }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children?: any }) => <>{children}</>,
  TooltipContent: ({ children }: { children?: any }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/table', () => ({
  Table: ({ children }: { children?: any }) => <table>{children}</table>,
  TableBody: ({ children }: { children?: any }) => <tbody>{children}</tbody>,
  TableCell: ({ children }: { children?: any }) => <td>{children}</td>,
  TableHead: ({ children }: { children?: any }) => <thead>{children}</thead>,
  TableHeader: ({ children }: { children?: any }) => <tr>{children}</tr>,
  TableRow: ({ children }: { children?: any }) => <tr>{children}</tr>,
}));

vi.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children }: { children?: any }) => <div>{children}</div>,
  TabsList: ({ children }: { children?: any }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children?: any }) => <button type="button">{children}</button>,
  TabsContent: ({ children }: { children?: any }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children?: any }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children?: any }) => <button type="button">{children}</button>,
  SelectContent: ({ children }: { children?: any }) => <div>{children}</div>,
  SelectItem: ({ children }: { children?: any }) => <div>{children}</div>,
  SelectValue: () => <span>Select</span>,
}));

vi.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children }: { children?: any }) => <div>{children}</div>,
  AvatarImage: () => <img alt="avatar" />,
  AvatarFallback: ({ children }: { children?: any }) => <span>{children}</span>,
}));

vi.mock('@/components/ui/separator', () => ({
  Separator: () => <hr />,
}));

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children?: any }) => <div>{children}</div>,
}));

vi.mock('@/components/SavingsTooltip', () => ({
  SavingsTooltip: ({ children }: { children?: any }) => <>{children}</>,
}));

vi.mock('@/components/TechDebtDetailModal', () => ({
  TechDebtDetailModal: () => <div data-testid="tech-debt-modal" />,
}));

vi.mock('@/components/DuplicateDetailModal', () => ({
  DuplicateDetailModal: () => <div data-testid="duplicate-modal" />,
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children?: any }) => <div>{children}</div>,
  LineChart: ({ children }: { children?: any }) => <div>{children}</div>,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
  ReferenceLine: () => null,
  BarChart: ({ children }: { children?: any }) => <div>{children}</div>,
  Bar: () => null,
  AreaChart: ({ children }: { children?: any }) => <div>{children}</div>,
  Area: () => null,
  PieChart: ({ children }: { children?: any }) => <div>{children}</div>,
  Pie: () => null,
}));

import EnhancedAnalytics from '../preview/EnhancedAnalytics';
import TechDebtAnalysis from '../preview/TechDebtAnalysis';
import FeatureShowcase from '../preview/FeatureShowcase';
import AdvancedSettings from '../preview/AdvancedSettings';
import PatternLineage from '../preview/PatternLineage';
import NodeNetworkComposer from '../preview/NodeNetworkComposer';
import SystemHealth from '../preview/SystemHealth';
import DuplicateDetection from '../preview/DuplicateDetection';
import PatternDependencies from '../preview/PatternDependencies';

const PREVIEW_COMPONENTS = [
  { name: 'EnhancedAnalytics', Component: EnhancedAnalytics },
  { name: 'TechDebtAnalysis', Component: TechDebtAnalysis },
  { name: 'FeatureShowcase', Component: FeatureShowcase },
  { name: 'AdvancedSettings', Component: AdvancedSettings },
  { name: 'PatternLineage', Component: PatternLineage },
  { name: 'NodeNetworkComposer', Component: NodeNetworkComposer },
  { name: 'SystemHealth', Component: SystemHealth },
  { name: 'DuplicateDetection', Component: DuplicateDetection },
  { name: 'PatternDependencies', Component: PatternDependencies },
];

describe('Preview pages', () => {
  beforeAll(() => {
    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    (window as any).ResizeObserver = ResizeObserver;
    if (!navigator.clipboard) {
      (navigator as any).clipboard = { writeText: vi.fn() };
    }
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  describe.each(PREVIEW_COMPONENTS)('$name', ({ name, Component }) => {
    it(`renders ${name} without crashing`, () => {
      const { container } = render(<Component />);
      expect(container.firstChild).toBeTruthy();
    });
  });
});
