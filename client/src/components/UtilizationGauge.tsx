import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface UtilizationGaugeProps {
  value: number; // 0-100 (Load %)
  bandwidth?: string; // Mbps
  label?: string;
}

export function UtilizationGauge({ value, bandwidth, label = "Bandwidth" }: UtilizationGaugeProps) {
  // Determine color based on threshold
  const getColor = (v: number) => {
    if (v <= 50) return "bg-emerald-500";
    if (v <= 75) return "bg-amber-500";
    return "bg-rose-500";
  };
  
  const getTextColor = (v: number) => {
    if (v <= 50) return "text-emerald-500";
    if (v <= 75) return "text-amber-500";
    return "text-rose-500";
  };

  const colorClass = getColor(value);
  const textColorClass = getTextColor(value);

  return (
    <div className="w-full space-y-2 sm:space-y-3">
      <div className="flex justify-between items-end gap-2">
        <div className="space-y-0.5">
          <span className="text-[9px] sm:text-[10px] text-muted-foreground font-bold uppercase tracking-widest block opacity-70">
            {label}
          </span>
          <div className="flex items-baseline gap-1">
            <span className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-foreground">
              {bandwidth || "0.00"}
            </span>
            <span className="text-[10px] sm:text-xs font-medium text-muted-foreground">Mbps</span>
          </div>
        </div>
        <div className="text-right">
          <span className="text-[9px] sm:text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest block mb-0.5">Load</span>
          <span className={cn("text-[10px] sm:text-xs font-mono font-bold px-1.5 sm:px-2 py-0.5 rounded bg-white/5 border border-white/5", textColorClass)}>
            {value}%
          </span>
        </div>
      </div>
      
      {/* Track */}
      <div className="h-1.5 sm:h-2 w-full bg-secondary/30 rounded-full overflow-hidden relative border border-white/5 p-[1px]">
        {/* Fill with animation */}
        <motion.div 
          className={cn("h-full rounded-full shadow-[0_0_10px_rgba(0,0,0,0.2)]", colorClass)}
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, Math.max(0, value))}%` }}
          transition={{ type: "spring", stiffness: 50, damping: 15 }}
        />
      </div>
    </div>
  );
}
