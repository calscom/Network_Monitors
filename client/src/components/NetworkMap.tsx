import { useMemo, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Device } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Server, Router, Wifi, Radio, Users, MonitorSmartphone } from "lucide-react";

interface NetworkMapProps {
  devices: Device[];
  sites: string[];
  onSiteClick?: (site: string) => void;
}

interface SiteColumn {
  site: string;
  devices: Device[];
  onlineCount: number;
  offlineCount: number;
  totalDevices: number;
  status: "up" | "down" | "mixed" | "empty";
}

function DeviceIcon({ type, className }: { type: string; className?: string }) {
  switch (type.toLowerCase()) {
    case "router":
    case "mikrotik":
      return <Router className={className} />;
    case "switch":
      return <Server className={className} />;
    case "unifi":
    case "access_point":
    case "ap":
      return <Wifi className={className} />;
    case "radio":
      return <Radio className={className} />;
    default:
      return <MonitorSmartphone className={className} />;
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case "green":
      return { bg: "bg-green-500", border: "border-green-500", text: "text-green-500" };
    case "yellow":
      return { bg: "bg-yellow-500", border: "border-yellow-500", text: "text-yellow-500" };
    case "blue":
      return { bg: "bg-blue-500", border: "border-blue-500", text: "text-blue-500" };
    case "red":
    default:
      return { bg: "bg-red-500", border: "border-red-500", text: "text-red-500" };
  }
}

function DeviceNode({ device, index }: { device: Device; index: number }) {
  const statusColor = getStatusColor(device.status);
  const utilization = device.utilization || 0;
  
  const getUtilizationColor = (util: number) => {
    if (util < 25) return "bg-green-500";
    if (util < 50) return "bg-green-400";
    if (util < 75) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className="relative"
      data-testid={`device-node-${device.id}`}
    >
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${statusColor.bg} shadow-lg`} 
             style={{ boxShadow: device.status === "green" ? "0 0 6px rgb(34 197 94)" : device.status === "red" ? "0 0 6px rgb(239 68 68)" : "none" }} />
        
        <div className={`flex items-center gap-2 px-2 py-1 rounded border ${statusColor.border} bg-card/80`}>
          <DeviceIcon type={device.type} className={`w-3 h-3 ${statusColor.text}`} />
          <span className="text-[10px] font-medium truncate max-w-[80px]">{device.name}</span>
        </div>
      </div>
      
      {device.status === "green" && utilization > 0 && (
        <div className="mt-1 ml-4">
          <div className="flex items-center gap-1">
            <div className="w-16 h-1.5 bg-secondary rounded-full overflow-hidden">
              <div 
                className={`h-full ${getUtilizationColor(utilization)} transition-all duration-300`}
                style={{ width: `${Math.min(utilization, 100)}%` }}
              />
            </div>
            <span className="text-[8px] text-muted-foreground">{utilization}%</span>
          </div>
        </div>
      )}
    </motion.div>
  );
}

function SiteColumnComponent({ column, index, onSiteClick }: { 
  column: SiteColumn; 
  index: number;
  onSiteClick?: (site: string) => void;
}) {
  const getSiteStatusColor = () => {
    if (column.status === "up") return "border-t-green-500 bg-green-500/5";
    if (column.status === "down") return "border-t-red-500 bg-red-500/5";
    if (column.status === "mixed") return "border-t-yellow-500 bg-yellow-500/5";
    return "border-t-muted-foreground/30 bg-muted/5";
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className={`flex flex-col min-w-[140px] max-w-[180px] border border-border/50 rounded-lg overflow-hidden ${getSiteStatusColor()} border-t-4 hover-elevate cursor-pointer`}
      onClick={() => onSiteClick?.(column.site)}
      data-testid={`site-column-${index}`}
    >
      <div className="p-2 border-b border-border/30 bg-card/50">
        <h3 className="text-xs font-semibold text-foreground truncate" title={column.site}>
          {column.site}
        </h3>
        <div className="flex items-center gap-1 mt-1">
          <span className="text-[9px] text-green-500">{column.onlineCount} up</span>
          <span className="text-[9px] text-muted-foreground">/</span>
          <span className="text-[9px] text-red-500">{column.offlineCount} down</span>
        </div>
      </div>

      <div className="flex-1 p-2 space-y-2 min-h-[200px] max-h-[400px] overflow-y-auto">
        {column.devices.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground/50 text-[10px] italic">
            No devices
          </div>
        ) : (
          <>
            {column.devices.map((device, idx) => (
              <div key={device.id} className="relative">
                {idx > 0 && (
                  <div className="absolute -top-1 left-[3px] w-[1px] h-2 bg-border/50" />
                )}
                <DeviceNode device={device} index={idx} />
                {idx < column.devices.length - 1 && (
                  <div className="absolute bottom-0 left-[3px] w-[1px] h-2 bg-border/50" />
                )}
              </div>
            ))}
          </>
        )}
      </div>

      <div className="p-2 border-t border-border/30 bg-card/30">
        <div className="flex items-center justify-center gap-1 text-muted-foreground">
          <Users className="w-3 h-3" />
          <span className="text-[10px] font-mono">{column.totalDevices}</span>
        </div>
      </div>
    </motion.div>
  );
}

export function NetworkMap({ devices, sites, onSiteClick }: NetworkMapProps) {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const columns = useMemo<SiteColumn[]>(() => {
    return sites.map(site => {
      const siteDevices = devices.filter(d => d.site === site);
      const onlineCount = siteDevices.filter(d => d.status === "green").length;
      const offlineCount = siteDevices.filter(d => d.status === "red" || d.status === "blue").length;
      
      let status: "up" | "down" | "mixed" | "empty" = "empty";
      if (siteDevices.length > 0) {
        if (offlineCount === 0) status = "up";
        else if (onlineCount === 0) status = "down";
        else status = "mixed";
      }

      return {
        site,
        devices: siteDevices,
        onlineCount,
        offlineCount,
        totalDevices: siteDevices.length,
        status
      };
    });
  }, [devices, sites]);

  const formatDate = (date: Date) => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${months[date.getMonth()]} ${String(date.getDate()).padStart(2, "0")} ${date.getFullYear()}`;
  };

  const formatTime = (date: Date) => {
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`;
  };

  const totalOnline = devices.filter(d => d.status === "green").length;
  const totalOffline = devices.filter(d => d.status === "red" || d.status === "blue").length;
  const totalRecovering = devices.filter(d => d.status === "yellow" || d.status === "blue").length;

  return (
    <div className="glass rounded-xl overflow-hidden" data-testid="network-map-container">
      <div className="p-4 border-b border-border/30 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-foreground">Network Topology Map</h2>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Sites:</span>
            <span className="font-mono font-semibold">{sites.length}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Devices:</span>
            <span className="font-mono font-semibold">{devices.length}</span>
          </div>
        </div>
      </div>

      <div className="p-4 overflow-x-auto">
        <div className="flex gap-3 min-w-max">
          {columns.map((column, index) => (
            <SiteColumnComponent 
              key={column.site} 
              column={column} 
              index={index}
              onSiteClick={onSiteClick}
            />
          ))}
        </div>
      </div>

      <div className="p-4 border-t border-border/30 bg-card/30">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-1">
            <div className="w-24 h-3 rounded overflow-hidden flex">
              <div className="w-1/4 bg-green-500" title="0-25%" />
              <div className="w-1/4 bg-yellow-500" title="25-50%" />
              <div className="w-1/4 bg-orange-500" title="50-75%" />
              <div className="w-1/4 bg-red-500" title="75-100%" />
            </div>
            <span className="text-[10px] text-muted-foreground ml-2">Traffic Load</span>
          </div>

          <motion.div 
            className="text-2xl font-mono font-bold text-foreground tracking-wider"
            key={currentTime.getSeconds()}
            initial={{ opacity: 0.7 }}
            animate={{ opacity: 1 }}
            data-testid="live-clock"
          >
            {formatDate(currentTime)} {formatTime(currentTime)}
          </motion.div>

          <div className="flex items-center gap-3">
            <div className="text-[10px] font-semibold text-muted-foreground">Node Status</div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-gray-500 rounded-sm" />
              <span className="text-[9px] text-muted-foreground">disabled</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-red-500 rounded-sm" />
              <span className="text-[9px] text-muted-foreground">down</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-blue-500 rounded-sm" />
              <span className="text-[9px] text-muted-foreground">recovering</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-green-500 rounded-sm" />
              <span className="text-[9px] text-muted-foreground">up</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-yellow-500 rounded-sm" />
              <span className="text-[9px] text-muted-foreground">unknown</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center gap-6 mt-3 pt-3 border-t border-border/20">
          <Badge variant="outline" className="text-green-500 border-green-500/30 bg-green-500/10">
            {totalOnline} Online
          </Badge>
          <Badge variant="outline" className="text-red-500 border-red-500/30 bg-red-500/10">
            {totalOffline} Offline
          </Badge>
          <Badge variant="outline" className="text-blue-500 border-blue-500/30 bg-blue-500/10">
            {totalRecovering} Recovering
          </Badge>
        </div>
      </div>
    </div>
  );
}
