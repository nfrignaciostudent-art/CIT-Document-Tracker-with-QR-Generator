import { createFileRoute, Link } from "@tanstack/react-router";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type ScanLog, type Document, findByInternalId } from "@/lib/dashboard-utils";
import { formatDistanceToNow, format } from "date-fns";
import { useEffect, useState } from "react";
import { Loader2, Monitor, Smartphone, Tablet } from "lucide-react";
import api from "@/lib/api";
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

export const Route = createFileRoute("/scan-logs")({
  head: () => ({
    meta: [
      { title: "Scan Logs · CIT Tracker" },
      { name: "description", content: "Automatic QR scan logs across all tracked documents." },
    ],
  }),
  component: ScanLogsPage,
});

function DeviceIcon({ device }: { device?: string }) {
  if (!device) return <Monitor className="size-3.5" />;
  const d = device.toLowerCase();
  if (d === "mobile") return <Smartphone className="size-3.5" />;
  if (d === "tablet") return <Tablet className="size-3.5" />;
  return <Monitor className="size-3.5" />;
}

function ScanLogsPage() {
  const [scanLogs, setScanLogs] = useState<ScanLog[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [scansRes, docsRes] = await Promise.all([
          api.get("/documents/scan-logs").catch(() => ({ data: [] })),
          api.get("/documents"),
        ]);
        setScanLogs(scansRes.data || []);
        setDocuments(docsRes.data || []);
      } catch (err) {
        console.error("Failed to load scan logs", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Scan Logs</h1>
        <p className="text-sm text-muted-foreground">
          Immutable, automatically captured on every QR scan.{" "}
          <span className="text-xs text-muted-foreground/60">IP addresses are never stored.</span>
        </p>
      </div>
      <div className="overflow-hidden rounded-2xl border bg-card shadow-[var(--shadow-soft)]">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="px-4">Display ID</TableHead>
              <TableHead>Document</TableHead>
              <TableHead className="hidden md:table-cell">Viewer</TableHead>
              <TableHead className="hidden md:table-cell">Device &amp; Browser</TableHead>
              <TableHead className="px-4 text-right">When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {scanLogs.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  No scan logs found.
                </TableCell>
              </TableRow>
            )}
            {scanLogs.map((s) => {
              // Backend returns `documentId` as the doc's internalId
              const docId = s.documentId || s.internalId || "";
              const doc = findByInternalId(documents, docId);
              const whenDate = s.timestamp || s.createdAt || s.at;
              return (
                <TableRow key={(s as any)._id || s.id || Math.random()}>
                  <TableCell className="px-4 font-mono text-xs">
                    {docId ? (
                      <Link
                        to="/documents/$docId"
                        params={{ docId }}
                        className="rounded-md bg-muted px-2 py-1 hover:text-accent"
                      >
                        {s.displayId || docId}
                      </Link>
                    ) : (
                      <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-sm">
                    {decryptIfEncrypted(doc?.name ?? (s as any).docName ?? "N/A")}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-xs font-medium">
                    {s.isAnonymous ? (
                      <span className="text-muted-foreground">Anonymous Scan</span>
                    ) : (
                      <span className="text-primary">
                        {decryptIfEncrypted(s.viewerName)}
                        {s.viewerRole ? ` (${decryptIfEncrypted(s.viewerRole)})` : ""}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <DeviceIcon device={s.device} />
                      <span>
                        {s.browser || "Unknown"} · {s.os || "Unknown"} · {s.device || "Unknown"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="px-4 text-right">
                    <div className="text-sm">
                      {whenDate
                        ? formatDistanceToNow(new Date(whenDate), { addSuffix: true })
                        : ""}
                    </div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
                      {whenDate ? format(new Date(whenDate), "yyyy-MM-dd HH:mm:ss") : ""}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
