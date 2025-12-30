import { useMemo } from "react";
import { motion } from "framer-motion";
import { Device } from "@shared/schema";
import { Cloud, Server, Router, Wifi } from "lucide-react";

interface NetworkMapProps {
  devices: Device[];
  sites: string[];
  onSiteClick?: (site: string) => void;
}

interface NodePosition {
  x: number;
  y: number;
  site: string;
  devices: Device[];
  status: "green" | "red" | "mixed" | "empty";
}

export function NetworkMap({ devices, sites, onSiteClick }: NetworkMapProps) {
  const nodes = useMemo(() => {
    const result: NodePosition[] = [];
    const centerX = 400;
    const centerY = 300;
    const radius = 220;

    sites.forEach((site, index) => {
      const angle = (index / sites.length) * 2 * Math.PI - Math.PI / 2;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      
      const siteDevices = devices.filter(d => d.site === site);
      let status: "green" | "red" | "mixed" | "empty" = "empty";
      
      if (siteDevices.length > 0) {
        const allGreen = siteDevices.every(d => d.status === "green");
        const allRed = siteDevices.every(d => d.status === "red");
        if (allGreen) status = "green";
        else if (allRed) status = "red";
        else status = "mixed";
      }

      result.push({ x, y, site, devices: siteDevices, status });
    });

    return result;
  }, [devices, sites]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "green": return "hsl(var(--status-green))";
      case "red": return "hsl(var(--status-red))";
      case "mixed": return "hsl(var(--status-blue))";
      default: return "hsl(var(--muted-foreground))";
    }
  };

  const getDeviceIcon = (type: string) => {
    switch (type) {
      case "unifi": return Wifi;
      case "mikrotik": return Router;
      default: return Server;
    }
  };

  return (
    <div className="glass rounded-xl p-6 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-white/5 pb-4 mb-4">
        <Cloud className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold">Network Topology</h2>
      </div>

      <div className="relative w-full" style={{ height: "600px" }}>
        <svg 
          viewBox="0 0 800 600" 
          className="w-full h-full"
          style={{ maxWidth: "100%", height: "auto" }}
        >
          <defs>
            <filter id="glow-green" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feFlood floodColor="hsl(142 76% 36%)" floodOpacity="0.6" />
              <feComposite in2="blur" operator="in" />
              <feMerge>
                <feMergeNode />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="glow-red" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feFlood floodColor="hsl(0 84% 60%)" floodOpacity="0.6" />
              <feComposite in2="blur" operator="in" />
              <feMerge>
                <feMergeNode />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <linearGradient id="connection-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.8" />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.2" />
            </linearGradient>
          </defs>

          {nodes.map((node, idx) => (
            <motion.line
              key={`line-${idx}`}
              x1={400}
              y1={300}
              x2={node.x}
              y2={node.y}
              stroke={node.status === "empty" ? "hsl(var(--muted-foreground) / 0.2)" : getStatusColor(node.status)}
              strokeWidth={node.status === "empty" ? 1 : 2}
              strokeDasharray={node.status === "empty" ? "4 4" : "0"}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: node.status === "empty" ? 0.3 : 0.6 }}
              transition={{ duration: 0.8, delay: idx * 0.05 }}
            />
          ))}

          <motion.g
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, type: "spring" }}
          >
            <circle
              cx={400}
              cy={300}
              r={50}
              fill="hsl(var(--primary) / 0.15)"
              stroke="hsl(var(--primary))"
              strokeWidth={3}
            />
            <foreignObject x={375} y={275} width={50} height={50}>
              <div className="w-full h-full flex items-center justify-center text-primary">
                <Cloud className="w-8 h-8" />
              </div>
            </foreignObject>
            <text
              x={400}
              y={370}
              textAnchor="middle"
              className="fill-foreground text-sm font-semibold"
            >
              Core Hub
            </text>
          </motion.g>

          {nodes.map((node, idx) => {
            const statusColor = getStatusColor(node.status);
            const glowFilter = node.status === "green" ? "url(#glow-green)" : 
                              node.status === "red" ? "url(#glow-red)" : "";
            
            return (
              <motion.g
                key={`node-${idx}`}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.3 + idx * 0.05, type: "spring" }}
                style={{ cursor: "pointer" }}
                onClick={() => onSiteClick?.(node.site)}
              >
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={35}
                  fill={node.status === "empty" ? "hsl(var(--secondary))" : statusColor}
                  fillOpacity={node.status === "empty" ? 1 : 0.15}
                  stroke={statusColor}
                  strokeWidth={2}
                  filter={glowFilter}
                  className="transition-all duration-300 hover:opacity-80"
                  data-testid={`node-site-${idx}`}
                />
                
                {node.status !== "empty" && (
                  <motion.circle
                    cx={node.x}
                    cy={node.y}
                    r={35}
                    fill="transparent"
                    stroke={statusColor}
                    strokeWidth={2}
                    initial={{ r: 35, opacity: 0.8 }}
                    animate={{ r: 45, opacity: 0 }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
                  />
                )}

                <foreignObject x={node.x - 12} y={node.y - 12} width={24} height={24}>
                  <div className="w-full h-full flex items-center justify-center" style={{ color: statusColor }}>
                    <Server className="w-5 h-5" />
                  </div>
                </foreignObject>

                <text
                  x={node.x}
                  y={node.y + 55}
                  textAnchor="middle"
                  className="fill-foreground text-xs font-medium"
                >
                  {node.site.length > 12 ? node.site.substring(0, 12) + "..." : node.site}
                </text>
                
                <text
                  x={node.x}
                  y={node.y + 70}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[10px]"
                >
                  {node.devices.length} device{node.devices.length !== 1 ? "s" : ""}
                </text>
              </motion.g>
            );
          })}
        </svg>

        <div className="absolute bottom-4 left-4 flex flex-wrap items-center gap-4 text-xs" data-testid="legend-network-map">
          <div className="flex items-center gap-2" data-testid="legend-online">
            <div className="w-3 h-3 rounded-full bg-[hsl(var(--status-green))] shadow-[0_0_8px_hsl(var(--status-green)/0.5)]" />
            <span className="text-muted-foreground">All Online</span>
          </div>
          <div className="flex items-center gap-2" data-testid="legend-critical">
            <div className="w-3 h-3 rounded-full bg-[hsl(var(--status-red))] shadow-[0_0_8px_hsl(var(--status-red)/0.5)]" />
            <span className="text-muted-foreground">Critical</span>
          </div>
          <div className="flex items-center gap-2" data-testid="legend-mixed">
            <div className="w-3 h-3 rounded-full bg-[hsl(var(--status-blue))]" />
            <span className="text-muted-foreground">Mixed Status</span>
          </div>
          <div className="flex items-center gap-2" data-testid="legend-empty">
            <div className="w-3 h-3 rounded-full bg-muted-foreground/30" />
            <span className="text-muted-foreground">No Devices</span>
          </div>
        </div>
      </div>
    </div>
  );
}
