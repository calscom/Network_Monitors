import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Brush, ReferenceLine } from "recharts";
import { InterfaceMetricsHistory, DeviceInterface } from "@shared/schema";
import { useState, useMemo } from "react";
import { format, endOfDay } from "date-fns";
import { Activity, Loader2, ChevronDown, ChevronUp, AlertCircle, ZoomIn, ZoomOut, Calendar } from "lucide-react";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Calendar as CalendarComponent } from "./ui/calendar";
import { DateRange } from "react-day-picker";

interface InterfaceChartProps {
  interfaceData: DeviceInterface;
}

const TIME_RANGES = [
  { value: "1", label: "1h", hours: 1 },
  { value: "6", label: "6h", hours: 6 },
  { value: "24", label: "24h", hours: 24 },
  { value: "168", label: "7d", hours: 168 },
  { value: "720", label: "30d", hours: 720 },
  { value: "8760", label: "1y", hours: 8760 },
];

export function InterfaceChart({ interfaceData }: InterfaceChartProps) {
  const [showChart, setShowChart] = useState(false);
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
  
  const { data, isLoading, error } = useQuery<InterfaceMetricsHistory[]>({
    queryKey: ["/api/interfaces", interfaceData.id, "history", useCustomRange ? customRange : timeRange],
    queryFn: async () => {
      const res = await fetch(`/api/interfaces/${interfaceData.id}/history?${getQueryParams()}`);
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || "Failed to fetch interface history");
      }
      return res.json();
    },
    enabled: showChart && !!interfaceData.id,
    refetchInterval: 30000,
  });

  const chartData = useMemo(() => {
    if (!data || !Array.isArray(data)) return [];
    
    return data
      .slice()
      .reverse()
      .map((item) => {
        const timestamp = item.timestamp ? new Date(item.timestamp).getTime() : Date.now();
        return {
          timestamp,
          download: parseFloat(item.downloadMbps || "0"),
          upload: parseFloat(item.uploadMbps || "0"),
        };
      });
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

  const handleCustomRangeSelect = (range: DateRange | undefined) => {
    setCustomRange(range);
    if (range?.from && range?.to) {
      setUseCustomRange(true);
      setZoomDomain(null);
    }
  };

  const handlePresetClick = (value: string) => {
    setTimeRange(value);
    setUseCustomRange(false);
    setCustomRange(undefined);
    setZoomDomain(null);
  };

  const tooltipFormatter = (value: number, name: string) => {
    return [`${value.toFixed(2)} Mbps`, name === 'download' ? 'Down' : 'Up'];
  };

  const tooltipLabelFormatter = (label: number) => {
    return format(new Date(label), "PPpp");
  };

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
          <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-muted-foreground">History</span>
              {zoomDomain && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-4 text-[8px] px-1"
                  onClick={resetZoom}
                >
                  Reset
                </Button>
              )}
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              <Button
                variant="ghost"
                size="sm"
                className="h-4 px-1"
                onClick={handleZoomIn}
                disabled={displayData.length < 2}
                data-testid="button-zoom-in"
              >
                <ZoomIn className="w-3 h-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-4 px-1"
                onClick={handleZoomOut}
                disabled={!zoomDomain}
                data-testid="button-zoom-out"
              >
                <ZoomOut className="w-3 h-3" />
              </Button>
              
              {TIME_RANGES.map(range => (
                <Button
                  key={range.value}
                  variant={!useCustomRange && timeRange === range.value ? "secondary" : "ghost"}
                  size="sm"
                  className="h-4 text-[9px] px-1.5"
                  onClick={() => handlePresetClick(range.value)}
                >
                  {range.label}
                </Button>
              ))}
              
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={useCustomRange ? "secondary" : "ghost"}
                    size="sm"
                    className="h-4 px-1"
                    data-testid="button-custom-range"
                  >
                    <Calendar className="w-3 h-3" />
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

          {error ? (
            <div className="h-[60px] flex items-center justify-center gap-2 text-destructive text-[10px]">
              <AlertCircle className="w-3 h-3" />
              <span>Failed to load history</span>
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : displayData.length > 0 ? (
            <div className="h-[120px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={displayData} margin={{ top: 5, right: 5, left: 0, bottom: 20 }}>
                  <XAxis 
                    dataKey="timestamp"
                    type="number"
                    scale="time"
                    domain={['dataMin', 'dataMax']}
                    tickFormatter={getTickFormatter()}
                    tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }}
                    tickLine={false}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                    tickCount={6}
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
                    labelStyle={{ color: 'hsl(var(--foreground))', fontSize: '10px', marginBottom: '4px' }}
                    formatter={tooltipFormatter}
                    labelFormatter={tooltipLabelFormatter}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="download" 
                    stroke="hsl(var(--status-green))" 
                    strokeWidth={1.5}
                    dot={false}
                    name="download"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="upload" 
                    stroke="hsl(var(--status-blue))" 
                    strokeWidth={1.5}
                    dot={false}
                    name="upload"
                  />
                  <Brush 
                    dataKey="timestamp"
                    height={15}
                    stroke="hsl(var(--border))"
                    fill="hsl(var(--secondary))"
                    onChange={handleBrushChange}
                    tickFormatter={(ts) => format(new Date(ts), "HH:mm")}
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
