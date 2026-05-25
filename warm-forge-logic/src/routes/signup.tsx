import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { User as UserIcon, Lock, ArrowRight, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "./login";
import { toast } from "sonner";
import api from "@/lib/api";
import { CIT_VAULT } from "@/lib/crypto";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Create account · CIT Document Tracker" },
      { name: "description", content: "Create your CIT Document Tracker account." },
    ],
  }),
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = name.trim();
    const finalUsername = username.trim();
    
    if (!finalName || !finalUsername || !password) {
      toast.error("Please fill in all required fields.");
      return;
    }

    if (!/^\d+$/.test(finalUsername)) {
      toast.error("Student ID Number must contain numbers only.");
      return;
    }

    if (finalUsername.length < 10 || finalUsername.length > 12) {
      toast.error("Student ID Number must be between 10 and 12 characters.");
      return;
    }

    setLoading(true);
    try {
      // Zero-Knowledge Key Wrapping Flow
      const { saltHex, encryptedKeyHex } = await CIT_VAULT.generateAndWrap(password);

      const response = await api.post("/auth/register", {
        name: finalName,
        username: finalUsername,
        password,
        encryptedIdeaKey: encryptedKeyHex,
        passwordSalt: saltHex,
      });

      localStorage.setItem("token", response.data.token);
      localStorage.setItem("user", JSON.stringify(response.data));
      
      toast.success("Account created · welcome!");
      navigate({ to: "/dashboard" });
    } catch (error: any) {
      console.error("Signup failed", error);
      toast.error(error.response?.data?.message || "Failed to create account");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Create your account" subtitle="Get a CIT DocTracker account in seconds.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Full name</Label>
          <div className="relative">
            <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="name" name="name" required placeholder="Juan Dela Cruz" className="h-11 rounded-xl pl-9" 
              value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="username">Student ID Number</Label>
          <div className="relative">
            <UserIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="username" name="username" type="text" required placeholder="e.g. 2023000585" className="h-11 rounded-xl pl-9" 
              value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="password" name="password" type="password" required minLength={4} placeholder="At least 4 characters" className="h-11 rounded-xl pl-9" 
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          By creating an account, you agree to the CIT acceptable-use policy.
        </p>
        <Button
          type="submit"
          disabled={loading}
          className="h-11 w-full rounded-xl bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-elegant)] hover:opacity-95"
        >
          {loading ? "Creating…" : <>Create account <ArrowRight className="size-4" /></>}
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link to="/login" className="font-semibold text-accent hover:underline">Sign in</Link>
      </p>
    </AuthShell>
  );
}
