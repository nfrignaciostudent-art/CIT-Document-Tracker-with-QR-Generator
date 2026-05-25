import { Link } from "@tanstack/react-router";
import { Download, Eye, QrCode, MoreHorizontal, Pencil, Settings2, RotateCcw, Lock, ShieldCheck } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "./status-badge";
import { getFullDisplayId, type Document } from "@/lib/dashboard-utils";
import { formatDistanceToNow } from "date-fns";
import api from "@/lib/api";
import { toast } from "sonner";
import { CIT_VAULT, decryptFile } from "@/lib/crypto";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface DocumentTableProps {
  docs: Document[];
  userRole?: string;
  onWorkflowAction?: (doc: Document, action: any) => void;
  onPreview?: (doc: Document) => void;
  onAdminUpdate?: (doc: Document) => void;
  onDeleteSuccess?: () => void;
  onEditDetails?: (doc: Document) => void;
}

export function DocumentTable({ docs, userRole, onWorkflowAction, onPreview, onAdminUpdate, onDeleteSuccess, onEditDetails }: DocumentTableProps) {
  const { user: currentUser } = useCurrentUser();

  const handleDownload = async (d: Document) => {
    try {
      const res = await api.get(`/documents/download/${d.internalId}`);
      const data = res.data;
      if (data && data.fileData) {
        const decrypted = decryptFile(data.fileData);
        if (decrypted) {
          const url = decrypted.dataURI;
          const a = document.createElement("a");
          a.href = url;
          const plainName = data.name || d.name || "document";
          a.download = plainName + (decrypted.ext || data.fileExt || "");
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

  if (docs.length === 0) {
    return (
      <div className="flex h-40 flex-col items-center justify-center rounded-2xl border border-dashed bg-card text-muted-foreground">
        <p>No documents found</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-[var(--shadow-soft)]">
      <Table>
        <TableHeader className="bg-muted/30">
          <TableRow className="border-b hover:bg-transparent">
            <TableHead className="w-[180px] font-semibold px-4">Display ID</TableHead>
            <TableHead className="font-semibold">Document</TableHead>
            <TableHead className="hidden md:table-cell font-semibold">Owner</TableHead>
            <TableHead className="hidden lg:table-cell font-semibold">Department</TableHead>
            <TableHead className="font-semibold">Status</TableHead>
            <TableHead className="hidden md:table-cell font-semibold">Updated</TableHead>
            <TableHead className="text-right font-semibold px-4">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {docs.map((d) => {
            const isOwner = currentUser && (currentUser.userId === d.ownerId || currentUser._id === d.ownerId);
            const canEdit = isOwner && d.status === "Submitted";
            const needsResubmit = isOwner && d.status === "Action Required: Resubmission" && currentUser?.role === "user";

            const decryptedName = decryptIfEncrypted(d.name) || "Not provided";
            const decryptedOwner = decryptIfEncrypted(d.ownerName || d.by) || "Not provided";
            const decryptedDept = decryptIfEncrypted(d.department) || "N/A";

            return (
              <TableRow key={d.internalId} className="group border-b last:border-0 transition-colors">
                <TableCell className="px-4 font-mono text-xs font-semibold whitespace-nowrap">
                  <Link to="/documents/$docId" params={{ docId: d.internalId }} className="rounded-md bg-muted px-2 py-1 text-primary hover:text-primary/80 transition-colors">
                    {getFullDisplayId(d)}
                  </Link>
                </TableCell>
                <TableCell className="max-w-[280px]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <p className="truncate font-medium">{decryptedName}</p>
                    {d.enc && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex cursor-help text-slate-400 hover:text-slate-600 transition-colors">
                              <ShieldCheck className="size-3.5" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="rounded-lg px-2.5 py-1 text-[11px] bg-slate-900 text-white font-medium shadow-sm">
                            Protected with IDEA-128-CBC
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                  {decryptedOwner}
                </TableCell>
                <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                  {decryptedDept}
                </TableCell>
                <TableCell>
                  <StatusBadge status={d.status} />
                </TableCell>
                <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                  {(() => {
                    const dateVal = d.updatedAt || (d as any).date;
                    if (!dateVal) return "N/A";
                    const parsed = new Date(dateVal);
                    return isNaN(parsed.getTime()) ? "N/A" : formatDistanceToNow(parsed, { addSuffix: true });
                  })()}
                </TableCell>
                <TableCell className="px-4 text-right">
                  <div className="flex items-center justify-end gap-2 whitespace-nowrap opacity-70 transition group-hover:opacity-100">
                    {needsResubmit && (
                      <Button asChild size="sm" variant="outline" className="h-7 rounded-lg text-xs px-2.5 border-rose-300 text-rose-600 hover:bg-rose-50 hover:text-rose-700">
                        <Link to="/documents/$docId" params={{ docId: d.internalId }}>
                          <RotateCcw className="size-3 mr-1" /> Resubmit
                        </Link>
                      </Button>
                    )}
                    {canEdit && (
                      <Button size="icon" variant="ghost" className="size-8 hover:text-primary hover:bg-primary/10" aria-label="Manage Document" onClick={() => onEditDetails?.(d)}>
                        <Settings2 className="size-4 text-primary" />
                      </Button>
                    )}
                    {(d.hasProcessedFile || d.hasSignedFile || d.hasOriginalFile) && (
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="size-8 text-green-600 hover:text-green-700" 
                        aria-label="Download" 
                        onClick={() => handleDownload(d)}
                        title={`Download ${
                          d.hasProcessedFile 
                            ? "Processed Document" 
                            : d.hasSignedFile 
                              ? "Signed Document" 
                              : "Original Document"
                        }`}
                      >
                        <Download className="size-4" />
                      </Button>
                    )}
                    {userRole === 'staff' && d.current_role === 'staff' && (d as any).ownerRole !== 'dean' && (
                      <Button size="icon" variant="ghost" className="size-8" onClick={() => onAdminUpdate?.(d)} aria-label="Staff Override">
                        <Pencil className="size-4 text-amber-500" />
                      </Button>
                    )}
                    {d.allowedActions && d.allowedActions.length > 0 && onWorkflowAction && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" className="size-8">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56 rounded-xl">
                          <DropdownMenuLabel>Workflow Actions</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {d.allowedActions.map((action: any) => (
                            <DropdownMenuItem
                              key={action.action}
                              onClick={() => onWorkflowAction(d, action)}
                              className={action.action.includes('reject') || action.action.includes('return') ? 'text-destructive focus:text-destructive' : ''}
                            >
                              {action.label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    <Button size="icon" variant="ghost" className="size-8" onClick={() => onPreview?.(d)} aria-label="View Document">
                      <Eye className="size-4" />
                    </Button>
                    <Button asChild size="icon" variant="ghost" className="size-8">
                      <Link
                        to="/qr-generator"
                        search={{ id: d.internalId }}
                        aria-label="QR"
                      >
                        <QrCode className="size-4" />
                      </Link>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
