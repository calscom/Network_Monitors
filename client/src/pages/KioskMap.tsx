import { useDevices } from "@/hooks/use-devices";
import { NetworkMap } from "@/components/NetworkMap";
import { NetworkMapCardSkin } from "@/components/NetworkMapCardSkin";
import { Loader2, Activity, AlertCircle, Users, LayoutGrid, LayoutList } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSites } from "@/hooks/use-sites";
import { useQuery } from "@tanstack/react-query";

type MapSkin = "classic" | "card";
const SKIN_STORAGE_KEY = "networkMapSkin";

function loadSavedSkin(): MapSkin {
  try {
    const saved = localStorage.getItem(SKIN_STORAGE_KEY);
    if (saved === "classic" || saved === "card") return saved;
    return "classic";
  } catch {
    return "classic";
  }
}

export default function KioskMap() {
  const { data: devices = [], isLoading } = useDevices();
  const { siteNames: sites, isLoading: sitesLoading } = useSites();
  const [currentSkin, setCurrentSkin] = useState<MapSkin>(loadSavedSkin);
  
  const { data: activeUsersData } = useQuery<{ count: number }>({
    queryKey: ['/api/user-sessions/count'],
    refetchInterval: 5000,
  });

  const handleSkinChange = (skin: MapSkin) => {
    setCurrentSkin(skin);
    localStorage.setItem(SKIN_STORAGE_KEY, skin);
  };

  const stats = useMemo(() => {
    const total = devices.length;
    const online = devices.filter(d => d.status === "green").length;
    const critical = devices.filter(d => d.status === "red" || d.status === "blue").length;
    const deviceHotspotUsers = devices.reduce((sum, d) => sum + (d.activeUsers || 0), 0);
    // Prefer API count when available (even if 0), fall back to device data if API unavailable
    const activeUsers = activeUsersData?.count ?? deviceHotspotUsers;
    return { total, online, critical, activeUsers };
  }, [devices, activeUsersData]);

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
      <div className="grid grid-cols-5 gap-3 mb-2">
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
        
        <Card className="p-3 flex items-center justify-between" data-testid="card-hotspot-users">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Active Users</p>
            <p className="text-2xl font-bold text-blue-500">{stats.activeUsers}</p>
          </div>
          <Users className="h-8 w-8 text-blue-500" />
        </Card>
        
        <Card className="p-3 flex items-center justify-between" data-testid="card-skin-selector">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Layout</p>
            <div className="flex gap-1 mt-1">
              <Button
                size="sm"
                variant={currentSkin === "classic" ? "default" : "outline"}
                onClick={() => handleSkinChange("classic")}
                className="h-7 px-2"
                data-testid="button-skin-classic"
              >
                <LayoutGrid className="w-4 h-4 mr-1" />
                Classic
              </Button>
              <Button
                size="sm"
                variant={currentSkin === "card" ? "default" : "outline"}
                onClick={() => handleSkinChange("card")}
                className="h-7 px-2"
                data-testid="button-skin-card"
              >
                <LayoutList className="w-4 h-4 mr-1" />
                Card
              </Button>
            </div>
          </div>
        </Card>
      </div>
      
      <div className="flex-1 min-h-0">
        {currentSkin === "classic" ? (
          <NetworkMap 
            devices={devices} 
            sites={sites}
            kioskMode={true}
          />
        ) : (
          <NetworkMapCardSkin 
            devices={devices} 
            sites={sites}
          />
        )}
      </div>
    </div>
  );
}
