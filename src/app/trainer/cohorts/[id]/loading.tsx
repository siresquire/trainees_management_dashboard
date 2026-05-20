export default function CohortTraineesLoading() {
  return (
    <div className="animate-pulse">
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {/* Toolbar */}
        <div className="px-6 py-4 border-b border-slate-200 space-y-3">
          <div className="flex items-center justify-between">
            <div className="h-5 w-28 bg-slate-200 rounded" />
            <div className="h-8 w-20 bg-slate-100 rounded-lg" />
          </div>
          <div className="h-8 w-64 bg-slate-100 rounded-lg" />
          <div className="flex gap-1.5">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="h-6 w-12 bg-slate-100 rounded-full" />
            ))}
          </div>
        </div>
        {/* Table rows */}
        <div className="divide-y divide-slate-100">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="px-4 py-3 flex items-center gap-4">
              <div className="h-3.5 w-4 bg-slate-100 rounded" />
              <div className="h-4 w-36 bg-slate-200 rounded" />
              <div className="h-4 w-48 bg-slate-100 rounded" />
              <div className="h-5 w-14 bg-slate-100 rounded-full" />
              <div className="space-y-1.5 flex-1">
                <div className="h-2 w-full max-w-[140px] bg-slate-100 rounded-full" />
                <div className="h-2 w-full max-w-[120px] bg-slate-100 rounded-full" />
              </div>
              <div className="h-4 w-8 bg-slate-100 rounded" />
              <div className="h-4 w-16 bg-slate-100 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
