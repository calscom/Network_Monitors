import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type InsertDevice } from "@shared/routes";

export function useDevices() {
  return useQuery({
    queryKey: [api.devices.list.path],
    queryFn: async () => {
      const res = await fetch(api.devices.list.path);
      if (!res.ok) throw new Error("Failed to fetch devices");
      return api.devices.list.responses[200].parse(await res.json());
    },
    // Poll every 2 seconds for live status updates
    refetchInterval: 2000,
  });
}

export function useCreateDevice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: InsertDevice) => {
      // Zod validation handles the types
      const validated = api.devices.create.input.parse(data);
      
      const res = await fetch(api.devices.create.path, {
        method: api.devices.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
      });

      if (!res.ok) {
        if (res.status === 400) {
          const error = api.devices.create.responses[400].parse(await res.json());
          throw new Error(error.message);
        }
        throw new Error("Failed to create device");
      }
      
      return api.devices.create.responses[201].parse(await res.json());
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.devices.list.path] }),
  });
}

export function useDeleteDevice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.devices.delete.path, { id });
      const res = await fetch(url, { method: api.devices.delete.method });
      
      if (!res.ok) {
        if (res.status === 404) throw new Error("Device not found");
        throw new Error("Failed to delete device");
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.devices.list.path] }),
  });
}
