"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PortalIcon, type PortalIconName } from "./PortalIcon";

type NavItem = {
  label: string;
  icon: PortalIconName;
  href?: string;
};

const workspaceNav: NavItem[] = [
  { label: "Overview", icon: "dashboard", href: "/dashboard" },
  { label: "Service requests", icon: "requests", href: "/dashboard/requests" },
  { label: "Sites", icon: "projects" },
  { label: "Tasks", icon: "tasks" },
  { label: "Files", icon: "files" },
];

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [supabase] = useState(createClient);
  const [accountEmail, setAccountEmail] = useState("");
  const [navOpen, setNavOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (active) setAccountEmail(data.user?.email ?? "");
    }).catch(() => {
      // Route protection and page-level load errors handle session problems.
    });
    return () => { active = false; };
  }, [supabase]);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError("");
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      router.replace("/login");
      router.refresh();
    } catch {
      setSignOutError("Could not sign out. Please try again.");
    } finally {
      setSigningOut(false);
    }
  }

  const initials = accountEmail ? accountEmail.slice(0, 2).toUpperCase() : "CP";
  const heading = pathname === "/dashboard/requests"
    ? "Service requests"
    : pathname.startsWith("/dashboard/settings")
      ? "Settings"
      : "Overview";

  function navItem(item: NavItem) {
    if (!item.href) {
      return (
        <div key={item.label} className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-400" title="Planned for a later release">
          <PortalIcon name={item.icon} />
          <span className="flex-1">{item.label}</span>
          <span className="text-[10px] text-slate-400">Soon</span>
        </div>
      );
    }
    const selected = item.href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname.startsWith(item.href);
    return (
      <Link
        key={item.label}
        href={item.href}
        onClick={() => setNavOpen(false)}
        aria-current={selected ? "page" : undefined}
        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${selected ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}
      >
        <PortalIcon name={item.icon} />
        {item.label}
      </Link>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-[#172238]">
      <div className="mx-auto flex min-h-screen max-w-[1720px]">
        {navOpen && (
          <button
            type="button"
            className="fixed inset-0 z-40 bg-slate-950/30 lg:hidden"
            onClick={() => setNavOpen(false)}
            aria-label="Close navigation"
          />
        )}
        <aside className={`fixed inset-y-0 left-0 z-50 flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white px-3 py-5 transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${navOpen ? "translate-x-0" : "-translate-x-full"}`}>
          <div className="flex items-center justify-between px-3 pb-8">
            <Link href="/dashboard" className="flex items-center gap-2.5" onClick={() => setNavOpen(false)}>
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#315fd4] text-sm font-bold tracking-tight text-white">CP</span>
              <span><span className="block text-[14px] font-bold tracking-tight text-slate-900">Client Portal</span><span className="block text-[11px] text-slate-500">Service workspace</span></span>
            </Link>
            <button type="button" className="rounded-md p-2 text-slate-600 lg:hidden" onClick={() => setNavOpen(false)} aria-label="Close menu"><PortalIcon name="close" /></button>
          </div>
          <nav aria-label="Main navigation" className="flex-1">
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[.15em] text-slate-400">Workspace</p>
            <div className="space-y-1">{workspaceNav.map(navItem)}</div>
            <p className="px-3 pb-2 pt-8 text-[10px] font-semibold uppercase tracking-[.15em] text-slate-400">Account</p>
            <Link
              href="/dashboard/settings"
              onClick={() => setNavOpen(false)}
              aria-current={pathname.startsWith("/dashboard/settings") ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${pathname.startsWith("/dashboard/settings") ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}
            ><PortalIcon name="settings" />Settings</Link>
          </nav>
          <div className="mt-6 border-t border-slate-100 px-2 pt-5">
            <div className="mb-3 flex items-center gap-2.5 px-1">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">{initials}</span>
              <div className="min-w-0"><div className="text-xs font-semibold text-slate-900">Client account</div><div className="truncate text-[11px] text-slate-500" title={accountEmail}>{accountEmail || "Signed in"}</div></div>
            </div>
            <button type="button" onClick={signOut} disabled={signingOut} className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"><PortalIcon name="logout" />{signingOut ? "Signing out..." : "Sign out"}</button>
            {signOutError && <p role="alert" className="mt-2 text-xs text-red-700">{signOutError}</p>}
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-[68px] shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 sm:px-7 lg:px-9">
            <div className="flex min-w-0 items-center gap-3">
              <button type="button" className="-ml-1 rounded-lg p-2 text-slate-700 hover:bg-slate-100 lg:hidden" onClick={() => setNavOpen(true)} aria-label="Open navigation"><PortalIcon name="menu" /></button>
              <div className="text-sm"><span className="hidden text-slate-400 sm:inline">Workspace</span><span className="mx-2 hidden text-slate-300 sm:inline">/</span><span className="font-semibold text-slate-800">{heading}</span></div>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/dashboard/requests#new-request" className="inline-flex items-center gap-1.5 rounded-lg bg-[#315fd4] px-3.5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 sm:text-sm"><PortalIcon name="plus" className="h-4 w-4" /><span className="hidden min-[380px]:inline">New request</span></Link>
              <Link href="/dashboard/settings" className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700" aria-label="Account settings">{initials}</Link>
            </div>
          </header>
          <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 pb-14 pt-7 sm:px-7 lg:px-9 lg:pt-9">{children}</main>
        </div>
      </div>
    </div>
  );
}
