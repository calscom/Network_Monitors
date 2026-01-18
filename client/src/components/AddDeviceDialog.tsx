import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useCreateDevice } from "@/hooks/use-devices";
import { insertDeviceSchema, type InsertDevice } from "@shared/schema";
import { Plus, Loader2, Network, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useSites } from "@/hooks/use-sites";

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

export function AddDeviceDialog() {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const createMutation = useCreateDevice();
  const { siteNames: sites, refetch: refetchSites } = useSites();
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
    const handleSitesUpdated = () => {
      refetchSites();
    };
    window.addEventListener('sitesUpdated', handleSitesUpdated);
    return () => {
      window.removeEventListener('sitesUpdated', handleSitesUpdated);
    };
  }, [refetchSites]);

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
      maxBandwidth: 100,
      apiUsername: undefined,
      apiPassword: undefined,
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
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] glass border-white/10 text-foreground">
        <DialogHeader>
          <DialogTitle className="text-xl font-display">Add Network Device</DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            {form.watch("pollType") === "ping_only" 
              ? "Monitor via ICMP ping (online/offline only)."
              : form.watch("pollType") === "ping_and_snmp"
              ? "Must respond to both ping AND SNMP."
              : form.watch("pollType") === "ping_or_snmp"
              ? "Online if either ping OR SNMP succeeds."
              : "Monitor via SNMP v2."}
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3 py-2 overflow-y-auto max-h-[60vh] pr-2">
            {/* Row 1: Name and IP */}
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Device Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Core Router" {...field} className="h-9 bg-secondary/50 border-white/10 focus:border-primary/50" />
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
                    <FormLabel className="text-xs">IP Address</FormLabel>
                    <FormControl>
                      <Input placeholder="192.168.1.1" {...field} className="h-9 font-mono bg-secondary/50 border-white/10 focus:border-primary/50" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            {/* Row 2: Type and Site */}
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Device Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-9 bg-secondary/50 border-white/10 focus:border-primary/50">
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
                    <FormLabel className="text-xs">Site</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-9 bg-secondary/50 border-white/10 focus:border-primary/50">
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
            </div>

            {/* Row 3: Poll Type and Community/Max Bandwidth */}
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="pollType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Poll Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value || "snmp_only"}>
                      <FormControl>
                        <SelectTrigger className="h-9 bg-secondary/50 border-white/10 focus:border-primary/50">
                          <SelectValue placeholder="Select poll type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="ping_only">Ping Only</SelectItem>
                        <SelectItem value="snmp_only">SNMP Only</SelectItem>
                        <SelectItem value="ping_and_snmp">Ping AND SNMP</SelectItem>
                        <SelectItem value="ping_or_snmp">Ping OR SNMP</SelectItem>
                        <SelectItem value="usermanager_api">User Manager API</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {form.watch("pollType") !== "ping_only" ? (
                <FormField
                  control={form.control}
                  name="community"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">SNMP Community</FormLabel>
                      <FormControl>
                        <Input placeholder="public" {...field} className="h-9 bg-secondary/50 border-white/10 focus:border-primary/50" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <div />
              )}
            </div>

            {form.watch("pollType") !== "ping_only" && (
              <>
                {/* Row 4: Max Bandwidth and Interface Discovery */}
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="maxBandwidth"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Max Bandwidth (Mbps)</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            placeholder="100" 
                            {...field}
                            value={field.value || 100}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 100)}
                            className="h-9 bg-secondary/50 border-white/10 focus:border-primary/50" 
                            data-testid="input-max-bandwidth-add"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="interfaceIndex"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center justify-between">
                          <FormLabel className="text-xs">Interface</FormLabel>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={handleDiscover}
                            disabled={discoverMutation.isPending}
                            className="h-5 px-2 text-xs"
                            data-testid="button-discover-interfaces-add"
                          >
                            {discoverMutation.isPending ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <>
                                <Search className="w-3 h-3 mr-1" />
                                Discover
                              </>
                            )}
                          </Button>
                        </div>
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
                            <SelectTrigger className="h-9 bg-secondary/50 border-white/10 focus:border-primary/50" data-testid="select-add-interface">
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
                      </FormItem>
                    )}
                  />
                </div>
                {discoveredInterfaces.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {discoveredInterfaces.length} interfaces found. Uplink auto-selected.
                  </p>
                )}
              </>
            )}
            
            {form.watch("pollType") === "ping_only" && (
              <div className="text-xs text-muted-foreground bg-secondary/30 p-2 rounded-md border border-white/10">
                Ping-only: monitors online/offline status only, no bandwidth metrics.
              </div>
            )}

            {form.watch("pollType") === "usermanager_api" && (
              <>
                <div className="text-xs text-muted-foreground bg-blue-500/10 p-2 rounded-md border border-blue-500/20">
                  User Manager API: Polls active sessions via MikroTik REST API (requires RouterOS 7.1+).
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="apiUsername"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">API Username</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="admin" 
                            {...field} 
                            value={field.value || ""}
                            className="h-9 bg-secondary/50 border-white/10 focus:border-primary/50" 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="apiPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">API Password</FormLabel>
                        <FormControl>
                          <Input 
                            type="password"
                            placeholder="password" 
                            {...field}
                            value={field.value || ""}
                            className="h-9 bg-secondary/50 border-white/10 focus:border-primary/50" 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </>
            )}

            <DialogFooter className="pt-3 gap-2">
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
