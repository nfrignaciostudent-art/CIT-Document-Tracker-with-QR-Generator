import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { User, Lock, ArrowRight, ArrowLeft } from "lucide-react";
import { Wordmark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import api from "@/lib/api";
import { CIT_VAULT } from "@/lib/crypto";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => {
    return {
      redirect: typeof search.redirect === "string" ? search.redirect : undefined,
    };
  },
  head: () => ({
    meta: [
      { title: "Sign in · CIT Document Tracker" },
      { name: "description", content: "Sign in to your CIT Document Tracker account." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await api.post("/auth/login", { username, password });
      const user = response.data;

      // Derive and activate vault key
      await CIT_VAULT.deriveAndActivate(password, user.passwordSalt, user.encryptedIdeaKey);

      // Self-Healing Fallback: if user keys were cleared/reset, regenerate and upload them
      if (!user.encryptedIdeaKey || !user.passwordSalt) {
        try {
          // Set temporary token so patch request includes Authorization header
          localStorage.setItem("token", user.token);
          const { saltHex, encryptedKeyHex } = await CIT_VAULT.generateAndWrap(password);
          await api.patch("/auth/vault-key", {
            encryptedIdeaKey: encryptedKeyHex,
            passwordSalt: saltHex,
          });
          user.encryptedIdeaKey = encryptedKeyHex;
          user.passwordSalt = saltHex;
        } catch (healErr) {
          console.error("[Self-Healing] Failed to auto-repair vault keys", healErr);
        }
      }

      localStorage.setItem("token", user.token);
      localStorage.setItem("user", JSON.stringify(user));
      
      toast.success(`Welcome back, ${user.name || 'User'}`);
      // Check sessionStorage first (set by tracking page "Sign In" button).
      // This avoids URL-encoding issues where nested ?track= gets stripped.
      const storedRedirect = sessionStorage.getItem("postLoginRedirect");
      if (storedRedirect) {
        sessionStorage.removeItem("postLoginRedirect");
        window.location.href = storedRedirect;
      } else {
        navigate({ to: "/dashboard" });
      }
    } catch (error: any) {
      console.error("Login failed", error);
      toast.error(error.response?.data?.message || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  return <AuthShell title="Welcome back" subtitle="Sign in to manage your documents.">
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="username">Username / Student ID</Label>
        <div className="relative">
          <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input id="username" type="text" required value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter your username or student ID" className="h-11 rounded-xl pl-9" />
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link to="/login" className="text-[11px] text-accent hover:underline">Forgot?</Link>
        </div>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input id="password" type="password" required value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password" className="h-11 rounded-xl pl-9" />
        </div>
      </div>
      <Button type="submit" disabled={loading}
        className="h-11 w-full rounded-xl bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-elegant)] hover:opacity-95">
        {loading ? "Signing in…" : <>Sign in <ArrowRight className="size-4" /></>}
      </Button>
    </form>
    <p className="mt-5 text-center text-sm text-muted-foreground">
      No account yet?{" "}
      <Link to="/signup" className="font-medium text-accent hover:underline">
        Create one
      </Link>
    </p>
  </AuthShell>;
}

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[35%_65%]">
      <div className="relative hidden overflow-hidden bg-[image:var(--gradient-hero)] p-10 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 10%, white 0, transparent 35%), radial-gradient(circle at 90% 80%, var(--color-gold) 0, transparent 40%)",
          }}
        />
        <Link to="/" className="relative">
          <Wordmark size="md" tone="light" subtitle="Document & QR Portal" />
        </Link>
        <div className="relative">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--color-gold)]">
            University of the Assumption
          </p>
          <h2 className="mt-2 text-3xl font-bold leading-tight md:text-4xl">
            Track every document, end to end.
          </h2>
          <p className="mt-3 max-w-md text-sm text-primary-foreground/80">
            Stable IDs, automatic scan logs, and encrypted files, all in one portal designed
            for academic workflows.
          </p>
        </div>
        <p className="relative text-[11px] text-primary-foreground/60">
          © {new Date().getFullYear()} CIT Document Tracker
        </p>
      </div>

      <div className="flex items-center justify-center bg-background px-4 py-10 md:px-10">
        <div className="w-full max-w-sm">
          <Link to="/" className="mb-8 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="size-4" />
            Back to home
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
          <div className="mt-7">{children}</div>
        </div>
      </div>
    </div>
  );
}
