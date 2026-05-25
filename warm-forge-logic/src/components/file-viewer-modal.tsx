import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, FileText, Loader2, Maximize2 } from "lucide-react";
import api from "@/lib/api";
import { decryptFileResponse } from "@/lib/crypto";

interface FileViewerModalProps {
  document: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FileViewerModal({ document, open, onOpenChange }: FileViewerModalProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [mime, setMime] = useState<string>("application/pdf");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !document?.internalId) {
      return;
    }
    
    let objectUrl: string | null = null;
    let isMounted = true;
    setLoading(true);
    setError(null);
    setUrl(null);

    async function loadFile() {
      try {
        const endpoint = document.hasProcessedFile
          ? `/documents/download/${document.internalId}`
          : document.hasSignedFile
            ? `/documents/${document.internalId}/signed-file`
            : `/documents/${document.internalId}/original-file`;
        const res = await api.get(endpoint);
        const data = res.data;
        if (!isMounted) return;

        if (data && data.fileData) {
          const decrypted = decryptFileResponse(data);
          if (!decrypted) {
            setError("Decryption failed. Vault key may be missing or incorrect.");
            return;
          }
          const fileData = decrypted.dataURI;
          if (fileData.startsWith('data:')) {
            try {
              const arr = fileData.split(',');
              const mimeMatch = arr[0].match(/:(.*?);/);
              const extractedMime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
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
      } catch (err) {
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
  }, [document?.internalId, open]);

  const handleDownload = () => {
    if (!url) return;
    const a = window.document.createElement("a");
    a.href = url;
    let label = "Original";
    if (document.hasProcessedFile) {
      label = "Processed";
    } else if (document.hasSignedFile) {
      label = "Signed";
    }
    a.download = document.name ? `${document.name}_${label}` : `Document_${label}`;
    if (mime === "application/pdf") a.download += ".pdf";
    else if (mime === "image/png") a.download += ".png";
    else if (mime === "image/jpeg") a.download += ".jpg";
    window.document.body.appendChild(a);
    a.click();
    window.document.body.removeChild(a);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] h-[85vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl">
        <DialogHeader className="px-6 py-4 border-b bg-muted/30">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-5 text-[var(--color-gold)]" />
            {document?.name || "Document Preview"} - {
              document?.hasProcessedFile 
                ? "Processed Document" 
                : document?.hasSignedFile 
                  ? "Signed Document" 
                  : "Original Document"
            }
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto bg-muted/10 p-4 relative">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
            </div>
          ) : error || !url ? (
            <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed bg-muted/30 p-6 text-center text-muted-foreground">
              <FileText className="size-10 opacity-30 mb-3" />
              <p className="text-base font-semibold">{error || "Preview unavailable"}</p>
              <p className="text-sm mt-1 max-w-md">This document may be in an unsupported format ({mime}) or was corrupted during legacy submission.</p>
            </div>
          ) : mime.startsWith("image/") ? (
            <div className="flex h-full items-center justify-center">
              <img src={url} alt="Document Preview" className="max-h-full max-w-full rounded-lg object-contain shadow-sm border" />
            </div>
          ) : mime === "application/pdf" ? (
            <iframe src={url} className="w-full h-full rounded-lg border bg-white" title="Document Preview" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed bg-muted/30 p-6 text-center text-muted-foreground">
              <FileText className="size-10 opacity-30 mb-3" />
              <p className="text-base font-semibold">Preview unavailable</p>
              <p className="text-sm mt-1 max-w-md">This document format ({mime}) cannot be previewed natively.</p>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t bg-card sm:justify-between items-center flex-row">
          <p className="text-xs text-muted-foreground hidden sm:block">
            {document?.hasProcessedFile 
              ? "Processed Document" 
              : document?.hasSignedFile 
                ? "Signed Document" 
                : document?.hasOriginalFile 
                  ? "Original Document" 
                  : "No file attached"}
          </p>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button className="flex-1 sm:flex-none" onClick={handleDownload} disabled={!url}>
              <Download className="size-4 mr-2" /> Download File
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
