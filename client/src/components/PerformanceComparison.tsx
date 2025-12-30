import { useQuery } from "@tanstack/react-query";
import { Device, MetricsHistory } from "@shared/schema";
import { TrendingUp, TrendingDown, Minus, BarChart3, Clock } from "lucide-react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";

interface PerformanceComparisonProps {
  device: Device;
}

interface HistoryResponse {
  history: MetricsHistory[];
  averages: { avgUtilization: number; avgBandwidth: number };
}

export function PerformanceComparison({ device }: PerformanceComparisonProps) {
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
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">Performance Comparison</span>
        </div>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-24 h-7 text-xs" data-testid="select-time-range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">1 hour</SelectItem>
            <SelectItem value="6">6 hours</SelectItem>
            <SelectItem value="24">24 hours</SelectItem>
            <SelectItem value="168">7 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!hasHistory ? (
        <div className="text-center py-4 text-muted-foreground text-xs">
          <Clock className="w-6 h-6 mx-auto mb-2 opacity-50" />
          <p>No historical data yet</p>
          <p className="text-[10px] opacity-60">Data will accumulate over time</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2 p-3 rounded-md bg-secondary/30">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Bandwidth</div>
            <div className="flex items-center justify-between gap-1">
              <div>
                <div className="text-lg font-mono font-bold">{currentBandwidth.toFixed(2)}</div>
                <div className="text-[10px] text-muted-foreground">MBps now</div>
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
      )}

      {hasHistory && (
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground pt-2 border-t border-white/5">
          <Badge variant="outline" className="text-[9px]">
            {data.history.length} samples
          </Badge>
          <span>over last {timeRange}h</span>
        </div>
      )}
    </motion.div>
  );
}
