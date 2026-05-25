import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { UploadCloud, FileLock2, ShieldCheck, Loader2, Copy, Download, Printer, CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { QRCodeCanvas } from "qrcode.react";
import { StatusBadge } from "@/components/status-badge";
import api from "@/lib/api";
import { CIT_VAULT, encryptFile } from "@/lib/crypto";
import { useCurrentUser } from "@/hooks/use-current-user";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Register Document · CIT Tracker" },
      { name: "description", content: "Register a new document. Files are encrypted client-side before upload." },
    ],
  }),
  component: RegisterPage,
});

const readFileAsDataURL = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

function RegisterPage() {
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [registeredDoc, setRegisteredDoc] = useState<any | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    ownerName: "",
    department: "IT Department Office",
    note: "",
  });

  const downloadQR = () => {
    const canvas = document.querySelector<HTMLCanvasElement>("#receipt-qr-canvas canvas");
    if (!canvas || !registeredDoc) return;
    const link = document.createElement("a");
    link.download = `${registeredDoc.fullDisplayId || registeredDoc.displayId}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const copyURL = () => {
    if (!registeredDoc) return;
    const trackUrl = `${window.location.origin}/track?track=${registeredDoc.internalId}&source=qr`;
    navigator.clipboard.writeText(trackUrl);
    toast.success("Tracking URL copied");
  };

  const resetForm = () => {
    setRegisteredDoc(null);
    setFile(null);
    setFormData({
      name: "",
      ownerName: "",
      department: "IT Department Office",
      note: "",
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      toast.error("Please attach a file.");
      return;
    }
    if (!formData.name || !formData.ownerName) {
      toast.error("Please fill in all required fields.");
      return;
    }
    if (!CIT_VAULT.hasKey()) {
      toast.error("Cryptographic vault is not active. Please log in again.");
      return;
    }

    setIsLoading(true);
    try {
      const payload = new FormData();
      
      const fileExtension = file.name.substring(file.name.lastIndexOf('.'));
      
      // Encrypt file client-side
      const dataUri = await readFileAsDataURL(file);
      const encryptedFileJson = encryptFile(dataUri, fileExtension);
      const fileBlob = new Blob([encryptedFileJson], { type: "application/octet-stream" });

      // Encrypt metadata fields
      const encName = CIT_VAULT.encrypt(formData.name);
      const encPurpose = CIT_VAULT.encrypt(formData.note || "General Document");
      const encOwnerName = CIT_VAULT.encrypt(formData.ownerName);

      payload.append("data", JSON.stringify({
        name: encName,
        ownerName: encOwnerName,
        ownerId: user?.userId || user?._id || "USR-UNKNOWN",
        department: formData.department,
        note: formData.note, // internal logs/audit note can remain
        type: "Other",
        by: encOwnerName,
        purpose: encPurpose,
        enc: "idea", // standard zero-knowledge indicator
        encPurpose: encPurpose,
        fileExt: fileExtension
      }));
      payload.append("file", fileBlob, file.name);

      const res = await api.post("/documents/create", payload, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      toast.success("Document registered successfully");
      
      // Decrypt document data locally for the receipt screen
      const doc = res.data;
      setRegisteredDoc({
        ...doc,
        name: CIT_VAULT.decrypt(doc.name),
        by: CIT_VAULT.decrypt(doc.by),
      });
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error(error.response?.data?.message || "Failed to register document");
    } finally {
      setIsLoading(false);
    }
  };

  if (registeredDoc) {
    const trackUrl = `${window.location.origin}/track?track=${registeredDoc.internalId}&source=qr`;
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
          <div className="flex flex-col items-center justify-center text-center p-8 border-b bg-[#0B2545] text-white relative overflow-hidden">
            <div className="flex size-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-3 shadow-sm relative z-10">
              <CheckCircle2 className="size-6" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white relative z-10">Document Registered Successfully</h1>
            <p className="text-xs text-slate-300 mt-1 max-w-md relative z-10">Your document has been securely registered on the CIT registry. Please save the tracking receipt details below.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 divide-y md:divide-y-0 md:divide-x">
            {/* Details panel */}
            <div className="p-6 md:col-span-3 space-y-5">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Official Receipt</h3>
                <div className="grid grid-cols-1 gap-y-3.5 gap-x-6 sm:grid-cols-2 text-xs">
                  <div className="space-y-0.5">
                    <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Document Name</span>
                    <span className="font-semibold text-foreground">{registeredDoc.name}</span>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Display ID</span>
                    <span className="font-mono font-bold text-foreground">{registeredDoc.fullDisplayId || registeredDoc.displayId}</span>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Owner / Student</span>
                    <span className="font-medium text-foreground">{registeredDoc.by || formData.ownerName}</span>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-muted-foreground block text-[10px] uppercase font-semibold">IT Unit Destination</span>
                    <span className="font-medium text-foreground">{registeredDoc.department || formData.department}</span>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Verification Code</span>
                    <span className="font-mono font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 border border-slate-200 dark:border-slate-700 rounded-md inline-block mt-0.5">{registeredDoc.verifyCode || "XXXX"}</span>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Current Status</span>
                    <div className="mt-0.5">
                      <StatusBadge status={registeredDoc.status || "Submitted"} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border bg-muted/40 p-3 text-xs space-y-1">
                <span className="font-semibold uppercase tracking-wider text-muted-foreground block text-[10px]">Secure Tracking Link</span>
                <span className="break-all font-mono text-muted-foreground/80">{trackUrl}</span>
              </div>

              <div className="flex flex-wrap gap-2 pt-4 border-t">
                <Button onClick={downloadQR} size="sm" className="rounded-lg"><Download className="size-4 mr-2" /> Download QR</Button>
                <Button onClick={copyURL} size="sm" variant="outline" className="rounded-lg"><Copy className="size-4 mr-2" /> Copy URL</Button>
                <Button onClick={resetForm} size="sm" variant="outline" className="rounded-lg">Register Another</Button>
                <Button asChild size="sm" variant="secondary" className="rounded-lg">
                  <Link to="/dashboard">Dashboard</Link>
                </Button>
              </div>
            </div>

            {/* QR display panel */}
            <div id="receipt-qr-canvas" className="p-6 md:col-span-2 flex flex-col items-center justify-center bg-muted/10">
              <div className="rounded-xl border bg-white p-4 shadow-sm">
                <QRCodeCanvas value={trackUrl} size={160} fgColor="#0F172A" includeMargin={false} />
              </div>
              <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/80">
                CIT · DocTracker
              </p>
              <p className="mt-1 font-mono text-sm font-bold text-foreground">{registeredDoc.fullDisplayId || registeredDoc.displayId}</p>
              <p className="mt-0.5 max-w-[200px] text-center text-[11px] text-muted-foreground truncate w-full">{registeredDoc.name}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Register a document</h1>
        <p className="text-sm text-muted-foreground">A QR code and display ID will be generated on submission.</p>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2 rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)]">
          <div>
            <Label htmlFor="doc-name">Document name</Label>
            <Input 
              id="doc-name"
              placeholder="e.g. Transcript of Records Request" 
              className="mt-1.5 rounded-xl"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              required
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="doc-owner">Owner</Label>
              <Input 
                id="doc-owner"
                placeholder="Student / staff full name" 
                className="mt-1.5 rounded-xl"
                value={formData.ownerName}
                onChange={(e) => setFormData(prev => ({ ...prev, ownerName: e.target.value }))}
                required
              />
            </div>
            <div>
              <Label>IT Unit</Label>
              <Select 
                value={formData.department} 
                onValueChange={(val) => setFormData(prev => ({ ...prev, department: val }))}
              >
                <SelectTrigger className="mt-1.5 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["IT Department Office","Dean of IT","IT Faculty Room","IT Student Services","IT OJT Coordinator","IT Laboratory"].map((d) =>
                    <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="doc-notes">Notes</Label>
            <Textarea 
              id="doc-notes"
              placeholder="Any additional context…" 
              className="mt-1.5 rounded-xl"
              value={formData.note}
              onChange={(e) => setFormData(prev => ({ ...prev, note: e.target.value }))}
            />
          </div>

          <div className="block">
            <span className="mb-1.5 block text-sm font-medium">Attach file</span>
            <label className="relative flex items-center justify-center rounded-2xl border-2 border-dashed border-border bg-muted/30 p-8 text-center transition hover:border-accent/60 hover:bg-accent/5 cursor-pointer">
              <div>
                <UploadCloud className="mx-auto size-8 text-muted-foreground" />
                <p className="mt-2 text-sm font-medium">
                  {file ? file.name : "Drop or click to upload"}
                </p>
                <p className="text-xs text-muted-foreground">PDF, DOCX, JPG · up to 25 MB</p>
              </div>
              <input 
                type="file" 
                className="absolute inset-0 cursor-pointer opacity-0" 
                onChange={(e) => setFile(e.target.files?.[0] ?? null)} 
              />
            </label>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => navigate({ to: "/dashboard" })}>Cancel</Button>
            <Button type="submit" className="rounded-xl" disabled={isLoading}>
              {isLoading ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              Register document
            </Button>
          </div>
        </div>

        <aside className="space-y-3 rounded-2xl border bg-[image:var(--gradient-primary)] p-5 text-primary-foreground shadow-[var(--shadow-elegant)]">
          <ShieldCheck className="size-6 text-[var(--color-gold)]" />
          <h3 className="text-base font-semibold">Client-side encryption</h3>
          <p className="text-xs text-primary-foreground/80">
            Document names and files are encrypted in your browser before reaching the server.
            The server never holds raw file data.
          </p>
          <div className="rounded-xl bg-white/10 p-3 text-xs">
            <div className="flex items-center gap-2 font-medium"><FileLock2 className="size-4 text-[var(--color-gold)]" /> Dual-ID system</div>
            <p className="mt-1 text-primary-foreground/70">
              A stable internal ULID powers the QR, while a human-friendly DOC-YYYYMMDD-XXXX shows on receipts.
            </p>
          </div>
        </aside>
      </form>
    </div>
  );
}
