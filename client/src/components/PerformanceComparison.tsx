import { useQuery } from "@tanstack/react-query";
import { Device, MetricsHistory } from "@shared/schema";
import { TrendingUp, TrendingDown, Minus, BarChart3, Clock, ArrowLeftRight } from "lucide-react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { format } from "date-fns";

interface PerformanceComparisonProps {
  device: Device;
}

interface HistoryResponse {
  history: MetricsHistory[];
  averages: { avgUtilization: number; avgBandwidth: number };
}

interface ComparisonResponse {
  current: {
    period: { start: string; end: string };
    data: MetricsHistory[];
    averages: { avgUtilization: number; avgBandwidth: number };
  };
  previous: {
    period: { start: string; end: string };
    data: MetricsHistory[];
    averages: { avgUtilization: number; avgBandwidth: number };
  };
  changes: {
    utilization: number;
    bandwidth: number;
  };
}

const TIME_RANGES = [
  { value: "0.0167", label: "1 min", displayLabel: "1 minute" },
  { value: "0.0833", label: "5 min", displayLabel: "5 minutes" },
  { value: "1", label: "1 hour", displayLabel: "1 hour" },
  { value: "6", label: "6 hours", displayLabel: "6 hours" },
  { value: "24", label: "1 day", displayLabel: "24 hours" },
  { value: "168", label: "7 days", displayLabel: "7 days" },
  { value: "720", label: "1 month", displayLabel: "30 days" },
  { value: "8760", label: "1 year", displayLabel: "1 year" },
];

const COMPARISON_PERIODS = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

export function PerformanceComparison({ device }: PerformanceComparisonProps) {
  const [timeRange, setTimeRange] = useState("24");
  const [comparisonPeriod, setComparisonPeriod] = useState("day");
  const [activeTab, setActiveTab] = useState("current");
  const [metric, setMetric] = useState<"utilization" | "bandwidth">("utilization");
  
  const { data, isLoading } = useQuery<HistoryResponse>({
    queryKey: ["/api/devices", device.id, "history", timeRange],
    queryFn: async () => {
      const res = await fetch(`/api/devices/${device.id}/history?hours=${timeRange}`);
      if (!res.ok) throw new Error("Failed to fetch history");
      return res.json();
    },
    refetchInterval: 10000,
  });

  const { data: comparisonData, isLoading: comparisonLoading } = useQuery<ComparisonResponse>({
    queryKey: ["/api/devices", device.id, "compare", comparisonPeriod],
    queryFn: async () => {
      const res = await fetch(`/api/devices/${device.id}/compare?period=${comparisonPeriod}`);
      if (!res.ok) throw new Error("Failed to fetch comparison");
      return res.json();
    },
    refetchInterval: 30000,
    enabled: activeTab === "compare",
  });

  const chartData = useMemo(() => {
    if (!comparisonData) return [];
    
    const currentData = comparisonData.current.data;
    const previousData = comparisonData.previous.data;
    
    const maxLength = Math.max(currentData.length, previousData.length);
    if (maxLength === 0) return [];
    
    const result = [];
    
    for (let i = 0; i < maxLength; i++) {
      const currentIndex = Math.floor((i / maxLength) * currentData.length);
      const previousIndex = Math.floor((i / maxLength) * previousData.length);
      
      const currentPoint = currentData[currentIndex];
      const previousPoint = previousData[previousIndex];
      
      if (metric === "utilization") {
        result.push({
          index: i,
          current: currentPoint?.utilization || 0,
          previous: previousPoint?.utilization || 0,
        });
      } else {
        result.push({
          index: i,
          current: parseFloat(currentPoint?.downloadMbps || "0") + parseFloat(currentPoint?.uploadMbps || "0"),
          previous: parseFloat(previousPoint?.downloadMbps || "0") + parseFloat(previousPoint?.uploadMbps || "0"),
        });
      }
    }
    
    return result;
  }, [comparisonData, metric]);

  const getTimeRangeLabel = (value: string) => {
    return TIME_RANGES.find(t => t.value === value)?.displayLabel || value;
  };

  const getPeriodLabel = (period: string) => {
    switch (period) {
      case "day": return "Today vs Yesterday";
      case "week": return "This Week vs Last Week";
      case "month": return "This Month vs Last Month";
      default: return "Comparison";
    }
  };

  const currentBandwidth = parseFloat(device.bandwidthMBps);
  const currentUtilization = device.utilization;
  
  const avgBandwidth = data?.averages.avgBandwidth || 0;
  const avgUtilization = data?.averages.avgUtilization || 0;
  
  const bandwidthDiff = avgBandwidth > 0 ? ((currentBandwidth - avgBandwidth) / avgBandwidth) * 100 : 0;
  const utilizationDiff = avgUtilization > 0 ? ((currentUtilization - avgUtilization) / avgUtilization) * 100 : 0;

  const getTrendIcon = (diff: number) => {
    if (Math.abs(diff) < 5) return <Minus className="w-4 h-4 text-muted-foreground" />;
    if (diff > 0) return <TrendingUp className="w-4 h-4 text-amber-500" />;
    return <TrendingDown className="w-4 h-4 text-emerald-500" />;
  };

  const getTrendColor = (diff: number) => {
    if (Math.abs(diff) < 5) return "text-muted-foreground";
    if (diff > 0) return "text-amber-500";
    return "text-emerald-500";
  };

  const getComparisonTrendColor = (change: number, isUtilization: boolean) => {
    if (Math.abs(change) < 5) return "text-muted-foreground";
    if (isUtilization) {
      return change > 0 ? "text-red-500" : "text-green-500";
    }
    return change > 0 ? "text-green-500" : "text-red-500";
  };

  const formatDiff = (diff: number) => {
    if (Math.abs(diff) < 1) return "~0%";
    const sign = diff > 0 ? "+" : "";
    return `${sign}${diff.toFixed(0)}%`;
  };

  if (isLoading) {
    return (
      <div className="glass rounded-lg p-4 animate-pulse">
        <div className="h-4 bg-secondary/50 rounded w-3/4 mb-3" />
        <div className="h-8 bg-secondary/50 rounded w-1/2" />
      </div>
    );
  }

  const hasHistory = data && data.history.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-lg p-4 space-y-4"
      data-testid={`performance-comparison-${device.id}`}
    >
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <TabsList className="h-7">
            <TabsTrigger value="current" className="text-xs h-6 px-2" data-testid="tab-current">
              <BarChart3 className="w-3 h-3 mr-1" />
              Current
            </TabsTrigger>
            <TabsTrigger value="compare" className="text-xs h-6 px-2" data-testid="tab-compare">
              <ArrowLeftRight className="w-3 h-3 mr-1" />
              Compare
            </TabsTrigger>
          </TabsList>
          
          {activeTab === "current" ? (
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-[90px] h-7 text-xs" data-testid="select-time-range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIME_RANGES.map(range => (
                  <SelectItem key={range.value} value={range.value}>{range.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="flex gap-2">
              <Select value={comparisonPeriod} onValueChange={setComparisonPeriod}>
                <SelectTrigger className="w-[80px] h-7 text-xs" data-testid="select-comparison-period">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMPARISON_PERIODS.map(p => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={metric} onValueChange={(v) => setMetric(v as any)}>
                <SelectTrigger className="w-[90px] h-7 text-xs" data-testid="select-metric">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="utilization">Utilization</SelectItem>
                  <SelectItem value="bandwidth">Bandwidth</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <TabsContent value="current" className="mt-4">
          {!hasHistory ? (
            <div className="text-center py-4 text-muted-foreground text-xs">
              <Clock className="w-6 h-6 mx-auto mb-2 opacity-50" />
              <p>No historical data yet</p>
              <p className="text-[10px] opacity-60">Data will accumulate over time</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2 p-3 rounded-md bg-secondary/30">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Bandwidth</div>
                  <div className="flex items-center justify-between gap-1">
                    <div>
                      <div className="text-lg font-mono font-bold">{currentBandwidth.toFixed(2)}</div>
                      <div className="text-[10px] text-muted-foreground">Mbps now</div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1 justify-end">
                        {getTrendIcon(bandwidthDiff)}
                        <span className={`text-sm font-semibold ${getTrendColor(bandwidthDiff)}`}>
                          {formatDiff(bandwidthDiff)}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        avg: {avgBandwidth.toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 p-3 rounded-md bg-secondary/30">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Utilization</div>
                  <div className="flex items-center justify-between gap-1">
                    <div>
                      <div className="text-lg font-mono font-bold">{currentUtilization}%</div>
                      <div className="text-[10px] text-muted-foreground">now</div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1 justify-end">
                        {getTrendIcon(utilizationDiff)}
                        <span className={`text-sm font-semibold ${getTrendColor(utilizationDiff)}`}>
                          {formatDiff(utilizationDiff)}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        avg: {avgUtilization}%
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 text-[10px] text-muted-foreground pt-2 border-t border-white/5">
                <Badge variant="outline" className="text-[9px]">
                  {data.history.length} samples
                </Badge>
                <span>over last {getTimeRangeLabel(timeRange)}</span>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="compare" className="mt-4">
          {comparisonLoading ? (
            <div className="h-48 flex items-center justify-center">
              <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : !comparisonData ? (
            <div className="text-center py-4 text-muted-foreground text-xs">
              <Clock className="w-6 h-6 mx-auto mb-2 opacity-50" />
              <p>Unable to load comparison data</p>
            </div>
          ) : (
            <>
              <div className="text-xs text-muted-foreground mb-3">{getPeriodLabel(comparisonPeriod)}</div>
              
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="p-3 rounded-md bg-secondary/30">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Avg Utilization</div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-semibold">{comparisonData.current.averages.avgUtilization}%</span>
                    <div className={`flex items-center gap-0.5 text-xs ${getComparisonTrendColor(comparisonData.changes.utilization, true)}`}>
                      {comparisonData.changes.utilization > 5 ? <TrendingUp className="w-3 h-3" /> : 
                       comparisonData.changes.utilization < -5 ? <TrendingDown className="w-3 h-3" /> : 
                       <Minus className="w-3 h-3" />}
                      <span>{comparisonData.changes.utilization > 0 ? "+" : ""}{comparisonData.changes.utilization}%</span>
                    </div>
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Prev: {comparisonData.previous.averages.avgUtilization}%
                  </div>
                </div>
                <div className="p-3 rounded-md bg-secondary/30">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Avg Bandwidth</div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-semibold">{comparisonData.current.averages.avgBandwidth.toFixed(1)}</span>
                    <span className="text-xs text-muted-foreground">Mbps</span>
                    <div className={`flex items-center gap-0.5 text-xs ${getComparisonTrendColor(comparisonData.changes.bandwidth, false)}`}>
                      {comparisonData.changes.bandwidth > 5 ? <TrendingUp className="w-3 h-3" /> : 
                       comparisonData.changes.bandwidth < -5 ? <TrendingDown className="w-3 h-3" /> : 
                       <Minus className="w-3 h-3" />}
                      <span>{comparisonData.changes.bandwidth > 0 ? "+" : ""}{comparisonData.changes.bandwidth}%</span>
                    </div>
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Prev: {comparisonData.previous.averages.avgBandwidth.toFixed(1)} Mbps
                  </div>
                </div>
              </div>

              {chartData.length > 0 && (
                <div className="h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                      <XAxis 
                        dataKey="index" 
                        tickLine={false}
                        axisLine={false}
                        tick={false}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 9 }}
                        width={30}
                        tickFormatter={(value) => metric === "utilization" ? `${value}%` : `${value}`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--popover))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "6px",
                          fontSize: "10px",
                        }}
                        formatter={(value: number, name: string) => [
                          metric === "utilization" ? `${value}%` : `${value.toFixed(1)} Mbps`,
                          name === "current" ? "Current" : "Previous"
                        ]}
                      />
                      <Legend 
                        formatter={(value) => value === "current" ? "Current" : "Previous"}
                        wrapperStyle={{ fontSize: "10px" }}
                      />
                      <Line
                        type="monotone"
                        dataKey="current"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={false}
                        name="current"
                      />
                      <Line
                        type="monotone"
                        dataKey="previous"
                        stroke="hsl(var(--muted-foreground))"
                        strokeWidth={1.5}
                        strokeDasharray="4 4"
                        dot={false}
                        name="previous"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div className="mt-2 text-[9px] text-muted-foreground flex justify-between">
                <span>
                  Current: {format(new Date(comparisonData.current.period.start), "MMM d")} - {format(new Date(comparisonData.current.period.end), "MMM d")}
                </span>
                <span>
                  Previous: {format(new Date(comparisonData.previous.period.start), "MMM d")} - {format(new Date(comparisonData.previous.period.end), "MMM d")}
                </span>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
