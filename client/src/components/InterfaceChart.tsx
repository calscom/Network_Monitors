import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { InterfaceMetricsHistory, DeviceInterface } from "@shared/schema";
import { useState } from "react";
import { format } from "date-fns";
import { Activity, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "./ui/button";

interface InterfaceChartProps {
  interfaceData: DeviceInterface;
}

const TIME_RANGES = [
  { value: "1", label: "1h" },
  { value: "6", label: "6h" },
  { value: "24", label: "24h" },
];

export function InterfaceChart({ interfaceData }: InterfaceChartProps) {
  const [showChart, setShowChart] = useState(false);
  const [timeRange, setTimeRange] = useState("24");
  
  const { data, isLoading } = useQuery<InterfaceMetricsHistory[]>({
    queryKey: ["/api/interfaces", interfaceData.id, "history", timeRange],
    queryFn: async () => {
      const res = await fetch(`/api/interfaces/${interfaceData.id}/history?hours=${timeRange}`);
      if (!res.ok) throw new Error("Failed to fetch interface history");
      return res.json();
    },
    enabled: showChart,
    refetchInterval: 30000,
  });

  const getTimeFormat = (hours: string) => {
    const h = parseInt(hours);
    if (h <= 6) return "HH:mm";
    return "HH:mm";
  };

  const chartData = data
    ?.slice()
    .reverse()
    .map((item) => ({
      time: format(new Date(item.timestamp), getTimeFormat(timeRange)),
      download: parseFloat(item.downloadMbps || "0"),
      upload: parseFloat(item.uploadMbps || "0"),
    })) || [];

  return (
    <div className="mt-2">
      <Button
        variant="ghost"
        size="sm"
        className="h-5 text-[10px] gap-1 px-1"
        onClick={() => setShowChart(!showChart)}
        data-testid={`button-toggle-interface-chart-${interfaceData.id}`}
      >
        <Activity className="w-2.5 h-2.5" />
        Graph
        {showChart ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
      </Button>

      {showChart && (
        <div className="mt-2 p-2 rounded bg-secondary/20 border border-white/5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] text-muted-foreground">History</span>
            <div className="flex gap-1">
              {TIME_RANGES.map(range => (
                <Button
                  key={range.value}
                  variant={timeRange === range.value ? "secondary" : "ghost"}
                  size="sm"
                  className="h-4 text-[9px] px-1.5"
                  onClick={() => setTimeRange(range.value)}
                >
                  {range.label}
                </Button>
              ))}
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : chartData.length > 0 ? (
            <div className="h-[80px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                  <XAxis 
                    dataKey="time" 
                    tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }}
                    tickLine={false}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                    interval="preserveStartEnd"
                  />
                  <YAxis 
                    tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }}
                    tickLine={false}
                    axisLine={false}
                    width={30}
                    tickFormatter={(value) => `${value}`}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '4px',
                      fontSize: '10px',
                      padding: '4px 8px'
                    }}
                    labelStyle={{ color: 'hsl(var(--foreground))', fontSize: '10px' }}
                    formatter={(value: number, name: string) => [`${value.toFixed(2)} Mbps`, name]}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="download" 
                    stroke="hsl(var(--status-green))" 
                    strokeWidth={1.5}
                    dot={false}
                    name="Down"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="upload" 
                    stroke="hsl(var(--status-blue))" 
                    strokeWidth={1.5}
                    dot={false}
                    name="Up"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[60px] flex items-center justify-center text-muted-foreground text-[10px]">
              No historical data yet
            </div>
          )}
        </div>
      )}
    </div>
  );
}
