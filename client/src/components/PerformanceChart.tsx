import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Device, MetricsHistory } from "@shared/schema";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { format } from "date-fns";
import { Activity, Loader2 } from "lucide-react";

interface PerformanceChartProps {
  device: Device;
}

interface HistoryResponse {
  history: MetricsHistory[];
  averages: { avgUtilization: number; avgBandwidth: number };
}

const TIME_RANGES = [
  { value: "1", label: "1 hour" },
  { value: "6", label: "6 hours" },
  { value: "24", label: "24 hours" },
  { value: "168", label: "7 days" },
  { value: "720", label: "30 days" },
  { value: "2160", label: "90 days" },
  { value: "8760", label: "1 year" },
];

export function PerformanceChart({ device }: PerformanceChartProps) {
  const [timeRange, setTimeRange] = useState("24");
  
  const { data, isLoading } = useQuery<HistoryResponse>({
    queryKey: ["/api/devices", device.id, "history", timeRange],
    queryFn: async () => {
      const res = await fetch(`/api/devices/${device.id}/history?hours=${timeRange}`);
      if (!res.ok) throw new Error("Failed to fetch history");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const getTimeFormat = (hours: string) => {
    const h = parseInt(hours);
    if (h <= 24) return "HH:mm";
    if (h <= 168) return "EEE HH:mm";
    if (h <= 720) return "MMM d";
    return "MMM d";
  };

  const chartData = data?.history
    ?.slice()
    .reverse()
    .map((item) => ({
      time: format(new Date(item.timestamp), getTimeFormat(timeRange)),
      download: parseFloat(item.downloadMbps || "0"),
      upload: parseFloat(item.uploadMbps || "0"),
      utilization: item.utilization,
    })) || [];

  const hasAvailabilityData = device.totalChecks > 0;
  const availabilityValue = hasAvailabilityData 
    ? (device.successfulChecks / device.totalChecks) * 100
    : 0;
  const availability = hasAvailabilityData ? availabilityValue.toFixed(1) : null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">Performance History</span>
        </div>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-[110px] h-7 text-xs" data-testid="select-chart-time-range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIME_RANGES.map(range => (
              <SelectItem key={range.value} value={range.value}>{range.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Availability:</span>
          <span className={`font-semibold ${!hasAvailabilityData ? 'text-muted-foreground' : availabilityValue >= 99 ? 'text-green-500' : availabilityValue >= 95 ? 'text-yellow-500' : 'text-red-500'}`}>
            {availability !== null ? `${availability}%` : "--"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Checks:</span>
          <span className="font-mono">{device.successfulChecks}/{device.totalChecks}</span>
        </div>
      </div>

      {chartData.length > 0 ? (
        <div className="h-[150px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
              <XAxis 
                dataKey="time" 
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={{ stroke: 'hsl(var(--border))' }}
              />
              <YAxis 
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={{ stroke: 'hsl(var(--border))' }}
                tickFormatter={(value) => `${value}`}
                label={{ value: 'Mbps', angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: 'hsl(var(--muted-foreground))' } }}
                width={50}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))', 
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                  fontSize: '12px'
                }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
              />
              <Legend 
                wrapperStyle={{ fontSize: '10px' }}
                iconSize={8}
              />
              <Line 
                type="monotone" 
                dataKey="download" 
                stroke="hsl(var(--status-green))" 
                strokeWidth={2}
                dot={false}
                name="Download"
              />
              <Line 
                type="monotone" 
                dataKey="upload" 
                stroke="hsl(var(--status-blue))" 
                strokeWidth={2}
                dot={false}
                name="Upload"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-[100px] flex items-center justify-center text-muted-foreground text-sm">
          No historical data available yet
        </div>
      )}
    </div>
  );
}
