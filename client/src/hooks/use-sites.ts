import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Site } from "@shared/schema";

export function useSites() {
  const query = useQuery<Site[]>({
    queryKey: ["/api/sites"],
    staleTime: 30000,
  });

  const createSiteMutation = useMutation({
    mutationFn: async ({ name, displayOrder }: { name: string; displayOrder?: number }) => {
      const res = await apiRequest("POST", "/api/sites", { name, displayOrder });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sites"] });
      window.dispatchEvent(new CustomEvent('sitesUpdated'));
    }
  });

  const renameSiteMutation = useMutation({
    mutationFn: async ({ id, oldName, newName }: { id: number; oldName: string; newName: string }) => {
      const res = await apiRequest("PATCH", `/api/sites/${id}/rename`, { oldName, newName });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sites"] });
      queryClient.invalidateQueries({ queryKey: ["/api/devices"] });
      window.dispatchEvent(new CustomEvent('sitesUpdated'));
    }
  });

  const deleteSiteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/sites/${id}`, undefined);
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sites"] });
      window.dispatchEvent(new CustomEvent('sitesUpdated'));
    }
  });

  const reorderSitesMutation = useMutation({
    mutationFn: async (siteIds: number[]) => {
      const res = await apiRequest("POST", "/api/sites/reorder", { siteIds });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sites"] });
      window.dispatchEvent(new CustomEvent('sitesUpdated'));
    }
  });

  const bulkImportSitesMutation = useMutation({
    mutationFn: async (siteNames: string[]) => {
      const res = await apiRequest("POST", "/api/sites/bulk-import", { siteNames });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sites"] });
      window.dispatchEvent(new CustomEvent('sitesUpdated'));
    }
  });

  return {
    sites: query.data || [],
    siteNames: query.data?.map(s => s.name) || [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    createSite: createSiteMutation.mutateAsync,
    renameSite: renameSiteMutation.mutateAsync,
    deleteSite: deleteSiteMutation.mutateAsync,
    reorderSites: reorderSitesMutation.mutateAsync,
    bulkImportSites: bulkImportSitesMutation.mutateAsync,
    isCreating: createSiteMutation.isPending,
    isRenaming: renameSiteMutation.isPending,
    isDeleting: deleteSiteMutation.isPending,
    isReordering: reorderSitesMutation.isPending,
    isImporting: bulkImportSitesMutation.isPending,
  };
}
