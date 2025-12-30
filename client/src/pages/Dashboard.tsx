import { useDevices } from "@/hooks/use-devices";
import { DeviceCard } from "@/components/DeviceCard";
import { AddDeviceDialog } from "@/components/AddDeviceDialog";
import { NetworkMap } from "@/components/NetworkMap";
import { MainMenu } from "@/components/MainMenu";
import { UserMenu } from "@/components/UserMenu";
import { LayoutDashboard, Activity, AlertCircle, MapPin, Edit2, ArrowUpCircle, ArrowDownCircle, History } from "lucide-react";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import { Log, type UserRole } from "@shared/schema";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";

const DEFAULT_SITES = [
  "01 Cloud", "02-Maiduguri", "03-Gwoza", "04-Mafa", "05-Dikwa",
  "06-Ngala", "07-Monguno", "08-Bama", "09-Banki", "10-Pulka",
  "11-Damboa", "12-Gubio"
];

export default function Dashboard() {
  const { user } = useAuth();
  const { data: devices, isLoading, error } = useDevices();
  const userRole = (user?.role as UserRole) || 'viewer';
  const canManageDevices = userRole === 'admin' || userRole === 'operator';
  
  const [sites, setSites] = useState<string[]>(() => {
    const saved = localStorage.getItem("monitor_sites");
    return saved ? JSON.parse(saved) : DEFAULT_SITES;
  });
  const [activeSite, setActiveSite] = useState(sites[0]);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "map">("list");

  const { data: logs } = useQuery<Log[]>({
    queryKey: ["/api/logs"],
    queryFn: async () => {
      const res = await fetch(`/api/logs`);
      if (!res.ok) throw new Error("Failed to fetch logs");
      return res.json();
    },
    refetchInterval: 2000, // Poll every 2 seconds for real-time feel
  });

  // Helper function to get log type styling
  const getLogTypeStyles = (type: string) => {
    switch (type) {
      case 'device_added':
        return { color: 'text-emerald-400', bg: 'border-l-emerald-500', icon: 'plus' };
      case 'device_removed':
        return { color: 'text-rose-400', bg: 'border-l-rose-500', icon: 'minus' };
      case 'device_updated':
        return { color: 'text-blue-400', bg: 'border-l-blue-500', icon: 'edit' };
      case 'devices_reassigned':
        return { color: 'text-amber-400', bg: 'border-l-amber-500', icon: 'move' };
      case 'status_change':
        return { color: 'text-purple-400', bg: 'border-l-purple-500', icon: 'status' };
      default:
        return { color: 'text-primary/80', bg: 'border-l-primary/30', icon: 'system' };
    }
  };

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

  const handleSitesChange = (newSites: string[]) => {
    setSites(newSites);
    // If active site was deleted, switch to first available
    if (!newSites.includes(activeSite) && newSites.length > 0) {
      setActiveSite(newSites[0]);
    }
    // Dispatch custom event to notify other components
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
    <div className="min-h-screen bg-background p-3 sm:p-4 md:p-8 lg:p-12">
      <div className="max-w-7xl mx-auto space-y-6 sm:space-y-8 md:space-y-10">
        
        {/* Header Section */}
          <div className="flex flex-col gap-4 sm:gap-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <h1 className="text-2xl sm:text-3xl md:text-4xl font-display text-foreground flex items-center gap-2 sm:gap-3">
                  <LayoutDashboard className="w-6 h-6 sm:w-8 sm:h-8 text-primary shrink-0" />
                  Network Monitor
                </h1>
                <p className="text-muted-foreground text-sm sm:text-base md:text-lg">Real-time SNMP status & utilization dashboard</p>
              </div>
              <div className="flex items-center gap-2 sm:gap-3">
                <MainMenu 
                  sites={sites} 
                  onSitesChange={handleSitesChange} 
                  devices={devices}
                  viewMode={viewMode}
                  onViewModeChange={setViewMode}
                  canManage={canManageDevices}
                />
                {canManageDevices && <AddDeviceDialog />}
                <UserMenu />
              </div>
            </div>
          </div>

        {/* Status Overview Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 md:gap-6">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass rounded-xl p-4 sm:p-6 border-l-4 border-l-primary flex items-center justify-between"
          >
            <div>
              <p className="text-xs sm:text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Devices</p>
              <p className="text-2xl sm:text-3xl font-bold font-mono mt-1">{stats.total}</p>
            </div>
            <div className="p-2 sm:p-3 bg-primary/10 rounded-full text-primary">
              <Activity className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
          </motion.div>
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="glass rounded-xl p-4 sm:p-6 border-l-4 border-l-[hsl(var(--status-green))] flex items-center justify-between"
          >
            <div>
              <p className="text-xs sm:text-sm font-medium text-muted-foreground uppercase tracking-wider">Online & Stable</p>
              <p className="text-2xl sm:text-3xl font-bold font-mono mt-1 text-[hsl(var(--status-green))]">{stats.online}</p>
            </div>
            <div className="w-3 h-3 rounded-full bg-[hsl(var(--status-green))] shadow-[0_0_12px_hsl(var(--status-green)/0.6)]" />
          </motion.div>
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="glass rounded-xl p-4 sm:p-6 border-l-4 border-l-[hsl(var(--status-red))] flex items-center justify-between"
          >
            <div>
              <p className="text-xs sm:text-sm font-medium text-muted-foreground uppercase tracking-wider">Critical / Recovering</p>
              <p className="text-2xl sm:text-3xl font-bold font-mono mt-1 text-[hsl(var(--status-red))]">{stats.critical}</p>
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 md:gap-6">
          <div className="glass rounded-xl p-4 sm:p-6 space-y-3 sm:space-y-4">
            <div className="flex items-center gap-2 border-b border-white/5 pb-3 sm:pb-4 text-[hsl(var(--status-green))]">
              <ArrowUpCircle className="w-4 h-4 sm:w-5 sm:h-5" />
              <h2 className="text-base sm:text-lg font-semibold">Online Devices</h2>
            </div>
            <div className="space-y-2 max-h-[200px] sm:max-h-[300px] overflow-y-auto pr-2">
              {upDevices.map(device => (
                <div key={device.id} className="flex items-center justify-between p-2 rounded bg-white/5 border border-white/5 gap-2">
                  <span className="font-medium text-xs sm:text-sm truncate">{device.name}</span>
                  <Badge variant="outline" className="text-[9px] sm:text-[10px] uppercase shrink-0">{device.site}</Badge>
                </div>
              ))}
              {upDevices.length === 0 && <p className="text-muted-foreground text-sm italic py-4 text-center">No devices online</p>}
            </div>
          </div>

          <div className="glass rounded-xl p-4 sm:p-6 space-y-3 sm:space-y-4">
            <div className="flex items-center gap-2 border-b border-white/5 pb-3 sm:pb-4 text-[hsl(var(--status-red))]">
              <ArrowDownCircle className="w-4 h-4 sm:w-5 sm:h-5" />
              <h2 className="text-base sm:text-lg font-semibold">Critical Devices</h2>
            </div>
            <div className="space-y-2 max-h-[200px] sm:max-h-[300px] overflow-y-auto pr-2">
              {downDevices.map(device => (
                <div key={device.id} className="flex items-center justify-between p-2 rounded bg-destructive/10 border border-destructive/20 gap-2">
                  <span className="font-medium text-xs sm:text-sm truncate">{device.name}</span>
                  <Badge variant="destructive" className="text-[9px] sm:text-[10px] uppercase shrink-0">{device.site}</Badge>
                </div>
              ))}
              {downDevices.length === 0 && <p className="text-muted-foreground text-sm italic py-4 text-center">No devices critical</p>}
            </div>
          </div>
        </div>

        {/* Network Map View */}
        {viewMode === "map" && devices && (
          <NetworkMap 
            devices={devices} 
            sites={sites} 
            onSiteClick={(site) => {
              setActiveSite(site);
              setViewMode("list");
            }}
          />
        )}

        {/* Site Tabs Navigation */}
        {viewMode === "list" && (
        <div className="space-y-4 sm:space-y-6">
          <Tabs value={activeSite} onValueChange={setActiveSite} className="w-full">
            <div className="flex items-center gap-2 mb-3 sm:mb-4 overflow-x-auto pb-2 scrollbar-hide">
              <MapPin className="w-4 h-4 sm:w-5 sm:h-5 text-primary shrink-0" />
              <TabsList className="bg-secondary/50 border border-white/5 h-auto p-1 flex-nowrap">
                {sites.map(site => (
                  <TabsTrigger 
                    key={site} 
                    value={site}
                    className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm transition-all whitespace-nowrap"
                  >
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <span className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${
                        (devices?.filter(d => d.site === site).length ?? 0) > 0
                          ? devices?.filter(d => d.site === site).every(d => d.status === 'green')
                            ? 'bg-emerald-500 shadow-[0_0_8px_theme(colors.emerald.500/0.4)]'
                            : 'bg-rose-500 shadow-[0_0_8px_theme(colors.rose.500/0.4)] animate-pulse'
                          : 'bg-muted-foreground/30'
                      }`} />
                      <span className={
                        (devices?.filter(d => d.site === site).length ?? 0) > 0
                          ? devices?.filter(d => d.site === site).every(d => d.status === 'green')
                            ? 'text-emerald-500 font-bold'
                            : 'text-rose-500 font-bold'
                          : ''
                      }>
                        {site}
                      </span>
                    </div>
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-6 lg:gap-8">
              <div className="lg:col-span-3 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-white/5 pb-3 sm:pb-4 gap-2">
                  <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
                    {isEditing ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <Input 
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="h-8 w-36 sm:w-48"
                          placeholder="New site name..."
                          autoFocus
                          onKeyDown={(e) => e.key === 'Enter' && handleRenameSite()}
                        />
                        <Button size="sm" onClick={handleRenameSite}>Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)}>Cancel</Button>
                      </div>
                    ) : (
                      <h2 className="text-base sm:text-xl font-semibold text-foreground flex items-center gap-2 flex-wrap">
                        <span className="truncate max-w-[150px] sm:max-w-none">{activeSite}</span> Devices
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
                        <span className="text-xs sm:text-sm font-normal text-muted-foreground">
                          ({filteredDevices.length} devices)
                        </span>
                      </h2>
                    )}
                  </div>
                  <div className="text-xs sm:text-sm text-muted-foreground flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    <span className="hidden xs:inline">Live Updates Active</span>
                    <span className="xs:hidden">Live</span>
                  </div>
                </div>

                {isLoading ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 md:gap-6 animate-pulse">
                    {[1, 2].map((i) => (
                      <div key={i} className="h-40 sm:h-48 rounded-xl bg-card/50 border border-white/5" />
                    ))}
                  </div>
                ) : error ? (
                  <div className="p-6 sm:p-12 text-center rounded-xl bg-destructive/10 border border-destructive/20 text-destructive">
                    <AlertCircle className="w-8 h-8 sm:w-12 sm:h-12 mx-auto mb-3 sm:mb-4" />
                    <h3 className="text-base sm:text-lg font-bold">Failed to load devices</h3>
                    <p className="opacity-80 text-sm">Please check your connection and try again.</p>
                  </div>
                ) : filteredDevices.length === 0 ? (
                  <div className="text-center py-12 sm:py-20 rounded-xl glass border-dashed border-2 border-white/10">
                    <div className="w-12 h-12 sm:w-16 sm:h-16 bg-secondary/50 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
                      <MapPin className="w-6 h-6 sm:w-8 sm:h-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg sm:text-xl font-semibold text-foreground mb-2">No Devices in {activeSite}</h3>
                    <p className="text-muted-foreground max-w-md mx-auto mb-4 sm:mb-6 text-sm sm:text-base px-4">
                      {canManageDevices 
                        ? "Add a network device to this site to start monitoring."
                        : "No devices are configured for this site yet."}
                    </p>
                    {canManageDevices && <AddDeviceDialog />}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 md:gap-6">
                    {filteredDevices.map((device, idx) => (
                      <motion.div
                        key={device.id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: idx * 0.05 }}
                      >
                        <DeviceCard device={device} canManage={canManageDevices} />
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>

              {/* Activity Logs Sidebar */}
              <div className="space-y-3 sm:space-y-4 lg:mt-0 mt-6">
                <div className="flex items-center justify-between gap-2 border-b border-white/5 pb-3 sm:pb-4">
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                    <h2 className="text-base sm:text-xl font-semibold text-foreground">Activity Log</h2>
                  </div>
                  <Badge variant="outline" className="text-[9px] animate-pulse">Live</Badge>
                </div>
                <div className="space-y-2 sm:space-y-3 max-h-[300px] sm:max-h-[400px] lg:max-h-[600px] overflow-y-auto pr-2 scrollbar-hide">
                  {logs?.map((log) => {
                    const styles = getLogTypeStyles(log.type);
                    return (
                      <div key={log.id} className={`glass p-2 sm:p-3 rounded-lg text-xs sm:text-sm border-l-2 ${styles.bg}`}>
                        <div className="flex justify-between items-start mb-1 gap-2">
                          <span className={`font-medium uppercase text-[9px] sm:text-[10px] tracking-wider ${styles.color}`}>
                            {log.type.replace(/_/g, ' ')}
                          </span>
                          <span className="text-[9px] sm:text-[10px] text-muted-foreground font-mono shrink-0">
                            {format(new Date(log.timestamp), "HH:mm:ss")}
                          </span>
                        </div>
                        <p className="text-muted-foreground leading-snug text-xs sm:text-sm">
                          {log.message}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <Badge variant="secondary" className="text-[8px] sm:text-[9px] px-1.5 py-0">
                            {log.site}
                          </Badge>
                          <span className="text-[8px] sm:text-[9px] text-muted-foreground/50">
                            {format(new Date(log.timestamp), "MMM d")}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {(!logs || logs.length === 0) && (
                    <div className="text-center py-8 sm:py-12 text-muted-foreground opacity-50 italic text-sm">
                      No recent activity
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Tabs>
        </div>
        )}
      </div>
    </div>
  );
}
