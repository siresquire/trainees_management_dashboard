"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { signOut } from "@/actions/auth";
import Toaster from "@/components/Toaster";

export interface NavItem {
  href: string;
  label: string;
  icon: NavIconName;
  exact?: boolean;
}

export type NavIconName =
  | "grid" | "users" | "shield" | "home" | "book" | "quiz" | "chart" | "settings";

export type AppShellTheme = "light" | "dark";

interface Props {
  children: React.ReactNode;
  navItems: NavItem[];
  user: { name: string; role: string };
  theme?: AppShellTheme;
}

export default function AppShell({ children, navItems, user, theme = "light" }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close drawer whenever route changes
  useEffect(() => { setOpen(false); }, [pathname]);
  // Close drawer on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const isDark = theme === "dark";
  const sidebarBg = isDark ? "bg-slate-900" : "bg-white border-r border-slate-200";
  const textMuted = isDark ? "text-slate-400" : "text-slate-500";
  const textBase = isDark ? "text-slate-300" : "text-slate-600";
  const textBold = isDark ? "text-white" : "text-slate-900";
  const hoverBg = isDark ? "hover:bg-slate-800 hover:text-white" : "hover:bg-slate-50 hover:text-slate-900";
  const activeBg = isDark ? "bg-slate-800 text-white" : "bg-orange-50 text-orange-700";
  const divider = isDark ? "border-slate-700" : "border-slate-200";

  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");

  const currentPage = navItems.find(isActive)?.label ?? "Dashboard";

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {/* Sidebar — always fixed */}
      <aside
        className={[
          "fixed inset-y-0 left-0 z-50 w-64 flex flex-col transition-transform duration-200 ease-in-out",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          sidebarBg,
        ].join(" ")}
      >
        {/* Logo */}
        <div className={`h-16 flex items-center justify-between gap-3 px-5 border-b ${divider} flex-shrink-0`}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-sm">A</span>
            </div>
            <span className={`font-semibold text-sm ${textBold}`}>Amalitech</span>
          </div>
          {/* Close button (mobile only) */}
          <button
            className={`lg:hidden p-1 rounded ${textMuted} ${hoverBg}`}
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive(item) ? activeBg : `${textBase} ${hoverBg}`,
              ].join(" ")}
            >
              <NavIcon name={item.icon} active={isActive(item)} isDark={isDark} />
              {item.label}
            </Link>
          ))}
        </nav>

        {/* User + sign out */}
        <div className={`border-t ${divider} p-3 flex-shrink-0`}>
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-white font-semibold text-sm">
                {user.name?.[0]?.toUpperCase() ?? "?"}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-medium truncate ${textBold}`}>{user.name}</p>
              <p className={`text-xs capitalize ${textMuted}`}>{user.role.replace(/_/g, " ")}</p>
            </div>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              className={`w-full flex items-center gap-2 text-xs px-2 py-2 rounded-lg transition-colors ${textMuted} ${hoverBg}`}
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Content area — offset by sidebar on desktop */}
      <div className="lg:ml-64 flex flex-col min-h-screen">
        {/* Mobile header */}
        <header className="lg:hidden sticky top-0 z-30 h-14 bg-white border-b border-slate-200 flex items-center gap-3 px-4 flex-shrink-0">
          <button
            onClick={() => setOpen(true)}
            className="p-1.5 -ml-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
            aria-label="Open menu"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="w-6 h-6 bg-orange-500 rounded-md flex items-center justify-center">
            <span className="text-white font-bold text-xs">A</span>
          </div>
          <span className="text-sm font-semibold text-slate-900 truncate">{currentPage}</span>
        </header>

        <main className="flex-1">{children}</main>
      </div>

      <Toaster />
    </div>
  );
}

function NavIcon({ name, active, isDark }: { name: NavIconName; active: boolean; isDark: boolean }) {
  const cls = `w-4 h-4 flex-shrink-0 ${active ? (isDark ? "text-white" : "text-orange-600") : (isDark ? "text-slate-500" : "text-slate-400")}`;
  const s = { strokeLinecap: "round" as const, strokeLinejoin: "round" as const, strokeWidth: 1.75 };
  if (name === "grid") return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path {...s} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>;
  if (name === "users") return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path {...s} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
  if (name === "shield") return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path {...s} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>;
  if (name === "home") return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path {...s} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>;
  if (name === "book") return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path {...s} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>;
  if (name === "chart") return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path {...s} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>;
  if (name === "quiz")  return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path {...s} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>;
  if (name === "settings") return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path {...s} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path {...s} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
  return <span className="w-4 h-4" />;
}
