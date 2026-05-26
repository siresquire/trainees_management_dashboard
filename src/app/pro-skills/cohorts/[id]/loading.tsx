export default function Loading() {
  return (
    <div className="max-w-4xl space-y-4 animate-pulse">
      <div className="h-4 w-32 bg-slate-200 rounded" />
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 border-b border-slate-100 px-4 py-2.5 flex gap-4">
          {[200, 160, 120, 60, 60].map((w, i) => (
            <div key={i} className="h-3 bg-slate-200 rounded" style={{ width: w }} />
          ))}
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="px-4 py-3 border-b border-slate-50 flex gap-4 items-center">
            <div className="h-3 bg-slate-200 rounded w-40" />
            <div className="h-3 bg-slate-200 rounded w-36" />
            <div className="h-3 bg-slate-200 rounded w-28" />
            <div className="h-3 bg-slate-200 rounded w-8" />
            <div className="h-3 bg-slate-200 rounded w-8" />
          </div>
        ))}
      </div>
    </div>
  );
}
