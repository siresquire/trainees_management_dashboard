export default function Loading() {
  return (
    <div className="p-6 md:p-8 space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-5 w-44 bg-slate-200 rounded" />
          <div className="h-3 w-64 bg-slate-100 rounded" />
        </div>
        <div className="h-9 w-36 bg-slate-200 rounded-lg" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
            <div className="h-4 w-40 bg-slate-200 rounded" />
            <div className="h-3 w-24 bg-slate-100 rounded" />
            <div className="h-3 w-32 bg-slate-100 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
