export default function Loading() {
  return (
    <div className="p-6 md:p-8 space-y-6 animate-pulse">
      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-200 p-5 space-y-2">
            <div className="h-3 w-24 bg-slate-100 rounded" />
            <div className="h-8 w-14 bg-slate-200 rounded" />
          </div>
        ))}
      </div>

      {/* Staff list */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <div className="h-4 w-32 bg-slate-200 rounded" />
        </div>
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="px-5 py-4 border-b border-slate-50 flex items-center justify-between">
            <div className="h-4 w-48 bg-slate-200 rounded" />
            <div className="h-5 w-16 bg-slate-100 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
