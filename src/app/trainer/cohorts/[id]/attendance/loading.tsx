export default function AttendanceLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="h-4 w-24 bg-slate-200 rounded" />
          <div className="h-8 w-32 bg-slate-100 rounded-lg" />
        </div>
        <div className="divide-y divide-slate-100">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="px-4 py-3 flex items-center gap-4">
              <div className="h-4 w-28 bg-slate-200 rounded flex-shrink-0" />
              <div className="h-4 w-32 bg-slate-100 rounded flex-shrink-0" />
              <div className="h-5 w-16 bg-slate-100 rounded-full flex-shrink-0" />
              <div className="flex gap-1.5 flex-wrap">
                {Array.from({ length: 5 }).map((_, j) => (
                  <div key={j} className="h-5 w-12 bg-slate-100 rounded-full" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
