"use client";

import { useEffect, type ReactNode } from "react";
import { useSession, useSignOut } from "@/lib/api";
import { useView, type View } from "@/lib/view-router";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";
import { AutoCapture } from "@/components/auto-capture";
import {
  LayoutDashboard,
  Briefcase,
  ShieldCheck,
  ScrollText,
  User,
  LogOut,
  Power,
  FlaskConical,
  Bell,
  Store,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";

const NAV_ITEMS: Array<{
  label: string;
  icon: ReactNode;
  view: View;
  match: (v: View) => boolean;
}> = [
  {
    label: "Storefront",
    icon: <Store className="w-4 h-4" />,
    view: { name: "storefront" },
    match: (v) => v.name === "storefront",
  },
  {
    label: "Dashboard",
    icon: <LayoutDashboard className="w-4 h-4" />,
    view: { name: "dashboard" },
    match: (v) => v.name === "dashboard",
  },
  {
    label: "Cases",
    icon: <Briefcase className="w-4 h-4" />,
    view: { name: "cases" },
    match: (v) => v.name === "cases" || v.name === "case",
  },
  {
    label: "Ops Monitor",
    icon: <Globe className="w-4 h-4" />,
    view: { name: "monitor" },
    match: (v) => v.name === "monitor",
  },
  {
    label: "Audit Log",
    icon: <ScrollText className="w-4 h-4" />,
    view: { name: "audit" },
    match: (v) => v.name === "audit",
  },
  {
    label: "Admin",
    icon: <ShieldCheck className="w-4 h-4" />,
    view: { name: "admin" },
    match: (v) => v.name === "admin",
  },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const view = useView((s) => s.view);
  const go = useView((s) => s.go);
  const advanceMode = useAppStore((s) => s.advanceMode);
  const setAdvanceMode = useAppStore((s) => s.setAdvanceMode);
  const signOut = useSignOut();

  // Sync store with session
  useEffect(() => {
    if (session?.user) {
      useAppStore.getState().setSession({
        userId: session.user.id,
        userEmail: session.user.email,
        userName: session.user.name,
        userRole: session.user.role,
        organizationId: session.organization?.id ?? null,
        organizationName: session.organization?.name ?? null,
        licenseType: session.organization?.licenseType ?? null,
        mfaEnabled: session.user.mfaEnabled,
      });
    }
  }, [session]);

  const user = session?.user;
  const org = session?.organization;

  const initials = (user?.name || user?.email || "?")
    .split(/\s|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="min-h-screen flex flex-col bg-background bg-grid-pattern">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(circle_at_top_left,_rgba(100,255,183,0.16),_transparent_60%)]" />
      <Toaster richColors closeButton position="top-right" />
      <AutoCapture />
      {/* Top bar */}
      <header className="sticky top-0 z-40 h-14 border-b border-border/60 bg-card/85 backdrop-blur-xl shadow-[0_8px_24px_rgba(0,0,0,0.2)]">
        <div className="flex h-full items-center gap-3 px-3 sm:px-5">
          <button
            onClick={() => go({ name: "dashboard" })}
            className="flex items-center gap-2.5 cursor-pointer group"
          >
            <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary/30 via-primary/10 to-accent/25 ring-1 ring-primary/30 shadow-[0_0_0_1px_rgba(255,255,255,0.03)_inset]">
              <img src="/logo.png" alt="Organization logo" className="h-5 w-5" />
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-accent pulse-ring" />
            </div>
            <div className="hidden sm:block leading-none">
              <div className="text-sm font-semibold tracking-tight">{org?.name || "Portal"}</div>
              <div className="text-[10px] text-muted-foreground font-mono-forensic">
                GEO INTELLIGENCE · {org?.licenseType?.toUpperCase() ?? "UNLICENSED"}
              </div>
            </div>
          </button>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            {/* Advance mode toggle */}
            <div className="hidden md:flex items-center gap-2 rounded-md border border-border/60 bg-muted/40 px-2.5 py-1">
              <span className="text-[10px] font-mono-forensic text-muted-foreground uppercase tracking-wider">
                Mode
              </span>
              <span
                className={cn(
                  "text-[11px] font-medium",
                  !advanceMode ? "text-foreground" : "text-muted-foreground"
                )}
              >
                Basic
              </span>
              <Switch
                checked={advanceMode}
                onCheckedChange={setAdvanceMode}
                className="scale-90"
              />
              <span
                className={cn(
                  "text-[11px] font-medium",
                  advanceMode ? "text-accent" : "text-muted-foreground"
                )}
              >
                Advanced
              </span>
            </div>

            {/* Notifications (decorative) */}
            <Button
              variant="ghost"
              size="icon"
              className="relative h-8 w-8"
              onClick={() => toast.info("No new notifications")}
            >
              <Bell className="h-4 w-4" />
              <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent" />
            </Button>

            {/* User menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted/60 transition-colors cursor-pointer">
                  <Avatar className="h-7 w-7 border border-border/60">
                    <AvatarFallback className="bg-primary/15 text-primary text-[10px] font-mono-forensic">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="hidden sm:block text-left leading-none">
                    <div className="text-xs font-medium truncate max-w-[120px]">
                      {user?.name}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                      {org?.name ?? "—"}
                    </div>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{user?.name}</span>
                    <span className="text-xs text-muted-foreground truncate">{user?.email}</span>
                    <Badge variant="outline" className="mt-1.5 w-fit text-[10px] capitalize">
                      {user?.role}
                    </Badge>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer"
                  onClick={() => go({ name: "profile" })}
                >
                  <User className="mr-2 h-4 w-4" /> Profile & MFA
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer"
                  onClick={() => go({ name: "admin" })}
                >
                  <ShieldCheck className="mr-2 h-4 w-4" /> Admin Panel
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer text-destructive focus:text-destructive"
                  onClick={() => signOut.mutate()}
                >
                  <LogOut className="mr-2 h-4 w-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside className="hidden md:flex w-56 flex-col border-r border-border/60 bg-sidebar/50 backdrop-blur-sm">
          <nav className="flex-1 p-3 space-y-1">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.label}
                onClick={() => go(item.view)}
                className={cn(
                  "w-full flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-all cursor-pointer",
                  item.match(view)
                    ? "bg-primary/15 text-primary-foreground/90 ring-1 ring-primary/30"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                )}
              >
                <span className={cn(item.match(view) ? "text-primary" : "")}>{item.icon}</span>
                <span className="font-medium">{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="p-3 border-t border-border/60 space-y-2">
            <div className="rounded-md bg-muted/40 p-2.5 ring-1 ring-border/40">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono-forensic text-muted-foreground uppercase tracking-wider">
                  Engine Status
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <span className="text-[10px] font-mono-forensic text-emerald-500">ONLINE</span>
                </span>
              </div>
              <div className="mt-1.5 text-[10px] font-mono-forensic text-muted-foreground">
                <div>License: {org ? "Active" : "—"}</div>
                <div className="truncate">Org: {org?.name ?? "—"}</div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-muted-foreground hover:text-destructive cursor-pointer"
              onClick={() => signOut.mutate()}
            >
              <Power className="mr-2 h-3.5 w-3.5" />
              End Session
            </Button>
          </div>
        </aside>

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border/60 bg-card/95 backdrop-blur-md">
          <div className="flex justify-around items-center h-14">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.label}
                onClick={() => go(item.view)}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 text-[10px]",
                  item.match(view) ? "text-primary" : "text-muted-foreground"
                )}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </nav>

        {/* Main content */}
        <main className="flex-1 min-w-0 overflow-y-auto pb-16 md:pb-0">{children}</main>
      </div>

      {/* Footer */}
      <footer className="border-t border-border/60 bg-card/50 px-4 py-2.5 mt-auto">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono-forensic text-muted-foreground">
          <div className="flex items-center gap-3">
            <span>FORENSIQ v4.2.1</span>
            <span className="hidden sm:inline">·</span>
            <span className="hidden sm:inline">CHAIN-OF-CUSTODY: ACTIVE</span>
            <span className="hidden sm:inline">·</span>
            <span className="hidden sm:inline">SHA-256 INTEGRITY VERIFIED</span>
          </div>
          <div className="flex items-center gap-3">
            <span>Mode: {advanceMode ? "ADVANCED" : "BASIC"}</span>
            <span>·</span>
            <span>Sess: {user ? "AUTH" : "GUEST"}</span>
            <span>·</span>
            <span>{new Date().toISOString().slice(0, 19).replace("T", " ")}Z</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
