import { useDevices } from "@/hooks/use-devices";
import { NetworkMap } from "@/components/NetworkMap";
import { Loader2, Activity, AlertCircle } from "lucide-react";
import { useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { useSites } from "@/hooks/use-sites";

export default function KioskMap() {
  const { data: devices = [], isLoading } = useDevices();
  const { siteNames: sites, isLoading: sitesLoading } = useSites();

  const stats = useMemo(() => {
    const total = devices.length;
    const online = devices.filter(d => d.status === "online").length;
    const critical = devices.filter(d => d.status === "offline" || d.status === "recovering").length;
    return { total, online, critical };
  }, [devices]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  if (isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading Network Map...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-background p-2 flex flex-col" data-testid="kiosk-map-page">
      <div className="grid grid-cols-3 gap-3 mb-2">
        <Card className="p-3 flex items-center justify-between" data-testid="card-total-devices">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Devices</p>
            <p className="text-2xl font-bold text-primary">{stats.total}</p>
          </div>
          <Activity className="h-8 w-8 text-primary" />
        </Card>
        
        <Card className="p-3 flex items-center justify-between" data-testid="card-online-stable">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Online & Stable</p>
            <p className="text-2xl font-bold text-green-500">{stats.online}</p>
          </div>
          <div className="h-3 w-3 rounded-full bg-green-500" />
        </Card>
        
        <Card className="p-3 flex items-center justify-between" data-testid="card-critical-recovering">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Critical / Recovering</p>
            <p className="text-2xl font-bold text-red-500">{stats.critical}</p>
          </div>
          <AlertCircle className="h-8 w-8 text-red-500" />
        </Card>
      </div>
      
      <div className="flex-1 min-h-0">
        <NetworkMap 
          devices={devices} 
          sites={sites}
          kioskMode={true}
        />
      </div>
    </div>
  );
}
