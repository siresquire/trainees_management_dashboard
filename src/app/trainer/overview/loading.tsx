export default function Loading() {
  return (
    <div className="p-6 md:p-8 space-y-8 animate-pulse">
      {/* Header */}
      <div className="space-y-2">
        <div className="h-5 w-52 bg-slate-200 rounded" />
        <div className="h-3 w-72 bg-slate-100 rounded" />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-200 p-5 space-y-2">
            <div className="h-3 w-16 bg-slate-100 rounded" />
            <div className="h-7 w-12 bg-slate-200 rounded" />
          </div>
        ))}
      </div>

      {/* Chart blocks */}
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3">
          <div className="h-4 w-56 bg-slate-200 rounded" />
          <div className="h-64 bg-slate-50 rounded-xl" />
        </div>
      ))}
    </div>
  );
}
