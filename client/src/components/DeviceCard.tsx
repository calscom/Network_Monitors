import { Device } from "@shared/schema";
import { StatusBadge } from "./StatusBadge";
import { UtilizationGauge } from "./UtilizationGauge";
import { Router, Server, Trash2, Clock, Network } from "lucide-react";
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
}

export function DeviceCard({ device }: DeviceCardProps) {
  const deleteMutation = useDeleteDevice();
  const [open, setOpen] = useState(false);

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

  const handleDelete = () => {
    deleteMutation.mutate(device.id);
    setOpen(false);
  };

  return (
    <div className="glass rounded-xl p-5 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 border border-white/5 relative group">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-primary/10 border border-primary/20">
            {getIcon(device.type)}
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground tracking-tight leading-none mb-1.5">
              {device.name}
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded border border-white/5">
                {device.ip}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">
                {device.type}
              </span>
            </div>
          </div>
        </div>
        
        <StatusBadge status={device.status} showLabel />
      </div>

      {/* Metrics */}
      <div className="space-y-4">
        <UtilizationGauge value={device.utilization} />
        
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-white/5">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            <span>Checked {lastChecked}</span>
          </div>
          
          <div className="flex items-center gap-1">
            <EditDeviceDialog device={device} />
            
            {/* Delete Action - Only visible on hover/focus within group for cleaner look */}
            <AlertDialog open={open} onOpenChange={setOpen}>
              <AlertDialogTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
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
          </div>
        </div>
      </div>
    </div>
  );
}
