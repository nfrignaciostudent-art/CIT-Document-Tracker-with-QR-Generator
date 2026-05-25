import { createFileRoute, Link } from "@tanstack/react-router";
import { type UserRole, type UserRow } from "@/lib/dashboard-utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDistanceToNow } from "date-fns";
import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Loader2, Plus, Eye, ExternalLink } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { StatusBadge } from "@/components/status-badge";

const ROLE_STYLES: Record<string, string> = {
  admin: "bg-primary/10 text-primary ring-1 ring-primary/20",
  faculty: "bg-[var(--color-gold)]/15 text-[var(--color-gold)] ring-1 ring-[var(--color-gold)]/30",
  staff: "bg-accent/10 text-accent ring-1 ring-accent/20",
  user: "bg-success/10 text-success ring-1 ring-success/20",
  student: "bg-success/10 text-success ring-1 ring-success/20",
  dean: "bg-pink-500/10 text-pink-600 ring-1 ring-pink-500/20",
};

function RoleBadge({ role }: { role: string }) {
  const style = ROLE_STYLES[role.toLowerCase()] || "bg-muted text-muted-foreground ring-1 ring-border";
  const label = role.toLowerCase() === 'user' ? 'student' : role;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${style}`}>
      {label}
    </span>
  );
}

export const Route = createFileRoute("/users")({
  head: () => ({
    meta: [
      { title: "Users · CIT Tracker" },
      { name: "description", content: "Manage portal users and review heartbeat-based online status." },
    ],
  }),
  component: UsersPage,
});

function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Creation modal states
  const [createOpen, setCreateOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("staff");
  const [department, setDepartment] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Document auditing states
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [userDocs, setUserDocs] = useState<any[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);

  const loadUsers = async () => {
    try {
      const res = await api.get("/auth/users");
      setUsers(res.data || []);
    } catch (err) {
      console.error("Failed to load users", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    if (!selectedUser) {
      setUserDocs([]);
      return;
    }
    async function fetchUserDocs() {
      setLoadingDocs(true);
      try {
        const res = await api.get(`/documents/user/${selectedUser.userId || selectedUser._id}/all`);
        setUserDocs(res.data || []);
      } catch (err) {
        console.error("Failed to load user documents", err);
        toast.error("Failed to load user documents");
      } finally {
        setLoadingDocs(false);
      }
    }
    fetchUserDocs();
  }, [selectedUser]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim() || !password || !employeeId.trim()) {
      toast.error("Please fill in all required fields.");
      return;
    }
    if (password.length < 4) {
      toast.error("Password must be at least 4 characters.");
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post("/auth/users/create", {
        name: fullName,
        email: email,
        password: password,
        role: role,
        department: department,
        employee_id: employeeId,
      });

      toast.success(`${role.charAt(0).toUpperCase() + role.slice(1)} account created successfully!`);
      
      // Reset form states
      setFullName("");
      setEmail("");
      setPassword("");
      setRole("staff");
      setDepartment("");
      setEmployeeId("");
      setCreateOpen(false);
      
      // Reload lists
      await loadUsers();
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || "Failed to create account");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <div className="flex h-[50vh] items-center justify-center"><Loader2 className="size-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="text-sm text-muted-foreground">Online status pings every 2 minutes.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="rounded-xl bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-elegant)] hover:opacity-95">
          <Plus className="size-4 mr-2" /> Create Account
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card shadow-[var(--shadow-soft)]">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="px-4">User</TableHead>
              <TableHead>Email/Username</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last seen</TableHead>
              <TableHead className="px-4 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No users found or unauthorized.
                </TableCell>
              </TableRow>
            )}
            {users.map((u) => {
              const online = u.online !== undefined ? u.online : (u.lastSeen && (Date.now() - new Date(u.lastSeen).getTime() < 150000));
              return (
                <TableRow key={u._id || u.id || Math.random()}>
                  <TableCell className="px-4">
                    <div className="flex items-center gap-3">
                      <div className="relative flex size-9 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                        {(u.name || "Unknown").split(" ").map((s: string) => s[0]).slice(0,2).join("")}
                        <span className={`absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-card ${online ? "bg-success" : "bg-muted-foreground"}`} />
                      </div>
                      <span className="font-medium">{u.name || "Unknown"}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{u.email || u.username}</TableCell>
                  <TableCell>
                    <RoleBadge role={u.role || "student"} />
                  </TableCell>

                  <TableCell>
                    {online ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">
                        <span className="size-1.5 rounded-full bg-success" /> Online
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Offline</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {u.lastSeen ? formatDistanceToNow(new Date(u.lastSeen), { addSuffix: true }) : "Never"}
                  </TableCell>
                  <TableCell className="px-4 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-xl text-xs"
                      onClick={() => setSelectedUser(u)}
                    >
                      <Eye className="size-3.5 mr-1.5" /> View Documents
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Create Account Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="rounded-2xl max-w-md">
          <form onSubmit={handleCreateSubmit}>
            <DialogHeader>
              <DialogTitle>Create Staff/Faculty Account</DialogTitle>
              <DialogDescription>
                Provision active credentials for staff or faculty members. These accounts are active immediately.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div>
                <Label htmlFor="fullname">Full Name</Label>
                <Input
                  id="fullname"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Juan Dela Cruz"
                  className="mt-1 rounded-xl"
                  required
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="email">Email / Username</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="jdelacruz@school.edu"
                    className="mt-1 rounded-xl"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="password">Temporary Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min 4 characters"
                    className="mt-1 rounded-xl"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="role">Role</Label>
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger id="role" className="mt-1 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="staff">Staff</SelectItem>
                      <SelectItem value="faculty">Faculty</SelectItem>
                      <SelectItem value="dean">Dean</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="employeeId">Employee ID</Label>
                  <Input
                    id="employeeId"
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                    placeholder="EMP-2026-0001"
                    className="mt-1 rounded-xl"
                    required
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="department">Department / Office (Optional)</Label>
                <Input
                  id="department"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="IT Department Office"
                  className="mt-1 rounded-xl"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={isSubmitting} className="rounded-xl">
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="rounded-xl bg-[image:var(--gradient-primary)] text-primary-foreground">
                {isSubmitting ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                Create Account
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* View Documents Auditing Dialog */}
      <Dialog open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <DialogContent className="rounded-2xl max-w-3xl max-h-[85vh] flex flex-col p-6">
          <DialogHeader>
            <DialogTitle>Documents Auditing</DialogTitle>
            <DialogDescription>
              Viewing activity history for <strong>{selectedUser?.name}</strong> ({selectedUser?.role === 'user' ? 'Student' : selectedUser?.role}).
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-4 min-h-[250px]">
            {loadingDocs ? (
              <div className="flex h-40 items-center justify-center">
                <Loader2 className="size-8 animate-spin text-muted-foreground" />
              </div>
            ) : userDocs.length === 0 ? (
              <div className="flex h-40 flex-col items-center justify-center rounded-2xl border border-dashed text-muted-foreground bg-muted/10 p-6 text-center">
                <p className="font-medium text-sm">No activity records found</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {selectedUser?.role === 'user'
                    ? "This student hasn't registered any documents yet."
                    : "This staff/faculty member hasn't processed or handled any documents yet."}
                </p>
              </div>
            ) : (
              <div className="rounded-xl border overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow>
                      <TableHead className="px-4 w-[160px]">Document ID</TableHead>
                      <TableHead>Document Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="px-4 text-right">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {userDocs.map((d) => (
                      <TableRow key={d.internalId} className="group transition-colors hover:bg-muted/10">
                        <TableCell className="px-4 font-mono text-xs font-semibold whitespace-nowrap">
                          <Link
                            to="/documents/$docId"
                            params={{ docId: d.internalId }}
                            onClick={() => setSelectedUser(null)}
                            className="rounded-md bg-muted px-2 py-1 text-primary hover:text-primary/80 transition-colors"
                          >
                            {d.displayId}
                          </Link>
                        </TableCell>
                        <TableCell className="max-w-[200px] font-medium truncate">
                          {d.name}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {d.type || "Other"}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={d.status} />
                        </TableCell>
                        <TableCell className="px-4 text-right text-xs text-muted-foreground">
                          {(() => {
                            const dateVal = d.date || d.updatedAt || d.createdAt;
                            if (!dateVal) return "N/A";
                            const parsed = new Date(dateVal);
                            return isNaN(parsed.getTime()) ? "N/A" : formatDistanceToNow(parsed, { addSuffix: true });
                          })()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <DialogFooter className="border-t pt-4">
            <Button onClick={() => setSelectedUser(null)} className="rounded-xl">
              Close Audit Log
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
