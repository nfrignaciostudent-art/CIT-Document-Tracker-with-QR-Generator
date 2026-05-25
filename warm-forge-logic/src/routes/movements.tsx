import { createFileRoute, Link } from "@tanstack/react-router";
import { type Movement, type Document, findByInternalId, findDocument } from "@/lib/dashboard-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDistanceToNow, format } from "date-fns";
import { ArrowRight, Loader2, Activity } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useCurrentUser } from "@/hooks/use-current-user";
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

const ACTION_COLORS: Record<string, string> = {
  Submitted:    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  Received:     "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  Processing:   "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  Forwarded:    "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  Approved:     "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  Released:     "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  Rejected:     "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  Resubmission: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
};

export const Route = createFileRoute("/movements")({
  head: () => ({
    meta: [
      { title: "Movements · CIT Tracker" },
      { name: "description", content: "Automatic status transitions and physical routing across offices." },
    ],
  }),
  component: MovementsPage,
});

function MovementsPage() {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user } = useCurrentUser();
  const currentUserRole = user?.role || "";

  const [formRawId, setFormRawId] = useState("");
  const [formFrom, setFormFrom] = useState("");
  const [formTo, setFormTo] = useState("");
  const [formNote, setFormNote] = useState("");

  async function loadData() {
    try {
      const [movesRes, docsRes] = await Promise.all([
        api.get("/documents/movement-logs").catch(() => ({ data: [] })),
        api.get("/documents"),
      ]);
      setMovements(movesRes.data || []);
      setDocuments(docsRes.data || []);
    } catch (err) {
      console.error("Failed to load movements", err);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const handleLogMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formRawId || !formTo) {
      toast.error("Document ID and Destination (To) are required.");
      return;
    }

    const doc = findDocument(documents, formRawId);
    if (!doc) {
      toast.error("Document not found with that ID.");
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post(`/documents/${doc.internalId}/movement`, {
        from: formFrom,
        to: formTo,
        note: formNote,
      });
      toast.success("Movement logged successfully.");
      setFormRawId("");
      setFormFrom("");
      setFormTo("");
      setFormNote("");
      loadData();
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || "Failed to log movement.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isAdmin = currentUserRole === "admin";

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Movement Logs</h1>
        <p className="text-sm text-muted-foreground">
          Automatic status transitions and physical routing across offices.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Manual log form — admin only */}
        {isAdmin && (
          <form
            className="space-y-3 rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)] h-fit"
            onSubmit={handleLogMovement}
          >
            <h3 className="text-sm font-semibold">Log a physical movement</h3>
            <div>
              <Label>Display ID or Internal ID</Label>
              <Input
                value={formRawId}
                onChange={(e) => setFormRawId(e.target.value)}
                placeholder="DOC-20260418-0001"
                className="mt-1.5 rounded-xl font-mono text-xs"
              />
            </div>
            <div>
              <Label>From</Label>
              <Input
                value={formFrom}
                onChange={(e) => setFormFrom(e.target.value)}
                placeholder="IT Department Office"
                className="mt-1.5 rounded-xl"
              />
            </div>
            <div>
              <Label>To</Label>
              <Input
                value={formTo}
                onChange={(e) => setFormTo(e.target.value)}
                placeholder="VPAA Office"
                className="mt-1.5 rounded-xl"
              />
            </div>
            <div>
              <Label>Note</Label>
              <Textarea
                value={formNote}
                onChange={(e) => setFormNote(e.target.value)}
                placeholder="Forwarded for signature…"
                className="mt-1.5 rounded-xl"
              />
            </div>
            <Button type="submit" disabled={isSubmitting} className="w-full rounded-xl">
              {isSubmitting ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              Log movement
            </Button>
          </form>
        )}

        <ol className={`space-y-3 ${isAdmin ? "lg:col-span-2" : "lg:col-span-3"}`}>
          {movements.length === 0 && (
            <div className="text-center p-8 text-muted-foreground border rounded-2xl">
              No movements found.
            </div>
          )}
          {movements.map((m) => {
            // Support both new schema (documentId) and legacy (internalId)
            const docId = m.documentId || m.internalId || "";
            const doc = findByInternalId(documents, docId);
            const whenDate = m.timestamp || m.at || m.createdAt;
            
            const actionTakenDec = decryptIfEncrypted(m.actionTaken);
            const fromDec = decryptIfEncrypted(m.from);
            const toDec = decryptIfEncrypted(m.to);
            const actorNameDec = decryptIfEncrypted(m.actorName);
            const actorRoleDec = decryptIfEncrypted(m.actorRole);
            const actorDeptDec = decryptIfEncrypted(m.actorDepartment);
            const byDec = decryptIfEncrypted(m.by);
            const docNameDec = decryptIfEncrypted(m.documentName || doc?.name);
            const prevStatusDec = decryptIfEncrypted(m.previousStatus);
            const newStatusDec = decryptIfEncrypted(m.newStatus);
            const noteDec = decryptIfEncrypted(m.note);

            const actionLabel = actionTakenDec || (fromDec && toDec ? `${fromDec} → ${toDec}` : "Movement");
            const actorLabel = actorNameDec
              ? `${actorNameDec}${actorRoleDec ? ` (${actorRoleDec}${actorDeptDec ? ` · ${actorDeptDec}` : ""})` : ""}`
              : byDec || "";
            const colorClass =
              ACTION_COLORS[m.actionTaken || ""] || "bg-muted text-muted-foreground";

            return (
              <li
                key={(m as any)._id || m.id || Math.random()}
                className="rounded-2xl border bg-card p-4 shadow-[var(--shadow-soft)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        to="/documents/$docId"
                        params={{ docId }}
                        className="font-mono text-xs text-accent hover:underline"
                      >
                        {m.displayId || docId}
                      </Link>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${colorClass}`}
                      >
                        <Activity className="size-2.5 mr-1" />
                        {actionLabel}
                      </span>
                    </div>

                    <p className="mt-1 truncate text-sm font-semibold">
                      {docNameDec || "N/A"}
                    </p>

                    {/* Status transition (new automatic logs) */}
                    {m.previousStatus !== undefined && m.newStatus && (
                      <div className="mt-2 flex items-center gap-2 text-xs">
                        <span className="rounded-md bg-muted px-2 py-0.5 text-muted-foreground">
                          {prevStatusDec || "—"}
                        </span>
                        <ArrowRight className="size-3 text-muted-foreground shrink-0" />
                        <span className="rounded-md bg-primary/10 px-2 py-0.5 text-primary font-medium">
                          {newStatusDec}
                        </span>
                      </div>
                    )}

                    {/* Legacy from/to routing (manual admin logs) */}
                    {!m.previousStatus && m.from && m.to && (
                      <div className="mt-2 flex items-center gap-2 text-sm">
                        <span className="rounded-md bg-muted px-2 py-0.5">{fromDec}</span>
                        <ArrowRight className="size-3.5 text-muted-foreground" />
                        <span className="rounded-md bg-[var(--color-gold)]/15 px-2 py-0.5">
                          {toDec}
                        </span>
                      </div>
                    )}

                    {actorLabel && (
                      <p className="mt-1.5 text-xs text-muted-foreground">By {actorLabel}</p>
                    )}
                    {noteDec && (
                      <p className="mt-1 text-xs text-muted-foreground/70 italic">"{noteDec}"</p>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground/70 whitespace-nowrap">
                      {whenDate ? formatDistanceToNow(new Date(whenDate), { addSuffix: true }) : ""}
                    </div>
                    <div className="text-[10px] text-muted-foreground/50 mt-0.5">
                      {whenDate ? format(new Date(whenDate), "yyyy-MM-dd HH:mm") : ""}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
