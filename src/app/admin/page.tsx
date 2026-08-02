"use client";

import { useSession } from "@/lib/api";
import { AppShell } from "@/components/app-shell";
import { DashboardView } from "@/components/views/dashboard-view";
import { CasesView } from "@/components/views/cases-view";
import { CaseDetailView } from "@/components/views/case-detail-view";
import { ProfileView } from "@/components/views/profile-view";
import { AdminView } from "@/components/views/admin-view";
import { AuditView } from "@/components/views/audit-view";
import { GeoMonitorView } from "@/components/views/geo-monitor-view";
import { useView } from "@/lib/view-router";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function AdminPage() {
  const { data: session, isLoading } = useSession();
  const router = useRouter();
  const view = useView((s) => s.view);

  useEffect(() => {
    if (!isLoading && (!session?.user || !session.organization)) {
      router.push("/");
    }
  }, [isLoading, session, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session?.user || !session.organization) {
    return null; // Will redirect via useEffect
  }

  return (
    <AppShell>
      {view.name === "dashboard" && <DashboardView />}
      {view.name === "cases" && <CasesView />}
      {view.name === "case" && <CaseDetailView caseId={view.caseId} tab={view.tab ?? "overview"} />}
      {view.name === "profile" && <ProfileView />}
      {view.name === "admin" && <AdminView />}
      {view.name === "monitor" && <GeoMonitorView />}
      {view.name === "audit" && <AuditView />}
      {view.name === "storefront" && <DashboardView />}
    </AppShell>
  );
}
