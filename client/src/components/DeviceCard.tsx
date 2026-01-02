import { Device } from "@shared/schema";
import { StatusBadge } from "./StatusBadge";
import { UtilizationGauge } from "./UtilizationGauge";
import { PerformanceChart } from "./PerformanceChart";
import { Router, Server, Trash2, Clock, Network, ChevronDown, ChevronUp, ArrowDown, ArrowUp, Activity } from "lucide-react";
import { Button } from "./ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useDeleteDevice } from "@/hooks/use-devices";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { EditDeviceDialog } from "./EditDeviceDialog";

interface DeviceCardProps {
  device: Device;
  canManage?: boolean;
}

export function DeviceCard({ device, canManage = false }: DeviceCardProps) {
  const deleteMutation = useDeleteDevice();
  const [open, setOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const getIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'unifi': return <Router className="w-6 h-6 text-primary" />;
      case 'mikrotik': return <Server className="w-6 h-6 text-primary" />;
      default: return <Network className="w-6 h-6 text-primary" />;
    }
  };

  const lastChecked = device.lastCheck 
    ? formatDistanceToNow(new Date(device.lastCheck), { addSuffix: true })
    : "Never";

  const availability = device.totalChecks > 0 
    ? ((device.successfulChecks / device.totalChecks) * 100).toFixed(1)
    : "N/A";
  
  const availabilityColor = availability === "N/A" 
    ? "text-muted-foreground" 
    : parseFloat(availability) >= 99 
      ? "text-green-500" 
      : parseFloat(availability) >= 95 
        ? "text-yellow-500" 
        : "text-red-500";

  const handleDelete = () => {
    deleteMutation.mutate(device.id);
    setOpen(false);
  };

  return (
    <div className="glass rounded-xl p-3 sm:p-5 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 border border-white/5 relative group">
      {/* Header */}
      <div className="flex justify-between items-start mb-4 sm:mb-6 gap-2">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="p-2 sm:p-2.5 rounded-lg bg-primary/10 border border-primary/20 shrink-0">
            {getIcon(device.type)}
          </div>
          <div className="min-w-0">
            <h3 className="text-base sm:text-lg font-semibold text-foreground tracking-tight leading-none mb-1 sm:mb-1.5 truncate">
              {device.name}
            </h3>
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <span className="text-[10px] sm:text-xs font-mono text-muted-foreground bg-secondary/50 px-1 sm:px-1.5 py-0.5 rounded border border-white/5">
                {device.ip}
              </span>
              <span className="text-[9px] sm:text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">
                {device.type}
              </span>
              <span className={`text-[9px] sm:text-[10px] flex items-center gap-0.5 ${availabilityColor}`}>
                <Activity className="w-2.5 h-2.5" />
                {availability}%
              </span>
            </div>
          </div>
        </div>
        
        <StatusBadge status={device.status} showLabel />
      </div>

      {/* Metrics */}
      <div className="space-y-3 sm:space-y-4">
        {/* Download/Upload Speed Display */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <div className="flex items-center gap-1.5 sm:gap-2 p-2 sm:p-2.5 rounded-lg bg-secondary/50 border border-white/5">
            <ArrowDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[hsl(var(--status-green))] shrink-0" />
            <div className="min-w-0">
              <p className="text-[9px] sm:text-[10px] uppercase text-muted-foreground tracking-wider">Download</p>
              <p className="text-xs sm:text-sm font-mono font-semibold truncate">{device.downloadMbps} <span className="text-[10px] sm:text-xs text-muted-foreground">Mbps</span></p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 p-2 sm:p-2.5 rounded-lg bg-secondary/50 border border-white/5">
            <ArrowUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[hsl(var(--status-blue))] shrink-0" />
            <div className="min-w-0">
              <p className="text-[9px] sm:text-[10px] uppercase text-muted-foreground tracking-wider">Upload</p>
              <p className="text-xs sm:text-sm font-mono font-semibold truncate">{device.uploadMbps} <span className="text-[10px] sm:text-xs text-muted-foreground">Mbps</span></p>
            </div>
          </div>
        </div>

        <UtilizationGauge value={device.utilization} bandwidth={device.bandwidthMBps} />
        
        <div className="flex items-center justify-between text-[10px] sm:text-xs text-muted-foreground pt-2 border-t border-white/5 gap-2">
          <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
            <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
            <span className="truncate">{lastChecked}</span>
          </div>
          
          <div className="flex items-center gap-1 group/actions">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs gap-1"
              onClick={() => setShowHistory(!showHistory)}
              data-testid={`button-toggle-history-${device.id}`}
            >
              {showHistory ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              History
            </Button>
            
            {canManage && (
              <>
                <EditDeviceDialog device={device} />
                
                <AlertDialog open={open} onOpenChange={setOpen}>
                  <AlertDialogTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover/actions:opacity-100 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="glass border-white/10">
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Device?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will remove <strong>{device.name}</strong> ({device.ip}) from monitoring. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="bg-transparent border-white/10 hover:bg-white/5 hover:text-foreground">Cancel</AlertDialogCancel>
                      <AlertDialogAction 
                        onClick={handleDelete}
                        className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
          </div>
        </div>

        {showHistory && <PerformanceChart device={device} />}
      </div>
    </div>
  );
}
