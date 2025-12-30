import { useState } from "react";
import { Button } from "@/components/ui/button";
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
import { Settings2, Trash2, GripVertical, Pencil, Plus, Check, X, ChevronUp, ChevronDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Device } from "@shared/schema";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";

interface SiteManagerProps {
  sites: string[];
  onSitesChange: (sites: string[]) => void;
  devices?: Device[];
}

export function SiteManager({ sites, onSitesChange, devices = [] }: SiteManagerProps) {
  const [open, setOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [newSiteName, setNewSiteName] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [reassignTo, setReassignTo] = useState<string>("");
  const { toast } = useToast();

  const reassignMutation = useMutation({
    mutationFn: async ({ fromSite, toSite }: { fromSite: string; toSite: string }) => {
      const res = await fetch("/api/devices/reassign-site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromSite, toSite }),
      });
      // 404 means no devices found - that's okay for rename/delete flow
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

    // Reassign devices to new site name if there are any
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

  const handleDelete = (site: string) => {
    const deviceCount = getDeviceCount(site);
    if (deviceCount > 0) {
      // Set default reassignment target to first available site that's not being deleted
      const otherSites = sites.filter(s => s !== site);
      setReassignTo(otherSites[0] || "");
      setDeleteConfirm(site);
    } else {
      confirmDelete(site, null);
    }
  };

  const confirmDelete = async (site: string, targetSite: string | null) => {
    const deviceCount = getDeviceCount(site);
    
    // If there are devices and a target site, reassign them first
    if (deviceCount > 0 && targetSite) {
      try {
        await reassignMutation.mutateAsync({ fromSite: site, toSite: targetSite });
      } catch (err) {
        toast({
          title: "Error",
          description: "Failed to reassign devices. Site was not deleted.",
          variant: "destructive",
        });
        setDeleteConfirm(null);
        return;
      }
    }

    const newSites = sites.filter(s => s !== site);
    onSitesChange(newSites);
    setDeleteConfirm(null);
    setReassignTo("");
    toast({
      title: "Site deleted",
      description: targetSite 
        ? `"${site}" has been removed. ${deviceCount} device(s) moved to "${targetSite}".`
        : `"${site}" has been removed.`,
    });
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const newSites = [...sites];
    [newSites[index - 1], newSites[index]] = [newSites[index], newSites[index - 1]];
    onSitesChange(newSites);
  };

  const handleMoveDown = (index: number) => {
    if (index === sites.length - 1) return;
    const newSites = [...sites];
    [newSites[index], newSites[index + 1]] = [newSites[index + 1], newSites[index]];
    onSitesChange(newSites);
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

  const otherSites = deleteConfirm ? sites.filter(s => s !== deleteConfirm) : [];

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="icon" className="glass border-white/10" data-testid="button-manage-sites">
            <Settings2 className="w-4 h-4" />
          </Button>
        </DialogTrigger>
        <DialogContent className="glass border-white/10 max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Sites</DialogTitle>
            <DialogDescription>
              Add, edit, reorder, or delete monitoring sites.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="flex gap-2">
              <Input
                placeholder="New site name..."
                value={newSiteName}
                onChange={(e) => setNewSiteName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddSite()}
                className="bg-secondary/50 border-white/10"
                data-testid="input-new-site"
              />
              <Button onClick={handleAddSite} disabled={!newSiteName.trim()} data-testid="button-add-site">
                <Plus className="w-4 h-4 mr-1" />
                Add
              </Button>
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto">
              {sites.map((site, index) => (
                <div
                  key={site}
                  className="flex items-center gap-2 p-2 rounded-lg bg-secondary/30 border border-white/5 group"
                  data-testid={`site-item-${index}`}
                >
                  <GripVertical className="w-4 h-4 text-muted-foreground/50" />
                  
                  <div className="flex flex-col gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4 p-0"
                      onClick={() => handleMoveUp(index)}
                      disabled={index === 0}
                      data-testid={`button-move-up-${index}`}
                    >
                      <ChevronUp className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4 p-0"
                      onClick={() => handleMoveDown(index)}
                      disabled={index === sites.length - 1}
                      data-testid={`button-move-down-${index}`}
                    >
                      <ChevronDown className="w-3 h-3" />
                    </Button>
                  </div>

                  <div className="flex-1 min-w-0">
                    {editingSite === site ? (
                      <div className="flex items-center gap-1">
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveEdit();
                            if (e.key === "Escape") handleCancelEdit();
                          }}
                          className="h-7 bg-secondary/50 border-white/10"
                          autoFocus
                          data-testid={`input-edit-site-${index}`}
                        />
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-7 w-7" 
                          onClick={handleSaveEdit}
                          disabled={reassignMutation.isPending}
                          data-testid={`button-save-edit-${index}`}
                        >
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCancelEdit} data-testid={`button-cancel-edit-${index}`}>
                          <X className="w-3.5 h-3.5 text-rose-500" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{site}</span>
                        {getDeviceCount(site) > 0 && (
                          <span className="text-[10px] text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
                            {getDeviceCount(site)} device{getDeviceCount(site) > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {editingSite !== site && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleStartEdit(site)}
                        data-testid={`button-edit-site-${index}`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDelete(site)}
                        disabled={sites.length <= 1}
                        data-testid={`button-delete-site-${index}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} className="bg-transparent border-white/10">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteConfirm} onOpenChange={() => { setDeleteConfirm(null); setReassignTo(""); }}>
        <AlertDialogContent className="glass border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Site with Devices?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p>
                  "{deleteConfirm}" has {deleteConfirm ? getDeviceCount(deleteConfirm) : 0} device{deleteConfirm && getDeviceCount(deleteConfirm) > 1 ? "s" : ""} assigned.
                </p>
                {otherSites.length > 0 && (
                  <div className="space-y-2">
                    <Label htmlFor="reassign-site" className="text-foreground">Reassign devices to:</Label>
                    <Select value={reassignTo} onValueChange={setReassignTo}>
                      <SelectTrigger id="reassign-site" className="bg-secondary/50 border-white/10" data-testid="select-reassign-site">
                        <SelectValue placeholder="Select a site..." />
                      </SelectTrigger>
                      <SelectContent>
                        {otherSites.map(site => (
                          <SelectItem key={site} value={site}>{site}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-white/10">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirm && confirmDelete(deleteConfirm, reassignTo)}
              disabled={!reassignTo || reassignMutation.isPending}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {reassignMutation.isPending ? "Moving..." : "Delete & Reassign"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
