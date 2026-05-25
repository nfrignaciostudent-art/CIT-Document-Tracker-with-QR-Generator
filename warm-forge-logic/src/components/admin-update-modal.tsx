import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getFullDisplayId, type Document } from "@/lib/dashboard-utils";
import { Loader2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";

import { encryptFile } from "@/lib/crypto";

interface AdminUpdateModalProps {
  document: Document | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const STATUS_OPTIONS = [
  "Pending", "Received", "Rejected", "Released"
];

export function AdminUpdateModal({ document, open, onOpenChange, onSuccess }: AdminUpdateModalProps) {
  const [status, setStatus] = useState("");
  const [location, setLocation] = useState("");
  const [handler, setHandler] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset form when modal opens
  useEffect(() => {
    if (open && document) {
      setStatus(document.status);
      setLocation("");
      setHandler("");
      setNote("");
      setFile(null);
    }
  }, [open, document]);

  const handleSubmit = async () => {
    if (!document) return;
    
    setIsSubmitting(true);
    try {
      const payload = new FormData();
      
      if (file) {
        const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
        
        // Read file as data URL and encrypt client-side
        const dataURL = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
        
        const encryptedStr = encryptFile(dataURL, ext);
        const encryptedBlob = new Blob([encryptedStr], { type: "application/json" });

        const updateData = {
          status: status,
          note: note,
          location: location,
          handler: handler,
          by: handler || "staff",
          processedFileExt: ext
        };
        
        payload.append("processedFile", encryptedBlob, file.name);
        payload.append("data", JSON.stringify(updateData));
      } else {
        payload.append("status", status);
        payload.append("note", note);
        payload.append("location", location);
        payload.append("handler", handler);
        payload.append("by", handler || "staff");
      }

      await api.patch(`/documents/${document.internalId}/status`, payload, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      toast.success("Document updated successfully");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error(error);
      toast.error(error.response?.data?.message || "Failed to update document");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] rounded-2xl p-0 overflow-hidden shadow-[var(--shadow-soft)]">
        <DialogHeader className="px-6 py-5 border-b bg-muted/30">
          <DialogTitle className="text-xl font-bold">Update Document Status</DialogTitle>
        </DialogHeader>

        <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-auto">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Document ID</Label>
              <Input disabled value={document ? getFullDisplayId(document) : ""} className="bg-muted/50 rounded-xl" />
            </div>
            
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Document Name</Label>
              <Input disabled value={document?.name || ""} className="bg-muted/50 rounded-xl" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">New Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="border-green-500 focus:ring-green-500 rounded-xl">
                <SelectValue placeholder="Select new status..." />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {STATUS_OPTIONS.map(s => (
                  <SelectItem key={s} value={s} className="rounded-lg">{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Current Location</Label>
            <Input 
              placeholder="e.g. Registrar's Office" 
              value={location} 
              onChange={e => setLocation(e.target.value)} 
              className="rounded-xl"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Currently Handled By</Label>
            <Input 
              placeholder="e.g. Employee A, John Santos..." 
              value={handler} 
              onChange={e => setHandler(e.target.value)} 
              className="rounded-xl"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Admin Note (optional)</Label>
            <Textarea 
              placeholder="Reason for status change..." 
              value={note} 
              onChange={e => setNote(e.target.value)} 
              className="resize-none h-20 rounded-xl"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Processed File</Label>
            <label className="relative flex items-center justify-center rounded-2xl border-2 border-dashed border-border bg-muted/30 p-6 text-center transition hover:border-accent/60 hover:bg-accent/5 cursor-pointer mt-2">
              <div>
                <UploadCloud className="mx-auto size-6 text-muted-foreground" />
                <p className="mt-2 text-sm font-medium">
                  {file ? file.name : "Upload Processed File"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">PDF, JPG, PNG - max 5 MB</p>
              </div>
              <input 
                type="file" 
                accept=".pdf,.jpg,.jpeg,.png"
                className="absolute inset-0 cursor-pointer opacity-0" 
                onChange={e => setFile(e.target.files?.[0] || null)}
              />
            </label>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t bg-muted/10 sm:justify-end gap-2 flex-row items-center">
          <Button 
            variant="outline" 
            className="w-full sm:w-auto rounded-xl" 
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button 
            variant="default" 
            className="w-full sm:w-auto bg-green-500 hover:bg-green-600 text-white rounded-xl" 
            onClick={handleSubmit} 
            disabled={isSubmitting}
          >
            {isSubmitting ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
