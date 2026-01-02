import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Menu, 
  Map, 
  List, 
  Settings2, 
  Upload, 
  Download, 
  FileSpreadsheet,
  Plus,
  Trash2,
  Pencil,
  ChevronUp,
  ChevronDown,
  Check,
  X,
  Building2,
  Server,
  Eye,
  Timer,
  RefreshCw,
  Terminal
} from "lucide-react";
import { UtilityDialog } from "./UtilityDialog";
import { useToast } from "@/hooks/use-toast";
import { Device } from "@shared/schema";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import Papa from "papaparse";
import * as XLSX from "xlsx";

interface MainMenuProps {
  sites: string[];
  onSitesChange: (sites: string[]) => void;
  devices?: Device[];
  viewMode: "list" | "map";
  onViewModeChange: (mode: "list" | "map") => void;
  canManage?: boolean;
}

export function MainMenu({ 
  sites, 
  onSitesChange, 
  devices = [], 
  viewMode, 
  onViewModeChange,
  canManage = false
}: MainMenuProps) {
  const [siteManagerOpen, setSiteManagerOpen] = useState(false);
  const [utilityOpen, setUtilityOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [newSiteName, setNewSiteName] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [reassignTo, setReassignTo] = useState<string>("");
  const siteFileInputRef = useRef<HTMLInputElement>(null);
  const deviceFileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Polling settings
  const { data: pollingSettings } = useQuery<{
    interval: number;
    options: { value: number; label: string }[];
  }>({
    queryKey: ["/api/settings/polling"],
    refetchInterval: 30000,
  });

  const pollingMutation = useMutation({
    mutationFn: async (interval: number) => {
      const res = await fetch("/api/settings/polling", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to update polling interval");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/polling"] });
      queryClient.invalidateQueries({ queryKey: ["/api/logs"] });
      const option = pollingSettings?.options.find(o => o.value === data.interval);
      toast({
        title: "Polling interval updated",
        description: `Now polling every ${option?.label || (data.interval / 1000) + 's'}`,
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const reassignMutation = useMutation({
    mutationFn: async ({ fromSite, toSite }: { fromSite: string; toSite: string }) => {
      const res = await fetch("/api/devices/reassign-site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromSite, toSite }),
      });
      if (res.status === 404) {
        return { updated: 0 };
      }
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to reassign devices");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/devices"] });
    },
  });

  const getDeviceCount = (site: string) => {
    return devices.filter(d => d.site === site).length;
  };

  const handleStartEdit = (site: string) => {
    setEditingSite(site);
    setEditName(site);
  };

  const handleSaveEdit = async () => {
    if (!editName.trim() || !editingSite) return;
    
    const newName = editName.trim();
    if (newName !== editingSite && sites.includes(newName)) {
      toast({
        title: "Site exists",
        description: "A site with that name already exists.",
        variant: "destructive",
      });
      return;
    }

    const deviceCount = getDeviceCount(editingSite);
    if (deviceCount > 0 && newName !== editingSite) {
      try {
        await reassignMutation.mutateAsync({ fromSite: editingSite, toSite: newName });
      } catch (err) {
        toast({
          title: "Error",
          description: "Failed to update devices with new site name.",
          variant: "destructive",
        });
        return;
      }
    }

    const newSites = sites.map(s => s === editingSite ? newName : s);
    onSitesChange(newSites);
    setEditingSite(null);
    setEditName("");
    toast({
      title: "Site renamed",
      description: `"${editingSite}" has been renamed to "${newName}".`,
    });
  };

  const handleCancelEdit = () => {
    setEditingSite(null);
    setEditName("");
  };

  const handleAddSite = () => {
    if (!newSiteName.trim()) return;
    if (sites.includes(newSiteName.trim())) {
      toast({
        title: "Site exists",
        description: "A site with that name already exists.",
        variant: "destructive",
      });
      return;
    }
    onSitesChange([...sites, newSiteName.trim()]);
    setNewSiteName("");
    toast({
      title: "Site added",
      description: `"${newSiteName.trim()}" has been added.`,
    });
  };

  const handleDeleteSite = async (site: string) => {
    const deviceCount = getDeviceCount(site);
    
    if (deviceCount > 0) {
      if (!reassignTo || reassignTo === site) {
        toast({
          title: "Select target site",
          description: "Please select a site to move devices to.",
          variant: "destructive",
        });
        return;
      }

      try {
        await reassignMutation.mutateAsync({ fromSite: site, toSite: reassignTo });
      } catch (err) {
        toast({
          title: "Error",
          description: "Failed to reassign devices.",
          variant: "destructive",
        });
        return;
      }
    }

    const newSites = sites.filter(s => s !== site);
    onSitesChange(newSites);
    setDeleteConfirm(null);
    setReassignTo("");
    toast({
      title: "Site deleted",
      description: `"${site}" has been removed.`,
    });
  };

  const moveSite = (index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= sites.length) return;
    
    const newSites = [...sites];
    [newSites[index], newSites[newIndex]] = [newSites[newIndex], newSites[index]];
    onSitesChange(newSites);
  };

  const handleSiteFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result;
      let newSitesList: string[] = [];

      try {
        if (file.name.endsWith('.csv')) {
          const results = Papa.parse(content as string, { header: false });
          newSitesList = results.data.flat().filter(s => typeof s === 'string' && s.trim()) as string[];
        } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
          const workbook = XLSX.read(content, { type: 'binary' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
          newSitesList = data.flat().filter(s => typeof s === 'string' && s.trim());
        }

        if (newSitesList.length > 0) {
          const uniqueSites = Array.from(new Set([...newSitesList]));
          onSitesChange(uniqueSites);
          toast({
            title: "Sites imported",
            description: `Imported ${uniqueSites.length} sites successfully.`,
          });
        }
      } catch (err) {
        toast({
          title: "Import Error",
          description: "Failed to parse file. Please ensure it's a valid CSV or Excel file.",
          variant: "destructive"
        });
      }
    };

    if (file.name.endsWith('.csv')) {
      reader.readAsText(file);
    } else {
      reader.readAsBinaryString(file);
    }
    
    e.target.value = '';
  };

  const handleDeviceFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const content = evt.target?.result;
      let deviceData: any[] = [];

      try {
        if (file.name.endsWith('.csv')) {
          const results = Papa.parse(content as string, { header: true, skipEmptyLines: true });
          deviceData = results.data;
        } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
          const workbook = XLSX.read(content, { type: 'binary' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          deviceData = XLSX.utils.sheet_to_json(worksheet);
        }

        let successCount = 0;
        let errorCount = 0;

        for (const row of deviceData) {
          const name = row.name || row.Name || row.NAME;
          const ip = row.ip || row.IP || row.ipAddress || row.ip_address;
          const community = row.community || row.Community || row.COMMUNITY || 'public';
          const type = row.type || row.Type || row.TYPE || 'generic';
          const site = row.site || row.Site || row.SITE || 'Default Site';

          if (!name || !ip) {
            errorCount++;
            continue;
          }

          try {
            const res = await fetch('/api/devices', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name, ip, community, type, site }),
            });
            if (res.ok) {
              successCount++;
            } else {
              errorCount++;
            }
          } catch {
            errorCount++;
          }
        }

        queryClient.invalidateQueries({ queryKey: ['/api/devices'] });
        
        toast({
          title: "Devices imported",
          description: `Added ${successCount} devices. ${errorCount > 0 ? `${errorCount} failed.` : ''}`,
          variant: errorCount > 0 ? "default" : "default",
        });
      } catch (err) {
        toast({
          title: "Import Error",
          description: "Failed to parse file. Please ensure it's a valid CSV or Excel file.",
          variant: "destructive"
        });
      }
    };

    if (file.name.endsWith('.csv')) {
      reader.readAsText(file);
    } else {
      reader.readAsBinaryString(file);
    }

    e.target.value = '';
  };

  const downloadSiteTemplate = () => {
    const templateContent = "site_name\n01 Cloud\n02-Maiduguri\n03-Gwoza\n04-Mafa\n05-Dikwa\n06-Ngala\n07-Monguno\n08-Bama\n09-Banki\n10-Pulka\n11-Damboa\n12-Gubio";
    const blob = new Blob([templateContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sites_template.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast({
      title: "Template downloaded",
      description: "Sites template CSV has been downloaded.",
    });
  };

  const downloadDeviceTemplate = () => {
    const templateContent = "name,ip,community,type,site\nCore Router,192.168.1.1,public,mikrotik,01 Cloud\nOffice WiFi,192.168.1.5,public,unifi,01 Cloud\nBackup Server,10.0.0.10,private,generic,02-Maiduguri";
    const blob = new Blob([templateContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'devices_template.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast({
      title: "Template downloaded",
      description: "Devices template CSV has been downloaded.",
    });
  };

  return (
    <>
      <input 
        type="file" 
        ref={siteFileInputRef} 
        onChange={handleSiteFileUpload} 
        accept=".csv,.xlsx,.xls" 
        className="hidden" 
        data-testid="input-site-file"
      />
      <input 
        type="file" 
        ref={deviceFileInputRef} 
        onChange={handleDeviceFileUpload} 
        accept=".csv,.xlsx,.xls" 
        className="hidden" 
        data-testid="input-device-file"
      />
      
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="glass border-white/10" data-testid="button-main-menu">
            <Menu className="w-4 h-4 mr-2" />
            Menu
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>View</DropdownMenuLabel>
          <DropdownMenuItem 
            onClick={() => onViewModeChange("list")}
            data-testid="menu-view-list"
          >
            <List className="w-4 h-4 mr-2" />
            List View
            {viewMode === "list" && <Check className="w-4 h-4 ml-auto" />}
          </DropdownMenuItem>
          <DropdownMenuItem 
            onClick={() => onViewModeChange("map")}
            data-testid="menu-view-map"
          >
            <Map className="w-4 h-4 mr-2" />
            Network Map
            {viewMode === "map" && <Check className="w-4 h-4 ml-auto" />}
          </DropdownMenuItem>
          
          <DropdownMenuSeparator />
          
          {canManage && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger data-testid="menu-sites">
                <Building2 className="w-4 h-4 mr-2" />
                Sites
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-48">
                <DropdownMenuItem 
                  onClick={() => setSiteManagerOpen(true)}
                  data-testid="menu-manage-sites"
                >
                  <Settings2 className="w-4 h-4 mr-2" />
                  Manage Sites
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={() => siteFileInputRef.current?.click()}
                  data-testid="menu-import-sites"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Import Sites
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={downloadSiteTemplate}
                  data-testid="menu-download-site-template"
                >
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  Download Template
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          
          <DropdownMenuSub>
            <DropdownMenuSubTrigger data-testid="menu-devices">
              <Server className="w-4 h-4 mr-2" />
              Devices
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-48">
              <DropdownMenuItem 
                onClick={() => window.open("/api/devices/template", "_blank")}
                data-testid="menu-download-devices"
              >
                <Download className="w-4 h-4 mr-2" />
                Download Devices
              </DropdownMenuItem>
              {canManage && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={() => deviceFileInputRef.current?.click()}
                    data-testid="menu-upload-devices"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Devices
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={downloadDeviceTemplate}
                    data-testid="menu-download-device-template"
                  >
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    Download Template
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          
          {canManage && (
            <>
              <DropdownMenuSeparator />
              
              <DropdownMenuSub>
                <DropdownMenuSubTrigger data-testid="menu-settings">
                  <Timer className="w-4 h-4 mr-2" />
                  Polling Interval
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-40">
                  <DropdownMenuRadioGroup 
                    value={pollingSettings?.interval?.toString() || "5000"}
                    onValueChange={(value) => pollingMutation.mutate(parseInt(value))}
                  >
                    {pollingSettings?.options?.map((option) => (
                      <DropdownMenuRadioItem 
                        key={option.value} 
                        value={option.value.toString()}
                        data-testid={`polling-${option.value}`}
                        disabled={pollingMutation.isPending}
                      >
                        {option.label}
                      </DropdownMenuRadioItem>
                    )) || (
                      <>
                        <DropdownMenuRadioItem value="5000">5 sec</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="10000">10 sec</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="30000">30 sec</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="60000">60 sec</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="120000">2 min</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="300000">5 min</DropdownMenuRadioItem>
                      </>
                    )}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </>
          )}
          
          <DropdownMenuSeparator />
          
          <DropdownMenuItem 
            onClick={() => setUtilityOpen(true)}
            data-testid="menu-utility"
          >
            <Terminal className="w-4 h-4 mr-2" />
            Network Utilities
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      
      <UtilityDialog open={utilityOpen} onOpenChange={setUtilityOpen} />

      <Dialog open={siteManagerOpen} onOpenChange={setSiteManagerOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Manage Sites
            </DialogTitle>
            <DialogDescription>
              Add, edit, reorder, or remove monitoring sites. Devices will be reassigned when renaming or deleting sites.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="flex gap-2">
              <Input
                placeholder="New site name..."
                value={newSiteName}
                onChange={(e) => setNewSiteName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddSite()}
                data-testid="input-new-site"
              />
              <Button onClick={handleAddSite} data-testid="button-add-site">
                <Plus className="w-4 h-4 mr-2" />
                Add
              </Button>
            </div>

            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {sites.map((site, index) => {
                const deviceCount = getDeviceCount(site);
                return (
                  <div 
                    key={site} 
                    className="flex items-center gap-2 p-3 rounded-lg bg-secondary/50 border border-white/5"
                  >
                    <div className="flex flex-col gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-5 w-5"
                        onClick={() => moveSite(index, "up")}
                        disabled={index === 0}
                        data-testid={`button-move-up-${index}`}
                      >
                        <ChevronUp className="w-3 h-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-5 w-5"
                        onClick={() => moveSite(index, "down")}
                        disabled={index === sites.length - 1}
                        data-testid={`button-move-down-${index}`}
                      >
                        <ChevronDown className="w-3 h-3" />
                      </Button>
                    </div>

                    <div className="flex-1 min-w-0">
                      {editingSite === site ? (
                        <div className="flex items-center gap-2">
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEdit();
                              if (e.key === 'Escape') handleCancelEdit();
                            }}
                            className="h-8"
                            autoFocus
                            data-testid={`input-edit-site-${index}`}
                          />
                          <Button size="icon" variant="ghost" onClick={handleSaveEdit} data-testid={`button-save-site-${index}`}>
                            <Check className="w-4 h-4 text-green-500" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={handleCancelEdit} data-testid={`button-cancel-edit-${index}`}>
                            <X className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{site}</span>
                          {deviceCount > 0 && (
                            <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                              {deviceCount} device{deviceCount !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {editingSite !== site && (
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleStartEdit(site)}
                          data-testid={`button-edit-site-${index}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setDeleteConfirm(site);
                            if (deviceCount > 0) {
                              const otherSites = sites.filter(s => s !== site);
                              setReassignTo(otherSites[0] || "");
                            }
                          }}
                          disabled={sites.length <= 1}
                          data-testid={`button-delete-site-${index}`}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSiteManagerOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Site: {deleteConfirm}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirm && getDeviceCount(deleteConfirm) > 0 ? (
                <div className="space-y-4">
                  <p>
                    This site has <strong>{getDeviceCount(deleteConfirm)}</strong> device(s). 
                    Please select a site to move them to:
                  </p>
                  <Select value={reassignTo} onValueChange={setReassignTo}>
                    <SelectTrigger data-testid="select-reassign-site">
                      <SelectValue placeholder="Select target site" />
                    </SelectTrigger>
                    <SelectContent>
                      {sites.filter(s => s !== deleteConfirm).map(site => (
                        <SelectItem key={site} value={site}>
                          {site}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <p>Are you sure you want to delete this site? This action cannot be undone.</p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setReassignTo("")}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => deleteConfirm && handleDeleteSite(deleteConfirm)}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
