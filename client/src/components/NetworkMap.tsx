import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Device } from "@shared/schema";
import { Circle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface NetworkMapProps {
  devices: Device[];
  sites: string[];
  onSiteClick?: (site: string) => void;
}

interface NodeData {
  x: number;
  y: number;
  site: string;
  devices: Device[];
  status: "green" | "red" | "mixed" | "empty";
  onlineCount: number;
  offlineCount: number;
}

export function NetworkMap({ devices, sites, onSiteClick }: NetworkMapProps) {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const nodes = useMemo(() => {
    const result: NodeData[] = [];
    const centerX = 50;
    const centerY = 45;
    
    const siteCount = sites.length;
    const innerRadius = siteCount <= 6 ? 30 : 25;
    const outerRadius = 40;
    const useDoubleRing = siteCount > 8;

    sites.forEach((site, index) => {
      let radius: number;
      let adjustedIndex: number;
      let totalInRing: number;

      if (useDoubleRing) {
        const innerCount = Math.ceil(siteCount / 2);
        if (index < innerCount) {
          radius = innerRadius;
          adjustedIndex = index;
          totalInRing = innerCount;
        } else {
          radius = outerRadius;
          adjustedIndex = index - innerCount;
          totalInRing = siteCount - innerCount;
        }
      } else {
        radius = 35;
        adjustedIndex = index;
        totalInRing = siteCount;
      }

      const angle = (adjustedIndex / totalInRing) * 2 * Math.PI - Math.PI / 2;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      
      const siteDevices = devices.filter(d => d.site === site);
      const onlineCount = siteDevices.filter(d => d.status === "green").length;
      const offlineCount = siteDevices.filter(d => d.status === "red" || d.status === "blue").length;
      
      let status: "green" | "red" | "mixed" | "empty" = "empty";
      
      if (siteDevices.length > 0) {
        if (offlineCount === 0) status = "green";
        else if (onlineCount === 0) status = "red";
        else status = "mixed";
      }

      result.push({ x, y, site, devices: siteDevices, status, onlineCount, offlineCount });
    });

    return result;
  }, [devices, sites]);

  const statusColors = {
    green: { fill: "rgb(34, 197, 94)", bg: "rgba(34, 197, 94, 0.15)" },
    red: { fill: "rgb(239, 68, 68)", bg: "rgba(239, 68, 68, 0.15)" },
    mixed: { fill: "rgb(245, 158, 11)", bg: "rgba(245, 158, 11, 0.15)" },
    empty: { fill: "rgb(107, 114, 128)", bg: "rgba(107, 114, 128, 0.1)" }
  };

  return (
    <div className="glass rounded-xl p-6">
      <div className="flex flex-col xl:flex-row gap-6">
        <div className="flex-1 relative" style={{ minHeight: "450px" }}>
          <svg 
            viewBox="0 0 100 90" 
            className="w-full h-full"
            preserveAspectRatio="xMidYMid meet"
            data-testid="network-map-svg"
          >
            {nodes.map((node, idx) => (
              <motion.line
                key={`line-${idx}`}
                x1={50}
                y1={45}
                x2={node.x}
                y2={node.y}
                stroke={statusColors[node.status].fill}
                strokeWidth={node.status === "empty" ? 0.1 : 0.2}
                strokeOpacity={node.status === "empty" ? 0.3 : 0.5}
                strokeDasharray={node.status === "empty" ? "0.5 0.5" : "0"}
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.4, delay: idx * 0.02 }}
              />
            ))}

            <motion.g
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.3, type: "spring" }}
            >
              <circle
                cx={50}
                cy={45}
                r={6}
                fill="hsl(217 91% 60% / 0.2)"
                stroke="hsl(217 91% 60%)"
                strokeWidth={0.4}
              />
              <text
                x={50}
                y={45.5}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="hsl(217 91% 60%)"
                style={{ fontSize: "2px", fontWeight: 600 }}
              >
                HUB
              </text>
            </motion.g>

            {nodes.map((node, idx) => {
              const isHovered = hoveredNode === node.site;
              const colors = statusColors[node.status];
              
              return (
                <motion.g
                  key={`node-${idx}`}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ duration: 0.25, delay: 0.15 + idx * 0.02 }}
                  style={{ cursor: "pointer" }}
                  onClick={() => onSiteClick?.(node.site)}
                  onMouseEnter={() => setHoveredNode(node.site)}
                  onMouseLeave={() => setHoveredNode(null)}
                  data-testid={`node-site-${idx}`}
                >
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={isHovered ? 5 : 4}
                    fill={colors.bg}
                    stroke={colors.fill}
                    strokeWidth={0.35}
                    style={{ transition: "all 0.15s ease" }}
                  />
                  
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={1.2}
                    fill={colors.fill}
                  />

                  <text
                    x={node.x}
                    y={node.y + 6.5}
                    textAnchor="middle"
                    fill="currentColor"
                    className="fill-foreground"
                    style={{ fontSize: "1.8px", fontWeight: 500 }}
                  >
                    {node.site.length > 12 ? node.site.substring(0, 11) + ".." : node.site}
                  </text>
                </motion.g>
              );
            })}
          </svg>

          {hoveredNode && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute top-4 left-4 glass rounded-lg p-3 border border-white/10 max-w-xs z-10"
              data-testid="tooltip-site-info"
            >
              {(() => {
                const node = nodes.find(n => n.site === hoveredNode);
                if (!node) return null;
                const colors = statusColors[node.status];
                return (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: colors.fill }}
                      />
                      <span className="font-semibold text-sm">{node.site}</span>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p>Total Devices: {node.devices.length}</p>
                      <p style={{ color: statusColors.green.fill }}>Online: {node.onlineCount}</p>
                      <p style={{ color: statusColors.red.fill }}>Offline: {node.offlineCount}</p>
                    </div>
                    <p className="text-[10px] text-muted-foreground/60 italic">Click to view devices</p>
                  </div>
                );
              })()}
            </motion.div>
          )}
        </div>

        <div className="xl:w-56 space-y-4">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">Legend</h3>
            <div className="grid grid-cols-2 xl:grid-cols-1 gap-2">
              <div className="flex items-center gap-2 p-2 rounded-md" style={{ backgroundColor: statusColors.green.bg, border: `1px solid ${statusColors.green.fill}30` }} data-testid="legend-online">
                <Circle className="w-3 h-3" style={{ fill: statusColors.green.fill, color: statusColors.green.fill }} />
                <span className="text-xs">All Online</span>
                <Badge variant="outline" className="ml-auto text-[10px]">
                  {nodes.filter(n => n.status === "green").length}
                </Badge>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-md" style={{ backgroundColor: statusColors.red.bg, border: `1px solid ${statusColors.red.fill}30` }} data-testid="legend-critical">
                <Circle className="w-3 h-3" style={{ fill: statusColors.red.fill, color: statusColors.red.fill }} />
                <span className="text-xs">Critical</span>
                <Badge variant="outline" className="ml-auto text-[10px]">
                  {nodes.filter(n => n.status === "red").length}
                </Badge>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-md" style={{ backgroundColor: statusColors.mixed.bg, border: `1px solid ${statusColors.mixed.fill}30` }} data-testid="legend-mixed">
                <Circle className="w-3 h-3" style={{ fill: statusColors.mixed.fill, color: statusColors.mixed.fill }} />
                <span className="text-xs">Mixed</span>
                <Badge variant="outline" className="ml-auto text-[10px]">
                  {nodes.filter(n => n.status === "mixed").length}
                </Badge>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-md bg-secondary/50 border border-white/5" data-testid="legend-empty">
                <Circle className="w-3 h-3 fill-muted-foreground/30 text-muted-foreground/30" />
                <span className="text-xs text-muted-foreground">No Devices</span>
                <Badge variant="outline" className="ml-auto text-[10px]">
                  {nodes.filter(n => n.status === "empty").length}
                </Badge>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">Summary</h3>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between p-2 rounded-md bg-secondary/30">
                <span className="text-muted-foreground">Total Sites</span>
                <span className="font-mono font-semibold">{sites.length}</span>
              </div>
              <div className="flex justify-between p-2 rounded-md bg-secondary/30">
                <span className="text-muted-foreground">Total Devices</span>
                <span className="font-mono font-semibold">{devices.length}</span>
              </div>
              <div className="flex justify-between p-2 rounded-md bg-secondary/30">
                <span className="text-muted-foreground">Online</span>
                <span className="font-mono font-semibold" style={{ color: statusColors.green.fill }}>
                  {devices.filter(d => d.status === "green").length}
                </span>
              </div>
              <div className="flex justify-between p-2 rounded-md bg-secondary/30">
                <span className="text-muted-foreground">Offline</span>
                <span className="font-mono font-semibold" style={{ color: statusColors.red.fill }}>
                  {devices.filter(d => d.status === "red" || d.status === "blue").length}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
