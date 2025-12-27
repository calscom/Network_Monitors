import { cn } from "@/lib/utils";

type Status = "green" | "red" | "blue" | "unknown" | string;

interface StatusBadgeProps {
  status: Status;
  className?: string;
  showLabel?: boolean;
}

export function StatusBadge({ status, className, showLabel = false }: StatusBadgeProps) {
  const getStatusColor = (s: Status) => {
    switch (s) {
      case "green": return "bg-[hsl(var(--status-green))] shadow-[0_0_12px_hsl(var(--status-green)/0.4)]";
      case "red": return "bg-[hsl(var(--status-red))] shadow-[0_0_12px_hsl(var(--status-red)/0.4)]";
      case "blue": return "bg-[hsl(var(--status-blue))] shadow-[0_0_12px_hsl(var(--status-blue)/0.4)]";
      default: return "bg-gray-500";
    }
  };

  const getStatusLabel = (s: Status) => {
    switch (s) {
      case "green": return "Online";
      case "red": return "Offline";
      case "blue": return "Recovering";
      default: return "Unknown";
    }
  };

  const isCritical = status === "red" || status === "blue";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="relative flex items-center justify-center">
        {/* Pulsing ring for critical/recovery states */}
        {isCritical && (
          <div className={cn(
            "absolute w-full h-full rounded-full animate-pulse-ring opacity-50",
            getStatusColor(status).split(" ")[0] // Extract base color class
          )} />
        )}
        
        {/* Main status dot */}
        <div className={cn(
          "w-3 h-3 rounded-full transition-all duration-300",
          getStatusColor(status)
        )} />
      </div>
      
      {showLabel && (
        <span className={cn(
          "text-xs font-medium uppercase tracking-wider",
          status === "green" ? "text-[hsl(var(--status-green))]" :
          status === "red" ? "text-[hsl(var(--status-red))]" :
          status === "blue" ? "text-[hsl(var(--status-blue))]" :
          "text-muted-foreground"
        )}>
          {getStatusLabel(status)}
        </span>
      )}
    </div>
  );
}
