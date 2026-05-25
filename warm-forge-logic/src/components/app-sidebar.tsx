import { Link, useRouterState } from "@tanstack/react-router";
import { useCurrentUser } from "@/hooks/use-current-user";
import {
  LayoutDashboard,
  FileText,
  QrCode,
  ScanLine,
  FilePlus2,
  History,
  ArrowRightLeft,
  Users,
  UserCircle,
  Settings,
  LogOut,
  Globe,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const tracking = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Documents", url: "/documents", icon: FileText },
  { title: "Register", url: "/register", icon: FilePlus2 },
];
const qr = [
  { title: "QR Generator", url: "/qr-generator", icon: QrCode },
  { title: "QR Scanner", url: "/qr-scanner", icon: ScanLine },
];
const logs = [
  { title: "Scan Logs", url: "/scan-logs", icon: History },
  { title: "Movements", url: "/movements", icon: ArrowRightLeft },
];
const admin = [
  { title: "Users", url: "/users", icon: Users },
  { title: "Profile", url: "/profile", icon: UserCircle },
];
const publicDocMenu = [
  { title: "Public Documents", url: "/public-documents", icon: Globe },
];

function Section({
  label,
  items,
  current,
}: {
  label: string;
  items: { title: string; url: string; icon: typeof LayoutDashboard }[];
  current: string;
}) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel className="text-sidebar-foreground/60">{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const active = current === item.url;
            return (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton
                  asChild
                  isActive={active}
                  className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground data-[active=true]:shadow-sm hover:bg-sidebar-accent/70"
                >
                  <Link to={item.url} className="flex items-center gap-3">
                    <item.icon className="size-4" />
                    <span>{item.title}</span>
                    {active && <span className="ml-auto size-1.5 rounded-full bg-[var(--color-gold)]" />}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const current = useRouterState({ select: (r) => r.location.pathname });

  const { user: currentUser } = useCurrentUser();

  const role = currentUser?.role || "user";

  return (
    <Sidebar
      collapsible="icon"
      className="border-r-0 [&_[data-sidebar=sidebar]]:bg-[image:var(--gradient-primary)]"
    >
      <SidebarHeader className="border-b border-sidebar-border/40 px-4 py-5">
        {collapsed ? (
          <p className="text-center text-sm font-bold tracking-tight text-[var(--color-gold)]">
            CIT
          </p>
        ) : (
          <div className="leading-none">
            <p className="text-[15px] font-bold tracking-[-0.02em] text-sidebar-foreground">
              CIT Doc<span className="text-[var(--color-gold)]">Tracker</span>
            </p>
            <p className="mt-1.5 text-[10px] font-medium uppercase tracking-[0.22em] text-sidebar-foreground/55">
              Document &amp; QR Generator
            </p>
          </div>
        )}
      </SidebarHeader>
      <SidebarContent className="px-1">
        <Section label="Tracking" items={tracking} current={current} />
        
        {role !== "user" && (
          <Section label="QR Tools" items={qr} current={current} />
        )}

        {(role === "admin" || role === "dean") && (
          <Section label="Public Sharing" items={publicDocMenu} current={current} />
        )}
        
        {role !== "user" && (
          <Section label="Logs" items={logs} current={current} />
        )}
        
        {role === "admin" && (
          <Section label="Administration" items={admin} current={current} />
        )}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border/40 p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="hover:bg-sidebar-accent/70">
              <Link to="/settings" className="flex items-center gap-3">
                <Settings className="size-4" />
                <span>Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="hover:bg-sidebar-accent/70">
              <Link to="/logout" className="flex items-center gap-3">
                <LogOut className="size-4" />
                <span>Log out</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
