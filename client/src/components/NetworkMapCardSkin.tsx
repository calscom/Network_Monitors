import { useMemo } from "react";
import { Device } from "@shared/schema";
import { CheckCircle, XCircle, Monitor, Users } from "lucide-react";

interface NetworkMapCardSkinProps {
  devices: Device[];
  sites: string[];
}

interface SiteData {
  site: string;
  devices: Device[];
  onlineCount: number;
  offlineCount: number;
  deviceCount: number;
  userCount: number;
}

function getStatusIcon(status: string) {
  if (status === "green" || status === "blue") {
    return <CheckCircle className="w-4 h-4 text-green-500" />;
  }
  return <XCircle className="w-4 h-4 text-red-500" />;
}

function formatAvailability(device: Device): string {
  if (device.totalChecks === 0) return "0.00%";
  const availability = (device.successfulChecks / device.totalChecks) * 100;
  return `${availability.toFixed(2)}%`;
}

function formatTrafficPercent(device: Device): string {
  const download = parseFloat(device.downloadMbps) || 0;
  const upload = parseFloat(device.uploadMbps) || 0;
  const total = download + upload;
  if (total === 0) return "";
  if (total >= 1000) return `${(total / 1000).toFixed(0)}G`;
  return `${Math.round(total)}%`;
}

function DeviceRow({ device, showTrafficLine = false }: { device: Device; showTrafficLine?: boolean }) {
  const isOnline = device.status === "green" || device.status === "blue";
  const availability = formatAvailability(device);
  const trafficPercent = formatTrafficPercent(device);
  
  return (
    <div className="flex flex-col items-center" data-testid={`card-device-${device.id}`}>
      {showTrafficLine && (
        <div className="flex flex-col items-center mb-1">
          <div className={`w-0.5 h-4 ${isOnline ? 'bg-green-500' : 'bg-red-500'}`} />
          {trafficPercent && (
            <span className="text-[10px] text-muted-foreground">{trafficPercent}</span>
          )}
        </div>
      )}
      <div 
        className={`flex items-center gap-2 px-3 py-1.5 rounded-md border ${
          isOnline 
            ? 'bg-green-500/10 border-green-500/30' 
            : 'bg-red-500/10 border-red-500/30'
        }`}
      >
        {getStatusIcon(device.status)}
        <span className={`text-sm font-medium ${isOnline ? 'text-green-400' : 'text-red-400'}`}>
          {device.name}
        </span>
        <span className={`text-xs px-1.5 py-0.5 rounded ${
          isOnline ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'
        }`}>
          {availability}
        </span>
      </div>
    </div>
  );
}

function SiteCard({ siteData }: { siteData: SiteData }) {
  const hasOffline = siteData.offlineCount > 0;
  const borderColor = hasOffline ? 'border-l-yellow-500' : 'border-l-green-500';
  
  return (
    <div 
      className={`flex flex-col bg-card/50 border border-border rounded-lg overflow-hidden border-l-4 ${borderColor}`}
      data-testid={`card-site-${siteData.site}`}
    >
      <div className="px-4 py-3 border-b border-border/50">
        <h3 className="text-lg font-bold text-foreground">{siteData.site}</h3>
        <p className="text-sm">
          <span className="text-green-500">{siteData.onlineCount} up</span>
          <span className="text-muted-foreground"> / </span>
          <span className="text-red-500">{siteData.offlineCount} down</span>
        </p>
      </div>
      
      <div className="flex-1 px-4 py-3 space-y-2 overflow-y-auto min-h-[200px]">
        {siteData.devices.map((device, index) => (
          <DeviceRow 
            key={device.id} 
            device={device} 
            showTrafficLine={index > 0}
          />
        ))}
        {siteData.devices.length === 0 && (
          <p className="text-muted-foreground text-sm text-center py-4">No devices</p>
        )}
      </div>
      
      <div className="px-4 py-2 border-t border-border/50 flex items-center justify-between text-sm text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Monitor className="w-4 h-4" />
          <span>{siteData.deviceCount}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Users className="w-4 h-4" />
          <span>{siteData.userCount}</span>
        </div>
      </div>
    </div>
  );
}

export function NetworkMapCardSkin({ devices, sites }: NetworkMapCardSkinProps) {
  const siteDataList = useMemo(() => {
    return sites.map(site => {
      const siteDevices = devices.filter(d => d.site === site);
      const onlineCount = siteDevices.filter(d => d.status === "green" || d.status === "blue").length;
      const offlineCount = siteDevices.filter(d => d.status === "red").length;
      const userCount = siteDevices.reduce((sum, d) => sum + (d.activeUsers || 0), 0);
      
      const sortedDevices = [...siteDevices].sort((a, b) => {
        const aOnline = a.status === "green" || a.status === "blue" ? 1 : 0;
        const bOnline = b.status === "green" || b.status === "blue" ? 1 : 0;
        if (aOnline !== bOnline) return bOnline - aOnline;
        return a.name.localeCompare(b.name);
      });
      
      return {
        site,
        devices: sortedDevices,
        onlineCount,
        offlineCount,
        deviceCount: siteDevices.length,
        userCount
      };
    }).filter(s => s.devices.length > 0);
  }, [devices, sites]);

  return (
    <div 
      className="h-full overflow-auto p-4"
      data-testid="network-map-card-skin"
    >
      <div className="grid gap-4 auto-rows-max" style={{
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))'
      }}>
        {siteDataList.map(siteData => (
          <SiteCard key={siteData.site} siteData={siteData} />
        ))}
      </div>
    </div>
  );
}
