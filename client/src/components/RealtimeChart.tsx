import { Card } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { Activity } from "lucide-react";

interface DataPoint {
  time: string;
  value: number;
  secondary?: number;
}

interface RealtimeChartProps {
  title: string;
  data: DataPoint[];
  dataKey?: string;
  color?: string;
  showArea?: boolean;
  height?: number;
}

export function RealtimeChart({ 
  title, 
  data, 
  dataKey = "value", 
  color = "hsl(var(--chart-1))",
  showArea = false,
  height = 320
}: RealtimeChartProps) {
  const ChartComponent = showArea ? AreaChart : LineChart;
  const DataComponent = showArea ? Area : Line;

  return (
    <Card className="p-6" data-testid={`chart-${title.toLowerCase().replace(/\s/g, '-')}`}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          <div className="flex items-center gap-2 mt-1">
            <Activity className="w-3 h-3 text-status-healthy animate-pulse" />
            <span className="text-xs text-muted-foreground">Live</span>
          </div>
        </div>
      </div>
      
      <ResponsiveContainer width="100%" height={height}>
        <ChartComponent data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
          <XAxis 
            dataKey="time" 
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            tickLine={false}
          />
          <YAxis 
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            tickLine={false}
          />
          <Tooltip 
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '6px',
              fontSize: '12px',
            }}
          />
          <DataComponent 
            type="monotone" 
            dataKey={dataKey} 
            stroke={color}
            strokeWidth={2}
            fill={showArea ? color : undefined}
            fillOpacity={showArea ? 0.2 : undefined}
            dot={false}
          />
        </ChartComponent>
      </ResponsiveContainer>
    </Card>
  );
}
