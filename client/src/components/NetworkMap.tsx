import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { Device, DeviceLink } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Users, LayoutGrid, GalleryHorizontal, Link2, RotateCcw, Move, Lock, Unlock } from "lucide-react";
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

interface Position {
  x: number;
  y: number;
}

interface LayoutPositions {
  [deviceId: string]: Position;
}

const LAYOUT_STORAGE_KEY = "networkMapDevicePositions";

function loadSavedPositions(): LayoutPositions {
  try {
    const saved = localStorage.getItem(LAYOUT_STORAGE_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

function savePositions(positions: LayoutPositions) {
  localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(positions));
}

function getStatusColor(status: string) {
  switch (status) {
    case "green":
      return { bg: "bg-green-500", border: "border-green-500", text: "text-green-500", hex: "#22c55e" };
    case "yellow":
      return { bg: "bg-yellow-500", border: "border-yellow-500", text: "text-yellow-500", hex: "#eab308" };
    case "blue":
      return { bg: "bg-blue-500", border: "border-blue-500", text: "text-blue-500", hex: "#3b82f6" };
    case "red":
      return { bg: "bg-red-500", border: "border-red-500", text: "text-red-500", hex: "#ef4444" };
    default:
      return { bg: "bg-gray-500", border: "border-gray-500", text: "text-gray-500", hex: "#6b7280" };
  }
}

function getUtilizationColor(utilization: number): string {
  if (utilization < 25) return "#22c55e";
  if (utilization < 50) return "#84cc16";
  if (utilization < 75) return "#eab308";
  if (utilization < 90) return "#f97316";
  return "#ef4444";
}

function formatTraffic(mbps: string | number): string {
  const value = typeof mbps === 'string' ? parseFloat(mbps) : mbps;
  if (isNaN(value) || value === 0) return "0";
  if (value >= 1000) return `${(value / 1000).toFixed(1)}G`;
  if (value >= 1) return `${value.toFixed(1)}M`;
  return `${(value * 1000).toFixed(0)}K`;
}

function matchesPattern(name: string, patterns: string[]): boolean {
  const upperName = name.toUpperCase();
  return patterns.some(p => upperName.includes(p) || upperName.startsWith(p));
}

function getDeviceCategory(device: Device): string {
  const name = device.name.toUpperCase();
  const type = device.type.toLowerCase();
  
  if (matchesPattern(name, ['ISP-PE', 'ISP_PE', 'ISPPE', 'PE-', 'PE_'])) return 'isp-pe';
  if (matchesPattern(name, ['ISP-CE', 'ISP_CE', 'ISPCE', 'CE-', 'CE_', 'STARLINK'])) return 'isp-ce';
  if (matchesPattern(name, ['FW-', 'FW_', 'FW0', 'FW1', 'FIREWALL', 'FORTI'])) return 'firewall';
  if (matchesPattern(name, ['RTR-', 'RTR_', 'RTR0', 'RTR1', 'ROUTER', 'CHR'])) return 'router';
  if (matchesPattern(name, ['DST-', 'DST_', 'DTS-', 'DTS_', 'DST0', 'DTS0', 'DIST'])) return 'distribution';
  if (matchesPattern(name, ['ACC-', 'ACC_', 'ACC0', 'ACCESS'])) return 'access';
  if (type === 'unifi' || type === 'ap' || type === 'access_point' ||
      matchesPattern(name, ['UAP-', 'UAP_', 'AP-', 'AP_', 'UNIFI'])) return 'ap';
  return 'other';
}

function getDeviceOrder(category: string): number {
  const order: Record<string, number> = {
    'isp-pe': 0,
    'isp-ce': 1,
    'firewall': 2,
    'router': 3,
    'distribution': 4,
    'access': 5,
    'ap': 6,
    'other': 7
  };
  return order[category] ?? 7;
}

interface DraggableDeviceBoxProps {
  device: Device;
  position: Position;
  onDragEnd: (deviceId: number, position: Position) => void;
  editMode: boolean;
  showTraffic?: boolean;
}

function DraggableDeviceBox({ device, position, onDragEnd, editMode, showTraffic = true }: DraggableDeviceBoxProps) {
  const statusColor = getStatusColor(device.status);
  const utilization = device.utilization || 0;
  const download = formatTraffic(device.downloadMbps);
  const upload = formatTraffic(device.uploadMbps);
  const hasTraffic = parseFloat(device.downloadMbps) > 0 || parseFloat(device.uploadMbps) > 0;
  
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [currentPos, setCurrentPos] = useState(position);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCurrentPos(position);
  }, [position]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!editMode) return;
    e.stopPropagation();
    e.preventDefault();
    
    const rect = boxRef.current?.getBoundingClientRect();
    const parent = boxRef.current?.parentElement;
    const parentRect = parent?.getBoundingClientRect();
    
    if (rect && parentRect) {
      const initialX = rect.left - parentRect.left;
      const initialY = rect.top - parentRect.top;
      
      setCurrentPos({ x: initialX, y: initialY });
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
      setIsDragging(true);
    }
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !boxRef.current) return;
    const parent = boxRef.current.parentElement;
    if (!parent) return;
    
    const parentRect = parent.getBoundingClientRect();
    const newX = e.clientX - parentRect.left - dragOffset.x;
    const newY = e.clientY - parentRect.top - dragOffset.y;
    
    setCurrentPos({ x: newX, y: newY });
  }, [isDragging, dragOffset]);

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      onDragEnd(device.id, currentPos);
    }
  }, [isDragging, device.id, currentPos, onDragEnd]);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);
  
  const hasCustomPosition = position.x !== 0 || position.y !== 0;
  const shouldBeAbsolute = isDragging || hasCustomPosition;
  
  return (
    <div 
      ref={boxRef}
      className={`relative flex flex-col items-center ${editMode ? 'cursor-move' : ''} ${isDragging ? 'z-50' : 'z-10'}`}
      style={shouldBeAbsolute ? {
        position: 'absolute',
        left: currentPos.x,
        top: currentPos.y,
        transform: isDragging ? 'scale(1.05)' : 'scale(1)',
        transition: isDragging ? 'none' : 'transform 0.1s'
      } : undefined}
      onMouseDown={handleMouseDown}
      data-testid={`device-box-${device.id}`}
    >
      <div 
        className={`relative px-2 py-1 rounded border-2 ${statusColor.bg}/20 min-w-[60px] text-center ${editMode ? 'ring-2 ring-blue-500/30' : ''}`}
        style={{ borderColor: statusColor.hex }}
      >
        {editMode && (
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full flex items-center justify-center">
            <Move className="w-2 h-2 text-white" />
          </div>
        )}
        <div className="text-[8px] font-bold text-foreground truncate max-w-[80px]" title={device.name}>
          {device.name}
        </div>
        
        {showTraffic && device.status === 'green' && hasTraffic && (
          <div className="mt-1 flex items-center justify-center gap-1 text-[7px]">
            <span className="text-green-400">{download}</span>
            <span className="text-muted-foreground">/</span>
            <span className="text-blue-400">{upload}</span>
          </div>
        )}
      </div>
      
      {device.status === 'green' && utilization > 0 && (
        <div className="w-full mt-0.5 px-1">
          <div 
            className="h-1 rounded-full overflow-hidden bg-gray-700"
            title={`${utilization}% utilization`}
          >
            <div 
              className="h-full rounded-full transition-all duration-300"
              style={{ 
                width: `${Math.min(utilization, 100)}%`,
                backgroundColor: getUtilizationColor(utilization)
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function LinkLine({ link, toDevice }: { 
  link?: DeviceLink;
  toDevice: Device;
}) {
  const statusColor = getStatusColor(toDevice.status);
  const linkStatus = link?.status || toDevice.status;
  const lineColor = linkStatus === 'down' ? '#ef4444' : linkStatus === 'degraded' ? '#eab308' : statusColor.hex;
  
  const trafficMbps = link ? parseFloat(link.currentTrafficMbps) : 0;
  const showTraffic = link && trafficMbps > 0;
  
  return (
    <div className="flex flex-col items-center py-0.5">
      <div 
        className="w-0.5 h-3"
        style={{ backgroundColor: lineColor }}
      />
      {showTraffic && (
        <div className="text-[6px] bg-background/80 px-0.5 rounded text-center">
          <span className="text-yellow-400">{formatTraffic(trafficMbps)}</span>
        </div>
      )}
      <div 
        className="w-0.5 h-3"
        style={{ backgroundColor: lineColor }}
      />
    </div>
  );
}

function CompactDeviceBox({ device, editMode, position, onDragEnd }: { 
  device: Device; 
  editMode: boolean;
  position: Position;
  onDragEnd: (deviceId: number, position: Position) => void;
}) {
  const statusColor = getStatusColor(device.status);
  const shortName = device.name
    .replace(/^(UAP-?|AP-?|UNIFI-?|ACC-?|ACCESS-?)/i, '')
    .slice(0, 6);
  
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [currentPos, setCurrentPos] = useState(position);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCurrentPos(position);
  }, [position]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!editMode) return;
    e.stopPropagation();
    e.preventDefault();
    
    const rect = boxRef.current?.getBoundingClientRect();
    const parent = boxRef.current?.parentElement;
    const parentRect = parent?.getBoundingClientRect();
    
    if (rect && parentRect) {
      const initialX = rect.left - parentRect.left;
      const initialY = rect.top - parentRect.top;
      
      setCurrentPos({ x: initialX, y: initialY });
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
      setIsDragging(true);
    }
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !boxRef.current) return;
    const parent = boxRef.current.parentElement;
    if (!parent) return;
    
    const parentRect = parent.getBoundingClientRect();
    const newX = e.clientX - parentRect.left - dragOffset.x;
    const newY = e.clientY - parentRect.top - dragOffset.y;
    
    setCurrentPos({ x: newX, y: newY });
  }, [isDragging, dragOffset]);

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      onDragEnd(device.id, currentPos);
    }
  }, [isDragging, device.id, currentPos, onDragEnd]);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const hasCustomPosition = position.x !== 0 || position.y !== 0;
  const shouldBeAbsolute = isDragging || hasCustomPosition;
  
  return (
    <div 
      ref={boxRef}
      className={`px-1 py-0.5 rounded text-center border ${statusColor.bg}/30 ${editMode ? 'cursor-move ring-1 ring-blue-500/30' : ''} ${isDragging ? 'z-50' : ''} relative`}
      style={{
        borderColor: statusColor.hex,
        ...(shouldBeAbsolute ? {
          position: 'absolute' as const,
          left: currentPos.x,
          top: currentPos.y,
          transform: isDragging ? 'scale(1.05)' : 'scale(1)',
          transition: isDragging ? 'none' : 'transform 0.1s'
        } : {})
      }}
      title={device.name}
      data-testid={`compact-box-${device.id}`}
      onMouseDown={handleMouseDown}
    >
      {editMode && (
        <div className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full" />
      )}
      <div className="text-[6px] font-medium truncate text-foreground">
        {shortName}
      </div>
    </div>
  );
}

interface DeviceNode {
  device: Device;
  link?: DeviceLink;
  children: DeviceNode[];
}

function buildTopologyTree(
  devices: Device[], 
  links: DeviceLink[], 
  deviceMap: Map<number, Device>
): DeviceNode[] {
  const deviceIds = new Set(devices.map(d => d.id));
  const siteLinks = links.filter(l => 
    deviceIds.has(l.sourceDeviceId) && deviceIds.has(l.targetDeviceId)
  );
  
  const childToParent = new Map<number, { parentId: number; link: DeviceLink }>();
  siteLinks.forEach(link => {
    if (!childToParent.has(link.targetDeviceId)) {
      childToParent.set(link.targetDeviceId, { 
        parentId: link.sourceDeviceId, 
        link 
      });
    }
  });
  
  const hasParent = new Set(childToParent.keys());
  const rootDevices = devices.filter(d => !hasParent.has(d.id));
  
  rootDevices.sort((a, b) => {
    const orderA = getDeviceOrder(getDeviceCategory(a));
    const orderB = getDeviceOrder(getDeviceCategory(b));
    if (orderA !== orderB) return orderA - orderB;
    return a.name.localeCompare(b.name);
  });
  
  function buildNode(device: Device, visited: Set<number>): DeviceNode {
    if (visited.has(device.id)) {
      return { device, children: [] };
    }
    visited.add(device.id);
    
    const parentInfo = childToParent.get(device.id);
    
    const childLinks = siteLinks.filter(l => l.sourceDeviceId === device.id);
    const children: DeviceNode[] = [];
    
    childLinks.forEach(link => {
      const childDevice = deviceMap.get(link.targetDeviceId);
      if (childDevice && !visited.has(childDevice.id)) {
        const childNode = buildNode(childDevice, visited);
        childNode.link = link;
        children.push(childNode);
      }
    });
    
    children.sort((a, b) => {
      const orderA = getDeviceOrder(getDeviceCategory(a.device));
      const orderB = getDeviceOrder(getDeviceCategory(b.device));
      if (orderA !== orderB) return orderA - orderB;
      return a.device.name.localeCompare(b.device.name);
    });
    
    return {
      device,
      link: parentInfo?.link,
      children
    };
  }
  
  const visited = new Set<number>();
  const tree: DeviceNode[] = [];
  
  rootDevices.forEach(device => {
    if (!visited.has(device.id)) {
      tree.push(buildNode(device, visited));
    }
  });
  
  devices.forEach(device => {
    if (!visited.has(device.id)) {
      tree.push({ device, children: [] });
    }
  });
  
  return tree;
}

interface DeviceTreeRendererProps {
  node: DeviceNode;
  isGridItem?: boolean;
  editMode: boolean;
  positions: LayoutPositions;
  onDragEnd: (deviceId: number, position: Position) => void;
}

function DeviceTreeRenderer({ node, isGridItem = false, editMode, positions, onDragEnd }: DeviceTreeRendererProps) {
  const category = getDeviceCategory(node.device);
  const isCompact = category === 'ap' || category === 'access';
  const devicePos = positions[node.device.id] || { x: 0, y: 0 };
  
  const compactChildren = node.children.filter(c => {
    const cat = getDeviceCategory(c.device);
    return cat === 'ap' || cat === 'access';
  });
  
  const regularChildren = node.children.filter(c => {
    const cat = getDeviceCategory(c.device);
    return cat !== 'ap' && cat !== 'access';
  });
  
  if (isGridItem && isCompact) {
    return (
      <CompactDeviceBox 
        device={node.device} 
        editMode={editMode}
        position={devicePos}
        onDragEnd={onDragEnd}
      />
    );
  }
  
  return (
    <div className="flex flex-col items-center">
      {node.link && (
        <LinkLine link={node.link} toDevice={node.device} />
      )}
      
      {isCompact ? (
        <CompactDeviceBox 
          device={node.device} 
          editMode={editMode}
          position={devicePos}
          onDragEnd={onDragEnd}
        />
      ) : (
        <DraggableDeviceBox 
          device={node.device} 
          position={devicePos}
          onDragEnd={onDragEnd}
          editMode={editMode}
        />
      )}
      
      {regularChildren.length > 0 && (
        <div className="flex flex-col items-center">
          {regularChildren.map((child) => (
            <DeviceTreeRenderer 
              key={child.device.id} 
              node={child} 
              editMode={editMode}
              positions={positions}
              onDragEnd={onDragEnd}
            />
          ))}
        </div>
      )}
      
      {compactChildren.length > 0 && (
        <div className="mt-1">
          <div className="flex justify-center mb-0.5">
            <div className="w-0.5 h-2 bg-green-500/50" />
          </div>
          <div 
            className="grid gap-0.5 relative"
            style={{ 
              gridTemplateColumns: `repeat(${Math.min(compactChildren.length, 4)}, minmax(0, 1fr))` 
            }}
          >
            {compactChildren.map((child) => (
              <DeviceTreeRenderer 
                key={child.device.id} 
                node={child} 
                isGridItem 
                editMode={editMode}
                positions={positions}
                onDragEnd={onDragEnd}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SiteColumnView({ column, index, onSiteClick, deviceLinks, allDevices, editMode, positions, onDragEnd }: { 
  column: SiteColumn; 
  index: number;
  onSiteClick?: (site: string) => void;
  deviceLinks: DeviceLink[];
  allDevices: Device[];
  editMode: boolean;
  positions: LayoutPositions;
  onDragEnd: (deviceId: number, position: Position) => void;
}) {
  const deviceMap = useMemo(() => {
    const map = new Map<number, Device>();
    allDevices.forEach(d => map.set(d.id, d));
    return map;
  }, [allDevices]);
  
  const tree = useMemo(() => {
    return buildTopologyTree(column.devices, deviceLinks, deviceMap);
  }, [column.devices, deviceLinks, deviceMap]);
  
  const hasDownDevice = column.devices.some(d => d.status === 'red');
  const allDown = column.devices.length > 0 && column.devices.every(d => d.status === 'red');
  const headerBg = allDown ? 'bg-red-600' : hasDownDevice ? 'bg-yellow-600' : 'bg-green-600';
  
  const handleClick = (e: React.MouseEvent) => {
    if (editMode) {
      e.stopPropagation();
      return;
    }
    onSiteClick?.(column.site);
  };
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.02 }}
      className={`flex flex-col bg-card/80 border border-border/50 rounded overflow-hidden min-w-[120px] max-w-[160px] transition-colors ${editMode ? 'border-blue-500/50' : 'cursor-pointer hover:border-primary/50'}`}
      onClick={handleClick}
      data-testid={`site-column-${index}`}
    >
      <div className={`${headerBg} px-2 py-1 text-center`}>
        <div className="text-[9px] font-bold text-white truncate" title={column.site}>
          {column.site}
        </div>
      </div>
      
      <div className="flex-1 p-1 space-y-0.5 bg-gray-900/50 min-h-[200px] max-h-[70vh] overflow-y-auto relative">
        {column.devices.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground/50 text-[10px] italic">
            No devices
          </div>
        ) : (
          tree.map((node) => (
            <DeviceTreeRenderer 
              key={node.device.id} 
              node={node} 
              editMode={editMode}
              positions={positions}
              onDragEnd={onDragEnd}
            />
          ))
        )}
      </div>
      
      <div className="bg-gray-800/80 px-2 py-1 flex items-center justify-between border-t border-border/30">
        <span className="text-[8px] text-muted-foreground">#Users</span>
        <span className="text-[10px] font-bold text-blue-400">{column.activeUsers}</span>
      </div>
    </motion.div>
  );
}

function TrafficLoadLegend() {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] text-muted-foreground">Traffic Load</span>
      <div className="flex items-center h-3">
        <div className="w-6 h-full bg-gradient-to-r from-green-500 to-green-400 rounded-l" />
        <div className="w-6 h-full bg-gradient-to-r from-green-400 to-yellow-500" />
        <div className="w-6 h-full bg-gradient-to-r from-yellow-500 to-orange-500" />
        <div className="w-6 h-full bg-gradient-to-r from-orange-500 to-red-500 rounded-r" />
      </div>
      <div className="flex items-center gap-3 text-[8px] text-muted-foreground">
        <span>0%</span>
        <span>25%</span>
        <span>50%</span>
        <span>75%</span>
        <span>100%</span>
      </div>
    </div>
  );
}

function NodeStatusLegend() {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[9px] text-muted-foreground">Node Status</span>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-gray-500 rounded-sm" />
          <span className="text-[8px] text-muted-foreground">disabled</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-red-500 rounded-sm" />
          <span className="text-[8px] text-muted-foreground">down</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-blue-500 rounded-sm" />
          <span className="text-[8px] text-muted-foreground">recovering</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-green-500 rounded-sm" />
          <span className="text-[8px] text-muted-foreground">up</span>
        </div>
      </div>
    </div>
  );
}

export function NetworkMap({ devices, sites, onSiteClick, kioskMode = false }: NetworkMapProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [layoutMode, setLayoutMode] = useState<"grid" | "horizontal">(() => {
    const saved = localStorage.getItem("networkMapLayout");
    return (saved === "horizontal" || saved === "grid") ? saved : "horizontal";
  });
  const [editMode, setEditMode] = useState(false);
  const [positions, setPositions] = useState<LayoutPositions>(() => loadSavedPositions());
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

  const handleDragEnd = useCallback((deviceId: number, position: Position) => {
    setPositions(prev => {
      const updated = { ...prev, [deviceId]: position };
      savePositions(updated);
      return updated;
    });
  }, []);

  const handleResetLayout = useCallback(() => {
    setPositions({});
    localStorage.removeItem(LAYOUT_STORAGE_KEY);
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

  const totalActiveUsers = devices.reduce((sum, d) => sum + (d.activeUsers || 0), 0);
  const hasCustomPositions = Object.keys(positions).length > 0;

  return (
    <div className={`bg-gray-900 rounded-xl overflow-hidden flex flex-col ${kioskMode ? 'h-full' : ''}`} data-testid="network-map-container" ref={containerRef}>
      <div className="p-3 border-b border-border/30 flex flex-wrap items-center justify-between gap-2 bg-gray-800/50">
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
            <>
              <Button
                size="sm"
                variant={editMode ? "default" : "outline"}
                className="h-7 px-2 gap-1"
                onClick={() => setEditMode(!editMode)}
                data-testid="button-edit-layout"
              >
                {editMode ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                <span className="text-xs">{editMode ? "Done" : "Edit"}</span>
              </Button>
              
              {hasCustomPositions && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 gap-1 text-orange-400 hover:text-orange-300"
                  onClick={handleResetLayout}
                  data-testid="button-reset-layout"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span className="text-xs">Reset</span>
                </Button>
              )}
              
              <LinkManagement devices={devices} />
            </>
          )}
        </div>
      </div>
      
      {editMode && (
        <div className="bg-blue-500/20 border-b border-blue-500/30 px-3 py-2 flex items-center gap-2">
          <Move className="w-4 h-4 text-blue-400" />
          <span className="text-xs text-blue-300">Edit Mode: Drag devices to rearrange them. Click "Done" when finished.</span>
        </div>
      )}

      <div className={`flex-1 p-2 overflow-x-auto overflow-y-hidden ${kioskMode ? 'min-h-0' : ''}`}>
        <div 
          className={layoutMode === "horizontal" 
            ? "flex gap-2 min-w-max h-full" 
            : "grid gap-2 auto-rows-fr"
          }
          style={layoutMode === "grid" ? {
            gridTemplateColumns: `repeat(auto-fill, minmax(140px, 1fr))`
          } : undefined}
        >
          {columns.map((column, index) => (
            <SiteColumnView
              key={column.site}
              column={column}
              index={index}
              onSiteClick={onSiteClick}
              deviceLinks={deviceLinks}
              allDevices={devices}
              editMode={editMode}
              positions={positions}
              onDragEnd={handleDragEnd}
            />
          ))}
        </div>
      </div>
      
      <div className="border-t border-border/30 bg-gray-800/50 p-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <TrafficLoadLegend />
          
          <div className="text-center flex-1">
            <div className="text-lg font-mono font-bold text-foreground">
              {formatDate(currentTime)} {formatTime(currentTime)}
            </div>
          </div>
          
          <NodeStatusLegend />
        </div>
      </div>
    </div>
  );
}
