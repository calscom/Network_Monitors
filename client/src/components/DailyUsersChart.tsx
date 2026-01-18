import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Users, TrendingUp } from "lucide-react";
import { useMemo } from "react";

interface DailyStats {
  id: number;
  deviceId: number | null;
  site: string;
  date: string;
  totalUsers: number;
  peakUsers: number;
  totalUploadBytes: string;
  totalDownloadBytes: string;
  createdAt: string;
}

export function DailyUsersChart() {
  const { data: dailyStats = [], isLoading } = useQuery<DailyStats[]>({
    queryKey: ['/api/user-stats/daily', { days: 14 }],
    refetchInterval: 60000,
  });

  const chartData = useMemo(() => {
    const grouped: Record<string, { total: number; peak: number }> = {};
    
    dailyStats.forEach(stat => {
      const dateKey = new Date(stat.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (!grouped[dateKey]) {
        grouped[dateKey] = { total: 0, peak: 0 };
      }
      grouped[dateKey].total += stat.totalUsers;
      grouped[dateKey].peak = Math.max(grouped[dateKey].peak, stat.peakUsers);
    });
    
    return Object.entries(grouped).map(([date, values]) => ({
      date,
      total: values.total,
      peak: values.peak
    }));
  }, [dailyStats]);

  const maxValue = useMemo(() => {
    return Math.max(...chartData.map(d => Math.max(d.total, d.peak)), 10);
  }, [chartData]);

  const handleExportCSV = () => {
    window.open('/api/user-sessions/export', '_blank');
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Users className="h-4 w-4" />
            Daily Active Users
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-40 flex items-center justify-center text-muted-foreground">
            Loading...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-daily-users">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          Daily Active Users (14 Days)
        </CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportCSV}
          className="h-7 px-2 text-xs"
          data-testid="button-export-csv"
        >
          <Download className="h-3 w-3 mr-1" />
          Export CSV
        </Button>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">
            No user data available yet. Data will appear after polling devices with User Manager API.
          </div>
        ) : (
          <div className="h-40">
            <div className="flex items-end justify-between h-32 gap-1">
              {chartData.map((item, index) => (
                <div key={index} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex flex-col items-center justify-end h-28 gap-0.5">
                    <div
                      className="w-full max-w-8 bg-blue-500 rounded-t transition-all"
                      style={{ height: `${(item.total / maxValue) * 100}%`, minHeight: item.total > 0 ? '4px' : '0' }}
                      title={`Total: ${item.total}`}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground truncate w-full text-center">
                    {item.date}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-center gap-4 mt-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-blue-500 rounded" />
                <span>Active Users</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
