import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import jsQR from "jsqr";
import { ScanLine, UploadCloud, CheckCircle2, XCircle, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getFullDisplayId, type Document } from "@/lib/dashboard-utils";
import { StatusBadge } from "@/components/status-badge";
import api from "@/lib/api";

export const Route = createFileRoute("/qr-scanner")({
  head: () => ({
    meta: [
      { title: "QR Scanner · CIT Tracker" },
      { name: "description", content: "Upload a QR image to decode and look up a document." },
    ],
  }),
  component: ScannerPage,
});

function ScannerPage() {
  const [result, setResult] = useState<{ ok: boolean; raw?: string; doc?: Document } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  const handleFile = async (file: File) => {
    setPreview(URL.createObjectURL(file));
    setIsScanning(true);
    setResult(null);

    const img = new Image();
    img.onload = async () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(data.data, data.width, data.height);
      
      if (!code) {
        setResult({ ok: false });
        setIsScanning(false);
        return;
      }
      
      const raw = code.data;
      const match = raw.match(/[?&]track=([^&]+)/);
      const id = match?.[1] ?? raw;
      
      try {
        const res = await api.get(`/documents/track/${id}`);
        setResult({ ok: true, raw, doc: res.data });
      } catch (err) {
        console.error("Failed to find document", err);
        setResult({ ok: false, raw });
      } finally {
        setIsScanning(false);
      }
    };
    img.src = URL.createObjectURL(file);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">QR Scanner</h1>
        <p className="text-sm text-muted-foreground">Upload a QR image · we'll decode and match it to a document.</p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <label className="relative block">
          <div className="flex h-72 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-card p-6 text-center shadow-[var(--shadow-soft)] transition hover:border-accent/60 hover:bg-accent/5">
            {preview ? (
              <img src={preview} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
            ) : (
              <>
                <div className="flex size-14 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                  <UploadCloud className="size-7" />
                </div>
                <p className="mt-3 text-sm font-medium">Drop or click to upload a QR image</p>
                <p className="text-xs text-muted-foreground">PNG or JPG · decoded locally in your browser</p>
              </>
            )}
          </div>
          <input
            type="file" accept="image/*"
            className="absolute inset-0 cursor-pointer opacity-0"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
        </label>

        <div className="rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)]">
          <div className="mb-3 flex items-center gap-2">
            <ScanLine className="size-5 text-accent" />
            <h3 className="text-sm font-semibold">Decoded result</h3>
          </div>
          {isScanning && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Scanning...</div>}
          {!result && !isScanning && <p className="text-sm text-muted-foreground">No scan yet.</p>}

          {result?.ok && result.doc && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-xl bg-success/10 px-3 py-2 text-sm text-success">
                <CheckCircle2 className="size-4" /> Document matched
              </div>
              <div className="rounded-xl border p-4">
                <p className="font-mono text-xs text-muted-foreground">{getFullDisplayId(result.doc)}</p>
                <p className="mt-1 font-semibold">{result.doc.name}</p>
                <div className="mt-2 flex items-center justify-between">
                  <StatusBadge status={result.doc.status} />
                  <Button asChild size="sm" className="rounded-xl">
                    <Link to="/documents/$docId" params={{ docId: result.doc.internalId }}>
                      Open <ExternalLink className="size-3.5" />
                    </Link>
                  </Button>
                </div>
              </div>
              <p className="break-all rounded-xl bg-muted p-3 font-mono text-[11px]">{result.raw}</p>
            </div>
          )}

          {result && !result.ok && !isScanning && (
            <div className="flex items-center gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <XCircle className="size-4" /> Couldn't decode or no matching document.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
