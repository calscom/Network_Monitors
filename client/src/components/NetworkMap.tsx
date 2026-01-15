import { useMemo, useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Device, DeviceLink } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Server, Router, Wifi, Radio, Users, MonitorSmartphone, LayoutGrid, GalleryHorizontal, Link2, Zap, Settings2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { LinkManagement } from "./LinkManagement";

interface NetworkMapProps {
  devices: Device[];
  sites: string[];
  onSiteClick?: (site: string) => void;
  kioskMode?: boolean;
}

interface SiteColumn {
  site: string;
  devices: Device[];
  onlineCount: number;
  offlineCount: number;
  totalDevices: number;
  activeUsers: number;
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

function TrafficIndicator({ trafficMbps, bandwidthMbps, status }: { trafficMbps: string; bandwidthMbps: number; status: string }) {
  const traffic = parseFloat(trafficMbps) || 0;
  const utilization = bandwidthMbps > 0 ? Math.min((traffic / bandwidthMbps) * 100, 100) : 0;
  
  const getTrafficColor = () => {
    if (status === 'down') return 'bg-red-500';
    if (utilization < 25) return 'bg-green-500';
    if (utilization < 50) return 'bg-green-400';
    if (utilization < 75) return 'bg-yellow-500';
    return 'bg-red-500';
  };
  
  return (
    <div className="flex items-center gap-1">
      <motion.div 
        className={`w-2 h-2 rounded-full ${getTrafficColor()}`}
        animate={{ 
          scale: status === 'up' ? [1, 1.2, 1] : 1,
          opacity: status === 'up' ? [0.7, 1, 0.7] : 0.5
        }}
        transition={{ 
          repeat: Infinity, 
          duration: 1.5,
          ease: "easeInOut"
        }}
      />
      <span className="text-[9px] font-mono text-muted-foreground">
        {traffic.toFixed(1)} Mbps
      </span>
    </div>
  );
}

function DeviceLinkLine({ link, sourceDevice, targetDevice }: { 
  link: DeviceLink; 
  sourceDevice?: Device;
  targetDevice?: Device;
}) {
  const traffic = parseFloat(link.currentTrafficMbps) || 0;
  const utilization = link.bandwidthMbps > 0 ? Math.min((traffic / link.bandwidthMbps) * 100, 100) : 0;
  
  const getLineColor = () => {
    if (link.status === 'down') return '#ef4444';
    if (link.status === 'degraded') return '#f59e0b';
    if (utilization < 50) return '#22c55e';
    if (utilization < 75) return '#eab308';
    return '#ef4444';
  };
  
  return (
    <motion.div 
      className="flex items-center gap-2 px-2 py-1 rounded border border-border/30 bg-card/50"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      data-testid={`device-link-${link.id}`}
    >
      <div className="flex items-center gap-1">
        <Link2 className="w-3 h-3 text-muted-foreground" />
        <span className="text-[9px] truncate max-w-[60px]">{sourceDevice?.name || 'Unknown'}</span>
      </div>
      
      <div className="flex-1 relative h-1 min-w-[30px] bg-border/30 rounded overflow-hidden">
        <motion.div 
          className="absolute inset-y-0 left-0 rounded"
          style={{ backgroundColor: getLineColor() }}
          initial={{ width: 0 }}
          animate={{ width: `${utilization}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
        <motion.div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(90deg, transparent 0%, ${getLineColor()}40 50%, transparent 100%)`
          }}
          animate={{ x: ['-100%', '200%'] }}
          transition={{ 
            repeat: Infinity, 
            duration: 2,
            ease: "linear"
          }}
        />
      </div>
      
      <div className="flex items-center gap-1">
        <span className="text-[9px] truncate max-w-[60px]">{targetDevice?.name || 'Unknown'}</span>
        <Zap className="w-3 h-3 text-yellow-500" />
      </div>
      
      <TrafficIndicator 
        trafficMbps={link.currentTrafficMbps} 
        bandwidthMbps={link.bandwidthMbps}
        status={link.status}
      />
    </motion.div>
  );
}

function DeviceNode({ device, index, showAvailability = false }: { device: Device; index: number; showAvailability?: boolean }) {
  const statusColor = getStatusColor(device.status);
  const utilization = device.utilization || 0;
  const availability = device.totalChecks > 0 
    ? ((device.successfulChecks / device.totalChecks) * 100).toFixed(2)
    : '0.00';
  
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
          {showAvailability && device.totalChecks > 0 && (
            <span className="text-[8px] text-muted-foreground ml-1">{availability}%</span>
          )}
        </div>
      </div>
      
      {device.status === "green" && utilization > 0 && (
        <div className="mt-1 ml-4">
          <div className="flex items-center gap-1">
            <div className="w-16 h-1.5 bg-secondary rounded-full overflow-hidden">
              <motion.div 
                className={`h-full ${getUtilizationColor(utilization)}`}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(utilization, 100)}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
            <span className="text-[8px] text-muted-foreground">{utilization}%</span>
          </div>
        </div>
      )}
    </motion.div>
  );
}

// Pattern matching helper - matches server/storage.ts::autoDiscoverLinks()
// Uses the same includes/startsWith logic as backend
function matchesPattern(name: string, patterns: string[]): boolean {
  const upperName = name.toUpperCase();
  return patterns.some(p => upperName.includes(p) || upperName.startsWith(p));
}

// Device hierarchy order based on naming patterns
// Patterns must match server/storage.ts::autoDiscoverLinks()
function getDeviceHierarchyOrder(name: string, type: string): number {
  if (matchesPattern(name, ['ISP-PE', 'ISP_PE', 'ISPPE'])) return 0;
  if (matchesPattern(name, ['ISP-CE', 'ISP_CE', 'ISPCE'])) return 1;
  if (matchesPattern(name, ['FW-', 'FW_', 'FW0', 'FW1'])) return 2;
  if (matchesPattern(name, ['RTR-', 'RTR_', 'RTR0', 'RTR1'])) return 3;
  if (matchesPattern(name, ['DST-', 'DST_', 'DTS-', 'DTS_', 'DST0', 'DTS0'])) return 4;
  if (matchesPattern(name, ['ACC-', 'ACC_', 'ACC0'])) return 5;
  if (type.toLowerCase() === 'unifi' || type.toLowerCase() === 'ap' || type.toLowerCase() === 'access_point' ||
      matchesPattern(name, ['UAP-', 'UAP_', 'AP-', 'AP_', 'UNIFI'])) return 6;
  return 7; // Other devices at the bottom
}

// Categorize devices by their role
function categorizeDevices(devices: Device[]) {
  const infrastructure: Device[] = []; // ISP-PE, ISP-CE, FW, RTR, DST
  const accessSwitches: Device[] = []; // ACC-01 to ACC-09
  const accessPoints: Device[] = []; // UniFi APs
  const others: Device[] = [];

  devices.forEach(device => {
    const type = device.type.toLowerCase();
    
    // Use matchesPattern helper - same patterns as getDeviceHierarchyOrder() and server/storage.ts
    if (matchesPattern(device.name, ['ISP-PE', 'ISP_PE', 'ISPPE']) ||
        matchesPattern(device.name, ['ISP-CE', 'ISP_CE', 'ISPCE']) ||
        matchesPattern(device.name, ['FW-', 'FW_', 'FW0', 'FW1']) ||
        matchesPattern(device.name, ['RTR-', 'RTR_', 'RTR0', 'RTR1']) ||
        matchesPattern(device.name, ['DST-', 'DST_', 'DTS-', 'DTS_', 'DST0', 'DTS0'])) {
      infrastructure.push(device);
    } else if (matchesPattern(device.name, ['ACC-', 'ACC_', 'ACC0'])) {
      accessSwitches.push(device);
    } else if (type === 'unifi' || type === 'ap' || type === 'access_point' ||
               matchesPattern(device.name, ['UAP-', 'UAP_', 'AP-', 'AP_', 'UNIFI'])) {
      accessPoints.push(device);
    } else {
      others.push(device);
    }
  });

  // Sort infrastructure by hierarchy
  infrastructure.sort((a, b) => getDeviceHierarchyOrder(a.name, a.type) - getDeviceHierarchyOrder(b.name, b.type));
  
  // Sort access switches by number
  accessSwitches.sort((a, b) => {
    const numA = parseInt(a.name.match(/\d+/)?.[0] || '0');
    const numB = parseInt(b.name.match(/\d+/)?.[0] || '0');
    return numA - numB;
  });
  
  // Sort access points by name
  accessPoints.sort((a, b) => a.name.localeCompare(b.name));

  return { infrastructure, accessSwitches, accessPoints, others };
}

function SiteColumnComponent({ column, index, onSiteClick, compact, deviceLinks, allDevices }: { 
  column: SiteColumn; 
  index: number;
  onSiteClick?: (site: string) => void;
  compact?: boolean;
  deviceLinks?: DeviceLink[];
  allDevices?: Device[];
}) {
  const getSiteStatusColor = () => {
    if (column.status === "up") return "border-t-green-500 bg-green-500/5";
    if (column.status === "down") return "border-t-red-500 bg-red-500/5";
    if (column.status === "mixed") return "border-t-yellow-500 bg-yellow-500/5";
    return "border-t-muted-foreground/30 bg-muted/5";
  };

  const siteDeviceIds = new Set(column.devices.map(d => d.id));
  const siteLinks = deviceLinks?.filter(l => 
    siteDeviceIds.has(l.sourceDeviceId) && siteDeviceIds.has(l.targetDeviceId)
  ) || [];

  // Categorize and sort devices for hierarchical display
  const { infrastructure, accessSwitches, accessPoints, others } = categorizeDevices(column.devices);
  
  // Determine AP matrix columns: 5 for Maiduguri, 2 for others
  const isMaiduguri = column.site.toLowerCase().includes('maiduguri');
  const apColumns = isMaiduguri ? 5 : 2;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className={`flex flex-col border border-border/50 rounded-lg overflow-hidden ${getSiteStatusColor()} border-t-4 hover-elevate cursor-pointer`}
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

      <div className="flex-1 p-2 space-y-2 min-h-[100px] max-h-[60vh] overflow-y-auto">
        {column.devices.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground/50 text-[10px] italic">
            No devices
          </div>
        ) : (
          <>
            {/* Infrastructure devices (ISP-PE → ISP-CE → FW → RTR → DST) */}
            {infrastructure.length > 0 && (
              <div className="space-y-1">
                {infrastructure.map((device, idx) => (
                  <div key={device.id} className="relative pl-2">
                    {/* Vertical connection line for hierarchy */}
                    {idx > 0 && (
                      <div className="absolute left-[3px] -top-1 w-[1px] h-3 bg-blue-500/50" />
                    )}
                    {idx < infrastructure.length - 1 && (
                      <div className="absolute left-[3px] bottom-0 w-[1px] h-2 bg-blue-500/50" />
                    )}
                    <DeviceNode device={device} index={idx} showAvailability={!compact} />
                  </div>
                ))}
              </div>
            )}
            
            {/* Access Switches (ACC-01 to ACC-09) */}
            {accessSwitches.length > 0 && (
              <div className="mt-2 pt-2 border-t border-border/20">
                <div className="text-[8px] text-muted-foreground mb-1 flex items-center gap-1">
                  <Server className="w-3 h-3" />
                  Access Switches ({accessSwitches.length})
                </div>
                <div className="space-y-1 pl-3">
                  {accessSwitches.map((device, idx) => (
                    <div key={device.id} className="relative">
                      {/* Horizontal connector from DST */}
                      <div className="absolute -left-2 top-1/2 w-2 h-[1px] bg-green-500/40" />
                      <DeviceNode device={device} index={idx} showAvailability={!compact} />
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Access Points (UniFi) - Matrix layout */}
            {accessPoints.length > 0 && (
              <div className="mt-2 pt-2 border-t border-border/20">
                <div className="text-[8px] text-muted-foreground mb-1 flex items-center gap-1">
                  <Wifi className="w-3 h-3" />
                  Access Points ({accessPoints.length})
                </div>
                <div 
                  className="grid gap-1 pl-2"
                  style={{ gridTemplateColumns: `repeat(${apColumns}, minmax(0, 1fr))` }}
                >
                  {accessPoints.map((device, idx) => (
                    <div key={device.id} className="relative">
                      <div className={`flex items-center gap-1 px-1 py-0.5 rounded border ${getStatusColor(device.status).border} bg-card/60`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${getStatusColor(device.status).bg}`} />
                        <Wifi className={`w-2 h-2 ${getStatusColor(device.status).text}`} />
                        <span className="text-[7px] truncate max-w-[40px]" title={device.name}>
                          {device.name.replace(/^AP-?|^UAP-?/i, '').slice(0, 6)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Other devices */}
            {others.length > 0 && (
              <div className="mt-2 pt-2 border-t border-border/20">
                <div className="text-[8px] text-muted-foreground mb-1">Other Devices ({others.length})</div>
                <div className="space-y-1">
                  {others.map((device, idx) => (
                    <DeviceNode key={device.id} device={device} index={idx} showAvailability={!compact} />
                  ))}
                </div>
              </div>
            )}
            
            {siteLinks.length > 0 && (
              <div className="mt-3 pt-2 border-t border-border/30 space-y-1">
                <div className="text-[9px] text-muted-foreground mb-1 flex items-center gap-1">
                  <Link2 className="w-3 h-3" />
                  Links ({siteLinks.length})
                </div>
                {siteLinks.slice(0, 3).map(link => (
                  <DeviceLinkLine 
                    key={link.id} 
                    link={link}
                    sourceDevice={allDevices?.find(d => d.id === link.sourceDeviceId)}
                    targetDevice={allDevices?.find(d => d.id === link.targetDeviceId)}
                  />
                ))}
                {siteLinks.length > 3 && (
                  <div className="text-[8px] text-muted-foreground text-center">
                    +{siteLinks.length - 3} more links
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <div className="p-2 border-t border-border/30 bg-card/30">
        <div className="flex items-center justify-between gap-2 text-muted-foreground">
          <div className="flex items-center gap-1" title="Devices">
            <Server className="w-3 h-3" />
            <span className="text-[10px] font-mono">{column.totalDevices}</span>
          </div>
          <div className="flex items-center gap-1 text-blue-400" title="Active Hotspot Users">
            <Users className="w-3 h-3" />
            <span className="text-[10px] font-mono font-semibold">{column.activeUsers}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function NetworkMap({ devices, sites, onSiteClick, kioskMode = false }: NetworkMapProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [layoutMode, setLayoutMode] = useState<"grid" | "horizontal">(() => {
    const saved = localStorage.getItem("networkMapLayout");
    return (saved === "horizontal" || saved === "grid") ? saved : "grid";
  });
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: deviceLinks = [] } = useQuery<DeviceLink[]>({
    queryKey: ['/api/device-links'],
    refetchInterval: 5000,
  });

  useEffect(() => {
    localStorage.setItem("networkMapLayout", layoutMode);
  }, [layoutMode]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const columns = useMemo<SiteColumn[]>(() => {
    return sites.map(site => {
      const siteDevices = devices.filter(d => d.site === site);
      const onlineCount = siteDevices.filter(d => d.status === "green").length;
      const offlineCount = siteDevices.filter(d => d.status === "red" || d.status === "blue").length;
      const activeUsers = siteDevices.reduce((sum, d) => sum + (d.activeUsers || 0), 0);
      
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
        activeUsers,
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
  const totalOffline = devices.filter(d => d.status === "red").length;
  const totalRecovering = devices.filter(d => d.status === "yellow" || d.status === "blue").length;
  const totalActiveUsers = devices.reduce((sum, d) => sum + (d.activeUsers || 0), 0);

  return (
    <div className={`glass rounded-xl overflow-hidden flex flex-col ${kioskMode ? 'h-full' : ''}`} data-testid="network-map-container" ref={containerRef}>
      <div className="p-3 border-b border-border/30 flex flex-wrap items-center justify-between gap-2">
        <h2 className={`font-semibold text-foreground ${kioskMode ? 'text-base' : 'text-lg'}`}>Network Topology Map</h2>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Sites:</span>
            <span className="font-mono font-semibold">{sites.length}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Devices:</span>
            <span className="font-mono font-semibold">{devices.length}</span>
          </div>
          {deviceLinks.length > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <Link2 className="w-3 h-3 text-muted-foreground" />
              <span className="font-mono font-semibold">{deviceLinks.length}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-xs">
            <Users className="w-3 h-3 text-blue-400" />
            <span className="font-mono font-semibold text-blue-400">{totalActiveUsers}</span>
          </div>
          <div className="flex items-center border border-border/50 rounded-md">
            <Button
              size="sm"
              variant={layoutMode === "grid" ? "default" : "ghost"}
              className="h-7 px-2 rounded-r-none"
              onClick={() => setLayoutMode("grid")}
              data-testid="button-layout-grid"
            >
              <LayoutGrid className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant={layoutMode === "horizontal" ? "default" : "ghost"}
              className="h-7 px-2 rounded-l-none"
              onClick={() => setLayoutMode("horizontal")}
              data-testid="button-layout-horizontal"
            >
              <GalleryHorizontal className="w-4 h-4" />
            </Button>
          </div>
          {!kioskMode && (
            <LinkManagement devices={devices} />
          )}
        </div>
      </div>

      <div className={`flex-1 p-3 overflow-auto ${kioskMode ? 'min-h-0' : ''}`}>
        <div 
          className={layoutMode === "horizontal" 
            ? "flex gap-2 min-w-max h-full" 
            : "grid gap-2 auto-rows-fr"
          }
          style={layoutMode === "grid" ? {
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))'
          } : undefined}
        >
          {columns.map((column, index) => (
            <SiteColumnComponent 
              key={column.site} 
              column={column} 
              index={index}
              onSiteClick={onSiteClick}
              compact={kioskMode}
              deviceLinks={deviceLinks}
              allDevices={devices}
            />
          ))}
        </div>
      </div>

      <div className="p-2 border-t border-border/30 bg-card/30">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <div className="w-20 h-2 rounded overflow-hidden flex">
              <div className="w-1/4 bg-green-500" title="0-25%" />
              <div className="w-1/4 bg-yellow-500" title="25-50%" />
              <div className="w-1/4 bg-orange-500" title="50-75%" />
              <div className="w-1/4 bg-red-500" title="75-100%" />
            </div>
            <span className="text-[9px] text-muted-foreground ml-1">Load</span>
          </div>

          <motion.div 
            className={`font-mono font-bold text-foreground tracking-wider ${kioskMode ? 'text-xl' : 'text-lg'}`}
            key={currentTime.getSeconds()}
            initial={{ opacity: 0.7 }}
            animate={{ opacity: 1 }}
            data-testid="live-clock"
          >
            {formatDate(currentTime)} {formatTime(currentTime)}
          </motion.div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[9px] text-muted-foreground">Status:</span>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-green-500 rounded-sm" />
              <span className="text-[8px] text-muted-foreground">up</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-red-500 rounded-sm" />
              <span className="text-[8px] text-muted-foreground">down</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-blue-500 rounded-sm" />
              <span className="text-[8px] text-muted-foreground">recovering</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-yellow-500 rounded-sm" />
              <span className="text-[8px] text-muted-foreground">unknown</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center gap-4 mt-2 pt-2 border-t border-border/20 flex-wrap">
          <Badge variant="outline" className="text-green-500 border-green-500/30 bg-green-500/10">
            {totalOnline} Online
          </Badge>
          <Badge variant="outline" className="text-red-500 border-red-500/30 bg-red-500/10">
            {totalOffline} Offline
          </Badge>
          <Badge variant="outline" className="text-blue-500 border-blue-500/30 bg-blue-500/10">
            {totalRecovering} Recovering
          </Badge>
          <Badge variant="outline" className="text-purple-500 border-purple-500/30 bg-purple-500/10">
            <Users className="w-3 h-3 mr-1" />
            {totalActiveUsers} Hotspot Users
          </Badge>
        </div>
      </div>
    </div>
  );
}
