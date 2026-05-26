export default function Loading() {
  return (
    <div className="p-4 md:p-8 animate-pulse">
      <div className="mb-6 md:mb-8 space-y-2">
        <div className="h-6 w-40 bg-slate-200 rounded" />
        <div className="h-4 w-72 bg-slate-200 rounded" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col gap-3"
          >
            <div className="flex items-start justify-between">
              <div className="h-5 w-20 bg-slate-200 rounded-full" />
              <div className="h-5 w-16 bg-slate-200 rounded-full" />
            </div>
            <div className="space-y-1.5">
              <div className="h-4 w-48 bg-slate-200 rounded" />
              <div className="h-3 w-32 bg-slate-200 rounded" />
              <div className="h-3 w-40 bg-slate-200 rounded" />
            </div>
            <div className="flex items-center gap-1.5 mt-auto">
              <div className="w-3.5 h-3.5 bg-slate-200 rounded" />
              <div className="h-3 w-24 bg-slate-200 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
