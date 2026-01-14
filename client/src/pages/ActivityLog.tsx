import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Log } from "@shared/schema";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UserMenu } from "@/components/UserMenu";
import {
  History,
  Search,
  Filter,
  ArrowLeft,
  RefreshCw,
  Plus,
  Minus,
  Edit,
  ArrowRightLeft,
  Activity,
  LogIn,
  LogOut,
  UserPlus,
  Shield,
  UserCog,
  UserX,
  Settings,
  Wifi,
  WifiOff,
  Bell,
} from "lucide-react";
import { Link } from "wouter";

const LOG_TYPE_OPTIONS = [
  { value: "all", label: "All Types" },
  { value: "device_added", label: "Device Added" },
  { value: "device_removed", label: "Device Removed" },
  { value: "device_updated", label: "Device Updated" },
  { value: "devices_reassigned", label: "Devices Reassigned" },
  { value: "status_change", label: "Status Change" },
  { value: "user_login", label: "User Login" },
  { value: "user_logout", label: "User Logout" },
  { value: "user_signup", label: "User Signup" },
  { value: "admin_setup", label: "Admin Setup" },
  { value: "user_role_changed", label: "Role Changed" },
  { value: "user_deleted", label: "User Deleted" },
  { value: "settings_changed", label: "Settings Changed" },
];

const getLogTypeIcon = (type: string) => {
  switch (type) {
    case "device_added":
      return <Plus className="w-4 h-4" />;
    case "device_removed":
      return <Minus className="w-4 h-4" />;
    case "device_updated":
      return <Edit className="w-4 h-4" />;
    case "devices_reassigned":
      return <ArrowRightLeft className="w-4 h-4" />;
    case "status_change":
      return <Activity className="w-4 h-4" />;
    case "user_login":
      return <LogIn className="w-4 h-4" />;
    case "user_logout":
      return <LogOut className="w-4 h-4" />;
    case "user_signup":
      return <UserPlus className="w-4 h-4" />;
    case "admin_setup":
      return <Shield className="w-4 h-4" />;
    case "user_role_changed":
      return <UserCog className="w-4 h-4" />;
    case "user_deleted":
      return <UserX className="w-4 h-4" />;
    case "settings_changed":
      return <Settings className="w-4 h-4" />;
    default:
      return <Bell className="w-4 h-4" />;
  }
};

const getLogTypeStyles = (type: string) => {
  switch (type) {
    case "device_added":
      return {
        color: "text-emerald-400",
        bg: "bg-emerald-500/10",
        border: "border-l-emerald-500",
      };
    case "device_removed":
      return {
        color: "text-rose-400",
        bg: "bg-rose-500/10",
        border: "border-l-rose-500",
      };
    case "device_updated":
      return {
        color: "text-blue-400",
        bg: "bg-blue-500/10",
        border: "border-l-blue-500",
      };
    case "devices_reassigned":
      return {
        color: "text-amber-400",
        bg: "bg-amber-500/10",
        border: "border-l-amber-500",
      };
    case "status_change":
      return {
        color: "text-purple-400",
        bg: "bg-purple-500/10",
        border: "border-l-purple-500",
      };
    case "user_login":
      return {
        color: "text-green-400",
        bg: "bg-green-500/10",
        border: "border-l-green-500",
      };
    case "user_logout":
      return {
        color: "text-slate-400",
        bg: "bg-slate-500/10",
        border: "border-l-slate-500",
      };
    case "user_signup":
      return {
        color: "text-cyan-400",
        bg: "bg-cyan-500/10",
        border: "border-l-cyan-500",
      };
    case "admin_setup":
      return {
        color: "text-orange-400",
        bg: "bg-orange-500/10",
        border: "border-l-orange-500",
      };
    case "user_role_changed":
      return {
        color: "text-indigo-400",
        bg: "bg-indigo-500/10",
        border: "border-l-indigo-500",
      };
    case "user_deleted":
      return {
        color: "text-red-400",
        bg: "bg-red-500/10",
        border: "border-l-red-500",
      };
    case "settings_changed":
      return {
        color: "text-yellow-400",
        bg: "bg-yellow-500/10",
        border: "border-l-yellow-500",
      };
    default:
      return {
        color: "text-muted-foreground",
        bg: "bg-muted/10",
        border: "border-l-muted",
      };
  }
};

export default function ActivityLog() {
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [siteFilter, setSiteFilter] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const { data: logs, isLoading, refetch, isFetching } = useQuery<Log[]>({
    queryKey: ["/api/logs"],
    queryFn: async () => {
      const res = await fetch("/api/logs");
      if (!res.ok) throw new Error("Failed to fetch logs");
      return res.json();
    },
    refetchInterval: 5000, // Optimized for performance
  });

  const sites = useMemo(() => {
    if (!logs) return [];
    const uniqueSites = Array.from(new Set(logs.map((log) => log.site)));
    return uniqueSites.sort();
  }, [logs]);

  const filteredLogs = useMemo(() => {
    if (!logs) return [];
    return logs.filter((log) => {
      const matchesSearch =
        searchQuery === "" ||
        log.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.site.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.type.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesType = typeFilter === "all" || log.type === typeFilter;
      const matchesSite = siteFilter === "all" || log.site === siteFilter;

      return matchesSearch && matchesType && matchesSite;
    });
  }, [logs, searchQuery, typeFilter, siteFilter]);

  const paginatedLogs = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredLogs.slice(start, start + pageSize);
  }, [filteredLogs, page]);

  const totalPages = Math.ceil(filteredLogs.length / pageSize);

  const typeCounts = useMemo(() => {
    if (!logs) return {};
    return logs.reduce(
      (acc, log) => {
        acc[log.type] = (acc[log.type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
  }, [logs]);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 glass border-b border-white/10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-primary" />
              <h1 className="text-lg font-semibold">Activity Log</h1>
            </div>
            <Badge variant="outline" className="text-[9px] animate-pulse">
              Live
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => refetch()}
              disabled={isFetching}
              data-testid="button-refresh-logs"
            >
              <RefreshCw
                className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`}
              />
            </Button>
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Filter className="w-4 h-4" />
                    Filters
                  </CardTitle>
                  <div className="text-sm text-muted-foreground">
                    {filteredLogs.length} of {logs?.length || 0} entries
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search logs..."
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setPage(1);
                      }}
                      className="pl-9"
                      data-testid="input-search-logs"
                    />
                  </div>
                  <Select
                    value={typeFilter}
                    onValueChange={(value) => {
                      setTypeFilter(value);
                      setPage(1);
                    }}
                  >
                    <SelectTrigger
                      className="w-full sm:w-[180px]"
                      data-testid="select-type-filter"
                    >
                      <SelectValue placeholder="Filter by type" />
                    </SelectTrigger>
                    <SelectContent>
                      {LOG_TYPE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={siteFilter}
                    onValueChange={(value) => {
                      setSiteFilter(value);
                      setPage(1);
                    }}
                  >
                    <SelectTrigger
                      className="w-full sm:w-[180px]"
                      data-testid="select-site-filter"
                    >
                      <SelectValue placeholder="Filter by site" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sites</SelectItem>
                      {sites.map((site) => (
                        <SelectItem key={site} value={site}>
                          {site}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : paginatedLogs.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    No activity logs found
                  </div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {paginatedLogs.map((log) => {
                      const styles = getLogTypeStyles(log.type);
                      return (
                        <div
                          key={log.id}
                          className={`p-4 border-l-2 ${styles.border} hover-elevate transition-colors`}
                          data-testid={`log-entry-${log.id}`}
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className={`p-2 rounded-lg ${styles.bg} ${styles.color}`}
                            >
                              {getLogTypeIcon(log.type)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <span
                                  className={`font-medium uppercase text-[10px] tracking-wider ${styles.color}`}
                                >
                                  {log.type.replace(/_/g, " ")}
                                </span>
                                <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                                  {format(
                                    new Date(log.timestamp),
                                    "MMM d, yyyy HH:mm:ss"
                                  )}
                                </span>
                              </div>
                              <p className="text-sm text-foreground leading-snug">
                                {log.message}
                              </p>
                              <div className="flex items-center gap-2 mt-2">
                                <Badge
                                  variant="secondary"
                                  className="text-[9px]"
                                >
                                  {log.site}
                                </Badge>
                                {log.deviceId && (
                                  <span className="text-[9px] text-muted-foreground">
                                    Device ID: {log.deviceId}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <Button
                  variant="outline"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  data-testid="button-prev-page"
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  data-testid="button-next-page"
                >
                  Next
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="w-4 h-4" />
                  Activity Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {LOG_TYPE_OPTIONS.filter((opt) => opt.value !== "all").map(
                  (option) => {
                    const count = typeCounts[option.value] || 0;
                    const styles = getLogTypeStyles(option.value);
                    return (
                      <button
                        key={option.value}
                        onClick={() => {
                          setTypeFilter(
                            typeFilter === option.value ? "all" : option.value
                          );
                          setPage(1);
                        }}
                        className={`w-full flex items-center justify-between p-2 rounded-lg text-sm transition-colors ${
                          typeFilter === option.value
                            ? styles.bg
                            : "hover:bg-secondary/50"
                        }`}
                        data-testid={`filter-button-${option.value}`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={styles.color}>
                            {getLogTypeIcon(option.value)}
                          </span>
                          <span className="text-foreground/80">
                            {option.label}
                          </span>
                        </div>
                        <Badge variant="secondary" className="text-[10px]">
                          {count}
                        </Badge>
                      </button>
                    );
                  }
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Wifi className="w-4 h-4" />
                  Recent Status Changes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {logs
                  ?.filter((log) => log.type === "status_change")
                  .slice(0, 5)
                  .map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center gap-2 text-xs p-2 rounded-lg bg-secondary/30"
                    >
                      {log.message.includes("Offline") ? (
                        <WifiOff className="w-3 h-3 text-rose-400 shrink-0" />
                      ) : (
                        <Wifi className="w-3 h-3 text-emerald-400 shrink-0" />
                      )}
                      <span className="truncate text-muted-foreground">
                        {log.message}
                      </span>
                    </div>
                  )) || (
                  <div className="text-center py-4 text-muted-foreground text-sm">
                    No recent status changes
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
