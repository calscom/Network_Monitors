import { useDevices } from "@/hooks/use-devices";
import { NetworkMap } from "@/components/NetworkMap";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

const DEFAULT_SITES = [
  "01 Cloud", "02-Maiduguri", "03-Gwoza", "04-Mafa", "05-Dikwa",
  "06-Ngala", "07-Monguno", "08-Bama", "09-Banki", "10-Pulka",
  "11-Damboa", "12-Gubio"
];

export default function KioskMap() {
  const { data: devices = [], isLoading } = useDevices();
  
  const [sites] = useState<string[]>(() => {
    const saved = localStorage.getItem("monitor_sites");
    return saved ? JSON.parse(saved) : DEFAULT_SITES;
  });

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
    <div className="fixed inset-0 bg-background p-2" data-testid="kiosk-map-page">
      <NetworkMap 
        devices={devices} 
        sites={sites}
        kioskMode={true}
      />
    </div>
  );
}
