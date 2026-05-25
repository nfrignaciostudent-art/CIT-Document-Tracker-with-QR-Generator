import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import {
  FileText,
  Copy,
  Download,
  Trash2,
  BarChart3,
  Globe,
  Plus,
  Loader2,
  ExternalLink,
  ChevronRight,
  Monitor,
  Smartphone,
  Tablet as TabletIcon,
  Laptop
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { toast } from "sonner";
import api from "@/lib/api";
import { formatDistanceToNow, format } from "date-fns";

export const Route = createFileRoute("/public-documents")({
  head: () => ({
    meta: [
      { title: "Public Documents · CIT Tracker" },
      { name: "description", content: "Manage and track public documents with analytics." },
    ],
  }),
  component: PublicDocumentsPage,
});

interface PublicDoc {
  _id: string;
  internalId: string;
  title: string;
  description: string;
  filePath: string;
  fileExt: string;
  createdByName: string;
  views: number;
  createdAt: string;
}

interface AnalyticsData {
  document: PublicDoc;
  totalViews: number;
  views: any[];
  viewsPerDay: { date: string; count: number }[];
  distributions: {
    browser: Record<string, number>;
    device: Record<string, number>;
    os: Record<string, number>;
  };
}

function PublicDocumentsPage() {
  const [docs, setDocs] = useState<PublicDoc[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Analytics states
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);

  const loadDocs = async () => {
    try {
      const res = await api.get("/public-documents");
      setDocs(res.data || []);
    } catch (err) {
      console.error("Failed to load public documents", err);
      toast.error("Failed to load public documents");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDocs();
  }, []);

  useEffect(() => {
    if (!selectedDocId) {
      setAnalytics(null);
      return;
    }
    async function fetchAnalytics() {
      setIsLoadingAnalytics(true);
      try {
        const res = await api.get(`/public-documents/${selectedDocId}/analytics`);
        setAnalytics(res.data);
      } catch (err) {
        console.error("Failed to load analytics", err);
        toast.error("Failed to load analytics");
      } finally {
        setIsLoadingAnalytics(false);
      }
    }
    fetchAnalytics();
  }, [selectedDocId]);

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !file) {
      toast.error("Title and PDF file are required.");
      return;
    }
    if (file.type !== "application/pdf" && !file.name.endsWith(".pdf")) {
      toast.error("Only PDF files are allowed.");
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("title", title);
      formData.append("description", description);
      formData.append("file", file);

      await api.post("/public-documents", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      toast.success("Public document registered successfully!");
      setTitle("");
      setDescription("");
      setFile(null);
      setRegisterOpen(false);
      await loadDocs();
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || "Failed to register document");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string, docTitle: string) => {
    if (!confirm(`Are you sure you want to delete "${docTitle}"? All view tracking data will be permanently lost.`)) {
      return;
    }
    try {
      await api.delete(`/public-documents/${id}`);
      toast.success("Document deleted");
      if (selectedDocId === id) setSelectedDocId(null);
      await loadDocs();
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete document");
    }
  };

  const getPublicLink = (internalId: string) => {
    return `${window.location.origin}/public-view/${internalId}`;
  };

  const copyLink = (internalId: string) => {
    const link = getPublicLink(internalId);
    navigator.clipboard.writeText(link);
    toast.success("Public viewer link copied to clipboard!");
  };

  const downloadQR = (internalId: string, docTitle: string) => {
    const canvas = document.querySelector<HTMLCanvasElement>(`#qr-canvas-${internalId} canvas`);
    if (!canvas) {
      toast.error("Could not find QR Code canvas");
      return;
    }
    const link = document.createElement("a");
    link.download = `QR-${docTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    toast.success("QR Code downloaded as PNG");
  };

  const getDeviceIcon = (device: string) => {
    const d = device.toLowerCase();
    if (d === "mobile") return <Smartphone className="size-4 text-emerald-500" />;
    if (d === "tablet") return <TabletIcon className="size-4 text-amber-500" />;
    return <Monitor className="size-4 text-blue-500" />;
  };

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Globe className="size-6 text-primary" />
            Public Documents & QR Sharing
          </h1>
          <p className="text-sm text-muted-foreground">
            Register documents to share publicly via QR code and track access analytics.
          </p>
        </div>
        <Button onClick={() => setRegisterOpen(true)} className="rounded-xl">
          <Plus className="mr-2 size-4" /> Register Public Document
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main List */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="rounded-2xl border bg-card shadow-[var(--shadow-soft)] overflow-hidden">
            <CardHeader className="p-5 border-b">
              <CardTitle className="text-base font-semibold">Registered Documents</CardTitle>
              <CardDescription>Click a row to view detailed analytics.</CardDescription>
            </CardHeader>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Document</TableHead>
                    <TableHead className="text-center">Views</TableHead>
                    <TableHead className="text-center">QR Code</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {docs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                        No public documents registered yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    docs.map((doc) => (
                      <TableRow
                        key={doc.internalId}
                        className={`cursor-pointer hover:bg-muted/50 transition-colors ${
                          selectedDocId === doc.internalId ? "bg-muted/70" : ""
                        }`}
                        onClick={() => setSelectedDocId(doc.internalId)}
                      >
                        <TableCell className="p-4">
                          <div className="flex items-start gap-3">
                            <div className="mt-1 rounded-lg bg-primary/10 p-2 text-primary">
                              <FileText className="size-5" />
                            </div>
                            <div className="space-y-0.5 max-w-[240px]">
                              <p className="font-semibold text-sm leading-tight text-foreground truncate">
                                {doc.title}
                              </p>
                              {doc.description && (
                                <p className="text-xs text-muted-foreground truncate">
                                  {doc.description}
                                </p>
                              )}
                              <p className="text-[10px] text-muted-foreground">
                                Uploaded by {doc.createdByName} · {formatDistanceToNow(new Date(doc.createdAt))} ago
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="p-4 text-center">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                            {doc.views} views
                          </span>
                        </TableCell>
                        <TableCell className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-2">
                            {/* Hidden/Thumbnail Canvas */}
                            <div id={`qr-canvas-${doc.internalId}`} className="hidden">
                              <QRCodeCanvas value={getPublicLink(doc.internalId)} size={256} includeMargin={true} />
                            </div>
                            <Button
                              size="icon"
                              variant="outline"
                              className="size-8 rounded-lg"
                              title="Download QR PNG"
                              onClick={() => downloadQR(doc.internalId, doc.title)}
                            >
                              <Download className="size-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="outline"
                              className="size-8 rounded-lg"
                              title="Copy URL"
                              onClick={() => copyLink(doc.internalId)}
                            >
                              <Copy className="size-4" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className="p-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              asChild
                              size="icon"
                              variant="ghost"
                              className="size-8 rounded-lg"
                              title="Open Viewer"
                            >
                              <a href={getPublicLink(doc.internalId)} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="size-4" />
                              </a>
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-8 text-destructive hover:text-destructive hover:bg-destructive/15 rounded-lg"
                              title="Delete"
                              onClick={() => handleDelete(doc.internalId, doc.title)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>

        {/* Analytics Panel */}
        <div className="space-y-4">
          <Card className="rounded-2xl border bg-card shadow-[var(--shadow-soft)] min-h-[400px] flex flex-col">
            <CardHeader className="p-5 border-b">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <BarChart3 className="size-4 text-primary" />
                Live Tracking & Analytics
              </CardTitle>
              <CardDescription>
                Select a document to see visitor metrics.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 flex-1 flex flex-col justify-between">
              {isLoadingAnalytics ? (
                <div className="flex flex-1 flex-col items-center justify-center min-h-[250px]">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                  <p className="mt-2 text-xs text-muted-foreground">Loading view analytics...</p>
                </div>
              ) : !analytics ? (
                <div className="flex flex-1 flex-col items-center justify-center text-center text-muted-foreground min-h-[250px]">
                  <Globe className="size-8 stroke-[1.5] mb-2 text-muted-foreground/60" />
                  <p className="text-sm font-medium">No Document Selected</p>
                  <p className="text-xs max-w-[200px]">Click on any document in the table to display metrics.</p>
                </div>
              ) : (
                <div className="space-y-5">
                  <div>
                    <h4 className="font-bold text-sm text-foreground truncate">{analytics.document.title}</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Total Views: <span className="font-semibold text-primary">{analytics.totalViews}</span>
                    </p>
                  </div>

                  {/* Daily Trend Chart */}
                  {analytics.viewsPerDay.length > 0 && (
                    <div className="h-36 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={analytics.viewsPerDay} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                          <defs>
                            <linearGradient id="viewsGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.2}/>
                              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                          <XAxis
                            dataKey="date"
                            tickFormatter={(v) => format(new Date(v), "MMM d")}
                            tick={{ fontSize: 9 }}
                            stroke="hsl(var(--muted-foreground))"
                          />
                          <YAxis tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                          <Tooltip
                            labelFormatter={(label) => format(new Date(label), "MMMM d, yyyy")}
                            contentStyle={{ background: "hsl(var(--background))", borderRadius: "12px", border: "1px solid hsl(var(--border))", fontSize: 11 }}
                          />
                          <Area type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={1.5} fillOpacity={1} fill="url(#viewsGrad)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* Distributions */}
                  <div className="space-y-3 pt-3 border-t">
                    <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Device & OS Breakdown</h5>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-medium text-muted-foreground">Devices</p>
                        {Object.entries(analytics.distributions.device).map(([device, count]) => (
                          <div key={device} className="flex items-center justify-between text-xs">
                            <span className="flex items-center gap-1.5 font-medium text-foreground">
                              {getDeviceIcon(device)}
                              {device}
                            </span>
                            <span className="text-muted-foreground">{count}</span>
                          </div>
                        ))}
                      </div>
                      <div className="space-y-1.5 border-l pl-3">
                        <p className="text-[10px] font-medium text-muted-foreground">Operating Systems</p>
                        {Object.entries(analytics.distributions.os).map(([os, count]) => (
                          <div key={os} className="flex items-center justify-between text-xs">
                            <span className="font-medium text-foreground">{os}</span>
                            <span className="text-muted-foreground">{count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Browser Breakdowns */}
                  <div className="space-y-2 pt-3 border-t">
                    <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Browsers</h5>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(analytics.distributions.browser).map(([browser, count]) => (
                        <span key={browser} className="inline-flex items-center gap-1.5 rounded-lg border bg-muted/30 px-2 py-1 text-xs font-medium text-foreground">
                          {browser}: <span className="font-semibold text-primary">{count}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Register Public Document Modal */}
      <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Register Public Document</DialogTitle>
            <DialogDescription>
              Upload a PDF document. It will skip workflow processes and generate a shareable QR Code.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRegisterSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                placeholder="e.g. Dean's Office Order No. 42"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="desc">Description (Optional)</Label>
              <Textarea
                id="desc"
                placeholder="Brief summary of document content or instructions..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="rounded-xl min-h-[80px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pdf">PDF File</Label>
              <Input
                id="pdf"
                type="file"
                accept="application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                required
                className="rounded-xl"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setRegisterOpen(false)} className="rounded-xl">
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="rounded-xl">
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Registering...
                  </>
                ) : (
                  "Register & Share"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
