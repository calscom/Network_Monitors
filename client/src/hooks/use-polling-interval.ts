import { useQuery } from "@tanstack/react-query";

export interface PollingSettings {
  interval: number;
  options: { value: number; label: string }[];
}

// Returns the currently configured SNMP polling interval (ms) so client-side
// queries can align their refetch cadence with how often the server actually
// polls devices, instead of using an arbitrary fixed interval.
export function usePollingInterval(): number {
  const { data } = useQuery<PollingSettings>({
    queryKey: ["/api/settings/polling"],
    staleTime: 30000,
    refetchInterval: 30000,
    refetchIntervalInBackground: true,
  });
  return data?.interval ?? 5000;
}
