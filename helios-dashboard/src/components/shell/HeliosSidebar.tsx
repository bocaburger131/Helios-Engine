"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import AuthSecurityPanel from "@/components/shell/AuthSecurityPanel";
import SidebarDealFields from "@/components/shell/SidebarDealFields";
import { TOKEN_STORAGE_KEY } from "@/lib/apiClient";

const SIDEBAR_KEY = "heliosSidebarCollapsed";

type NavItem = {
  label: string;
  href: string;
  match?: (path: string) => boolean;
};

const MAIN_NAV: NavItem[] = [
  { label: "Upload Hub", href: "/upload", match: (p) => p === "/upload" },
  { label: "Results", href: "/results", match: (p) => p.startsWith("/results") },
  {
    label: "Sample Report",
    href: "/dashboard/6a1b2a60f0fe2f7a4015c5ad?fixture=1",
    match: (p) => p.includes("fixture=1"),
  },
];

const DEV_NAV: NavItem[] = [
  { label: "Activity Explorer", href: "/dev/activity" },
  { label: "Transaction Ledger", href: "/dev/ledger" },
  { label: "Parse Lab", href: "/test/parse" },
  { label: "Pipeline Compare", href: "/dev/compare" },
  { label: "Parse Quality", href: "/dev/quality" },
  { label: "Statement Browser", href: "/test/statements" },
  { label: "Batch Timeline", href: "/dev/jobs" },
];

function NavLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const pathname = usePathname();
  const active = item.match ? item.match(pathname) : pathname === item.href || pathname.startsWith(item.href + "/");

  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
        active
          ? "bg-blue-600 text-white"
          : "text-slate-300 hover:bg-white/10 hover:text-white"
      }`}
    >
      {!collapsed && item.label}
      {collapsed && <span className="mx-auto text-xs">{item.label.charAt(0)}</span>}
    </Link>
  );
}

export default function HeliosSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [devOpen, setDevOpen] = useState(() =>
    DEV_NAV.some((d) => pathname.startsWith(d.href.split("?")[0]))
  );

  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_KEY);
    if (stored === "1") setCollapsed(true);
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
      return next;
    });
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    window.location.href = "/upload";
  }, []);

  const width = collapsed ? "var(--helios-sidebar-collapsed)" : "var(--helios-sidebar-width)";

  return (
    <aside
      className="flex shrink-0 flex-col bg-[var(--helios-navy)] text-white transition-[width] duration-200"
      style={{ width }}
    >
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-xs font-bold">
          S4
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Shift 4 Funding</p>
            <p className="truncate text-xs text-slate-400">Helios</p>
          </div>
        )}
        <button
          type="button"
          onClick={toggleCollapsed}
          className="ml-auto rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? "»" : "«"}
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {MAIN_NAV.map((item) => (
          <NavLink key={item.href} item={item} collapsed={collapsed} />
        ))}

        <div className="pt-3">
          {!collapsed ? (
            <button
              type="button"
              onClick={() => setDevOpen((o) => !o)}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:bg-white/10"
            >
              Developer
              <span className="text-xs">{devOpen ? "▾" : "▸"}</span>
            </button>
          ) : (
            <p className="px-3 py-2 text-center text-xs text-slate-500">Dev</p>
          )}
          {(devOpen || collapsed) && (
            <div className={`space-y-1 ${!collapsed ? "mt-1 pl-2" : ""}`}>
              {DEV_NAV.map((item) => (
                <NavLink key={item.href} item={item} collapsed={collapsed} />
              ))}
            </div>
          )}
        </div>
      </nav>

      {!collapsed && (
        <div className="space-y-4 px-4 pb-4">
          <SidebarDealFields />
          <AuthSecurityPanel />
          <button
            type="button"
            onClick={signOut}
            className="w-full rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-400 hover:bg-white/5 hover:text-white"
          >
            Sign out
          </button>
        </div>
      )}
    </aside>
  );
}
