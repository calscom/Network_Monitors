import { useMutation, useQuery } from "@tanstack/react-query";
import { Device, InsertDevice, insertDeviceSchema, DeviceInterface } from "@shared/schema";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Edit2, Loader2, RefreshCw, Network, Layers } from "lucide-react";
import { useState, useEffect } from "react";

interface DiscoveredInterface {
  index: number;
  name: string;
  type: number;
  speed: number;
  adminStatus: number;
  operStatus: number;
}

const SITES = [
  "01 Cloud", "02-Maiduguri", "03-Gwoza", "04-Mafa", "05-Dikwa",
  "06-Ngala", "07-Monguno", "08-Bama", "09-Banki", "10-Pulka",
  "11-Damboa", "12-Gubio"
];

interface EditDeviceDialogProps {
  device: Device;
}

export function EditDeviceDialog({ device }: EditDeviceDialogProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const [availableSites, setAvailableSites] = useState<string[]>(SITES);
  const [selectedInterface, setSelectedInterface] = useState<number>(device.interfaceIndex || 1);
  const [discoverEnabled, setDiscoverEnabled] = useState(false);
  const [additionalInterfaces, setAdditionalInterfaces] = useState<number[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem("monitor_sites");
    if (saved) {
      setAvailableSites(JSON.parse(saved));
    }
  }, [open]);

  // Fetch currently monitored interfaces
  const { data: monitoredInterfaces = [] } = useQuery<DeviceInterface[]>({
    queryKey: ['/api/devices', device.id, 'monitored-interfaces'],
    enabled: open,
  });

  // Initialize additional interfaces from existing data when dialog opens
  useEffect(() => {
    if (open && monitoredInterfaces.length > 0) {
      const secondary = monitoredInterfaces
        .filter(i => i.isPrimary !== 1)
        .map(i => i.interfaceIndex);
      setAdditionalInterfaces(secondary);
    }
  }, [open, monitoredInterfaces]);

  // Interface discovery query
  const { data: interfaceData, isLoading: isDiscovering, refetch: discoverInterfaces } = useQuery<{
    deviceId: number;
    deviceName: string;
    currentInterface: number;
    interfaces: DiscoveredInterface[];
  }>({
    queryKey: ["/api/devices", device.id, "interfaces"],
    queryFn: async () => {
      const res = await fetch(`/api/devices/${device.id}/interfaces`);
      if (!res.ok) throw new Error("Failed to discover interfaces");
      return res.json();
    },
    enabled: discoverEnabled && open,
    staleTime: 60000,
  });

  const form = useForm<InsertDevice>({
    resolver: zodResolver(insertDeviceSchema),
    defaultValues: {
      name: device.name,
      ip: device.ip,
      community: device.community,
      type: device.type,
      site: device.site,
      interfaceIndex: device.interfaceIndex || 1,
      interfaceName: device.interfaceName || null,
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: InsertDevice) => {
      const res = await apiRequest("PATCH", `/api/devices/${device.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/devices"] });
      toast({
        title: "Success",
        description: "Device updated successfully",
      });
      setOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Save monitored interfaces mutation
  const saveInterfacesMutation = useMutation({
    mutationFn: async (interfaces: Array<{ interfaceIndex: number; interfaceName: string; isPrimary: number }>) => {
      const res = await apiRequest("POST", `/api/devices/${device.id}/monitored-interfaces`, { interfaces });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/devices', device.id, 'monitored-interfaces'] });
    },
  });

  const handleFormSubmit = async (data: InsertDevice) => {
    // First save the device
    await mutation.mutateAsync(data);

    // Build interface list from discovery data OR from existing monitored interfaces
    const primaryIndex = data.interfaceIndex || 1;
    const primaryName = data.interfaceName || device.interfaceName || `Interface ${primaryIndex}`;
    
    // Build interfaces to save
    const interfacesToSave: Array<{ interfaceIndex: number; interfaceName: string; isPrimary: number }> = [
      { interfaceIndex: primaryIndex, interfaceName: primaryName, isPrimary: 1 }
    ];

    // Add secondary interfaces
    if (interfaceData?.interfaces && interfaceData.interfaces.length > 0) {
      // Use discovered interfaces data
      additionalInterfaces.forEach(idx => {
        const iface = interfaceData.interfaces.find(i => i.index === idx);
        interfacesToSave.push({
          interfaceIndex: idx,
          interfaceName: iface?.name || `Interface ${idx}`,
          isPrimary: 0
        });
      });
    } else if (additionalInterfaces.length > 0) {
      // Use existing monitored interfaces data
      additionalInterfaces.forEach(idx => {
        const existing = monitoredInterfaces.find(i => i.interfaceIndex === idx);
        interfacesToSave.push({
          interfaceIndex: idx,
          interfaceName: existing?.interfaceName || `Interface ${idx}`,
          isPrimary: 0
        });
      });
    }

    // Always save interfaces if we have any (primary + any additional)
    await saveInterfacesMutation.mutateAsync(interfacesToSave);
  };

  const toggleAdditionalInterface = (index: number) => {
    setAdditionalInterfaces(prev => 
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-6 w-6 text-muted-foreground hover:text-primary hover:bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity"
          data-testid={`button-edit-device-${device.id}`}
        >
          <Edit2 className="w-3.5 h-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="glass border-white/10 sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Device</DialogTitle>
          <DialogDescription>
            Update the monitoring properties for this device.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Device Name</FormLabel>
                  <FormControl>
                    <Input {...field} data-testid="input-edit-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="ip"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>IP Address</FormLabel>
                  <FormControl>
                    <Input {...field} data-testid="input-edit-ip" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="community"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>SNMP Community</FormLabel>
                  <FormControl>
                    <Input {...field} data-testid="input-edit-community" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Device Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-edit-type">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="unifi">Ubiquiti UniFi</SelectItem>
                        <SelectItem value="mikrotik">MikroTik RouterOS</SelectItem>
                        <SelectItem value="fortigate">Fortigate</SelectItem>
                        <SelectItem value="dlink">D-Link</SelectItem>
                        <SelectItem value="cisco">Cisco</SelectItem>
                        <SelectItem value="iot">IoT Device</SelectItem>
                        <SelectItem value="sunnyboy">SunnyBoy</SelectItem>
                        <SelectItem value="victron">Victron</SelectItem>
                        <SelectItem value="ipphone">IP Phone</SelectItem>
                        <SelectItem value="generic">Generic SNMP</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="site"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Site Location</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-edit-site">
                          <SelectValue placeholder="Select site" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {availableSites.map(site => (
                          <SelectItem key={site} value={site}>{site}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            {/* Interface Selection */}
            <div className="border-t border-white/10 pt-4 mt-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Network className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">SNMP Interface</span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setDiscoverEnabled(true);
                    discoverInterfaces();
                  }}
                  disabled={isDiscovering}
                  data-testid="button-discover-interfaces"
                >
                  {isDiscovering ? (
                    <Loader2 className="w-3 h-3 animate-spin mr-1" />
                  ) : (
                    <RefreshCw className="w-3 h-3 mr-1" />
                  )}
                  Discover
                </Button>
              </div>
              
              <FormField
                control={form.control}
                name="interfaceIndex"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Interface to Monitor</FormLabel>
                    <Select 
                      onValueChange={(val) => {
                        const intVal = parseInt(val);
                        field.onChange(intVal);
                        const iface = interfaceData?.interfaces?.find(i => i.index === intVal);
                        if (iface) {
                          form.setValue("interfaceName", iface.name);
                        }
                      }} 
                      value={String(field.value || 1)}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-edit-interface">
                          <SelectValue placeholder="Select interface" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {interfaceData?.interfaces && interfaceData.interfaces.length > 0 ? (
                          interfaceData.interfaces.map((iface) => (
                            <SelectItem key={iface.index} value={String(iface.index)}>
                              {iface.index}: {iface.name}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value={String(device.interfaceIndex || 1)}>
                            Interface {device.interfaceIndex || 1} {device.interfaceName ? `(${device.interfaceName})` : "(current)"}
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                    <p className="text-xs text-muted-foreground mt-1">
                      Click "Discover" to scan available network interfaces on this device
                    </p>
                  </FormItem>
                )}
              />

              {/* Additional Interfaces Selection */}
              {interfaceData?.interfaces && interfaceData.interfaces.length > 1 && (
                <div className="mt-4 pt-4 border-t border-white/10">
                  <div className="flex items-center gap-2 mb-3">
                    <Layers className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium">Additional Interfaces (Optional)</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">
                    Select additional interfaces to monitor alongside the primary interface
                  </p>
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {interfaceData.interfaces
                      .filter(iface => iface.index !== form.getValues("interfaceIndex"))
                      .map((iface) => (
                        <label 
                          key={iface.index}
                          className="flex items-center gap-2 p-2 rounded-md bg-secondary/30 border border-white/5 cursor-pointer hover:bg-secondary/50 transition-colors"
                        >
                          <Checkbox
                            checked={additionalInterfaces.includes(iface.index)}
                            onCheckedChange={() => toggleAdditionalInterface(iface.index)}
                            data-testid={`checkbox-interface-${iface.index}`}
                          />
                          <span className="text-xs">
                            {iface.index}: {iface.name}
                          </span>
                        </label>
                      ))}
                  </div>
                  {additionalInterfaces.length > 0 && (
                    <p className="text-xs text-primary mt-2">
                      {additionalInterfaces.length} additional interface{additionalInterfaces.length > 1 ? 's' : ''} selected
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending || saveInterfacesMutation.isPending} data-testid="button-save-edit">
                {(mutation.isPending || saveInterfacesMutation.isPending) ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
