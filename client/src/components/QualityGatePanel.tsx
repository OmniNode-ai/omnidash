import { Card } from '@/components/ui/card';
import { Check, X, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface QualityGate {
  id: string;
  name: string;
  status: 'passed' | 'failed' | 'warning';
  threshold: string;
  currentValue: string;
}

interface QualityGatePanelProps {
  gates: QualityGate[];
}

export function QualityGatePanel({ gates }: QualityGatePanelProps) {
  const getStatusIcon = (status: QualityGate['status']) => {
    switch (status) {
      case 'passed':
        return <Check className="w-4 h-4" />;
      case 'failed':
        return <X className="w-4 h-4" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4" />;
    }
  };

  const getStatusColor = (status: QualityGate['status']) => {
    switch (status) {
      case 'passed':
        return 'bg-status-healthy/10 text-status-healthy border-status-healthy/20';
      case 'failed':
        return 'bg-status-error/10 text-status-error border-status-error/20';
      case 'warning':
        return 'bg-status-warning/10 text-status-warning border-status-warning/20';
    }
  };

  const passedCount = gates.filter((g) => g.status === 'passed').length;
  const totalCount = gates.length;

  return (
    <Card className="p-6" data-testid="panel-quality-gates">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-base font-semibold">Quality Gates</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {passedCount} of {totalCount} gates passed
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold font-mono text-status-healthy">
            {totalCount === 0 ? 0 : Math.round((passedCount / totalCount) * 100)}%
          </div>
          <div className="text-xs text-muted-foreground">Success Rate</div>
        </div>
      </div>

      <div className="space-y-3">
        {gates.map((gate) => (
          <div
            key={gate.id}
            className={cn(
              'flex items-center gap-3 p-3 rounded-lg border',
              getStatusColor(gate.status)
            )}
            data-testid={`gate-${gate.id}`}
          >
            <div
              className={cn(
                'flex items-center justify-center w-8 h-8 rounded-md',
                gate.status === 'passed' && 'bg-status-healthy/20',
                gate.status === 'failed' && 'bg-status-error/20',
                gate.status === 'warning' && 'bg-status-warning/20'
              )}
            >
              {getStatusIcon(gate.status)}
            </div>

            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{gate.name}</div>
              <div className="text-xs text-muted-foreground mt-1">Threshold: {gate.threshold}</div>
            </div>

            <div className="text-right">
              <div className="text-sm font-mono font-semibold">{gate.currentValue}</div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
