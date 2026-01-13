import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Device, DeviceLink, DeviceInterface } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Link2, Plus, Trash2, Wand2, Edit2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface LinkManagementProps {
  devices: Device[];
}

export function LinkManagement({ devices }: LinkManagementProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<DeviceLink | null>(null);
  const [sourceDeviceId, setSourceDeviceId] = useState<string>("");
  const [targetDeviceId, setTargetDeviceId] = useState<string>("");
  const [linkLabel, setLinkLabel] = useState("");
  const [bandwidthMbps, setBandwidthMbps] = useState("1000");
  const { toast } = useToast();

  const { data: deviceLinks = [], isLoading } = useQuery<DeviceLink[]>({
    queryKey: ['/api/device-links'],
  });

  const createLinkMutation = useMutation({
    mutationFn: async (data: { sourceDeviceId: number; targetDeviceId: number; linkLabel?: string; bandwidthMbps: number }) => {
      const res = await apiRequest("POST", "/api/device-links", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/device-links'] });
      toast({ title: "Link created successfully" });
      resetForm();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create link", description: err.message, variant: "destructive" });
    }
  });

  const updateLinkMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<DeviceLink> }) => {
      const res = await apiRequest("PATCH", `/api/device-links/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/device-links'] });
      toast({ title: "Link updated successfully" });
      setEditingLink(null);
      resetForm();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update link", description: err.message, variant: "destructive" });
    }
  });

  const deleteLinkMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/device-links/${id}`, undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/device-links'] });
      toast({ title: "Link deleted successfully" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to delete link", description: err.message, variant: "destructive" });
    }
  });

  const autoDiscoverMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/device-links/auto-discover", undefined);
      return res.json() as Promise<{ discovered: number; links: DeviceLink[] }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/device-links'] });
      toast({ 
        title: "Auto-discovery complete", 
        description: `Discovered ${data.discovered} new link(s)`
      });
    },
    onError: (err: Error) => {
      toast({ title: "Auto-discovery failed", description: err.message, variant: "destructive" });
    }
  });

  const resetForm = () => {
    setSourceDeviceId("");
    setTargetDeviceId("");
    setLinkLabel("");
    setBandwidthMbps("1000");
    setEditingLink(null);
  };

  const handleSubmit = () => {
    const sourceId = parseInt(sourceDeviceId);
    const targetId = parseInt(targetDeviceId);
    const bandwidth = parseInt(bandwidthMbps) || 1000;

    if (!sourceId || !targetId) {
      toast({ title: "Please select both source and target devices", variant: "destructive" });
      return;
    }

    if (sourceId === targetId) {
      toast({ title: "Source and target devices must be different", variant: "destructive" });
      return;
    }

    if (editingLink) {
      updateLinkMutation.mutate({
        id: editingLink.id,
        data: {
          sourceDeviceId: sourceId,
          targetDeviceId: targetId,
          linkLabel: linkLabel || undefined,
          bandwidthMbps: bandwidth
        }
      });
    } else {
      createLinkMutation.mutate({
        sourceDeviceId: sourceId,
        targetDeviceId: targetId,
        linkLabel: linkLabel || undefined,
        bandwidthMbps: bandwidth
      });
    }
  };

  const startEdit = (link: DeviceLink) => {
    setEditingLink(link);
    setSourceDeviceId(link.sourceDeviceId.toString());
    setTargetDeviceId(link.targetDeviceId.toString());
    setLinkLabel(link.linkLabel || "");
    setBandwidthMbps(link.bandwidthMbps.toString());
    setIsOpen(true);
  };

  const getDeviceName = (id: number) => {
    return devices.find(d => d.id === id)?.name || `Device ${id}`;
  };

  const getLinkStatusColor = (status: string) => {
    switch (status) {
      case 'up': return 'text-green-500';
      case 'down': return 'text-red-500';
      case 'degraded': return 'text-yellow-500';
      default: return 'text-muted-foreground';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Link2 className="w-5 h-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold">Device Links</h3>
          <span className="text-sm text-muted-foreground">({deviceLinks.length})</span>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => autoDiscoverMutation.mutate()}
            disabled={autoDiscoverMutation.isPending}
            data-testid="button-auto-discover-links"
          >
            <Wand2 className="w-4 h-4 mr-1" />
            Auto-Discover
          </Button>
          
          <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid="button-add-link">
                <Plus className="w-4 h-4 mr-1" />
                Add Link
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingLink ? 'Edit Device Link' : 'Create Device Link'}</DialogTitle>
              </DialogHeader>
              
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="sourceDevice">Source Device</Label>
                  <Select value={sourceDeviceId} onValueChange={setSourceDeviceId}>
                    <SelectTrigger id="sourceDevice" data-testid="select-source-device">
                      <SelectValue placeholder="Select source device" />
                    </SelectTrigger>
                    <SelectContent>
                      {devices.map(device => (
                        <SelectItem key={device.id} value={device.id.toString()}>
                          {device.name} ({device.site})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="targetDevice">Target Device</Label>
                  <Select value={targetDeviceId} onValueChange={setTargetDeviceId}>
                    <SelectTrigger id="targetDevice" data-testid="select-target-device">
                      <SelectValue placeholder="Select target device" />
                    </SelectTrigger>
                    <SelectContent>
                      {devices.map(device => (
                        <SelectItem key={device.id} value={device.id.toString()}>
                          {device.name} ({device.site})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="linkLabel">Link Label (optional)</Label>
                  <Input
                    id="linkLabel"
                    value={linkLabel}
                    onChange={(e) => setLinkLabel(e.target.value)}
                    placeholder="e.g., Primary uplink"
                    data-testid="input-link-label"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bandwidth">Bandwidth (Mbps)</Label>
                  <Input
                    id="bandwidth"
                    type="number"
                    value={bandwidthMbps}
                    onChange={(e) => setBandwidthMbps(e.target.value)}
                    placeholder="1000"
                    data-testid="input-bandwidth"
                  />
                </div>
              </div>
              
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                <Button 
                  onClick={handleSubmit}
                  disabled={createLinkMutation.isPending || updateLinkMutation.isPending}
                  data-testid="button-save-link"
                >
                  {editingLink ? 'Update' : 'Create'} Link
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center text-muted-foreground py-8">Loading links...</div>
      ) : deviceLinks.length === 0 ? (
        <div className="text-center text-muted-foreground py-8 border border-dashed border-border rounded-lg">
          <Link2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No device links configured</p>
          <p className="text-sm">Create links manually or use auto-discovery</p>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {deviceLinks.map((link, index) => (
              <motion.div
                key={link.id}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ delay: index * 0.05 }}
                className="flex items-center justify-between gap-2 p-3 bg-card border border-border rounded-lg"
                data-testid={`link-row-${link.id}`}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={`w-2 h-2 rounded-full ${link.status === 'up' ? 'bg-green-500' : link.status === 'down' ? 'bg-red-500' : 'bg-yellow-500'}`} />
                  
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="font-medium truncate">{getDeviceName(link.sourceDeviceId)}</span>
                    <Link2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span className="font-medium truncate">{getDeviceName(link.targetDeviceId)}</span>
                  </div>
                  
                  {link.linkLabel && (
                    <span className="text-sm text-muted-foreground hidden sm:inline">({link.linkLabel})</span>
                  )}
                  
                  <span className="text-sm text-muted-foreground">{link.bandwidthMbps} Mbps</span>
                  
                  <span className={`text-sm ${getLinkStatusColor(link.status)}`}>
                    {link.currentTrafficMbps} Mbps
                  </span>
                </div>
                
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => startEdit(link)}
                    data-testid={`button-edit-link-${link.id}`}
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-red-500 hover:text-red-600"
                    onClick={() => deleteLinkMutation.mutate(link.id)}
                    disabled={deleteLinkMutation.isPending}
                    data-testid={`button-delete-link-${link.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
