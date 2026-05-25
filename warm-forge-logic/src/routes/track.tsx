import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import {
  Download,
  FileText,
  Calendar,
  MapPin,
  QrCode,
  User,
  Building2,
  ArrowLeft,
  Clock,
  Activity,
  Lock,
  ShieldCheck,
  ShieldAlert,
  EyeOff,
  KeyRound,
  Crown,
  BadgeCheck,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { getFullDisplayId, type Document, type ScanLog, type Movement } from "@/lib/dashboard-utils";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { format, formatDistanceToNow } from "date-fns";
import { useState, useMemo, useEffect } from "react";
import { cn } from "@/lib/utils";
import { QRCodeCanvas } from "qrcode.react";
import api from "@/lib/api";
import { toast } from "sonner";
import { CIT_VAULT, decryptFile } from "@/lib/crypto";
import { useCurrentUser } from "@/hooks/use-current-user";

type Search = { track?: string };

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

export const Route = createFileRoute("/track")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    track: typeof s.track === "string" ? s.track : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Track Document · CIT Document Tracker" },
      {
        name: "description",
        content:
          "Public document tracking receipt. Scan a CIT QR or enter a Document ID to view live status, progress, and full activity history.",
      },
    ],
  }),
  component: TrackPage,
});

type Viewer = "guest" | "wrong" | "owner" | "admin";

function TrackPage() {
  const { track } = Route.useSearch();
  const [doc, setDoc] = useState<any>(null);
  const [scans, setScans] = useState<any[]>([]);
  const [moves, setMoves] = useState<any[]>([]);
  const { user: currentUser, loading: userLoading } = useCurrentUser();
  const [docLoading, setDocLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  // Fetch document immediately
  useEffect(() => {
    if (!track) { 
      setDocLoading(false); 
      return; 
    }

    let isMounted = true;
    const fetchDoc = async () => {
      setDocLoading(true);
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const source = urlParams.get("source");
        
        if (source) {
          urlParams.delete("source");
          const newSearch = urlParams.toString();
          const newPath = window.location.pathname + (newSearch ? `?${newSearch}` : "");
          window.history.replaceState({}, document.title, newPath);
        }

        const apiPath = source 
          ? `/documents/track/${track}?source=${source}` 
          : `/documents/track/${track}`;

        const docRes = await api.get(apiPath);
        if (isMounted) setDoc(docRes.data);
      } catch (err) {
        console.error("Track fetch error:", err);
      } finally {
        if (isMounted) setDocLoading(false);
      }
    };
    fetchDoc();
    return () => { isMounted = false; };
  }, [track]);

  // Fetch logs once doc is loaded and auth is resolved
  useEffect(() => {
    if (!doc || userLoading) return;

    let isMounted = true;
    const fetchLogs = async () => {
      if (currentUser) {
        try {
          const scansRes = await api.get(`/documents/scan-logs?documentId=${doc.internalId}`);
          if (isMounted) setScans(scansRes.data || []);
        } catch { /* ignore */ }
        try {
          const movesRes = await api.get(`/documents/movement-logs?documentId=${doc.internalId}`);
          if (isMounted) setMoves(movesRes.data || []);
        } catch { /* ignore */ }
      } else {
        if (doc.history && Array.isArray(doc.history)) {
          if (isMounted) setMoves(doc.history.map((h: any) => ({
            timestamp: h.date || h.at || new Date().toISOString(),
            actionTaken: h.action || "Status Update",
            newStatus: h.status || "",
            from: h.location || "",
            to: "",
            note: h.note || "",
            actorName: h.by || h.handler || "",
            actorRole: h.role || "",
          })));
        }
      }
    };
    fetchLogs();
    return () => { isMounted = false; };
  }, [doc, currentUser, userLoading]);

  // Prevent flash by keeping overall loading state true until both document and auth are resolved
  const loading = docLoading || (doc && userLoading);

  const viewer = useMemo<Viewer>(() => {
    if (!currentUser) return "guest";
    const role = currentUser.role || "user";
    if (role === "admin" || role === "staff" || role === "faculty" || role === "dean") {
      return "admin";
    }
    const isOwner = currentUser.userId === doc?.ownerId || currentUser._id === doc?.ownerId;
    if (isOwner) return "owner";
    return "wrong";
  }, [currentUser, doc]);

  const handleDownload = async () => {
    if (!doc) return;
    try {
      const res = await api.get(`/documents/download/${doc.internalId}`);
      const data = res.data;
      if (data && data.fileData) {
        const decrypted = decryptFile(data.fileData);
        if (decrypted) {
          const url = decrypted.dataURI;
          const a = document.createElement("a");
          a.href = url;
          const plainName = doc.name || "document";
          a.download = plainName + (decrypted.ext || data.fileExt || data.processedFileExt || "");
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          toast.success("Download started");
        } else {
          toast.error("Decryption failed. File may be corrupted.");
        }
      } else {
        toast.error("No file data found for this document");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || "Failed to download file");
    }
  };

  const showSensitive = viewer === "owner" || viewer === "admin";

  const decryptedName = useMemo(() => {
    if (!doc) return "";
    return doc.name || "Not provided";
  }, [doc]);

  const decryptedOwner = useMemo(() => {
    if (!doc) return "";
    return doc.ownerName || doc.by || "Not provided";
  }, [doc]);

  // Loading state — shown briefly on first paint
  if (loading) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <div className="rounded-2xl border bg-card p-8 text-center shadow-[var(--shadow-soft)]">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-muted">
            <QrCode className="size-6 animate-pulse text-muted-foreground" />
          </div>
          <h2 className="mt-4 text-lg font-bold">Loading document…</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Fetching receipt data, please wait.
          </p>
        </div>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <div className="rounded-2xl border bg-card p-8 text-center shadow-[var(--shadow-soft)]">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-muted">
            <QrCode className="size-6 text-muted-foreground" />
          </div>
          <h2 className="mt-4 text-lg font-bold">No document found</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Make sure the QR was scanned from a CIT receipt, or that the Document ID is correct.
          </p>
          <Button asChild className="mt-5 rounded-xl">
            <Link to="/">Back to portal</Link>
          </Button>
        </div>
      </div>
    );
  }

  const safeScans = Array.isArray(scans) ? scans : [];
  const safeMoves = Array.isArray(moves) ? moves : [];

  const timeline = [
    ...safeScans.map((s: any) => {
      const viewerName = decryptIfEncrypted(s.viewerName);
      const viewerRole = decryptIfEncrypted(s.viewerRole);
      return {
        at: s.timestamp || s.createdAt || s.at,
        label: s.isAnonymous ? "QR Code Scanned" : `QR Code Scanned by ${viewerName} (${viewerRole})`,
        sub: `${s.browser || "Unknown Browser"} on ${s.os || "Unknown OS"} (${s.device || "Unknown Device"})`
      };
    }),
    ...safeMoves.map((m: any) => {
      let label: string;
      const actionTaken = decryptIfEncrypted(m.actionTaken);
      const newStatus = decryptIfEncrypted(m.newStatus);
      const fromDept = decryptIfEncrypted(m.from);
      const toDept = decryptIfEncrypted(m.to);
      const actorName = decryptIfEncrypted(m.actorName);
      const actorRole = decryptIfEncrypted(m.actorRole);
      const note = decryptIfEncrypted(m.note);
      const byVal = decryptIfEncrypted(m.by);

      if (actionTaken && newStatus) {
        label = `${actionTaken}: ${newStatus}`;
      } else if (actionTaken) {
        label = actionTaken;
      } else if (fromDept || toDept) {
        label = `${fromDept || "?"}  → ${toDept || "?"}`;
      } else {
        label = "Status Update";
      }
      return {
        at: m.timestamp || m.createdAt || m.at,
        label,
        sub: actorName ? `By ${actorName}${actorRole ? ` (${actorRole})` : ""}${note ? ` · ${note}` : ""}` : (byVal || note || "")
      };
    }),
  ].sort((a, b) => +new Date(b.at) - +new Date(a.at));

  const rejected = doc.status === "Rejected";
  const qrPayload = `${typeof window !== "undefined" ? window.location.origin : ""}/track?track=${doc.internalId}&source=qr`;

  const downloadQR = () => {
    const canvas = document.querySelector<HTMLCanvasElement>("#qr-canvas-holder canvas");
    if (!canvas) {
      toast.error("Could not find QR Code canvas");
      return;
    }
    const link = document.createElement("a");
    const docDisplayId = doc ? (doc.displayId || doc.internalId) : "document";
    link.download = `QR-${docDisplayId}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    toast.success("QR Code downloaded as PNG");
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-8 md:py-10">
      <div className="flex items-center justify-between">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Search another document
        </Link>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-gold)]/40 bg-[var(--color-gold)]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--color-gold)]">
          <span className="size-1.5 animate-pulse rounded-full bg-[var(--color-gold)]" />
          Live receipt
        </span>
      </div>

      <article className="overflow-hidden rounded-3xl border bg-card shadow-[var(--shadow-elegant)]">
        <header className="relative overflow-hidden bg-[image:var(--gradient-hero)] px-6 py-6 text-primary-foreground md:px-8">
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-gold)]">
                CIT · Document Receipt
              </p>
              <h1 className="mt-1 text-lg font-bold md:text-xl">
                <SecretText
                  value={decryptedName}
                  cipher={doc.verifyCode || "XXXX"}
                  revealed={showSensitive}
                  tone="light"
                />
              </h1>
              <p className="mt-1.5 font-mono text-[11px] text-primary-foreground/75">
                {getFullDisplayId(doc)}
              </p>
            </div>
            <StatusBadge
              status={doc.status}
              className="shrink-0 bg-white/10 text-white ring-1 ring-white/25 backdrop-blur"
            />
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] ring-1 ring-white/20 backdrop-blur">
              <MapPin className="size-3" />
              Currently with: <span className="font-semibold">{String(doc.department || "N/A")}</span>
            </div>
            <AccessBadge viewer={viewer} />
          </div>
        </header>

        <div className="space-y-7 p-6 md:p-8">
          {/* Access banner */}
          <AccessBanner viewer={viewer} />

          {rejected && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              This document was <strong>rejected</strong>. Please contact the
              issuing office for details.
            </div>
          )}

          <div className="grid grid-cols-1 gap-7 lg:grid-cols-[1fr_280px]">
            <div className="space-y-6">
              <section>
                <SectionLabel icon={FileText}>Document Details</SectionLabel>
                <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                  <SecretField
                    icon={User}
                    label="Owner Name"
                    value={decryptedOwner}
                    cipher={doc.verifyCode || "XXXX"}
                    revealed={showSensitive}
                  />
                  <Field icon={Building2} label="Department" value={doc.department} />
                  <SecretField
                    icon={FileText}
                    label="Document Name"
                    value={decryptedName}
                    cipher={doc.verifyCode || "XXXX"}
                    revealed={showSensitive}
                  />
                  <Field
                    icon={Calendar}
                    label="Created"
                    value={(() => {
                      const dateVal = doc.createdAt || doc.date || doc.dateFiled;
                      if (!dateVal) return "N/A";
                      const parsed = new Date(dateVal);
                      return isNaN(parsed.getTime()) ? "N/A" : format(parsed, "PP");
                    })()}
                  />
                  <Field
                    icon={Clock}
                    label="Last update"
                    value={(() => {
                      const dateVal = doc.updatedAt || doc.date;
                      if (!dateVal) return "N/A";
                      const parsed = new Date(dateVal);
                      return isNaN(parsed.getTime()) ? "N/A" : formatDistanceToNow(parsed, { addSuffix: true });
                    })()}
                  />
                </dl>
              </section>

              <section>
                <SectionLabel icon={Activity}>Activity History</SectionLabel>
                <ol className="relative mt-3 space-y-3 border-l border-border pl-5">
                  {timeline.length === 0 && (
                    <p className="text-sm text-muted-foreground">No activity yet.</p>
                  )}
                  {timeline.slice(0, 3).map((t, i) => (
                    <li key={i} className="relative">
                      <span className="absolute -left-[26px] mt-1.5 size-2.5 rounded-full bg-accent ring-4 ring-card" />
                      <p className="text-sm font-medium">{String(t.label || "")}</p>
                      <p className="text-[11px] text-muted-foreground" suppressHydrationWarning>
                        {(() => {
                          const d = new Date(t.at);
                          return isNaN(d.getTime()) ? "Unknown date" : format(d, "yyyy-MM-dd HH:mm:ss");
                        })()}
                        {t.sub ? ` · ${t.sub}` : ""}
                      </p>
                    </li>
                  ))}

                  {timeline.length > 3 && (
                    <div className={cn(
                      "grid transition-all duration-300 ease-in-out",
                      expanded ? "grid-rows-[1fr] opacity-100 mt-3" : "grid-rows-[0fr] opacity-0 overflow-hidden"
                    )}>
                      <div className="overflow-hidden space-y-3">
                        {timeline.slice(3).map((t, i) => (
                          <li key={i + 3} className="relative">
                            <span className="absolute -left-[26px] mt-1.5 size-2.5 rounded-full bg-accent ring-4 ring-card" />
                            <p className="text-sm font-medium">{String(t.label || "")}</p>
                            <p className="text-[11px] text-muted-foreground" suppressHydrationWarning>
                              {(() => {
                                const d = new Date(t.at);
                                return isNaN(d.getTime()) ? "Unknown date" : format(d, "yyyy-MM-dd HH:mm:ss");
                              })()}
                              {t.sub ? ` · ${t.sub}` : ""}
                            </p>
                          </li>
                        ))}
                      </div>
                    </div>
                  )}
                </ol>

                {timeline.length > 3 && (
                  <button
                    type="button"
                    onClick={() => setExpanded(!expanded)}
                    className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
                  >
                    {expanded ? (
                      <>
                        Show Less
                        <ChevronUp className="size-3.5" />
                      </>
                    ) : (
                      <>
                        Show {timeline.length - 3} more
                        <ChevronDown className="size-3.5" />
                      </>
                    )}
                  </button>
                )}
              </section>
            </div>

            <aside className="space-y-5">
              <section>
                <SectionLabel icon={QrCode}>QR Code · Scan to Track</SectionLabel>
                <div className="mt-3 rounded-2xl border bg-gradient-to-b from-muted/30 to-background p-4 text-center">
                  <div
                    id="qr-canvas-holder"
                    className="mx-auto inline-block rounded-lg bg-white p-3 shadow-[var(--shadow-soft)] ring-1 ring-border"
                    aria-label="Document QR code"
                  >
                    <QRCodeCanvas
                      value={qrPayload}
                      size={160}
                      fgColor="#0B2545"
                      includeMargin={false}
                    />
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Point any phone camera at this code
                  </p>
                  <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground/70">
                    {qrPayload}
                  </p>
                  <div className="mt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full rounded-xl gap-1.5 text-xs shadow-sm"
                      onClick={downloadQR}
                    >
                      <Download className="size-3.5" />
                      Download QR Code
                    </Button>
                  </div>
                </div>
              </section>

              {showSensitive ? (
                (doc.hasProcessedFile || doc.hasSignedFile || doc.hasOriginalFile) ? (
                  <Button className="w-full rounded-xl bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-soft)] hover:opacity-95 font-bold" onClick={handleDownload}>
                    <Download className="size-4" />
                    Download {
                      doc.hasProcessedFile 
                        ? "Processed Document" 
                        : doc.hasSignedFile 
                          ? "Signed Document" 
                          : "Original Document"
                    }
                  </Button>
                ) : (
                  <div className="rounded-xl border border-dashed bg-muted/30 px-3 py-3 text-center text-[11px] text-muted-foreground">
                    No file attached to this document.
                  </div>
                )
              ) : null}
            </aside>
          </div>
        </div>

        <footer className="border-t bg-muted/30 px-6 py-3 text-center text-[10px] uppercase tracking-[0.18em] text-muted-foreground md:px-8">
          CIT Document Tracker · Official Receipt
        </footer>
      </article>
    </div>
  );
}

function SectionLabel({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
      <Icon className="size-3.5 text-accent" />
      {children}
    </div>
  );
}

function Field({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: any;
}) {
  const safeValue = typeof value === "string" ? value : (value ? String(value) : "");
  return (
    <div className="flex items-start gap-2.5">
      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted">
        <Icon className="size-3.5 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </dt>
        <dd className="truncate text-sm font-medium">{safeValue}</dd>
      </div>
    </div>
  );
}

function SecretText({
  value,
  cipher,
  revealed,
  tone = "dark",
}: {
  value: any;
  cipher: string;
  revealed: boolean;
  tone?: "dark" | "light";
}) {
  // SECURITY: when not revealed, the real value never reaches the DOM.
  // We render a deterministic token (SECURED_DOC_XXXX) — no blur, no aria value.
  const safeValue = typeof value === "string" ? value : (value ? String(value) : "");
  if (revealed) {
    return (
      <span className={tone === "light" ? "text-primary-foreground" : "text-foreground"}>
        {safeValue}
      </span>
    );
  }
  const token = `SECURED_DOC_${String(cipher || "XXXX").replace(/\s+/g, "").slice(0, 6).toUpperCase()}`;
  return (
    <span className="inline-flex items-center gap-2 align-middle">
      <span
        className={cn(
          "font-mono text-[0.85em] tracking-[0.06em]",
          tone === "light" ? "text-[var(--color-gold)]/90" : "text-primary/80",
        )}
        aria-label="Protected field"
      >
        {token}
      </span>
      <Lock
        className={cn(
          "size-3.5 shrink-0",
          tone === "light" ? "text-[var(--color-gold)]" : "text-primary/70",
        )}
      />
    </span>
  );
}

function SecretField({
  icon: Icon,
  label,
  value,
  cipher,
  revealed,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value?: any;
  cipher: string;
  revealed: boolean;
}) {
  // SECURITY: real value is only inserted into the DOM when revealed.
  // Unauthorized state renders a masked dot pattern + opaque secured token.
  const safeValueStr = typeof value === "string" ? value : (value ? String(value) : "");
  const mask = "•".repeat(Math.min(Math.max(safeValueStr.length, 6), 14));
  const token = `SECURED_${label.toUpperCase().replace(/\s+/g, "_")}_${String(cipher || "XXXX").replace(/\s+/g, "").slice(0, 4).toUpperCase()}`;
  return (
    <div className="flex items-start gap-2.5">
      <div
        className={cn(
          "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors",
          revealed
            ? "bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/25"
            : "bg-primary/10 text-primary ring-1 ring-primary/20",
        )}
      >
        {revealed ? <Icon className="size-3.5" /> : <Lock className="size-3.5" />}
      </div>
      <div className="min-w-0 flex-1">
        <dt className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
          <span
            className={cn(
              "rounded-full px-1.5 py-px text-[8px] font-bold tracking-wider ring-1 ring-inset",
              revealed
                ? "bg-emerald-500/10 text-emerald-700 ring-emerald-500/25 dark:text-emerald-300"
                : "bg-primary/10 text-primary ring-primary/20",
            )}
          >
            {revealed ? "VISIBLE" : "PROTECTED"}
          </span>
        </dt>
        {revealed ? (
          <dd className="mt-0.5 truncate text-sm font-medium text-foreground">
            {safeValueStr || <span className="italic text-muted-foreground opacity-60">Not provided</span>}
          </dd>
        ) : (
          <dd
            className="mt-1 flex min-w-0 items-center gap-2"
            aria-label="Protected field"
            title={token}
          >
            <span
              className="select-none font-mono text-[15px] leading-none tracking-[0.18em] text-foreground/45"
              aria-hidden
            >
              {mask}
            </span>
            <span className="hidden truncate rounded-md bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-muted-foreground ring-1 ring-inset ring-border md:inline-block">
              {token.slice(0, 22)}
            </span>
          </dd>
        )}
      </div>
    </div>
  );
}

function AccessBadge({ viewer }: { viewer: Viewer }) {
  const map: Record<Viewer, { label: string; icon: React.ComponentType<{ className?: string }>; cls: string }> = {
    guest: { label: "Restricted · Guest", icon: Lock, cls: "bg-white/10 text-white ring-white/25" },
    wrong: { label: "Restricted · Wrong account", icon: ShieldAlert, cls: "bg-destructive/20 text-white ring-destructive/40" },
    owner: { label: "Verified Owner", icon: ShieldCheck, cls: "bg-success/25 text-white ring-success/50" },
    admin: { label: "Admin Override", icon: Crown, cls: "bg-[var(--color-gold)]/25 text-[var(--color-gold)] ring-[var(--color-gold)]/50" },
  };
  const v = map[viewer];
  const Icon = v.icon;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 backdrop-blur", v.cls)}>
      <Icon className="size-3" />
      {v.label}
    </span>
  );
}

function AccessBanner({ viewer }: { viewer: Viewer }) {
  if (viewer === "guest") {
    const handleSignIn = () => {
      // Store the FULL current URL (including ?track=...) in sessionStorage.
      // Using sessionStorage avoids any URL-encoding / TanStack Router parsing
      // that would strip the nested query parameter during transit.
      if (typeof window !== "undefined") {
        sessionStorage.setItem("postLoginRedirect", window.location.href);
      }
      window.location.href = "/login";
    };
    return (
      <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-primary/5 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3 flex-1">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
              <Lock className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                Sensitive fields are encrypted
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Please log in to view the full document details.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSignIn}
            className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
          >
            Sign In to View Details
          </button>
        </div>
      </div>
    );
  }

  if (viewer === "wrong") {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive ring-1 ring-destructive/30">
            <ShieldAlert className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">
              Unauthorized access
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              You are not authorized to view this document. Please use the correct account.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
