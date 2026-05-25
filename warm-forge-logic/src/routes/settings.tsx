import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings · CIT Tracker" },
      { name: "description", content: "Manage portal preferences and notifications." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Configure your portal preferences and notifications.
        </p>
      </div>

      <section className="rounded-2xl border bg-card p-5 shadow-sm">
        <h2 className="text-base font-semibold">Organization</h2>
        <Separator className="my-4" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="org">Organization name</Label>
            <Input id="org" defaultValue="CIT DocTracker" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dept">Department</Label>
            <Input id="dept" defaultValue="IT Department" />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-5 shadow-sm">
        <h2 className="text-base font-semibold">Notifications</h2>
        <Separator className="my-4" />
        <div className="space-y-4">
          {[
            { label: "Email notifications", desc: "Updates for document movements." },
            { label: "Scan alerts", desc: "Notify on every QR scan event." },
            { label: "Weekly digest", desc: "Summary every Monday morning." },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">{row.label}</p>
                <p className="text-xs text-muted-foreground">{row.desc}</p>
              </div>
              <Switch defaultChecked />
            </div>
          ))}
        </div>
      </section>

      <div className="flex justify-end">
        <Button>Save changes</Button>
      </div>
    </div>
  );
}
