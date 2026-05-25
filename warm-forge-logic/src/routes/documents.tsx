import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { FilterBar } from "@/components/filter-bar";
import { DocumentTable } from "@/components/document-table";
import { getFullDisplayId, type DocStatus, type Document } from "@/lib/dashboard-utils";
import { Loader2, UploadCloud, Trash2 } from "lucide-react";
import api from "@/lib/api";
import { FileViewerModal } from "@/components/file-viewer-modal";
import { AdminUpdateModal } from "@/components/admin-update-modal";
import { useCurrentUser } from "@/hooks/use-current-user";
import { CIT_VAULT, encryptFile } from "@/lib/crypto";

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

import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter 
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/documents")({
  head: () => ({
    meta: [
      { title: "Documents · CIT Document Tracker" },
      { name: "description", content: "Full registry of tracked school documents with filters and status." },
      { property: "og:title", content: "Documents · CIT Document Tracker" },
      { property: "og:description", content: "Full registry of tracked school documents with filters and status." },
    ],
  }),
  component: DocumentsPage,
});

function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<DocStatus | "all">("all");

  const [activeDoc, setActiveDoc] = useState<Document | null>(null);
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null);
  const [adminUpdateDoc, setAdminUpdateDoc] = useState<Document | null>(null);
  const [wfAction, setWfAction] = useState<any>(null);
  const [wfNote, setWfNote] = useState("");
  const [wfFile, setWfFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit details states
  const [editDoc, setEditDoc] = useState<Document | null>(null);
  const [editName, setEditName] = useState("");
  const [editDept, setEditDept] = useState("IT Department Office");
  const [editNote, setEditNote] = useState("");
  const [editFile, setEditFile] = useState<File | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const { user } = useCurrentUser();

  useEffect(() => {
    async function loadDocs() {
      try {
        const res = await api.get("/documents");
        setDocuments(res.data || []);
      } catch (err) {
        console.error("Failed to load documents", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadDocs();
  }, []);

  const reloadDocs = async () => {
    try {
      const res = await api.get("/documents");
      setDocuments(res.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const filtered = useMemo(() => {
    const needle = q.toLowerCase();
    return documents.filter((d) => {
      if (status !== "all" && d.status !== status) return false;
      if (!needle) return true;
      const docNameDec = decryptIfEncrypted(d.name).toLowerCase();
      const docOwnerDec = decryptIfEncrypted(d.ownerName || d.by || d.owner).toLowerCase();
      return (
        docNameDec.includes(needle) ||
        docOwnerDec.includes(needle) ||
        (d.displayId?.toLowerCase().includes(needle)) ||
        (getFullDisplayId(d).toLowerCase().includes(needle))
      );
    });
  }, [q, status, documents]);

  const handleWorkflowSubmit = async () => {
    if (!wfAction || !activeDoc) return;
    if (wfAction.noteRequired && !wfNote.trim()) {
      toast.error("A reason or note is required for this action.");
      return;
    }
    
    const isReleaseFileRequired = wfAction.action === "release";
    const isApproveFileRequired = wfAction.action === "approve" && (user?.role === "faculty" || user?.role === "dean");
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
          documentId: activeDoc.internalId,
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
          documentId: activeDoc.internalId,
          action: wfAction.action,
          note: wfNote
        });
      }

      toast.success(`Successfully processed action: ${wfAction.label}`);
      setWfAction(null);
      setWfNote("");
      setWfFile(null);
      setActiveDoc(null);
      await reloadDocs();
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || "Action failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editDoc) return;
    if (!editName.trim()) {
      toast.error("Document name is required.");
      return;
    }

    setIsEditing(true);
    try {
      const payload = new FormData();
      payload.append("data", JSON.stringify({
        name: editName,
        department: editDept,
        note: editNote,
      }));
      
      if (editFile) {
        payload.append("file", editFile);
      }

      await api.patch(`/documents/${editDoc.internalId}/metadata`, payload, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      toast.success("Document updated successfully");
      setEditDoc(null);
      setEditFile(null);
      await reloadDocs();
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || "Failed to update document");
    } finally {
      setIsEditing(false);
    }
  };

  const handleDeleteInsideEdit = async () => {
    if (!editDoc) return;
    if (!window.confirm(`Are you sure you want to delete this document? This will permanently remove it from the system and cannot be undone.`)) {
      return;
    }

    setIsEditing(true);
    try {
      await api.delete(`/documents/${editDoc.internalId}`);
      toast.success("Document deleted successfully");
      setEditDoc(null);
      await reloadDocs();
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || "Failed to delete document");
    } finally {
      setIsEditing(false);
    }
  };

  if (isLoading) {
    return <div className="flex h-[50vh] items-center justify-center"><Loader2 className="size-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Documents</h1>
        <p className="text-sm text-muted-foreground">
          {filtered.length} of {documents.length} records · synced live
        </p>
      </div>
      <FilterBar query={q} onQuery={setQ} status={status} onStatus={setStatus} />
      <DocumentTable 
        docs={filtered} 
        userRole={user?.role}
        onWorkflowAction={(doc, action) => {
          setActiveDoc(doc);
          setWfAction(action);
          setWfNote("");
          setWfFile(null);
        }} 
        onPreview={(doc) => setPreviewDoc(doc)}
        onAdminUpdate={(doc) => setAdminUpdateDoc(doc)}
        onDeleteSuccess={reloadDocs}
        onEditDetails={(doc) => {
          setEditDoc(doc);
          setEditName(decryptIfEncrypted(doc.name) || "");
          setEditDept(decryptIfEncrypted(doc.department) || "IT Department Office");
          setEditNote(decryptIfEncrypted(doc.note) || "");
          setEditFile(null);
        }}
      />

      <FileViewerModal 
        document={previewDoc} 
        open={!!previewDoc} 
        onOpenChange={(open) => !open && setPreviewDoc(null)} 
      />

      <AdminUpdateModal
        document={adminUpdateDoc}
        open={!!adminUpdateDoc}
        onOpenChange={(open) => !open && setAdminUpdateDoc(null)}
        onSuccess={reloadDocs}
      />

      {/* Workflow Action Dialog */}
      <Dialog open={!!wfAction} onOpenChange={(open) => {
        if (!open) {
          setWfAction(null);
          setActiveDoc(null);
          setWfFile(null);
        }
      }}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>{wfAction?.label}</DialogTitle>
            <DialogDescription>
              You are about to change the status of <strong>{decryptIfEncrypted(activeDoc?.name)}</strong> to <strong>{wfAction?.to}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <Label htmlFor="wfNote">
                {wfAction?.noteRequired ? "Reason / Note (Required)" : "Note (Optional)"}
              </Label>
              <Textarea
                id="wfNote"
                value={wfNote}
                onChange={(e) => setWfNote(e.target.value)}
                placeholder={wfAction?.noteRequired ? "Please specify a reason..." : "Any additional context..."}
                className="mt-2"
              />
            </div>

            {(wfAction?.action === "release" || (wfAction?.action === "approve" && (user?.role === "faculty" || user?.role === "dean"))) && (
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
            <Button variant="outline" onClick={() => { setWfAction(null); setActiveDoc(null); setWfFile(null); }} disabled={isSubmitting}>Cancel</Button>
            <Button 
              onClick={handleWorkflowSubmit} 
              disabled={isSubmitting || ((wfAction?.action === "release" || (wfAction?.action === "approve" && (user?.role === "faculty" || user?.role === "dean"))) && !wfFile)}
            >
              {isSubmitting ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              Confirm Action
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Details Dialog */}
      <Dialog open={!!editDoc} onOpenChange={(open) => {
        if (!open) setEditDoc(null);
      }}>
        <DialogContent className="rounded-2xl max-w-lg">
          <form onSubmit={handleEditSubmit}>
            <DialogHeader>
              <DialogTitle>Edit Document Details</DialogTitle>
              <DialogDescription>
                Correct typos, change target departments, or replace the attached file for this submitted document.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div>
                <Label htmlFor="edit-name">Document Name</Label>
                <Input
                  id="edit-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="mt-1 rounded-xl"
                  required
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label>IT Unit Destination</Label>
                  <Select 
                    value={editDept} 
                    onValueChange={setEditDept}
                  >
                    <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["IT Department Office","Dean of IT","IT Faculty Room","IT Student Services","IT OJT Coordinator","IT Laboratory"].map((d) =>
                        <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label htmlFor="edit-note">Notes</Label>
                <Textarea
                  id="edit-note"
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  placeholder="Any additional context..."
                  className="mt-1 rounded-xl"
                />
              </div>
              <div>
                <Label className="block mb-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Replace Attached File (Optional)</Label>
                <label className="relative flex items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 p-4 text-center transition hover:border-accent/60 hover:bg-accent/5 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <UploadCloud className="size-5 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">
                      {editFile ? editFile.name : "Click to select a replacement file"}
                    </span>
                  </div>
                  <input 
                    type="file" 
                    className="absolute inset-0 cursor-pointer opacity-0" 
                    onChange={(e) => setEditFile(e.target.files?.[0] ?? null)} 
                  />
                </label>
              </div>
            </div>
            <DialogFooter className="flex sm:justify-between items-center w-full gap-4">
              <Button type="button" variant="ghost" onClick={handleDeleteInsideEdit} className="text-destructive hover:text-destructive hover:bg-destructive/10 rounded-xl" disabled={isEditing}>
                <Trash2 className="size-4 mr-2" /> Delete Document
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setEditDoc(null)} disabled={isEditing} className="rounded-xl">Cancel</Button>
                <Button type="submit" disabled={isEditing} className="rounded-xl">
                  {isEditing ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                  Save Changes
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
