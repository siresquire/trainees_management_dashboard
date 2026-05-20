export default function ExamsLoading() {
  return (
    <div className="max-w-6xl space-y-6 animate-pulse">
      {/* Tab bar */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {["Quiz Scores", "Official Exams", "Analytics"].map((label) => (
          <div key={label} className="h-8 w-28 bg-slate-200 rounded-lg" />
        ))}
      </div>
      {/* Table card */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="h-4 w-28 bg-slate-200 rounded" />
          <div className="h-3.5 w-48 bg-slate-100 rounded" />
        </div>
        <div className="divide-y divide-slate-100">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="px-4 py-3 flex items-center gap-4">
              <div className="h-3.5 w-4 bg-slate-100 rounded" />
              <div className="h-4 w-36 bg-slate-200 rounded flex-shrink-0" />
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="h-4 w-20 bg-slate-100 rounded" />
              ))}
              <div className="h-5 w-16 bg-slate-100 rounded-full" />
              <div className="flex-1 max-w-[100px] h-2 bg-slate-100 rounded-full" />
              <div className="h-4 w-14 bg-slate-100 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
