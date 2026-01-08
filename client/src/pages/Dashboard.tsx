import { useDevices } from "@/hooks/use-devices";
import { DeviceCard } from "@/components/DeviceCard";
import { AddDeviceDialog } from "@/components/AddDeviceDialog";
import { NetworkMap } from "@/components/NetworkMap";
import { MainMenu } from "@/components/MainMenu";
import { UserMenu } from "@/components/UserMenu";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Onboarding } from "@/components/Onboarding";
import { LayoutDashboard, Activity, AlertCircle, MapPin, Edit2, ArrowUpCircle, ArrowDownCircle, History, Search, X, GripVertical } from "lucide-react";
import { motion } from "framer-motion";
import { useState, useEffect, useMemo } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Device } from "@shared/schema";
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

// Sortable wrapper for device cards
function SortableDeviceCard({ device, canManage }: { device: Device; canManage: boolean }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: device.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.8 : 1,
    zIndex: isDragging ? 50 : 'auto',
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className="relative"
      data-testid={`sortable-device-${device.id}`}
    >
      <button 
        type="button"
        {...attributes} 
        {...listeners}
        className="absolute top-3 left-3 z-20 cursor-grab active:cursor-grabbing p-1.5 rounded-md bg-secondary/90 hover:bg-secondary border border-border/50 transition-colors touch-none select-none"
        aria-label={`Drag to reorder ${device.name}`}
        data-testid={`drag-handle-${device.id}`}
      >
        <GripVertical className="w-4 h-4 text-muted-foreground pointer-events-none" />
      </button>
      <DeviceCard device={device} canManage={canManage} />
    </div>
  );
}

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
  const [searchQuery, setSearchQuery] = useState("");
  const [deviceOrder, setDeviceOrder] = useState<Record<string, number[]>>(() => {
    const saved = localStorage.getItem("device_order");
    return saved ? JSON.parse(saved) : {};
  });
  const [showOnboarding, setShowOnboarding] = useState(() => {
    const hasSeenOnboarding = localStorage.getItem("network_monitor_onboarding_complete");
    return !hasSeenOnboarding;
  });

  const handleOnboardingComplete = () => {
    localStorage.setItem("network_monitor_onboarding_complete", "true");
    setShowOnboarding(false);
  };

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
      case 'user_login':
        return { color: 'text-green-400', bg: 'border-l-green-500', icon: 'login' };
      case 'user_logout':
        return { color: 'text-slate-400', bg: 'border-l-slate-500', icon: 'logout' };
      case 'user_signup':
        return { color: 'text-cyan-400', bg: 'border-l-cyan-500', icon: 'signup' };
      case 'admin_setup':
        return { color: 'text-orange-400', bg: 'border-l-orange-500', icon: 'setup' };
      case 'user_role_changed':
        return { color: 'text-indigo-400', bg: 'border-l-indigo-500', icon: 'role' };
      case 'user_deleted':
        return { color: 'text-red-400', bg: 'border-l-red-500', icon: 'delete' };
      default:
        return { color: 'text-primary/80', bg: 'border-l-primary/30', icon: 'system' };
    }
  };

  useEffect(() => {
    localStorage.setItem("monitor_sites", JSON.stringify(sites));
  }, [sites]);

  useEffect(() => {
    localStorage.setItem("device_order", JSON.stringify(deviceOrder));
  }, [deviceOrder]);

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

  // Search filter function
  const matchesSearch = (device: { name: string; ip: string; site: string }) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      device.name.toLowerCase().includes(query) ||
      device.ip.toLowerCase().includes(query) ||
      device.site.toLowerCase().includes(query)
    );
  };

  // Apply search filter first, then site filter for tab view
  const searchFilteredDevices = devices?.filter(matchesSearch) || [];
  const siteDevices = devices?.filter(d => d.site === activeSite) || [];
  
  // Order devices based on saved order for the active site
  const orderedSiteDevices = useMemo(() => {
    const order = deviceOrder[activeSite];
    if (!order || order.length === 0) return siteDevices;
    
    // Sort devices based on saved order, new devices go to the end
    return [...siteDevices].sort((a, b) => {
      const aIndex = order.indexOf(a.id);
      const bIndex = order.indexOf(b.id);
      if (aIndex === -1 && bIndex === -1) return 0;
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
  }, [siteDevices, deviceOrder, activeSite]);

  // Local state for drag-and-drop reordering (to make drops stick visually)
  const [displayedDevices, setDisplayedDevices] = useState<Device[]>([]);
  
  // Sync displayedDevices with orderedSiteDevices when site changes or devices update
  useEffect(() => {
    setDisplayedDevices(orderedSiteDevices);
  }, [orderedSiteDevices]);

  const filteredDevices = searchQuery.trim() 
    ? searchFilteredDevices 
    : displayedDevices;
  const upDevices = devices?.filter(d => d.status === 'green') || [];
  const downDevices = devices?.filter(d => d.status === 'red' || d.status === 'blue') || [];

  // DndKit sensors for drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 3,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle device reorder with DndKit
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      const oldIndex = displayedDevices.findIndex(d => d.id === active.id);
      const newIndex = displayedDevices.findIndex(d => d.id === over.id);
      
      const reorderedDevices = arrayMove(displayedDevices, oldIndex, newIndex);
      setDisplayedDevices(reorderedDevices);
      
      // Persist the order
      const newOrder = reorderedDevices.map(d => d.id);
      setDeviceOrder(prev => ({
        ...prev,
        [activeSite]: newOrder
      }));
    }
  };

  return (
    <div className="min-h-screen bg-background p-3 sm:p-4 md:p-8 lg:p-12">
      {showOnboarding && (
        <Onboarding onComplete={handleOnboardingComplete} />
      )}
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
                <ThemeToggle />
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

        {/* Search Bar */}
        <div className="relative">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              type="text"
              placeholder="Search by device name, IP, or site..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-9 h-10 w-full max-w-md bg-secondary/30 border-white/10"
              data-testid="input-device-search"
            />
            {searchQuery && (
              <Button
                size="icon"
                variant="ghost"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                onClick={() => setSearchQuery("")}
                data-testid="button-clear-search"
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
          {searchQuery && (
            <p className="text-xs text-muted-foreground mt-2">
              Found {filteredDevices.length} device{filteredDevices.length !== 1 ? 's' : ''} matching "{searchQuery}"
            </p>
          )}
        </div>

        {/* Site Tabs Navigation */}
        {viewMode === "list" && !searchQuery && (
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
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={displayedDevices.map(d => d.id)}
                      strategy={rectSortingStrategy}
                    >
                      <div 
                        className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 md:gap-6"
                        data-testid="device-reorder-group"
                      >
                        {displayedDevices.map((device) => (
                          <SortableDeviceCard 
                            key={device.id} 
                            device={device} 
                            canManage={canManageDevices} 
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
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

        {/* Search Results View */}
        {searchQuery && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-white/5 pb-3 sm:pb-4 gap-2">
              <h2 className="text-base sm:text-xl font-semibold text-foreground flex items-center gap-2 flex-wrap">
                <Search className="w-4 h-4 sm:w-5 sm:h-5" />
                Search Results
                <span className="text-xs sm:text-sm font-normal text-muted-foreground">
                  ({filteredDevices.length} devices)
                </span>
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSearchQuery("")}
                className="text-muted-foreground"
                data-testid="button-clear-search-results"
              >
                <X className="w-4 h-4 mr-1" />
                Clear Search
              </Button>
            </div>
            
            {filteredDevices.length === 0 ? (
              <div className="text-center py-12 sm:py-20 rounded-xl glass border-dashed border-2 border-white/10">
                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-secondary/50 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
                  <Search className="w-6 h-6 sm:w-8 sm:h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg sm:text-xl font-semibold text-foreground mb-2">No devices found</h3>
                <p className="text-muted-foreground max-w-md mx-auto text-sm sm:text-base px-4">
                  No devices match "{searchQuery}". Try a different search term.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 md:gap-6">
                {filteredDevices.map((device, idx) => (
                  <motion.div
                    key={device.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.03 }}
                  >
                    <DeviceCard device={device} canManage={canManageDevices} />
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
