import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import type { User } from "@shared/models/auth";

const isReplitEnvironment = typeof window !== "undefined" && 
  (window.location.hostname.includes("replit") || 
   window.location.hostname.includes("repl.co") ||
   !!import.meta.env.VITE_REPLIT_ENV);

async function fetchUser(): Promise<User | null> {
  const response = await fetch("/api/auth/user", {
    credentials: "include",
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`${response.status}: ${response.statusText}`);
  }

  return response.json();
}

export function useAuth() {
  const queryClient = useQueryClient();
  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    queryFn: fetchUser,
    retry: false,
    staleTime: 0,
    refetchOnMount: true,
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Logout failed");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/user"], null);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    },
  });

  const handleLogout = () => {
    if (isReplitEnvironment) {
      queryClient.setQueryData(["/api/auth/user"], null);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      window.location.href = "/api/logout";
    } else {
      logoutMutation.mutate();
    }
  };

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    logout: handleLogout,
    isLoggingOut: logoutMutation.isPending,
    isReplitEnvironment,
  };
}
