import { useState, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Clock, AlertTriangle, CheckCircle } from "lucide-react";
import { StatusBadge } from "./status-badge";
import { getFullDisplayId, type Document } from "@/lib/dashboard-utils";
import { CIT_VAULT } from "@/lib/crypto";

function decryptIfEncrypted(val?: string): string {
  if (!val) return "";
  const str = String(val).trim();
  if (str.startsWith("{") && str.includes('"iv"') && str.includes('"data"')) {
    try {
      return CIT_VAULT.decrypt(str) || val;
    } catch (e) {
      return val;
    }
  }
  return val;
}

const AGING_ACTIVE_STATUSES = [
  "Submitted",
  "Under Initial Review",
  "Action Required: Resubmission",
  "Under Evaluation",
  "Revision Requested",
  "Pending Final Approval",
  "Sent Back for Reevaluation",
  "Received",
  "Processing",
  "For Approval",
  "Pending",
  "On Hold",
  "Signed",
];

interface AgingDocumentsProps {
  documents: Document[];
  currentUser: any;
}

export function AgingDocuments({ documents, currentUser }: AgingDocumentsProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const agingItems = useMemo(() => {
    if (!documents || !currentUser) return [];

    let pool = documents.filter((d) => {
      const isTerminal = d.status === "Released" || d.status === "Approved and Released" || d.status === "Returned to Requester" || d.status === "Rejected";
      return !isTerminal && AGING_ACTIVE_STATUSES.includes(d.status);
    });

    const role = currentUser.role;
    if (role === "user") {
      pool = pool.filter((d) => d.ownerId === currentUser._id || d.ownerName === currentUser.name || d.by === currentUser.name);
    } else if (role === "staff") {
      pool = pool.filter((d) => d.current_role === "staff");
    } else if (role === "faculty") {
      pool = pool.filter((d) => d.current_role === "faculty");
    }

    return pool
      .map((d) => {
        const current = d.status;
        let enteredAt = null;

        if (d.history && d.history.length) {
          for (let i = d.history.length - 1; i >= 0; i--) {
            const h = d.history[i];
            if (h.status === current && h.date) {
              try {
                const temp = new Date(h.date);
                if (!isNaN(temp.getTime())) {
                  enteredAt = temp;
                  break;
                }
              } catch (e) {}
            }
          }
        }

        if (!enteredAt) {
          const fb = d.createdAt || d.updatedAt;
          if (fb) {
            try {
              enteredAt = new Date(fb);
            } catch (e) {}
          }
        }

        if (!enteredAt || isNaN(enteredAt.getTime())) {
          enteredAt = new Date();
        }

        const diffMs = Date.now() - enteredAt.getTime();
        const days = Math.floor(diffMs / 86400000);
        const hours = Math.floor(diffMs / 3600000);
        return {
          doc: d,
          days,
          hours,
          since: enteredAt,
        };
      })
      .sort((a, b) => b.days - a.days || b.hours - a.hours);
  }, [documents, currentUser]);

  if (agingItems.length === 0) {
    return (
      <div className="rounded-2xl border bg-card p-4 shadow-[var(--shadow-soft)]">
        <div className="mb-3">
          <h2 className="text-sm font-semibold">Aging Documents</h2>
          <p className="text-[11px] text-muted-foreground">Queue turnaround tracking</p>
        </div>
        <div className="flex flex-col items-center justify-center py-6 text-center border border-dashed rounded-xl bg-muted/10">
          <CheckCircle className="size-6 text-emerald-500/80 mb-1.5" />
          <p className="text-[11px] font-semibold text-muted-foreground">Queue is completely clear</p>
          <p className="text-[10px] text-muted-foreground/70 mt-0.5 max-w-[200px]">No documents are currently waiting in active stages.</p>
        </div>
      </div>
    );
  }

  const showToggle = agingItems.length > 3;

  const renderItem = (item: typeof agingItems[0]) => {
    const { doc, days, hours, since } = item;
    
    let tierLabel = "Normal";
    let colorClass = "text-emerald-500 border-emerald-500/20 bg-emerald-500/5";
    let labelColor = "text-emerald-500";
    let leftBorder = "border-l-2 border-l-emerald-500";

    if (days >= 6) {
      tierLabel = "Urgent";
      colorClass = "text-rose-500 border-rose-500/20 bg-rose-500/5";
      labelColor = "text-rose-500";
      leftBorder = "border-l-2 border-l-rose-500";
    } else if (days >= 3) {
      tierLabel = "Warning";
      colorClass = "text-amber-500 border-amber-500/20 bg-amber-500/5";
      labelColor = "text-amber-500";
      leftBorder = "border-l-2 border-l-amber-500";
    }

    const ageStr = days > 0 ? `${days}d` : `${hours || 1}h`;

    const sinceStr = since.toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
    });

    return (
      <div
        key={doc.internalId}
        className={`flex items-center justify-between rounded-r-lg border-y border-r bg-background/30 p-2 pr-3 transition-all hover:bg-background/60 ${leftBorder}`}
      >
        <div className="min-w-0 flex-1 pr-3">
          <span className="text-sm font-medium text-foreground/90 truncate block leading-tight">{decryptIfEncrypted(doc.name)}</span>
          <span className="font-mono text-xs text-muted-foreground block mt-0.5">{getFullDisplayId(doc)}</span>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <StatusBadge status={doc.status} className="text-[9px] px-1.5 py-0 h-4 leading-none" />
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
              since {sinceStr}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-bold border ${colorClass}`}>
            {ageStr}
          </span>
          <span className={`text-[9px] font-bold uppercase tracking-wider ${labelColor}`}>
            {tierLabel}
          </span>
          <Link
            to="/documents/$docId"
            params={{ docId: doc.internalId }}
            className="text-xs text-accent hover:underline font-medium shrink-0 ml-1.5"
          >
            View
          </Link>
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-2xl border bg-card p-4 shadow-[var(--shadow-soft)]">
      <div className="mb-3">
        <h2 className="text-sm font-semibold">Aging Documents</h2>
        <p className="text-[11px] text-muted-foreground">Queue turnaround tracking</p>
      </div>

      <div className="space-y-1.5">
        {/* Render the first 3 items */}
        {agingItems.slice(0, 3).map(renderItem)}

        {/* Render the remaining items inside a smooth expand/collapse container */}
        {showToggle && (
          <div className={`grid transition-all duration-300 ease-in-out ${isExpanded ? "grid-rows-[1fr] opacity-100 mt-1.5" : "grid-rows-[0fr] opacity-0"}`}>
            <div className="overflow-hidden space-y-1.5">
              {agingItems.slice(3).map(renderItem)}
            </div>
          </div>
        )}
      </div>

      {showToggle && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-3 w-full py-1.5 text-center text-xs font-semibold text-accent hover:text-accent/80 transition-colors flex items-center justify-center gap-1"
        >
          {isExpanded ? (
            <>
              Show less <span className="text-[9px]">▲</span>
            </>
          ) : (
            <>
              Show {agingItems.length - 3} more <span className="text-[9px]">▼</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}
