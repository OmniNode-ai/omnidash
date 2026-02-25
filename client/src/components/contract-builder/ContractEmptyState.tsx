import { Button } from '@/components/ui/button';
import { FileText, ArrowRight } from 'lucide-react';

interface ContractEmptyStateProps {
  onCreateFirst: () => void;
}

/**
 * Empty state shown when no contracts exist.
 * Educates users about contracts and guides them to create their first one.
 */
export function ContractEmptyState({ onCreateFirst }: ContractEmptyStateProps) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-xl w-full space-y-6">
        {/* Hero Section */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            <FileText className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold">Welcome to Contract Builder</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Contracts define the behavior, inputs, outputs, and constraints of your ONEX nodes.
            They're the blueprint that ensures consistency and enables governance across your
            system.
          </p>
        </div>

        {/* CTA */}
        <div className="text-center pt-4">
          <Button size="lg" onClick={onCreateFirst} className="gap-2">
            Create Your First Contract
            <ArrowRight className="w-4 h-4" />
          </Button>
          <p className="text-xs text-muted-foreground mt-3">
            You'll choose a contract type and define its schema in the next steps
          </p>
        </div>
      </div>
    </div>
  );
}
