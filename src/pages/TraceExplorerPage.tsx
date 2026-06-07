import TraceExplorerWidget from '@/components/dashboard/trace-explorer/TraceExplorerWidget';

export function TraceExplorerPage() {
  return (
    <>
      <div className="dash-header">
        <div className="dash-title-wrap">
          <div className="dash-title">Trace Explorer</div>
        </div>
      </div>
      <div className="dash-body" style={{ padding: '24px 28px', overflowY: 'auto' }}>
        <TraceExplorerWidget />
      </div>
    </>
  );
}
