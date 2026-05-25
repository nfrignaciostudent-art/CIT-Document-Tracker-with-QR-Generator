import { cn } from "@/lib/utils";
import type { DocStatus } from "@/lib/dashboard-utils";

type BadgeStyle = {
  bg: string;
  text: string;
  border: string;
};

const statusStyles: Record<string, BadgeStyle> = {
  // Neutral Slate
  Received: { bg: "bg-slate-100 dark:bg-slate-800/80", text: "text-slate-700 dark:text-slate-300", border: "border border-slate-200/50 dark:border-slate-700/50" },
  Submitted: { bg: "bg-slate-100 dark:bg-slate-800/80", text: "text-slate-700 dark:text-slate-300", border: "border border-slate-200/50 dark:border-slate-700/50" },
  Pending: { bg: "bg-slate-100 dark:bg-slate-800/80", text: "text-slate-700 dark:text-slate-300", border: "border border-slate-200/50 dark:border-slate-700/50" },
  
  // Blue Info
  Processing: { bg: "bg-blue-50 dark:bg-blue-950/40", text: "text-blue-700 dark:text-blue-300", border: "border border-blue-200/40 dark:border-blue-900/45" },
  "Under Initial Review": { bg: "bg-blue-50 dark:bg-blue-950/40", text: "text-blue-700 dark:text-blue-300", border: "border border-blue-200/40 dark:border-blue-900/45" },
  "Under Evaluation": { bg: "bg-blue-50 dark:bg-blue-950/40", text: "text-blue-700 dark:text-blue-300", border: "border border-blue-200/40 dark:border-blue-900/45" },
  
  // Orange Amber Warning
  "For Approval": { bg: "bg-amber-50 dark:bg-amber-950/40", text: "text-amber-700 dark:text-amber-300", border: "border border-amber-200/40 dark:border-amber-900/45" },
  "Revision Requested": { bg: "bg-amber-50 dark:bg-amber-950/40", text: "text-amber-700 dark:text-amber-300", border: "border border-amber-200/40 dark:border-amber-900/45" },
  "Sent Back for Reevaluation": { bg: "bg-amber-50 dark:bg-amber-950/40", text: "text-amber-700 dark:text-amber-300", border: "border border-amber-200/40 dark:border-amber-900/45" },
  "On Hold": { bg: "bg-amber-50 dark:bg-amber-950/40", text: "text-amber-700 dark:text-amber-300", border: "border border-amber-200/40 dark:border-amber-900/45" },
  "Pending Final Approval": { bg: "bg-amber-50 dark:bg-amber-950/40", text: "text-amber-700 dark:text-amber-300", border: "border border-amber-200/40 dark:border-amber-900/45" },
  
  // Red Destructive
  Rejected: { bg: "bg-rose-50 dark:bg-rose-950/40", text: "text-rose-700 dark:text-rose-300", border: "border border-rose-200/40 dark:border-rose-900/45" },
  "Action Required: Resubmission": { bg: "bg-rose-50 dark:bg-rose-950/40", text: "text-rose-700 dark:text-rose-300", border: "border border-rose-200/40 dark:border-rose-900/45" },
  "Returned to Requester": { bg: "bg-rose-50 dark:bg-rose-950/40", text: "text-rose-700 dark:text-rose-300", border: "border border-rose-200/40 dark:border-rose-900/45" },
  
  // Green Success
  Approved: { bg: "bg-emerald-50 dark:bg-emerald-950/40", text: "text-emerald-700 dark:text-emerald-300", border: "border border-emerald-200/40 dark:border-emerald-900/45" },
  Released: { bg: "bg-emerald-50 dark:bg-emerald-950/40", text: "text-emerald-700 dark:text-emerald-300", border: "border border-emerald-200/40 dark:border-emerald-900/45" },
  "Approved and Released": { bg: "bg-emerald-50 dark:bg-emerald-950/40", text: "text-emerald-700 dark:text-emerald-300", border: "border border-emerald-200/40 dark:border-emerald-900/45" },
};

export function StatusBadge({
  status,
  className,
}: {
  status: DocStatus;
  className?: string;
}) {
  const style = statusStyles[status] || statusStyles.Submitted;
  
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors",
        style.bg,
        style.text,
        style.border,
        className
      )}
    >
      {String(status || "Submitted")}
    </span>
  );
}
