import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, Brush } from "recharts";
import { Device, MetricsHistory } from "@shared/schema";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { useState, useMemo } from "react";
import { format, endOfDay } from "date-fns";
import { Activity, Loader2, ZoomIn, ZoomOut, Calendar, RotateCcw } from "lucide-react";
import { DateRange } from "react-day-picker";

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
  const [customRange, setCustomRange] = useState<DateRange | undefined>(undefined);
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [zoomDomain, setZoomDomain] = useState<{ start: number; end: number } | null>(null);

  const getQueryParams = () => {
    if (useCustomRange && customRange?.from && customRange?.to) {
      // Use endOfDay to include the full selected end day (up to 23:59:59.999)
      const endDate = endOfDay(customRange.to);
      return `start=${customRange.from.toISOString()}&end=${endDate.toISOString()}`;
    }
    return `hours=${timeRange}`;
  };
  
  const { data, isLoading } = useQuery<HistoryResponse>({
    queryKey: ["/api/devices", device.id, "history", useCustomRange ? customRange : timeRange],
    queryFn: async () => {
      const res = await fetch(`/api/devices/${device.id}/history?${getQueryParams()}`);
      if (!res.ok) throw new Error("Failed to fetch history");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const chartData = useMemo(() => {
    if (!data?.history) return [];
    
    return data.history
      .slice()
      .reverse()
      .map((item) => ({
        timestamp: new Date(item.timestamp).getTime(),
        download: parseFloat(item.downloadMbps || "0"),
        upload: parseFloat(item.uploadMbps || "0"),
        utilization: item.utilization,
      }));
  }, [data]);

  const displayData = useMemo(() => {
    if (!zoomDomain || chartData.length === 0) return chartData;
    return chartData.filter(d => d.timestamp >= zoomDomain.start && d.timestamp <= zoomDomain.end);
  }, [chartData, zoomDomain]);

  const getTickFormatter = () => {
    if (chartData.length < 2) return (ts: number) => format(new Date(ts), "HH:mm");
    
    const range = chartData[chartData.length - 1].timestamp - chartData[0].timestamp;
    const hours = range / (1000 * 60 * 60);
    
    if (hours <= 24) return (ts: number) => format(new Date(ts), "HH:mm");
    if (hours <= 168) return (ts: number) => format(new Date(ts), "EEE HH:mm");
    if (hours <= 720) return (ts: number) => format(new Date(ts), "MMM d");
    return (ts: number) => format(new Date(ts), "MMM yyyy");
  };

  const handleZoomIn = () => {
    if (displayData.length < 2) return;
    const start = displayData[0].timestamp;
    const end = displayData[displayData.length - 1].timestamp;
    const range = end - start;
    const newRange = range * 0.5;
    const center = start + range / 2;
    setZoomDomain({ start: center - newRange / 2, end: center + newRange / 2 });
  };

  const handleZoomOut = () => {
    if (chartData.length < 2) return;
    if (!zoomDomain) return;
    
    const currentRange = zoomDomain.end - zoomDomain.start;
    const newRange = currentRange * 2;
    const center = (zoomDomain.start + zoomDomain.end) / 2;
    const fullStart = chartData[0].timestamp;
    const fullEnd = chartData[chartData.length - 1].timestamp;
    
    const newStart = Math.max(fullStart, center - newRange / 2);
    const newEnd = Math.min(fullEnd, center + newRange / 2);
    
    if (newStart <= fullStart && newEnd >= fullEnd) {
      setZoomDomain(null);
    } else {
      setZoomDomain({ start: newStart, end: newEnd });
    }
  };

  const handleBrushChange = (brushData: { startIndex?: number; endIndex?: number }) => {
    if (brushData.startIndex !== undefined && brushData.endIndex !== undefined && chartData.length > 0) {
      const start = chartData[brushData.startIndex]?.timestamp;
      const end = chartData[brushData.endIndex]?.timestamp;
      if (start && end) {
        setZoomDomain({ start, end });
      }
    }
  };

  const resetZoom = () => {
    setZoomDomain(null);
  };

  const handlePresetChange = (value: string) => {
    setTimeRange(value);
    setUseCustomRange(false);
    setCustomRange(undefined);
    setZoomDomain(null);
  };

  const handleCustomRangeSelect = (range: DateRange | undefined) => {
    setCustomRange(range);
    if (range?.from && range?.to) {
      setUseCustomRange(true);
      setZoomDomain(null);
    }
  };

  const tooltipLabelFormatter = (label: number) => {
    return format(new Date(label), "PPpp");
  };

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
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">Performance History</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleZoomIn}
            disabled={displayData.length < 2}
            data-testid="button-perf-zoom-in"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleZoomOut}
            disabled={!zoomDomain}
            data-testid="button-perf-zoom-out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </Button>
          {zoomDomain && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={resetZoom}
              data-testid="button-perf-reset-zoom"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </Button>
          )}
          
          <Select value={useCustomRange ? "custom" : timeRange} onValueChange={handlePresetChange}>
            <SelectTrigger className="w-[110px] h-7 text-xs" data-testid="select-chart-time-range">
              <SelectValue placeholder={useCustomRange ? "Custom" : undefined} />
            </SelectTrigger>
            <SelectContent>
              {TIME_RANGES.map(range => (
                <SelectItem key={range.value} value={range.value}>{range.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={useCustomRange ? "secondary" : "ghost"}
                size="icon"
                className="h-7 w-7"
                data-testid="button-perf-custom-range"
              >
                <Calendar className="w-3.5 h-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <CalendarComponent
                mode="range"
                selected={customRange}
                onSelect={handleCustomRangeSelect}
                numberOfMonths={2}
                disabled={(date) => date > new Date()}
              />
            </PopoverContent>
          </Popover>
        </div>
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
        {zoomDomain && displayData.length > 0 && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span>Viewing:</span>
            <span className="font-mono text-foreground">
              {format(new Date(displayData[0].timestamp), "MMM d HH:mm")} - {format(new Date(displayData[displayData.length - 1].timestamp), "MMM d HH:mm")}
            </span>
          </div>
        )}
      </div>

      {displayData.length > 0 ? (
        <div className="h-[180px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={displayData} margin={{ top: 5, right: 10, left: 5, bottom: 25 }}>
              <XAxis 
                dataKey="timestamp"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                tickFormatter={getTickFormatter()}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={{ stroke: 'hsl(var(--border))' }}
                tickCount={6}
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
                labelStyle={{ color: 'hsl(var(--foreground))', marginBottom: '4px' }}
                labelFormatter={tooltipLabelFormatter}
                formatter={(value: number, name: string) => [`${value.toFixed(2)} Mbps`, name === 'download' ? 'Download' : 'Upload']}
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
                name="download"
              />
              <Line 
                type="monotone" 
                dataKey="upload" 
                stroke="hsl(var(--status-blue))" 
                strokeWidth={2}
                dot={false}
                name="upload"
              />
              <Brush 
                dataKey="timestamp"
                height={18}
                stroke="hsl(var(--border))"
                fill="hsl(var(--secondary))"
                onChange={handleBrushChange}
                tickFormatter={(ts) => format(new Date(ts), "MMM d")}
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
