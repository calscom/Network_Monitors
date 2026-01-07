import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useCreateDevice } from "@/hooks/use-devices";
import { insertDeviceSchema, type InsertDevice } from "@shared/schema";
import { Plus, Loader2, Network, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";

interface DiscoveredInterface {
  index: number;
  name: string;
  isUplink: boolean;
}
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { useToast } from "@/hooks/use-toast";

const DEFAULT_SITES = [
  "01 Cloud", "02-Maiduguri", "03-Gwoza", "04-Mafa", "05-Dikwa",
  "06-Ngala", "07-Monguno", "08-Bama", "09-Banki", "10-Pulka",
  "11-Damboa", "12-Gubio"
];

export function AddDeviceDialog() {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const createMutation = useCreateDevice();
  const [sites, setSites] = useState<string[]>(() => {
    const saved = localStorage.getItem("monitor_sites");
    return saved ? JSON.parse(saved) : DEFAULT_SITES;
  });
  const [discoveredInterfaces, setDiscoveredInterfaces] = useState<DiscoveredInterface[]>([]);
  const [selectedInterface, setSelectedInterface] = useState<number>(1);
  const [selectedInterfaceName, setSelectedInterfaceName] = useState<string | null>(null);

  // Interface discovery mutation
  const discoverMutation = useMutation({
    mutationFn: async ({ ip, community }: { ip: string; community: string }) => {
      const res = await apiRequest("POST", "/api/discover-interfaces", { ip, community });
      return res.json();
    },
    onSuccess: (data) => {
      setDiscoveredInterfaces(data.interfaces || []);
      if (data.suggestedInterface) {
        setSelectedInterface(data.suggestedInterface);
        form.setValue("interfaceIndex", data.suggestedInterface);
        const suggestedIface = data.interfaces?.find((i: DiscoveredInterface) => i.index === data.suggestedInterface);
        if (suggestedIface) {
          setSelectedInterfaceName(suggestedIface.name);
          form.setValue("interfaceName", suggestedIface.name);
        }
      }
      toast({
        title: "Interfaces Discovered",
        description: `Found ${data.interfaces?.length || 0} interfaces. Auto-selected interface ${data.suggestedInterface}.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Discovery Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    const handleStorageChange = () => {
      const saved = localStorage.getItem("monitor_sites");
      if (saved) setSites(JSON.parse(saved));
    };
    window.addEventListener('storage', handleStorageChange);
    // @ts-ignore
    window.addEventListener('sitesUpdated', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      // @ts-ignore
      window.removeEventListener('sitesUpdated', handleStorageChange);
    };
  }, []);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setDiscoveredInterfaces([]);
      setSelectedInterface(1);
    }
  }, [open]);

  const form = useForm<InsertDevice>({
    resolver: zodResolver(insertDeviceSchema),
    defaultValues: {
      name: "",
      ip: "",
      community: "public",
      type: "generic",
      pollType: "snmp_only",
      interfaceIndex: 1,
      interfaceName: null,
    },
  });

  const handleDiscover = () => {
    const ip = form.getValues("ip");
    const community = form.getValues("community");
    if (!ip) {
      toast({ title: "Enter IP address first", variant: "destructive" });
      return;
    }
    discoverMutation.mutate({ ip, community: community || "public" });
  };

  const onSubmit = (data: InsertDevice) => {
    createMutation.mutate(data, {
      onSuccess: () => {
        setOpen(false);
        form.reset();
        toast({
          title: "Device Added",
          description: `${data.name} is now being monitored.`,
        });
      },
      onError: (error) => {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all">
          <Plus className="w-4 h-4 mr-2" />
          Add Device
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] glass border-white/10 text-foreground">
        <DialogHeader>
          <DialogTitle className="text-xl font-display">Add Network Device</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {form.watch("pollType") === "ping_only" 
              ? "Add a device to monitor via ICMP ping (online/offline status only)."
              : form.watch("pollType") === "ping_and_snmp"
              ? "Add a device that must respond to both ping AND SNMP to be online."
              : form.watch("pollType") === "ping_or_snmp"
              ? "Add a device that is online if either ping OR SNMP succeeds."
              : "Add a new device to monitor via SNMP v2."}
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Device Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Core Router" {...field} className="bg-secondary/50 border-white/10 focus:border-primary/50" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="ip"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>IP Address</FormLabel>
                    <FormControl>
                      <Input placeholder="192.168.1.1" {...field} className="font-mono bg-secondary/50 border-white/10 focus:border-primary/50" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Device Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-secondary/50 border-white/10 focus:border-primary/50">
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
            </div>
            
            <FormField
              control={form.control}
              name="pollType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Poll Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value || "snmp_only"}>
                    <FormControl>
                      <SelectTrigger className="bg-secondary/50 border-white/10 focus:border-primary/50">
                        <SelectValue placeholder="Select poll type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="ping_only">Ping Only</SelectItem>
                      <SelectItem value="snmp_only">SNMP Only</SelectItem>
                      <SelectItem value="ping_and_snmp">Ping AND SNMP</SelectItem>
                      <SelectItem value="ping_or_snmp">Ping OR SNMP</SelectItem>
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
                  <FormLabel>Site</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="bg-secondary/50 border-white/10 focus:border-primary/50">
                        <SelectValue placeholder="Select site" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {sites.map(site => (
                        <SelectItem key={site} value={site}>{site}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {form.watch("pollType") !== "ping_only" && (
              <>
                <FormField
                  control={form.control}
                  name="community"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>SNMP Community</FormLabel>
                      <FormControl>
                        <Input placeholder="public" {...field} className="bg-secondary/50 border-white/10 focus:border-primary/50" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Interface Discovery Section */}
                <div className="border-t border-white/10 pt-4 mt-2">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Network className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium">SNMP Interface</span>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleDiscover}
                      disabled={discoverMutation.isPending}
                      data-testid="button-discover-interfaces-add"
                    >
                      {discoverMutation.isPending ? (
                        <Loader2 className="w-3 h-3 animate-spin mr-1" />
                      ) : (
                        <Search className="w-3 h-3 mr-1" />
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
                            setSelectedInterface(intVal);
                            const iface = discoveredInterfaces.find(i => i.index === intVal);
                            if (iface) {
                              setSelectedInterfaceName(iface.name);
                              form.setValue("interfaceName", iface.name);
                            }
                          }} 
                          value={String(field.value || 1)}
                        >
                          <FormControl>
                            <SelectTrigger className="bg-secondary/50 border-white/10 focus:border-primary/50" data-testid="select-add-interface">
                              <SelectValue placeholder="Select interface" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {discoveredInterfaces.length > 0 ? (
                              discoveredInterfaces.map((iface) => (
                                <SelectItem key={iface.index} value={String(iface.index)}>
                                  {iface.index}: {iface.name} {iface.isUplink && "(uplink)"}
                                </SelectItem>
                              ))
                            ) : (
                              <SelectItem value="1">Interface 1 (default)</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                        <p className="text-xs text-muted-foreground mt-1">
                          {discoveredInterfaces.length > 0 
                            ? `${discoveredInterfaces.length} interfaces found. Uplink auto-selected.`
                            : "Click Discover to scan interfaces after entering IP and community."}
                        </p>
                      </FormItem>
                    )}
                  />
                </div>
              </>
            )}
            
            {form.watch("pollType") === "ping_only" && (
              <div className="text-sm text-muted-foreground bg-secondary/30 p-3 rounded-md border border-white/10">
                <p>Ping-only devices are monitored for online/offline status using ICMP ping. No bandwidth or traffic metrics are collected.</p>
              </div>
            )}

            <DialogFooter className="pt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setOpen(false)}
                className="bg-transparent border-white/10 hover:bg-white/5 hover:text-foreground"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={createMutation.isPending}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {createMutation.isPending ? "Adding..." : "Add Device"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
