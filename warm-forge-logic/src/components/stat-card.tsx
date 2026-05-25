import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  delta,
  icon: Icon,
  accent = "primary",
}: {
  label: string;
  value: string | number;
  delta?: string;
  icon: LucideIcon;
  accent?: "primary" | "info" | "success" | "warning" | "gold" | "destructive";
}) {
  const accents: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    info: "bg-info/10 text-info",
    success: "bg-success/10 text-success",
    warning: "bg-warning/15 text-warning-foreground",
    gold: "bg-gold/15 text-gold-foreground",
    destructive: "bg-destructive/10 text-destructive",
  };
  return (
    <div className="group relative rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-elegant)]">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="mt-2 text-3xl font-bold text-foreground">{value}</p>
          {delta && <p className="mt-1 text-xs text-muted-foreground">{delta}</p>}
        </div>
        <div className={cn("flex size-11 items-center justify-center rounded-xl", accents[accent])}>
          <Icon className="size-5" />
        </div>
      </div>
    </div>
  );
}
