import InstructionEvalHeatmap from '@/components/dashboard/instruction-eval/InstructionEvalHeatmap';

export function InstructionEvalPage() {
  return (
    <>
      <div className="dash-header">
        <div className="dash-title-wrap">
          <div className="dash-title">Instruction Eval</div>
        </div>
      </div>
      <div className="dash-body" style={{ padding: '24px 28px', overflowY: 'auto' }}>
        <InstructionEvalHeatmap config={{}} />
      </div>
    </>
  );
}
