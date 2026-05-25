import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  FileText,
  Download,
  Loader2,
  Globe,
  ArrowLeft,
  Eye,
  AlertTriangle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Wordmark } from "@/components/brand/logo";
import api from "@/lib/api";

export const Route = createFileRoute("/public-view_/$id")({
  head: () => ({
    meta: [
      { title: "Public Viewer · CIT Tracker" },
      { name: "description", content: "View shared university document." },
    ],
  }),
  component: PublicViewPage,
});

interface PublicDocViewData {
  title: string;
  description: string;
  fileURL: string;
  views: number;
}

function PublicViewPage() {
  const { id } = Route.useParams();
  const [doc, setDoc] = useState<PublicDocViewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadDoc() {
      try {
        const res = await api.get(`/public-documents/view/${id}`);
        setDoc(res.data);
      } catch (err: any) {
        console.error(err);
        setError(err.response?.data?.message || "Failed to load public document. Please verify the link.");
      } finally {
        setIsLoading(false);
      }
    }
    loadDoc();
  }, [id]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="mt-3 text-sm text-muted-foreground">Retrieving public document...</p>
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <div className="max-w-md text-center space-y-4">
          <div className="inline-flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <AlertTriangle className="size-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Document Unavailable</h1>
          <p className="text-sm text-muted-foreground">
            {error || "The document you are trying to view does not exist or has been removed."}
          </p>
          <div className="pt-2">
            <Button asChild variant="outline" className="rounded-xl">
              <Link to="/">
                <ArrowLeft className="mr-2 size-4" /> Go back home
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Public Header */}
      <header className="sticky top-0 z-30 border-b border-border/50 bg-background/70 backdrop-blur-xl">
        <div className="flex w-full h-16 items-center justify-between px-4 md:px-8">
          <Link to="/" className="transition-opacity hover:opacity-90">
            <Wordmark size="sm" />
          </Link>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600">
            <Globe className="size-3.5" /> Public View
          </span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6 md:py-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{doc.title}</h1>
            {doc.description && (
              <p className="text-sm text-muted-foreground max-w-2xl">{doc.description}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Eye className="size-4" /> {doc.views} visits logged
            </span>
            <Button asChild className="rounded-xl">
              <a href={doc.fileURL} download target="_blank" rel="noopener noreferrer">
                <Download className="mr-2 size-4" /> Download PDF
              </a>
            </Button>
          </div>
        </div>

        {/* PDF Viewer Card */}
        <Card className="rounded-2xl border bg-card shadow-[var(--shadow-elegant)] overflow-hidden">
          <CardContent className="p-0">
            <iframe
              src={`${doc.fileURL}#toolbar=0`}
              className="w-full h-[650px] border-0"
              title={doc.title}
            />
          </CardContent>
        </Card>
      </main>

      {/* Footer */}
      <footer className="border-t bg-muted/30 py-5">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-2 px-4 text-[11px] text-muted-foreground md:flex-row">
          <p>© {new Date().getFullYear()} CIT Document Tracker</p>
          <p>University of the Assumption</p>
        </div>
      </footer>
    </div>
  );
}
