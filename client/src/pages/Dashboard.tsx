import { useDevices } from "@/hooks/use-devices";
import { DeviceCard } from "@/components/DeviceCard";
import { AddDeviceDialog } from "@/components/AddDeviceDialog";
import { LayoutDashboard, Activity, AlertCircle, MapPin, Edit2, History, ArrowUpCircle, ArrowDownCircle } from "lucide-react";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import { Log } from "@shared/schema";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";

const DEFAULT_SITES = [
  "01 Cloud", "02-Maiduguri", "03-Gwoza", "04-Mafa", "05-Dikwa",
  "06-Ngala", "07-Monguno", "08-Bama", "09-Banki", "10-Pulka",
  "11-Damboa", "12-Gubio"
];

export default function Dashboard() {
  const { data: devices, isLoading, error } = useDevices();
  const [sites, setSites] = useState<string[]>(() => {
    const saved = localStorage.getItem("monitor_sites");
    return saved ? JSON.parse(saved) : DEFAULT_SITES;
  });
  const [activeSite, setActiveSite] = useState(sites[0]);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");

  const { data: logs } = useQuery<Log[]>({
    queryKey: ["/api/logs", activeSite],
    queryFn: async ({ queryKey }) => {
      const site = queryKey[1] as string;
      const res = await fetch(`/api/logs?site=${encodeURIComponent(site)}`);
      if (!res.ok) throw new Error("Failed to fetch logs");
      return res.json();
    },
    enabled: !!activeSite,
    refetchInterval: 5000,
  });

  useEffect(() => {
    localStorage.setItem("monitor_sites", JSON.stringify(sites));
  }, [sites]);

  const handleRenameSite = () => {
    if (!editName.trim()) return;
    const newSites = sites.map(s => s === activeSite ? editName.trim() : s);
    setSites(newSites);
    setActiveSite(editName.trim());
    setIsEditing(false);
    // Dispatch custom event to notify other components (like AddDeviceDialog)
    window.dispatchEvent(new CustomEvent('sitesUpdated'));
  };

  // Stats calculation
  const stats = {
    total: devices?.length || 0,
    online: devices?.filter(d => d.status === 'green').length || 0,
    critical: devices?.filter(d => d.status === 'red' || d.status === 'blue').length || 0,
  };

  const filteredDevices = devices?.filter(d => d.site === activeSite) || [];
  const upDevices = devices?.filter(d => d.status === 'green') || [];
  const downDevices = devices?.filter(d => d.status === 'red' || d.status === 'blue') || [];

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 lg:p-12">
      <div className="max-w-7xl mx-auto space-y-10">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <h1 className="text-3xl md:text-4xl font-display text-foreground flex items-center gap-3">
              <LayoutDashboard className="w-8 h-8 text-primary" />
              Network Monitor
            </h1>
            <p className="text-muted-foreground text-lg">Real-time SNMP status & utilization dashboard</p>
          </div>
          <AddDeviceDialog />
        </div>

        {/* Status Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass rounded-xl p-6 border-l-4 border-l-primary flex items-center justify-between"
          >
            <div>
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Devices</p>
              <p className="text-3xl font-bold font-mono mt-1">{stats.total}</p>
            </div>
            <div className="p-3 bg-primary/10 rounded-full text-primary">
              <Activity className="w-6 h-6" />
            </div>
          </motion.div>
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="glass rounded-xl p-6 border-l-4 border-l-[hsl(var(--status-green))] flex items-center justify-between"
          >
            <div>
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Online & Stable</p>
              <p className="text-3xl font-bold font-mono mt-1 text-[hsl(var(--status-green))]">{stats.online}</p>
            </div>
            <div className="w-3 h-3 rounded-full bg-[hsl(var(--status-green))] shadow-[0_0_12px_hsl(var(--status-green)/0.6)]" />
          </motion.div>
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="glass rounded-xl p-6 border-l-4 border-l-[hsl(var(--status-red))] flex items-center justify-between"
          >
            <div>
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Critical / Recovering</p>
              <p className="text-3xl font-bold font-mono mt-1 text-[hsl(var(--status-red))]">{stats.critical}</p>
            </div>
            {stats.critical > 0 ? (
              <div className="relative">
                 <div className="absolute w-full h-full rounded-full bg-[hsl(var(--status-red))] animate-pulse-ring opacity-50" />
                 <AlertCircle className="relative w-6 h-6 text-[hsl(var(--status-red))]" />
              </div>
            ) : (
              <div className="w-3 h-3 rounded-full bg-secondary" />
            )}
          </motion.div>
        </div>

        {/* Global Status List */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="glass rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2 border-b border-white/5 pb-4 text-[hsl(var(--status-green))]">
              <ArrowUpCircle className="w-5 h-5" />
              <h2 className="text-lg font-semibold">Online Devices</h2>
            </div>
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
              {upDevices.map(device => (
                <div key={device.id} className="flex items-center justify-between p-2 rounded bg-white/5 border border-white/5">
                  <span className="font-medium text-sm">{device.name}</span>
                  <Badge variant="outline" className="text-[10px] uppercase">{device.site}</Badge>
                </div>
              ))}
              {upDevices.length === 0 && <p className="text-muted-foreground text-sm italic py-4 text-center">No devices online</p>}
            </div>
          </div>

          <div className="glass rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2 border-b border-white/5 pb-4 text-[hsl(var(--status-red))]">
              <ArrowDownCircle className="w-5 h-5" />
              <h2 className="text-lg font-semibold">Critical Devices</h2>
            </div>
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
              {downDevices.map(device => (
                <div key={device.id} className="flex items-center justify-between p-2 rounded bg-destructive/10 border border-destructive/20">
                  <span className="font-medium text-sm">{device.name}</span>
                  <Badge variant="destructive" className="text-[10px] uppercase">{device.site}</Badge>
                </div>
              ))}
              {downDevices.length === 0 && <p className="text-muted-foreground text-sm italic py-4 text-center">No devices critical</p>}
            </div>
          </div>
        </div>

        {/* Site Tabs Navigation */}
        <div className="space-y-6">
          <Tabs value={activeSite} onValueChange={setActiveSite} className="w-full">
            <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide">
              <MapPin className="w-5 h-5 text-primary shrink-0" />
              <TabsList className="bg-secondary/50 border border-white/5 h-auto p-1 flex-nowrap">
                {sites.map(site => (
                  <TabsTrigger 
                    key={site} 
                    value={site}
                    className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-4 py-2 text-sm transition-all whitespace-nowrap"
                  >
                    {site}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
              <div className="lg:col-span-3 space-y-4">
                <div className="flex items-center justify-between border-b border-white/5 pb-4">
                  <div className="flex items-center gap-4">
                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <Input 
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="h-8 w-48"
                          placeholder="New site name..."
                          autoFocus
                          onKeyDown={(e) => e.key === 'Enter' && handleRenameSite()}
                        />
                        <Button size="sm" onClick={handleRenameSite}>Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)}>Cancel</Button>
                      </div>
                    ) : (
                      <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
                        {activeSite} Devices
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="h-6 w-6" 
                          onClick={() => {
                            setEditName(activeSite);
                            setIsEditing(true);
                          }}
                        >
                          <Edit2 className="w-3 h-3" />
                        </Button>
                        <span className="text-sm font-normal text-muted-foreground ml-2">
                          ({filteredDevices.length} devices)
                        </span>
                      </h2>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    Live Updates Active
                  </div>
                </div>

                {isLoading ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-pulse">
                    {[1, 2].map((i) => (
                      <div key={i} className="h-48 rounded-xl bg-card/50 border border-white/5" />
                    ))}
                  </div>
                ) : error ? (
                  <div className="p-12 text-center rounded-xl bg-destructive/10 border border-destructive/20 text-destructive">
                    <AlertCircle className="w-12 h-12 mx-auto mb-4" />
                    <h3 className="text-lg font-bold">Failed to load devices</h3>
                    <p className="opacity-80">Please check your connection and try again.</p>
                  </div>
                ) : filteredDevices.length === 0 ? (
                  <div className="text-center py-20 rounded-xl glass border-dashed border-2 border-white/10">
                    <div className="w-16 h-16 bg-secondary/50 rounded-full flex items-center justify-center mx-auto mb-4">
                      <MapPin className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-xl font-semibold text-foreground mb-2">No Devices in {activeSite}</h3>
                    <p className="text-muted-foreground max-w-md mx-auto mb-6">
                      Add a network device to this site to start monitoring.
                    </p>
                    <AddDeviceDialog />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {filteredDevices.map((device, idx) => (
                      <motion.div
                        key={device.id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: idx * 0.05 }}
                      >
                        <DeviceCard device={device} />
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>

              {/* Activity Logs Sidebar */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-white/5 pb-4">
                  <History className="w-5 h-5 text-primary" />
                  <h2 className="text-xl font-semibold text-foreground">Activity Log</h2>
                </div>
                <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 scrollbar-hide">
                  {logs?.map((log) => (
                    <div key={log.id} className="glass p-3 rounded-lg text-sm border-l-2 border-l-primary/30">
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-medium text-primary/80 uppercase text-[10px] tracking-wider">
                          {log.type.replace('_', ' ')}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {format(new Date(log.timestamp), "HH:mm:ss")}
                        </span>
                      </div>
                      <p className="text-muted-foreground leading-snug">
                        {log.message}
                      </p>
                    </div>
                  ))}
                  {(!logs || logs.length === 0) && (
                    <div className="text-center py-12 text-muted-foreground opacity-50 italic">
                      No recent activity
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
