import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  FileText,
  ShieldCheck,
  ScanLine,
  Lock,
  ArrowRight,
  Search,
  QrCode,
  
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Wordmark } from "@/components/brand/logo";
import { StatusBadge } from "@/components/status-badge";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CIT Document Tracker · Track Your Document" },
      {
        name: "description",
        content:
          "Enter your Document ID to instantly see status, location, and full history. Real-time, encrypted, and QR-powered.",
      },
      { property: "og:title", content: "CIT Document Tracker · Track Your Document" },
      {
        property: "og:description",
        content:
          "Real-time document tracking for the University of the Assumption with QR codes and secure encryption.",
      },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  const navigate = useNavigate();
  const [docId, setDocId] = useState("");

  const handleTrack = (e: React.FormEvent) => {
    e.preventDefault();
    const id = docId.trim();
    if (!id) return;
    navigate({ to: "/track", search: { track: id } });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border/50 bg-background/70 backdrop-blur-xl">
        <div className="flex w-full h-16 items-center justify-between px-4 md:px-8">
          <Link to="/" className="transition-opacity hover:opacity-90">
            <Wordmark size="sm" />
          </Link>
          <nav className="flex items-center gap-1.5">
            <Button asChild variant="ghost" size="sm" className="rounded-lg text-sm font-medium">
              <Link to="/login">Sign in</Link>
            </Button>
            <Button
              asChild
              size="sm"
              className="rounded-lg bg-primary text-primary-foreground text-sm font-medium shadow-sm transition-all hover:bg-primary/90 hover:shadow-md"
            >
              <Link to="/signup">Create account</Link>
            </Button>
          </nav>
        </div>
      </header>

      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 opacity-[0.22]"
        style={{
          backgroundImage:
            "radial-gradient(50% 40% at 20% 0%, oklch(0.62 0.18 255 / 0.55) 0, transparent 70%), radial-gradient(45% 40% at 85% 35%, oklch(0.74 0.13 85 / 0.35) 0, transparent 70%)",
        }}
      />

      <section className="relative">
        <div className="relative mx-auto max-w-5xl px-4 pb-14 pt-16 text-center md:px-8 md:pt-24">
          <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/60 px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur">
            <ShieldCheck className="size-3.5 text-primary" />
            Secure university document tracking
          </span>

          <h1 className="mt-5 text-balance text-4xl font-semibold tracking-tight md:text-6xl">
            Track every document.
            <span className="block bg-gradient-to-r from-primary via-primary-glow to-primary bg-clip-text text-transparent">
              Verified at every step.
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-balance text-[15px] leading-relaxed text-muted-foreground">
            Enter a Document ID or scan a CIT QR to view live status, handoffs,
            and verification. Document details are visible to authorized personnel only.
          </p>

          <form
            onSubmit={handleTrack}
            className="mx-auto mt-9 flex max-w-2xl flex-col gap-2 rounded-2xl border border-border/70 bg-card/70 p-2 shadow-[0_1px_2px_oklch(0.20_0.05_260/0.04),0_12px_40px_-12px_oklch(0.20_0.05_260/0.18)] backdrop-blur-xl sm:flex-row sm:items-center"
          >
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={docId}
                onChange={(e) => setDocId(e.target.value.toUpperCase())}
                placeholder="Enter your Document ID"
                spellCheck={false}
                autoComplete="off"
                className="h-12 rounded-xl border-0 bg-transparent pl-10 font-mono text-base tracking-wider shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>
            <Button
              type="submit"
              className="h-12 rounded-xl bg-primary px-6 text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow-md"
            >
              Track Document
              <ArrowRight className="size-4" />
            </Button>
          </form>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <ScanLine className="size-3.5 text-primary/70" /> Scan-to-track QR
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 text-primary/70" /> Role-based access
            </span>
          </div>


        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20 md:px-8">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            {
              icon: FileText,
              title: "Register & track",
              desc: "Every document gets a stable ID and a permanent QR code that always points to its live status and chain of custody.",
              
            },
            {
              icon: QrCode,
              title: "QR-powered handoffs",
              desc: "Scan to verify, scan to receive. Every handoff is logged automatically with timestamp, IP, and office signature.",
              
            },
            {
              icon: ShieldCheck,
              title: "Encrypted end-to-end",
              desc: "Sensitive fields never reach the DOM for unauthorized viewers. Owner and document names are server-side gated.",
              
            },
          ].map((f) => (
            <div
              key={f.title}
              className="group relative overflow-hidden rounded-2xl border border-border/70 bg-card/80 p-6 shadow-[0_1px_2px_oklch(0.20_0.05_260/0.04)] backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_18px_50px_-20px_oklch(0.20_0.05_260/0.25)]"
            >
              {/* corner glow */}
              <div
                aria-hidden
                className="pointer-events-none absolute -right-12 -top-12 size-32 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-70"
                style={{
                  background:
                    "radial-gradient(circle, oklch(0.62 0.18 255 / 0.35), transparent 70%)",
                }}
              />
              <div className="relative">
                <div className="relative inline-flex size-11 items-center justify-center rounded-xl bg-[image:var(--gradient-primary)] text-primary-foreground ring-1 ring-inset ring-white/10 shadow-[0_8px_24px_-10px_oklch(0.20_0.05_260/0.6)]">
                  <f.icon className="size-[18px] stroke-[1.5]" />
                  <span className="absolute inset-0 rounded-xl ring-1 ring-[var(--color-gold)]/20" />
                </div>
                <h3 className="mt-5 text-[15px] font-semibold tracking-tight">{f.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                  {f.desc}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="relative mt-12 overflow-hidden rounded-2xl bg-[image:var(--gradient-hero)] p-7 text-primary-foreground shadow-[var(--shadow-elegant)] md:p-9">
          <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-gold)]">
                Office Portal
              </p>
              <h3 className="mt-2 text-xl font-semibold tracking-tight md:text-2xl">
                Manage the full document lifecycle
              </h3>
              <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-primary-foreground/80">
                Register documents, generate QR codes, log movements, and audit
                every scan from one secure dashboard.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild className="rounded-xl bg-white text-primary shadow-sm hover:bg-white/90">
                <Link to="/login">Sign in</Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="rounded-xl border-white/40 bg-transparent text-primary-foreground hover:bg-white/10"
              >
                <Link to="/signup">Create account</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t bg-muted/30">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-5 text-[11px] text-muted-foreground md:flex-row md:px-8">
          <p>© {new Date().getFullYear()} CIT Document Tracker</p>
          <p>Built for the University of the Assumption</p>
        </div>
      </footer>
    </div>
  );
}
