import { useMutation, useQuery } from "@tanstack/react-query";
import { Device, InsertDevice, insertDeviceSchema } from "@shared/schema";
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
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Edit2, Loader2, RefreshCw, Network } from "lucide-react";
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

  useEffect(() => {
    const saved = localStorage.getItem("monitor_sites");
    if (saved) {
      setAvailableSites(JSON.parse(saved));
    }
  }, [open]);

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
          <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
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
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-save-edit">
                {mutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
