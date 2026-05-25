import { Bell, Search } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import api from "@/lib/api";
import { useCurrentUser } from "@/hooks/use-current-user";
import { CIT_VAULT } from "@/lib/crypto";

function decryptMessageHtml(msg: string): string {
  if (!msg) return "";
  return msg.replace(/\{"iv"\s*:\s*"[a-f0-9]+"\s*,\s*"data"\s*:\s*"[a-f0-9]+"\}/gi, (match) => {
    try {
      return CIT_VAULT.decrypt(match) || match;
    } catch (e) {
      return match;
    }
  });
}

export function TopHeader() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const unread = notifications.filter((n) => !n.read).length;
  const navigate = useNavigate();
  const { user: fetchedUser } = useCurrentUser();

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    try {
      const res = await api.get('/notifications');
      setNotifications(res.data || []);
    } catch (err) {
      console.error("Failed to fetch notifications", err);
    }
  };

  const handleOpenChange = async (newOpen: boolean) => {
    setOpen(newOpen);
    if (newOpen && unread > 0) {
      try {
        await api.post('/notifications/mark-read');
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      } catch (err) {
        console.error("Failed to mark notifications as read", err);
      }
    }
  };

  const handleNotificationClick = (n: any) => {
    if (n.documentId) {
      navigate({ to: `/documents/${n.documentId}` });
      setOpen(false);
    }
  };
  
  const user = fetchedUser || { name: "Admin Office", role: "admin" };
  const initials = (user.name || "A").split(" ").map((s: string) => s[0]).slice(0, 2).join("");

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-md md:px-6">
      <SidebarTrigger className="text-foreground" />
      <div className="relative ml-2 hidden max-w-md flex-1 md:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search documents, display IDs, owners…"
          className="h-10 rounded-xl border-border bg-muted/40 pl-9"
        />
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Sheet open={open} onOpenChange={handleOpenChange}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="relative rounded-xl">
              <Bell className="size-5" />
              {unread > 0 && (
                <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
                  {unread}
                </span>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent className="w-full sm:max-w-md">
            <SheetHeader>
              <SheetTitle>Notifications</SheetTitle>
            </SheetHeader>
            <div className="mt-4 space-y-2 overflow-y-auto pr-1">
              {notifications.length === 0 && <p className="text-sm text-muted-foreground">No new notifications.</p>}
              {notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`rounded-xl border bg-card p-3 transition-colors hover:bg-muted/40 ${n.documentId ? 'cursor-pointer' : ''}`}
                >
                  <div className="flex items-start gap-2">
                    {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">Document Update</p>
                      <p 
                        className="mt-0.5 text-xs text-muted-foreground leading-relaxed" 
                        dangerouslySetInnerHTML={{ __html: decryptMessageHtml(n.msg) }} 
                      />
                      <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground/70">
                        {n.date}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </SheetContent>
        </Sheet>
        <div className="flex items-center gap-3 rounded-xl border bg-card px-2 py-1.5 pr-3">
          <Avatar className="size-8">
            <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold uppercase">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="hidden text-left sm:block">
            <p className="text-xs font-semibold leading-tight capitalize">{user.name}</p>
            <p className="text-[10px] text-muted-foreground capitalize">IT Department · {user.role}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
