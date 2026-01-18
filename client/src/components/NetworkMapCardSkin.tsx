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
  if (status === "green") {
    return <CheckCircle className="w-4 h-4 text-green-500" />;
  }
  if (status === "blue") {
    return <CheckCircle className="w-4 h-4 text-blue-500" />;
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

function getStatusColors(status: string) {
  if (status === "green") {
    return { bg: 'bg-green-500/10', border: 'border-green-500/30', text: 'text-green-400', badge: 'bg-green-500/20 text-green-300', line: 'bg-green-500' };
  }
  if (status === "blue") {
    return { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400', badge: 'bg-blue-500/20 text-blue-300', line: 'bg-blue-500' };
  }
  return { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400', badge: 'bg-red-500/20 text-red-300', line: 'bg-red-500' };
}

function DeviceRow({ device, showTrafficLine = false }: { device: Device; showTrafficLine?: boolean }) {
  const availability = formatAvailability(device);
  const trafficPercent = formatTrafficPercent(device);
  const colors = getStatusColors(device.status);
  
  return (
    <div className="flex flex-col items-center" data-testid={`card-device-${device.id}`}>
      {showTrafficLine && (
        <div className="flex flex-col items-center mb-1">
          <div className={`w-0.5 h-4 ${colors.line}`} />
          {trafficPercent && (
            <span className="text-[10px] text-muted-foreground">{trafficPercent}</span>
          )}
        </div>
      )}
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-md border ${colors.bg} ${colors.border}`}>
        {getStatusIcon(device.status)}
        <span className={`text-sm font-medium ${colors.text}`}>
          {device.name}
        </span>
        <span className={`text-xs px-1.5 py-0.5 rounded ${colors.badge}`}>
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
      // Count only green as "up", blue (recovering) and red (offline) as "down"
      // This matches the dashboard's "Online & Stable" vs "Critical / Recovering" terminology
      const onlineCount = siteDevices.filter(d => d.status === "green").length;
      const offlineCount = siteDevices.filter(d => d.status === "red" || d.status === "blue").length;
      const userCount = siteDevices.reduce((sum, d) => sum + (d.activeUsers || 0), 0);
      
      // Sort: green first, then blue (recovering), then red (offline)
      const statusOrder: Record<string, number> = { green: 0, blue: 1, red: 2 };
      const sortedDevices = [...siteDevices].sort((a, b) => {
        const aOrder = statusOrder[a.status] ?? 3;
        const bOrder = statusOrder[b.status] ?? 3;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return a.name.localeCompare(b.name);
      });
      
      return {
        site,
        devices: sortedDevices,
        onlineCount, // Only green = "up"
        offlineCount, // Blue + Red = "down" (matches dashboard Critical/Recovering)
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
