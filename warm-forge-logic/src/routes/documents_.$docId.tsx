import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { 
  ArrowLeft, 
  Download, 
  FileText, 
  History, 
  Lock, 
  Printer, 
  Send, 
  UploadCloud, 
  RotateCcw, 
  Loader2, 
  CheckCircle2, 
  ExternalLink,
  ShieldCheck,
  AlertTriangle
} from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, formatDistanceToNow } from "date-fns";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CIT_VAULT, decryptFile, decryptFileResponse, encryptFile } from "@/lib/crypto";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import api from "@/lib/api";
import { getFullDisplayId, type Document, type ScanLog, type Movement } from "@/lib/dashboard-utils";
import { useCurrentUser } from "@/hooks/use-current-user";

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

export const Route = createFileRoute("/documents_/$docId")({
  loader: async ({ params }) => {
    try {
      const docRes = await api.get(`/documents/${params.docId}/details`);
      const doc = docRes.data;
      if (!doc) throw notFound();
      
      let scans: ScanLog[] = [];
      let moves: Movement[] = [];
      
      try {
        const scansRes = await api.get(`/documents/scan-logs?documentId=${params.docId}`);
        scans = scansRes.data || [];
      } catch (e) {
        console.warn("Failed to load scan logs", e);
      }
      
      try {
        const movesRes = await api.get(`/documents/movement-logs?documentId=${params.docId}`);
        moves = movesRes.data || [];
      } catch (e) {
        console.warn("Failed to load movement logs", e);
      }
      
      return { doc, scans, moves };
    } catch (error) {
      console.error("Failed to load document details", error);
      throw notFound();
    }
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? `${loaderData.doc.name} · CIT Tracker` : "Document · CIT Tracker" },
      { name: "description", content: "Detailed document tracking, QR code, files and movement history." },
    ],
  }),
  notFoundComponent: () => (
    <div className="mx-auto max-w-2xl rounded-2xl border bg-card p-8 text-center">
      <h2 className="text-lg font-semibold">Document not found</h2>
      <p className="mt-2 text-sm text-muted-foreground">It may have been removed or the ID is incorrect.</p>
      <Button asChild className="mt-4"><Link to="/documents">Back to documents</Link></Button>
    </div>
  ),
  errorComponent: ({ reset }) => (
    <div className="mx-auto max-w-2xl rounded-2xl border bg-card p-8 text-center">
      <h2 className="text-lg font-semibold">Couldn't load this document</h2>
      <Button onClick={reset} className="mt-4">Try again</Button>
    </div>
  ),
  component: DocumentDetail,
});

function DocumentDetail() {
  const { doc: rawDoc, scans, moves } = Route.useLoaderData();
  const navigate = useNavigate();

  const doc = useMemo(() => {
    if (!rawDoc) return rawDoc;
    const decryptedName = rawDoc.name || "Not provided";
    const decryptedOwner = rawDoc.ownerName || rawDoc.by || "Not provided";

    return {
      ...rawDoc,
      name: decryptedName,
      ownerName: decryptedOwner,
      owner: decryptedOwner,
    };
  }, [rawDoc]);
  
  const { user: currentUser } = useCurrentUser();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Resubmission flow states
  const [resubmitFile, setResubmitFile] = useState<File | null>(null);
  const [resubmitNote, setResubmitNote] = useState("");
  
  // Manual movement form state
  const [moveForm, setMoveForm] = useState({
    from: doc.department || "",
    to: "",
    note: "",
  });
  
  // Workflow actions dialog state
  const [wfAction, setWfAction] = useState<any>(null);
  const [wfNote, setWfNote] = useState("");
  const [wfFile, setWfFile] = useState<File | null>(null);

  const role = currentUser?.role || "user";
  const trackUrl = typeof window !== "undefined" 
    ? `${window.location.origin}/track?track=${doc.internalId}&source=qr` 
    : `/track?track=${doc.internalId}&source=qr`;

  // Timeline mapper combining scan events and administrative routing hops
  const timeline = [
    ...scans.map((s) => ({
      kind: "scan" as const,
      at: s.at || s.createdAt || s.timestamp,
      label: "QR scanned",
      sub: `${s.browser || s.userAgent || "Browser"} · ${s.device || "Desktop"} · ${s.ip || "Unknown IP"}`,
    })),
    ...moves.map((m) => {
      const fromOffice = decryptIfEncrypted(m.from || m.actorDepartment || "Origin");
      const toOffice = decryptIfEncrypted(m.to || m.actorDepartment || "Destination");
      const actorName = decryptIfEncrypted(m.actorName || m.by || "Actor");
      const actorRole = decryptIfEncrypted(m.actorRole || "");
      const actionName = decryptIfEncrypted(m.actionTaken || `${fromOffice} → ${toOffice}`);
      const statusText = m.previousStatus && m.newStatus 
        ? `${decryptIfEncrypted(m.previousStatus)} → ${decryptIfEncrypted(m.newStatus)}` 
        : "";
      const note = decryptIfEncrypted(m.note);
      
      return {
        kind: "move" as const,
        at: m.at || m.timestamp || m.createdAt || new Date().toISOString(),
        label: actionName,
        sub: `${note || "No remarks"} · By ${actorName} (${actorRole || "Staff"}) ${statusText ? `[${statusText}]` : ""}`,
      };
    }),
  ].sort((a, b) => +new Date(b.at) - +new Date(a.at));

  // Find the last remark left by staff requesting a resubmission
  const lastResubmitNote = moves
    .filter(m => m.newStatus === "Action Required: Resubmission" || m.actionTaken?.includes("resubmission") || m.actionTaken?.includes("Resubmission"))
    .sort((a, b) => +new Date(b.createdAt || b.timestamp || 0) - +new Date(a.createdAt || a.timestamp || 0))[0]?.note || doc.note || "No correction notes provided by clerk.";

  const handleWorkflowSubmit = async () => {
    if (!wfAction) return;
    if (wfAction.noteRequired && !wfNote.trim()) {
      toast.error("A reason or note is required for this action.");
      return;
    }

    const isReleaseFileRequired = wfAction.action === "release";
    const isApproveFileRequired = wfAction.action === "approve" && (role === "faculty" || role === "dean");
    const fileRequired = isReleaseFileRequired || isApproveFileRequired;

    if (fileRequired && !wfFile) {
      toast.error("Please upload the required file to confirm this action.");
      return;
    }

    setIsSubmitting(true);
    try {
      let response;
      if (fileRequired && wfFile) {
        const dataURL = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(wfFile);
        });

        const ext = wfFile.name.substring(wfFile.name.lastIndexOf(".")).toLowerCase();
        const encryptedStr = encryptFile(dataURL, ext);
        const encryptedBlob = new Blob([encryptedStr], { type: "application/json" });

        const payload = new FormData();
        const updateData = {
          documentId: doc.internalId,
          action: wfAction.action,
          note: wfNote,
          processedFileExt: isReleaseFileRequired ? ext : undefined,
          signedFileExt: isApproveFileRequired ? ext : undefined,
        };

        const fieldName = isReleaseFileRequired ? "processedFile" : "signedFile";
        payload.append(fieldName, encryptedBlob, wfFile.name);
        payload.append("data", JSON.stringify(updateData));

        response = await api.post("/documents/update-status", payload, {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        });
      } else {
        response = await api.post("/documents/update-status", {
          documentId: doc.internalId,
          action: wfAction.action,
          note: wfNote,
        });
      }

      toast.success(`Successfully processed action: ${wfAction.label}`);
      setWfAction(null);
      setWfNote("");
      setWfFile(null);
      setTimeout(() => window.location.reload(), 800);
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || "Action failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!moveForm.to) {
      toast.error("Please specify a destination (To).");
      return;
    }
    setIsSubmitting(true);
    try {
      await api.post(`/documents/${doc.internalId}/movement`, moveForm);
      toast.success("Manual movement logged successfully.");
      setTimeout(() => window.location.reload(), 800);
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || "Failed to log movement.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResubmitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resubmitFile) {
      toast.error("Please select a corrected file to upload.");
      return;
    }
    if (!CIT_VAULT.hasKey()) {
      toast.error("Cryptographic vault is not active. Please log in again.");
      return;
    }
    setIsSubmitting(true);
    try {
      const payload = new FormData();
      const fileExtension = resubmitFile.name.substring(resubmitFile.name.lastIndexOf('.'));
      
      // Read and encrypt file client-side
      const readFileAsDataURL = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      };
      
      const dataUri = await readFileAsDataURL(resubmitFile);
      const encryptedFileJson = encryptFile(dataUri, fileExtension);
      const fileBlob = new Blob([encryptedFileJson], { type: "application/octet-stream" });

      payload.append("data", JSON.stringify({
        documentId: doc.internalId,
        note: resubmitNote || "Resubmitted with corrected file",
        fileExt: fileExtension
      }));
      payload.append("file", fileBlob, resubmitFile.name);

      await api.post("/documents/resubmit", payload, {
        headers: { "Content-Type": "multipart/form-data" }
      });

      toast.success("Document corrected and resubmitted successfully!");
      setResubmitFile(null);
      setResubmitNote("");
      setTimeout(() => window.location.reload(), 800);
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || "Resubmission failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const downloadQR = () => {
    const canvas = document.querySelector<HTMLCanvasElement>("#qr-canvas-holder canvas");
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `${getFullDisplayId(doc)}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    toast.success("QR Code downloaded");
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadFinalDocument = async () => {
    setIsSubmitting(true);
    try {
      const res = await api.get(`/documents/download/${doc.internalId}`);
      const data = res.data;
      if (data && data.fileData) {
        const decrypted = decryptFile(data.fileData);
        if (decrypted) {
          let url = decrypted.dataURI;
          if (!url.startsWith("data:")) {
            url = "data:application/pdf;base64," + url;
          }
          const a = document.createElement("a");
          a.href = url;
          const plainName = data.name || "document";
          a.download = plainName + (decrypted.ext || data.fileExt || "");
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          toast.success("Download started");
        } else {
          toast.error("Decryption failed. File may be corrupted.");
        }
      } else {
        toast.error("No file data returned from server.");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || "Failed to download document.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Screen only layout wrapper */}
      <div className="space-y-6 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/documents"><ArrowLeft className="size-4" /> Documents</Link>
          </Button>
          <p className="font-mono text-xs text-muted-foreground">internalId: {doc.internalId}</p>
        </div>

        <header className="overflow-hidden rounded-3xl border bg-card shadow-[var(--shadow-soft)]">
          <div className="bg-[image:var(--gradient-primary)] px-6 py-5 text-primary-foreground">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-gold)]">{doc.department || "No Department"}</p>
            <h1 className="mt-1 text-2xl font-bold md:text-3xl">{doc.name}</h1>
          </div>
          <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-4">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Display ID</p>
              <p className="mt-1 font-mono text-sm font-semibold">{getFullDisplayId(doc)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Owner</p>
              <p className="mt-1 text-sm font-semibold">{doc.ownerName || doc.owner || "Unknown"}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Status</p>
              <div className="mt-1"><StatusBadge status={doc.status} /></div>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Updated</p>
              <p className="mt-1 text-sm font-semibold">
                {doc.updatedAt ? formatDistanceToNow(new Date(doc.updatedAt), { addSuffix: true }) : "N/A"}
              </p>
            </div>
          </div>
        </header>

        {/* Resubmission Required Notice for Students */}
        {role === "user" && doc.status === "Action Required: Resubmission" && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50/40 p-5 shadow-sm flex items-start gap-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600">
              <AlertTriangle className="size-5" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-sm font-bold text-rose-900">Correction &amp; Resubmission Required</h3>
              <p className="text-xs text-rose-700 font-medium">Remarks from CIT Staff:</p>
              <div className="rounded-xl border border-rose-100 bg-white/70 p-3 font-mono text-xs text-rose-800 break-words">
                "{lastResubmitNote}"
              </div>
              <p className="text-[11px] text-rose-600/90 pt-1">Please use the "Files" or "Resubmission" tab to re-upload your corrected document.</p>
            </div>
          </div>
        )}

        <Tabs defaultValue="overview">
          <TabsList className="rounded-xl">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="qr">QR</TabsTrigger>
            <TabsTrigger value="files">Files</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            {role !== "user" && (
              <TabsTrigger value="movement">Movement</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="overview" className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)] lg:col-span-2 space-y-4">
              <div>
                <h3 className="text-sm font-semibold">Lifecycle</h3>
                <ol className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
                  {["Submitted", "Received", "Processing", "Approved", "Released"].map((s, i) => {
                    const activeIndex = ["Submitted", "Received", "Processing", "Approved", "Released", "Approved and Released"].indexOf(doc.status);
                    const currentIdx = ["Submitted", "Received", "Processing", "Approved", "Released"].indexOf(s);
                    const isCompleted = currentIdx <= activeIndex;
                    
                    return (
                      <li key={s} className={`rounded-xl border p-3 text-center transition ${isCompleted ? "bg-primary/5 border-primary/20 text-primary" : "bg-background/60 text-muted-foreground"}`}>
                        <p className="text-[9px] font-bold uppercase tracking-wider">Step {i+1}</p>
                        <p className="mt-1 text-xs font-semibold">{s}</p>
                      </li>
                    );
                  })}
                </ol>
              </div>
              
              <div className="pt-2">
                <p className="text-xs text-muted-foreground">
                  Created {doc.createdAt ? format(new Date(doc.createdAt), "PPpp") : "N/A"}
                </p>
              </div>
            </div>

            {/* Quick Actions Panel - Gate for Admin Roles */}
            {role !== "user" ? (
              <div className="rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)]">
                <h3 className="text-sm font-semibold">Quick actions</h3>
                <div className="mt-3 flex flex-col gap-2">
                  <Button variant="outline" className="justify-start rounded-xl" onClick={() => toast.success("Email status notification queued")}>
                    <Send className="size-4" /> Email status to owner
                  </Button>
                  <Button variant="outline" className="justify-start rounded-xl" onClick={handlePrint}>
                    <Printer className="size-4" /> Print routing slip
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)] flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Requester Actions</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    {(doc.hasProcessedFile || doc.hasSignedFile) 
                      ? "Your document has been processed/signed. Download the official document below."
                      : "Print your official document routing slip for physical campus routing."}
                  </p>
                </div>
                <div className="mt-4 space-y-2">
                  {(doc.hasProcessedFile || doc.hasSignedFile || doc.hasOriginalFile) && (
                    <Button 
                      onClick={handleDownloadFinalDocument} 
                      className="w-full rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold"
                    >
                      <Download className="size-4 mr-2" /> Download {
                        doc.hasProcessedFile 
                          ? "Processed Document" 
                          : doc.hasSignedFile 
                            ? "Signed Document" 
                            : "Original Document"
                      }
                    </Button>
                  )}
                  <Button onClick={handlePrint} variant="outline" className="w-full rounded-xl border-[#0B2545] text-[#0B2545] hover:bg-muted">
                    <Printer className="size-4 mr-2" /> Print Routing Slip
                  </Button>
                </div>
              </div>
            )}

            {/* Workflow Actions Gating for Admins */}
            {role !== "user" && doc.allowedActions && doc.allowedActions.length > 0 && (
              <div className="rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)] lg:col-span-3">
                <h3 className="text-sm font-semibold">Workflow Actions</h3>
                <p className="mb-4 text-xs text-muted-foreground">Advance the document to the next stage in the college routing pipeline.</p>
                <div className="flex flex-wrap gap-3">
                  {doc.allowedActions.map((action: any) => (
                    <Button 
                      key={action.action} 
                      onClick={() => {
                        setWfAction(action);
                        setWfNote("");
                        setWfFile(null);
                      }} 
                      variant={action.action.includes("reject") || action.action.includes("return") || action.action.includes("resubmission") ? "destructive" : "default"} 
                      className="rounded-xl"
                    >
                      {action.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Document Inline PDF/Image Preview */}
            {(doc.hasProcessedFile || doc.hasSignedFile || doc.hasOriginalFile) && (
              <div className="rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)] lg:col-span-3">
                <h3 className="text-sm font-semibold mb-4">
                  Document File Preview (
                  {doc.hasProcessedFile 
                    ? "Processed Document" 
                    : doc.hasSignedFile 
                      ? "Signed Document" 
                      : "Original Document"}
                  )
                </h3>
                <InlineDocumentPreview 
                  downloadUrl={
                    doc.hasProcessedFile 
                      ? `/documents/download/${doc.internalId}` 
                      : doc.hasSignedFile 
                        ? `/documents/${doc.internalId}/signed-file` 
                        : `/documents/${doc.internalId}/original-file`
                  } 
                />
              </div>
            )}
          </TabsContent>

          <TabsContent value="qr" className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col items-center rounded-2xl border bg-card p-6 shadow-[var(--shadow-soft)]">
              <div id="qr-canvas-holder" className="rounded-2xl bg-white p-4 shadow-inner ring-1 ring-border">
                <QRCodeCanvas value={trackUrl} size={208} fgColor="#0B2545" includeMargin={false} />
              </div>
              <p className="mt-4 font-mono text-sm font-semibold">{getFullDisplayId(doc)}</p>
              <p className="text-xs text-muted-foreground">Scan QR code to inspect live status</p>
            </div>
            <div className="rounded-2xl border bg-card p-6 shadow-[var(--shadow-soft)]">
              <h3 className="text-sm font-semibold">Registry URL</h3>
              <p className="mt-2 break-all rounded-xl bg-muted p-3 font-mono text-xs">{trackUrl}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button className="rounded-xl" onClick={downloadQR}><Download className="size-4" /> Download QR Code</Button>
                <Button variant="outline" className="rounded-xl" onClick={handlePrint}><Printer className="size-4" /> Print routing slip</Button>
              </div>
              <div className="mt-5 rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
                QR encodes the stable internal ULID registry key. The short display ID rotates daily for human verification.
              </div>
            </div>
          </TabsContent>

          <TabsContent value="files" className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-4 md:col-span-2">
              {/* Correction upload card for students */}
              {role === "user" && doc.status === "Action Required: Resubmission" && (
                <form onSubmit={handleResubmitSubmit} className="rounded-2xl border border-amber-200 bg-amber-50/20 p-5 shadow-sm space-y-4">
                  <div className="flex items-center gap-2">
                    <RotateCcw className="size-5 text-amber-600" />
                    <h3 className="text-sm font-bold text-amber-900">Upload Corrected Document</h3>
                  </div>
                  
                  <div className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-amber-800">Attach Corrected PDF / File</span>
                    <label className="relative flex items-center justify-center rounded-xl border-2 border-dashed border-amber-300 bg-white p-6 text-center hover:bg-amber-50/50 transition cursor-pointer">
                      <div>
                        <UploadCloud className="mx-auto size-7 text-amber-500" />
                        <p className="mt-2 text-xs font-bold text-amber-900">
                          {resubmitFile ? resubmitFile.name : "Drop or click to upload correction"}
                        </p>
                        <p className="text-[10px] text-amber-700">PDF, DOCX, JPG · up to 25 MB</p>
                      </div>
                      <input 
                        type="file" 
                        className="absolute inset-0 cursor-pointer opacity-0" 
                        onChange={(e) => setResubmitFile(e.target.files?.[0] ?? null)} 
                        required
                      />
                    </label>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="resubmit-notes" className="text-xs text-amber-800 font-semibold">Resubmission Remarks</Label>
                    <Textarea 
                      id="resubmit-notes"
                      placeholder="Explain what has been updated or corrected..."
                      className="rounded-xl border-amber-200 focus-visible:ring-amber-400 text-xs bg-white"
                      value={resubmitNote}
                      onChange={(e) => setResubmitNote(e.target.value)}
                    />
                  </div>

                  <div className="flex justify-end pt-1">
                    <Button type="submit" disabled={isSubmitting || !resubmitFile} className="rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold">
                      {isSubmitting ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                      Submit Corrections
                    </Button>
                  </div>
                </form>
              )}
            </div>

            {doc.hasProcessedFile ? (
              <FileCard 
                title="Processed Document" 
                subtitle="Decrypted final file released to requester" 
                locked={false} 
                released={true} 
                downloadUrl={`/documents/download/${doc.internalId}`} 
              />
            ) : doc.hasSignedFile ? (
              <FileCard 
                title="Signed Document" 
                subtitle={`Signed by ${doc.signedBy || 'Faculty/Dean'} on ${doc.signedAt ? format(new Date(doc.signedAt), "PPpp") : "N/A"}`} 
                locked={false} 
                released={true} 
                downloadUrl={`/documents/${doc.internalId}/signed-file`} 
              />
            ) : (
              <FileCard 
                title="Original Document" 
                subtitle={doc.hasOriginalFile ? "Available for administrative evaluation" : "No original file attached"} 
                locked={!doc.hasOriginalFile} 
                released={doc.hasOriginalFile} 
                downloadUrl={`/documents/${doc.internalId}/original-file`} 
              />
            )}
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <div className="rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)]">
              {timeline.length === 0 && <p className="text-sm text-muted-foreground">No tracking activity recorded.</p>}
              <ol className="relative space-y-4 border-l border-border pl-5">
                {timeline.map((t, i) => (
                  <li key={i} className="relative">
                    <span className={`absolute -left-[26px] mt-1 size-2.5 rounded-full ring-4 ring-card ${t.kind === "scan" ? "bg-accent" : "bg-[var(--color-gold)]"}`} />
                    <p className="text-sm font-semibold">{t.label}</p>
                    <p className="text-xs text-muted-foreground">{t.sub}</p>
                    <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground/70">
                      {t.at ? format(new Date(t.at), "PPpp") : ""}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          </TabsContent>

          {/* Movement Tab - Restricted to Admins only */}
          {role !== "user" && (
            <TabsContent value="movement" className="mt-4">
              <form className="grid grid-cols-1 gap-4 rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)] md:grid-cols-2" onSubmit={handleLogMovement}>
                <div>
                  <Label htmlFor="from">From Office</Label>
                  <Input 
                    id="from" 
                    value={moveForm.from} 
                    onChange={(e) => setMoveForm(p => ({ ...p, from: e.target.value }))} 
                    className="mt-1.5 rounded-xl bg-muted/30" 
                  />
                </div>
                <div>
                  <Label htmlFor="to">To Destination Office</Label>
                  <Input 
                    id="to" 
                    placeholder="e.g. Registrar Room" 
                    value={moveForm.to} 
                    onChange={(e) => setMoveForm(p => ({ ...p, to: e.target.value }))} 
                    className="mt-1.5 rounded-xl" 
                    required 
                  />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="note">Movement Note / Remarks</Label>
                  <Textarea 
                    id="note" 
                    placeholder="Forwarded for evaluation..." 
                    value={moveForm.note} 
                    onChange={(e) => setMoveForm(p => ({ ...p, note: e.target.value }))} 
                    className="mt-1.5 rounded-xl" 
                  />
                </div>
                <div className="md:col-span-2 flex justify-end">
                  <Button type="submit" disabled={isSubmitting} className="rounded-xl">
                    {isSubmitting ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                    Log movement
                  </Button>
                </div>
              </form>
            </TabsContent>
          )}
        </Tabs>
      </div>

      {/* WORKFLOW ACTION DIALOG */}
      <Dialog open={!!wfAction} onOpenChange={(open) => {
        if (!open) {
          setWfAction(null);
          setWfFile(null);
        }
      }}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Confirm Action: {wfAction?.label}</DialogTitle>
            <DialogDescription>
              You are about to advance this document status to <strong>{wfAction?.to}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <Label htmlFor="wfNote">{wfAction?.noteRequired ? "Correction Remarks / Reason (Required)" : "Note / Remarks (Optional)"}</Label>
              <Textarea 
                id="wfNote" 
                value={wfNote} 
                onChange={(e) => setWfNote(e.target.value)} 
                placeholder={wfAction?.noteRequired ? "Explain why corrections are required..." : "Add any comments for this transition..."} 
                className="rounded-xl mt-2"
              />
            </div>

            {(wfAction?.action === "release" || (wfAction?.action === "approve" && (role === "faculty" || role === "dean"))) && (
              <div className="space-y-1.5 pb-4">
                <Label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  {wfAction?.action === "release" ? "Upload Processed File (Required)" : "Upload Signed Document (Required)"}
                </Label>
                <label className="relative flex items-center justify-center rounded-2xl border-2 border-dashed border-border bg-muted/30 p-6 text-center transition hover:border-accent/60 hover:bg-accent/5 cursor-pointer mt-2">
                  <div>
                    <UploadCloud className="mx-auto size-6 text-muted-foreground" />
                    <p className="mt-2 text-sm font-medium">
                      {wfFile ? wfFile.name : (wfAction?.action === "release" ? "Upload final processed/stamped PDF" : "Upload evaluation-signed PDF")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">PDF only - max 5 MB</p>
                  </div>
                  <input 
                    type="file" 
                    accept=".pdf"
                    className="absolute inset-0 cursor-pointer opacity-0" 
                    onChange={e => setWfFile(e.target.files?.[0] || null)}
                  />
                </label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setWfAction(null); setWfFile(null); }} disabled={isSubmitting}>Cancel</Button>
            <Button 
              onClick={handleWorkflowSubmit} 
              disabled={isSubmitting || ((wfAction?.action === "release" || (wfAction?.action === "approve" && (role === "faculty" || role === "dean"))) && !wfFile)}
            >
              {isSubmitting ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              Confirm Transition
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================================================================
          PRINT LAYOUT: MODERN SINGLE-PAGE OFFICIAL DOCUMENT ROUTING SLIP
          ================================================================== */}
      <div id="routing-slip-print" className="hidden print:block font-sans text-black p-6 bg-white max-w-[8.27in] mx-auto border-2 border-black rounded-xl relative">
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            @page {
              size: A4 portrait;
              margin: 15mm;
            }
            body {
              background: white !important;
              color: black !important;
              font-family: 'Outfit', 'Inter', sans-serif !important;
            }
            header, nav, aside, footer, [data-sidebar="sidebar"], .top-header, .no-print, button, .tabs-list, [role="tablist"] {
              display: none !important;
            }
            #routing-slip-print {
              display: block !important;
              width: 100% !important;
              max-width: 100% !important;
              border: none !important;
              padding: 0 !important;
              margin: 0 !important;
              box-shadow: none !important;
            }
          }
        `}} />

        {/* University Logo and Header */}
        <div className="flex items-center justify-between border-b-4 border-[#0B2545] pb-4">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-base font-black tracking-tight text-[#0B2545]">UNIVERSITY OF THE ASSUMPTION</h1>
              <p className="text-xs font-bold text-gray-700 uppercase tracking-wider">College of Information Technology</p>
              <p className="text-[10px] text-gray-500">Unisite Subdivision, Barangay Del Pilar, City of San Fernando, Pampanga, Philippines</p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[9px] font-black uppercase bg-[#0B2545] text-white px-2.5 py-1 rounded-md tracking-wider">Official Document</span>
          </div>
        </div>

        {/* Title Banner */}
        <div className="bg-gray-100 border-x border-b border-black py-2.5 text-center mt-3">
          <h2 className="text-lg font-black uppercase tracking-widest text-[#0B2545]">Document Routing Slip</h2>
          <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider">Official Registry Receipt</p>
        </div>

        {/* Metadata grid & QR layout */}
        <div className="grid grid-cols-5 border border-black mt-4 divide-x divide-black bg-white">
          <div className="col-span-3 p-4 space-y-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-[#0B2545] border-b border-gray-200 pb-1.5">Document Information</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3.5 text-xs">
              <div>
                <span className="block text-[8px] font-bold uppercase text-gray-500">Document Name</span>
                <span className="font-bold text-gray-900 break-words">{doc.name}</span>
              </div>
              <div>
                <span className="block text-[8px] font-bold uppercase text-gray-500">Display ID / Reference</span>
                <span className="font-mono font-black text-[#0B2545] text-[13px]">{getFullDisplayId(doc)}</span>
              </div>
              <div>
                <span className="block text-[8px] font-bold uppercase text-gray-500">Student / Requester</span>
                <span className="font-semibold text-gray-900">{doc.ownerName || doc.owner || "Unknown"}</span>
              </div>
              <div>
                <span className="block text-[8px] font-bold uppercase text-gray-500">Office Destination</span>
                <span className="font-semibold text-gray-900">{doc.department}</span>
              </div>
              <div>
                <span className="block text-[8px] font-bold uppercase text-gray-500">Date Registered</span>
                <span className="font-medium text-gray-800">{doc.createdAt ? format(new Date(doc.createdAt), "PPpp") : "N/A"}</span>
              </div>
              <div>
                <span className="block text-[8px] font-bold uppercase text-gray-500">Routing Status</span>
                <span className="font-bold text-[#0F172A]">{doc.status}</span>
              </div>
            </div>
          </div>
          
          <div className="col-span-2 p-4 flex flex-col items-center justify-center bg-gray-50/50">
            <div className="bg-white p-2.5 border border-black shadow-sm">
              <QRCodeCanvas value={trackUrl} size={110} fgColor="#0B2545" includeMargin={false} />
            </div>
            <p className="mt-2 text-[9px] font-bold uppercase tracking-widest text-[#0B2545]">Scan to Track Live</p>
            <p className="text-[7px] text-gray-500 mt-0.5 break-all max-w-[150px] text-center">{doc.internalId}</p>
          </div>
        </div>

        {/* Movements History Log */}
        <div className="mt-5">
          <h3 className="text-xs font-black uppercase tracking-wider text-[#0B2545] border-b-2 border-[#0B2545] pb-1">Routing Movements history</h3>
          <table className="w-full mt-2 border-collapse border border-black text-[10px] text-left">
            <thead>
              <tr className="bg-gray-100 uppercase font-black text-gray-800 border-b border-black">
                <th className="p-2 border-r border-black w-[22%]">Date &amp; Time</th>
                <th className="p-2 border-r border-black w-[35%]">Route Activity</th>
                <th className="p-2 border-r border-black w-[25%]">Handled By</th>
                <th className="p-2">Remarks / Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black">
              {moves.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-3 text-center text-gray-500 italic">No movement logs registered yet. Physical routing slip required for processing.</td>
                </tr>
              ) : (
                moves.map((m, idx) => {
                  const fromOfficeDec = decryptIfEncrypted(m.from || m.actorDepartment) || "Origin";
                  const toOfficeDec = decryptIfEncrypted(m.to || m.actorDepartment) || "Destination";
                  const actorNameDec = decryptIfEncrypted(m.actorName || m.by) || "Actor";
                  const actorRoleDec = decryptIfEncrypted(m.actorRole) || "";
                  const actionNameDec = decryptIfEncrypted(m.actionTaken) || `${fromOfficeDec} → ${toOfficeDec}`;
                  const noteDec = decryptIfEncrypted(m.note) || "N/A";
                  
                  return (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="p-2 border-r border-black font-mono">
                        {m.createdAt || m.timestamp ? format(new Date(m.createdAt || m.timestamp || ""), "MM/dd/yy hh:mm a") : "N/A"}
                      </td>
                      <td className="p-2 border-r border-black font-bold text-gray-900">{actionNameDec}</td>
                      <td className="p-2 border-r border-black">{actorNameDec} <span className="text-gray-500 text-[9px] font-semibold block">{actorRoleDec}</span></td>
                      <td className="p-2 text-gray-700 break-words">{noteDec}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Official Signatures Box */}
        <div className="mt-6">
          <h3 className="text-xs font-black uppercase tracking-wider text-[#0B2545] border-b-2 border-[#0B2545] pb-1">CIT Routing Sign-offs &amp; Approvals</h3>
          <div className="grid grid-cols-3 border border-black mt-2 divide-x divide-black text-[9px] bg-white">
            <div className="p-4 flex flex-col justify-between h-28">
              <div>
                <span className="font-bold text-gray-500 uppercase tracking-wider block">1. CIT Staff Verification</span>
                <span className="text-gray-400 block mt-1 text-[8px]">Received &amp; Verified original files</span>
              </div>
              <div className="text-center pt-2">
                <p className="border-t border-dashed border-black pt-1 font-semibold text-gray-800">Signature Over Printed Name</p>
                <p className="text-[7px] text-gray-500 mt-0.5">Date: ________________________</p>
              </div>
            </div>
            
            <div className="p-4 flex flex-col justify-between h-28">
              <div>
                <span className="font-bold text-gray-500 uppercase tracking-wider block">2. CIT Faculty Evaluator</span>
                <span className="text-gray-400 block mt-1 text-[8px]">Technical check &amp; recommendation</span>
              </div>
              <div className="text-center pt-2">
                <p className="border-t border-dashed border-black pt-1 font-semibold text-gray-800">Signature Over Printed Name</p>
                <p className="text-[7px] text-gray-500 mt-0.5">Date: ________________________</p>
              </div>
            </div>

            <div className="p-4 flex flex-col justify-between h-28">
              <div>
                <span className="font-bold text-gray-500 uppercase tracking-wider block">3. College Dean Release</span>
                <span className="text-gray-400 block mt-1 text-[8px]">Final approval and file release signature</span>
              </div>
              <div className="text-center pt-2">
                <p className="border-t border-dashed border-black pt-1 font-semibold text-gray-800">Signature Over Printed Name</p>
                <p className="text-[7px] text-gray-500 mt-0.5">Date: ________________________</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer info and QR watermark */}
        <div className="mt-8 pt-2.5 border-t border-gray-300 flex justify-between items-center text-[7px] text-gray-400">
          <p>CIT Document Tracking System &bull; Generated digitally at City of San Fernando, Pampanga, PH</p>
          <p className="font-mono">{doc.internalId}</p>
        </div>
      </div>
    </div>
  );
}

function FileCard({
  title,
  subtitle,
  locked,
  released,
  downloadUrl
}: {
  title: string;
  subtitle: string;
  locked?: boolean;
  released?: boolean;
  downloadUrl?: string;
}) {
  const fetchFileData = async () => {
    if (!downloadUrl) return null;
    try {
      const res = await api.get(downloadUrl);
      return res.data;
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || "Failed to fetch file");
      return null;
    }
  };

  const handleDownload = async () => {
    const data = await fetchFileData();
    if (data && data.fileData) {
      const decrypted = decryptFile(data.fileData);
      if (decrypted) {
        let url = decrypted.dataURI;
        if (!url.startsWith("data:")) {
          url = "data:application/pdf;base64," + url;
        }
        const a = document.createElement("a");
        a.href = url;
        const plainName = data.name || "document";
        a.download = plainName + (decrypted.ext || data.fileExt || data.processedFileExt || "");
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        toast.success("Download started");
      } else {
        toast.error("Decryption failed. File may be corrupted.");
      }
    }
  };

  const handlePreview = async () => {
    const data = await fetchFileData();
    if (data && data.fileData) {
      const decrypted = decryptFile(data.fileData);
      if (decrypted) {
        let url = decrypted.dataURI;
        if (!url.startsWith("data:")) {
          url = "data:application/pdf;base64," + url;
        }
        if (url.startsWith("data:")) {
          try {
            const arr = url.split(",");
            const mimeMatch = arr[0].match(/:(.*?);/);
            const mime = mimeMatch ? mimeMatch[1] : "application/octet-stream";
            const bstr = atob(arr[1]);
            let n = bstr.length;
            const u8arr = new Uint8Array(n);
            while (n--) {
              u8arr[n] = bstr.charCodeAt(n);
            }
            const blob = new Blob([u8arr], { type: mime });
            const blobUrl = URL.createObjectURL(blob);
            window.open(blobUrl, "_blank");
          } catch (e) {
            console.error("Preview error:", e);
            window.open(url, "_blank");
          }
        } else {
          window.open(url, "_blank");
        }
      } else {
        toast.error("Decryption failed. File may be corrupted.");
      }
    }
  };

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)]">
      <div className="flex items-start gap-3">
        <div className={`flex size-11 items-center justify-center rounded-xl ${released ? "bg-[var(--color-gold)]/15 text-[var(--color-gold)]" : "bg-muted text-muted-foreground"}`}>
          {locked && !released ? <Lock className="size-5" /> : <FileText className="size-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <Button disabled={!released} className="w-full rounded-xl" variant={released ? "default" : "outline"} onClick={handlePreview}>
          <ExternalLink className="size-4 mr-2" /> {released ? "Preview" : "Locked"}
        </Button>
        <Button disabled={!released} className="w-full rounded-xl" variant="secondary" onClick={handleDownload}>
          <Download className="size-4 mr-2" /> Download
        </Button>
      </div>
    </div>
  );
}

function InlineDocumentPreview({ downloadUrl }: { downloadUrl: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [mime, setMime] = useState("application/pdf");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let objectUrl: string | null = null;
    let isMounted = true;

    async function loadFile() {
      try {
        const res = await api.get(downloadUrl);
        const data = res.data;
        if (!isMounted) return;

        if (data && data.fileData) {
          const decrypted = decryptFile(data.fileData);
          if (!decrypted) {
            setError("Decryption failed. Vault key may be missing or incorrect.");
            return;
          }
          let fileData = decrypted.dataURI;
          if (!fileData.startsWith("data:")) {
            fileData = "data:application/pdf;base64," + fileData;
          }
          
          if (fileData.startsWith("data:")) {
            try {
              const arr = fileData.split(",");
              const mimeMatch = arr[0].match(/:(.*?);/);
              const extractedMime = mimeMatch ? mimeMatch[1] : "application/octet-stream";
              setMime(extractedMime);
              
              const bstr = atob(arr[1]);
              let n = bstr.length;
              const u8arr = new Uint8Array(n);
              while (n--) {
                u8arr[n] = bstr.charCodeAt(n);
              }
              const blob = new Blob([u8arr], { type: extractedMime });
              objectUrl = URL.createObjectURL(blob);
              setUrl(objectUrl);
            } catch (e) {
              console.error("Preview parse error:", e);
              setError("Corrupted file format. Cannot preview.");
            }
          }
        }
      } catch (err: any) {
        console.error(err);
        if (isMounted) setError("Failed to load document preview.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadFile();

    return () => {
      isMounted = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [downloadUrl]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border bg-muted/30">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !url) {
    return (
      <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed bg-muted/30 p-6 text-center text-muted-foreground">
        <FileText className="size-8 opacity-50 mb-2" />
        <p className="text-sm font-semibold">{error || "Preview unavailable"}</p>
        <p className="text-xs mt-1 text-center">This document may have been submitted in a format that cannot be previewed natively.</p>
      </div>
    );
  }

  if (mime.startsWith("image/")) {
    return (
      <div className="flex justify-center rounded-xl border bg-muted/10 p-2">
        <img src={url} alt="Document Preview" className="max-h-[600px] max-w-full rounded-lg object-contain shadow-sm" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-muted/10 p-2 h-[600px]">
      <iframe src={url} className="w-full h-full rounded-lg" title="Document Preview" />
    </div>
  );
}
