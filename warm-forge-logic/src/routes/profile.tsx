import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Profile · CIT Tracker" },
      { name: "description", content: "Manage your account, role, and department." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Profile</h1>
        <p className="text-sm text-muted-foreground">Your portal identity and security settings.</p>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <div className="rounded-2xl border bg-[image:var(--gradient-primary)] p-5 text-primary-foreground shadow-[var(--shadow-elegant)]">
          <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-white/10 text-2xl font-bold ring-2 ring-[var(--color-gold)]/40">
            AO
          </div>
          <p className="mt-3 text-center text-sm font-semibold">Admin Office</p>
          <p className="text-center text-xs text-primary-foreground/70">IT Department · Admin</p>
          <div className="mt-4 flex items-center justify-center gap-1.5 text-xs text-[var(--color-gold)]">
            <ShieldCheck className="size-4" /> Verified
          </div>
        </div>

        <form className="space-y-4 rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)] md:col-span-2"
          onSubmit={(e) => e.preventDefault()}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>Full name</Label>
              <Input defaultValue="Admin Office" className="mt-1.5 rounded-xl" />
            </div>
            <div>
              <Label>Email</Label>
              <Input defaultValue="admin@cit.edu" className="mt-1.5 rounded-xl" />
            </div>
            <div>
              <Label>IT Unit</Label>
              <Input defaultValue="IT Department Office" className="mt-1.5 rounded-xl" />

            </div>
            <div>
              <Label>Role</Label>
              <Input defaultValue="Admin" disabled className="mt-1.5 rounded-xl" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className="rounded-xl">Cancel</Button>
            <Button type="submit" className="rounded-xl">Save changes</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
