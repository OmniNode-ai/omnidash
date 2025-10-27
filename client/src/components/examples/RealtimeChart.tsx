import { RealtimeChart } from '../RealtimeChart';

export default function RealtimeChartExample() {
  //todo: remove mock functionality
  const data = Array.from({ length: 20 }, (_, i) => ({
    time: `${i}:00`,
    value: 40 + Math.random() * 60,
  }));

  return (
    <div className="grid grid-cols-2 gap-6 p-6">
      <RealtimeChart 
        title="Agent Response Times"
        data={data}
        color="hsl(var(--chart-1))"
      />
      <RealtimeChart 
        title="Pattern Discovery Rate"
        data={data}
        color="hsl(var(--chart-2))"
        showArea
      />
    </div>
  );
}
