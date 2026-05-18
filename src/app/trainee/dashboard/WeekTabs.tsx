"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function WeekTabs({ weeks }: { weeks: number[] }) {
  const searchParams = useSearchParams();
  const current = Number(searchParams.get("week") ?? weeks[0] ?? 1);

  return (
    <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
      {weeks.map((w) => (
        <Link
          key={w}
          href={`?week=${w}`}
          scroll={false}
          className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            current === w
              ? "bg-blue-600 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          Week {w}
        </Link>
      ))}
    </div>
  );
}
