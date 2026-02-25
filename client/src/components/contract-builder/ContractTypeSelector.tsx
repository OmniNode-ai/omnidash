import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Workflow, Zap, Database, Cpu, ArrowLeft, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ContractType } from './models/types';

interface ContractTypeSelectorProps {
  onSelect: (type: ContractType) => void;
  onBack: () => void;
}

const contractTypes = [
  {
    type: 'orchestrator' as ContractType,
    label: 'Orchestrator',
    description: 'Coordinate workflows and manage multi-step processes',
    icon: Workflow,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500',
    hoverBg: 'hover:bg-purple-500/5',
  },
  {
    type: 'effect' as ContractType,
    label: 'Effect',
    description: 'Handle external interactions, APIs, and side effects',
    icon: Zap,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500',
    hoverBg: 'hover:bg-yellow-500/5',
  },
  {
    type: 'reducer' as ContractType,
    label: 'Reducer',
    description: 'Manage state, persistence, and data aggregation',
    icon: Database,
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500',
    hoverBg: 'hover:bg-green-500/5',
  },
  {
    type: 'compute' as ContractType,
    label: 'Compute',
    description: 'Process data with pure, deterministic transformations',
    icon: Cpu,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500',
    hoverBg: 'hover:bg-blue-500/5',
  },
];

/**
 * Contract type selection step.
 * User picks which node type they want to create a contract for.
 */
export function ContractTypeSelector({ onSelect, onBack }: ContractTypeSelectorProps) {
  const [selectedType, setSelectedType] = useState<ContractType | null>(null);

  const handleContinue = () => {
    if (selectedType) {
      onSelect(selectedType);
    }
  };

  return (
    <div className="flex-1 flex flex-col p-6">
      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-xl font-semibold mb-2">Select Contract Type</h2>
        <p className="text-sm text-muted-foreground">
          Choose the type of node this contract will define
        </p>
      </div>

      {/* Type Cards */}
      <div className="flex-1 flex items-center justify-center">
        <div className="grid grid-cols-2 gap-4 max-w-2xl w-full">
          {contractTypes.map((ct) => {
            const isSelected = selectedType === ct.type;
            return (
              <button
                key={ct.type}
                onClick={() => setSelectedType(ct.type)}
                className={cn(
                  'flex flex-col items-center gap-3 p-6 rounded-lg border-2 transition-all text-left',
                  ct.hoverBg,
                  isSelected ? `${ct.borderColor} ${ct.bgColor}` : 'border-border'
                )}
              >
                <div className={cn('p-3 rounded-lg', ct.bgColor)}>
                  <ct.icon className={cn('w-8 h-8', ct.color)} />
                </div>
                <div className="text-center">
                  <p className="font-semibold">{ct.label}</p>
                  <p className="text-xs text-muted-foreground mt-1">{ct.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer with navigation */}
      <div className="flex items-center justify-between pt-6 border-t">
        <Button variant="ghost" onClick={onBack} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>
        <Button onClick={handleContinue} disabled={!selectedType} className="gap-2">
          Continue
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
