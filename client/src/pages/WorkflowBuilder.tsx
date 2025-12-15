import { useState, useRef, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Workflow, Download, Upload, Trash2, Undo2, Redo2 } from 'lucide-react';
import { WorkflowCanvas, NodeLibrary } from '@/components/workflow-builder';
import type { WorkflowCanvasHandle } from '@/components/workflow-builder';

export default function WorkflowBuilder() {
  const [selectedNodeType, setSelectedNodeType] = useState<string>('action');
  // Force re-render after undo/redo to update button states
  const [, forceUpdate] = useState(0);
  const canvasRef = useRef<WorkflowCanvasHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAddNode = useCallback((type: string) => {
    canvasRef.current?.addNodeAtCenter(type);
    forceUpdate((n) => n + 1);
  }, []);

  const handleExport = useCallback(() => {
    canvasRef.current?.downloadWorkflow();
  }, []);

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const success = await canvasRef.current?.loadWorkflowFromFile(file);
      if (!success) {
        console.warn('Failed to import workflow - invalid format');
      }
      forceUpdate((n) => n + 1);
    }
    e.target.value = '';
  }, []);

  const handleClear = useCallback(() => {
    const nodeCount = canvasRef.current?.getNodeCount() ?? 0;
    if (nodeCount === 0 || window.confirm('Clear the entire workflow?')) {
      canvasRef.current?.clearWorkflow();
      forceUpdate((n) => n + 1);
    }
  }, []);

  const handleUndo = useCallback(() => {
    if (canvasRef.current?.canUndo()) {
      canvasRef.current.undo();
      forceUpdate((n) => n + 1);
    }
  }, []);

  const handleRedo = useCallback(() => {
    if (canvasRef.current?.canRedo()) {
      canvasRef.current.redo();
      forceUpdate((n) => n + 1);
    }
  }, []);

  const canUndo = canvasRef.current?.canUndo() ?? false;
  const canRedo = canvasRef.current?.canRedo() ?? false;

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Workflow className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Workflow Builder</h1>
            <p className="text-muted-foreground text-sm">Create and manage node-based workflows</p>
          </div>
        </div>

        {/* Workflow actions */}
        <div className="flex items-center gap-2">
          {/* Undo/Redo */}
          <div className="flex items-center gap-1 mr-2">
            <button
              onClick={handleUndo}
              disabled={!canUndo}
              title="Undo (Ctrl+Z)"
              className="p-1.5 rounded-md text-muted-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              onClick={handleRedo}
              disabled={!canRedo}
              title="Redo (Ctrl+Shift+Z)"
              className="p-1.5 rounded-md text-muted-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Redo2 className="w-4 h-4" />
            </button>
          </div>

          <div className="w-px h-6 bg-border" />

          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
          <button
            onClick={handleImportClick}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            Import
          </button>
          <button
            onClick={handleClear}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      </div>

      {/* Main content - Library + Canvas */}
      <Card className="overflow-hidden flex-1 min-h-[500px]">
        <CardContent className="p-0 h-full">
          <div className="flex h-full">
            {/* Node Library Sidebar */}
            <div className="w-56 flex-shrink-0 h-full">
              <NodeLibrary
                selectedType={selectedNodeType}
                onSelectType={setSelectedNodeType}
                onAddNode={handleAddNode}
              />
            </div>

            {/* Canvas */}
            <div className="flex-1 border-l h-full">
              <WorkflowCanvas ref={canvasRef} selectedNodeType={selectedNodeType} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
