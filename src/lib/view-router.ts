"use client";

import { create } from "zustand";

export type View =
  | { name: "storefront" }
  | { name: "dashboard" }
  | { name: "cases" }
  | { name: "case"; caseId: string; tab?: CaseTab }
  | { name: "profile" }
  | { name: "admin" }
  | { name: "monitor" }
  | { name: "audit" };

export type CaseTab =
  | "overview"
  | "devices"
  | "scan"
  | "evidence"
  | "export"
  | "delivery"
  | "discussion"
  | "team";

interface ViewState {
  view: View;
  go: (v: View) => void;
  goCase: (caseId: string, tab?: CaseTab) => void;
  syncFromUrl: () => void;
}

/* -------------------------------------------------------------------------- */
/*  URL <-> View serialisation                                                */
/*                                                                            */
/*  Uses the URL hash so the browser history (back/forward) works and the     */
/*  views can be bookmarked / shared / indexed. All routes stay on `/`.       */
/*                                                                            */
/*  #storefront            → StorefrontView                                   */
/*  #dashboard             → DashboardView                                    */
/*  #admin                 → AdminView                                        */
/*  #cases                 → CasesView                                        */
/*  #audit                 → AuditView                                        */
/*  #profile               → ProfileView                                      */
/*  #monitor               → GeoMonitorView (full ops center)                 */
/*  #case/<id>             → CaseDetailView (overview tab)                    */
/*  #case/<id>/<tab>       → CaseDetailView (specific tab)                    */
/* -------------------------------------------------------------------------- */

function viewToHash(v: View): string {
  if (v.name === "case") {
    const tab = v.tab ?? "overview";
    return `#case/${v.caseId}/${tab}`;
  }
  return `#${v.name}`;
}

function hashToView(hash: string): View {
  const clean = hash.replace(/^#\/?/, "").trim();
  if (!clean) return { name: "storefront" };

  // case/<id>/<tab>
  const caseMatch = clean.match(/^case\/([^/]+)(?:\/([^/]+))?$/);
  if (caseMatch) {
    return {
      name: "case",
      caseId: caseMatch[1],
      tab: (caseMatch[2] as CaseTab) || "overview",
    };
  }

  // simple named views
  const valid = ["storefront", "dashboard", "cases", "profile", "admin", "monitor", "audit"];
  if (valid.includes(clean)) {
    return { name: clean as View["name"] } as View;
  }

  return { name: "storefront" };
}

export const useView = create<ViewState>((set, get) => ({
  view: (() => {
    if (typeof window === "undefined") return { name: "admin" as const };
    const hashView = hashToView(window.location.hash);
    // Default to admin for authenticated users
    return hashView.name === "storefront" ? { name: "admin" as const } : hashView;
  })(),
  go: (v) => {
    const hash = viewToHash(v);
    if (typeof window !== "undefined" && window.location.hash !== hash) {
      window.location.hash = hash;
    }
    set({ view: v });
  },
  goCase: (caseId, tab) => {
    get().go({ name: "case", caseId, tab });
  },
  syncFromUrl: () => {
    if (typeof window === "undefined") return;
    set({ view: hashToView(window.location.hash) });
  },
}));

// Listen for hashchange (browser back/forward) and sync the store.
if (typeof window !== "undefined") {
  window.addEventListener("hashchange", () => {
    useView.getState().syncFromUrl();
  });
}
