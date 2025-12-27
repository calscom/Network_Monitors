import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface UtilizationGaugeProps {
  value: number; // 0-100
  label?: string;
}

export function UtilizationGauge({ value, label = "Bandwidth" }: UtilizationGaugeProps) {
  // Determine color based on threshold
  const getColor = (v: number) => {
    if (v <= 50) return "bg-[hsl(var(--status-green))]";
    if (v <= 75) return "bg-[hsl(var(--status-yellow))]";
    return "bg-[hsl(var(--status-red))]";
  };
  
  const getTextColor = (v: number) => {
    if (v <= 50) return "text-[hsl(var(--status-green))]";
    if (v <= 75) return "text-[hsl(var(--status-yellow))]";
    return "text-[hsl(var(--status-red))]";
  };

  const colorClass = getColor(value);
  const textColorClass = getTextColor(value);

  return (
    <div className="w-full space-y-2">
      <div className="flex justify-between items-end">
        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
          {label}
        </span>
        <span className={cn("text-sm font-mono font-bold", textColorClass)}>
          {value}%
        </span>
      </div>
      
      {/* Track */}
      <div className="h-2 w-full bg-secondary rounded-full overflow-hidden relative">
        {/* Fill with animation */}
        <motion.div 
          className={cn("h-full rounded-full", colorClass)}
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, Math.max(0, value))}%` }}
          transition={{ type: "spring", stiffness: 50, damping: 15 }}
        />
        
        {/* Threshold markers */}
        <div className="absolute top-0 bottom-0 left-1/2 w-px bg-background/20 z-10" />
        <div className="absolute top-0 bottom-0 left-3/4 w-px bg-background/20 z-10" />
      </div>
    </div>
  );
}
