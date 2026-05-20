export default function TraineeExamsLoading() {
  return (
    <div className="p-6 md:p-8 space-y-6 animate-pulse">
      <div className="h-7 w-28 bg-slate-200 rounded-lg" />
      {/* Tab bar */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {[80, 100, 80].map((w, i) => (
          <div key={i} className="h-8 bg-slate-200 rounded-lg" style={{ width: w }} />
        ))}
      </div>
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2">
            <div className="h-3 w-16 bg-slate-100 rounded" />
            <div className="h-7 w-12 bg-slate-200 rounded" />
            <div className="h-2.5 w-20 bg-slate-100 rounded" />
          </div>
        ))}
      </div>
      {/* Score table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50">
          <div className="h-4 w-28 bg-slate-200 rounded" />
        </div>
        <div className="divide-y divide-slate-100">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="px-4 py-3 flex items-center gap-4">
              <div className="h-4 w-40 bg-slate-200 rounded" />
              <div className="h-4 w-16 bg-slate-100 rounded" />
              <div className="flex-1 h-2 bg-slate-100 rounded-full max-w-[120px]" />
              <div className="h-4 w-12 bg-slate-100 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
