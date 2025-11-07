import React from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckCircle, Clock, DollarSign, AlertTriangle, Code, ArrowRight } from "lucide-react";

interface RefactoringStep {
  id: string;
  description: string;
  order: number;
  estimatedTime: string;
  dependencies: string[];
  automated: boolean;
  files: string[];
}

interface RefactorPlan {
  name: string;
  description: string;
  steps: RefactoringStep[];
  estimatedTime: string;
  estimatedSavings: number;
  riskLevel: 'low' | 'medium' | 'high';
  prerequisites: string[];
  testPlan: string[];
}

interface RefactorPlanModalProps {
  open: boolean;
  onClose: () => void;
  plan: RefactorPlan | null;
  duplicateTitle?: string;
}

export function RefactorPlanModal({ open, onClose, plan, duplicateTitle }: RefactorPlanModalProps) {
  if (!plan) return null;

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'high': return 'destructive';
      case 'medium': return 'default';
      case 'low': return 'secondary';
      default: return 'outline';
    }
  };

  const sortedSteps = plan.steps && plan.steps.length > 0
    ? [...plan.steps].sort((a, b) => a.order - b.order)
    : [];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Code className="w-5 h-5" />
            Refactoring Plan: {plan.name}
          </DialogTitle>
          <DialogDescription>
            {duplicateTitle && `Refactoring plan for: ${duplicateTitle}`}
            {plan.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            <Card className="p-4">
              <div className="text-sm text-muted-foreground mb-1">Estimated Time</div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span className="text-lg font-semibold">{plan.estimatedTime}</span>
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-sm text-muted-foreground mb-1">Expected Savings</div>
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-green-600" />
                <span className="text-lg font-semibold text-green-600">
                  ${plan.estimatedSavings.toLocaleString()}
                </span>
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-sm text-muted-foreground mb-1">Risk Level</div>
              <Badge variant={getRiskColor(plan.riskLevel)}>{plan.riskLevel}</Badge>
            </Card>
          </div>

          {/* Prerequisites */}
          {plan.prerequisites && plan.prerequisites.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Prerequisites
              </h4>
              <ul className="space-y-1">
                {plan.prerequisites.map((req, idx) => (
                  <li key={idx} className="text-sm text-muted-foreground flex items-center gap-2">
                    <CheckCircle className="w-3 h-3" />
                    {req}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Refactoring Steps */}
          <div>
            <h4 className="text-sm font-semibold mb-3">Refactoring Steps</h4>
            {sortedSteps.length === 0 ? (
              <p className="text-sm text-muted-foreground">No refactoring steps defined.</p>
            ) : (
              <div className="space-y-3">
                {sortedSteps.map((step, idx) => (
                <Card key={step.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold">
                      {step.order}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h5 className="font-medium">{step.description}</h5>
                        {step.automated && (
                          <Badge variant="secondary" className="text-xs">
                            Automated
                          </Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm mb-2">
                        <div>
                          <span className="text-muted-foreground">Time:</span>
                          <span className="ml-2 font-medium">{step.estimatedTime}</span>
                        </div>
                        {step.dependencies && step.dependencies.length > 0 && (
                          <div>
                            <span className="text-muted-foreground">Depends on:</span>
                            <span className="ml-2 font-medium">Step {step.dependencies.join(', ')}</span>
                          </div>
                        )}
                      </div>
                      {step.files && step.files.length > 0 && (
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">Affected Files:</div>
                          <div className="flex flex-wrap gap-1">
                            {step.files.map((file, fileIdx) => (
                              <code key={fileIdx} className="text-xs bg-muted px-2 py-1 rounded">
                                {file}
                              </code>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
              </div>
            )}
          </div>

          {/* Test Plan */}
          {plan.testPlan && plan.testPlan.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2">Test Plan</h4>
              <ul className="space-y-1">
                {plan.testPlan.map((test, idx) => (
                  <li key={idx} className="text-sm text-muted-foreground flex items-center gap-2">
                    <CheckCircle className="w-3 h-3 text-green-500" />
                    {test}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button>
              <Code className="w-4 h-4 mr-2" />
              Generate PR
            </Button>
            <Button variant="default">
              Export Plan
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}



