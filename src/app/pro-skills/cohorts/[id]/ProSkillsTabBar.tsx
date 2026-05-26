"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = { label: string; href: string };

export default function ProSkillsTabBar({ tabs, base }: { tabs: Tab[]; base: string }) {
  const pathname = usePathname();
  return (
    <nav className="flex gap-0 -mb-px overflow-x-auto">
      {tabs.map((tab) => {
        const isActive =
          tab.href === base
            ? pathname === tab.href
            : pathname === tab.href || pathname.startsWith(tab.href + "/");
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              isActive
                ? "border-orange-500 text-orange-600"
                : "border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
